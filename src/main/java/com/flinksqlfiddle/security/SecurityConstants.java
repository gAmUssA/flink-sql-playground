package com.flinksqlfiddle.security;

import java.util.Set;

/**
 * Security policy constants. Operational limits (row caps, timeouts) live in
 * {@link com.flinksqlfiddle.execution.ExecutionLimits}.
 */
public final class SecurityConstants {

    public static final Set<String> ALLOWED_CONNECTORS = Set.of("datagen", "faker", "print", "blackhole");

    private SecurityConstants() {
    }
}
