# Trigger-Estate Audit — SD-LEO-INFRA-TRIGGER-ESTATE-AUDIT-001

- **Category**: Report
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Delta (autonomous worker, session c5f7bdb9) — read-only audit
- **Last Updated**: 2026-06-10
- **Tags**: triggers, database, governance, null-safety, audit

> READ-ONLY AUDIT. No trigger or function was modified by this SD. All function
> bodies were **live-sourced** from `pg_proc.prosrc` via the Supabase MCP SQL
> interface on 2026-06-10 (live sourcing is ground truth — trigger functions can
> exist in NO repo migration; verified prior lesson, SD-FDBK-FIX-ROOT-FIX-TRG-001).

## 1. Estate overview

421 non-internal triggers exist on public-schema tables. Live counts (pg_trigger,
2026-06-10) for the top tables — these reconcile exactly with the chairman
data-layer scan (.claude/data-layer-scan-results.json):

| Table | Triggers |
|---|---|
| strategic_directives_v2 | **51** |
| ventures | 11 |
| sd_phase_handoffs | 9 |
| product_requirements_v2 | 7 |
| retrospectives | 7 |
| sub_agent_execution_results | 6 |
| brand_genome_submissions | 6 |
| user_stories | 5 |
| eva_vision_documents | 5 |
| protocol_improvement_queue | 5 |
| chairman_decisions | 5 |
| (remaining ~300 tables) | ≤4 each |

**Governance core deep-dive scope: the 6 hottest tables = 91 triggers, all
individually inventoried below.** Every SD write fires up to 51 trigger paths.

### Audit tiering (honest disclosure)

- **Deep-read** (full body analysis): 26 functions — all 16 AFTER cross-table
  writers (the write-amplifiers) + the 10 highest-risk BEFORE validators.
- **Mapped** (name/timing/function/purpose, body not deep-read): the remaining
  shared-utility and small validators (most <1.5KB; the five `updated_at`
  stampers are 52–68 chars each).
