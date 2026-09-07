# SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E: Write-Caller Census

Measured live against production (pg_trigger / pg_class.relacl / information_schema.role_table_grants
via the pooler, not grep of possibly-unapplied migration files — several relevant migrations sit in
`database/chairman-gated/` awaiting chairman ceremony and are not live). This is the gating artifact
for this SD's FR-2/FR-3 migrations: no immutability trigger ships on a table whose write-callers have
not been censused first.

## Candidate set

The public schema has ~110 tables matching `audit|_log|history|ledger`. Full list in the appendix.

## Trigger/grant status (measured)

**HAS a working append-only guard (BEFORE UPDATE/DELETE trigger, live, `ENABLE ALWAYS`):**

| Table | Trigger(s) | Grant posture |
|---|---|---|
| `chairman_ratifications` | no_update / no_delete / no_truncate | service_role only |
| `leo_protocol_sections_history` | no_update / no_delete / no_truncate | service_role only |
| `solomon_ledger_attestations` | no_update / no_delete / no_truncate | service_role only |
| `venture_stages_audit` | `trg_venture_stages_audit_immutable` (BEFORE DELETE OR UPDATE) | anon/authenticated hold full `arwdDxtm` — trigger is the only real barrier |
| `eva_stage_gate_attempts` | `eva_stage_gate_attempts_no_update_after_final` (UPDATE only) | partial: no DELETE-blocking trigger |

