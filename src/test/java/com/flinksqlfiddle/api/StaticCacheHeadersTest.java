package com.flinksqlfiddle.api;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

/**
 * The SPA's assets have unversioned names, so they must be revalidated rather than cached
 * as immutable; otherwise a visitor can pair a day-old page with newer scripts after a deploy.
 */
@QuarkusTest
class StaticCacheHeadersTest {

    @Test
    void pageAndAssetsAreRevalidatedOnEveryLoad() {
        for (String path : new String[] {"/", "/f/abc123", "/js/app.js", "/js/fiddle-link.js", "/css/style.css"}) {
            given()
                    .when().get(path)
                    .then().statusCode(200)
                    .header("Cache-Control", equalTo("no-cache"));
        }
    }

    @Test
    void unchangedAssetRevalidatesToNotModified() {
        String lastModified = given()
                .when().get("/js/app.js")
                .then().statusCode(200)
                .header("Last-Modified", notNullValue())
                .extract().header("Last-Modified");

        given()
                .header("If-Modified-Since", lastModified)
                .when().get("/js/app.js")
                .then().statusCode(304);
    }
}
