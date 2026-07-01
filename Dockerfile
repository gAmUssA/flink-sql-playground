FROM eclipse-temurin:25.0.2_10-jdk AS build
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

FROM eclipse-temurin:25.0.2_10-jre
WORKDIR /app
# Quarkus fast-jar layout. Embedded Flink resolves its job-graph classes via the app's
# own classpath (configured as pipeline.classpaths in FlinkEnvironmentFactory), so the
# default container-optimized fast-jar works — no uber-jar/flattening needed.
# Copy lib/ first so the dependency layer caches across app-only rebuilds.
COPY --from=build /app/build/quarkus-app/lib/ ./lib/
COPY --from=build /app/build/quarkus-app/*.jar ./
COPY --from=build /app/build/quarkus-app/app/ ./app/
COPY --from=build /app/build/quarkus-app/quarkus/ ./quarkus/
EXPOSE 9090
ENTRYPOINT ["java", \
    "-Xms768m", \
    "-Xmx1536m", \
    "-XX:+UseZGC", \
    "-XX:MetaspaceSize=128m", \
    "-XX:MaxMetaspaceSize=384m", \
    "-jar", "quarkus-run.jar"]
