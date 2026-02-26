package com.flinksqlfiddle.fiddle;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
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
