package com.flinksqlfiddle.execution;

/**
 * A BATCH statement names a view that exists only in the streaming environment, because it reads
 * an unbounded table and Flink refuses to plan that in batch mode. A user error, mapped to 400
 * with code {@code STREAMING_ONLY_VIEW}: unlike a missing table, building the schema again does
 * not help, switching to Streaming does.
 */
public class StreamingOnlyViewException extends RuntimeException {

    private final String view;

    public StreamingOnlyViewException(String view, Throwable cause) {
        super(message(view), cause);
        this.view = view;
    }

    static String message(String view) {
        return "View '" + view + "' reads an unbounded table, so it exists in Streaming mode only. "
                + "Switch to Streaming to query it.";
    }

    public String view() {
        return view;
    }
}
