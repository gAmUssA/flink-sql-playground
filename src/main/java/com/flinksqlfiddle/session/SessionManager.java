package com.flinksqlfiddle.session;

import com.flinksqlfiddle.flink.FlinkEnvironmentFactory;
import com.flinksqlfiddle.flink.FlinkProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SessionManager {

    private static final Logger log = LoggerFactory.getLogger(SessionManager.class);
    private static final Duration IDLE_TIMEOUT = Duration.ofMinutes(15);

    private final ConcurrentHashMap<String, FlinkSession> sessions = new ConcurrentHashMap<>();
    private final FlinkEnvironmentFactory environmentFactory;
    private final int maxSessions;

    public SessionManager(FlinkEnvironmentFactory environmentFactory, FlinkProperties flinkProperties) {
        this.environmentFactory = environmentFactory;
        this.maxSessions = flinkProperties.maxSessions();
    }

    public String createSession() {
        if (sessions.size() >= maxSessions) {
            log.warn("Session limit exceeded: {} active (max {})", sessions.size(), maxSessions);
            throw new SessionLimitExceededException(maxSessions);
        }
        String sessionId = UUID.randomUUID().toString();
        FlinkSession session = new FlinkSession(sessionId, environmentFactory);
        sessions.put(sessionId, session);
        log.info("Created session {} ({} active)", sessionId, sessions.size());
        return sessionId;
    }

    public FlinkSession getSession(String sessionId) {
        FlinkSession session = sessions.get(sessionId);
        if (session == null) {
            throw new SessionNotFoundException(sessionId);
        }
        session.updateLastAccessed();
        log.debug("Accessed session {}", sessionId);
        return session;
    }

    public void deleteSession(String sessionId) {
        FlinkSession removed = sessions.remove(sessionId);
        if (removed != null) {
            removed.close();
            log.info("Deleted session {} ({} active)", sessionId, sessions.size());
        }
    }

    @Scheduled(fixedRate = 60_000)
    public void cleanupIdleSessions() {
        int before = sessions.size();
        Instant cutoff = Instant.now().minus(IDLE_TIMEOUT);
        int evicted = 0;
        for (Map.Entry<String, FlinkSession> entry : sessions.entrySet()) {
            if (entry.getValue().getLastAccessed().isBefore(cutoff)) {
                FlinkSession evictedSession = sessions.remove(entry.getKey());
                if (evictedSession != null) evictedSession.close();
                log.info("Evicted idle session {}", entry.getKey());
                evicted++;
            }
        }
        if (before > 0 || evicted > 0) {
            log.info("Session cleanup: checked {}, evicted {}, {} remaining", before, evicted, sessions.size());
        }
    }

    public int getActiveSessionCount() {
        return sessions.size();
    }
}
