package com.flinksqlfiddle.security;

import com.flinksqlfiddle.util.SqlText;
import jakarta.enterprise.context.ApplicationScoped;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

@ApplicationScoped
public class SqlSecurityValidator {

    private static final Logger log = LoggerFactory.getLogger(SqlSecurityValidator.class);

    private static final Pattern CREATE_FUNCTION_PATTERN = Pattern.compile(
            "^\\s*CREATE\\s+(TEMPORARY\\s+)?(SYSTEM\\s+)?FUNCTION\\b", Pattern.CASE_INSENSITIVE);

    private static final Pattern ADD_JAR_PATTERN = Pattern.compile(
            "^\\s*ADD\\s+JAR\\b", Pattern.CASE_INSENSITIVE);

    private static final Pattern CREATE_CATALOG_PATTERN = Pattern.compile(
            "^\\s*CREATE\\s+CATALOG\\b", Pattern.CASE_INSENSITIVE);

    private static final Pattern SET_PATTERN = Pattern.compile(
            "^\\s*SET\\b", Pattern.CASE_INSENSITIVE);

    private static final Pattern CREATE_TABLE_PATTERN = Pattern.compile(
            "^\\s*CREATE\\s+(TEMPORARY\\s+)?TABLE\\b", Pattern.CASE_INSENSITIVE);

    // A WITH option block — the only place a CREATE TABLE can attach a connector.
    private static final Pattern WITH_CLAUSE_PATTERN = Pattern.compile(
            "\\bWITH\\s*\\(", Pattern.CASE_INSENSITIVE);

    private static final Pattern CONNECTOR_PATTERN = Pattern.compile(
            "'connector'\\s*=\\s*'([^']+)'", Pattern.CASE_INSENSITIVE);

    public void validate(String sql) {
        if (sql == null || sql.isBlank()) {
            return;
        }
        String[] statements = sql.split(";");
        for (String stmt : statements) {
            String trimmed = stmt.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            validateStatement(trimmed);
        }
    }

    private void validateStatement(String rawStatement) {
        // Flink's parser ignores leading comments, so match against a comment-stripped view of
        // the statement. Matching the raw text lets "/* */ CREATE TABLE ... 'connector'='jdbc'"
        // or "-- x\nCREATE FUNCTION ..." slip past these start-anchored checks. The original
        // (comments intact) is never executed here — this is detection only.
        String sql = SqlText.stripLeadingComments(rawStatement);
        if (CREATE_FUNCTION_PATTERN.matcher(sql).find()) {
            log.warn("Blocked SQL: {} [type=CREATE_FUNCTION]", SqlText.truncate(sql));
            throw new ForbiddenSqlException("CREATE FUNCTION statements are not allowed");
        }
        if (ADD_JAR_PATTERN.matcher(sql).find()) {
            log.warn("Blocked SQL: {} [type=ADD_JAR]", SqlText.truncate(sql));
            throw new ForbiddenSqlException("ADD JAR statements are not allowed");
        }
        if (CREATE_CATALOG_PATTERN.matcher(sql).find()) {
            log.warn("Blocked SQL: {} [type=CREATE_CATALOG]", SqlText.truncate(sql));
            throw new ForbiddenSqlException("CREATE CATALOG statements are not allowed");
        }
        if (SET_PATTERN.matcher(sql).find()) {
            log.warn("Blocked SQL: {} [type=SET]", SqlText.truncate(sql));
            throw new ForbiddenSqlException("SET statements are not allowed");
        }
        if (CREATE_TABLE_PATTERN.matcher(sql).find()) {
            validateConnector(sql);
        }
        log.debug("Validation passed: {}", SqlText.truncate(sql));
    }

    /**
     * Fail-closed connector policy for CREATE TABLE. A CREATE TABLE with a {@code WITH (...)}
     * option block must declare a {@code 'connector' = '<allowed>'}; if no recognizable
     * allowlisted connector is found, the statement is rejected. This blocks both forbidden
     * connectors and attempts to obfuscate the connector option (e.g. an inline comment
     * {@code 'connector'/*x*}{@code /='jdbc'}) — obfuscation just means "no allowlisted
     * connector found", which now fails rather than passes. Statements without a WITH block
     * (schema-only DDL, {@code CREATE TABLE ... AS SELECT}, {@code ... LIKE}) declare no
     * connector and so cannot perform connector I/O; they pass.
     */
    private void validateConnector(String sql) {
        if (!WITH_CLAUSE_PATTERN.matcher(sql).find()) {
            return;
        }
        Matcher matcher = CONNECTOR_PATTERN.matcher(sql);
        boolean sawConnector = false;
        while (matcher.find()) {
            sawConnector = true;
            String connector = matcher.group(1);
            if (!SecurityConstants.ALLOWED_CONNECTORS.contains(connector)) {
                log.warn("Blocked SQL: {} [type=FORBIDDEN_CONNECTOR, connector={}]", SqlText.truncate(sql), connector);
                throw new ForbiddenSqlException(
                        "Connector '" + connector + "' is not allowed. Allowed connectors: "
                                + SecurityConstants.ALLOWED_CONNECTORS);
            }
        }
        if (!sawConnector) {
            log.warn("Blocked SQL: {} [type=MISSING_CONNECTOR]", SqlText.truncate(sql));
            throw new ForbiddenSqlException(
                    "CREATE TABLE with a WITH clause must declare an allowed connector. "
                            + "Allowed connectors: " + SecurityConstants.ALLOWED_CONNECTORS);
        }
    }
}
