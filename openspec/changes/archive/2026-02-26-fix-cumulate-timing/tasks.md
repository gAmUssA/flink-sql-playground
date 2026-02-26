## 1. Fix Cumulate Window Example

- [x] 1.1 In `src/main/resources/static/js/examples.js`, change the Cumulate Window query intervals from `INTERVAL '5' SECOND` step / `INTERVAL '30' SECOND` max to `INTERVAL '2' SECOND` step / `INTERVAL '10' SECOND` max. Update the query comment to say "expand window every 2s up to 10s". Acceptance: Cumulate example runs without timeout.

## 2. Fix Hopping Window Example

- [x] 2.1 In `src/main/resources/static/js/examples.js`, change the Hopping Window query intervals from `INTERVAL '10' SECOND` slide / `INTERVAL '30' SECOND` size to `INTERVAL '5' SECOND` slide / `INTERVAL '15' SECOND` size. Update the query comment to say "Count clicks in 15s windows that slide every 5s". Acceptance: Hopping example produces results within ~5s.

## 3. Update Smoke Tests

- [x] 3.1 In `src/test/java/com/flinksqlfiddle/execution/ExampleQueriesSmokeTest.java`, update the `cumulateWindow()` test to use `INTERVAL '2' SECOND` step / `INTERVAL '10' SECOND` max (matching the UI). Acceptance: `./gradlew test` passes.
- [x] 3.2 In `ExampleQueriesSmokeTest.java`, update the `hoppingWindow()` test to use `INTERVAL '5' SECOND` slide / `INTERVAL '15' SECOND` size (matching the UI). Acceptance: `./gradlew test` passes.
