package com.flinksqlfiddle.api;

import com.flinksqlfiddle.api.dto.SessionResponse;
import com.flinksqlfiddle.session.SessionManager;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sessions")
public class SessionController {

    private final SessionManager sessionManager;

    public SessionController(SessionManager sessionManager) {
        this.sessionManager = sessionManager;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SessionResponse createSession() {
        String sessionId = sessionManager.createSession();
        return new SessionResponse(sessionId);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSession(@PathVariable String id) {
        sessionManager.deleteSession(id);
    }
}
