# eva_stage_gate_results / eva_stage_gate_attempts — reader & writer census

SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001 (T-minus P1, FR-8). Snapshot as of 2026-08-23, before this
SD's `eva_stage_gate_attempts` migration is chairman-applied.

Purpose: name every known consumer of both tables, so a follow-up SD migrating existing readers
onto the new evidence layer (out of scope for this SD — see PRD FR-7) starts from a complete,
cited list instead of rediscovering it. Compiled from LEAD-phase Explore + risk-agent (row
`c73332a0`) + validation-agent (row `8bb1f901`) + a prospective TESTING pass (row `6e4ca29e`).

## `eva_stage_gate_results` (existing table, untouched by this SD)

| Consumer | File:line | Kind | Notes |
|---|---|---|---|
| `recordGateResult` | `lib/eva/artifact-persistence-service.js:335` | writer (UPSERT) | Unique key `(venture_id,stage_number,gate_type)`; every re-evaluation overwrites the prior row with no observable trace. |
| `recordGateOverride` | `lib/eva/artifact-persistence-service.js:471` (post-FR-7 line shift) | writer (UPDATE) | Merges an `override` object into `gate_criteria`; production-reachable from `stage-execution-worker.js:852`. |
| `checkGateDebt` | `lib/eva/artifact-persistence-service.js:615` (post-FR-7 line shift) | reader | No dedupe on re-evaluation — a stale failed attempt can read as still-failing after a later pass. |
| `v_venture_gate_debt` | DB view | reader | Own `COMMENT` states the upsert-overwrite assumption verbatim; propagates to `v_venture_state_canonical` and the chairman surface. |
| `v_venture_state_canonical` | DB view | reader (indirect, via `v_venture_gate_debt`) | Chairman-facing. |
| `lib/eva/launch-workflow/index.js` (`getLaunchStatus`, `getChecklist`, `getTimeline`) | `:44`, `:96`, `:136` | reader | Fixed in this SD's FR-1 (was selecting nonexistent columns). |
| `lib/eva/operations/domain-handler.js` | `:64` | reader | 6-hourly ops metrics. |
| `lib/adam/briefings/platform.js` | `:45` | reader | |
| `lib/eva/gate-bars.js` | `:47`, `:219` | reader | Consumes the row shape *inside* `recordGateResult`'s own write path (evidence-existence bars). |
| `lib/eva/gate-enforcement.js` | `:66` | reader (`classifyGateRow`) | Classifies blocking vs. advisory for `checkGateDebt`. |
| `scripts/audit/normative-signal-audit.mjs` | `:45` | reader | |

### Hand-maintained enumerations that would silently omit a NEW table

These do not read `eva_stage_gate_results` directly, but name it explicitly and would need a
parallel entry added for `eva_stage_gate_attempts` if that table is ever brought under the same
governance:

| Enumeration | File | What it does |
|---|---|---|
| `master_reset_portfolio` RPC's phase-4 DELETE list | 5 migration copies | Portfolio-reset data wipe; explicit table list. |
| `fk-registry.cjs` | `:39` | FK registry used by tooling that assumes it's complete. |
| `.husky/pre-commit` | `:373` | Matches literal table names; only checks `.insert`/`.upsert` calls — blind to `.update()`. |
| Anon-TRUNCATE-revoke sweep enumeration | `database/chairman-gated/anon-truncate-sweep-enumeration.json` | `eva_stage_gate_results` is one of the 760 swept relations (unapplied as of this writing). |

## `eva_stage_gate_attempts` (new table, this SD)

