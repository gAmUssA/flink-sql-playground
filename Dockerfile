FROM eclipse-temurin:21.0.10_7-jdk AS build
WORKDIR /app
COPY build.gradle.kts settings.gradle.kts ./
COPY gradle/ gradle/
COPY gradlew ./
RUN chmod +x gradlew && ./gradlew dependencies --no-daemon || true
COPY src/ src/
RUN ./gradlew clean build -x test --no-daemon

FROM eclipse-temurin:21.0.10_7-jre
WORKDIR /app
COPY --from=build /app/build/libs/*.jar app.jar
EXPOSE 9090
ENTRYPOINT ["java", \
    "-Xms512m", \
    "-Xmx1024m", \
    "-XX:+UseSerialGC", \
    "-XX:MetaspaceSize=128m", \
    "-XX:MaxMetaspaceSize=384m", \
    "-jar", "app.jar"]
