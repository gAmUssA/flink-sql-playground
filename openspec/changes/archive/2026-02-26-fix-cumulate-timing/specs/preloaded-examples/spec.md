## ADDED Requirements

### Requirement: Streaming examples produce results within timeout
All streaming window examples SHALL use intervals that produce first results within 15 seconds, leaving at least 15 seconds of headroom before the 30-second execution timeout.

#### Scenario: Cumulate Window completes without timeout
- **WHEN** a user runs the Cumulate Window example
- **THEN** the first window results SHALL appear within approximately 2 seconds (the step interval)
- **AND** the full window cycle SHALL complete within approximately 10 seconds (the max window)

#### Scenario: Hopping Window completes without timeout
- **WHEN** a user runs the Hopping Window example
- **THEN** the first hop results SHALL appear within approximately 5 seconds (the slide interval)
