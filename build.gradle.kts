plugins {
    java
    id("org.springframework.boot") version "4.0.3"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "com.flinksqlfiddle"
version = "0.1.0-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}

repositories {
    mavenCentral()
}

val flinkVersion = "2.2.0"

dependencies {
    // Spring Boot
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    runtimeOnly("com.h2database:h2")
    runtimeOnly("org.postgresql:postgresql")
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    implementation("org.flywaydb:flyway-database-postgresql")

    // Caffeine cache
    implementation("com.github.ben-manes.caffeine:caffeine:3.2.0")

    // Apache Flink
    implementation("org.apache.flink:flink-streaming-java:$flinkVersion")
    implementation("org.apache.flink:flink-clients:$flinkVersion")
    implementation("org.apache.flink:flink-table-api-java:$flinkVersion")
    implementation("org.apache.flink:flink-table-api-java-bridge:$flinkVersion")
    implementation("org.apache.flink:flink-table-planner-loader:$flinkVersion")
    implementation("org.apache.flink:flink-table-runtime:$flinkVersion")
    implementation("org.apache.flink:flink-connector-datagen:$flinkVersion")

    // DataFaker (used by ported flink-faker connector)
    implementation("net.datafaker:datafaker:2.5.4")

    // Test
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
}

// Default 'test' task runs fast unit/controller tests only (excludes smoke tests).
tasks.test {
    useJUnitPlatform {
        excludeTags("smoke")
    }
    // Controller tests are independent — run test classes in parallel.
    maxParallelForks = (Runtime.getRuntime().availableProcessors() / 2).coerceAtLeast(1)
}

// Separate task for slow smoke tests (Flink MiniCluster). Run sequentially since each
// test spins up a full MiniCluster and needs significant memory.
tasks.register<Test>("smokeTest") {
    description = "Runs Flink MiniCluster smoke tests (slow)"
    group = "verification"
    useJUnitPlatform {
        includeTags("smoke")
    }
    maxParallelForks = 1
    // Give Flink MiniCluster room to breathe
    jvmArgs("-Xmx1g")
}

// 'check' lifecycle includes both fast and smoke tests.
tasks.named("check") {
    dependsOn("smokeTest")
}

tasks.withType<Test> {
    useJUnitPlatform()

    testLogging {
        events("passed", "skipped", "failed")
        showExceptions = true
        showCauses = true
        showStackTraces = true
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
        showStandardStreams = false
        afterSuite(KotlinClosure2<TestDescriptor, TestResult, Unit>({ desc, result ->
            if (desc.parent == null) {
                println("\nTest Results: ${result.resultType} " +
                        "(${result.testCount} tests, " +
                        "${result.successfulTestCount} passed, " +
                        "${result.failedTestCount} failed, " +
                        "${result.skippedTestCount} skipped)")
            }
        }))
    }
}
