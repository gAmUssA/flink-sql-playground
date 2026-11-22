---
# flink-sql-playground-nhqw
title: Faker dimension tables declare PRIMARY KEYs over insert-only data
status: todo
type: bug
priority: normal
created_at: 2026-11-22T21:44:27Z
updated_at: 2026-11-22T22:21:57Z
parent: flink-sql-playground-e6yy
---

From Copilot's Flink SQL review (2026-11-22, PR for the timeline zoom + preset audit), finding 1.

E-Commerce Streaming and Brewmaster Monitoring declare PRIMARY KEY (...) NOT ENFORCED on faker tables that emit INSERT rows only, with duplicate keys (e.g. 50 rows over 5-10 ids). The key is an assertion Flink trusts: regular joins can treat each new insert as the one row for that key without retracting earlier join results, so the output is plausible but not upsert semantics.

- [ ] Decide: drop the PRIMARY KEYs (dimension rows become events, joins keep all), or derive keyed changelogs with a deduplication view, or make the faker connector emit upserts. Measure first: a ROW_NUMBER 'latest per key' view drops out-of-order rows (it left 35-50% of Temporal Join txns without a rate, so #80 reverted it there)
- [ ] Keep the presets' comments truthful about what 'dimension' means here
- [ ] Check the Job Graph's changelog modes before and after
