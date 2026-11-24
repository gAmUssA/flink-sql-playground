package com.flinksqlfiddle.ratelimit;

import io.smallrye.config.ConfigMapping;
import io.smallrye.config.WithDefault;

import java.time.Duration;

/**
 * Binds {@code app.rate-limit.*}. Each tier is a capacity (the burst) refilled over its period.
 * {@code keyExpiry} must be at least the longest refill period: a bucket forgotten before it has
 * refilled would hand its client a full one (checked at startup by {@link RateLimiter}).
 */
@ConfigMapping(prefix = "app.rate-limit")
public interface RateLimitConfig {

    /** Most distinct client keys kept; the least recently used go first. */
    @WithDefault("10000")
    int maxKeys();

    /** A client idle this long is forgotten. */
    @WithDefault("15m")
    Duration keyExpiry();

    @WithDefault("30")
    int standardCapacity();

    @WithDefault("1m")
    Duration standardRefillPeriod();

    @WithDefault("3")
    int testCapacity();

    @WithDefault("10m")
    Duration testRefillPeriod();
}
