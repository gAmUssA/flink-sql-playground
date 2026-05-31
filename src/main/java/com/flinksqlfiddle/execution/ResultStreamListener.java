package com.flinksqlfiddle.execution;

import java.io.IOException;
import java.util.List;

/**
 * Callback sink for streamed query results. Implementations typically write each
 * callback to an HTTP response. An {@link IOException} from any method signals that
 * the client has gone away (aborted/disconnected); {@link SqlExecutionService} treats
 * that as a stop request and cancels the underlying Flink job.
 */
public interface ResultStreamListener {

    void onSchema(List<String> columnNames, List<String> columnTypes) throws IOException;

    void onRow(String kind, List<Object> values) throws IOException;

    void onEnd(int rowCount, boolean truncated, long executionTimeMs) throws IOException;
}
