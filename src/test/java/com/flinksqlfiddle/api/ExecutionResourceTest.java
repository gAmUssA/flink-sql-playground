package com.flinksqlfiddle.api;

import com.flinksqlfiddle.execution.ExecutionMode;
import com.flinksqlfiddle.execution.ExecutionTimeoutException;
import com.flinksqlfiddle.execution.QueryResult;
import com.flinksqlfiddle.execution.SqlExecutionService;
import com.flinksqlfiddle.security.ForbiddenSqlException;
import com.flinksqlfiddle.session.FlinkSession;
import com.flinksqlfiddle.session.SessionManager;
import com.flinksqlfiddle.session.SessionNotFoundException;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import java.util.List;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@QuarkusTest
class ExecutionResourceTest {

    @InjectMock
    SessionManager sessionManager;

    @InjectMock
    SqlExecutionService executionService;

    private static final String EXECUTE_URL = "/api/sessions/test-session/execute";

    @Test
    void executeReturnsResult() {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("test-session")).thenReturn(session);

        QueryResult result = new QueryResult(
                List.of("id", "name"),
                List.of("INT", "STRING"),
                List.of(List.of(1, "Alice")),
                List.of("+I"),
                42L,
                false
        );
        when(executionService.execute(eq(session), eq(ExecutionMode.BATCH), eq("SELECT 1")))
                .thenReturn(result);

        given().contentType("application/json")
                .body("{\"sql\": \"SELECT 1\", \"mode\": \"BATCH\"}")
                .when().post(EXECUTE_URL)
                .then().statusCode(200)
                .body("columns[0]", is("id"))
                .body("columns[1]", is("name"))
                .body("rowCount", is(1))
                .body("executionTimeMs", is(42))
                .body("truncated", is(false));
    }

    @Test
    void executeWithBlankSqlReturns400() {
        given().contentType("application/json")
                .body("{\"sql\": \"  \", \"mode\": \"BATCH\"}")
                .when().post(EXECUTE_URL)
                .then().statusCode(400);
    }

    @Test
    void executeWithNullModeReturns400() {
        given().contentType("application/json")
                .body("{\"sql\": \"SELECT 1\"}")
                .when().post(EXECUTE_URL)
                .then().statusCode(400);
    }

    @Test
    void executeWithInvalidModeReturns400() {
        given().contentType("application/json")
                .body("{\"sql\": \"SELECT 1\", \"mode\": \"INVALID\"}")
                .when().post(EXECUTE_URL)
                .then().statusCode(400);
    }

    @Test
    void executeSessionNotFoundReturns404() {
        when(sessionManager.getSession("test-session"))
                .thenThrow(new SessionNotFoundException("test-session"));

        given().contentType("application/json")
                .body("{\"sql\": \"SELECT 1\", \"mode\": \"BATCH\"}")
                .when().post(EXECUTE_URL)
                .then().statusCode(404)
                .body("code", is("SESSION_NOT_FOUND"));
    }

    @Test
    void executeSecurityViolationReturns403() {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("test-session")).thenReturn(session);
        when(executionService.execute(any(FlinkSession.class), any(ExecutionMode.class), any(String.class)))
                .thenThrow(new ForbiddenSqlException("Blocked SQL"));

        given().contentType("application/json")
                .body("{\"sql\": \"DROP DATABASE\", \"mode\": \"BATCH\"}")
                .when().post(EXECUTE_URL)
                .then().statusCode(403)
                .body("code", is("SECURITY_VIOLATION"));
    }

    @Test
    void executeTimeoutReturns408() {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("test-session")).thenReturn(session);
        when(executionService.execute(any(FlinkSession.class), any(ExecutionMode.class), any(String.class)))
                .thenThrow(new ExecutionTimeoutException(30));

        given().contentType("application/json")
                .body("{\"sql\": \"SELECT 1\", \"mode\": \"BATCH\"}")
                .when().post(EXECUTE_URL)
                .then().statusCode(408)
                .body("code", is("EXECUTION_TIMEOUT"));
    }

    @Test
    void executeUnexpectedErrorReturns500() {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("test-session")).thenReturn(session);
        when(executionService.execute(any(FlinkSession.class), any(ExecutionMode.class), any(String.class)))
                .thenThrow(new RuntimeException("Something broke"));

        given().contentType("application/json")
                .body("{\"sql\": \"SELECT 1\", \"mode\": \"BATCH\"}")
                .when().post(EXECUTE_URL)
                .then().statusCode(500)
                .body("code", is("INTERNAL_ERROR"));
    }
}
