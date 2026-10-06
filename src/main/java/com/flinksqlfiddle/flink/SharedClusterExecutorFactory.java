package com.flinksqlfiddle.flink;

import org.apache.flink.configuration.ConfigOption;
import org.apache.flink.configuration.ConfigOptions;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.configuration.DeploymentOptions;
import org.apache.flink.core.execution.PipelineExecutor;
import org.apache.flink.core.execution.PipelineExecutorFactory;

/**
 * Lets Flink pick {@link SharedClusterExecutor} for {@code execution.target=shared-minicluster}.
 * Registered through {@code META-INF/services/org.apache.flink.core.execution.PipelineExecutorFactory}.
 */
public class SharedClusterExecutorFactory implements PipelineExecutorFactory {

    public static final String NAME = "shared-minicluster";

    /** Identifies which {@link SharedMiniCluster} an environment submits to. */
    public static final ConfigOption<String> CLUSTER_ID = ConfigOptions
            .key("flinksqlfiddle.shared-cluster.id")
            .stringType()
            .noDefaultValue()
            .withDescription("Id of the in-process SharedMiniCluster that receives this environment's jobs.");

    @Override
    public String getName() {
        return NAME;
    }

    @Override
    public boolean isCompatibleWith(Configuration configuration) {
        return NAME.equalsIgnoreCase(configuration.get(DeploymentOptions.TARGET));
    }

    @Override
    public PipelineExecutor getExecutor(Configuration configuration) {
        String id = configuration.get(CLUSTER_ID);
        if (id == null) {
            throw new IllegalStateException(CLUSTER_ID.key() + " is not set; the environment was not configured for the shared cluster");
        }
        return new SharedClusterExecutor(SharedMiniCluster.lookup(id));
    }
}
