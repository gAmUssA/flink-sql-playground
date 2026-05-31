package com.flinksqlfiddle.fiddle;

/**
 * Thrown when a fiddle cannot be found by its short code.
 */
public class FiddleNotFoundException extends RuntimeException {

    public FiddleNotFoundException(String shortCode) {
        super("Fiddle not found: " + shortCode);
    }
}
