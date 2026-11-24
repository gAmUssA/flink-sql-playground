package com.flinksqlfiddle.api;

import com.flinksqlfiddle.execution.ExecutionMode;
import com.flinksqlfiddle.execution.ExecutionTimeoutException;
import com.flinksqlfiddle.execution.QueryResult;
import com.flinksqlfiddle.execution.NotExplainableException;
import com.flinksqlfiddle.execution.ObjectNotFoundException;
import com.flinksqlfiddle.execution.SqlExecutionService;
import com.flinksqlfiddle.execution.TableNotFoundException;
import com.flinksqlfiddle.execution.plan.ExplainResult;
import com.flinksqlfiddle.execution.plan.PlanAdvice;
import com.flinksqlfiddle.execution.plan.PlanNode;
import com.flinksqlfiddle.security.ForbiddenSqlException;
import com.flinksqlfiddle.session.FlinkSession;
import com.flinksqlfiddle.session.SessionManager;
import com.flinksqlfiddle.session.SessionNotFoundException;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import java.util.List;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
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

    @Test
    void explainReturnsThePlan() {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("test-session")).thenReturn(session);
        ExplainResult plan = new ExplainResult(ExecutionMode.STREAMING,
                List.of(new PlanNode(0, "Sink", "Sink: collect", java.util.Map.of(), List.of(), null, List.of(), List.of(1)),
                        new PlanNode(1, "GroupAggregate", "GroupAggregate", java.util.Map.of("groupBy", "k"),
                                List.of("I", "UB", "UA"), "unbounded", List.of(1), List.of())),
                List.of(0), List.of(new PlanAdvice(1, "ADVICE", "enable mini-batch")), "Sink(...)");
        when(executionService.explain(eq(session), eq(ExecutionMode.STREAMING), eq("SELECT k, COUNT(*) FROM t GROUP BY k")))
                .thenReturn(plan);

        given().contentType("application/json")
                .body("{\"sql\": \"SELECT k, COUNT(*) FROM t GROUP BY k\", \"mode\": \"STREAMING\"}")
                .when().post("/api/sessions/test-session/explain")
                .then().statusCode(200)
                .body("mode", is("STREAMING"))
                .body("roots[0]", is(0))
                .body("nodes[1].label", is("GroupAggregate"))
                .body("nodes[1].changelogMode[1]", is("UB"))
                .body("nodes[1].state", is("unbounded"))
                .body("nodes[1].attrs.groupBy", is("k"))
                .body("nodes[0].inputs[0]", is(1))
                .body("advice[0].text", is("enable mini-batch"));
    }

    @Test
    void explainOfDdlIsABadRequest() {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("test-session")).thenReturn(session);
        when(executionService.explain(eq(session), any(), any()))
                .thenThrow(new NotExplainableException("Only queries, INSERT statements and statement sets have a job graph"));

        given().contentType("application/json")
                .body("{\"sql\": \"CREATE TABLE t (a INT)\", \"mode\": \"STREAMING\"}")
                .when().post("/api/sessions/test-session/explain")
                .then().statusCode(400)
                .body("code", is("NOT_EXPLAINABLE"));
    }

    @Test
    void explainOfInvalidSqlIsABadRequest() {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("test-session")).thenReturn(session);
        when(executionService.explain(eq(session), any(), any()))
                .thenThrow(new NotExplainableException("Column 'nope' not found in any table", "INVALID_SQL"));

        given().contentType("application/json")
                .body("{\"sql\": \"SELECT nope FROM t\", \"mode\": \"STREAMING\"}")
                .when().post("/api/sessions/test-session/explain")
                .then().statusCode(400)
                .body("code", is("INVALID_SQL"))
                .body("error", is("Column 'nope' not found in any table"))
                .body("$", not(hasKey("table")));
    }

    private static final String NOT_FOUND =
            "SQL validation failed. From line 1, column 15 to line 1, column 20: Object 'orders' not found";

    @Test
    void explainOfUnknownTableNamesTheTable() {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("test-session")).thenReturn(session);
        when(executionService.explain(eq(session), any(), any()))
                .thenThrow(new TableNotFoundException("orders", null, NOT_FOUND, null));

        given().contentType("application/json")
                .body("{\"sql\": \"SELECT * FROM orders\", \"mode\": \"STREAMING\"}")
                .when().post("/api/sessions/test-session/explain")
                .then().statusCode(400)
                .body("code", is("TABLE_NOT_FOUND"))
                .body("table", is("orders"))
                .body("path", is(java.util.List.of("orders")))
                .body("error", is(NOT_FOUND))
                .body("$", not(hasKey("suggestion")));
    }

    @Test
    void executeOfUnknownTableNamesTheTableAndSuggestion() {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("test-session")).thenReturn(session);
        String message = "SQL validation failed. From line 1, column 15 to line 1, column 19: "
                + "Object 'Users' not found within 'default_catalog.default_database'; did you mean 'users'?";
        when(executionService.execute(any(FlinkSession.class), any(ExecutionMode.class), any(String.class)))
                .thenThrow(new TableNotFoundException("Users", "users", message, null));

        given().contentType("application/json")
                .body("{\"sql\": \"SELECT * FROM Users\", \"mode\": \"BATCH\"}")
                .when().post(EXECUTE_URL)
                .then().statusCode(400)
                .body("code", is("TABLE_NOT_FOUND"))
                .body("table", is("Users"))
                .body("suggestion", is("users"))
                .body("error", is(message));
    }

    private static final String DROP_MISSING =
            "Table with identifier 'default_catalog.default_database.nope' does not exist.";

    @Test
    void executeOfDropOfAMissingObjectIsABadRequestWithItsOwnCode() {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("test-session")).thenReturn(session);
        when(executionService.execute(any(FlinkSession.class), any(ExecutionMode.class), any(String.class)))
                .thenThrow(new ObjectNotFoundException(DROP_MISSING, null));

        given().contentType("application/json")
                .body("{\"sql\": \"DROP TABLE nope\", \"mode\": \"BATCH\"}")
                .when().post(EXECUTE_URL)
                .then().statusCode(400)
                .body("code", is("OBJECT_NOT_FOUND"))
                .body("error", is(DROP_MISSING))
                .body("$", not(hasKey("table")));
    }

    @Test
    void streamOfDropOfAMissingObjectFailsBeforeStreaming() {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("test-session")).thenReturn(session);
        when(executionService.prepareStream(eq(session), any()))
                .thenThrow(new ObjectNotFoundException(DROP_MISSING + " Use DROP VIEW to drop a view.", null));

        given().contentType("application/json")
                .body("{\"sql\": \"DROP TABLE v\", \"mode\": \"STREAMING\"}")
                .when().post("/api/sessions/test-session/execute/stream")
                .then().statusCode(400)
                .body(containsString("\"code\":\"OBJECT_NOT_FOUND\""))
                .body(containsString("Use DROP VIEW to drop a view."));
    }

    @Test
    void aRealFaultStillAnswers500() {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("test-session")).thenReturn(session);
        when(executionService.execute(any(FlinkSession.class), any(ExecutionMode.class), any(String.class)))
                .thenThrow(new IllegalStateException(DROP_MISSING));

        given().contentType("application/json")
                .body("{\"sql\": \"DROP TABLE nope\", \"mode\": \"BATCH\"}")
                .when().post(EXECUTE_URL)
                .then().statusCode(500)
                .body("code", is("INTERNAL_ERROR"));
    }

    @Test
    void streamOfUnknownTableFailsBeforeStreaming() {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("test-session")).thenReturn(session);
        when(executionService.prepareStream(eq(session), any()))
                .thenThrow(new TableNotFoundException("orders", null, NOT_FOUND, null));

        given().contentType("application/json")
                .body("{\"sql\": \"SELECT * FROM orders\", \"mode\": \"STREAMING\"}")
                .when().post("/api/sessions/test-session/execute/stream")
                .then().statusCode(400)
                .body(containsString("\"code\":\"TABLE_NOT_FOUND\""))
                .body(containsString("\"table\":\"orders\""))
                .body(containsString("Object 'orders' not found"));
    }

    @Test
    void explainOfForbiddenSqlIsForbidden() {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("test-session")).thenReturn(session);
        when(executionService.explain(eq(session), any(), any()))
                .thenThrow(new ForbiddenSqlException("CREATE FUNCTION statements are not allowed"));

        given().contentType("application/json")
                .body("{\"sql\": \"CREATE FUNCTION f AS 'x'\", \"mode\": \"STREAMING\"}")
                .when().post("/api/sessions/test-session/explain")
                .then().statusCode(403);
    }

    @Test
    void explainRequiresMode() {
        given().contentType("application/json")
                .body("{\"sql\": \"SELECT 1\"}")
                .when().post("/api/sessions/test-session/explain")
                .then().statusCode(400);
    }
}
