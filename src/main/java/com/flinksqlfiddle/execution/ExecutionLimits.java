package com.flinksqlfiddle.execution;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Resource limits applied to query execution, bound from the {@code execution.*}
 * configuration prefix. These are operational guardrails (how many rows, how long),
 * distinct from the security allowlist in
 * {@link com.flinksqlfiddle.security.SecurityConstants}.
 */
@ConfigurationProperties(prefix = "execution")
public record ExecutionLimits(
        int maxRows,
        Duration executionTimeout,
        Duration collectionTimeout,
        Duration streamTimeout
) {
    private static final int DEFAULT_MAX_ROWS = 1000;
    private static final Duration DEFAULT_EXECUTION_TIMEOUT = Duration.ofSeconds(30);
    private static final Duration DEFAULT_COLLECTION_TIMEOUT = Duration.ofSeconds(15);
    private static final Duration DEFAULT_STREAM_TIMEOUT = Duration.ofMinutes(3);

    public ExecutionLimits {
        if (maxRows <= 0) maxRows = DEFAULT_MAX_ROWS;
        if (executionTimeout == null || executionTimeout.isZero()) executionTimeout = DEFAULT_EXECUTION_TIMEOUT;
        if (collectionTimeout == null || collectionTimeout.isZero()) collectionTimeout = DEFAULT_COLLECTION_TIMEOUT;
        if (streamTimeout == null || streamTimeout.isZero()) streamTimeout = DEFAULT_STREAM_TIMEOUT;
    }

    /** Limits with all defaults applied — convenient for tests and direct instantiation. */
    public static ExecutionLimits defaults() {
        return new ExecutionLimits(0, null, null, null);
    }
}
