FROM eclipse-temurin:25.0.4.1_1-jdk AS build
WORKDIR /app
COPY build.gradle.kts settings.gradle.kts gradle.properties ./
COPY gradle/ gradle/
COPY gradlew ./
RUN chmod +x gradlew && ./gradlew dependencies --no-daemon || true
COPY src/ src/
# Optional build metadata for the deployed-build footer. Pass with
# --build-arg GIT_COMMIT=$(git rev-parse HEAD) --build-arg GIT_BRANCH=$(git branch --show-current);
# defaults to "unknown" when unset (the build context has no .git).
# NOTE: Quarkus augmentation runs in the Gradle JVM and loads the compiled (Java 25)
# classes, so the build stage must run on a JDK >= 25 (this image is JDK 25).
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=unknown
# Quarkus derives the JDBC driver/dialect from quarkus.datasource.db-kind at BUILD
# time (both quarkus-jdbc-h2 and quarkus-jdbc-postgresql are on the classpath, so
# the kind is fixed during augmentation and CANNOT be switched by a runtime profile).
# The deploy profile must therefore be active at build: pass QUARKUS_PROFILE=supabase
# to bake the PostgreSQL driver. Defaults to prod (H2) for local `docker compose`.
# On Railway, the QUARKUS_PROFILE service variable is forwarded here as a build arg.
# The runtime profile must match the build profile (Railway sets both from the same var).
ARG QUARKUS_PROFILE=prod
RUN QUARKUS_PROFILE=$QUARKUS_PROFILE ./gradlew clean quarkusBuild --no-daemon \
    -Dquarkus.profile=$QUARKUS_PROFILE \
    -PbuildCommit=$GIT_COMMIT -PbuildBranch=$GIT_BRANCH

FROM eclipse-temurin:25.0.4.1_1-jre
WORKDIR /app
# Run as a non-root user. This process compiles and executes untrusted user SQL in an
# embedded Flink MiniCluster in-JVM, so dropping root limits the blast radius of any
# sandbox escape. UID 10001 is arbitrary and unprivileged.
RUN groupadd --gid 10001 appuser \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin appuser
# Quarkus fast-jar layout. Embedded Flink resolves its job-graph classes via the app's
# own classpath (configured as pipeline.classpaths in FlinkEnvironmentFactory), so the
# default container-optimized fast-jar works — no uber-jar/flattening needed.
# Copy lib/ first so the dependency layer caches across app-only rebuilds.
COPY --from=build --chown=appuser:appuser /app/build/quarkus-app/lib/ ./lib/
COPY --from=build --chown=appuser:appuser /app/build/quarkus-app/*.jar ./
COPY --from=build --chown=appuser:appuser /app/build/quarkus-app/app/ ./app/
COPY --from=build --chown=appuser:appuser /app/build/quarkus-app/quarkus/ ./quarkus/
# JDK AOT cache (JEP 483/514/515): run the app once here, in this exact JVM and file layout,
# through startup plus a BATCH and a STREAMING query, and store the classes it loaded and
# linked in app.aot. Cuts process start to first result about in half (docs/STARTUP.md).
# The training run needs the profile's config but no database: placeholder Supabase
# settings, with startup migration and schema validation off. Pass --build-arg AOT_CACHE=false
# to skip it; the JVM then starts without a cache. Keep the JVM flags in step with ENTRYPOINT.
ARG QUARKUS_PROFILE=prod
ARG AOT_CACHE=true
COPY scripts/aot-train.sh /tmp/aot-train.sh
RUN if [ "$AOT_CACHE" = "true" ]; then \
        QUARKUS_PROFILE=$QUARKUS_PROFILE \
        SUPABASE_DB_URL=jdbc:postgresql://127.0.0.1:1/aot-training SUPABASE_DB_USER=aot SUPABASE_DB_PASSWORD=aot \
        bash /tmp/aot-train.sh /app app.aot 9191 \
            -Xmx1536m -XX:+UseG1GC -XX:MetaspaceSize=128m -XX:MaxMetaspaceSize=384m \
            -Dquarkus.flyway.migrate-at-start=false \
            -Dquarkus.hibernate-orm.schema-management.strategy=none; \
    fi \
    && rm /tmp/aot-train.sh
USER appuser
EXPOSE 9090
# G1 (not ZGC) and no -Xms: ZGC backs the heap with a shared-memory file, so the whole
# committed heap is charged to the container as shmem, and -Xms768m pre-committed it at
# boot. On memory-billed serverless hosts that was ~800 MB paid before the first request.
ENTRYPOINT ["java", \
    "-Xmx1536m", \
    "-XX:+UseG1GC", \
    "-XX:MetaspaceSize=128m", \
    "-XX:MaxMetaspaceSize=384m", \
    "-XX:AOTCache=app.aot", \
    "-jar", "quarkus-run.jar"]
