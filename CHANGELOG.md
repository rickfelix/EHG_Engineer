# Changelog


## Table of Contents

- [2026-06-09](#2026-06-09)
  - [Infrastructure](#infrastructure)
  - [Bugfix](#bugfix)
- [2026-06-08](#2026-06-08)
  - [Security](#security)
  - [Infrastructure](#infrastructure)
  - [Bugfix](#bugfix)
- [2026-06-06](#2026-06-06)
  - [Bugfix](#bugfix)
- [2026-01-29](#2026-01-29)
  - [Bugfix](#bugfix)
- [2026-01-26](#2026-01-26)
  - [Infrastructure](#infrastructure)
  - [Bugfix](#bugfix)
- [2026-01-23](#2026-01-23)
  - [Infrastructure](#infrastructure)
  - [Features](#features)
- [2026-01-20](#2026-01-20)
  - [Documentation](#documentation)
  - [Infrastructure](#infrastructure)
  - [Bugfixes](#bugfixes)
  - [Known Issues](#known-issues)
- [2026-01-18](#2026-01-18)
  - [Multi-Repository Architecture](#multi-repository-architecture)
  - [Quality Lifecycle System - 100% Completion](#quality-lifecycle-system---100-completion)
  - [Documentation](#documentation)
- [2026-01-02](#2026-01-02)
  - [Portfolio Glide Path Dashboard](#portfolio-glide-path-dashboard)
  - [Research Arm Pipeline](#research-arm-pipeline)
  - [Venture Scoring Engine](#venture-scoring-engine)
  - [Scaffold Patterns](#scaffold-patterns)
- [2025-09-22](#2025-09-22)
  - [Refactoring](#refactoring)
  - [Housekeeping & CI](#housekeeping-ci)
  - [EHG_Engineering](#ehg_engineering)
  - [EHG (Venture App)](#ehg-venture-app)

## 2026-06-09

### Security
- **Internal chairman/service_role authz guards on 3 remaining SECURITY DEFINER RPCs (defense-in-depth)** - PR #4433 (SD-FDBK-INFRA-DEFENSE-DEPTH-CHAIRMAN-001)
  - **Issue**: Three `SECURITY DEFINER` RPCs — `park_venture_decision`, `log_stage_advance_override`, `reset_eva_circuit` — were `EXECUTE`-able by the `authenticated` role with no internal chairman check, so any logged-in user could invoke chairman-only operations (park a venture decision, log a Stage-20 gate override, reset an EVA circuit breaker) directly via PostgREST. Surfaced by the LEAD SECURITY assessment and explicitly deferred from the prior SD-LEO-GEN-DEFENSE-DEPTH-ADD-001 (which guarded `delete_venture` / `set_stage_override` / `set_global_auto_proceed`). The `anon` role was already revoked (20260603_03) but `authenticated` was not.
  - **Root Cause**: The defense-in-depth guard pattern (`fn_is_chairman()` + `service_role` escape) shipped for the first trio was never extended to these three same-risk-class functions.
  - **Fix**: A `CREATE OR REPLACE` migration (generated from live `pg_proc`, so the only byte-delta vs live is the guard — verified 3 ways by the DATABASE sub-agent) inserts, as the first statement after `BEGIN`: `IF NOT (public.fn_is_chairman() OR auth.role() = 'service_role') THEN <deny> END IF;`. `park_venture_decision` (RETURNS jsonb) returns its existing `{success:false, error:'insufficient_privilege', detail:'42501'}` soft-fail shape; `log_stage_advance_override` (RETURNS uuid) and `reset_eva_circuit` (RETURNS TABLE) RAISE `insufficient_privilege` (neither has an `EXCEPTION` handler to swallow it). Each function's distinct `SET search_path` (`park`=`public,auth`; others=`public`) and EXECUTE grants are preserved. The `service_role` escape preserves server-only callers (all 3 grant it EXECUTE) without weakening the boundary — the threat is a direct authenticated/anon `/rpc` call. **Verified live**: 8/8 behavioral tests pass (`tests/integration/secdef-chairman-authz-followup.test.js`) — non-chairman denied + service_role admitted per fn, guard introspection, and exclusion; net-zero via `SET LOCAL request.jwt.claims` + ROLLBACK. SECURITY 92 / DATABASE 98 / TESTING 95 evidence PASS.
  - **Scope note**: `bootstrap_venture_workflow` was **deliberately excluded** — it is called during ordinary venture creation by any authenticated user (`VentureCreationPage.tsx`, `useVentureWorkflow.ts` self-heal); a chairman guard there would regress venture creation. Its `SECURITY DEFINER` is only for RLS-bypass on a bulk INSERT. Follow-up candidates for the same internal-guard treatment (NOT covered by this SD): `advance_venture_stage`, `advance_venture_to_stage`, and `rescan_stage_20` (the latter's defense-in-depth guard was previously noted as tracked by this SD in the PR #4432 entry, but is out of this SD's 3-function scope and remains a separate follow-up).

### Infrastructure
- **Resilient symmetric Adam↔coordinator advisory channel — actioned_at re-surface gate, replyable fire-and-forget, durable reply reader, peek/ack verbs, self-surfacing startup** - PR #4439 (SD-LEO-INFRA-RESILIENT-SYMMETRIC-ADAM-001)
  - **Issue**: The Adam→coordinator advisory lane could dead-letter. A live failure this campaign cost a chairman-poke + 3 lost coordinator replies: (1) the inbox cron auto-marked an advisory `read` on display, so a parked-cron render silently retired an *unactioned* advisory; (2) fire-and-forget `send` advisories carried no `correlation_id`, so `coordinator-reply.cjs` (which requires one) couldn't answer them — the coordinator hand-rolled an insert with a non-canonical `payload.kind`; (3) Adam's inbox drainer (`coordination-inbox.cjs`) universally skipped `coordinator_reply` rows, so with no persistent Adam-side reader, a reply arriving after a sync await timed out was lost.
  - **Root Cause**: The advisory lane had only a one-stage `read_at` ACK (delivered == retired), no `correlation_id` on sends, a worker-shaped `coordinator_reply` skip that also caught Adam, a direct (unvalidated) insert, and no startup self-surfacing — so each side had to reverse-engineer the channel. A mandatory prospective LEAD testing-agent pass (CLAUDE_LEAD.md:1567, writer/consumer + signature + selector class) caught three latent runtime defects *before* PRD authoring: correlation_id-always would have flipped `expects_reply=true` for every fire-and-forget send (PAT-WRITER-CONSUMER-ASYMMETRY), a `coordinator_reply` double-consume hazard across the sync-await/inbox/persistent-reader paths, and `insertCoordinationRow` throwing (not returning `{error}`) — baked in as acceptance criteria.
  - **Fix**: 8 FRs, no migration (additive JSONB markers). (FR-1) `printAdamInbox` re-surface gate moves `read_at IS NULL` → `payload.actioned_at IS NULL`; display still stamps `read_at`=DELIVERED but never `actioned_at`, mirroring the two-stage ACK in `lib/coordinator/adam-action-ack.cjs`. (FR-2) NEW `scripts/coordinator-ack-adam.cjs --advisory <id>` stamps `actioned_at` (the only retirement); optional `--reply` writes a `coordinator_reply` via the existing helper. (FR-3) every `send` carries `payload.correlation_id` (replyable), **decoupled** from `expects_reply` (request-mode only); `coordinator-reply.cjs --advisory` auto-resolves the Adam target + correlation_id. (FR-4) `coordination-inbox.cjs` no longer skips `coordinator_reply` for an Adam session (`&& !amAdam`); `adam-advisory.cjs` gains a durable `replies` reader with read_at-NULL single-consume de-dup; workers byte-unchanged. (FR-5) NEW `scripts/read-adam-advisories.cjs` read-only peek (stamps nothing). (FR-6) advisory INSERT routes through `lib/coordinator/dispatch.cjs insertCoordinationRow` (stale UUID → `DISPATCH_TARGET_UNKNOWN`, clean error, `broadcast-coordinator` sentinel preserved). (FR-7) self-surfacing on BOTH startups (`coordinator-startup-check.mjs renderAdamLane` + `adam-register.cjs` mirror) + canonical doc `docs/protocol/coordinator-adam-comms.md` + `coordinator.md`/`adam.md`/`CLAUDE_ADAM.md` pointers. Shared selector helper `lib/coordinator/adam-advisory-store.cjs`. **Verified**: 24 unit + 51 regression tests pass; 12 net-zero live-DB smoke assertions (FR-1 gate, FR-2 stamp+JSONB-merge, FR-6 sentinel/INVALID/UNKNOWN) pass. VALIDATION (is_duplicate=false, 8/8 FR premises TRUE) / TESTING-prospective / TESTING-EXEC (64 tests, PASS) evidence rows recorded; handoff scores 95/98/92/97/99.
- **Hardened LEO PLAN-TO-LEAD gate reliability — GATE4_WORKFLOW_ROI determinism + story_test_mappings query fix** - PR #4410 (SD-LEO-INFRA-HARDEN-LEO-HANDOFF-001)
  - **Issue**: Two PLAN-TO-LEAD handoff-gate bugs Alpha verified live while shipping SD-LEO-GEN-ENABLE-RLS-SERVICE-001 (PR #4401). (1) `GATE4_WORKFLOW_ROI` was non-deterministic: PRECHECK reported PASS (~89%, threshold 70%) but EXECUTE consistently FAILED (~69%) for the SAME SD (reproduced 4×), flaky-blocking validated work (SECURITY 97 / TESTING 95 / retro 89). (2) `acceptance-criteria-validation` scored the 70 "no test mapping" default for every user story regardless of real coverage.
  - **Root Cause**: (1) gate3 (PLAN-TO-LEAD Traceability) is computed fresh during the in-flight handoff and only persisted once that handoff is ACCEPTED. The executor wrapper passed it via ctx (`gateDataSources.gate3='direct'`) but the validator-registry/preloader path did not, and the canonical self-fetch only finds gate3 on an already-accepted PLAN-TO-LEAD (absent on first execute) → `gate3='none'` → `_estimated=true` → the same SD scored ~89 via one path and ~69 via the other. (2) The gate queried `story_test_mappings` by a non-existent `story_id` column — the real FK is `user_story_id` — so the IN-filter always returned zero rows and every validated story collapsed to the default.
  - **Fix**: (1) `validateGate4LeadFinal` (`scripts/modules/workflow-roi-validation.js`) computes gate3 fresh via a dynamic import of `validateGate3PlanToLead` when it is unresolved, so PRECHECK and EXECUTE score identically. It can only RAISE an under-scored result (never invents a pass — a genuinely-failing traceability still returns a low gate3) and there is no recursion (`traceability-validation` does not import this module). (2) `acceptance-criteria-validation.js` queries `story_test_mappings` by the real `user_story_id` FK (confirmed against the live schema: columns are `id, user_story_id, test_result_id, …`; `story_id` does not exist). +6 regression tests (`tests/unit/harden-leo-handoff-gate.test.js`), all passing; both premises verified live before the verifying session drove the handoffs.

### Bugfix
- **Coordinator/sweep CLAIM_FIX no longer re-affirms orchestrator parents or dep-blocked SDs onto workers** - PR #4445 (SD-LEO-FIX-COORDINATOR-SWEEP-CLAIMED-001)
  - **Issue**: The fleet has two claim-dispatch paths — worker-PULL (`worker-checkin.cjs` self_claim) and coordinator/sweep-PUSH (`stale-session-sweep.cjs` CLAIM_FIX). The self_claim path refuses to dispatch orchestrator **parents** and dep-blocked SDs (SD-FDBK-FIX-WORKER-SELF-CLAIM-001), but CLAIM_FIX's "fix broken claim" re-assert did not — so a session whose stale `sd_key` pointed at an orchestrator parent got its claim re-affirmed and the parent routed to a worker. Observed live: the sweep routed orchestrator parent `SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001` to a worker (parents auto-complete on their children and are never worker-buildable).
  - **Root Cause**: A PAT-WRITER-CONSUMER-ASYMMETRY — the orchestrator-parent + dep-blocked guard lived only in the self_claim path's local predicate, never mirrored onto the sweep's CLAIM_FIX re-assert.
  - **Fix**: Extracted the guard into a single shared module `lib/fleet/claim-eligibility.cjs` (`draftDepsSatisfied` with a `throwOnError` option, `evaluateDispatchEligibility` → `{eligible,reason}` that THROWS on a query error, and a boolean `baselinedCandidateEligible` false-on-error wrapper). `worker-checkin.cjs` now imports it (behavior-preserving; `module.exports` surface unchanged — 57-test suite green). `stale-session-sweep.cjs` CLAIM_FIX gates the re-assert with a **tri-state**: confirmed-ineligible (orchestrator / dep-blocked / not-found) → bilateral clear of the stale `sd_key` (`released_reason='SWEEP_SD_INELIGIBLE_CLAIM_FIX'`, mirroring the existing terminal-status path); **query error → no-op this cycle** (never clears a legit claim on a transient error); eligible → existing re-assert. Code-only, no migration. 90/90 unit tests pass (18 new for the shared predicate); TESTING sub-agent PASS (92), net-zero (mocked client).
- **claim_sd RPC optimistically claimed terminal-status SDs/QFs, stomping claiming_session_id** - PR #4438 (SD-LEO-FIX-CLAIM-RPC-TERMINAL-001)
  - **Issue**: The fleet-critical `claim_sd` RPC had no terminal-status guard. A stale `WORK_ASSIGNMENT` pointing at an SD that reached a terminal status mid-flight (e.g. `SD-LEO-INFRA-HARDEN-LEO-HANDOFF-001` after it COMPLETED) was claimed anyway — `claim_sd` returned `{success:true}` and stomped `claiming_session_id`/`active_session_id`/`is_working_on`, then re-fired every worker tick. The predecessor `SD-FDBK-FIX-CLAIM-RPC-VALIDATE-001` had added only the `sd_not_found` existence guard; terminal lifecycle state was orthogonal and uncovered.
  - **Root Cause**: `claim_sd` never read `strategic_directives_v2.status` (its `FOR UPDATE` SELECT fetched only `claiming_session_id`/`parent_sd_id`) nor `quick_fixes.status`. Trigger 393 (`enforce_no_claim_on_cancelled_sd`) covered only `cancelled`, and only via a raw P0001 (claim_sd has no `EXCEPTION` handler around its UPDATE) — `completed`/`deferred` SDs and all terminal QFs fell straight through to an optimistic claim. PAT-OPTIMISTIC-RPC residual.
  - **Fix**: Three-layer defense. (1) A `CREATE OR REPLACE claim_sd` migration (`20260609_claim_sd_terminal_status_guard.sql`, generated CRLF-safe from the authoritative `20260608` migration so the entire body is carried verbatim, signature + EXECUTE grants preserved) fetches `sd.status` in the `FOR UPDATE` SELECT and, after the `sd_not_found` guard, returns `{success:false, error:'sd_terminal_status', status}` **before any UPDATE** for SD terminal `{completed,cancelled,deferred}` and QF terminal `{completed,cancelled,escalated}` (`escalated` = one-way promotion to an SD) — pre-empting trigger 393's P0001 with clean JSON and covering `completed`/`deferred`. (2) `lib/claim-guard.mjs` (a co-equal consumer that bypasses the RPC banner) gains a pre-acquire refusal for `completed`/`deferred` (→ `sd_terminal_status`, FAIL-OPEN; `cancelled` path unchanged) and a `formatClaimFailure` terminal banner so a terminal refusal is not mislabeled "claimed by another session". (3) `scripts/worker-checkin.cjs` purges a stale `WORK_ASSIGNMENT` whose target SD went terminal (ACK + fall through) instead of re-firing it every tick. **Verified live**: DATABASE sub-agent confirmed the deployed `pg_proc.prosrc` is byte-identical to the migration, EXECUTE grants preserved, and a before-probe reproduced the original stomping bug; 6/6 live-DB regression + 10 unit tests pass (16 total). The prospective LEAD testing-agent caught the `claim-guard.mjs` co-equal-consumer banner gap (PAT-WRITER-CONSUMER-ASYMMETRY) before PRD authoring. SECURITY/DATABASE 97 / TESTING 95 evidence PASS; handoff scores LEAD-TO-PLAN 95 / PLAN-TO-EXEC 93 / EXEC-TO-PLAN 98 / PLAN-TO-LEAD 98 / LEAD-FINAL 96. Follow-up: PAT-OPTIMISTIC-RPC sweep of `release_sd`/other assignment RPCs for the same class.
- **Stage 20 rescan button returned Postgres 42501 in the EHG Chairman Dashboard** - PR #4432 (SD-LEO-FIX-GRANT-EXECUTE-RESCAN-001)
  - **Issue**: The Chairman Dashboard Stage 20 "rescan" button (`ehg/src` `ReplitStatusPanel.tsx:66`, `Stage20BuildExecution.tsx:396`) calls the `SECURITY DEFINER` RPC `public.rescan_stage_20(uuid)` as the logged-in `authenticated` role and returned Postgres 42501 (permission denied for function), so chairmen could not refresh/advance Stage 20.
  - **Root Cause**: Verified live before building — `rescan_stage_20` had `proacl {postgres=X, service_role=X}`: a prior PUBLIC-revoke security sweep never re-granted `authenticated`. `service_role`-only callers (`scripts/rescan-stage20.js`, which uses the service key) kept working, hiding the gap from backend tooling. Same bug class as SD-LEO-FIX-AUDIT-RESTORE-EXECUTE-001 (restored 18 RPCs), which simply missed this one function.
  - **Fix**: Forward migration `GRANT EXECUTE ON FUNCTION public.rescan_stage_20(uuid) TO authenticated` (overload-safe `DO` block over `pg_proc::regprocedure`, idempotent, aborts if 0 matched), applied to prod via `apply-migration.js --prod-deploy`. **`anon` is deliberately NOT granted** — the function mutates ventures / venture_stage_work / strategic_directives_v2 / chairman_decisions and auto-advances Stage 20→21, so it stays logged-in-only; authenticated-only is tighter than the pre-sweep PUBLIC baseline. Paired rollback migration (REVOKE, dry-run validated). The recurrence guard `scripts/audit-rpc-execute-grants.mjs` gained `rescan_stage_20` in its `FALLBACK_RPCS` list — the exact omission that let CI miss this (the guard falls back to that list when `ehg/src` isn't checked out); it now covers the function (24 RPCs). **Verified live**: proacl now `{postgres, service_role, authenticated}`; `has_function_privilege('authenticated', …)`=true, `('anon', …)`=false; `SET ROLE authenticated` call returns the early-return JSON with no 42501 (no mutation). SECURITY 92 / DATABASE 98 / TESTING 97 evidence PASS. Defense-in-depth internal `fn_is_chairman()` guard on `rescan_stage_20` deferred to a follow-up (tracked by SD-FDBK-INFRA-DEFENSE-DEPTH-CHAIRMAN-001).

## 2026-06-08

### Security
- **Closed public anon-key read exposure on `companies` (Phase 1)** - PR #4421 (SD-LEO-GEN-SCOPE-ANON-KEY-001)
  - **Issue**: `public.companies` carried a `FOR SELECT TO anon USING (true)` RLS policy. Because the Supabase anon key ships in the EHG app's browser bundle, anyone holding that key could read all ~1,303 company rows directly via PostgREST — a public data-exposure on a governance table.
  - **Fix**: Migration drops the anon-role public SELECT policy on `companies` (idempotent `DROP POLICY IF EXISTS`, reversible). Verified safe before applying: the EHG app reads `companies` only inside `ProtectedRoute` (authenticated JWT → role=authenticated), and EHG_Engineer reads via the service-role client (bypasses RLS) — so no live anon-role reader exists and no EHG-app change is required. Applied to prod via the 3-factor `apply-migration` guard (flag + single-use token + `@approved-by` matching git identity) under chairman approval relayed by the coordinator. **Verified live: anon `companies` SELECT 1,303 → 0 rows; service-role still 1,303.**
  - **Out of scope (Phase 2, follow-up SD)**: the `strategic_directives_v2` anon policy is intentionally retained — the LEO Realtime dashboard (`src/services/realtime-dashboard.js`) still subscribes via the anon key and Realtime `postgres_changes` delivery requires the subscribing role to hold RLS SELECT. Dropping it before that consumer is migrated would silently stop change events (the policy already churned 3× for this reason). Deferred to a separate SD gated on the dashboard migration + canary.

### Infrastructure
- **Internal chairman authorization guards on privileged SECURITY DEFINER functions (closes a live authz hole)** - PR #4427 (SD-LEO-GEN-DEFENSE-DEPTH-ADD-001)
  - **Issue**: `delete_venture`, `set_stage_override`, and `set_global_auto_proceed` are `SECURITY DEFINER` and were still EXECUTE-able by `authenticated` (the SD's filed premise that `20260603_03` revoked it was wrong — only `anon` was revoked). `delete_venture` had no internal authz check and the two setters guarded only on "is authenticated", so any logged-in non-chairman could hard-delete any venture or mutate `chairman_dashboard_config` via the ehg browser client.
  - **Root Cause**: `delete_venture` received the cascade logic from SD-LEO-FEAT-CHAIRMAN-VENTURE-DELETE-001 but missed the `fn_is_chairman()` guard its sibling `kill_venture` got; the two setters proved only authenticated, not chairman; and the grant-layer revoke covered `anon` only.
  - **Fix**: Function-only `CREATE OR REPLACE` adding internal guards that mirror `kill_venture` — `delete_venture`: reject unless `fn_is_chairman() OR auth.role()='service_role'` (returns its standard `{success:false}` shape because its `EXCEPTION WHEN OTHERS` would swallow a RAISE); the two setters: `RAISE insufficient_privilege` unless `fn_is_chairman()`. Inside a `SECURITY DEFINER` function only `auth.role()` reflects the caller (`current_user`→owner, `session_user`→authenticator), so the service-role escape uses `auth.role()`. EXECUTE grants are intentionally unchanged (revoking `authenticated` would break the chairman UI; the internal guard is the fix); each function's exact `search_path` is preserved; reversible down migration. Applied live + verified; 6/6 HAS_REAL_DB net-zero behavioral tests; SECURITY+DATABASE+TESTING evidence PASS. Four additional same-class unguarded functions (`park_venture_decision`, `bootstrap_venture_workflow`, `log_stage_advance_override`, `reset_eva_circuit`) deferred to a follow-up.
- **CROSS_REPO_STAGE_CONFIG_DRIFT gate no longer false-positive-BLOCKs audit-trigger-only migrations** - PR #4420 (SD-FDBK-ENH-CROSS-REPO-STAGE-001)
  - **Issue**: The gate's `isStageConfigRelevant()` marked any migration whose body matched `/venture_stages/i` as stage-config-relevant. A `CREATE OR REPLACE` of the `venture_stages_audit` trigger function cannot change the generated `ehg/src/config/venture-workflow.ts`, yet it was treated as relevant and BLOCKed on unrelated pre-existing drift — forcing a documented `--bypass-validation` on SD-FDBK-FIX-GOVERNANCE-GAP-VENTURE-001.
  - **Root Cause**: The blanket `/venture_stages/i` substring match also matched the audit identifiers `venture_stages_audit` and `fn_venture_stages_audit_trigger`, and made no distinction between genuine stage-config mutations and trigger/function/comment DDL.
  - **Fix**: New pure `classifyMigrationBody(body)` → `config | audit_only | ambiguous | none`. `config` (INSERT/UPDATE/DELETE/ALTER/CREATE/DROP/TRUNCATE on the **bare** `venture_stages` table) → relevant; `audit_only` (references only inside `CREATE TRIGGER` / dollar-quoted function bodies / `COMMENT`) → not relevant; `ambiguous` (bare reference in an unrecognized shape) → relevant + WARN (fail-safe — never a false-negative on real drift). Word-boundary `\bventure_stages\b` excludes the audit substrings, and the config-mutation scan runs on the full body before dollar-quoted bodies are stripped, so an in-function stage mutation is still caught. `decideVerdict` and the gate's outward contract are unchanged. +15 unit tests (35 pass) plus a testing-agent adversarial pass (17 edge cases) confirming the no-false-negative invariant. Dogfooded: this SD's own PLAN-TO-LEAD run passed the modified gate.
- **Fixed the root cause of the dead worker self_claim queue (`v_sd_next_candidates` returned ~0 rows fleet-wide)** - PR #4413 + #4415 (SD-LEO-INFRA-FIX-NEXT-CANDIDATES-001)
  - **Issue**: The view that drives worker `/checkin` self_claim, `sd:next`, and coordinator dispatch returned ~0 workable rows fleet-wide; the queue only functioned because the `sd-baseline add-item` workaround (#4383) hand-injected `sd_key`-shaped rows. That workaround explicitly deferred the durable fix to this SD.
  - **Root Cause**: Three coupled defects. (1) The `fn_sync_sd_to_baseline` trigger wrote `sd_baseline_items.sd_id = NEW.id` (a UUID) while the view JOINs `bi.sd_id = sd.sd_key` (TEXT) — no FK, so every trigger-synced row silently failed the JOIN. (2) The view's `deps_satisfied` ran `split_part` over the jsonb text of each element, mis-evaluating object-shaped dependency snapshots (`{sd_key|sd_id|orchestrator}`), which are the fleet majority (1595 vs 581 string). (3) `scripts/sd-baseline.js` had a `|| sd.id` UUID fallback (3 sites) that re-introduced UUID rows, and `calculateDependencyHealthScore` had the same object-shape resolution bug.
  - **Fix**: Migration rewrites the trigger to write/match `NEW.sd_key`; rewrites `deps_satisfied` to resolve string + object + null shapes via a shared resolver (`lib/sd-baseline/deps-resolve.js`) with fail-open semantics for none/unresolvable/prose refs; removes the `|| sd.id` fallback with `sd_key` guards and wires the resolver into `calculateDependencyHealthScore`. A reversible, advisory-locked reconciliation snapshots affected active-baseline rows to `sd_baseline_items_recon_backup` then dedup-then-converts the 41 resolvable UUID rows to `sd_key` (DELETE 14 colliders, UPDATE 27 survivors); idempotent, with a migration-down. Mass purge of ~5900 test-pollution/orphan rows descoped to a follow-up. **Verified live: the queue went 0 → 7 workable rows.** 42/42 tests pass (10 deps-resolver unit + 6 live-DB behavioral + 26 add-item regression).
- **Coordinators can make a sourced SD self-claimable without a rebaseline** - PR #4383 (SD-FDBK-INFRA-FLOW-IMPEDIMENT-COORDINATOR-001)
  - **Issue**: `v_sd_next_candidates` (the self-claim queue read by worker `/checkin` step 6, `sd:next`, and coordinator dispatch) is driven only by the singleton active execution baseline. Both populate paths filter on non-null `sequence_rank`, so a freshly-sourced draft never entered the baseline — a coordinator doing conveyor-belt sourcing couldn't make it a first-class candidate without a full LEAD-approval-gated rebaseline.
  - **Fix**: Add `npm run sd:baseline:add-item <sd_key> [--track] [--rank]` (and the `add-item` subcommand on `scripts/sd-baseline.js`) that APPENDS one SD to the active baseline's `sd_baseline_items` — incremental, no rebaseline, no LEAD gate. The SD then surfaces in `v_sd_next_candidates` at `readiness_priority 3` and is self-claimable. Writes `sd_id = sd.sd_key` (the view JOIN key, never the UUID); idempotent on re-add; bounded retry on `sequence_rank` collisions. Pure helpers extracted to `lib/sd-baseline/build-item.js`; 26 network-free unit tests; live activation chain verified then cleaned up net-zero. No schema/view/worker-checkin change.
- **GEN-class auto-generated SDs were doomed on a second content-based gate** - PR #4409 (SD-LEO-INFRA-FIX-GEN-CLASS-001)
  - **Issue**: Auto-generated SDs (`metadata.auto_generated=true`, e.g. `audit-to-sd.mjs`) have no venture-vision content, so the content-based gate family blocked them. `GATE_VISION_SCORE` already exempts `auto_generated` (`vision-score.js:377`), but `GATE4_WORKFLOW_ROI`'s gate2-skip list covers `infrastructure/documentation/fix/corrective` and **not** `security/governance` — so a security/governance-type GEN SD cleared vision then scored **0** at GATE4.
  - **Root Cause**: The auto-generated exemption was applied to the vision gate but never mirrored onto the workflow-ROI gate.
  - **Fix**: An early-return `auto_generated` exemption in `validateGate4LeadFinal` (`scripts/modules/workflow-roi-validation.js`), scoped to the GEN-class signal (normal SDs still scored), mirroring the existing vision-gate exemption. A systemic policy carve-out (same pattern as the corrective/orchestrator/auto_generated vision exempts), not a `--bypass`. `GATE_VISION_SCORE` unchanged. +3 tests; existing workflow-roi suite green.

### Bugfix
- **complete-quick-fix hung for autonomous fleet workers** - PR #4377 (SD-FDBK-FIX-COMPLETE-QUICK-FIX-001)
  - **Issue**: `scripts/complete-quick-fix.js` blocked indefinitely when invoked by autonomous `/loop` fleet workers or CI — three operator prompts (compliance-loop auto-refinement, `validateLOC` over-cap escalate) were guarded only for `--force-complete`, and the shared `prompt()` helper had no fail-fast path when stdin reached EOF with no answer.
  - **Root Cause**: Under the Bash tool / cron / CI, `process.stdin.isTTY` is `undefined` (not `false`), so readline reached EOF with the answer callback never firing while supabase/heartbeat timers kept the event loop alive — an indefinite hang. The two flag-guarded prompts were a writer/consumer asymmetry (`--force-complete` guarded, `--non-interactive` sibling missed; PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY).
  - **Fix**: `cli.js` `prompt()` now rejects fast on the readline `'close'` event when unanswered (an `answered` guard), so a forgotten `--non-interactive` fails loud instead of hanging; piped input still resolves. `compliance-loop.js` refinement guard widened to `(forceComplete || nonInteractive)`; `verification.js` `validateLOC` returns false (fail-loud) under `--non-interactive`; `orchestrator.js` threads `nonInteractive` into both call sites so the guards aren't dead code. +4 regression tests; 214/214 complete-quick-fix tests pass (20 files), 0 regressions.
- **Worker self_claim grabbed orchestrator parents and dependency-blocked SDs** - PR #4391 (SD-FDBK-FIX-WORKER-SELF-CLAIM-001)
  - **Issue**: `worker-checkin.cjs` step-6 self_claim iterated `v_sd_next_candidates` and called `claim_sd` without filtering on `deps_satisfied` or `sd_type`, so a worker self-claimed a dependency-blocked child (its dependency was an in-flight SD on the same `venture_stages` write-surface → collision) and another self-claimed an orchestrator PARENT (which auto-completes on its children and must never be worker-claimed).
  - **Root Cause**: The view surfaces `deps_satisfied=false` rows (its `deps_satisfied` is broken for object-shaped deps — it text-compares the whole JSON object) and orchestrator parents, and `claim_sd` enforces neither (advisory-only). The sibling un-baselined-draft tier (step 6.25) already had the guard; the baselined tier (step 6) did not (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY).
  - **Fix**: New `baselinedCandidateEligible(sb, sdKey)` re-checks `sd_type` + `dependencies` against `strategic_directives_v2` (reusing `draftDepsSatisfied`, since the view's `deps_satisfied` can't be trusted) and the step-6 loop skips orchestrator parents and dep-blocked SDs before `tryClaim`. Conservative: any uncertainty skips the candidate. Complements SD-FDBK-INFRA-DEPENDENCY-BLOCKS-ADVISORY-001 (claim-time enforcement) as the sourcing-time filter. +7 tests; 51/51 worker-checkin tests pass.
- **Chairman gate_label changes left no audit trail** - PR #4396 (SD-FDBK-FIX-GOVERNANCE-GAP-VENTURE-001)
  - **Issue**: The `venture_stages_audit` trigger (`fn_venture_stages_audit_trigger`) audited every business column of `venture_stages` except `gate_label` — a chairman-gate-control column set by the S21 creative_handoff / S22 spend_approval gate work (those migrations UPDATE `review_mode` AND `gate_label` together). `gate_type` and `review_mode` were already audited, so chairman gate-label decisions were silently unaudited.
  - **Root Cause**: `gate_label` was added after the audit trigger was authored and was never added to its per-column change checks.
  - **Fix**: Function-only idempotent migration (`CREATE OR REPLACE fn_venture_stages_audit_trigger` with the existing 16-column body plus a per-column `gate_label IS DISTINCT FROM` check). No schema change (`old_value`/`new_value` are already TEXT) and no trigger re-creation. Applied live (MIGRATION_APPLY_PROD_PASS) and verified behaviorally (a stage-17 `gate_label` change now writes a `venture_stages_audit` row); +1 CI-gated live-DB regression test.
- **EHG app stage config stale after the stage 21↔22 swap** (cross-repo: ehg PR #691) - SD-FDBK-FIX-FOLLOW-001-CLOSE-002
  - **Issue**: The EHG_Engineer `venture_stages` SSOT was resequenced (stage 21 = Distribution Setup, stage 22 = Visual Assets) and the migrations merged, but the generated EHG-app file `ehg/src/config/venture-workflow.ts` on ehg `main` was still pre-swap — a cross-repo config drift. (0 ventures at stage 21/22, so no live runtime impact.)
  - **Root Cause**: The EHG-side generated artifact was never regenerated + landed after the EHG_Engineer-side swap.
  - **Fix**: Regenerated `venture-workflow.ts` from the SSOT via `npm run venture-stages:generate` and merged ehg PR #691 to ehg main — stage 21 → Distribution Setup (`spend_approval`, review), stage 22 → Visual Assets (`creative_handoff`, review). No `.tsx` renames (componentPath remap + filename-based lazy import). Verified: `venture-stages:check` CHECK PASSED, `tsc --noEmit` clean.
- **`claim_sd` optimistically self-claimed non-existent ids** - PR #4414 (SD-FDBK-FIX-CLAIM-RPC-VALIDATE-001)
  - **Issue**: The fleet `claim_sd` RPC was optimistic — calling it with a non-existent id (e.g. `SD-FAKE-PROBE-000` or `QF-00000000-000`) returned `{success:true}` and wrote `claude_sessions.sd_key`, silently self-claiming a phantom. A typo/stale id self-claimed a non-existent SD (this caused a real stale-assignment re-claim of an already-completed SD).
  - **Root Cause**: `claim_sd` never validated that `p_sd_id` resolved to a backing row before claiming.
  - **Fix**: An existence guard at the top of `claim_sd`, reusing its own resolution keys — SDs via `IF NOT FOUND` after the existing `FOR UPDATE SELECT … WHERE sd_key = p_sd_id`, QFs via `NOT EXISTS (SELECT 1 FROM quick_fixes WHERE id = p_sd_id)` — returning `{success:false, error:'sd_not_found'}`. The full `claim_sd` body (takeover/QF/cross-table/worktree/audit logic) is preserved verbatim via `CREATE OR REPLACE`; the live deployed body was confirmed byte-identical to the migration plus only the +19 guard lines. +1 live-DB test; existing `claim-sd-cross-table` suite green (6/6).

## 2026-06-06

### Bugfix
- **Windows session-identity split** - PR #4283 (SD-FDBK-ENH-SESSION-IDENTITY-SPLIT-001)
  - **Issue**: One Claude Code conversation could create two `claude_sessions` rows (born seconds apart), inflating fleet worker counts and confusing claim ownership (canonical row's `sd_key` → NULL).
  - **Root Cause**: In the `CLAUDE_SESSION_ID`-unset window, `lib/terminal-identity.js` `getTerminalId()` adopted the newest-mtime / process-scan marker, which on a shared SSE port could be a sibling conversation's UUID.
  - **Fix**: Ancestry-verify marker/PID resolution (reuse `_scanMarkersByAncestry`/`_getAncestorPids`), never cache an unverified UUID, fall through to the per-PID unique fallback. Priority-1 (env set) unchanged. +6 unit tests; existing terminal-identity suites green.
- **Stage-20 Code Quality Gate refused to clone valid venture repos** - PR #4289 (SD-FDBK-FIX-STAGE-REPOURL-RESOLUTION-001)
  - **Issue**: Ventures with a complete build were permanently blocked at Stage-20 ("Refused to clone: repoUrl failed strict GitHub-URL validation") despite having a valid repo (live: DataDistill).
  - **Root Cause**: Two defects in `lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js` — (1) repo-URL resolution took the first *truthy* candidate, so an `owner/repo` shorthand written by `venture-provisioner.js` shadowed the valid `ventures.repo_url` fallback; (2) `isSafeRepoUrl`'s metacharacter guard used `\n\r` mistakenly written as `\\n\\r` (matching the literal characters backslash/n/r), rejecting any URL containing the letters n or r.
  - **Fix**: Add `normalizeRepoUrl()` (strict `owner/repo` → `https://github.com/owner/repo`); resolve to the first *valid* candidate (skip-invalid-and-continue); correct the regex to true newline/CR. Anti-shell-injection guard preserved (`SAFE_REPO_URL_RE` allowlist + `\s`; verified by 41 adversarial cases). +11 unit tests; 88/88 stage-20 + code-quality tests green, 0 regressions.

## 2026-01-29

### Bugfix
- **Post-Completion Validator False Positive** - PR #685
  - **Issue**: Stop hook post-completion validator blocking AUTO-PROCEED with "Missing SHIP" even when PR merged
  - **Root Cause**: SD query missing `completion_date` field, causing validator to incorrectly check git diff after branch deletion
  - **Fix**:
    - Added `completion_date` to SD select query (`scripts/hooks/stop-subagent-enforcement/index.js:178`)
    - Changed catch block to log info instead of blocking when `git diff` fails
  - **Impact**: Resolved AUTO-PROCEED blocking after SD completion, enabling continuous workflow execution
  - **Files Modified**:
    - `scripts/hooks/stop-subagent-enforcement/index.js` - Added completion_date to query
    - `scripts/hooks/stop-subagent-enforcement/post-completion-validator.js` - Fixed git diff catch block
  - **Documentation**: Updated `docs/06_deployment/stop-hook-operations.md` with troubleshooting entry
  - **Related**: SD-LEO-INFRA-HARDENING-001 (orchestrator parent)

## 2026-01-26

### Infrastructure
- **SD-LEO-INFRA-FORMALIZE-ORCHESTRATOR-WORKFLOW-001: Formalize Orchestrator SD Workflow Pattern** - PR #675
  - **Purpose**: Codify orchestrator SD workflow pattern discovered during SD-LEO-GEN-RENAME-COLUMNS-SELF-001 execution
  - **Changes**:
    - Enhanced CLAUDE_CORE.md with "Orchestrator SD Workflow Pattern" section (lines 818-948)
    - Added "Orchestrator SD Decision Guide" to CLAUDE.md with decision table and artifacts
    - Enhanced `orchestrator-preflight.js` to v2.0.0 with auto-detection, JSON output (--json), validation mode (--validate)
    - Created `docs/reference/parent-prd-derivation-guide.md` with complete PRD template and traceability mapping
    - Added `.github/workflows/orchestrator-preflight.yml` CI enforcement for orchestrator compliance
  - **Key Features**:
    - Three detection methods: explicit metadata, database children, heuristic content analysis
    - Artifact validation: children exist, parent PRD derivation, status checks, protocol references
    - JSON mode for programmatic integration, validation mode for CI/CD gates
  - **Impact**: Orchestrator SDs now have formal workflow documentation, automated preflight validation, and CI enforcement
  - **Files Modified**: 5 files, +826/-34 lines
  - **Pattern Origin**: SD-LEO-GEN-RENAME-COLUMNS-SELF-001

- **SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-002: Remove legacy_id Column References** - PR #673
  - **Root Cause**: Code still referencing `legacy_id` column after it was dropped from `strategic_directives_v2` table on 2026-01-24
  - **Patterns Resolved**:
    - PAT-EXECSQL-001: exec_sql function missing (verified migration already applied)
    - PAT-LEGACYID-001: legacy_id column references in active code
  - **Fix**: Updated 7 files to use `sd_key` instead of `legacy_id`:
    - `lib/sub-agents/github.js` - SD lookup for CI validation
    - `lib/sub-agents/testing/index.js` - SD type check for non-UI tests
    - `lib/sub-agents/retro/db-operations.js` - Retrospective SD lookup
    - `lib/sub-agents/retro/action-items.js` - SD key fallback chain
    - `lib/sub-agents/retro/generators.js` - SD key fallback chain
    - `lib/templates/prd-template.js` - PRD ID generation and metadata
    - `lib/utils/sd-type-guard.js` - SD audit and update functions
  - **Database Cleanup**: Verified migrations already applied, no further database changes needed
  - **Impact**: Prevents runtime errors from referencing dropped columns, improves code correctness
  - **Source**: Auto-created by `/learn` command based on retrospective patterns

### Bugfix
- **SD-LEO-FIX-PARENT-BLOCK-001: Fix Parent SD Metadata Synchronization** - PR #669
  - **Root Cause**: Database trigger only set `sd_type='orchestrator'` but NOT `metadata.is_parent=true`, causing OrchestratorCompletionGuardian to fail silently
  - **Fix**: Updated trigger to set BOTH flags atomically when parent_sd_id is assigned
  - **Backfill**: Migrated 6 existing parent SDs missing `is_parent` flag:
    - SD-INDUSTRIAL-2025-001, SD-LEO-REFACTOR-LARGE-FILES-001/002, SD-NAV-CMD-001, SD-STAGE-ARCH-001, SD-UNIFIED-PATH-2.1
  - **Guardian Logic**: Implemented triple-check parent detection (sd_type OR is_parent OR has_children) with improved error propagation
  - **Files Modified**:
    - `database/migrations/20260126_fix_parent_sd_metadata.sql` - Trigger fix and backfill
    - `scripts/modules/orchestrator-completion-guardian.js` - Robust detection logic
    - `scripts/modules/handoff/orchestrator-completion-guardian.js` - Same robust detection
    - `scripts/modules/parent-orchestrator-handler.js` - Updated isParentOrchestrator()
  - **Impact**: Parent SDs now correctly block child SD completion when orchestrator is incomplete
  - **Testing**: TESTING sub-agent verified PASS (90% confidence), all handoffs passed (EXEC-TO-PLAN 96%, LEAD-FINAL-APPROVAL 92%)

## 2026-01-23

### Infrastructure
- **SD-AEGIS-GOVERNANCE-001: AEGIS Unified Governance System** - PRs #506, #508
  - **Complete Implementation** consolidating 7 fragmented governance frameworks into unified database-first system:
    - Database schema: `aegis_constitutions`, `aegis_rules`, `aegis_violations` tables with RLS policies
    - Core enforcement engine: `AegisEnforcer`, `AegisRuleLoader`, `AegisViolationRecorder`
    - 6 validator types: FieldCheck, Threshold, RoleForbidden, CountLimit, Custom, Base
    - 7 governance framework adapters:
      - `ConstitutionAdapter` - Protocol Constitution (9 rules)
      - `FourOathsAdapter` - Agent behavior governance
      - `DoctrineAdapter` - EXEC phase restrictions (Law 1)
      - `HardHaltAdapter` - Dead-man switch protocol
      - `ManifestoModeAdapter` - EVA manifesto enforcement
      - `CrewGovernanceAdapter` - Budget and PRD validation
      - `ComplianceAdapter` - PII, retention, audit logging
    - CLI commands: `node scripts/governance.js list|validate|violations|stats|constitutions`
    - REST API endpoints: `/api/aegis/rules`, `/api/aegis/violations`, `/api/aegis/stats`, `/api/aegis/constitutions`
    - Performance: Multi-layer caching (in-memory + 5min TTL) minimizes database queries
    - 62 passing tests across all phases
  - Impact: Runtime rule updates without code deployment, centralized audit trail, backward compatibility via adapters
  - Documentation: Complete system overview, API docs, database schema, and CLI guide in `docs/01_architecture/`, `docs/02_api/`, `docs/database/`, `docs/reference/`

- **SD-LEO-GATE0-001: Gate 0 Workflow Entry Enforcement** (Orchestrator with 6 children)
  - **Purpose**: Prevent code shipping when SDs have not properly entered the LEO Protocol workflow
  - **Root Cause Addressed**: Protocol had excellent gates ONCE in workflow, but no gate preventing work OUTSIDE the workflow
  - **6 Child SDs Completed**:
    - `SD-LEO-GATE0-PRECOMMIT-001`: Pre-commit hook for SD phase validation
    - `SD-LEO-GATE0-CLAUDEEXEC-001`: CLAUDE_EXEC.md mandatory sd:status check
    - `SD-LEO-GATE0-LOCTHRESHOLD-001`: LOC threshold trigger (>500 LOC)
    - `SD-LEO-GATE0-VERIFYSCRIPT-001`: verify-sd-phase.js script (Gate 0)
    - `SD-LEO-GATE0-GHACTION-001`: GitHub Action for PR merge SD validation
    - `SD-LEO-GATE0-ORCHPROGRESS-001`: Orchestrator progress calculation fix
  - **Enforcement Points**:
    - Pre-commit: Validates SD is in active workflow phase before allowing commits
    - PR Merge: GitHub Action checks SD phase status before merge
    - LOC Threshold: Triggers workflow entry when changes exceed 500 LOC
  - **Impact**: Prevents protocol bypass, ensures SD workflow activation before implementation
  - **Capabilities Registered**: `gate0-workflow-enforcement`, `pre-commit-validation`, `pr-merge-validation`

- **SD-LEO-REFAC-TESTING-INFRA-001: TESTING & RETRO Sub-Agent Modularization** - PRs #543, #544
  - **TESTING Sub-Agent** refactored from 1,097 LOC monolithic file to modular architecture:
    - Created `lib/sub-agents/testing/phases/` directory with 5 phase modules:
      - `phase1-preflight.js` - Intelligent test analysis, selector validation, navigation flow checks
      - `phase2-generation.js` - Test case generation from user stories
      - `phase3-execution.js` - E2E test execution with caching support
      - `phase4-evidence.js` - Test evidence collection and user story verification
      - `phase5-verdict.js` - Verdict generation with adaptive validation (prospective vs retrospective)
    - Created `lib/sub-agents/testing/utils/troubleshooting.js` - Troubleshooting tactics arsenal (13 patterns)
    - Main file reduced to 550 LOC orchestrator
    - All phase logic preserved, no breaking changes
  - **RETRO Sub-Agent** quality improvements:
    - Fixed `lib/sub-agents/retro/action-items.js` - Preserved SMART action item metadata (was stripping to plain strings)
    - Rewrote `lib/sub-agents/retro/generators.js` - Extract actual SD-specific insights instead of template-based boilerplate
    - New extractors: `extractSubAgentInsights()`, `extractPRDInsights()`, `extractHandoffInsights()`, `extractTestEvidence()`
    - Result: Retrospective quality score improved from 42-46/100 to 90/100 with 16 key learnings
  - **Windows ESM Import Fix**:
    - Fixed `scripts/modules/handoff/executors/exec-to-plan/test-evidence.js` - Proper path resolution using `fileURLToPath()`, `pathToFileURL()`, and `resolve()`
    - Windows ESM requires file:// URLs for dynamic imports with absolute paths
  - Impact: Improved maintainability (<550 LOC per file), enhanced retrospective specificity, eliminated RETROSPECTIVE_QUALITY_GATE failures
  - Documentation: Updated `lib/sub-agents/testing/index.js` header with v3.1 refactoring notes

### Features
- **DATABASE Sub-Agent: Intelligent Migration Execution with Action Trigger Detection** - PR #520
  - Added action intent detection to DATABASE sub-agent for automatic migration execution
  - New `action_triggers` array in `config/domain-keywords.json` with phrases like "apply migration", "run migration", "db push"
  - When users say action phrases, the sub-agent now:
    - Detects action intent from keywords
    - Finds pending migration files in standard locations
    - Displays confirmation preview showing:
      - File names and paths
      - Migration types (CREATE TABLE, ALTER TABLE, RLS, INSERT)
      - Content preview
    - Requires `--confirm-apply` flag to execute (safe by default)
    - Executes `supabase db push` via CLI
  - Implementation files:
    - `lib/sub-agents/database.js`: Added `detectActionIntent()`, `findPendingMigrations()`, `executeMigrations()`
    - `lib/modules/context-aware-selector/domain-keywords.js`: Added `detectActionTrigger()` and `getActionTriggers()` helpers
    - `database/migrations/20260123_add_database_action_triggers.sql`: Migration to persist triggers in `leo_sub_agent_triggers` table
  - Documentation updates:
    - `docs/reference/database-agent-patterns.md`: Added Pattern 7 (Intelligent Migration Execution), updated action trigger keywords section
  - Impact: Reduces manual "run supabase db push" reminders, provides full transparency before execution
  - Safety: No migrations execute without explicit confirmation flag

## 2026-01-20

### Documentation
- **SD-LEO-FIX-PROTOCOL-001: Priority Field Documentation Fix** - Root cause fix for SD creation failures
  - Updated `docs/database/strategic_directives_v2_field_reference.md` with correct lowercase priority values
  - Issue: Documentation showed `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` but database constraint requires `critical`, `high`, `medium`, `low`
  - Root cause (5 Whys): No single source of truth for enum values between docs and DB schema
  - Added warning and explicit constraint values to prevent future mismatch
  - PR: #453

### Infrastructure
- **SD-LEO-REFACTOR-LARGE-FILES-002: LEO Protocol File Modularization** - Orchestrator SD refactoring large validation files
  - **SD-LEO-REFACTOR-IMPL-FIDELITY-001** (Child 8): Refactored `implementation-fidelity-validation.js` (1,559 LOC → 10 modules)
    - Created `scripts/modules/implementation-fidelity/` directory structure
    - Modules: preflight, utils (git-helpers, repo-detection), sections (design-fidelity, database-fidelity, data-flow-alignment, enhanced-testing)
    - Main file reduced to 20 LOC thin re-export wrapper
    - All exports preserved, no breaking changes
  - **SD-LEO-REFACTOR-VALIDATOR-REG-001** (Child 9): Refactored `ValidatorRegistry.js` (1,234 LOC → 10 modules)
    - Created `scripts/modules/handoff/validation/validator-registry/` directory structure
    - Modules: core.js (157 LOC), gate validators split by type (L, 1, 2, 3, 4, Q, additional)
    - 52 validators registered across 7 gate modules
    - Main file reduced to 21 LOC thin re-export wrapper
  - **SD-LEO-REFACTOR-TRACEABILITY-001** (Child 10): Refactored `traceability-validation.js` (993 LOC → 9 modules)
    - Created `scripts/modules/traceability-validation/` directory structure
    - Modules: utils, preflight, sections (recommendation-adherence, implementation-quality, traceability-mapping, sub-agent-effectiveness, lessons-captured)
    - Phase-aware weighting system (CRITICAL 30pts, MAJOR 25pts, MINOR 10-5pts)
    - Main file reduced to 17 LOC thin re-export wrapper
  - **Impact**: All scripts/modules/ files now under 1000 LOC threshold (largest: ai-quality-evaluator.js at 948 LOC)
  - **Tooling**: Created `create-orchestrator-sd.js` and `create-refactor-orchestrator-002.js` for future orchestrator SD creation
  - **Backward Compatibility**: All original file paths maintained as re-exports, no caller changes required

### Bugfixes
- **QF-20260121-001: Fix [object Object] bug in retrospective action items** - Quick-fix for serialization issue
  - Fixed `lib/sub-agents/retro/action-items.js` lines 61-65
  - Issue: SmartAction objects pushed directly to array became `[object Object]` when serialized to database
  - Fix: Extract `.action` string from SmartAction objects before returning
  - Impact: Retrospective action items now display correctly instead of `[object Object]`
  - Related: **SD-LEO-FIX-PROTOCOL-001** (Protocol Improvements from Refactoring Retrospective Analysis)
  - PR: #454
- **SD-FIX-NAV-001: Chairman Sidebar Navigation Architecture Fix** - Orchestrator SD with 4 children completed
  - **SD-FIX-NAV-001-A**: Fixed navigation route database configuration for chairman persona
  - **SD-FIX-NAV-001-B**: Cleaned up legacy routes and standardized analytics path
  - **SD-FIX-NAV-001-C**: Updated documentation references from `/chairman-analytics` to `/chairman/analytics`
  - **SD-FIX-NAV-001-D**: Removed 4 test ventures from database (Critical Attention, Launch Checklist Test, UI/UX Assessment Test, P0 RLS Fix Test) to clean up sidebar display
  - Root cause: Test data pollution in ventures table causing confusing sidebar entries
  - Impact: Cleaner chairman persona navigation, proper route separation

### Known Issues
- **LEAD-FINAL-APPROVAL Validator Bug**: `workflow-roi-validation.js` line 137 checks for `LEAD-FINAL` handoff type which doesn't exist in `sd_phase_handoffs` schema. Schema only allows: LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD. Workaround: Manual SD completion via database update after PLAN-TO-LEAD passes.

## 2026-01-18

### Multi-Repository Architecture
- **Centralized Multi-Repo Module**: Created `lib/multi-repo/index.js` consolidating repo discovery and coordination logic
  - Repository discovery and metadata management
  - Git status checking (uncommitted changes, unpushed commits)
  - SD-to-repo mapping (determines affected repos by SD type/keywords)
  - Branch operations (find SD-related branches across repos)
  - Display helpers for console output
  - Reduces duplication across 3 different scripts
- **Multi-Repo Status CLI**: Enhanced `scripts/multi-repo-status.js` to use centralized module
  - Reduced from 330 to 123 lines
  - Added `--sd SD-XXX` flag for SD-specific checks
  - Shows which repos have uncommitted work per SD
- **Ship Workflow Enhancement**: Added Step 0.1 to `/ship` command
  - Automatically checks all repos for uncommitted changes before shipping
  - Prevents shipping backend while frontend changes sit uncommitted
  - Provides actionable recommendations when changes found
- **Phase 1 Refactoring (PR #355)**: Consolidated duplicated repo discovery logic
  - `MultiRepoCoordinator.js`: Removed 70 lines of duplicated discovery code
  - `branch-cleanup-v2.js`: Removed 50 lines of duplicated discovery code
  - Exported config constants from `lib/multi-repo/index.js` for reuse
  - Net reduction: 90 lines, single source of truth for all repo operations
- **Phase 2 SD-Aware Intelligence (PR #357)**: Added multi-repo awareness to LEO Protocol commands
  - `sd-next.js`: Shows MULTI-REPO WARNING banner when uncommitted changes detected
  - `handoff.js`: STEP 0 multi-repo check before phase transitions (precheck and execute)
  - `sd-verify.js`: Verification checklist includes multi-repo status, blocks SD completion if uncommitted
  - SD-aware: Only checks repos affected by SD type (via `getAffectedRepos()`)
  - Prevents forgetting uncommitted work in related repos during critical operations

### Quality Lifecycle System - 100% Completion
- **SD-QUALITY-INT-001**: Completed final integration tasks
  - Risk Router notification for P0/P1 feedback with auto-escalation
  - /learn integration with feedback table (resolved learnings and recurring patterns)
  - Feedback-to-SD promotion API endpoint (POST /api/feedback/:id/promote-to-sd)
- **SD-QUALITY-UI-001**: Completed final UI tasks
  - Added breadcrumb labels (quality, inbox, backlog, releases, patterns)
  - Added "Promote to SD" button in FeedbackDetailPanel
  - Wired onPromoteToSD handler with toast notifications
- **Multi-Repo Ship**: Successfully shipped both EHG (frontend) and EHG_Engineer (backend) changes
  - PR #351 (backend) - Integration and triage engine
  - PR #120 (frontend) - UI components and handlers

### Documentation
- **Multi-Repo Module API Reference**: `docs/reference/multi-repo-module.md`
  - Complete API documentation with examples
  - Configuration reference (KNOWN_REPOS, COMPONENT_REPO_MAP)
  - Usage patterns and integration guide
- **Multi-Repo Architecture**: `docs/01_architecture/multi-repo-architecture.md`
  - EHG ecosystem structure (frontend + backend repos)
  - Coordination patterns and workflows
  - Deployment architecture and future enhancements

## 2026-01-02

### Portfolio Glide Path Dashboard
- **SD-VS-GLIDE-PATH-001**: Documented portfolio glide path dashboard
  - Glide Path phase indicator (Vending Machine → Micro-SaaS → Platform → Portfolio)
  - Phase transition recommendations based on chairman_settings thresholds
  - Risk/reward visualization for current venture portfolio
  - Trend tracking for scoring dimensions over time
  - Integration points: venture_opportunity_scores, chairman_settings tables

### Research Arm Pipeline
- **SD-VS-RESEARCH-ARM-001**: Documented research pipeline integration
  - Research pipeline trigger hooks via API endpoints
  - Weekly research digest automation (scheduled Monday runs)
  - CrewAI research results feed into scoring engine
  - Queue status tracking for research jobs
  - Error handling and retry logic for failed research jobs
  - Integration points: chairman_settings, venture_opportunity_scores tables

### Venture Scoring Engine
- **SD-VS-SCORING-RUBRIC-001**: Documented venture opportunity scoring rubric
  - Scoring dimensions use existing chairman_settings columns
  - Weighted scoring: Feedback Speed (25%), Pattern Match (20%), Market Demand (20%)
  - Additional weights: Unit Economics (15%), Distribution Fit (10%), Strategic Unlock (10%)
  - Scores calculated from: pattern_threshold, feedback_speed, risk_tolerance parameters

### Scaffold Patterns
- **SD-VS-PATTERN-UNLOCK-001**: Added 4 priority patterns to scaffold_patterns table
  - `StripeService` (service) - Billing, subscriptions, metering, webhooks integration
  - `RBACMiddleware` (service) - Role-based access control, permissions, RLS integration
  - `useCRUD` (hook) - Generic CRUD hook for Supabase table bindings with React Query
  - `BackgroundJob` (service) - Job queue with status tracking, retry logic, failure handling
- Pattern count increased from 45 to 49

## 2025-09-22

### Refactoring
- **database-loader.js**: Split 1503-line monolithic file into 6 modular components (PR #4)
  - `connections.js` (45 lines) - Supabase client management
  - `strategic-loaders.js` (422 lines) - SD/PRD/EES loading
  - `submissions.js` (308 lines) - SDIP submission handling
  - `pr-reviews.js` (188 lines) - PR review tracking
  - `utilities.js` (215 lines) - Shared helpers
  - `index.js` (182 lines) - Main orchestrator
  - Created 26-line backward-compatible shim maintaining all exports
  - Zero behavior changes, 100% backward compatibility

### Housekeeping & CI
- Implemented self-contained CI with ephemeral PostgreSQL for staging validation
- Added file bloat detection with path-aware thresholds
- Created production promotion workflow with safety checks
- Added schema drift detection and weekly reporting
- Configured daily/weekly automation schedules

### EHG_Engineering
- Added governance metadata + slug/UUID keys for SDs (`202509221300__eng_sd_metadata.sql`).
- Realigned PRD contract with completeness/risk constraints and UUID linkage (`202509221305__eng_prd_contract.sql`).
- Normalized backlog data into `eng_backlog` with QA gating (`202509221310__eng_backlog_contract.sql`).
- Archived legacy Directive Lab table (`202509221315__eng_archive_legacy.sql`).
- Linked PRD storage to canonical PRDs with QA threshold (`202509221320__eng_fix_prd_storage_fk.sql`).
- Added commit/PR linkage metadata (`202509221325__eng_commit_pr_linkage.sql`).

### EHG (Venture App)
- Renamed venture tables to `vh_*` namespace (`202509221330__vh_namespace_core.sql`).
- Added governance trace columns to ventures (`202509221335__vh_trace_columns.sql`).
- Published read-only ingest views for governance exports (`202509221340__vh_ingest_governance_views.sql`).
- Added staging apply/run-check/backfill scripts under `ops/` (staging_apply.sh, run_checks.sh, run_backfills.sh).
- Created VH governance ingestion job (`apps/ingest/vh_governance_ingest.ts`) with audit logging + feature flag.
- Introduced CI guardrails (`.github/workflows/db-verify.yml`, `.github/workflows/boundary-lint.yml`).

See `ops/audit/2025-09-22.md` for detailed traceability and rollback guidance.
