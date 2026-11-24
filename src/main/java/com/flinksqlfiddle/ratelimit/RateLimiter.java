package com.flinksqlfiddle.ratelimit;

import com.github.benmanes.caffeine.cache.Ticker;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Duration;

/** Takes one token from the client's bucket for a tier, or throws {@link RateLimitedException}. */
@ApplicationScoped
public class RateLimiter {

    private final BucketStore store;
    private final RateLimitConfig config;

    RateLimiter(RateLimitConfig config) {
        Duration longest = config.standardRefillPeriod().compareTo(config.testRefillPeriod()) >= 0
                ? config.standardRefillPeriod() : config.testRefillPeriod();
        if (config.keyExpiry().compareTo(longest) < 0) {
            throw new IllegalArgumentException("app.rate-limit.key-expiry (" + config.keyExpiry()
                    + ") must be at least the longest refill period (" + longest + ")");
        }
        this.config = config;
        this.store = new BucketStore(config.maxKeys(), config.keyExpiry(), Ticker.systemTicker());
    }

    void acquire(RateLimited.Tier tier, String clientKey) {
        int capacity = tier == RateLimited.Tier.TEST ? config.testCapacity() : config.standardCapacity();
        Duration period = tier == RateLimited.Tier.TEST ? config.testRefillPeriod() : config.standardRefillPeriod();
        Bucket bucket = store.get(tier + ":" + clientKey, () -> Bucket.builder()
                .addLimit(l -> l.capacity(capacity).refillGreedy(capacity, period))
                .build());
        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        if (!probe.isConsumed()) {
            long nanos = probe.getNanosToWaitForRefill();
            long seconds = Math.max(1, Math.ceilDiv(nanos, 1_000_000_000L));
            throw new RateLimitedException(seconds);
        }
    }
}