- Already-analyzed elsewhere and **not re-audited**: `fn_handle_capability_lifecycle`
  (fixed + hardened in PR #4540 incl. the second sd_uuid→id FK bug) and
  `auto_validate_retrospective_quality` (count-based rubric is INTENTIONAL per its SD).

## 2. Findings (evidence-graded, net of shipped fixes)

### F-1 (HIGH) — Unguarded `::UUID` casts on metadata in SD-completion AFTER triggers
**Where**: `record_mttr_on_sd_completion` — `(NEW.metadata->>'proposal_id')::UUID`;
`fn_emit_sd_completed_event` — `(NEW.metadata->>'venture_id')::UUID`.
**Why it matters**: this is the *exact* class that caused the trg_capability_lifecycle
incident — if a non-UUID string ever lands in `metadata.proposal_id` /
`metadata.venture_id`, the cast throws inside an AFTER UPDATE trigger on the
completion transition and **rolls back the SD completion write**. Neither function
has an outer exception guard. `record_mttr` additionally INSERTs into
`pipeline_metrics` unguarded.
**Remediation shape**: wrap both bodies in `BEGIN…EXCEPTION WHEN OTHERS THEN RAISE
WARNING…RETURN NEW` (the pattern their siblings `fn_auto_close_deliverables` /
`fn_auto_close_quick_fixes` and `trg_fn_resolve/reset_patterns` already use), and/or
guard the casts with a regex check.

### F-2 (MEDIUM) — `fn_auto_close_feedback_on_sd_completion` lacks the exception guard its siblings have
**Where**: AFTER UPDATE on SDv2 completion; two UPDATEs against `feedback`.
**Evidence**: `fn_auto_close_deliverables_on_sd_completion` and
`fn_auto_close_quick_fixes_on_sd_completion` both end with
`EXCEPTION WHEN OTHERS THEN RAISE WARNING … RETURN NEW;` — the feedback variant has
**no** such guard. Any feedback-table constraint failure (e.g. a future CHECK like
`chk_feedback_terminal_resolution`) aborts SD completion. Completion writes are
sacred (ROOT-FIX-TRG doctrine).

### F-3 (MEDIUM) — `MAX+1` concurrency races in two INSERT-path triggers
**Where**: `fn_sync_sd_to_baseline` (BEFORE: `MAX(sequence_rank)+1` per baseline on
every SD INSERT) and `assign_sequence_rank` (`MAX(sequence_rank)+1` table-wide).
**Why it matters**: two concurrent SD inserts (routine under fleet parallelism, 6+
workers) read the same MAX and write duplicate ranks — or, if a unique constraint
ever lands, abort SD creation. `fn_sync_sd_to_baseline` also has **no exception
guard**: a failed baseline-item INSERT aborts the SD INSERT itself.
**Note**: `fn_sync_sd_to_baseline` INSERTs a `sd_baseline_items` row for *every* SD
created (when an active baseline exists) and nothing deletes them when SDs are
cancelled/deleted — this is a concrete growth mechanism consistent with the
motivating 13k-orphan incident on that table.

### F-4 (MEDIUM) — Deliverable auto-completion double-stamp (overlapping triggers)
**Where**: `sub_agent_execution_results` — a GITHUB PASS INSERT fires BOTH
`trg_complete_deliverables_on_github_pass` (hardcoded 5 deliverable types,
`completion_status = 'pending'` filter) AND
`trigger_complete_deliverables_on_subagent` (mapping-table-driven,
`completion_status != 'completed'` filter).
**Why it matters**: same rows can be stamped twice with different
evidence/verified_by, last-writer-wins inside one statement chain; the two
filters (`= 'pending'` vs `!= 'completed'`) encode subtly different vocabularies.
Consolidation candidate: fold the GITHUB special case into the mapping table.

**RESOLVED (2026-07-04, SD-FDBK-FIX-TRIGGER-AUDIT-MEDIUM-001)**: live inspection
confirmed GITHUB had zero rows in `sd_subagent_deliverable_mapping` (the overlap
was latent, never actively double-firing) and that 2 of the hardcoded trigger's
5 types (`api_endpoint`, `database_change`) never matched real data (actual
`sd_scope_deliverables.deliverable_type` values are `api`/`database`). Fix:
seeded GITHUB's existing 5-type vocabulary into `sd_subagent_deliverable_mapping`
and dropped `trg_complete_deliverables_on_github_pass` /
`complete_deliverables_on_github_pass()` entirely
(`database/migrations/20260704_consolidate_github_deliverable_completion.sql`).
GITHUB PASS completions now flow through the single mapping-driven engine
(`complete_deliverables_on_subagent_pass`) like every other sub-agent — one
engine, one vocabulary. Verified via a live-DB test
(`tests/database/github-deliverable-completion-consolidation.test.js`) confirmed
failing pre-migration and passing post-migration, plus the full
`tests/database/` suite (205 tests) green with zero regression.

### F-5 (MEDIUM) — `progress` vs `progress_percentage` dual-column drift on SDv2
**Where**: both columns verified present in pg_attribute. `auto_transition_status`
(BEFORE UPDATE) keys off **`NEW.progress`** to flip status to `pending_approval`,
while the canonical write path (`auto_calculate_progress`,
`enforce_progress_on_completion`, `auto_recalculate_sd_progress`) maintains
**`progress_percentage`**.
**Why it matters**: the auto-transition can fire from a stale/legacy column the
rest of the estate no longer maintains — or never fire when it should. Vocabulary
drift class. Candidate: repoint `auto_transition_status` to `progress_percentage`
or retire it if superseded by handoff-driven transitions.

### F-6 (MEDIUM) — PK-mutating sync triggers (`sync_sd_code_user_facing`, `sync_uuid_internal_pk`)
**Where**: BEFORE INSERT/UPDATE on SDv2. `sync_sd_code_user_facing` **rewrites the
primary key `id`** when `sd_code_user_facing` changes; `sync_uuid_internal_pk`
twins `uuid_id`↔`uuid_internal_pk`.
**Why it matters**: an accidental write to `sd_code_user_facing` silently rewrites
the PK that every FK in the estate references. And the `uuid_id` twin column is the
documented source of the PR #4540 second bug (`uuid_id ≠ id` for 3,686/3,687 SDs —
the ledger FK silently failed for months). These twin-column bridges are standing
foot-guns; candidate for retirement after a column-consumer audit.

