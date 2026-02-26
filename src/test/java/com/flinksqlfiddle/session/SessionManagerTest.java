package com.flinksqlfiddle.session;

import com.flinksqlfiddle.flink.FlinkEnvironmentFactory;
import com.flinksqlfiddle.flink.FlinkProperties;
import com.github.benmanes.caffeine.cache.Ticker;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

class SessionManagerTest {

    private SessionManager manager;
    private AtomicLong fakeTime;

    @BeforeEach
    void setUp() {
        FlinkProperties props = new FlinkProperties(1, "8m", "32m", 5);
        FlinkEnvironmentFactory factory = new FlinkEnvironmentFactory(props);
        fakeTime = new AtomicLong(System.nanoTime());
        Ticker ticker = fakeTime::get;
        manager = new SessionManager(factory, props, ticker);
    }

    @Test
    void createSessionReturnsUniqueId() {
        String id1 = manager.createSession();
        String id2 = manager.createSession();
        assertNotNull(id1);
        assertNotNull(id2);
        assertNotEquals(id1, id2);
    }

    @Test
    void getSessionReturnsCreatedSession() {
        String id = manager.createSession();
        FlinkSession session = manager.getSession(id);
        assertEquals(id, session.getSessionId());
        assertNotNull(session.getBatchEnv());
        assertNotNull(session.getStreamEnv());
    }

    @Test
    void getSessionThrowsForUnknownId() {
        assertThrows(SessionNotFoundException.class, () ->
                manager.getSession("nonexistent"));
    }

    @Test
    void deleteSessionRemovesSession() {
        String id = manager.createSession();
        manager.deleteSession(id);
        assertThrows(SessionNotFoundException.class, () -> manager.getSession(id));
    }

    @Test
    void createSessionThrowsWhenLimitReached() {
        for (int i = 0; i < 5; i++) {
            manager.createSession();
        }
        assertThrows(SessionLimitExceededException.class, () -> manager.createSession());
    }

    @Test
    void caffeineEvictsIdleSessions() {
        String id = manager.createSession();
        // Advance time by 16 minutes (past 15-minute idle timeout)
        fakeTime.addAndGet(16L * 60 * 1_000_000_000L);
        // Caffeine requires a cache operation to trigger eviction
        assertThrows(SessionNotFoundException.class, () -> manager.getSession(id));
    }

    @Test
    void caffeineRetainsActiveSession() {
        String id = manager.createSession();
        // Advance 10 minutes, then touch the session
        fakeTime.addAndGet(10L * 60 * 1_000_000_000L);
        manager.getSession(id); // resets access time
        // Advance another 10 minutes (20 total, but only 10 since last access)
        fakeTime.addAndGet(10L * 60 * 1_000_000_000L);
        assertDoesNotThrow(() -> manager.getSession(id));
    }

    @Test
    void evictedSlotCanBeReused() {
        // Fill all 5 slots
        for (int i = 0; i < 5; i++) {
            manager.createSession();
        }
        assertThrows(SessionLimitExceededException.class, () -> manager.createSession());

        // Expire all sessions
        fakeTime.addAndGet(16L * 60 * 1_000_000_000L);

        // Slot freed by eviction — new session should succeed
        assertDoesNotThrow(() -> manager.createSession());
    }

    @Test
    void activeSessionCountTracksCorrectly() {
        assertEquals(0, manager.getActiveSessionCount());
        String id1 = manager.createSession();
        assertEquals(1, manager.getActiveSessionCount());
        manager.createSession();
        assertEquals(2, manager.getActiveSessionCount());
        manager.deleteSession(id1);
        assertEquals(1, manager.getActiveSessionCount());
    }
}
