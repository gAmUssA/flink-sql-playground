package com.flinksqlfiddle.ratelimit;

import jakarta.ws.rs.NameBinding;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Puts a resource class or method behind the per-client rate limit (ADR 0010). Only annotated
 * endpoints are limited; static files, {@code /api/build-info} and everything else stay open.
 */
@NameBinding
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
public @interface RateLimited {

    /** Which configured limit applies. */
    Tier value() default Tier.STANDARD;

    enum Tier {
        /** {@code app.rate-limit.standard-*}: the default for real endpoints. */
        STANDARD,
        /** {@code app.rate-limit.test-*}: small, for the test-only route. */
        TEST
    }
}
