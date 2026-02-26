package com.flinksqlfiddle.api;

import com.flinksqlfiddle.api.dto.SessionResponse;
import com.flinksqlfiddle.api.dto.TablesResponse;
import com.flinksqlfiddle.execution.SqlExecutionService;
import com.flinksqlfiddle.session.FlinkSession;
import com.flinksqlfiddle.session.SessionManager;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sessions")
public class SessionController {

    private final SessionManager sessionManager;
    private final SqlExecutionService executionService;

    public SessionController(SessionManager sessionManager, SqlExecutionService executionService) {
        this.sessionManager = sessionManager;
        this.executionService = executionService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SessionResponse createSession() {
        String sessionId = sessionManager.createSession();
        return new SessionResponse(sessionId);
    }

    @GetMapping("/{id}/tables")
    public TablesResponse listTables(@PathVariable String id) {
        FlinkSession session = sessionManager.getSession(id);
        return new TablesResponse(executionService.listTables(session));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSession(@PathVariable String id) {
        sessionManager.deleteSession(id);
    }
}
