package com.flinksqlfiddle.ratelimit;

import com.github.benmanes.caffeine.cache.Ticker;
import io.github.bucket4j.Bucket;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BucketStoreTest {

    private static Bucket newBucket() {
        return Bucket.builder().addLimit(l -> l.capacity(1).refillGreedy(1, Duration.ofMinutes(1))).build();
    }

    @Test
    void aFloodOfDistinctKeysStaysUnderTheCap() {
        BucketStore store = new BucketStore(100, Duration.ofMinutes(10), Ticker.systemTicker());
        for (int i = 0; i < 20_000; i++) {
            store.get("10.0." + (i / 250) + "." + (i % 250), BucketStoreTest::newBucket);
        }
        assertTrue(store.size() <= 100, "size was " + store.size());
    }

    @Test
    void sameKeySameBucket() {
        BucketStore store = new BucketStore(10, Duration.ofMinutes(10), Ticker.systemTicker());
        Bucket first = store.get("k", BucketStoreTest::newBucket);
        assertSame(first, store.get("k", BucketStoreTest::newBucket));
    }

    @Test
    void idleKeysExpire() {
        AtomicLong nanos = new AtomicLong();
        BucketStore store = new BucketStore(10, Duration.ofMinutes(10), nanos::get);
        Bucket first = store.get("k", BucketStoreTest::newBucket);
        nanos.addAndGet(Duration.ofMinutes(11).toNanos());
        assertNotSame(first, store.get("k", BucketStoreTest::newBucket));
    }
}
