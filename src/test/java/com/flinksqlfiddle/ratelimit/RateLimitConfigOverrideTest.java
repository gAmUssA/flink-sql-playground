package com.flinksqlfiddle.ratelimit;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static io.restassured.RestAssured.given;

/** The limit is a config property: the same names an env var (APP_RATE_LIMIT_TEST_CAPACITY) sets. */
@QuarkusTest
@TestProfile(RateLimitConfigOverrideTest.OneRequest.class)
class RateLimitConfigOverrideTest {

    public static class OneRequest implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of("app.rate-limit.test-capacity", "1");
        }
    }

    @Test
    void capacityComesFromConfig() {
        String ip = "198.51.100.50";
        given().header("X-Forwarded-For", ip).get("/test-rate-limit/limited").then().statusCode(200);
        given().header("X-Forwarded-For", ip).get("/test-rate-limit/limited").then().statusCode(429);
    }
}
