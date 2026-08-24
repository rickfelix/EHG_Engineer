# SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — Writer Inventory & Trigger-Estate Evidence

**Phase**: PLAN | **Sub-agent**: DATABASE | **Date measured**: 2026-08-23
**Database**: consolidated engineer DB (`dedlbzhpgkmetvhbkyzq`), queried live via `createDatabaseClient('engineer')`
**Method**: catalog-derived (`pg_proc`, `pg_trigger`, `pg_get_functiondef`, `pg_policies`, `pg_roles`, `information_schema`) + 5-pass repo search. **Not** grep-only — grep-only enumeration is precisely what FR-5 exists to replace.

> ## ⚠️ LOAD-BEARING CORRECTION FOR EXEC — FR-4 scope is wrong
>
> FR-4 scopes the EXEC stamp-wiring work as **two** sites: `SDRepository.js::updateStatus()` plus the two `fn_atomic_*_transition` RPC bodies.
> **Both halves of that are wrong.**
>
> 1. **`SDRepository.updateStatus()` is DEAD CODE — zero call sites.** Verified: `SDRepository` is instantiated (`HandoffOrchestrator.js:80`) but only `getById` (8 call sites) and `verifyExists` (3) are ever invoked. No dynamic dispatch. Wiring the stamp into it accomplishes nothing.
> 2. **The real handoff-internal surface is 13 live own-UPDATE sites across 11 files, plus 2 RPC entry points — 15 distinct stamp-wiring points**, not 2.
>
> If EXEC wires only the FR-4-named sites, **every handoff transition except the two atomic RPC paths will be REJECTED** by the new trigger, breaking the entire pipeline. Full enumeration in **Section 6**.

Protected columns (verified present, none generated):

| column | type | nullable | default |
|---|---|---|---|
| `status` | `character varying` | NO | — |
| `current_phase` | `text` | YES | `'LEAD_APPROVAL'::text` |
| `completion_date` | `timestamp with time zone` | YES | — |

---

## Section 0 — Headline counts

