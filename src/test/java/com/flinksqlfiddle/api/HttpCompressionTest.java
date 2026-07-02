package com.flinksqlfiddle.api;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.RestAssured;
import org.junit.jupiter.api.Test;

import static io.restassured.config.DecoderConfig.decoderConfig;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalToIgnoringCase;

/**
 * Verifies HTTP response compression is enabled: a text response requested with
 * {@code Accept-Encoding: gzip} comes back gzip-encoded. Decoders are disabled so the
 * {@code Content-Encoding} header is observable rather than transparently unwrapped.
 */
@QuarkusTest
class HttpCompressionTest {

    @Test
    void textResponseIsGzipCompressed() {
        given()
                .config(RestAssured.config().decoderConfig(decoderConfig().noContentDecoders()))
                .header("Accept-Encoding", "gzip")
                .when().get("/")
                .then()
                .statusCode(200)
                .header("Content-Encoding", equalToIgnoringCase("gzip"));
    }
}
