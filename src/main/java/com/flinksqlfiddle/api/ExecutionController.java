package com.flinksqlfiddle.api;

import com.flinksqlfiddle.api.dto.ExecuteRequest;
import com.flinksqlfiddle.api.dto.ExecuteResponse;
import com.flinksqlfiddle.execution.QueryResult;
import com.flinksqlfiddle.execution.SqlExecutionService;
import com.flinksqlfiddle.session.FlinkSession;
import com.flinksqlfiddle.session.SessionManager;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sessions/{sessionId}")
public class ExecutionController {

    private final SessionManager sessionManager;
    private final SqlExecutionService executionService;

    public ExecutionController(SessionManager sessionManager, SqlExecutionService executionService) {
        this.sessionManager = sessionManager;
        this.executionService = executionService;
    }

    @PostMapping("/execute")
    public ExecuteResponse execute(@PathVariable String sessionId,
                                   @Valid @RequestBody ExecuteRequest request) {
        FlinkSession session = sessionManager.getSession(sessionId);
        QueryResult result = executionService.execute(session, request.mode(), request.sql());
        return new ExecuteResponse(
                result.getColumnNames(),
                result.getColumnTypes(),
                result.getRows(),
                result.getRowKinds(),
                result.getRowCount(),
                result.getExecutionTimeMs(),
                result.isTruncated()
        );
    }
}
