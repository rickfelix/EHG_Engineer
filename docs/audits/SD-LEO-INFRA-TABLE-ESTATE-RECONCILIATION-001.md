# Table-Estate Reconciliation — Decision Matrix

**SD:** SD-LEO-INFRA-TABLE-ESTATE-RECONCILIATION-001 · **Date:** 2026-06-10 · **Worker:** Bravo (155eb55f)
**Evidence base:** `.claude/data-layer-scan-results.json` (chairman-directed data-layer review 2026-06-10; 7,640 files vs 708 live tables + 166 views), three parallel verification sweeps (EHG_Engineer classification grep, EHG-app cross-repo grep, module live-importer analysis), committed-SQL re-grep.
**Action taken by this SD: NONE.** Zero drops, zero module deletions, zero provisioning. Every row below is a routed decision.

---

## Part A — 91 "dead" tables, classified

The raw scan counted any live table with zero EHG_Engineer runtime/view/function references as dead. Verification found **40 of the 91 must be KEPT** — the raw inventory overstated the retire surface by ~78%.

### A1. Keep — lifecycle-managed (19)

| Category | Tables | Disposition |
|---|---|---|
| backup_quarantine (3) | management_reviews_quarantine_20260610 (45,015 rows), sd_baseline_items_purge_backup_20260609 (12,932), sd_baseline_items_recon_backup | Deliberate backups with their own cleanup lifecycle → retention owned by SD-LEO-INFRA-RETENTION-POLICY-UNBOUNDED-001 |
| partition_child (13) | security_audit_events_2026_05 … 2027_05 | Written via parent `security_audit_events` (live: lib/security/audit-events-emitter.js) — **scan false-positive class**: partition children never carry direct code refs |
| archive (1) | sub_agent_execution_results_archive (2,036 rows) | Archive twin of a hot table; retention decision → RETENTION-POLICY SD |
| test_only (2) | eva_friday_outcomes, eva_support_research_cache | Scan-flagged test fixtures, 0 rows |

### A2. Keep — actually referenced (21; scan false positives)

**EHG_Engineer code references (7):** ci_snapshots, competitor_intelligence (both live via the activated competitive-intelligence path), context_embeddings, design_pattern_usage, eva_automation_rules*, leo_workflow_phases, stage_data_contracts*.

**EHG app references (16, overlapping 2 above marked \*):** ai_gen_dwell_tracking, ai_gen_provenance, blueprint_board_submissions, blueprint_selection_signals, board_meetings, compliance_artifact_templates, eva_agent_communications, eva_automation_rules*, eva_friday_meetings, eva_orchestration_sessions, eva_preferences, eva_weekly_review_templates, market_segments, stage_data_contracts*, user_blueprint_bookmarks, user_organizations — each with concrete src/ hooks/services/components citations (e.g. `market_segments` ← src/services/customerIntelligence.ts).

> **Lesson encoded:** a single-repo reference scan cannot adjudicate a shared database. 16 tables that look dead from EHG_Engineer are the EHG app's data layer.

### A3. RETIRE CANDIDATES — chairman authorization required (51)

Backup-first protocol (quarantine copy + reversible DOWN per the PURGE-MGMT-REVIEWS recipe). Routed as a `needs_decision` flag.

**Genuinely dead — zero refs anywhere incl. EHG app, no migrations (26):**
blueprint_board_submissions†, cross_agent_correlations, documentation_templates, folder_structure_snapshot, leo_artifacts, leo_nfr_requirements, leo_protocol_references, leo_reasoning_triggers, leo_risk_spikes, okr_vision_alignment_records, opportunity_categories, retrospective_learning_links, retrospective_templates, retrospective_triggers, sd_dependency_graph, sd_state_transitions, sdip_ai_analysis, sensemaking_personas, sensemaking_telegram_sessions (6 rows), service_versions, stage_prop_contracts, submission_groups, telegram_bot_interactions (51 rows), telegram_conversations, telegram_forum_topics, workflow_recovery_state, user_navigation_analytics (112 rows).
† blueprint_board_submissions, user_blueprint_bookmarks, user_organizations, ai_gen_dwell_tracking, ai_gen_provenance moved to **A2 keep** (EHG-app referenced) — final genuinely-dead count: **26**.

**Migration-referenced only — schema shipped, feature never landed in code (25):**
agent_coordination_state, board_meeting_attendance, enhancement_proposal_audit, eva_artifact_dependencies, eva_friday_meeting_agenda, eva_weekly_review_templates‡, exec_handoff_preparations, exit_playbooks, global_competitors, learning_inbox, leo_codebase_validations, leo_complexity_thresholds, leo_handoff_validations, leo_mandatory_validations, nursery_evaluation_log, rca_auto_trigger_config, risk_templates, sd_session_activity, sdip_groups, sensemaking_knowledge_base, uat_credential_history, uat_performance_metrics, uat_screenshots, uat_test_schedules, venture_blueprints, voice_cached_responses.
‡ eva_weekly_review_templates, blueprint_selection_signals, board_meetings, compliance_artifact_templates, eva_agent_communications, eva_friday_meetings, eva_orchestration_sessions, eva_preferences, market_segments moved to **A2 keep** (EHG-app referenced) — final migration-only count: **25**.

