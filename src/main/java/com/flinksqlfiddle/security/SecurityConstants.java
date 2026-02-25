package com.flinksqlfiddle.security;

import java.util.Set;

public final class SecurityConstants {

    public static final int MAX_ROWS = 1000;
    public static final int EXECUTION_TIMEOUT_SECONDS = 30;
    public static final int DEFAULT_PARALLELISM = 1;
    public static final Set<String> ALLOWED_CONNECTORS = Set.of("datagen", "print", "blackhole");

    private SecurityConstants() {
    }
}
