package com.flinksqlfiddle.api;

import com.flinksqlfiddle.flink.FlinkProperties;
import com.flinksqlfiddle.execution.ExecutionMode;
import com.flinksqlfiddle.execution.ExecutionTimeoutException;
import com.flinksqlfiddle.execution.QueryResult;
import com.flinksqlfiddle.execution.SqlExecutionService;
import com.flinksqlfiddle.session.FlinkSession;
import com.flinksqlfiddle.session.SessionManager;
import com.flinksqlfiddle.session.SessionNotFoundException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ExecutionController.class)
class ExecutionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private FlinkProperties flinkProperties;

    @MockitoBean
    private SessionManager sessionManager;

    @MockitoBean
    private SqlExecutionService executionService;

    private static final String EXECUTE_URL = "/api/sessions/test-session/execute";

    @Test
    void executeReturnsResult() throws Exception {
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

        mockMvc.perform(post(EXECUTE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"sql": "SELECT 1", "mode": "BATCH"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.columns[0]").value("id"))
                .andExpect(jsonPath("$.columns[1]").value("name"))
                .andExpect(jsonPath("$.rowCount").value(1))
                .andExpect(jsonPath("$.executionTimeMs").value(42))
                .andExpect(jsonPath("$.truncated").value(false));
    }

    @Test
    void executeWithBlankSqlReturns400() throws Exception {
        mockMvc.perform(post(EXECUTE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"sql": "  ", "mode": "BATCH"}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void executeWithNullModeReturns400() throws Exception {
        mockMvc.perform(post(EXECUTE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"sql": "SELECT 1"}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void executeWithInvalidModeReturns400() throws Exception {
        mockMvc.perform(post(EXECUTE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"sql": "SELECT 1", "mode": "INVALID"}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void executeSessionNotFoundReturns404() throws Exception {
        when(sessionManager.getSession("test-session"))
                .thenThrow(new SessionNotFoundException("test-session"));

        mockMvc.perform(post(EXECUTE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"sql": "SELECT 1", "mode": "BATCH"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("SESSION_NOT_FOUND"));
    }

    @Test
    void executeSecurityViolationReturns403() throws Exception {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("test-session")).thenReturn(session);
        when(executionService.execute(any(FlinkSession.class), any(ExecutionMode.class), any(String.class)))
                .thenThrow(new SecurityException("Blocked SQL"));

        mockMvc.perform(post(EXECUTE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"sql": "DROP DATABASE", "mode": "BATCH"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("SECURITY_VIOLATION"));
    }

    @Test
    void executeTimeoutReturns408() throws Exception {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("test-session")).thenReturn(session);
        when(executionService.execute(any(FlinkSession.class), any(ExecutionMode.class), any(String.class)))
                .thenThrow(new ExecutionTimeoutException(30));

        mockMvc.perform(post(EXECUTE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"sql": "SELECT 1", "mode": "BATCH"}
                                """))
                .andExpect(status().isRequestTimeout())
                .andExpect(jsonPath("$.code").value("EXECUTION_TIMEOUT"));
    }

    @Test
    void executeUnexpectedErrorReturns500() throws Exception {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("test-session")).thenReturn(session);
        when(executionService.execute(any(FlinkSession.class), any(ExecutionMode.class), any(String.class)))
                .thenThrow(new RuntimeException("Something broke"));

        mockMvc.perform(post(EXECUTE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"sql": "SELECT 1", "mode": "BATCH"}
                                """))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"));
    }
}