### F-7 (LOW-MEDIUM) — Redundant `updated_at` stampers on SDv2
**Where**: `update_sd_timestamp` (fn `update_updated_at`) AND
`update_strategic_directives_v2_updated_at` (fn `update_updated_at_column`) both
fire BEFORE UPDATE and both stamp `updated_at`.
**Why it matters**: pure waste (every SDv2 update runs both) and a trap for any
trigger-delta logic that must exclude auto-bumped columns. Drop one.

### F-8 (LOW) — `auto_calculate_progress` on every SDv2 UPDATE + recalc loop
**Where**: `auto_calculate_progress` calls `calculate_sd_progress(NEW.id)`
(multi-table aggregate) on every UPDATE where progress wasn't manually set;
`auto_recalculate_sd_progress` (AFTER UPDATE on sd_phase_handoffs) then UPDATEs
SDv2 — which re-fires all 51 SDv2 triggers including another
`calculate_sd_progress`. Bounded (no infinite loop — second pass sees no change),
but it's a 2× write-amplification on the hottest table. Perf-tuning candidate only.

### F-9 (LOW) — `try_auto_complete_parent_orchestrator` unguarded call chain
**Where**: calls `complete_orchestrator_sd()` inline (AFTER UPDATE on child
completion). It returns a success JSONB rather than throwing in the observed
contract, but there is no outer exception guard if it ever throws — a child's
completion would roll back. Same guard pattern as F-1/F-2 applies.

### Clean bills (deep-read, no findings)
- `fn_emit_sd_completed_event` mechanics aside from the F-1 cast: NULL-safe venture
  resolution, idempotency key + `ON CONFLICT DO NOTHING` ✓
- `sync_ventures_to_eva_ventures_insert/update`: is_demo guard (PLAN-KEEPER-F fix),
  CASE-mapped enum with safe default ✓
- `fn_tombstone_application_on_venture_retire`: defensive enum `::text` cast,
  idempotent live-row filter ✓
- `create_postmortem_on_venture_failure`: defensive `::text` cast ✓
- `enforce_metadata_object`: exemplary defensive normalizer (string/array/null
  metadata all handled) ✓
- `enforce_handoff_on_phase_transition` + `enforce_progress_on_completion`:
  guarded bypass var reads, structured errors with remediation text ✓
- `trg_fn_resolve/reset_patterns_*`: failure isolation done right ✓
- `complete_deliverables_on_subagent_pass`: `pg_trigger_depth()` recursion guard ✓

## 3. Governance-core inventory (91 triggers)

### strategic_directives_v2 (51)

