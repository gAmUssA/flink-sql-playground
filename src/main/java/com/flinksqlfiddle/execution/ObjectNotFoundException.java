package com.flinksqlfiddle.execution;

import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * A {@code DROP [TEMPORARY] TABLE|VIEW} (without {@code IF EXISTS}) names an object the session does
 * not have, has as the other kind, or has as a temporary one (a plain DROP of it). Mapped to HTTP 400 with code {@code OBJECT_NOT_FOUND}. Unlike
 * {@link TableNotFoundException} the frontend offers no "Build Schema and run": building the schema
 * cannot make a DROP succeed. See docs/adr/0007-table-not-found-error-contract.md.
 *
 * <p>Flink words these as {@code Table with identifier '…' does not exist.}, {@code View with
 * identifier …} and {@code Temporary table or view with identifier …}; none of them match
 * {@link TableNotFoundException}'s patterns.
 */
public class ObjectNotFoundException extends RuntimeException {

    private static final Pattern DOES_NOT_EXIST = Pattern.compile(
            "^(?:Table|View|Temporary table or view) with identifier '.+' does not exist\\.?$", Pattern.DOTALL);

    // A plain DROP of a temporary object: Flink refuses it and says to drop the temporary one first.
    private static final Pattern TEMPORARY_SHADOWS = Pattern.compile(
            "^Temporary (?:table|view) with identifier '.+' exists\\. Drop it first before removing the permanent (?:table|view)\\.$",
            Pattern.DOTALL);

    // Same rule as TableNotFoundException: only planner validation errors are trusted.
    private static final Set<String> VALIDATION_ERRORS =
            Set.of("ValidationException", "SqlValidatorException", "CalciteContextException");

    public ObjectNotFoundException(String message, Throwable cause) {
        super(message, cause);
    }

    /**
     * The failure of a DROP statement, if it is Flink's "does not exist" validation error. The
     * caller must pass only the failure of a DROP of a table or view: ALTER and others word their
     * own errors.
     */
    public static Optional<ObjectNotFoundException> detect(Throwable failure) {
        if (failure instanceof ObjectNotFoundException already) {
            return Optional.of(already);
        }
        for (Throwable t = failure; t != null; t = t.getCause() == t ? null : t.getCause()) {
            String message = t.getMessage();
            if (message != null && VALIDATION_ERRORS.contains(t.getClass().getSimpleName())
                    && (DOES_NOT_EXIST.matcher(message).matches() || TEMPORARY_SHADOWS.matcher(message).matches())) {
                // Flink's own text, not a wrapper's.
                return Optional.of(new ObjectNotFoundException(message, failure));
            }
        }
        return Optional.empty();
    }

    /** The same error with {@code hint} after Flink's message, or this one when there is no hint. */
    public ObjectNotFoundException withHint(String hint) {
        return hint == null || hint.isBlank() ? this : new ObjectNotFoundException(getMessage() + " " + hint, getCause());
    }
}
