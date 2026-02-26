package com.flinksqlfiddle.api;

import com.flinksqlfiddle.api.dto.ColumnInfo;
import com.flinksqlfiddle.api.dto.TableInfo;
import com.flinksqlfiddle.flink.FlinkProperties;
import com.flinksqlfiddle.execution.SqlExecutionService;
import com.flinksqlfiddle.session.FlinkSession;
import com.flinksqlfiddle.session.SessionLimitExceededException;
import com.flinksqlfiddle.session.SessionManager;
import com.flinksqlfiddle.session.SessionNotFoundException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(SessionController.class)
class SessionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private FlinkProperties flinkProperties;

    @MockitoBean
    private SessionManager sessionManager;

    @MockitoBean
    private SqlExecutionService executionService;

    @Test
    void createSessionReturns201() throws Exception {
        when(sessionManager.createSession()).thenReturn("abc-123");

        mockMvc.perform(post("/api/sessions"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sessionId").value("abc-123"));
    }

    @Test
    void createSessionLimitExceededReturns429() throws Exception {
        when(sessionManager.createSession()).thenThrow(new SessionLimitExceededException(5));

        mockMvc.perform(post("/api/sessions"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("SESSION_LIMIT_EXCEEDED"));
    }

    @Test
    void listTablesReturnsTableInfo() throws Exception {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("s1")).thenReturn(session);

        List<TableInfo> tables = List.of(
                new TableInfo("orders", List.of(
                        new ColumnInfo("id", "INT"),
                        new ColumnInfo("amount", "DOUBLE")
                ))
        );
        when(executionService.listTables(session)).thenReturn(tables);

        mockMvc.perform(get("/api/sessions/s1/tables"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tables[0].name").value("orders"))
                .andExpect(jsonPath("$.tables[0].columns[0].name").value("id"))
                .andExpect(jsonPath("$.tables[0].columns[1].type").value("DOUBLE"));
    }

    @Test
    void listTablesSessionNotFoundReturns404() throws Exception {
        when(sessionManager.getSession("unknown"))
                .thenThrow(new SessionNotFoundException("unknown"));

        mockMvc.perform(get("/api/sessions/unknown/tables"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("SESSION_NOT_FOUND"));
    }

    @Test
    void deleteSessionReturns204() throws Exception {
        mockMvc.perform(delete("/api/sessions/s1"))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));
    }
}