**Net A3 retire batch: 51 tables.**

---

## Part B — Never-provisioned module decision matrix

A module referencing phantom tables is only a provisioning candidate if the **module itself has live importers**. Zero live importers = dead code referencing dead tables = retire-module, not provision.

| Module | Live importers | Recommendation | Evidence |
|---|---|---|---|
| lib/eva/services/ops-cost-governance.js | none (test only) | **RETIRE_MODULE** | No importer, no npm/cron/hook/api reachability |
| lib/governance/hard-halt-protocol.js | none | **RETIRE_MODULE** | Specification-without-callers; agent_audit_log/escalation_queue never provisioned |
| lib/testing/prd-playwright/* | none, no npm entry | **RETIRE_MODULE** | 4 phantom tables, zero reachability |
| lib/marketing/dashboard.js + feedback-loop.js | none | **RETIRE_MODULE** (these two files) | marketing_channel_metrics etc. referenced only by uncalled files |
| competitive-intelligence.js `market_defense_strategies`/`feature_coverage` paths | module live, paths dead | **RETIRE legacy paths** | Superseded by SD-LEO-INFRA-ACTIVATE-COMPETITIVE-INTELLIGENCE-001 (activated path = competitor_intelligence/ci_snapshots); saveAnalysis/loadAnalysis uncalled |
| lib/agents/venture-ceo/budget-manager.js | venture-ceo/index.js:20 → EVA CEO delegation | **PROVISION decision (chairman)** | agent_budgets/agent_budget_logs: live delegation path silently no-ops budget governance |
| lib/eva/intelligence-loader.js (okr_alignments) | corrective-sd-generator → eva:okr + heal pipelines | **PROVISION decision (chairman)** | Live healing pipeline reads a missing table (fail-soft today) |
| eva_worker_heartbeats (scripts/eva-health-check.cjs) | npm `eva:health` | **PROVISION-or-patch** | Health check queries a missing table — either provision or repoint to eva_scheduler_heartbeat |
| lib/marketing/ai/metrics-ingestor.js + optimization-loop.js | importer evidence inconclusive | **MARK_DORMANT pending marketing program** | Active marketing SDs exist; verify importers before any retire |
| scripts/human-like-e2e-retrospective.js | npm `test:e2e:retro` | **MARK_DORMANT** | Direct entry point; tables (human_like_e2e_*) never provisioned — dormant test infra |
| lib/flywheel/analytics.js | flywheel/index.js (speculative) | **MARK_DORMANT** | v_* views — check committed SQL under APPLY-RETIRE-COMMITTED scope first |
| scripts/leo-maintenance.js | npm `leo:maintenance` | **PROVISION-or-patch** | 3 phantom tables behind a live maintenance entry point |
| api/webhooks/github-ci-status.js (ci_cd_pipeline_retries) | webhook route | **Split**: retries=decide here (no SQL), status/resolutions→committed-SQL SD | See exclusions |

### Committed-SQL re-grep (4 ambiguous tables)
- ci_cd_failure_resolutions → **HAS committed SQL** (database/migrations/leo-ci-cd-integration.sql) → SD-LEO-INFRA-APPLY-RETIRE-COMMITTED-001
- uat_quality_gates_history → **HAS committed SQL** (uat-structured-reports.sql) → APPLY-RETIRE-COMMITTED-001
- ci_cd_pipeline_retries → no committed SQL → decided here (webhook split above)
- test_failures → no committed SQL → genuinely never-provisioned (test infra dormancy class)

---

## Exclusion ledger (owned elsewhere — not re-decided here)

| Slice | Owner SD |
|---|---|
| Committed-but-unapplied SQL objects (ci_cd_pipeline_status, sub_agent_activations, uat_reports, ci_cd_failure_resolutions, uat_quality_gates_history, never-applied v_* views) | SD-LEO-INFRA-APPLY-RETIRE-COMMITTED-001 (in_progress) |
| 782 phantom columns | SD-LEO-FIX-FIX-PHANTOM-COLUMN-001/-002 (in EXEC) |
| 421 triggers (incl. trigger-written-table cross-check before any drop) | SD-LEO-INFRA-TRIGGER-ESTATE-AUDIT-001 |
| Scan productization / standing CI lint | SD-LEO-INFRA-SCHEMA-REFERENCE-LINT-001 |
| Retention/cleanup of backups & growth | SD-LEO-INFRA-RETENTION-POLICY-UNBOUNDED-001 / STANDING-ROW-GROWTH-001 |
| 3 specimen dead-arrival modules | SD-LEO-FIX-RECONCILE-DEAD-ARRIVAL-001 |

## Routing performed at completion
- **Chairman `needs_decision` flags:** (1) the 51-table retirement batch (backup-first, reversible); (2) budget-manager provisioning; (3) okr_alignments provisioning.
- **Adam grooming rows** (feedback, `harness_backlog`, **no `metadata.flag_class`** so `sourceableBacklog` surfaces them): one per RETIRE_MODULE / PROVISION-or-patch / DORMANT row above.
