package com.flinksqlfiddle.api;

import com.flinksqlfiddle.execution.ColumnInfo;
import com.flinksqlfiddle.execution.TableInfo;
import com.flinksqlfiddle.execution.SqlExecutionService;
import com.flinksqlfiddle.session.FlinkSession;
import com.flinksqlfiddle.session.SessionLimitExceededException;
import com.flinksqlfiddle.session.SessionManager;
import com.flinksqlfiddle.session.SessionNotFoundException;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import java.util.List;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.emptyOrNullString;
import static org.hamcrest.Matchers.is;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@QuarkusTest
class SessionResourceTest {

    @InjectMock
    SessionManager sessionManager;

    @InjectMock
    SqlExecutionService executionService;

    @Test
    void createSessionReturns201() {
        when(sessionManager.createSession()).thenReturn("abc-123");

        given().when().post("/api/sessions")
                .then().statusCode(201)
                .body("sessionId", is("abc-123"));
    }

    @Test
    void createSessionLimitExceededReturns429() {
        when(sessionManager.createSession()).thenThrow(new SessionLimitExceededException(5));

        given().when().post("/api/sessions")
                .then().statusCode(429)
                .body("code", is("SESSION_LIMIT_EXCEEDED"));
    }

    @Test
    void listTablesReturnsTableInfo() {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("s1")).thenReturn(session);

        List<TableInfo> tables = List.of(
                new TableInfo("orders", List.of(
                        new ColumnInfo("id", "INT"),
                        new ColumnInfo("amount", "DOUBLE")
                ))
        );
        when(executionService.listTables(session)).thenReturn(tables);

        given().when().get("/api/sessions/s1/tables")
                .then().statusCode(200)
                .body("tables[0].name", is("orders"))
                .body("tables[0].columns[0].name", is("id"))
                .body("tables[0].columns[1].type", is("DOUBLE"));
    }

    @Test
    void listTablesSessionNotFoundReturns404() {
        when(sessionManager.getSession("unknown"))
                .thenThrow(new SessionNotFoundException("unknown"));

        given().when().get("/api/sessions/unknown/tables")
                .then().statusCode(404)
                .body("code", is("SESSION_NOT_FOUND"));
    }

    @Test
    void deleteSessionReturns204() {
        given().when().delete("/api/sessions/s1")
                .then().statusCode(204)
                .body(emptyOrNullString());
    }
}