| Metric | Value |
|---|---|
| pg_proc functions whose body references `strategic_directives_v2` | 95 |
| …of those, issuing ≥1 `UPDATE strategic_directives_v2` | 29 |
| …of those, writing a **protected** column | **12** |
| Trigger functions on `strategic_directives_v2` **assigning** a protected column | **1** (`auto_transition_status`) |
| Total triggers on `strategic_directives_v2` | 54 |
| …`BEFORE ROW` | **35** (confirms the SD's 2026-08-24 count) |
| …`BEFORE ROW` firing on UPDATE | 31 |
| Repo files containing an own-UPDATE of a protected column (live, non-archive) | **46** |
| …of those, actually **reachable** (`SDRepository.updateStatus()` is dead — 0 callers) | **45** |
| …of those, inside the `scripts/modules/handoff/**` canonical pipeline | **11 files / 13 sites** (+2 RPC entry points) |
| Repo files that only invoke a protected-column RPC (`indirect_caller`) | 4 |
| Archived one-shot scripts writing protected columns (dead) | 162 |
| Test files writing protected columns on the **real** table | 10 |

Disposition rollup (live surfaces only, excluding archive/tests):

| disposition | count |
|---|---|
| `allowlist` | 26 |
| `expected_reject` | 21 |
| `indirect_caller` | 4 |
| `no_action_needed` | 12 |

> Changed from the first pass: `scripts/modules/handoff/db/SDRepository.js` moved `allowlist` → `no_action_needed` (dead code, 0 callers). See Section 6.

---

## Section 1 — Canonical writer inventory

### 1a. `source_type = pg_proc` — functions that DO write a protected column (12)

| source_type | object_or_file_path | write_shape | touches_protected_column | disposition |
|---|---|---|---|---|
| pg_proc | `public.complete_business_evaluation(p_sd_id text, p_evaluation_result text, p_rationale text, p_business_problem text, p_solution_value text, p_duplication_risk text)` *(SECURITY INVOKER)* | `SET status = v_new_status, current_phase = CASE WHEN p_evaluation_result='APPROVE' THEN 'READY_FOR_PLAN' WHEN 'REJECT' THEN 'REJECTED' ELSE 'LEAD_BUSINESS_EVALUATION' END, updated_at = NOW()` | true (status, current_phase) | allowlist |
| pg_proc | `public.complete_orchestrator_sd(sd_id_param character varying)` *(SECURITY DEFINER)* | U0 `SET status='pending_approval', updated_at=now()` · U1 `SET status='completed', current_phase='COMPLETED', is_working_on=false, updated_at=now()` | true (status, current_phase) | allowlist |
| pg_proc | `public.delete_venture(p_venture_id uuid)` *(SECURITY DEFINER)* | `SET status='cancelled', cancellation_reason=…, metadata = metadata \|\| jsonb_build_object('cancelled_due_to_venture',…)` | true (status) | allowlist |
| pg_proc | `public.fn_atomic_exec_to_plan_transition(p_sd_id text, p_prd_id text, p_session_id text, p_request_id text)` *(SECURITY DEFINER)* | `SET current_phase='EXEC_COMPLETE', status='active', transition_version=COALESCE(transition_version,1)+1, updated_at=NOW()` | true (status, current_phase) | allowlist |
| pg_proc | `public.fn_atomic_lead_to_plan_transition(p_sd_id text, p_session_id text, p_request_id text)` *(SECURITY DEFINER)* | `SET current_phase='PLAN_PRD', status='in_progress', transition_version=COALESCE(transition_version,1)+1, updated_at=NOW()` | true (status, current_phase) | allowlist |
| pg_proc | `public.fn_rollback_sd_hierarchy(p_orchestrator_id text)` *(SECURITY DEFINER)* | `SET status='cancelled', updated_at=NOW() WHERE id = ANY(v_descendant_ids) AND status != 'cancelled'` | true (status) | allowlist |
| pg_proc | `public.kill_venture(p_venture_id uuid, p_rationale text)` *(SECURITY DEFINER)* | `SET status='cancelled', cancellation_reason=p_rationale, metadata = metadata \|\| …, updated_at=now()` | true (status) | allowlist |
| pg_proc | `public.request_business_evaluation(p_sd_id text, p_rationale text)` *(SECURITY INVOKER)* | `SET status='pending_business_evaluation', current_phase='LEAD_BUSINESS_EVALUATION', updated_at=NOW() WHERE id=p_sd_id AND status='draft'` | true (status, current_phase) | allowlist |
| pg_proc | `public.update_sd_after_exec_completion()` — trigger fn on a **different** table | `SET status = CASE WHEN NEW.quality_score>=90 THEN 'implementation_complete' … ELSE 'implementation_review_required' END, updated_at=NOW() WHERE id=NEW.sd_id` | true (status) | allowlist |
| pg_proc | `public.update_sd_after_lead_evaluation()` — trigger fn on a different table | `SET status = CASE WHEN NEW.final_decision='APPROVE' THEN 'active' WHEN 'REJECT' THEN 'rejected' WHEN IN ('CONDITIONAL','CLARIFY') THEN 'pending_revision' ELSE status END, updated_at=NOW()` | true (status) | allowlist |
| pg_proc | `public.update_sd_after_plan_validation()` — trigger fn on a different table | `SET status = CASE WHEN NEW.final_decision='APPROVE' THEN 'validated' WHEN 'REJECT' THEN 'technical_review_required' WHEN IN ('CONDITIONAL','REDESIGN','RESEARCH') THEN 'plan_revision_required' ELSE status END` | true (status) | allowlist |
| pg_proc | `public.update_sd_progress_from_phases()` — trigger fn on `sd_phase_tracking` | U0 `SET progress=calculate_sd_progress(NEW.sd_id), current_phase=(SELECT phase_name FROM sd_phase_tracking …)` · U1 `SET status='completed', completion_date=NOW()` | true (**all 3**) | allowlist |

> **Design note for EXEC**: rows 9–12 are *trigger functions on other tables* that cascade an UPDATE into `strategic_directives_v2`. They run inside the originating statement's transaction, so the new guard sees them as ordinary un-stamped UPDATEs. A stamp that is set per-session (GUC) rather than per-statement will cover them only if the originating write was itself stamped. **This cascade class is the single largest allowlisting design decision in the SD.**

### 1b. `source_type = pg_proc` — functions that write the table but **NOT** a protected column (17, `no_action_needed`)

`auto_recalculate_sd_progress` (progress_percentage) · `auto_set_is_parent` (metadata) · `check_intensity_required` (**no write at all** — the `UPDATE …` text is inside a `RAISE EXCEPTION` hint string; verified by reading `pg_get_functiondef`) · `claim_sd` (claiming_session_id, active_session_id, is_working_on, claim_gate_client_version) · `cleanup_stale_sessions` (session cols) · `create_or_replace_session` (session cols) · `enforce_parent_orchestrator_type` (sd_type) · `fn_backfill_venture_ids` (venture_id) · `master_reset_portfolio` (venture_id) · `recompute_wiring_validated` (wiring_validated) · `reinherit_contracts_for_children` (metadata) · `release_sd` (session cols) · `release_session` (session cols) · `report_pid_validation_failure` (session cols) · `set_working_sd` (is_working_on) · `switch_sd_claim` (session cols) · `sync_is_working_on_with_session` (is_working_on, active_session_id)

### 1c. `source_type = pg_trigger` — triggers on `strategic_directives_v2` that MUTATE a protected column (1)

| source_type | object_or_file_path | write_shape | touches_protected_column | disposition |
|---|---|---|---|---|
| pg_trigger | `status_auto_transition` → `public.auto_transition_status()` (**BEFORE ROW UPDATE**) | `IF NEW.current_phase='EXEC' AND NEW.progress>=100 THEN NEW.status = 'pending_approval'; END IF;` and the same for `current_phase='PLAN'` | true (**status**, assigned) | **expected_reject / FIRING-ORDER HOLE — see Section 2** |

Assignment-vs-comparison was classified by preceding-token analysis and **hand-verified** against `pg_get_functiondef` output, because a naive `NEW.status\s*=` regex cannot distinguish plpgsql assignment from SQL equality. 12 other triggers match that regex but every one is an `IF NEW.status = '…' THEN` **comparison**, not a write: `enforce_progress_on_completion`, `enforce_business_value_gate`, `trg_require_cancellation_reason` (all BEFORE ROW), plus `trigger_retro_notification`, `fn_sync_sd_to_baseline`, `fn_auto_close_deliverables_on_sd_completion`, `fn_auto_close_feedback_on_sd_completion`, `fn_auto_close_quick_fixes_on_sd_completion`, `fn_handle_capability_lifecycle`, `record_mttr_on_sd_completion`, `fn_record_sd_completion_signal` (AFTER ROW).

### 1d. `source_type = repo_script` — own-UPDATE writers of a protected column (46 live files)

**Handoff pipeline — the canonical writer (12 files, `allowlist`)**. All use `createSupabaseServiceClient`.

| object_or_file_path | write_shape | cols |
|---|---|---|
| `scripts/modules/handoff/db/SDRepository.js:176-188` | `const updateData = { status, ...metadata, updated_at }; if (phase) updateData.current_phase = phase;` → `.update(updateData)` | status, current_phase |
| `scripts/modules/handoff/executors/lead-final-approval/index.js:626-634` | `attemptCasCompletion(…, { status:'completed', current_phase:'COMPLETED', progress_percentage:100, is_working_on:false, active_session_id:null, completion_date:new Date().toISOString(), updated_at })` | **all 3** |
| `scripts/modules/handoff/executors/lead-final-approval/cas-completion.js:28-33` | `.update(updateFields).eq('id', sd.id).eq('status','pending_approval')` (CAS; generic payload from caller) | all 3 (via caller) |
| `scripts/modules/handoff/cli/execution-helpers.js:81-86` | `.update({ status: expected.status, current_phase: expected.current_phase, updated_at })` | status, current_phase |
| `scripts/modules/handoff/lib/orchestrator-terminal-guard.js:72-76` | `.update({ status:'pending_approval', updated_at })` | status |
| `scripts/modules/handoff/executors/plan-to-lead/state-transitions.js:522-527` | `.update({ status:'pending_approval', current_phase:'LEAD', updated_at })` | status, current_phase |
| `scripts/modules/handoff/executors/plan-to-lead/index.js:497-502` | `.update({ status:'pending_approval', current_phase:'LEAD', updated_at })` | status, current_phase |
| `scripts/modules/handoff/executors/plan-to-exec/state-transitions.js:35-41, :130-136` | rollback `.update({ current_phase: snapshot.sd_phase, status: snapshot.sd_status, is_working_on, updated_at })` · forward `.update({ current_phase:'EXEC', status:'active', is_working_on:true, updated_at })` | status, current_phase |
| `scripts/modules/handoff/executors/lead-to-plan/state-transitions.js:39-44, :101-106` | rollback `.update({ current_phase: snapshot.current_phase, status: snapshot.status, updated_at })` · forward `.update({ current_phase:'PLAN_PRD', status:'in_progress', updated_at })` | status, current_phase |
| `scripts/modules/handoff/executors/exec-to-plan/state-transitions.js:141-145` | `.update({ current_phase:'EXEC_COMPLETE', updated_at })` | current_phase |
| `scripts/modules/handoff/executors/lead-to-plan/gates/transition-readiness.js:60-61` | `.update({ status:'draft', is_active:true })` | status |
| `scripts/modules/handoff/skip-and-continue.js:137-142` | `.update({ status:'blocked', metadata: blockedMetadata, updated_at })` | status |

**Other live `allowlist` writers (15 files)** — confirmed live npm commands / load-bearing lifecycle tooling:

| object_or_file_path | write_shape | cols | key |
|---|---|---|---|
| `lib/sd-park.js:90-97` (`park`) | `UPDATE strategic_directives_v2 SET status=$2, is_working_on=false, claiming_session_id=NULL, active_session_id=NULL, progress = CASE WHEN $3 THEN 99 ELSE progress END, metadata = COALESCE(metadata,'{}'::jsonb) \|\| $4::jsonb, updated_at=now(), updated_by=$5 WHERE sd_key=$1` | status | raw `pg` |
| `lib/sd-park.js:136-140` (`unpark`) | `UPDATE strategic_directives_v2 SET status=$2, progress=COALESCE($3,progress), metadata=$4::jsonb, updated_at=now(), updated_by=$5 WHERE sd_key=$1 RETURNING status` | status | raw `pg` |
| `scripts/cancel-sd.js:319-331` (`npm run sd:cancel`) | `{ status:'cancelled', current_phase:'CANCELLED', cancellation_reason, claiming_session_id:null, is_working_on:false, … }` → `.update(updates)` | status, current_phase | SERVICE_ROLE |
| `scripts/reactivate-sd.js:66,:188-193` (`npm run sd:reactivate`) | `{ status: toStatus, metadata: nextMeta, updated_at }` → `.update(plan.updates).eq('status','deferred')` | **status only** | SERVICE_ROLE |
| `scripts/sd-recover.js:157-162` (`npm run sd:recover`) | `.update({ current_phase: correctPhase, status: correctStatus, updated_at })` | status, current_phase | SERVICE_ROLE |
| `scripts/sd-verify.js:343-349` | `.update({ status:'completed', current_phase:'COMPLETED', progress_percentage:100, completion_date: new Date().toISOString() })` | **all 3** | SERVICE_ROLE |
| `scripts/leo-continuous.js:454-455, :466-473` | `.update({ current_phase: phase })` · `.update({ status:'completed', current_phase:'COMPLETE', progress_percentage:100, is_working_on:false, completion_date })` | **all 3** | SERVICE_ROLE |
| `scripts/complete-orchestrator.js:103-108` | `.update({ progress_percentage:100, status:'completed', current_phase:'COMPLETED' })` | status, current_phase | SERVICE_ROLE |
| `scripts/stale-session-sweep.cjs:709-715, :834-835, :1199-1207, :1783-1791, :2724-2730` (5 sites) | `.update({ status:'completed', claiming_session_id:null, … })` · `.update({ current_phase: resetTo })` · `.update({ status:'cancelled', current_phase:'CANCELLED', cancellation_reason:'QF-20260704-545: …', … })` · `.update({ status:'draft', current_phase:'LEAD', progress_percentage:0, … })` ×2 | status, current_phase | SERVICE_ROLE |
| `lib/sd/revert.js:91-111` | `{ status:'draft', current_phase:'LEAD', progress, metadata }` → `.update(payload)` | status, current_phase | SERVICE_ROLE |
| `lib/fleet/release-work-item.mjs:295-301` | `const patch = { status:'active' }; if (doPhase) patch.current_phase = resetTo;` → `.update(patch)` | status, current_phase | injected |
| `lib/eva/bridge/reap-orphaned-provisioning.js:82-86` | `.update({ status:'cancelled', cancellation_reason: 'Orphaned orchestrator tree of cancelled/killed venture …' })` | status | injected |
| `lib/eva/lifecycle-sd-bridge.js:1324-1325` | `.update({ status:'cancelled', cancellation_reason:'lifecycle-sd-bridge rollback: hierarchy creation failed', updated_at })` | status | SERVICE_ROLE |
| `lib/utils/orchestrator-child-completion.js:216-220` | `.update({ progress:100, status:'ready_for_final' })` | status | injected |
| `scripts/modules/shipping/SDGitStateReconciler.js:424-425` | `.update({ status:'in_progress', updated_at })` | status | SERVICE_ROLE |

**Live `expected_reject` writers (19 files)** — generic/ad-hoc/legacy surfaces that SHOULD start failing once the guard lands. Each needs an explicit EXEC decision (stamp, retire, or accept the break):

| object_or_file_path | write_shape | cols | note |
|---|---|---|---|
| `scripts/modules/sd-creation/sd-operations.js:64-65, :136-137` | `.from(TABLE_NAME).update(dataWithTimestamp)` / `.upsert(…, {onConflict:'id'})` — generic passthrough, `const TABLE_NAME='strategic_directives_v2'` | caller-supplied | table name reached via **indirection** — invisible to any literal-`from()` grep |
| `scripts/modules/orchestrator-creation-template.js:64-90, ~169` | `.upsert({ …, status:'draft', current_phase:'LEAD_APPROVAL', … }, {onConflict:'id'})` | status, current_phase | upsert-as-update path |
| `scripts/modules/prd-database-service.mjs:76-77` | `.update({ status, updated_at })` (shorthand property) | status | falls back to ANON if service key unset |
| `scripts/modules/sd-next/blocked-state-detector.js:467-472` | `updates.status = 'cancelled'` → `.update(updates)` | status | SERVICE_ROLE |
| `scripts/batch-operations/complete-children.mjs:78-98` | `{ status:'completed', current_phase:'COMPLETED', updated_at }` → `verifiedWrite(...)` or `.update(updates)` | status, current_phase | key depends on dispatcher flags |
| `scripts/batch-dispatcher.mjs:63` | `verifiedWrite(supabase, table, id, updates)` generic helper | any | references both ANON and SERVICE_ROLE |
| `scripts/audit-phantom-completions.js:201-204` | `.update({ status:'cancelled', cancellation_reason:'Audited 2026-04-28 (SD-MAN-INFRA-RECONCILE-S18-S26-001): …' })` | status | one-shot audit tool |
| `scripts/verify-l2p/handoff-execution.js:207-213` | `.update({ status:'active', phase:'PLAN', updated_at, metadata })` | status | ⚠️ writes `phase`, a column that **does not exist** — pre-existing latent bug |
| `scripts/pocock/weekly-deepening-report.mjs:103-117` | `.upsert(insert, …)` where `insert = { …, status:'draft', …, current_phase:'LEAD', … }` | status, current_phase | SERVICE_ROLE |
| `scripts/templates/sd-creation-template.js:92,114,321-322` | `.update(strategicDirective)` with `status:'draft'`, `current_phase:'IDEATION'` | status, current_phase | template |
| `scripts/validate-trigger-guard-pack.mjs:103,115,141,169` | `UPDATE strategic_directives_v2 SET status='completed', progress=100, completion_date=NOW() WHERE sd_key=$1` ×4 | status, completion_date | **validation harness — will break itself** |
| `scripts/validate-capability-lifecycle-trigger.mjs:82,112` | same shape ×2 | status, completion_date | **validation harness — will break itself** |
| `scripts/one-off/_risk-probe-cascade-multifield.mjs:21-27` | `.update({ status: before.data.status, current_phase: before.data.current_phase, progress_percentage, metadata })` | status, current_phase | value-preserving but a real write |
| `templates/execute-phase/phase-utils.js:64-69, :84-102` | `.update({ current_phase: PHASE_COMPLETE_MAP[phase], updated_at })` · `markSDComplete` `.update({ status:'completed', is_working_on:false, current_phase:'APPROVAL_COMPLETE', progress:100, completion_date, updated_at, metadata })` | **all 3** | injected client |
| `templates/execute-phase/phase-executors.js:23-27,:50-54,:139-149,:201-210,:227-236` | `.update({ current_phase:'LEAD_COMPLETE' \| 'PLAN_COMPLETE' \| 'EXEC_IMPLEMENTATION_REQUIRED' \| 'APPROVAL_COMPLETE' \| 'APPROVAL_PENDING_EVIDENCE', … })` | current_phase | injected client |
| `server/websocket.js:173-174` | `.update({ status })` from `handleUpdateSDStatus` | status | `SERVICE_ROLE_KEY \|\| ANON` silent fallback |
| `scripts/_deprecated/unified-handoff-system.js:1378-1383` | `.update({ status:'pending_approval', current_phase:'LEAD', updated_at })` | status, current_phase | deprecated dir, still on disk |
| `tests/**` (10 files, see 1f) | fixture seeding + assertions against the real table | status | will break the suite |
| `scripts/archive/**` + `archive/**` (162 files) | `.update({ status:'completed', current_phase:'APPROVAL_COMPLETE', completion_date })` etc. | all 3 | dead one-shots; `no_action_needed` in practice |

**Live `no_action_needed` — ANON-key writers already dead by RLS (3 files, see Section 3)**

| object_or_file_path | write_shape | cols | why no action |
|---|---|---|---|
| `scripts/update-directive-status.js:31-37` (`npm run update-status`) | `.update({ status: newStatus, updated_at })`, client built inline at :25 with `createClient(url, NEXT_PUBLIC_SUPABASE_ANON_KEY)` | status | **RLS silently drops — already a no-op** |
| `scripts/leo-orchestrator-enforced.js:171-186` (`npm run leo:execute`) | `.update({ status:'completed', is_working_on:false, current_phase:'APPROVAL_COMPLETE', progress:100, completion_date, updated_at, metadata })` via `createSupabaseClient` → ANON | **all 3** | **RLS silently drops — already a no-op** |
| `templates/create-handoff.js:125-129` | `.update({ current_phase: newPhase, updated_at })` via `createSupabaseClient` → ANON | current_phase | **RLS silently drops — already a no-op** |

### 1e. `source_type = repo_script`, `disposition = indirect_caller` (4)

| object_or_file_path | invokes | note |
|---|---|---|
| `scripts/handoff.js` | delegates to `scripts/modules/handoff/**` | **no own UPDATE**; carries the `@canonical-writer-for: strategic_directives_v2` header but every write is in Group 1d |
| `scripts/modules/handoff/executors/lead-to-plan/atomic-transitions.js:44,:93` | `rpc('fn_atomic_lead_to_plan_transition')` | SERVICE_ROLE |
| `scripts/modules/handoff/executors/exec-to-plan/atomic-transitions.js:160,:240` | `rpc('fn_atomic_exec_to_plan_transition')` | SERVICE_ROLE |
| `lib/deleteVentureFully.js:148` | `rpc('delete_venture', { p_venture_id })` | cascades to SD `status` |

**RPCs with ZERO live JS call sites** (invoked only from DB triggers or not at all): `complete_orchestrator_sd`, `complete_business_evaluation`, `request_business_evaluation`, `fn_rollback_sd_hierarchy`, `kill_venture`. All JS mentions are comments/introspection/audit strings (`lib/governance/hold-state-exemptions.js:49`, `lib/fleet/orchestrator-completion.cjs:9,24`, `scripts/orchestrator-rpc-enforcement-status.mjs`, `scripts/verify-orchestrator-completion-guard4-crosscheck.mjs`). `kill_venture` appears only in `tests/integration/kill-venture-rpc.test.js`.

### 1f. Tests writing protected columns on the **real** table (10 — will break)

`tests/helpers/database-helpers.js:264-265` · `tests/integration/hold-state-sweep-live.db.test.js:67-68` · `tests/integration/sd-completed-handler.test.js:95-96` · `tests/integration/database-validation.test.js:426-427` · `tests/e2e/leo-protocol-journey.test.js:329-335` · `tests/database/{seat-busy-fence,claim-sd-cross-table,claim-dual-column-consistency,checkin-own-claim-detect}.test.js` (fixture `.upsert` incl. `status`) · `tests/ddl/plan-of-record-remainder-v2-ddl.db.test.js:257` · `tests/integration/auto-close-quick-fixes-trigger.integration.mjs:68,77` · `tests/integration/venture-sd-cascade.test.js:76` · `tests/unit/lib/eva/quality-findings/fr-c-generator.db.test.js`

### 1g. False positives explicitly ruled out

`lib/sd-helpers.js:273-274` (JSDoc example) · `scripts/one-off/_lead-scope-lock-atomic-revert.mjs:10` and `scripts/one-off/_lead-rescope-post-rca.mjs:18` (the `.update({status,current_phase,…})` text is inside a `key_changes` **description string**) · `lib/adam/task-rehydrate.js:187` (SELECT-only through `SD_TABLE`) · `lib/fleet/orchestrator-completion.cjs:69` (SELECT only) · `public.check_intensity_required()` (the `UPDATE …` is inside a `RAISE EXCEPTION` hint) · `api/webhooks/github-ci-status.js` (`ci_cd_status`, not `status`) · `scripts/modules/human-verification-validator.js` (`human_verification_status`, not `status`).

---

## Section 2 — Live trigger-estate check (FR-2)

**54 triggers total; 35 `BEFORE ROW`; 31 of those fire on UPDATE.** The SD's earlier 2026-08-24 count of ~35 BEFORE ROW is **confirmed still accurate**.

Firing order was measured with `ORDER BY tgname COLLATE "C"`, which is the correct instrument: PostgreSQL orders same-timing/same-event triggers in `relcache.c` via `strcmp()` on `tgname` — byte order, i.e. C collation, **not** the database's default collation. (Queried under the default collation the overall-first trigger is `audit_strategic_directives`, an AFTER trigger — a misleading answer if used for BEFORE-order reasoning.)

### All 35 BEFORE ROW triggers, in actual firing order

| # | trigger name | UPDATE | INSERT | function |
|---|---|:---:|:---:|---|
| 1 | `auto_assign_sequence_rank` | | Y | `assign_sequence_rank` |
| 2 | `auto_calculate_progress_trigger` | Y | | `auto_calculate_progress` |
| 3 | `check_sd_hierarchy` | Y | Y | `validate_sd_hierarchy` |
| 4 | `enforce_handoff_trigger` | Y | | `enforce_handoff_on_phase_transition` |
| 5 | `enforce_progress_trigger` | Y | | `enforce_progress_on_completion` |
| 6 | **`status_auto_transition`** | **Y** | | **`auto_transition_status`** ← mutates `NEW.status` |
| 7 | `tr_check_intensity_required` | Y | | `check_intensity_required` |
| 8 | `tr_claim_eligibility_observe` | Y | | `claim_eligibility_observe` |
| 9 | `tr_enforce_business_value_gate` | Y | | `enforce_business_value_gate` |
| 10 | `tr_enforce_no_claim_on_cancelled_sd` | Y | | `enforce_no_claim_on_cancelled_sd` |
| 11 | `trg_aaa_sync_type_change_reason` | Y | | `sync_type_change_reason` |
| 12 | `trg_auto_validate_sd_content_quality` | Y | Y | `auto_validate_sd_content_quality` |
| 13 | `trg_check_contract_requirements` | Y | Y | `check_contract_requirements` |
| 14 | `trg_doctrine_constraint_sd` | Y | Y | `enforce_doctrine_of_constraint` |
| 15 | `trg_enforce_child_creation_timing` | | Y | `enforce_child_creation_timing` |
| 16 | `trg_enforce_metadata_object` | Y | Y | `enforce_metadata_object` |
| 17 | `trg_enforce_orphan_protection` | Y | | `enforce_orphan_protection` |
| 18 | `trg_enforce_sd_quality_advancement` | Y | | `enforce_sd_quality_on_advancement` |
| 19 | `trg_enforce_sd_type_change_explanation` | Y | | `enforce_sd_type_change_explanation` |
| 20 | `trg_enforce_sd_type_change_governance` | Y | | `enforce_sd_type_change_governance` |
| 21 | `trg_enforce_sd_type_change_risk` | Y | | `enforce_sd_type_change_risk` |
| 22 | `trg_enforce_type_change_timing` | Y | | `enforce_type_change_timing` |
| 23 | `trg_inherit_contracts_on_insert` | | Y | `inherit_parent_contracts` |
| 24 | `trg_inherit_contracts_on_update` | Y | | `inherit_parent_contracts` |
| 25 | `trg_inherit_parent_metadata` | | Y | `inherit_parent_metadata` |
| 26 | `trg_inherit_parent_metadata_update` | Y | | `inherit_parent_metadata` |
| 27 | `trg_prevent_child_exec_before_parent_approval` | Y | | `prevent_child_exec_before_parent_approval` |
| 28 | `trg_require_cancellation_reason` | Y | | `trg_require_cancellation_reason` |
| 29 | `trg_sd_governance_metadata_audit` | Y | | `trg_audit_governance_metadata` |
| 30 | `trg_sync_sd_code_user_facing` | Y | Y | `sync_sd_code_user_facing` |
| 31 | `trg_sync_uuid_internal_pk` | Y | Y | `sync_uuid_internal_pk` |
| 32 | `trigger_warn_sd_kr_alignment` | Y | | `warn_on_sd_transition_without_kr` |
| 33 | `update_sd_timestamp` | Y | | `update_updated_at` |
| 34 | `update_strategic_directives_v2_updated_at` | Y | | `update_updated_at_column` |
| 35 | `validate_child_sd_sequence` | Y | | `validate_child_sd_sequence` |

All 54 triggers are `tgenabled='O'` (origin — normally enabled; none are `ALWAYS`/`REPLICA`/disabled).

### Firing-order verdict

✅ **`aaa_enforce_canonical_lifecycle_write` is CONFIRMED to sort first.** Zero of the 35 BEFORE ROW triggers sort earlier under `strcmp`. The earliest existing name is `auto_assign_sequence_rank`, and `'aaa_' < 'auto'` at byte 1 (`'a'`=0x61 < `'u'`=0x75). No trigger name begins with a digit or uppercase letter (both of which would sort before lowercase under C collation), so there is no hidden earlier-sorting name.

🚩 **REQUIRED FINDING — the `aaa_` design is necessary but NOT sufficient.**

`status_auto_transition` (position **6**) fires **after** the guard and **assigns** `NEW.status`:

```sql
IF NEW.current_phase = 'EXEC' AND NEW.progress >= 100 THEN NEW.status = 'pending_approval'; END IF;
IF NEW.current_phase = 'PLAN' AND NEW.progress >= 100 THEN NEW.status = 'pending_approval'; END IF;
```

Consequence: a client can set `status` **without any stamp** by writing only `progress`/`current_phase`. The `aaa_` guard inspects `NEW.status` at position 1, sees it unchanged, allows the write — and at position 6 `auto_transition_status` rewrites `NEW.status` to `'pending_approval'`. The guard has already run and cannot observe it. **Firing first is exactly what makes this invisible.**

This is not hypothetical: the SD's own LEAD-phase Explore finding records that `lib/sd-park.js` **deliberately depends on `auto_transition_status` firing off the `progress` column** — i.e. there is a live, load-bearing caller already using this exact un-stamped path.

EXEC must choose one of:
1. **Two-trigger design** — keep `aaa_` for stamp validation of client-supplied values, and add a `zzz_`-prefixed BEFORE ROW trigger to re-check `NEW.status` after all mutators have run (catches the cascade). Cheapest, no behavioural change to `auto_transition_status`.
2. **Fold `auto_transition_status` into the guard** — move the derivation inside the canonical trigger so there is a single writer. Cleanest single-representation outcome; higher blast radius.
3. **Stamp `auto_transition_status` itself** — make it set the canonical stamp before assigning. Preserves current behaviour but legitimises an un-stamped entry path.

Recommendation: **option 1**, with option 2 recorded as follow-up. It is the only option that closes the hole without changing any current lifecycle semantics.

Secondary observation: `trg_aaa_sync_type_change_reason` (position 11) already carries an `aaa` infix but is **prefixed `trg_`**, so it does not sort early. Someone previously reached for this ordering trick and it did not take effect. Worth noting so EXEC does not repeat the mistake — the `aaa_` must be the **leading** characters of the trigger name.

---

## Section 3 — ANON-key RLS finding (`update-directive-status.js`)

**Question**: does `scripts/update-directive-status.js` (ANON key) actually succeed at writing?
**Answer: NO. Its writes are already silent no-ops, entirely independent of this SD's new trigger.**

Measured live:

| instrument | result |
|---|---|
| `pg_class.relrowsecurity` | `true` (RLS enabled); `relforcerowsecurity=false` |
| `pg_policies` for `public.strategic_directives_v2` | **7 policies.** The only one covering role `anon` is `anon_read_strategic_directives_v2`, `cmd = SELECT`, `USING true`. **No policy grants anon UPDATE.** No policy targets `public`. |
| `information_schema.role_table_grants` | `anon` **does** hold `UPDATE` (plus INSERT/DELETE/TRUNCATE) — the grant is present but unusable |
| `pg_roles.rolbypassrls` | `anon=false`, `authenticated=false`, `authenticator=false`; `service_role=true`, `postgres=true` |

RLS is deny-by-default: an UPDATE by `anon` matches no permissive UPDATE policy, so **zero rows qualify and PostgREST returns success with 0 rows affected — no error**. The table-level UPDATE grant is a red herring; it lets the statement parse, RLS then filters every row.

Corroborated by an **independent instrument**: `tests/unit/supabase-anon-governance-guard.test.js` (SD-FDBK-FIX-GUARD-ANON-SUPABASE-001) exists precisely because of this — its header states *"RLS silently drops such writes (0 rows, no error)"* and `isGovernanceTable('strategic_directives_v2') === true`.

**Blast radius of this finding — three "writers" are already dead:**

| file | claimed to write | actual |
|---|---|---|
| `scripts/update-directive-status.js` (`npm run update-status`) | `status` | silent no-op |
| `scripts/leo-orchestrator-enforced.js` (`npm run leo:execute`) | **all 3** protected columns | silent no-op |
| `templates/create-handoff.js` | `current_phase` | silent no-op |

⚠️ `scripts/leo-orchestrator-enforced.js` was recorded in this SD's LEAD phase as a live, confirmed writer of all three protected columns via `npm run leo:execute`. It is **not** a writer. Do not allowlist it. Two further surfaces (`server/websocket.js`, `scripts/modules/prd-database-service.mjs`) silently fall back to ANON when `SUPABASE_SERVICE_ROLE_KEY` is unset and are therefore *conditionally* dead depending on environment — an unstable disposition EXEC should pin down.

---

## Section 4 — Reconciliation against this SD's earlier LEAD-phase findings

| LEAD-phase finding | Found in catalog? | Touches a protected column? | Resolution |
|---|---|---|---|
| `claim_sd` | **found** (pg_proc, SECURITY DEFINER, 2 UPDATE sites) | **NO** | writes `claiming_session_id`, `active_session_id`, `is_working_on`, `claim_gate_client_version` only → `no_action_needed` |
| `release_sd` | **found** (pg_proc, SECURITY DEFINER) | **NO** | session columns only → `no_action_needed` |
| `switch_sd_claim` | **found** (pg_proc, SECURITY DEFINER, 2 sites) | **NO** | session columns only → `no_action_needed` |
| `release_session` | **found** (pg_proc) | **NO** | session columns only → `no_action_needed` |
| `set_working_sd` | **found** (pg_proc, 2 sites) | **NO** | `is_working_on` only → `no_action_needed` |
| `create_or_replace_session` | **found** (pg_proc) | **NO** | session columns only → `no_action_needed` |
| `cleanup_stale_sessions` | **found** (pg_proc) | **NO** | session columns only → `no_action_needed` |
| `complete_orchestrator_sd()` | **found** (pg_proc, SECURITY DEFINER, 2 sites) | **YES** — `status`, `current_phase` | `allowlist`. Note: **zero live JS call sites**; invoked from DB triggers only |
| `scripts/cancel-sd.js` | **found** | **YES** — `status`, `current_phase` | `allowlist`; live via `npm run sd:cancel` |
| `scripts/reactivate-sd.js` | **found** | **YES — `status` only** | `allowlist`. **Corrects the LEAD assumption**: it *reads* `current_phase` for audit but never writes it |
| `scripts/sd-recover.js` | **found** | **YES** — `status`, `current_phase` | `allowlist`; live via `npm run sd:recover` |
| `lib/sd-park.js` | **found** (raw SQL, 2 sites) | **YES — `status` only** | `allowlist`. Confirms the LEAD note that it never writes `current_phase`, and confirms its documented dependency on `auto_transition_status` → see Section 2 |
| `scripts/leo-orchestrator-enforced.js` | **found** | writes all 3 **but ANON** | ⚠️ **LEAD assumption corrected** — writes are RLS-dropped no-ops → `no_action_needed`, do NOT allowlist |
| `scripts/update-directive-status.js` | **found** | writes `status` **but ANON** | ⚠️ already a silent no-op → `no_action_needed` |
| `scripts/handoff.js` | **found** | **NO own write** | `indirect_caller`; the real writes live in `scripts/modules/handoff/**` |

**The LEAD-phase ad-hoc searches found 15–20 hits across three disagreeing passes. This catalog+5-pass sweep found 46 live own-UPDATE repo writers plus 12 protected-column pg_proc functions plus 1 mutating trigger — roughly 3× the ad-hoc count.** FR-5's premise is confirmed: ad-hoc enumeration on this surface is not reliable. The specific recall gaps that defeated the earlier passes:

1. **Multi-line Supabase chains** — `.from('strategic_directives_v2')` and `.update(` land on different physical lines in the dominant style. Any same-line regex has ~0% recall. (This is the identical defect already documented in `verifyHelperCoverage()`, `scripts/lib/lead-precheck-helpers.js:300-421`.)
2. **`.update(<variable>)`** — payload built as `const updates = {...}` then passed by reference. Invisible to payload-literal greps; this form alone hid `cancel-sd.js`, `reactivate-sd.js`, `SDRepository.js`, and `lead-final-approval/cas-completion.js` — four of the most important writers.
3. **Shorthand properties** — `.update({ status })` with no colon.
4. **Table-name indirection** — `const TABLE_NAME = 'strategic_directives_v2'` then `.from(TABLE_NAME)`. Six such constants exist; `scripts/modules/sd-creation/sd-operations.js` writes through one.
5. **Trigger functions reference `NEW`/`OLD`, never the table name** — so `prosrc ILIKE '%strategic_directives_v2%'` misses every in-table trigger mutator. This is how the `auto_transition_status` hole (Section 2) stayed hidden; it was found only by scanning trigger functions *by attachment* rather than by body text.

---

## Section 5 — Note for the second RISK pass

This enumeration **does** materially change LEAD-phase design assumptions. Three items warrant explicit RISK treatment:

1. **[HIGH] Firing-order hole — `aaa_` alone does not close the invariant.** `status_auto_transition` mutates `NEW.status` at BEFORE-ROW position 6, after the guard. A client writing only `progress` + `current_phase` reaches `status='pending_approval'` with no stamp. There is a live load-bearing caller of this path (`lib/sd-park.js`). FR-2's single-trigger design needs a companion late-firing check (or a fold-in) before EXEC. Un-mitigated, the SD would ship a guard that reads as complete while leaving the most-used un-stamped path open — the exact "guard covers the wrong half" failure class.

2. **[HIGH] Three LEAD-identified writers are already dead.** `leo-orchestrator-enforced.js` (`leo:execute`, all 3 columns), `update-directive-status.js` (`update-status`), and `templates/create-handoff.js` all write via the ANON key, which RLS silently drops. Allowlisting them would grant real write capability to paths that currently have none — a **privilege expansion disguised as a compatibility shim**. Two more (`server/websocket.js`, `scripts/modules/prd-database-service.mjs`) are conditionally dead depending on whether `SUPABASE_SERVICE_ROLE_KEY` is set — an environment-dependent disposition that should be pinned before EXEC.

3. **[MEDIUM] The cascade class (4 trigger functions on other tables) has no obvious stamp story.** `update_sd_after_exec_completion`, `update_sd_after_lead_evaluation`, `update_sd_after_plan_validation`, and `update_sd_progress_from_phases` UPDATE `strategic_directives_v2` from *other* tables' triggers — and `update_sd_progress_from_phases` is the only surface in the entire estate that writes `completion_date` from the DB side. A session-scoped GUC stamp covers them only if the originating write was stamped; a statement-scoped stamp will not. This is a design decision, not an implementation detail.

4. **[MEDIUM] Two validation harnesses will break themselves.** `scripts/validate-trigger-guard-pack.mjs` and `scripts/validate-capability-lifecycle-trigger.mjs` both execute `UPDATE strategic_directives_v2 SET status='completed', progress=100, completion_date=NOW()` as raw SQL. Plus 10 test files write protected columns against the real table. EXEC needs a stamping story for test/validation fixtures or the guard lands red.

5. **[LOW] Pre-existing latent bug surfaced incidentally.** `scripts/verify-l2p/handoff-execution.js:207-213` writes `{ status:'active', phase:'PLAN', … }` — the column `phase` does not exist on `strategic_directives_v2` (only `current_phase`). Out of scope for this SD; worth a separate QF.

---

## Appendix — reproduction

All queries were run read-only against the live engineer DB. No DDL, no table mutation, no trigger/function created or dropped. Probe scripts: `.artifacts/db-canon-{triggers,trig2,procs,procs3,trigfns2,trigfns3,rls,roles,cols}.mjs` (scratch, not committed).

Key ordering query — note `COLLATE "C"`, which matches PostgreSQL's `strcmp()`-based trigger ordering:

```sql
SELECT t.tgname,
       CASE WHEN (t.tgtype & 2)=2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
       CASE WHEN (t.tgtype & 1)=1 THEN 'ROW' ELSE 'STMT' END AS level,
       (t.tgtype & 16) > 0 AS on_update, t.tgenabled, p.proname
FROM pg_trigger t
JOIN pg_class cl ON cl.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE cl.relname = 'strategic_directives_v2' AND n.nspname = 'public'
  AND NOT t.tgisinternal
ORDER BY t.tgname COLLATE "C";
```

---

## Section 6 — FR-4 scope correction: the handoff.js internal write surface

Added 2026-08-23 after a dispatching-session correction. **Verified independently by full-file reads and an exhaustive scan of all 345 files under `scripts/modules/handoff/` (40 write sites found), not by trusting the reported line numbers.**

### 6a. `SDRepository.updateStatus()` is dead code — CONFIRMED

| check | result |
|---|---|
| `git grep -n "updateStatus"` across repo | Only the **definition** (`SDRepository.js:158`) and two `console.log` strings inside it (`:173`, `:205`). Zero invocations. |
| `sdRepo.<method>` call sites | `sdRepo.getById` ×8, `sdRepo.verifyExists` ×3. **`updateStatus` never appears.** |
| Dynamic dispatch (`['updateStatus']`, computed access) | none |
| Is the class itself live? | Yes — `HandoffOrchestrator.js:80` does `this.sdRepo = options.sdRepo || new SDRepository(this.supabase)`. The class is live; **this one method is not.** |

**Disposition changed: `allowlist` → `no_action_needed`** (`scripts/modules/handoff/db/SDRepository.js:158-211`, write shape `const updateData = { status, ...metadata, updated_at }; if (phase) updateData.current_phase = phase;` → `.update(updateData).eq('id', canonicalId).select('id').single()`). Do not spend an allowlist slot on it. Note it also carries a `.select('id').single()` silent-failure check — if EXEC ever revives it, that check will surface trigger rejections as `no data` errors rather than as the trigger's own SQLSTATE.

### 6b. The real handoff-internal surface — 13 own-UPDATE sites in 11 files

All are `disposition: allowlist` under the **single registry identity `handoff.js`**. **Every one issues its own separate `.update()` → its own separate SQL UPDATE statement**; none share a statement with another site. Verified by reading each call site.

| # | file:line | write_shape | protected cols | own stmt |
|---|---|---|---|---|
| 1 | `executors/lead-to-plan/state-transitions.js:39` | `.update({ current_phase: snapshot.current_phase, status: snapshot.status, updated_at }).eq(queryField, sdId)` — **rollback path** | status, current_phase | yes |
| 2 | `executors/lead-to-plan/state-transitions.js:101` | `.update({ current_phase: 'PLAN_PRD', status: 'in_progress', updated_at }).eq(queryField, sdId)` — **legacy non-atomic fallback** when the RPC is unavailable | status, current_phase | yes |
| 3 | `executors/plan-to-exec/state-transitions.js:35` | `.update({ current_phase: snapshot.sd_phase, status: snapshot.sd_status, is_working_on: snapshot.sd_is_working_on, updated_at }).eq(queryField, sdId)` — rollback | status, current_phase | yes |
| 4 | `executors/plan-to-exec/state-transitions.js:130` | `.update({ current_phase: 'EXEC', status: 'active', is_working_on: true, updated_at }).eq(queryField, sdId)` | status, current_phase | yes |
| 5 | `executors/exec-to-plan/state-transitions.js:141` | `.update({ current_phase: 'EXEC_COMPLETE', updated_at }).eq('id', sdCanonicalId).select('id').single()` | current_phase | yes |
| 6 | `executors/plan-to-lead/index.js:497` | `.update({ status: 'pending_approval', current_phase: 'LEAD', updated_at }).eq('id', sdCanonicalId || sdId)` | status, current_phase | yes |
| 7 | `executors/plan-to-lead/state-transitions.js:522` | `.update({ status: 'pending_approval', current_phase: 'LEAD', updated_at }).eq('id', sdCanonicalId).select('id').single()` | status, current_phase | yes |
| 8 | `executors/lead-final-approval/cas-completion.js:29` | `.update(updateFields).eq('id', sd.id).eq('status', 'pending_approval').select('id')` — **CAS-guarded**; caller (`lead-final-approval/index.js:626-634`) supplies `{ status:'completed', current_phase:'COMPLETED', completion_date, … }` | **all 3** (via caller) | yes |
| 9 | `executors/lead-to-plan/gates/transition-readiness.js:60` | `.update({ status: 'draft', is_active: true }).eq('id', sd.id)` — auto-reactivation inside a **gate** | status | yes |
| 10 | `lib/orchestrator-terminal-guard.js:72` | `.update({ status: 'pending_approval', updated_at }).eq('id', sd.id).neq('status', 'completed')` | status | yes |
| 11 | `skip-and-continue.js:137` | `.update({ status: 'blocked', metadata: blockedMetadata, updated_at }).eq('id', sdId).eq('updated_at', currentSD.updated_at)` — **optimistic lock** | status | yes |
| 12 | `cli/execution-helpers.js:81` | `.update({ status: expected.status, current_phase: expected.current_phase, updated_at }).eq('id', sd.id)` — **post-handoff drift reconciliation**, fires only when live state differs from expected | status, current_phase | yes |
| 13 | `db/SDRepository.js:187` | `.update(updateData).eq('id', canonicalId).select('id').single()` | status, current_phase | **DEAD — 0 callers** |

Plus **2 RPC entry points** (4 call sites, 2 of which are availability probes):

| file:line | RPC | note |
|---|---|---|
| `executors/lead-to-plan/atomic-transitions.js:44` | `fn_atomic_lead_to_plan_transition` | real transition |
| `executors/lead-to-plan/atomic-transitions.js:93` | same | availability probe (`p_sd_id: 'TEST-AVAILABILITY-CHECK-NOT-A-REAL-SD'`) |
| `executors/exec-to-plan/atomic-transitions.js:160` | `fn_atomic_exec_to_plan_transition` | real transition |
| `executors/exec-to-plan/atomic-transitions.js:240` | same | availability probe (`p_sd_id: 'TEST-AVAILABILITY-CHECK'`) |

**Total distinct stamp-wiring points inside the handoff pipeline: 15** (12 reachable own-UPDATE sites + 1 dead + 2 RPC bodies). FR-4 names 2.

### 6c. Corrections to the correction — three cited files do NOT write protected columns

Verified by full read; each was checked because it was named as a required allowlist row.

| file | claim | measured reality | disposition |
|---|---|---|---|
| `executors/plan-to-exec/gates/exec-boundary-hold.js:97` | "a GATE FILE that ALSO directly writes `.update()` to strategic_directives_v2" | Writes **only `metadata`**: `.update({ metadata: { ...ctx.sd.metadata, exec_boundary_hold: false, exec_boundary_hold_cleared_by: 'switchon-gate-auto', exec_boundary_hold_cleared_at, exec_boundary_hold_auto_clear_evidence } }).eq('sd_key', ctx.sd.sd_key)`. **No protected column.** | `no_action_needed` |
| `orchestrator-completion-guardian.js` (~697, ~720) | "more direct updates … it DOES write other status values directly" | All three `strategic_directives_v2` touches (`:69`, `:90`, `:128`) are **`.select()`** — read-only. Its `.update()` calls at `:697`, `:720`, `:775` target **`retrospectives`**, **`sd_scope_deliverables`**, **`issue_patterns`** — different tables. The `status:'completed'` at `:586` is on **`product_requirements_v2`**. Its own comment at `:741-743` (SD-FDBK-FIX-ORCHESTRATOR-GHOST-COMPLETE-001) confirms it delegates SD staging to `routeOrchestratorToLeadFinal()`, i.e. row 10 above. **Zero own writes to `strategic_directives_v2`.** | `no_action_needed` |
| `executors/exec-to-plan/state-transitions.js` (~103-111, `.update({completed_by, completed_at})` at ~119) | direct SDv2 update sites | Lines 100-113 are `.from('product_requirements_v2').update({ status:'verification', phase:'verification', updated_at })` — **a different table**. The only SDv2 write in this file is `:141` (row 5 above). | n/a — already row 5 |

Also worth noting: `orchestrator-completion-hook.js:696` (a **different file** from the guardian) writes `.update({ metadata: { ...currentMetadata, completion_audit: newAudit } })` — metadata only, `no_action_needed`.

### 6d. Concurrency-predicate interaction — new risk for FR-4's atomicity criteria

Three of the 12 reachable sites carry their own row-level concurrency predicate:

- `cas-completion.js:29` — `.eq('status', 'pending_approval')` (compare-and-swap)
- `orchestrator-terminal-guard.js:72` — `.neq('status', 'completed')`
- `skip-and-continue.js:137` — `.eq('updated_at', currentSD.updated_at)` (optimistic lock)

A BEFORE UPDATE trigger fires **per qualifying row**. When these predicates filter the row out, the statement affects 0 rows and **the trigger never fires** — so a rejection and a lost CAS race are indistinguishable at the call site, since both surface as "0 rows". `cas-completion.js` already collapses this: `return { won: Array.isArray(data) && data.length > 0 }`, so a trigger rejection would be silently reported as `won: false` — i.e. **"another session won the race"** rather than **"your write was rejected for lack of a stamp"**. EXEC must ensure the guard raises a distinguishable SQLSTATE *and* that these three call sites propagate it rather than folding it into their existing 0-row branch. This is the same silent-failure class the `.select('id').single()` checks elsewhere in the pipeline exist to catch.

### 6e. Rollback paths — the guard can make failure recovery itself fail

**This is a distinct hazard class from the forward-path sites and needs its own EXEC decision.**

Two of the 12 reachable sites are **rollback/compensation** paths, not forward transitions:

| site | write_shape | fires when |
|---|---|---|
| `executors/lead-to-plan/state-transitions.js:39` (`rollbackSdState`) | `.update({ current_phase: snapshot.current_phase, status: snapshot.status, updated_at }).eq(queryField, sdId)` | a LEAD-TO-PLAN handoff has **already failed** and the executor is reverting the SD to its pre-handoff snapshot |
| `executors/plan-to-exec/state-transitions.js:35` | `.update({ current_phase: snapshot.sd_phase, status: snapshot.sd_status, is_working_on: snapshot.sd_is_working_on, updated_at }).eq(queryField, sdId)` | a PLAN-TO-EXEC handoff has **already failed** |

**The hazard**: these fire precisely when something has already gone wrong. If the rollback write is itself rejected for lacking a stamp, a **recoverable** handoff failure becomes a **stuck SD** — the forward transition is half-applied, the compensating write is blocked, and no automated path exists to restore consistency. The guard would convert a self-healing failure mode into one requiring manual DB intervention, which is the opposite of the invariant this SD exists to protect.

Both rollback handlers already swallow their errors — `if (error) { console.log('   ❌ Rollback failed: …') }` with no rethrow and no retry — so a stamp rejection here would be **logged and dropped**, not surfaced. Combined with §6d, that means a rejected rollback is invisible at every layer.

**Recommendation for EXEC**: rollback paths MUST carry the **same allowlist identity as their forward-path counterparts** (`handoff.js`), and must be stamped in the same change that stamps the forward path — never as a follow-up. Stamping `lead-to-plan/state-transitions.js:101` (forward) without `:39` (rollback) is strictly worse than stamping neither, because it lets the forward transition succeed while guaranteeing its compensation cannot run.

**Test requirement**: the EXEC acceptance criteria should include a negative test that forces a mid-handoff failure and asserts the rollback write still lands — not merely that the forward transition is stamped. A green forward-path test proves nothing about the compensation path, and the compensation path is the one that only executes under conditions the happy-path suite never creates.
