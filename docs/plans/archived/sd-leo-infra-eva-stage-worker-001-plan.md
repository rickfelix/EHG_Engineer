<!-- Archived from: docs/plans/eva-vision-repair-loop-plan.md -->
<!-- SD Key: SD-LEO-INFRA-EVA-STAGE-WORKER-001 -->
<!-- Archived at: 2026-04-29T14:30:23.038Z -->

# EVA stage-worker repair loop for vision/archplan quality_checked silent failures

## Type

infrastructure

## Priority

medium

## Target Application

EHG_Engineer (`lib/eva/stage-execution-worker.js`, `lib/eva/vision-upsert.js`, `lib/eva/archplan-upsert.js`, plus DB-trigger interaction surface in `database/migrations/20260314_quality_validation_vision_docs.sql`)

## Summary

Today's session-level RCA confirmed that the BEFORE INSERT/UPDATE trigger `auto_validate_vision_quality` (function defined in `database/migrations/20260314_quality_validation_vision_docs.sql:12-99`, bound to `eva_vision_documents` as `trg_auto_validate_vision_quality`) silently overwrites caller-supplied `quality_checked=true` to `false` whenever the same UPDATE alters `content` or `sections` and the recomputed validation fails the evidence-based thresholds (≥5,000 chars content, ≥8 of 10 standard sections, ≥50 chars per section). Reproduced twice in production on the same row (`VISION-EHG-VENTURE-PIPELINE-QUALITY-LIFECYCLE-LOOP-L2-001`) and three more times in controlled BEGIN/ROLLBACK reproductions during the RCA.

The override is non-blocking today only because no consumer reads `quality_checked` directly in the LEO gate pipeline. But three enforcement triggers already DO read it: `enforce_vision_quality_on_advancement` blocks `status='active'` and `chairman_approved=true` transitions, and `enforce_sd_quality_on_advancement` blocks SD phase advancement past `LEAD_APPROVAL`. As soon as any of those enforcement paths matter operationally (chairman approvals, kill-gate transitions, future LEAD-FINAL workflows), every silently-overwritten write becomes a blocked advancement that the writer never asked for and never sees logged.

This SD wires bounded self-healing into the EVA stage worker so vision (and archplan in a follow-up SD) writes converge to quality-passing state before downstream consumers see them. Approach: post-write verification reads `quality_checked` and `quality_issues`, an attempt-capped LLM regeneration loop targets the specific `quality_issues.check` failure (content_length / section_coverage / section_content / sections_missing), a `creation_source='stub'` exemption preserves intentional Stage-1 stub seeds, and a feature flag gates rollout per venture before global enable.

PLAN-phase decision: choose between guardrail (a) — trigger respects an explicit `quality_checked=true` write when the worker has just verified content passes thresholds, gated by a session GUC mirroring the `leo.chairman_approval_bypass` pattern from `database/migrations/20260407_fix_vision_quality_bypass.sql:23,46-49`; OR (b) — worker reads `quality_checked` post-write rather than asserting it. LEAD does not lock this choice; PLAN evaluates and decides.

## Depends On

None at the SD level. No upstream LEO SD blocks this. Runtime depends on the existing trigger `auto_validate_vision_quality` and the existing `eva_vision_documents.quality_issues` JSONB shape — both stable since `20260314`.

## Success Criteria

- **AC1**: Given an EVA stage-worker write to `eva_vision_documents` with content that initially fails the trigger's threshold validation (returns `quality_checked=false`), and `LEO_VISION_REPAIR_LOOP_ENABLED=true` for the venture, the worker enters the repair loop and re-attempts up to 2 regenerations targeting the specific `quality_issues.check` value(s).

- **AC2**: ≥80% of writes that would have been silently flagged `quality_checked=false` end up `quality_checked=true` within the 2-attempt cap, measured against the diagnostic SQL baseline run during PLAN scoping (see Supporting Evidence — diagnostic query).

