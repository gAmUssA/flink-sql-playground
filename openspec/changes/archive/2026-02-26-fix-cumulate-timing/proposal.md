## Why

The "Cumulate Window" UI example uses a 5-second step with a 30-second max window. Since the execution timeout is also 30 seconds, the query frequently times out before producing meaningful results. Other streaming examples (Tumbling at 10s, Hopping at 10s slide) produce results well within the timeout.

## What Changes

- Shrink the Cumulate Window example intervals: step from 5s → 2s, max window from 30s → 10s
- Update the query comment to match the new intervals
- Also shrink the Hopping Window example to avoid the same near-timeout risk (slide 10s → 5s, size 30s → 15s)

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `preloaded-examples`: Interval values changing for Cumulate and Hopping window examples to avoid timeout

## Impact

- **File modified**: `src/main/resources/static/js/examples.js` — interval constants only
- **Test updated**: `src/test/java/com/flinksqlfiddle/execution/ExampleQueriesSmokeTest.java` — matching interval changes for the cumulate and hopping smoke tests
- No API or dependency changes