| Consumer | File:line | Kind | Notes |
|---|---|---|---|
| `open_eva_gate_attempt` / `finalize_eva_gate_attempt` | `database/chairman-gated/20260823_eva_stage_gate_attempts.sql` | RPC functions | Atomic allocation (`pg_advisory_xact_lock`) + the one allowed NULL→final transition. |
| `recordGateAttempt` | `lib/eva/artifact-persistence-service.js` | writer (dual-write wrapper) | Calls both RPCs; never touches `eva_stage_gate_results`. |
| `eva-orchestrator.js` gate-persist loop | `:907` area (post-edit) | writer call site | Machine-evaluated gates (`reality_gate`, `stage_gate`, etc.) — always `machine_pass`/`machine_fail`. |
| `eva-orchestrator.js` taste-gate block | `:1269` area (post-edit) | writer call site | Same outcome vocabulary. The pre-existing `details:`/`criteria:` param-name typo on this block's `recordGateResult` call (TESTING F11) is fixed ONLY on the new `recordGateAttempt` write below (`criteria: tasteGateCriteria`) -- fixing it on the `recordGateResult` call itself was reverted (TESTING F-B): `taste_gate_sN` shares `eva_stage_gate_results`' upsert key (`gate_type='exit'`) with the earlier `stage_gate` write at stages 10/13/16, so populating `gate_criteria` there would clobber that write's own evidence. See "Known limitation carried into the new table" below. |
| `stage-17-blueprint-review.js` | `:427` area (post-edit) | writer call site | Same outcome vocabulary. |
| `recordGateOverride` | `lib/eva/artifact-persistence-service.js` | writer call site (extension) | Writes a `resolved_outcome='override'` attempt alongside its existing `eva_stage_gate_results.gate_criteria` merge. |

### Explicitly NOT wired in this SD (documented gap, not a silent omission)

- **"Interrupted attempts stay NULL-visible" (PRD FR-4) is NOT achieved at ANY of the 4 current
  write call sites.** The schema and RPCs make it reachable (`open_eva_gate_attempt` genuinely
  creates a NULL-outcome row, `finalize_eva_gate_attempt` genuinely does a separate NULL→final
  UPDATE), and the migration's own `DO $verify$` block behaviourally proves both halves work — but
  every real caller (`eva-orchestrator.js`'s two call sites, `stage-17-blueprint-review.js`,
  `recordGateOverride`) calls `recordGateAttempt`, which opens and finalizes back-to-back in one
  function call, AFTER the verdict is already known. A crash DURING evaluation (before
  `recordGateAttempt` is ever reached) is never represented as an in-flight row today. What IS
  delivered: durable, attributable, immutable-once-finalized attempt history, with a genuine
  `attempt_number` per retry/re-evaluation cycle — just not the in-flight-visibility half of FR-4.
  A future SD wiring true pre-evaluation `openAttempt()` calls at the 3-4 evaluation call sites
  (not just the persist call sites) would close this (EXEC-TO-PLAN TESTING finding, row `7910c783`).
- **`chairman_decisions.context` / `venture_artifacts.metadata` stamping (PRD FR-6).** The intent
  is that an `override`/`chairman_adjudicated` attempt's `attempt_id` gets stamped onto the
  corresponding `chairman_decisions` row so a reader can join a chairman decision back to the
  exact attempt it resolved. `recordGateOverride` does not itself write `chairman_decisions` (that
  INSERT happens in a different, not-yet-located call path), so the stamping could not be wired
  without a separate investigation into where `chairman_decisions` rows for gate-override
  decisions actually originate. Follow-up SD: locate that write path and pass the `attempt_id`
  through.
- **`emergencyUnblockGate`** (`lib/eva/artifact-persistence-service.js`) is a second override-
  adjacent write path this SD did not extend — scoped out because its exact outcome semantics
  (does it always correspond to a `chairman_adjudicated` attempt, or something else?) need their
  own review before wiring a dual-write.
- **Migrating the 10 existing `eva_stage_gate_results` readers/enumerations above onto
  `eva_stage_gate_attempts`** is explicitly out of scope (PRD FR-7) — this SD's dual-write leaves
  all of them reading exactly what they read today.

### Known limitation carried into the new table (EXEC-TO-PLAN TESTING finding, row `7910c783`)

`eva_stage_gate_attempts.gate_type` reuses `eva_stage_gate_results`' collapsed vocabulary
(`entry`/`exit`/`kill`) for schema-consistency with the CHECK constraint on the sibling table.
At stages 10/13/16 (the live-enabled `TASTE_GATE_STAGES`), a `stage_gate` evaluation and a
`taste_gate_sN` evaluation both map to `gate_type='exit'` and land in the SAME
`(venture_id, stage_number, gate_type)` bucket — they get sequential `attempt_number`s, and
"authoritative = highest finalized attempt_number" therefore returns whichever of the two ran
LAST as if it were the single authoritative result for that gate_type, losing the distinction
between the two underlying checks. A follow-up should add a `source_gate_type` column (the
raw, pre-`GATE_TYPE_MAP` code-level type — `stage_gate`, `reality_gate`, `taste_gate_s17`, etc.)
and extend the unique key / advisory-lock key to include it, so each check's attempt sequence is
independent.
