package com.flinksqlfiddle.execution;

public class ExecutionTimeoutException extends RuntimeException {

  public ExecutionTimeoutException(int timeoutSeconds) {
    super("Query execution timed out after " + timeoutSeconds + " seconds");
  }
}
