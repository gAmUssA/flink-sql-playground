package com.flinksqlfiddle.fiddle;

import jakarta.persistence.*;
import org.hibernate.annotations.Immutable;

import java.time.Instant;

/**
 * A saved fiddle, addressed by a content hash of its (schema, query, mode). Rows are only
 * ever inserted (see {@code FiddleService.save}, which inserts-if-absent) and never mutated —
 * there are no setters. {@link Immutable} makes that contract explicit to Hibernate: it skips
 * dirty-checking/UPDATE generation for this entity, which also sidesteps the optimistic-locking
 * concern (no {@code @Version} needed, since concurrent updates cannot occur by design).
 */
@Entity
@Immutable
@Table(name = "fiddles")
public class Fiddle {

    @Id
    @Column(name = "short_code")
    private String shortCode;

    @Column(name = "schema_ddl", columnDefinition = "TEXT", nullable = false)
    private String schema;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String query;

    @Column(nullable = false)
    private String mode;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Fiddle() {
    }

    public Fiddle(String shortCode, String schema, String query, String mode) {
        this.shortCode = shortCode;
        this.schema = schema;
        this.query = query;
        this.mode = mode;
        this.createdAt = Instant.now();
    }

    public String getShortCode() {
        return shortCode;
    }

    public String getSchema() {
        return schema;
    }

    public String getQuery() {
        return query;
    }

    public String getMode() {
        return mode;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
