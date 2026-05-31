package com.flinksqlfiddle.api.dto;

/**
 * Identifies the deployed build so the UI can show which commit is running.
 */
public record BuildInfoResponse(
        String commit,
        String commitFull,
        String branch,
        String version,
        String time
) {
}
