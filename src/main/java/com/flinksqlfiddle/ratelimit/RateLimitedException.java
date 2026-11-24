package com.flinksqlfiddle.ratelimit;

/** A client used up its bucket. Mapped to 429 {@code RATE_LIMITED} with {@code Retry-After}. */
public class RateLimitedException extends RuntimeException {

    private final long retryAfterSeconds;

    public RateLimitedException(long retryAfterSeconds) {
        super("Too many requests. Try again in " + retryAfterSeconds + (retryAfterSeconds == 1 ? " second." : " seconds."));
        this.retryAfterSeconds = retryAfterSeconds;
    }

    /** Whole seconds, at least 1. */
    public long retryAfterSeconds() {
        return retryAfterSeconds;
    }
}
