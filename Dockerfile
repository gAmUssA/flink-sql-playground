FROM eclipse-temurin:25.0.2_10-jdk AS build
WORKDIR /app
COPY build.gradle.kts settings.gradle.kts ./
COPY gradle/ gradle/
COPY gradlew ./
RUN chmod +x gradlew && ./gradlew dependencies --no-daemon || true
COPY src/ src/
# Optional build metadata for the deployed-build footer. Pass with
# --build-arg GIT_COMMIT=$(git rev-parse HEAD) --build-arg GIT_BRANCH=$(git branch --show-current);
# defaults to "unknown" when unset (the build context has no .git).
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=unknown
RUN ./gradlew clean bootJar --no-daemon -PbuildCommit=$GIT_COMMIT -PbuildBranch=$GIT_BRANCH

FROM eclipse-temurin:25.0.2_10-jre
WORKDIR /app
COPY --from=build /app/build/libs/*.jar app.jar
# Extract the fat JAR so all classes are on a flat classpath.
# Flink's MiniCluster TaskManager classloaders use the system classloader,
# which cannot see classes nested inside a Spring Boot fat JAR.
RUN java -Djarmode=tools -jar app.jar extract --destination extracted && rm app.jar
EXPOSE 9090
ENTRYPOINT ["java", \
    "-Xms768m", \
    "-Xmx1536m", \
    "-XX:+UseZGC", \
    "-XX:+ZGenerational", \
    "-XX:MetaspaceSize=128m", \
    "-XX:MaxMetaspaceSize=384m", \
    "-jar", "extracted/app.jar"]
