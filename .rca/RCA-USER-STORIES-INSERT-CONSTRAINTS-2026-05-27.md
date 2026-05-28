# RCA: user_stories INSERT failures (PRD-SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001)

**Date**: 2026-05-27 | **Mode**: campaign | **Phase**: PLAN | **Severity**: QF (doc drift + missing wrapper)

## Evidence (pg_constraint, verified)

```
valid_story_key                  CHECK (story_key ~ '^[A-Z0-9-]+:US-[0-9]{3,}$')   -- 3+ digits, ":US-" literal
user_stories_status_check        CHECK status IN ('draft','ready','in_progress','testing','completed','blocked')
user_stories_priority_check      CHECK priority IN ('critical','high','medium','low','minimal')
implementation_context_required  CHECK ic IS NOT NULL AND ic <> '' AND ic <> '{}' AND ic <> 'null' AND length(ic) > 10
                                 -- ic is column type TEXT (not jsonb)
```
NOT NULL columns: `id, story_key, title, user_role, user_want, user_benefit`. `prd_id`/`sd_id` are nullable FK (ON DELETE CASCADE) — populate both anyway.

## Root cause (5-Whys)

1. **Why did 5 attempts each surface a new constraint?** No canonical wrapper exists; you discovered constraints by INSERT-error.
2. **Why no wrapper?** Every user_stories insert in the repo is a one-time script under `scripts/archive/one-time/` (`create-stories-*`, `generate-user-stories-*`). No `add-user-stories-to-database.js` analog to `add-prd-to-database.js`.
3. **Why is the DIGEST wrong about JSONB?** `CLAUDE_PLAN_DIGEST.md:138` says *"implementation_context JSONB (NOT NULL)"* but the column is `text` with a length>10 CHECK and `IS NOT NULL` is **not** enforced at NOT-NULL level — it's enforced by the CHECK. Doc was written against an imagined schema, not pg_catalog.
4. **Why is doc drifted?** Schema authority lives in migrations; DIGEST is hand-edited prose. No CI gate cross-checks DIGEST claims against `information_schema.columns`.
5. **Root cause**: **Writer-consumer asymmetry — the writer-path docs (DIGEST) drift from the consumer-path constraints (pg_constraint).** Every PLAN agent re-discovers the schema by trial and error.

This is **4th witness of `PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001`** (after the 3rd witness QF-904 generate-retrospective.js per MEMORY 2026-05-26). Inline expert lens: a **database-agent** would note that wrapping insert paths and exporting `pg_get_constraintdef` output as a Skill resource is the canonical fix — same pattern as `pg_get_viewdef` preflight added to `run-sql-migration.js`.

## Canonical INSERT shape

```js
{
  story_key: 'SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001:US-001',  // full SD prefix; ZERO-PADDED 3 digits
  prd_id: '<uuid from product_requirements_v2.id>',              // FK; pull from PRD row
  sd_id:  'SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001',            // FK; sd_key
  title: '...',                                                  // NOT NULL
  user_role: 'PLAN agent', user_want: '...', user_benefit: '...', // NOT NULL trio
  priority: 'high',     // critical|high|medium|low|minimal  (NOT 'critical'/'low' alone — those work, but 'pending' etc. do not)
  status:   'draft',    // draft|ready|in_progress|testing|completed|blocked
  story_points: 3,
  acceptance_criteria: [...],  // jsonb default '[]'
  test_scenarios: [...],       // jsonb default '[]'
  implementation_context: '## Implementation Guidance\n\n... (length > 10 chars, plain string)',  // TEXT not JSONB
  metadata: { source: 'plan-inline', prd_section: 'US' }  // jsonb
}
```

Key rules:
- `story_key` regex: `^[A-Z0-9-]+:US-[0-9]{3,}$` → use **`US-001`** not `US-01` (your attempt 3 form `US-01` would actually fail; you got past it only because you also fixed the prefix).
- `implementation_context` is **TEXT containing a string** (often JSON-stringified guidance markdown). Pass `String`, not object. Sample rows store JSON as string with `\"`-escapes.
- No constraint on `prd_id` content beyond FK — but FK requires the PRD row to exist first.

## CAPA

**Corrective (immediate, your work):**
- Use the shape above. 5 rows, `:US-001..:US-005`, with `implementation_context` as a plain markdown string `> 10` chars. Do NOT `JSON.stringify(object)` an object meant for a JSONB column — `implementation_context` is the only one where it's a real text payload.

**Preventive (file as QF, ~50 LOC):**
- **QF-1**: Create `scripts/add-user-stories-to-database.js` wrapper analogous to `add-prd-to-database.js`. Accept array of partial story objects + `prd_id`/`sd_id`; fill defaults; validate against pg_constraint at runtime (re-query once, cache); single batched INSERT with idempotent `ON CONFLICT (story_key) DO UPDATE`.
- **QF-2**: Patch `CLAUDE_PLAN_DIGEST.md:138` to: *"INSERT user stories via `scripts/add-user-stories-to-database.js` (implementation_context is TEXT, length > 10, NOT JSONB)."*
- **Pattern**: File as **4th witness of PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001** (DIGEST writes JSONB, DB consumes TEXT).

**Verification:** After QF-1 lands, repeat your 5-row insert through the wrapper; expect 0 constraint violations on attempt 1. Add a vitest pin that asserts wrapper output satisfies all 4 CHECK constraints against a recorded pg_constraint snapshot.

## /signal recommendation
`/signal harness-bug "user_stories has no canonical insert wrapper; DIGEST says JSONB but column is TEXT — 4th writer-consumer asymmetry witness"`

**Experts consulted**: database-agent (INLINE — sub-agent depth limit prevents Task spawn). Findings: column-vs-DIGEST mismatch, identical mechanism to retro-script asymmetry resolved by QF-904; recommend wrapper + DIGEST patch as paired CAPA, not either alone.
