package com.flinksqlfiddle.health;

import com.flinksqlfiddle.flink.FlinkProperties;
import com.flinksqlfiddle.session.SessionManager;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.health.HealthCheck;
import org.eclipse.microprofile.health.HealthCheckResponse;
import org.eclipse.microprofile.health.HealthCheckResponseBuilder;
import org.eclipse.microprofile.health.Readiness;

/**
 * Readiness contributor for the embedded Flink session subsystem — the app's core runtime
 * dependency alongside the datasource (whose readiness check SmallRye adds automatically via
 * Agroal).
 *
 * <p>Reports UP with live utilization data ({@code activeSessions} / {@code maxSessions} /
 * {@code availableSessions}) so the BootUI Health panel shows real dependency health. Reaching
 * the session cap is normal back-pressure — a full playground still serves its UI and existing
 * sessions — so capacity alone does NOT flip the instance to DOWN (that would wrongly pull it
 * from load-balancing). It only reports DOWN if the session manager itself is unresponsive.
 */
@Readiness
@ApplicationScoped
public class FlinkSessionHealthCheck implements HealthCheck {

    private final SessionManager sessionManager;
    private final int maxSessions;

    @Inject
    public FlinkSessionHealthCheck(SessionManager sessionManager, FlinkProperties flinkProperties) {
        this.sessionManager = sessionManager;
        this.maxSessions = flinkProperties.maxSessions();
    }

    @Override
    public HealthCheckResponse call() {
        HealthCheckResponseBuilder response = HealthCheckResponse.named("flink-sessions");
        try {
            int active = sessionManager.getActiveSessionCount();
            return response.up()
                    .withData("activeSessions", active)
                    .withData("maxSessions", maxSessions)
                    .withData("availableSessions", Math.max(0, maxSessions - active))
                    .build();
        } catch (Exception e) {
            return response.down()
                    .withData("error", e.getClass().getSimpleName())
                    .build();
        }
    }
}
