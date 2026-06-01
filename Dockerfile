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
RUN ./gradlew clean quarkusBuild --no-daemon -PbuildCommit=$GIT_COMMIT -PbuildBranch=$GIT_BRANCH

FROM eclipse-temurin:25.0.2_10-jre
WORKDIR /app
# Quarkus uber-jar: a single flat jar on the system classpath. Flink's embedded
# MiniCluster deserializes the job graph with the system classloader, which must be
# able to see all Flink classes — the uber-jar guarantees that (no extraction needed).
COPY --from=build /app/build/*-runner.jar app.jar
EXPOSE 9090
ENTRYPOINT ["java", \
    "-Xms768m", \
    "-Xmx1536m", \
    "-XX:+UseZGC", \
    "-XX:+ZGenerational", \
    "-XX:MetaspaceSize=128m", \
    "-XX:MaxMetaspaceSize=384m", \
    "-jar", "app.jar"]