- **AC3**: When `creation_source='stub'` (or the equivalent `vision_creation_source` advisory-trigger seed marker), the repair loop is a no-op. Stage-1 stub seeds remain `quality_checked=false` and untouched. Test fixture covers each known seed-creation path.

- **AC4**: When the repair loop exhausts its attempt cap without reaching `quality_checked=true`, the worker logs a non-blocking warning containing the row id, vision_key, final `quality_issues`, and attempt count. The row is left as the trigger last wrote it (`quality_checked=false`, `quality_issues` populated). No exception. No retry storm.

- **AC5**: When `LEO_VISION_REPAIR_LOOP_ENABLED=false` (default), the worker's behavior is byte-identical to today's path. The flag-off branch is verified by a vitest test that runs the same fixture under both flag states and asserts no DB or log diffs other than the loop's own writes.

- **AC6**: The repair loop is idempotent — invoking it on a row that already has `quality_checked=true` is a no-op (no UPDATE issued, no LLM call, returns immediately). Verified by a vitest test that runs the loop twice on the same row and asserts the second pass touches nothing.

- **AC7**: A hard token budget cap per session (configurable, default conservative) prevents runaway LLM cost. When the cap is exceeded mid-loop, the loop exits cleanly with the same non-blocking-warning behavior as AC4. Cap value, current usage, and exit reason are logged.

- **AC8**: PLAN phase produces a written decision record selecting guardrail (a) or (b) above, with the rationale tied to the `enforce_vision_quality_on_advancement` interaction surface. If (a) is chosen, the SD includes the new GUC name in the migration plan and the `enforce_vision_quality_on_advancement` function is updated alongside (mirrors the `20260407_fix_vision_quality_bypass.sql` pattern). If (b) is chosen, the SD does NOT modify any DB function — only worker code reads back `quality_checked` and treats `false` as the loop trigger.

- **AC9**: Vitest coverage covers: (1) success on first regen, (2) success on second regen, (3) attempt-cap exhaustion + non-blocking warning, (4) stub exemption respected (5) feature-flag-off path, (6) idempotency on already-passing rows, (7) token-budget exit. Minimum 7 tests, each one targeting one AC.

## Scope

### FR1 — Post-write quality verification in stage-execution-worker.js

In `lib/eva/stage-execution-worker.js` and the upsert wrappers (`lib/eva/vision-upsert.js`, `lib/eva/archplan-upsert.js` — archplan deferred to follow-up SD per Non-Goals):
- After each successful UPSERT, SELECT `quality_checked, quality_issues, creation_source` for the affected row.
- If `quality_checked=true`: continue with current behavior (no-op).
- If `quality_checked=false` AND `creation_source='stub'`: skip the loop (AC3), log informational note, continue.
- If `quality_checked=false` AND `creation_source != 'stub'` AND feature flag enabled for venture: enter repair loop.

### FR2 — Bounded LLM regeneration loop

