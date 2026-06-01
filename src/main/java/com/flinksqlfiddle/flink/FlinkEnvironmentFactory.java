package com.flinksqlfiddle.flink;

import org.apache.flink.configuration.Configuration;
import org.apache.flink.configuration.PipelineOptions;
import org.apache.flink.table.api.EnvironmentSettings;
import org.apache.flink.table.api.TableEnvironment;
import jakarta.enterprise.context.ApplicationScoped;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URL;
import java.util.List;

@ApplicationScoped
public class FlinkEnvironmentFactory {

    private static final Logger log = LoggerFactory.getLogger(FlinkEnvironmentFactory.class);

    private final FlinkProperties properties;

    public FlinkEnvironmentFactory(FlinkProperties properties) {
        this.properties = properties;
    }

    public TableEnvironment createBatchEnvironment() {
        log.info("Creating BATCH environment [parallelism={}, network={}, managed={}]",
                properties.parallelism(), properties.networkMemory(), properties.managedMemory());
        EnvironmentSettings settings = EnvironmentSettings.newInstance()
                .inBatchMode()
                .withConfiguration(createConfiguration())
                .build();
        return TableEnvironment.create(settings);
    }

    public TableEnvironment createStreamingEnvironment() {
        log.info("Creating STREAMING environment [parallelism={}, network={}, managed={}]",
                properties.parallelism(), properties.networkMemory(), properties.managedMemory());
        EnvironmentSettings settings = EnvironmentSettings.newInstance()
                .inStreamingMode()
                .withConfiguration(createConfiguration())
                .build();
        return TableEnvironment.create(settings);
    }

    private Configuration createConfiguration() {
        Configuration config = new Configuration();
        config.setString("parallelism.default", String.valueOf(properties.parallelism()));
        config.setString("taskmanager.memory.network.min", properties.networkMemory());
        config.setString("taskmanager.memory.network.max", properties.networkMemory());
        config.setString("taskmanager.memory.managed.size", properties.managedMemory());
        applyUserClasspath(config);
        return config;
    }

    /**
     * Points the embedded MiniCluster at the application's own code location.
     *
     * <p>When a job has no user jars/classpaths (always true for our embedded SQL),
     * Flink deserializes the job graph using {@link ClassLoader#getSystemClassLoader()}.
     * That works when everything is on the JVM system classpath (the packaged uber-jar),
     * but under Quarkus — {@code quarkusDev} and the default fast-jar layout — Flink lives
     * in the Quarkus classloader and is invisible to the system classloader, so job
     * submission fails with {@code ClassNotFoundException} on Flink operator factories.
     *
     * <p>Supplying a non-empty {@code pipeline.classpaths} makes Flink instead build a
     * user-code classloader whose parent is the classloader that loaded Flink (which can
     * resolve the operator factories), with the application's classes — including the
     * bundled faker connector — available from the supplied location.
     */
    private static void applyUserClasspath(Configuration config) {
        List<String> classpath = resolveAppClasspath();
        if (!classpath.isEmpty()) {
            config.set(PipelineOptions.CLASSPATHS, classpath);
            log.info("Pinned Flink user classpath to {}", classpath);
        } else {
            log.warn("Could not resolve application code location for Flink user classpath; "
                    + "embedded execution may fail under a non-flat classpath");
        }
    }

    /**
     * Best-effort location(s) of the application's own classes, as URL strings for
     * {@code pipeline.classpaths}. Prefers the code-source (the app jar or classes dir —
     * available in the packaged jar, fast-jar, and tests); in {@code quarkusDev} the code
     * source is null, so derive the classes-dir root from a non-CDI app class, which Quarkus
     * serves straight from disk as a {@code file:} URL.
     */
    private static List<String> resolveAppClasspath() {
        try {
            var codeSource = FlinkEnvironmentFactory.class.getProtectionDomain().getCodeSource();
            if (codeSource != null && codeSource.getLocation() != null) {
                return List.of(codeSource.getLocation().toString());
            }
        } catch (Exception ignored) {
            // fall through to the dev-mode derivation
        }
        String probe = "com/flinksqlfiddle/faker/FlinkFakerTableSource.class";
        URL res = FlinkEnvironmentFactory.class.getClassLoader().getResource(probe);
        if (res != null && "file".equals(res.getProtocol()) && res.toString().endsWith(probe)) {
            String root = res.toString().substring(0, res.toString().length() - probe.length());
            return List.of(root);
        }
        return List.of();
    }
}
