package com.flinksqlfiddle.flink;

import org.apache.flink.api.dag.Pipeline;
import org.apache.flink.client.ClientUtils;
import org.apache.flink.client.deployment.executors.PipelineExecutorUtils;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.core.execution.JobClient;
import org.apache.flink.core.execution.PipelineExecutor;
import org.apache.flink.runtime.minicluster.MiniCluster;
import org.apache.flink.runtime.minicluster.MiniClusterJobClient;
import org.apache.flink.streaming.api.graph.StreamGraph;
import org.apache.flink.util.function.FunctionUtils;

import java.util.concurrent.CompletableFuture;

/**
 * Submits a job straight to the in-process {@link SharedMiniCluster}, the way Flink's
 * LocalExecutor does for a per-job cluster, but without starting a new cluster or going
 * through the REST endpoint.
 *
 * <p>Going through REST broke failure reporting under Quarkus: Flink decodes a failed job's
 * {@code SerializedThrowable} with the system class loader, which in the fast-jar layout
 * cannot see Flink's classes, so the client retried until it timed out (about 10 s) and the
 * real error was lost. In-process, the {@link MiniClusterJobClient} hands back the job's
 * failure with the user-code class loader.
 */
public class SharedClusterExecutor implements PipelineExecutor {

    private final SharedMiniCluster cluster;

    public SharedClusterExecutor(SharedMiniCluster cluster) {
        this.cluster = cluster;
    }

    @Override
    public CompletableFuture<JobClient> execute(Pipeline pipeline, Configuration configuration,
                                                ClassLoader userCodeClassloader) throws Exception {
        StreamGraph streamGraph = PipelineExecutorUtils.getStreamGraph(pipeline, configuration);
        streamGraph.serializeUserDefinedInstances();
        MiniCluster miniCluster = cluster.awaitMiniCluster();
        return miniCluster.submitJob(streamGraph)
                .thenApplyAsync(FunctionUtils.uncheckedFunction(submission -> {
                    ClientUtils.waitUntilJobInitializationFinished(
                            () -> miniCluster.getJobStatus(submission.getJobID()).get(),
                            () -> miniCluster.requestJobResult(submission.getJobID()).get(),
                            userCodeClassloader);
                    return submission;
                }))
                .thenApply(submission -> new MiniClusterJobClient(submission.getJobID(), miniCluster,
                        userCodeClassloader, MiniClusterJobClient.JobFinalizationBehavior.NOTHING));
    }
}