New module `lib/eva/vision-repair-loop.js`:
- `repairVision({ rowId, visionKey, qualityIssues, attemptCap=2, tokenBudget })` — orchestrates the loop.
- Reads `quality_issues` JSONB array; each issue has shape `{check, message, ...}`. The `check` value is one of `content_length`, `section_coverage`, `section_content`, `sections_missing` (per `database/migrations/20260314_quality_validation_vision_docs.sql:50-91`).
- Routes to per-check repair prompt: `content_length` → expand prompt with target length, `section_coverage` → fill named missing keys from the standard 10, `section_content` → expand stub sections to ≥50 chars, `sections_missing` → generate full sections JSONB.
- Single LLM call per attempt (don't pipeline regen across multiple checks at once). After each attempt, re-UPSERT and re-SELECT to let the trigger re-validate.
- Loop exits on: `quality_checked=true` (success), attempt cap reached (AC4), or token budget exhausted (AC7).

### FR3 — Stub exemption and creation_source detection

In `lib/eva/vision-repair-loop.js` (or shared with FR1):
- Read `eva_vision_documents.creation_source` (and the advisory-trigger `vision_creation_source` if present) to identify intentional stub seeds.
- Treat any value indicating Stage-1 seeding as exempt. Maintain the exempt-value list in a small constants block; document the reasoning inline.
- Tests cover each known seed-creation path (vitest fixtures).

### FR4 — Feature flag and per-venture override

- New env var `LEO_VISION_REPAIR_LOOP_ENABLED` (default `false`).
- Per-venture override read from a small DB-table or `ventures.metadata.vision_repair_loop_enabled` (PLAN decides storage; either is acceptable).
- Single check at the entry of FR1's post-write verification — short-circuit before any SELECT if both global and per-venture are off.
- No partial-on states; flag is binary per venture.

### FR5 — Token-budget cap

- Configurable via env var `LEO_VISION_REPAIR_LOOP_TOKEN_BUDGET` (per session). Default: conservative cap (PLAN decides exact value based on the diagnostic-SQL row count and a per-row regen estimate).
- Track cumulative tokens used by the loop across all rows in the session. When exceeded, exit cleanly per AC7.

### FR6 — PLAN-phase guardrail decision (a) vs (b)

PLAN phase deliverable: a decision record committed alongside the PRD that selects (a) trigger-cooperation via session GUC OR (b) worker-reads-quality_checked-post-write. Decision must reference the `enforce_vision_quality_on_advancement` interaction surface. If (a), include the migration draft for the new GUC + function update. If (b), explicitly note no DB migration is in scope.

### FR7 — Vitest coverage

- `lib/eva/__tests__/vision-repair-loop.test.js` — 7+ tests mapped to AC9.
- Reuse existing fixture patterns from `lib/eva/__tests__/stage-17-doc-generation.test.js` where possible.
- Mock the LLM client; do not make real LLM calls in tests.
- One integration test that runs against a real Supabase test schema (or skipped when `SUPABASE_URL` not set) to exercise the trigger interaction end-to-end.

### FR8 — Diagnostic SQL during PLAN scoping

PLAN runs the following query against the live DB and records the count and dominant `check` values in the PRD — used to size the token budget (FR5) and validate the repair-prompt routing assumptions (FR2):

```sql
SELECT count(*), issue->>'check' AS check
FROM eva_vision_documents v,
     jsonb_array_elements(v.quality_issues) AS issue
WHERE quality_checked = false
GROUP BY 2
ORDER BY 1 DESC;
```

Result is included in the PRD's `evidence` section.

## Non-Goals

- NOT implementing the parallel `eva_architecture_plans` repair loop in this SD. Same trigger pattern exists for archplans (`enforce_archplan_quality_on_advancement` from `database/migrations/20260314_quality_checked_enforcement_triggers.sql:60-87`), but EXEC starts with vision documents only. A follow-up SD picks up archplans once the vision pattern proves out.

- NOT changing the trigger's validation thresholds (5,000 chars content, 8 of 10 sections, 50 chars per section). Those are evidence-based per `database/migrations/20260314_quality_validation_vision_docs.sql:46-91`. Treat as fixed input.

- NOT addressing the dead-code `trg_eva_vision_quality_check` function defined in `database/migrations/20260315_vision_quality_trigger_diagnostics.sql` but never bound to any trigger (RCA finding). Cleanup is out of scope; document in retrospective if discovered to matter.

- NOT wiring `vision-scorer` to read `quality_issues` instead of recomputing. Filed as a separate Tier-2 QF after this SD lands; may become unnecessary if the repair loop converges most rows to passing.

- NOT adding a `[QUALITY-FAIL]` badge to `sd:next`. Defer until a consumer demand emerges.

- NOT mining `quality_issues` patterns in `/learn`. Defer due to high noise risk per `feedback_learn_auto_approve_noise_filter_gap`.

- NOT splitting the schema into `quality_checked_auto` / `quality_checked_manual`. Durable RCA option but high blast radius; only revisit if guardrail (a) or (b) prove insufficient.

## Key Technical Decisions

**Why bounded loop, not unbounded retry**: AC4 / AC7 cap exists because LLM regeneration is expensive and a row that has failed twice is unlikely to converge on a third attempt for the same prompt-shape. Two attempts give the loop room to handle transient generation issues without becoming a cost vector. Hard token budget is the secondary fence.

**Why feature flag default off**: this loop touches the production EVA worker path and makes LLM calls during writes. Default-on would couple shipping to LLM availability and cost. Off-by-default with per-venture dogfood enables gradual rollout and immediate disable if anomalies surface.

**Why stub exemption is mandatory, not optional**: Stage-1 seeded visions are intentionally low-quality at write time — they're stubs by design (per the existing `vision_creation_source` advisory pattern). Regenerating them would mask design intent and cost LLM tokens. The exemption is a correctness requirement, not a perf optimization.

**Why PLAN decides between (a) GUC pattern and (b) read-back**: (a) follows the existing `leo.chairman_approval_bypass` precedent and keeps the assertion in one round-trip — but adds a third bypass GUC, and the existing memory `feedback_sd_type_change_requires_governance_metadata` notes that a 4th GUC would warrant a refactor. (b) avoids GUC growth but adds a SELECT per write. The tradeoff depends on per-venture write volume, which the diagnostic SQL (FR8) reveals. LEAD declines to choose without that data.

**Why archplan deferred**: the trigger pattern is identical for archplans, so the implementation will be small, but EXEC time is finite and dogfooding on visions first reduces blast radius. If the vision pattern lands cleanly, archplan follow-up SD is mechanical (mostly path-rename).

**Why don't fix the trigger directly to "respect explicit override"**: that's the durable RCA option (recommendation #1 from the RCA), but it requires migration of the trigger function and a new GUC, OR changing the column semantics. Either is a larger blast radius than the worker-side fix. Worker-side is reversible by flag flip; trigger-side migration is harder to revert. PLAN can revisit if (b) proves inadequate.

## Supporting Evidence

- **Primary evidence (this session, 2026-04-29)**: full RCA performed via the rca-agent in this conversation. Trigger definition extracted via `pg_get_triggerdef`, RLS policies verified non-causal, and reproduction confirmed in BEGIN/ROLLBACK transactions. The single offending row sampled was `VISION-EHG-VENTURE-PIPELINE-QUALITY-LIFECYCLE-LOOP-L2-001` (id `c8d90c60-...`) with `content_len=12,359` (passes), `sections={}` (fails 0/10 standard keys), `quality_checked=false`, `quality_checked_at = updated_at`.

- **Trigger source**: `database/migrations/20260314_quality_validation_vision_docs.sql` lines 12-99. The unconditional override at line 93 (`NEW.quality_checked := passed`) is the proximate mechanism. `should_recalculate` predicate at lines 30-42 is the gate that determines when the override fires.

- **Enforcement consumers (the latent demand)**: `database/migrations/20260314_quality_checked_enforcement_triggers.sql` lines 26-53 (vision advancement), 60-87 (archplan advancement), 95-128 (SD advancement past LEAD_APPROVAL).

- **Bypass GUC precedent**: `database/migrations/20260407_fix_vision_quality_bypass.sql` lines 23, 46-49. This is the model for guardrail option (a).

- **Existing worker path**: `lib/eva/stage-execution-worker.js`, `lib/eva/vision-upsert.js` (current upsert site), `lib/eva/archplan-upsert.js` (deferred sibling).

- **Counter-example to the JSONB-key-order memory**: `reference_jsonb_key_order_not_preserved` is true at text-serialization but NOT at PG `IS DISTINCT FROM` for JSONB. Verified in this session via `UPDATE … SET sections = '{}'::text::jsonb` round-trip persisting `quality_checked=true`.

- **Diagnostic SQL** (run at PLAN scoping per FR8):
  ```sql
  SELECT count(*), issue->>'check' AS check
  FROM eva_vision_documents v, jsonb_array_elements(v.quality_issues) AS issue
  WHERE quality_checked = false GROUP BY 2 ORDER BY 1 DESC;
  ```

## Vision Alignment

Supports **VISION-EHG-VENTURE-PIPELINE-QUALITY-LIFECYCLE-LOOP-L2-001** (67% topical overlap per the vision-readiness-rubric run during this SD's creation) and **VISION-LEO-INFRA-PROTOCOL-HARDENING-L2-001** (shared LEO-infra theme — closes a silent-failure class in the EVA write path that would otherwise propagate into LEAD-FINAL gates as quiet phase-advancement blocks).

The repair loop strengthens the vision-quality lifecycle by closing the gap between "trigger judges content quality" and "writer responds to that judgment." Without this loop, the trigger's verdict is a write-only artifact: enforced by downstream advancement triggers but never acted on by the producer. With this loop, producers self-heal toward passing quality, making `quality_checked` a trustworthy gate input.

## Risks

- **Risk**: LLM regeneration cost grows unbounded if the prompt routing is wrong and content doesn't converge. **Mitigation**: AC7 token budget cap is the hard fence; AC4 attempt cap is the soft fence. Default-off feature flag gives operations room to disable globally if cost anomalies surface.

- **Risk**: Repair loop fights intentional stub seeds, masking design intent. **Mitigation**: AC3 stub exemption is non-optional. Test fixtures cover every known seed-creation path. PLAN reviews `creation_source` taxonomy against current Stage-1 worker code before EXEC.

- **Risk**: Guardrail (a) — adding a GUC — adds the third LEO bypass GUC after `leo.chairman_approval_bypass` and `leo.bypass_working_on_check`. Per memory `feedback_sd_type_change_requires_governance_metadata`, a 4th GUC warrants a refactor cliff. **Mitigation**: PLAN explicitly considers this in the (a) vs (b) decision. If (a) is chosen, document the GUC count and note the next bypass triggers refactor.

- **Risk**: Per-venture flag override storage choice (env var vs. DB column) leaks into operational complexity. **Mitigation**: PLAN selects one storage; LEAD does not pre-decide. Either choice supports rollback by flag flip.

- **Risk**: The repair loop could mask genuine cases where a human should intervene (e.g., consistent content_length failures may indicate an upstream prompt-quality regression). **Mitigation**: AC4 logs every exhaustion; PLAN surfaces a follow-up "exhaustion-rate dashboard" as an out-of-scope task that operations can act on.

- **Risk**: This SD is the first consumer of `quality_issues.check` JSONB structure as a routing key. Any future change to the trigger's check names (e.g., renaming `content_length` to `content_min`) silently breaks the repair loop's routing. **Mitigation**: FR2 includes a `default` branch in the routing that logs an unknown-check warning and falls through to a generic "expand all sections" prompt. Add an integration test that asserts the trigger's check values match the loop's routing keys.

## Estimated Scope

200-400 LOC active source — single-PR feasible at the low end, may split to two PRs if the LLM regen prompt scaffolding lands separately from the worker integration:

- `lib/eva/vision-repair-loop.js` — +120-180 LOC (FR2, FR3, FR5)
- `lib/eva/stage-execution-worker.js` — +20-30 LOC (FR1 entry point)
- `lib/eva/vision-upsert.js` — +10-15 LOC (FR1 wrapper integration)
- `lib/eva/__tests__/vision-repair-loop.test.js` — +100-150 LOC (FR7, 7+ tests)
- (option a only) `database/migrations/<date>_vision_repair_loop_guc.sql` — +30-50 LOC if PLAN selects guardrail (a)

Tier 3 per CLAUDE.md Work Item Routing — forced by `worker` and `pipeline` risk keywords regardless of LOC; `migration` keyword may apply if PLAN selects guardrail (a). Infrastructure workflow: 3 minimum handoffs, 80% gate threshold per SD type table. PLAN-PRD required.
