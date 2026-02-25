package com.flinksqlfiddle.session;

public class SessionNotFoundException extends RuntimeException {

    public SessionNotFoundException(String sessionId) {
        super("Session not found: " + sessionId);
    }
}
