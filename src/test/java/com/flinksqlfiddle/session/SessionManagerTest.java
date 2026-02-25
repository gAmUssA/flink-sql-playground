package com.flinksqlfiddle.session;

import com.flinksqlfiddle.flink.FlinkEnvironmentFactory;
import com.flinksqlfiddle.flink.FlinkProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;

class SessionManagerTest {

    private SessionManager manager;

    @BeforeEach
    void setUp() {
        FlinkEnvironmentFactory factory = new FlinkEnvironmentFactory(
                new FlinkProperties(1, "8m", "32m")
        );
        manager = new SessionManager(factory);
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
    void getSessionUpdatesLastAccessed() throws Exception {
        String id = manager.createSession();
        FlinkSession session = manager.getSession(id);
        Instant firstAccess = session.getLastAccessed();
        Thread.sleep(10);
        manager.getSession(id);
        assertTrue(session.getLastAccessed().isAfter(firstAccess));
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
    void cleanupEvictsIdleSessions() throws Exception {
        String id = manager.createSession();
        // Force the session's lastAccessed to 16 minutes ago
        FlinkSession session = manager.getSession(id);
        Field lastAccessedField = FlinkSession.class.getDeclaredField("lastAccessed");
        lastAccessedField.setAccessible(true);
        lastAccessedField.set(session, Instant.now().minusSeconds(16 * 60));

        manager.cleanupIdleSessions();

        assertThrows(SessionNotFoundException.class, () -> manager.getSession(id));
    }

    @Test
    void cleanupRetainsActiveSessions() {
        String id = manager.createSession();
        manager.getSession(id); // touch it

        manager.cleanupIdleSessions();

        assertDoesNotThrow(() -> manager.getSession(id));
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
