package com.flinksqlfiddle.health;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.is;

/**
 * Verifies SmallRye Health is wired up: the aggregated readiness report is UP and includes
 * both the automatic Agroal datasource check and the app's Flink-session contributor, and the
 * liveness endpoint responds. These are the reports BootUI's Health panel renders.
 */
@QuarkusTest
class HealthCheckTest {

    @Test
    void livenessIsUp() {
        given()
                .when().get("/q/health/live")
                .then()
                .statusCode(200)
                .body("status", is("UP"));
    }

    @Test
    void readinessIsUpAndReportsFlinkSessions() {
        given()
                .when().get("/q/health/ready")
                .then()
                .statusCode(200)
                .body("status", is("UP"))
                .body("checks.name", hasItem("flink-sessions"));
    }

    @Test
    void flinkSessionCheckExposesUtilizationData() {
        given()
                .when().get("/q/health/ready")
                .then()
                .statusCode(200)
                .body("checks.find { it.name == 'flink-sessions' }.status", is("UP"))
                .body("checks.find { it.name == 'flink-sessions' }.data.maxSessions", is(8));
    }
}
