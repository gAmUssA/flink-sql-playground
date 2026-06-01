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

    private void validateStatement(String sql) {
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

    private void validateConnector(String sql) {
        Matcher matcher = CONNECTOR_PATTERN.matcher(sql);
        if (matcher.find()) {
            String connector = matcher.group(1);
            if (!SecurityConstants.ALLOWED_CONNECTORS.contains(connector)) {
                log.warn("Blocked SQL: {} [type=FORBIDDEN_CONNECTOR, connector={}]", SqlText.truncate(sql), connector);
                throw new ForbiddenSqlException(
                        "Connector '" + connector + "' is not allowed. Allowed connectors: "
                                + SecurityConstants.ALLOWED_CONNECTORS);
            }
        }
    }
}
