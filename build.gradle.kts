import java.time.Instant

plugins {
    java
    id("io.quarkus")
}

group = "com.flinksqlfiddle"
version = "0.1.0-SNAPSHOT"

val quarkusPlatformGroupId: String by project
val quarkusPlatformArtifactId: String by project
val quarkusPlatformVersion: String by project

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

sourceSets.named("main") {
    resources.srcDir(buildInfoDir)
}

// --- SQL editor bundle: esbuild bundles src/main/frontend into js/editor.bundle.js (gitignored).
// Needs Node 22+ and `npm ci --omit=dev` first. The Docker build bundles it in a Node stage
// and skips this task with -x bundleEditor.
val editorBundle = "src/main/resources/META-INF/resources/js/editor.bundle.js"
val bundleEditor by tasks.registering(Exec::class) {
    description = "Bundles the CodeMirror SQL editor into $editorBundle"
    group = "build"
    inputs.dir("src/main/frontend")
    inputs.files("package-lock.json", "scripts/build-editor.js")
    outputs.file(editorBundle)
    commandLine("node", "scripts/build-editor.js", editorBundle)
}

tasks.named("processResources") {
    dependsOn(generateBuildInfo, bundleEditor)
}

val flinkVersion = "2.2.1"

dependencies {
    implementation(enforcedPlatform("$quarkusPlatformGroupId:$quarkusPlatformArtifactId:$quarkusPlatformVersion"))

    // Quarkus core + REST (JAX-RS) with Jackson JSON
    implementation("io.quarkus:quarkus-rest")
    implementation("io.quarkus:quarkus-rest-jackson")

    // Health: MicroProfile Health via SmallRye. Aggregates liveness/readiness/startup checks
    // (incl. the automatic Agroal datasource readiness check) at /q/health*; BootUI's Health
    // panel reads the same report in-process.
    implementation("io.quarkus:quarkus-smallrye-health")

    // Validation (jakarta.validation)
    implementation("io.quarkus:quarkus-hibernate-validator")

    // Persistence: Hibernate ORM + Panache, H2 (default) and PostgreSQL (supabase profile)
    implementation("io.quarkus:quarkus-hibernate-orm-panache")
    implementation("io.quarkus:quarkus-jdbc-h2")
    implementation("io.quarkus:quarkus-jdbc-postgresql")
    implementation("io.quarkus:quarkus-flyway")

    // Caffeine cache (used directly by SessionManager, not via any cache abstraction)
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

    // BootUI dev console (github.com/jdubois/boot-ui). Wires itself up only in Quarkus
    // dev/test launch modes and stays dark in production — safe on the classpath. The
    // matching bootui-quarkus-deployment is pulled in automatically. Served at /bootui.
    implementation("com.julien-dubois.bootui:bootui-quarkus:1.8.0")

    // Test
    testImplementation("io.quarkus:quarkus-junit5")
    testImplementation("io.quarkus:quarkus-junit5-mockito")
    testImplementation("io.rest-assured:rest-assured")
}

tasks.compileJava {
    options.encoding = "UTF-8"
    options.compilerArgs.add("-parameters")
}

// Shared test logging helper — applied inline to each Test task.
fun Test.configureTestLogging(streams: Boolean = false) {
    // Quarkus tests require the JBoss LogManager to be installed before any logging happens.
    systemProperty("java.util.logging.manager", "org.jboss.logmanager.LogManager")
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

// Frontend unit tests: Node's built-in test runner, no npm dependencies. Needs Node 22+.
val jsTest by tasks.registering(Exec::class) {
    description = "Runs the frontend unit tests in src/test/js with node --test"
    group = "verification"
    inputs.dir("src/test/js")
    inputs.files(fileTree("src/main/resources/META-INF/resources/js") { exclude("editor.bundle.js") })
    outputs.upToDateWhen { false }
    // Explicit file list: node --test on Node 22 does not accept a directory argument.
    val testFiles = fileTree("src/test/js") { include("**/*.test.js") }.files.map { it.path }.sorted()
    commandLine(listOf("node", "--test") + testFiles)
    // The static-site build test copies the real resources, editor bundle included.
    dependsOn(bundleEditor)
}

// 'check' lifecycle includes fast, smoke and frontend tests.
tasks.named("check") {
    dependsOn("smokeTest", jsTest)
}