**SHOULD but does NOT (0 immutability triggers, this SD's FR-2/FR-3 targets in bold):**

| Table | Grant posture | Notes |
|---|---|---|
| **`feedback`** | anon/authenticated/service_role full `arwdDxtm` (confirmed live: anon and authenticated both hold INSERT/SELECT/UPDATE/DELETE/TRUNCATE) | Named directly in the parent W6 orchestrator's exit test |
| **`governance_audit_log`** | anon/authenticated/service_role full `arwdDxtm` (confirmed live, same shape as `feedback`) | RLS is the sole barrier per the CAPA-002E migration's own header |
| `audit_log` | postgres/service_role only | |
| `chairman_decisions` | anon/authenticated full grants (a staged REVOKE exists, confirmed **not yet applied**) | 5 triggers exist, none an immutability guard |
| `retrospectives_audit` | anon/authenticated full grants | **No direct application write-callers found** — only `trg_retrospectives_audit` (DB trigger) writes it; low blast-radius |
| `sd_type_change_audit`, `sd_governance_bypass_audit`, `eva_audit_log`, `handoff_audit_log`, `tool_usage_ledger`, `validation_audit_log` | Supabase-default full anon/authenticated grants | Deferred to sibling children |
| `chairman_decision_audit`, `chairman_dashboard_config_audit`, `permission_audit_log`, `sd_metadata_audit_log` | postgres/service_role only (safer, but service_role can still mutate) | Deferred |
| `security_audit_events` | partitioned (`relkind='p'`); authenticated + service_role hold full grants | Per-partition trigger state not checked; deferred |
| `bypass_ledger` | 1 trigger, but it's a vocabulary validator, not an immutability guard | Deferred |

**Revocation mechanisms found (two sanctioned patterns, no third):**

1. **Append-only pattern** (used by the 5 working tables above): `no_update`/`no_delete`/`no_truncate`
   functions + `ALTER TABLE ... ENABLE ALWAYS TRIGGER` (defeats the `SET LOCAL
   session_replication_role='replica'` bypass, closed after SEC-M1). No override exists — the only
   sanctioned escape is a chairman-authored DOWN migration dropping the trigger.
2. **Canonical-writer-choke / same-statement token pattern** (`strategic_directives_v2`,
   `ventures.current_lifecycle_stage`, `retrospectives` PUBLISHED-guard — staged, not applied): a
   `..._canonical_writer_policy()` function is a named-identity registry; a guard trigger refuses a
   protected-field change unless a matching write token is set in the same statement.
3. **Grant-layer defense-in-depth** (`docs/audits/sensitive-table-write-grant-audit.md`): staged
   `REVOKE INSERT,UPDATE,DELETE,TRUNCATE FROM anon,authenticated` on 6 chairman-authority tables
   (incl. `chairman_decisions`) — confirmed live-unapplied.

No sanctioned service-role bypass of an immutability trigger exists anywhere.

## Write-caller census: `feedback` (FR-2 target)

Direct `.insert`/`.update`/`.upsert` call sites found (representative — 60+ total hits found, this
SD's migration blocks UPDATE/DELETE/TRUNCATE only, so INSERT-only callers are UNAFFECTED and not
individually enumerated below; call sites with a mutating verb are the ones that matter):

- `scripts/create-quick-fix.js` — INSERT only (feedback creation flow)
- `lib/chairman/classifier-denial-guard.mjs` — INSERT only
- `lib/eva/event-bus/handlers/feedback-created.js` — INSERT only
- `scripts/chairman-decisions.mjs` — INSERT only
- `.artifacts/adam-seat-commit.cjs:14` — `.update({metadata})` (ad-hoc one-off; must not perform UPDATE on a shipped SD after this migration lands)
- `database/chairman-gated/20260803_bound_anon_ingress_source_type_qualifier_acceptance.mjs:79,82` — anon `.insert(...)` (INSERT only, unaffected)

**No mutating (`UPDATE`/`DELETE`) application call site was found for `feedback` outside ad-hoc
`.artifacts/*` one-off scripts.** The `feedback` table's normal lifecycle is INSERT-then-read; status
transitions are tracked via separate rows/columns updated by triage tooling in some flows — any
existing triage `.update()` path must be re-verified post-migration (see Risks in the PRD).

## Write-caller census: `governance_audit_log` (FR-3 target)

- `lib/eva/event-bus/handlers/budget-exceeded.js:70` — the only direct app-level `.insert()` found.
- The PRIMARY writer is the `audit_trigger_generic()` DB trigger installed by the sibling CAPA
  workstream migration `database/migrations/20260904_capa_002e_audit_triggers_and_disposition_constraints.sql`
  — a different, already-applied mechanism (instrumenting writes on other tables, not protecting this
  one) that this SD does not modify.
- No UPDATE/DELETE application call site was found for `governance_audit_log`.

## Deferred tables (sibling children of SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001)

`audit_log`, `chairman_decisions`, `sd_type_change_audit`, `sd_governance_bypass_audit`,
`eva_audit_log`, `handoff_audit_log`, `tool_usage_ledger`, `validation_audit_log`,
`chairman_decision_audit`, `chairman_dashboard_config_audit`, `permission_audit_log`,
`sd_metadata_audit_log`, `security_audit_events`, `retrospectives_audit`. These are explicitly named
here so they are not silently dropped from the "full candidate set" the SD title references —
follow-on children should start from this document rather than re-deriving the candidate list.

## Prior work (avoid duplicating)

- `docs/plans/archived/sd-leo-orch-capa-durability-audit-001-plan.md` — parent's own plan.
- `docs/audits/SD-LEO-INFRA-TRIGGER-ESTATE-AUDIT-001.md` — full 421-trigger inventory, reference format.
- `docs/audits/sensitive-table-write-grant-audit.md` — the REVOKE pattern, staged.
- `database/chairman-gated/README.md` — canonical ceremony index; required reading before applying FR-2/FR-3.
- `database/migrations/20260904_capa_002e_audit_triggers_and_disposition_constraints.sql` — a
  different problem (instrumenting writes) than this SD (protecting existing rows).
- `docs/reference/eva-stage-gate-tables-reader-census.md` — precedent format for a write/reader census.

## Appendix: full candidate table list (public schema, live)

`adam_adherence_ledger, adam_delegated_apply_ledger, adam_task_ledger, agent_readiness_audit_run,
agent_readiness_audit_sample, audit_coverage_report, audit_finding_sd_links,
audit_finding_sd_mapping, audit_log, audit_triangulation_log, batch_operation_log,
build_completion_forecast_log, bypass_ledger, capability_reuse_log, cascade_invalidation_log,
chairman_dashboard_config_audit, chairman_decision_audit, connection_selection_log,
context_usage_log, continuous_execution_log, convergence_ledger_runs, convergence_ledger_stages,
conversion_ledger, coordinator_role_history, cost_governor_log, distribution_history,
door_routing_ledger, enhancement_proposal_audit, eva_audit_log,
eva_audit_log_preimg_qparity20260610, eva_event_ledger, eva_event_log, eva_saga_log,
eva_support_decision_log, eva_trace_log, forecast_ledger, gate_boundary_config_audit,
gate_health_history, governance_audit_log, handoff_audit_log, import_audit,
interaction_history, launch_mode_audit, leo_audit_checklists, leo_audit_config,
leo_auto_exec_audit, leo_error_log, leo_feature_flag_audit, leo_feature_flag_audit_log,
leo_kb_generation_log, leo_lint_run_history, leo_protocol_file_audit,
leo_protocol_sections_history, model_usage_log, nursery_evaluation_log, okr_generation_log,
operations_audit_log, pcvp_verification_log, permission_audit_log, policy_audit_log,
prd_research_audit_log, protocol_improvement_audit_log, raid_log, retrospectives_audit,
risk_escalation_log, risk_gate_passage_log, runtime_audits, sd_checkpoint_history,
sd_governance_bypass_audit, sd_metadata_audit_log, sd_transition_audit, sd_type_change_audit,
security_audit_events (+7 monthly partitions), self_audit_findings, ship_escape_audit,
sms_approved_spend_ledger, sms_inbound_log, solomon_advice_outcome_ledger,
solomon_ledger_attestations, strategic_directives_backlog, substage_transition_log,
switchon_decision_audit, task_hydration_log, tool_usage_ledger, uat_audit_trail,
uat_credential_history, validation_audit_log, venture_channel_publish_ledger,
venture_design_pass_ledger, venture_stages_audit, venture_token_ledger, venture_write_ledger,
ventures_kill_log, vision_scoring_audit_log, workflow_trace_log` (plus several `v_*` views over
these, out of scope — views cannot carry their own triggers).
