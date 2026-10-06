package com.flinksqlfiddle.flink;

import io.quarkus.runtime.ShutdownEvent;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.enterprise.inject.Disposes;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Singleton;

/**
 * Owns the {@link SharedMiniCluster}: starts it in the background as soon as the
 * application boots, so the first query finds it running, and closes it on shutdown.
 * HTTP readiness does not wait for it; a query that arrives first blocks until it is up.
 */
@ApplicationScoped
public class FlinkClusterLifecycle {

    @Produces
    @Singleton
    SharedMiniCluster sharedMiniCluster(FlinkProperties properties) {
        return new SharedMiniCluster(properties);
    }

    void closeSharedMiniCluster(@Disposes SharedMiniCluster cluster) throws Exception {
        cluster.close();
    }

    void onStart(@Observes StartupEvent event, FlinkProperties properties, SharedMiniCluster cluster) {
        if (properties.sharedCluster()) {
            cluster.startAsync();
        }
    }

    void onStop(@Observes ShutdownEvent event, SharedMiniCluster cluster) throws Exception {
        cluster.close();
    }
}
