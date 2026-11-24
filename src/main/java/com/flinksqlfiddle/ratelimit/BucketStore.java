package com.flinksqlfiddle.ratelimit;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Ticker;
import io.github.bucket4j.Bucket;

import java.time.Duration;
import java.util.function.Supplier;

/**
 * Per-key buckets in a Caffeine cache with a size cap and an idle expiry, so a flood of distinct
 * client addresses cannot grow memory without bound (ADR 0010).
 */
final class BucketStore {

    private final Cache<String, Bucket> buckets;

    BucketStore(long maxKeys, Duration expireAfterAccess, Ticker ticker) {
        this.buckets = Caffeine.newBuilder()
                .maximumSize(maxKeys)
                .expireAfterAccess(expireAfterAccess)
                .ticker(ticker)
                .build();
    }

    Bucket get(String key, Supplier<Bucket> create) {
        return buckets.get(key, k -> create.get());
    }

    /** Entries held right now, after pending evictions ran. */
    long size() {
        buckets.cleanUp();
        return buckets.estimatedSize();
    }
}
