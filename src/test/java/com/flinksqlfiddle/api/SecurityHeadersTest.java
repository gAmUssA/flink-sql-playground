package com.flinksqlfiddle.api;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;

/**
 * Verifies the defense-in-depth security response headers configured in
 * {@code application.properties} are actually emitted. These headers were flagged as
 * missing by the BootUI Security / Pentesting rule packs (QS-HDR-003/005/006/007/008,
 * PT-A05-002/003/004/010/012/013) and hardened here for the public, no-auth playground.
 */
@QuarkusTest
class SecurityHeadersTest {

    @Test
    void securityHeadersArePresentOnApiResponses() {
        given()
                .when().get("/api/build-info")
                .then().statusCode(200)
                .header("X-Content-Type-Options", equalTo("nosniff"))
                .header("X-Frame-Options", equalTo("DENY"))
                .header("Referrer-Policy", equalTo("strict-origin-when-cross-origin"))
                .header("Strict-Transport-Security", containsString("max-age="))
                .header("Permissions-Policy", containsString("geolocation="))
                .header("Content-Security-Policy", containsString("default-src 'self'"));
    }

    @Test
    void contentSecurityPolicyAllowsTheSpaAssetOrigins() {
        // The CSP must permit exactly what index.html loads: Monaco from jsDelivr and
        // Google Fonts. A regression that drops one of these breaks the editor.
        given()
                .when().get("/api/build-info")
                .then().statusCode(200)
                .header("Content-Security-Policy", containsString("https://cdn.jsdelivr.net"))
                .header("Content-Security-Policy", containsString("https://fonts.gstatic.com"))
                .header("Content-Security-Policy", containsString("frame-ancestors 'none'"));
    }
}
