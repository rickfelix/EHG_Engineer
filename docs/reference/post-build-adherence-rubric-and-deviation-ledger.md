# Post-Build Adherence Rubric + Deviation Ledger + Verdict Engine

**Category**: Reference
**Status**: Approved
**Version**: 1.1.0
**Author**: SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-A, SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B
**Last Updated**: 2026-07-04
**Tags**: eva, artifact-reconciliation, rubric, deviation, schema, verdict-engine

## Purpose

Foundational schema for the Post-Build Artifact Reconciliation Gate orchestrator
(`SD-LEO-INFRA-POST-BUILD-ARTIFACT-001`). Three primitives, consumed by that
orchestrator's later children (C: scoring + convergence loop, D: gate wiring):

1. **`adherence_rubrics`** — a chairman-ratified, immutable rubric registry.
2. **`lib/eva/deviation-ledger.js`** — an ADR-style, append-only capture point
   for build-time plan-vs-reality deviations.
3. **`post_build_verdicts` + `lib/eva/post-build-verdict-engine.js`** (Child B) —
   the artifact walk that enumerates required artifacts, checks completeness,
   evidence-links claims against the venture's own repo, and writes a durable
   disposition per claim.

## `adherence_rubrics` table

A new, purpose-built table — **not** an extension of `leo_scoring_rubrics` or
`leo_vetting_rubrics`. Both were evaluated and rejected after direct schema
inspection (reading actual trigger/CHECK-constraint bodies, not just column
lists):

- `leo_scoring_rubrics` has a `BEFORE INSERT` trigger (`leo_scoring_rubrics_validate`
  → `validate_rubric_json`) that hard-codes the `prioritization_v1` rubric's
  exact 6 dimension keys (`value`/`alignment`/`risk`/`effort`/`dependency`/
  `confidence`) and rejects any other dimension set.
- `leo_vetting_rubrics` has a CHECK constraint (`chk_rubric_rules_schema`)
  requiring `rules->>'pass_threshold'` to be numeric between 0 and 1 (a
  normalized weighted-sum model), incompatible with a "dimension floor + mean
  floor + zero-unscored" rule on a 1-5 scale with no natural `[0,1]` mapping.

`adherence_rubrics` mirrors `leo_scoring_rubrics`' durability house style
(immutability trigger, RLS, `supersedes_rubric_id` versioning chain, checksum)
without inheriting either table's incompatible constraint.

### Schema

| Column | Type | Notes |
|---|---|---|
| `rubric_key` | text | e.g. `post_build_adherence_v1` |
| `version` | integer | unique with `rubric_key` |
| `status` | text | `draft`/`published`/`deprecated` |
| `dimensions` | jsonb | `{dimension_name: {scale, description, evidence_required, behavioral_anchors}}` — no DB-level restriction on dimension names |
| `dimension_floor` | numeric | per-dimension minimum passing score |
| `mean_floor` | numeric | minimum mean score across all dimensions |
| `zero_unscored_fails` | boolean | any unscored dimension fails regardless of other scores |
| `supersedes_rubric_id` | uuid | versioning chain (self-FK) |
| `checksum` | text | content-derived, `md5(dimensions::text \|\| pass rule fields)` |

Immutable via `BEFORE UPDATE`/`BEFORE DELETE` triggers (privileged roles only,
same pattern as `leo_scoring_rubrics`) — future threshold changes `INSERT` a
new version with `supersedes_rubric_id` set, never `UPDATE`.

### The seeded row: `post_build_adherence_v1`

Chairman-ratified 2026-07-04 (`strategic_directives_v2.metadata.rubric_thresholds_ratified`
on the parent orchestrator SD): **pass = every dimension ≥3 AND mean ≥4 AND
zero unscored dimensions**, on a behaviorally-anchored 1-5 scale. Four
dimensions: `user_story_coverage`, `persona_surface_coverage`,
`data_model_fidelity`, `architecture_conformance`.

An automated test (`tests/integration/eva/post-build-adherence-rubric-realdb.test.js`)
asserts this row matches the parent SD's ratified metadata exactly, so future
drift is caught immediately rather than at first-scored-run time.

## Deviation ledger (`lib/eva/deviation-ledger.js`)

ADR-style, append-only capture for build-time plan-vs-reality decisions. Per
the chairman's deviation-semantics refinement: straying from an original
planning artifact is allowable — building sharpens the picture. What gets
penalized (by the future Child C scoring engine) is *undocumented* drift, not
documented, sensible deviation.

Backed by a new `venture_artifacts.artifact_type` value
(`ARTIFACT_TYPES.BUILD_DEVIATION_RECORD` = `'build_deviation_record'`),
reusing that table's existing embedding/summarization infrastructure rather
than a bespoke table.

### API

```js
import { recordDeviation, readDeviations, DEVIATION_WEIGHTS } from '../lib/eva/deviation-ledger.js';

await recordDeviation(supabase, {
  ventureId, artifactRef, what, instead, why, decidedBy,
  weight: 'minor' | 'moderate' | 'critical' | 'declared-descope',
  lifecycleStage, // optional, defaults to 19 (Build)
});

const records = await readDeviations(supabase, { ventureId, artifactRef });
// -> [] if none exist, never null
```

