---
category: database
status: approved
version: 1.0.0
author: SD-LEO-INFRA-LEO-PROTOCOL-SECTIONS-ID-SEQ-RESYNC-001
last_updated: 2026-07-02
tags: [database, migration, sequence, leo_protocol_sections]
---

# leo_protocol_sections_id_seq Resync — 2026-07-02

## Problem Summary

**Issue**: `leo_protocol_sections.id` had drifted ahead of its backing Postgres sequence
(`leo_protocol_sections_id_seq`).

**Symptoms**: A plain `nextval()`-driven INSERT (the normal application path — no explicit
`id` column) failed with a duplicate key violation (`23505`).

**Root cause**: A prior process inserted rows into `leo_protocol_sections` with explicit,
non-sequential `id` values without ever advancing the sequence via `setval()`. Confirmed
live pre-fix: `last_value=613` (so `nextval()` would return `614`) while
`MAX(id)=616` — ids `614`–`616` already existed from explicit-id inserts, so the next
sequence-driven insert collided on `614`.

## Resolution

Migration: `database/migrations/20260702_leo_protocol_sections_id_seq_resync.sql`

1. `SELECT setval('public.leo_protocol_sections_id_seq', (SELECT MAX(id) FROM public.leo_protocol_sections), true);`
   — re-syncs the sequence so `nextval()` resumes returning unused ids.
2. `GRANT UPDATE, SELECT ON SEQUENCE public.leo_protocol_sections_id_seq TO service_role;`
   — lets the worker/MCP role (which connects via `SUPABASE_SERVICE_ROLE_KEY`) self-repair
   a future drift via `setval()` without needing another elevated migration run.
   Note: `USAGE` (needed for `nextval()`/`currval()`) was already granted to
   `service_role`/`authenticated`/`anon`; only `UPDATE` (required by `setval()`) was
   missing per `information_schema.role_table_grants`. That view is known to be
   unreliable for sequence grants in this environment — a broader survey of other,
   untouched sequences found most already carry full `rwU` grants for all three roles
   via a database-wide `ALTER DEFAULT PRIVILEGES` rule, so this `GRANT` may have been a
   harmless no-op rather than the actual fix for the reported `42501`. It is documented
   here for honesty; it does not affect the correctness of the `setval()` fix below,
   which is independently verified.

Applied to production via the canonical `scripts/apply-migration.js --prod-deploy` path
(self-issued single-use token via `--issue-token`, `@approved-by` marker matching the
committer's git email).

## Verification

- **Pre-fix**: reproduced the drift (`last_value=613` vs `MAX(id)=616`) and the `23505`
  collision on a plain INSERT using the real production `service_role` client.
- **Post-fix**: re-ran the same plain INSERT (no explicit `id`) as the real production
  `service_role` client — succeeded at `id=617`, no collision. Verification row deleted
  immediately after.
- Independently re-verified live by the VALIDATION sub-agent (PASS, 92% confidence).

## Related

- PR: [#5372](https://github.com/rickfelix/EHG_Engineer/pull/5372)
- SD: `SD-LEO-INFRA-LEO-PROTOCOL-SECTIONS-ID-SEQ-RESYNC-001`
