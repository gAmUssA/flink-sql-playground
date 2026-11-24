package com.flinksqlfiddle.ratelimit;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.response.Response;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;

/** The test tier's default capacity is 3 (application.properties). Each test uses its own client address. */
@QuarkusTest
class RateLimitTest {

    private static final String LIMITED = "/test-rate-limit/limited";

    private static Response get(String path, String forwardedFor) {
        return given().header("X-Forwarded-For", forwardedFor).get(path);
    }

    @Test
    void answers200UntilTheBucketIsEmptyThen429() {
        String ip = "198.51.100.1";
        for (int i = 0; i < 3; i++) {
            get(LIMITED, ip).then().statusCode(200);
        }
        get(LIMITED, ip).then().statusCode(429);
    }

    @Test
    void rejectionIsTheSharedJsonBodyWithRetryAfter() {
        String ip = "198.51.100.2";
        for (int i = 0; i < 3; i++) {
            get(LIMITED, ip);
        }
        Response r = get(LIMITED, ip);
        r.then().statusCode(429)
                .contentType(containsString("application/json"))
                .body("code", equalTo("RATE_LIMITED"))
                .body("error", not(nullValue()))
                .body("table", nullValue())
                .header("Retry-After", matchesPattern("\\d+"));
        long seconds = Long.parseLong(r.header("Retry-After"));
        org.hamcrest.MatcherAssert.assertThat(seconds, greaterThanOrEqualTo(1L));
    }

    @Test
    void forwardedClientsHaveSeparateBuckets() {
        String a = "198.51.100.3";
        String b = "198.51.100.4";
        for (int i = 0; i < 3; i++) {
            get(LIMITED, a).then().statusCode(200);
        }
        get(LIMITED, a).then().statusCode(429);
        get(LIMITED, b).then().statusCode(200);
    }

    @Test
    void theKeyIsTheFirstForwardedAddressNotTheProxy() {
        // Same forwarded client behind two different proxy hops shares one bucket.
        for (int i = 0; i < 3; i++) {
            get(LIMITED, "198.51.100.5, 10.0.0.1").then().statusCode(200);
        }
        get(LIMITED, "198.51.100.5, 10.9.9.9").then().statusCode(429);
    }

    @Test
    void forwardedHeaderBecomesTheRemoteAddress() {
        get("/test-rate-limit/remote-address", "203.0.113.7").then()
                .statusCode(200).body(equalTo("203.0.113.7"));
    }

    @Test
    void withoutTheHeaderTheDirectPeerIsUsed() {
        given().get("/test-rate-limit/remote-address").then()
                .statusCode(200).body(matchesPattern("127\\.0\\.0\\.1|0:0:0:0:0:0:0:1|::1"));
    }

    @Test
    void unannotatedRoutesAreNeverLimited() {
        String ip = "198.51.100.6";
        for (int i = 0; i < 20; i++) {
            get("/test-rate-limit/open", ip).then().statusCode(200);
        }
    }

    @Test
    void existingEndpointsAreNotLimited() {
        String ip = "198.51.100.7";
        for (int i = 0; i < 20; i++) {
            get("/api/build-info", ip).then().statusCode(200);
        }
    }
}