`why` is required and non-empty for **every** weight, including
`declared-descope` — the old "deliberately descoped" primitive folds into this
ledger's weight taxonomy rather than being a separate concept. Judging whether
a reason is *sensible* (vs. thin/nonsensical) is explicitly the future Child
C's job (reason-quality scoring); this module only enforces non-empty.

### Important: `is_current` is always `false`

`venture_artifacts` carries a live partial unique index,
`idx_unique_current_artifact`, on
`(venture_id, lifecycle_stage, artifact_type, COALESCE(metadata->>'screenId', '__no_screen__'))
WHERE is_current = true`. A deviation ledger is append-only — many records
legitimately share the same venture+stage+type (`readDeviations()` returns an
array for exactly this reason) — so it has no single "current" row and must
fall outside that partial index entirely. `recordDeviation()` always inserts
`is_current: false`. (Found via adversarial `/ship` review; regression-tested
in `tests/integration/eva/deviation-ledger-realdb.test.js`.)

## `post_build_verdicts` table + verdict engine (`lib/eva/post-build-verdict-engine.js`)

Delivered by Child B. One row per `(venture_id, artifact_type, claim_ref)` —
the durable output Child C's scoring + convergence loop will read.

### Schema

| Column | Type | Notes |
|---|---|---|
| `artifact_type` | text | e.g. `blueprint_user_story_pack` |
| `claim_ref` | text | stable identifier for a sub-claim within the artifact, or the artifact_type itself for artifact-level dispositions |
| `disposition` | text | `BUILT` \| `PARTIAL` \| `MISSING` \| `DEVIATED_WITH_DOCUMENTED_REASON` \| `DEVIATED_UNDOCUMENTED` |
| `evidence_refs` | jsonb | `[{path, line}]` into the venture's own repo — never raw file content |
| `deviation_artifact_id` | uuid | FK to `venture_artifacts(id)`, `ON DELETE SET NULL`, set only when disposition is `DEVIATED_WITH_DOCUMENTED_REASON` |
| `claim_description` | text | human-readable claim text, for per-claim dispositions |

`UNIQUE (venture_id, artifact_type, claim_ref)`. Explicitly an UPSERT target,
never an append-only log — the S19→S20 gate re-fires the walk on every
remediation-convergence cycle, and only the current verdict per key matters
for scoring.

### API

```js
import { runArtifactWalk } from '../lib/eva/post-build-verdict-engine.js';

const results = await runArtifactWalk(supabase, { ventureId, throughStage: 19 });
// -> [{ artifactType, claimRef, disposition }, ...] — 100% coverage: every
// artifact_type required by venture_stages.required_artifacts (stages 0..throughStage)
// gets at least one verdict row.
```

Evidence-linking (`findEvidenceForClaim()`) is a conservative keyword/path
heuristic against the venture's own repo (resolved via `applications.local_path`),
**not** semantic code understanding — the chairman's honesty rule (FR-4):
could-not-verify != built. Ambiguous matches fail toward `PARTIAL`/`MISSING`,
never toward `BUILT`. The repo walk builds an in-memory file index once per
venture (not once per claim) and skips symlinks/junctions entirely — both a
cycle guard and a boundary guard, so evidence is never attributed to content
outside the venture's own repo.

### Design decisions worth knowing before extending this

- **Claim-level rows are cleared and rewritten on every walk**, not merged.
  A claim's `claimRef` is index-derived (`artifactType:index:textSlice`) to
  avoid two distinct claims with a shared text prefix colliding on the upsert
  key; because the index can shift across walks (stories added/removed/
  reordered), `runArtifactWalk()` deletes an artifact type's prior claim-level
  rows before writing the current pass's set, so a claim no longer present
  never survives as an orphaned row.
- **`deviation_artifact_id` attribution** always points at the deviation
  record that actually satisfies the substantive-reason check (shared via
  `findQualifyingDeviation()`, the same predicate `computeDisposition()` uses),
  never blindly the chronologically-first record.
- Two full adversarial `/ship` review rounds were run on this module before
  merge; see `tests/integration/eva/post-build-verdict-engine-realdb.test.js`
  for the regression tests each finding produced (grain safety, stale
  is_current filtering, claim-ref collision, deviation misattribution, and a
  snapshot/restore pattern around the one test that exercises the real
  MarketLens venture — that table has zero consumers today, but is treated as
  production-adjacent because Child C will read it as authoritative input).

## Consumers (future children of the orchestrator)

- **Child C** (scoring + convergence loop) reads the `post_build_adherence_v1`
  row from `adherence_rubrics` to score `post_build_verdicts` rows, and owns
  reason-quality judgment for deviation records.
- **Child D** (gate wiring) fires the whole chain at the S19→S20 boundary.

## See also

- `SD-LEO-INFRA-POST-BUILD-ARTIFACT-001` — parent orchestrator
- `docs/reference/schema/engineer/tables/leo_scoring_rubrics.md`
- `docs/reference/schema/engineer/tables/leo_vetting_rubrics.md`
