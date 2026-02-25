package com.flinksqlfiddle.session;

public class SessionLimitExceededException extends RuntimeException {

    public SessionLimitExceededException(int limit) {
        super("Maximum number of concurrent sessions (" + limit + ") reached");
    }
}
