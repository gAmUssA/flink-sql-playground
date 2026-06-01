import java.time.Instant
import org.gradle.api.tasks.bundling.Jar

plugins {
    java
    id("org.springframework.boot") version "4.0.6"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "com.flinksqlfiddle"
version = "0.1.0-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
    sourceCompatibility = JavaVersion.VERSION_25
    targetCompatibility = JavaVersion.VERSION_25
}

repositories {
    mavenCentral()
}

// --- Build info: capture the git commit + build time and ship them on the classpath
// as build-info.properties, so the running app can report exactly which commit is deployed.
val buildInfoDir = layout.buildDirectory.dir("generated-resources/build-info")

val generateBuildInfo by tasks.registering {
    description = "Writes git commit/branch/build-time into build-info.properties"
    group = "build"
    outputs.dir(buildInfoDir)
    outputs.upToDateWhen { false } // always reflect the current HEAD
    // Optional overrides for environments without a .git directory (e.g. Docker builds):
    // pass -PbuildCommit=<sha> -PbuildBranch=<name>. Falls back to `git` otherwise.
    val commitOverride = (findProperty("buildCommit") as String?)?.takeIf { it.isNotBlank() && it != "unknown" }
    val branchOverride = (findProperty("buildBranch") as String?)?.takeIf { it.isNotBlank() && it != "unknown" }
    val projectVersion = project.version.toString()
    doLast {
        fun git(vararg args: String): String = try {
            val process = ProcessBuilder(listOf("git") + args).redirectErrorStream(true).start()
            val text = process.inputStream.bufferedReader().readText().trim()
            if (process.waitFor() == 0 && text.isNotEmpty()) text else "unknown"
        } catch (e: Exception) {
            "unknown"
        }

        val commitFull = commitOverride ?: git("rev-parse", "HEAD")
        val commit = commitOverride?.take(7) ?: git("rev-parse", "--short", "HEAD")
        val branch = branchOverride ?: git("rev-parse", "--abbrev-ref", "HEAD")

        val file = buildInfoDir.get().file("build-info.properties").asFile
        file.parentFile.mkdirs()
        file.writeText(
            """
            build.commit=$commit
            build.commitFull=$commitFull
            build.branch=$branch
            build.version=$projectVersion
            build.time=${Instant.now()}
            """.trimIndent() + "\n"
        )
    }
}

// Spring Boot's bootJar is the artifact we ship. The plain library jar is unused and
// its presence makes build/libs ambiguous for the Docker `COPY *.jar` glob.
tasks.named<Jar>("jar") {
    enabled = false
}

sourceSets.named("main") {
    resources.srcDir(buildInfoDir)
}

tasks.named("processResources") {
    dependsOn(generateBuildInfo)
}

val flinkVersion = "2.2.1"

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
    implementation("com.github.ben-manes.caffeine:caffeine:3.2.4")

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

// Shared test logging helper — applied inline to each Test task so there
// is no withType<Test> ordering issue.
fun Test.configureTestLogging(streams: Boolean = false) {
    testLogging {
        events("passed", "skipped", "failed")
        showExceptions = true
        showCauses = true
        showStackTraces = true
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
        showStandardStreams = streams
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

// Default 'test' task runs fast unit/controller tests only (excludes smoke tests).
tasks.test {
    useJUnitPlatform {
        excludeTags("smoke")
    }
    maxParallelForks = (Runtime.getRuntime().availableProcessors() / 2).coerceAtLeast(1)
    configureTestLogging()
}

// Separate task for slow smoke tests (Flink MiniCluster). Run sequentially since each
// test spins up a full MiniCluster and needs significant memory.
tasks.register<Test>("smokeTest") {
    description = "Runs Flink MiniCluster smoke tests (slow)"
    group = "verification"
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    useJUnitPlatform {
        includeTags("smoke")
    }
    maxParallelForks = 1
    jvmArgs("-Xmx1g")
    configureTestLogging(streams = true)
}

// 'check' lifecycle includes both fast and smoke tests.
tasks.named("check") {
    dependsOn("smokeTest")
}
