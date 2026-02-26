package com.flinksqlfiddle.session;

import com.flinksqlfiddle.flink.FlinkEnvironmentFactory;
import com.flinksqlfiddle.flink.FlinkProperties;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.RemovalCause;
import com.github.benmanes.caffeine.cache.Ticker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.UUID;

@Service
public class SessionManager {

    private static final Logger log = LoggerFactory.getLogger(SessionManager.class);
    private static final Duration IDLE_TIMEOUT = Duration.ofMinutes(15);

    private final Cache<String, FlinkSession> sessions;
    private final FlinkEnvironmentFactory environmentFactory;
    private final int maxSessions;

    @Autowired
    public SessionManager(FlinkEnvironmentFactory environmentFactory, FlinkProperties flinkProperties) {
        this(environmentFactory, flinkProperties, Ticker.systemTicker());
    }

    SessionManager(FlinkEnvironmentFactory environmentFactory, FlinkProperties flinkProperties, Ticker ticker) {
        this.environmentFactory = environmentFactory;
        this.maxSessions = flinkProperties.maxSessions();
        this.sessions = Caffeine.newBuilder()
                .expireAfterAccess(IDLE_TIMEOUT)
                .maximumSize(maxSessions + 1) // safety net only; we enforce limit explicitly
                .ticker(ticker)
                .executor(Runnable::run) // synchronous removal — session.close() is non-blocking
                .removalListener((String key, FlinkSession session, RemovalCause cause) -> {
                    if (session != null) {
                        session.close();
                        log.info("Evicted session {} (cause={})", key, cause);
                    }
                })
                .build();
    }

    public String createSession() {
        sessions.cleanUp(); // force pending evictions so estimatedSize() is accurate
        if (sessions.estimatedSize() >= maxSessions) {
            log.warn("Session limit exceeded: {} active (max {})", sessions.estimatedSize(), maxSessions);
            throw new SessionLimitExceededException(maxSessions);
        }
        String sessionId = UUID.randomUUID().toString();
        FlinkSession session = new FlinkSession(sessionId, environmentFactory);
        sessions.put(sessionId, session);
        log.info("Created session {} ({} active)", sessionId, sessions.estimatedSize());
        return sessionId;
    }

    public FlinkSession getSession(String sessionId) {
        FlinkSession session = sessions.getIfPresent(sessionId);
        if (session == null) {
            throw new SessionNotFoundException(sessionId);
        }
        log.debug("Accessed session {}", sessionId);
        return session;
    }

    public void deleteSession(String sessionId) {
        sessions.invalidate(sessionId);
        log.info("Deleted session {} ({} active)", sessionId, sessions.estimatedSize());
    }

    public int getActiveSessionCount() {
        sessions.cleanUp();
        return (int) sessions.estimatedSize();
    }
}
