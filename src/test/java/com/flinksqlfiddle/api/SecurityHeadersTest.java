package com.flinksqlfiddle.api;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
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
        // The CSP must permit exactly what index.html loads: same-origin scripts (the bundled
        // editor) and Google Fonts. No third-party script origin is allowed.
        given()
                .when().get("/api/build-info")
                .then().statusCode(200)
                .header("Content-Security-Policy", containsString("script-src 'self';"))
                .header("Content-Security-Policy", not(containsString("cdn.jsdelivr.net")))
                .header("Content-Security-Policy", containsString("https://fonts.gstatic.com"))
                .header("Content-Security-Policy", containsString("frame-ancestors 'none'"));
    }

    // --- Framing (ADR 0008): the embed page may be framed, nothing else may. ---

    @Test
    void embedPageMayBeFramedByOtherSites() {
        given()
                .when().get("/embed.html")
                .then().statusCode(200)
                .header("X-Frame-Options", nullValue())
                .header("Content-Security-Policy", containsString("frame-ancestors *"))
                .header("Content-Security-Policy", not(containsString("frame-ancestors 'none'")))
                // Framing is the only thing relaxed: the rest of the policy and the other headers stay.
                .header("Content-Security-Policy", containsString("default-src 'self'"))
                .header("Content-Security-Policy", containsString("script-src 'self';"))
                .header("Content-Security-Policy", containsString("object-src 'none'"))
                .header("X-Content-Type-Options", equalTo("nosniff"))
                .header("Referrer-Policy", equalTo("strict-origin-when-cross-origin"));
    }

    @Test
    void embedPageKeepsFramingHeadersWhenRevalidated() {
        String lastModified = given().when().get("/embed.html").then().statusCode(200).extract().header("Last-Modified");
        given()
                .header("If-Modified-Since", lastModified)
                .when().get("/embed.html")
                .then().statusCode(304)
                .header("X-Frame-Options", nullValue());
    }

    @Test
    void everyOtherPageAndTheApiStayUnframeable() {
        // The app shell, its deep links, its assets and the API. The embed's own assets are shared
        // with the app, so they stay strict too: only the document is framed.
        for (String path : new String[] {"/", "/index.html", "/f/abc123", "/js/app.js", "/js/embed-params.js",
                "/css/embed.css", "/api/build-info"}) {
            given()
                    .when().get(path)
                    .then().statusCode(200)
                    .header("X-Frame-Options", equalTo("DENY"))
                    .header("Content-Security-Policy", containsString("frame-ancestors 'none'"))
                    .header("Content-Security-Policy", not(containsString("frame-ancestors *")));
        }
    }

    @Test
    void lookalikePathsOfTheEmbedPageAreNotFramed() {
        // Only the exact path is relaxed. A path that merely resembles it, or reaches it another
        // way, gets the strict headers whatever status it answers with.
        for (String path : new String[] {"/embed.html/", "/embed.html/x", "/embed.htm", "/embed", "/EMBED.html",
                "/f/embed.html", "/embed.html.map", "/js/../embed.html%00", "//embed.html"}) {
            given()
                    .redirects().follow(false)
                    .when().get(path)
                    .then()
                    .header("X-Frame-Options", equalTo("DENY"))
                    .header("Content-Security-Policy", containsString("frame-ancestors 'none'"));
        }
    }

    @Test
    void embedPageCannotBeReachedThroughTheApiWithFramingHeaders() {
        given()
                .when().post("/api/sessions/does-not-exist/execute")
                .then()
                .header("X-Frame-Options", equalTo("DENY"));
    }
}