| Trigger | Timing/Event | Function | Purpose (one-line) |
|---|---|---|---|
| audit_strategic_directives | AFTER I/U/D | governance_audit_trigger | Audit-row writer (shared w/ PRD) |
| auto_assign_sequence_rank | BEFORE INS | assign_sequence_rank | MAX+1 rank (F-3) |
| auto_calculate_progress_trigger | BEFORE UPD | auto_calculate_progress | Recompute progress_percentage (F-8) |
| check_sd_hierarchy | BEFORE I/U | validate_sd_hierarchy | Parent/child shape check |
| enforce_handoff_trigger | BEFORE UPD | enforce_handoff_on_phase_transition | PCVP: handoff evidence per phase transition |
| enforce_progress_trigger | BEFORE UPD | enforce_progress_on_completion | Block completion <100% / no EXEC handoff |
| status_auto_transition | BEFORE UPD | auto_transition_status | progress→pending_approval flip (F-5) |
| tr_check_intensity_required | BEFORE UPD | check_intensity_required | Refactor intensity gate |
| tr_enforce_business_value_gate | BEFORE UPD | enforce_business_value_gate | Business-value gate |
| tr_enforce_no_claim_on_cancelled_sd | BEFORE UPD | enforce_no_claim_on_cancelled_sd | Claim guard on cancelled SDs |
| tr_notify_working_sd | AFTER UPD | notify_working_sd_change | NOTIFY on working-SD change |
| tr_retro_notification | AFTER UPD | trigger_retro_notification | Retro nudge on completion |
| tr_sd_baseline_sync | AFTER I/U | fn_sync_sd_to_baseline | Baseline item sync (F-3) |
| tr_sd_completed_event | AFTER UPD | fn_emit_sd_completed_event | EVA event on completion (F-1 cast) |
| trg_aaa_sync_type_change_reason | BEFORE UPD | sync_type_change_reason | Type-change reason twin-sync |
| trg_auto_close_deliverables_on_sd_completion | AFTER UPD | fn_auto_close_deliverables_on_sd_completion | Close deliverables (guarded ✓) |
| trg_auto_close_feedback_on_sd_completion | AFTER UPD | fn_auto_close_feedback_on_sd_completion | Close feedback (F-2: unguarded) |
| trg_auto_close_quick_fixes_on_sd_completion | AFTER UPD | fn_auto_close_quick_fixes_on_sd_completion | Cancel superseded QFs (guarded ✓) |
| trg_auto_complete_parent_orchestrator | AFTER UPD | try_auto_complete_parent_orchestrator | Parent auto-complete (F-9) |
| trg_auto_set_is_parent | AFTER I/U | auto_set_is_parent | is_parent maintenance |
| trg_auto_validate_sd_content_quality | BEFORE I/U | auto_validate_sd_content_quality | Content-quality score |
| trg_capability_lifecycle | AFTER UPD | fn_handle_capability_lifecycle | Capability ledger (fixed PR #4540) |
| trg_check_contract_requirements | BEFORE I/U | check_contract_requirements | Contract governance |
| trg_doctrine_constraint_sd | BEFORE I/U | enforce_doctrine_of_constraint | Doctrine of constraint (shared w/ PRD) |
| trg_enforce_child_creation_timing | BEFORE INS | enforce_child_creation_timing | Child timing gate |
| trg_enforce_metadata_object | BEFORE I/U | enforce_metadata_object | Metadata normalizer (clean ✓) |
| trg_enforce_orphan_protection | BEFORE UPD | enforce_orphan_protection | Orphan guard |
| trg_enforce_parent_orchestrator_type | AFTER I/U | enforce_parent_orchestrator_type | Parent type rule |
| trg_enforce_sd_quality_advancement | BEFORE UPD | enforce_sd_quality_on_advancement | Quality floor on advancement |
| trg_enforce_sd_type_change_explanation | BEFORE UPD | enforce_sd_type_change_explanation | Type-change explanation |
| trg_enforce_sd_type_change_governance | BEFORE UPD | enforce_sd_type_change_governance | Type-change governance |
| trg_enforce_sd_type_change_risk | BEFORE UPD | enforce_sd_type_change_risk | Type-change risk |
| trg_enforce_type_change_timing | BEFORE UPD | enforce_type_change_timing | Type-change timing |
| trg_inherit_contracts_on_insert | BEFORE INS | inherit_parent_contracts | Contract inheritance (INS) |
| trg_inherit_contracts_on_update | BEFORE UPD | inherit_parent_contracts | Contract inheritance (UPD twin) |
| trg_inherit_parent_metadata | BEFORE INS | inherit_parent_metadata | Metadata inheritance (INS) |
| trg_inherit_parent_metadata_update | BEFORE UPD | inherit_parent_metadata | Metadata inheritance (UPD twin) |
| trg_prevent_child_exec_before_parent_approval | BEFORE UPD | prevent_child_exec_before_parent_approval | Child EXEC gate |
| trg_record_mttr_on_sd_completion | AFTER UPD | record_mttr_on_sd_completion | MTTR metric (F-1 cast) |
| trg_record_sd_completion_signal | AFTER UPD | fn_record_sd_completion_signal | Outcome signal (ON CONFLICT ✓) |
| trg_require_cancellation_reason | BEFORE UPD | trg_require_cancellation_reason | Cancellation reason gate |
| trg_reset_patterns_on_sd_cancel | AFTER UPD | trg_fn_reset_patterns_on_sd_cancel | Pattern reset (guarded ✓) |
| trg_resolve_patterns_on_sd_complete | AFTER UPD | trg_fn_resolve_patterns_on_sd_complete | Pattern resolve (guarded ✓) |
| trg_sd_creation_source_advisory | AFTER INS | check_sd_creation_source | Creation-source advisory |
| trg_sd_governance_metadata_audit | BEFORE UPD | trg_audit_governance_metadata | Governance metadata audit |
| trg_sync_sd_code_user_facing | BEFORE I/U | sync_sd_code_user_facing | PK twin-sync (F-6) |
| trg_sync_uuid_internal_pk | BEFORE I/U | sync_uuid_internal_pk | uuid twin-sync (F-6) |
| trigger_warn_sd_kr_alignment | BEFORE UPD | warn_on_sd_transition_without_kr | KR-alignment advisory |
| update_sd_timestamp | BEFORE UPD | update_updated_at | updated_at stamper (F-7 dup) |
| update_strategic_directives_v2_updated_at | BEFORE UPD | update_updated_at_column | updated_at stamper (F-7 dup) |
| validate_child_sd_sequence | BEFORE UPD | validate_child_sd_sequence | Child sequence check |

### ventures (11)

| Trigger | Timing/Event | Function | Note |
|---|---|---|---|
| auto_populate_company_id_trigger | BEFORE INS | auto_populate_venture_company_id | company_id default |
| enforce_tier0_stage_cap | BEFORE I/U | prevent_tier0_stage_progression | Tier-0 cap |
| trg_enforce_stage0_origin | BEFORE INS | trg_enforce_stage0_origin | Stage-0 origin gate |
| trg_sync_stage_work_on_advance | BEFORE UPD | fn_sync_stage_work_on_advance | Stage-work sync |
| trg_tombstone_application_on_venture_delete | BEFORE DEL | fn_tombstone_application_on_venture_retire | Tombstone (clean ✓) |
| trg_tombstone_application_on_venture_kill | AFTER UPD | fn_tombstone_application_on_venture_retire | Tombstone twin (intentional dual-path) |
| trg_validate_stage_column | BEFORE I/U | fn_validate_stage_column | Stage column check |
| trg_ventures_insert_sync_eva | AFTER INS | sync_ventures_to_eva_ventures_insert | EVA mirror (is_demo guard ✓) |
| trg_ventures_update_sync_eva | AFTER UPD | sync_ventures_to_eva_ventures_update | EVA mirror (is_demo guard ✓) |
| trigger_create_postmortem_on_failure | AFTER UPD | create_postmortem_on_venture_failure | Postmortem (clean ✓) |
| update_ventures_updated_at | BEFORE UPD | update_ventures_updated_at | updated_at stamper |

### sd_phase_handoffs (9)

| Trigger | Timing/Event | Function | Note |
|---|---|---|---|
| enforce_handoff_creation | BEFORE INS | enforce_handoff_system | Handoff-system gate |
| trg_enforce_is_working_on_handoffs | BEFORE INS | enforce_is_working_on_for_handoffs | Working-flag gate |
| trigger_handoff_accepted_at | BEFORE UPD | auto_update_handoff_accepted_at | accepted_at stamp |
| trigger_handoff_rejected_at | BEFORE UPD | auto_update_handoff_rejected_at | rejected_at stamp |
| trigger_protect_migrated | BEFORE UPD | protect_migrated_handoffs | Migrated-row guard |
| trigger_sd_progress_recalc | AFTER UPD | auto_recalculate_sd_progress | SDv2 progress write-back (F-8 loop) |
| trigger_verify_deliverables_before_handoff | BEFORE UPD | verify_deliverables_before_handoff | Deliverable gate (UPD) |
| trigger_verify_deliverables_before_handoff_insert | BEFORE INS | verify_deliverables_before_handoff | Deliverable gate (INS twin) |
| validate_handoff_trigger | BEFORE I/U | auto_validate_handoff | 7-element validation |

### product_requirements_v2 (7)

| Trigger | Timing/Event | Function | Note |
|---|---|---|---|
| audit_product_requirements | AFTER I/U/D | governance_audit_trigger | Shared audit writer |
| planning_section_auto_update_trigger | BEFORE I/U | update_planning_section_from_reasoning | Planning section sync |
| trg_doctrine_constraint_prd | BEFORE I/U | enforce_doctrine_of_constraint | Shared doctrine fn |
| trg_prd_creation_source_advisory | AFTER INS | check_prd_creation_source | Creation-source advisory |
| trg_validate_integration_section_keys | BEFORE I/U | validate_integration_section_keys | Integration-keys shape |
| trigger_sync_prd_sd_linking | BEFORE I/U | sync_prd_sd_linking | SD link sync |
| update_prd_timestamp | BEFORE UPD | update_updated_at | updated_at stamper |

### retrospectives (7)

| Trigger | Timing/Event | Function | Note |
|---|---|---|---|
| tr_retrospectives_updated | BEFORE UPD | update_retrospective_timestamp | updated_at stamper |
| trg_retrospectives_audit_trigger | AFTER I/U/D | trg_retrospectives_audit | Audit writer |
| trg_validate_retrospective_coverage | BEFORE I/U | validate_retrospective_coverage | Coverage check |
| trg_validate_retrospective_target_application | BEFORE I/U | validate_retrospective_target_application | target_application gate (NOT NULL class) |
| trigger_auto_populate_retrospective_fields | BEFORE I/U | auto_populate_retrospective_fields | Field defaults |
| validate_protocol_improvements_trigger | BEFORE I/U | validate_protocol_improvements_for_process_category | PROCESS-category rule |
| validate_retrospective_quality_trigger | BEFORE I/U | auto_validate_retrospective_quality | Quality recompute (INTENTIONAL — overrides inserted scores) |

### sub_agent_execution_results (6)

| Trigger | Timing/Event | Function | Note |
|---|---|---|---|
| strip_nested_findings_trigger | BEFORE I/U | strip_nested_findings_from_metadata | Metadata slimming |
| trg_complete_deliverables_on_github_pass | AFTER INS | complete_deliverables_on_github_pass | GITHUB special-case (F-4 overlap) |
| trg_warn_testing_verdict | AFTER I/U | warn_testing_verdict | TESTING advisory |
| trigger_complete_deliverables_on_subagent | AFTER INS | complete_deliverables_on_subagent_pass | Mapping-driven completion (F-4) |
| trigger_complete_deliverables_on_subagent_update | AFTER UPD | complete_deliverables_on_subagent_pass | UPD twin |
| update_sub_agent_results_timestamp | BEFORE UPD | update_sub_agent_results_updated_at | updated_at stamper |

## 4. Consolidation candidates (proposals only — NOT executed)

1. **Drop one SDv2 `updated_at` stamper** (F-7) — trivial, zero risk.
2. **Fold `complete_deliverables_on_github_pass` into the mapping table** (F-4) —
   one completion engine, one vocabulary.
3. **Retire or repoint `auto_transition_status`** (F-5) after confirming the
   `progress` column's remaining writers.
4. **Twin-column bridge retirement** (F-6): `sd_code_user_facing` and
   `uuid_id`/`uuid_internal_pk` — needs a consumer audit first (see PR #4540's
   id/uuid_id reconcile open item ff07e575).
5. **Guard pack**: one migration adding outer exception guards to the four
   unguarded completion-path AFTER triggers (F-1, F-2, F-9) — the highest-value
   single change in this audit.

## 5. Durable routing

MEDIUM+ findings filed as feedback rows (ids recorded in the SD completion flags):
F-1, F-2, F-3, F-4, F-5, F-6. LOW findings (F-7, F-8, F-9) live in this artifact
and the consolidation list.
