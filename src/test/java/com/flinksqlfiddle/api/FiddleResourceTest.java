package com.flinksqlfiddle.api;

import com.flinksqlfiddle.fiddle.Fiddle;
import com.flinksqlfiddle.fiddle.FiddleService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@QuarkusTest
class FiddleResourceTest {

    @InjectMock
    FiddleService fiddleService;

    @Test
    void saveFiddleReturns201() {
        Fiddle fiddle = new Fiddle("abcd1234", "CREATE TABLE t(id INT)", "SELECT * FROM t", "BATCH");
        when(fiddleService.save("CREATE TABLE t(id INT)", "SELECT * FROM t", "BATCH"))
                .thenReturn(fiddle);

        given().contentType("application/json")
                .body("{\"schema\": \"CREATE TABLE t(id INT)\", \"query\": \"SELECT * FROM t\", \"mode\": \"BATCH\"}")
                .when().post("/api/fiddles")
                .then().statusCode(201)
                .body("shortCode", is("abcd1234"))
                .body("schema", is("CREATE TABLE t(id INT)"))
                .body("query", is("SELECT * FROM t"))
                .body("mode", is("BATCH"));
    }

    @Test
    void saveFiddleWithBlankSchemaReturns400() {
        given().contentType("application/json")
                .body("{\"schema\": \"  \", \"query\": \"SELECT 1\", \"mode\": \"BATCH\"}")
                .when().post("/api/fiddles")
                .then().statusCode(400);
    }

    @Test
    void saveFiddleWithBlankQueryReturns400() {
        given().contentType("application/json")
                .body("{\"schema\": \"CREATE TABLE t(id INT)\", \"query\": \" \", \"mode\": \"BATCH\"}")
                .when().post("/api/fiddles")
                .then().statusCode(400);
    }

    @Test
    void saveFiddleWithNullModeReturns400() {
        given().contentType("application/json")
                .body("{\"schema\": \"CREATE TABLE t(id INT)\", \"query\": \"SELECT 1\"}")
                .when().post("/api/fiddles")
                .then().statusCode(400);
    }

    @Test
    void loadFiddleReturnsResponse() {
        Fiddle fiddle = new Fiddle("abcd1234", "CREATE TABLE t(id INT)", "SELECT * FROM t", "STREAMING");
        when(fiddleService.load("abcd1234")).thenReturn(Optional.of(fiddle));

        given().when().get("/api/fiddles/abcd1234")
                .then().statusCode(200)
                .body("shortCode", is("abcd1234"))
                .body("mode", is("STREAMING"));
    }

    @Test
    void loadFiddleNotFoundReturns404() {
        when(fiddleService.load(anyString())).thenReturn(Optional.empty());

        given().when().get("/api/fiddles/nonexistent")
                .then().statusCode(404)
                .body("code", is("FIDDLE_NOT_FOUND"));
    }
}
