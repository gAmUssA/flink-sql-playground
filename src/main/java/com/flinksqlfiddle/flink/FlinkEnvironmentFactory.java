package com.flinksqlfiddle.flink;

import org.apache.flink.configuration.Configuration;
import org.apache.flink.table.api.EnvironmentSettings;
import org.apache.flink.table.api.TableEnvironment;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
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
        return config;
    }
}
