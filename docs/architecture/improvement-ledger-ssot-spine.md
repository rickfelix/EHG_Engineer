# Improvement-Ledger SSOT Spine

**Category**: Architecture | **Status**: Approved | **Version**: 1.0.0 | **Author**: SD-LEO-INFRA-009-LEAF-IMPROVEMENT-001 | **Last Updated**: 2026-07-04 | **Tags**: improvement-loops, ledger, views, RLS

**Purpose:** a single source-of-truth spine that unifies the outcomes of the six existing improvement loops onto one canonical shape, via **read-only views only** — no new writers, no schema mutation of any source table. Views-first, measure-before-enforce.

Migration: `database/migrations/20260703_improvement_ledger_views.sql`.

## The six loops + the spine

| Loop | View | Source table(s) |
|------|------|------------------|
| A — ledger applied-rate | `v_improvement_ledger_loop_a_applied_rate` | `protocol_improvement_queue` |
| B — signal aggregation | `v_improvement_ledger_loop_b_signal_aggregation` | `session_coordination` |
| C — retro/learn | `v_improvement_ledger_loop_c_retro_learn` | `retrospectives` |
| D — convergence-clone | `v_improvement_ledger_loop_d_convergence_clone` | `convergence_ledger_runs`, `convergence_ledger_stages` |
| E — role self-review | `v_improvement_ledger_loop_e_role_self_review` | `feedback` (`category='adam_self_assessment'`) |
| F — PAT registry | `v_improvement_ledger_loop_f_pat_registry` | `issue_patterns` |
| **Spine** | `v_improvement_ledger` | `UNION ALL` of the six loop views |

Query the spine when you want cross-loop visibility without knowing all six view names; query a per-loop view when you only care about one loop.

## Shared column vocabulary (frozen)

Every view — loop or spine — projects exactly:

```
loop_id, cycle_id, stage, entered_at, stage_status, source_table
```

`stage` is one of the canonical cycle stages **SENSE → RECORD → DECIDE → ACT → VERIFY → PREVENT**. One row per `(cycle_id, stage)` actually reached — rows are not padded with NULLs for stages a cycle hasn't reached yet. Two sibling SDs (`LEAF-FORMALIZE-001`, `LEAF-PER-001`) are already drafted against this exact contract — do not change the column set or types without updating both.

## Security model (RLS-safe)

Every view is created `WITH (security_invoker = true)`, so it runs as the querying role and is subject to the RLS already enabled on all seven source tables. Because all seven base tables carry permissive `USING (true)` policies for `authenticated`, RLS alone would not block a plain authenticated reader — **REVOKE is the load-bearing control**: `REVOKE ALL ... FROM PUBLIC, anon, authenticated` on every view, with `GRANT SELECT ... TO service_role` only (the role this repo's tooling actually queries with). Supabase resets grants to its default blanket `anon`/`authenticated` SELECT on view (re)creation, so the REVOKE/GRANT block must be re-applied after any future `DROP`+`CREATE` of these views.

## Known, documented gaps (not defects)

Each is a deliberate scope boundary of this no-schema-mutation SD, not an oversight:

- **Loop B** (signal aggregation) intentionally covers RECORD/DECIDE/ACT only — no reliable FK from `session_coordination` to the promoted feedback row (dedup is by content hash), and the table is ~24h-TTL ephemeral, so VERIFY/PREVENT are not fabricated.
- **Loop C** (retro/learn) intentionally omits SENSE/VERIFY/PREVENT — covered by loop A's and loop F's views, since retrospectives feed both `protocol_improvement_queue` and `issue_patterns` downstream.
- **Loop D** (convergence-clone): `convergence_ledger_stages` has 0 live rows today; an empty result for its stage-level rows is an honest reflection of current data. Its source table's own numbered pipeline stage (0-26) is a different concept from this spine's SENSE/RECORD/…/PREVENT `stage` column — the number is folded into `stage_status` text only.
- **Loop E** (role self-review): all three emitted stages reuse the feedback row's own `created_at` as `entered_at` — the source JSON carries no separate `verified_at`/`escalated_at` timestamps. Adding those would require a new column on `feedback`, out of scope here.

## Verified acceptance (2026-07-04)

All 9 functional requirements independently re-verified against the live dev DB post-implementation: all 7 views exist and are queryable via `service_role`; the shared column vocabulary is identical across all 7 (`information_schema.columns`); `security_invoker=on` + REVOKE-then-GRANT-service_role-only confirmed via `pg_class.reloptions` / `information_schema.role_table_grants`; zero new writers/schema mutation confirmed (`git diff` touches exactly this one migration file). A follow-up commit closed 4 adversarial-review findings (Loop A `ACT` undercounting rows with `status='APPLIED'` but a NULL `applied_at`; Loop A `PREVENT` null-safety fallback; Loop D `cycle_id` join-contract consistency across UNION branches; Loop E timestamp-reuse limitation documented above).
