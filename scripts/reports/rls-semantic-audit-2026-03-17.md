# RLS Semantic Audit Report

**Date**: 2026-03-17
**Auditor**: Chief Security Architect (Security Agent)
**Scope**: All Supabase RLS policies across the EHG Engineer project
**Source**: 32 migration files containing RLS policy definitions

---

## Executive Summary

The EHG Engineer database has achieved 100% RLS enablement across all public tables. However, the semantic quality of those policies reveals a significant structural weakness: **the vast majority of tables use a blanket `USING(true)` pattern** that provides no actual row-level filtering. This is a deliberate single-tenant design choice, not an oversight, but it creates a false sense of security and blocks multi-tenancy readiness.

**Key Findings**:
- **~130+ tables** use the READ-ONLY pattern (service_role ALL + authenticated SELECT with USING(true))
- **17 tables** are SERVICE-ONLY (service_role access only, no authenticated access)
- **9 tables** use APPEND-ONLY for audit/log tables (a good pattern from the 20260123 fix)
- **Only ~12 tables** use actual row-level filtering (auth.uid() or venture ownership checks)
- **3 tables** have defective or ambiguous policies (identified and partially fixed)
- **~160+ code paths** use service_role key, bypassing ALL RLS policies entirely
- **0 tables** use auth.uid() directly for user-scoping in the standard policy set
- **11 views** were converted from SECURITY DEFINER to SECURITY INVOKER (good progress)

**Overall Risk Rating**: MEDIUM - The current posture is acceptable for a single-tenant, single-operator system but would be critically insufficient for multi-tenancy or public API exposure.

---

## 1. Complete RLS Policy Inventory

### 1.1 Pattern Legend

| Code | Pattern | Description |
|------|---------|-------------|
| **READ-ONLY** | service_role ALL + authenticated SELECT USING(true) | Any authenticated user can read all rows; only service_role can write |
| **OPEN** | authenticated ALL USING(true) | Any authenticated user can read/write all rows |
| **APPEND-ONLY** | authenticated INSERT+SELECT + service_role ALL | Authenticated can add and read, but not update or delete |
| **SERVICE-ONLY** | service_role ALL only, no authenticated access | Only backend service_role can access |
| **USER-SCOPED** | Uses auth.uid() in USING/WITH CHECK clauses | Row-level filtering by authenticated user identity |
| **VENTURE-SCOPED** | Uses venture ownership subquery | Row-level filtering by venture ownership via `ventures.created_by = auth.uid()` |
| **CUSTOM** | Unique pattern | Does not fit standard categories |
| **ANON-READ** | Includes anon SELECT policy | Anonymous users can read (in addition to other policies) |

### 1.2 Migration 018: Standard Policy Set (65 tables) - READ-ONLY

All 65 tables received identical policies via `create_standard_rls_policies()`:
- `service_role_all_{table}` - FOR ALL TO service_role USING(true) WITH CHECK(true)
- `authenticated_read_{table}` - FOR SELECT TO authenticated USING(true)

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| backlog_item_completion | READ-ONLY | Low | APPROPRIATE |
| component_registry_embeddings | READ-ONLY | Low | APPROPRIATE |
| cross_sd_utilization | READ-ONLY | Low | APPROPRIATE |
| directive_submissions | READ-ONLY* | Medium | NEEDS_REVIEW (also has anon INSERT/UPDATE from migration 20251102) |
| exec_authorizations | READ-ONLY | Medium | APPROPRIATE |
| execution_sequences_v2 | READ-ONLY | Low | APPROPRIATE |
| folder_structure_snapshot | READ-ONLY | Low | APPROPRIATE |
| gate_requirements_templates | READ-ONLY | Low | APPROPRIATE |
| governance_audit_log | READ-ONLY | Medium | OVERLY_PERMISSIVE - should be APPEND-ONLY |
| governance_proposals | READ-ONLY | Medium | APPROPRIATE |
| handoff_validation_rules | READ-ONLY | Low | APPROPRIATE |
| handoff_verification_gates | READ-ONLY | Low | APPROPRIATE |
| hap_blocks_v2 | READ-ONLY | Low | APPROPRIATE |
| import_audit | READ-ONLY | Low | APPROPRIATE |
| integrity_metrics | READ-ONLY | Low | APPROPRIATE |
| leo_adrs | READ-ONLY | Low | APPROPRIATE |
| leo_agents | READ-ONLY | Low | APPROPRIATE |
| leo_artifacts | READ-ONLY | Low | APPROPRIATE |
| leo_codebase_validations | READ-ONLY | Low | APPROPRIATE |
| leo_complexity_thresholds | READ-ONLY | Low | APPROPRIATE |
| leo_drift_alerts | READ-ONLY | Low | APPROPRIATE |
| leo_executions | READ-ONLY | Low | APPROPRIATE |
| leo_gate_review_history | READ-ONLY | Low | APPROPRIATE |
| leo_gate_review_signals | READ-ONLY | Low | APPROPRIATE |
| leo_gate_reviews | READ-ONLY | Low | APPROPRIATE |
| leo_gate_rule_weights | READ-ONLY | Low | APPROPRIATE |
| leo_gate_rules | READ-ONLY | Low | APPROPRIATE |
| leo_gate_validations | READ-ONLY | Low | APPROPRIATE |
| leo_gates | READ-ONLY | Low | APPROPRIATE |
| leo_handoff_tracking | READ-ONLY | Low | APPROPRIATE |
| leo_issue_patterns | READ-ONLY | Low | APPROPRIATE |
| leo_plan_validations | READ-ONLY | Low | APPROPRIATE |
| leo_prd | READ-ONLY | Medium | APPROPRIATE |
| leo_protocol_sections | READ-ONLY | Low | APPROPRIATE |
| leo_protocol_usage | READ-ONLY | Low | APPROPRIATE |
| leo_protocols | READ-ONLY | Low | APPROPRIATE |
| leo_retrospectives | READ-ONLY | Medium | APPROPRIATE |
| leo_sd_acceptance | READ-ONLY | Low | APPROPRIATE |
| leo_strategic_insights | READ-ONLY | Low | APPROPRIATE |
| leo_version_history | READ-ONLY | Low | APPROPRIATE |
| partner_collaboration | READ-ONLY | Medium | APPROPRIATE |
| pattern_evolution | READ-ONLY | Low | APPROPRIATE |
| plan_improvements | READ-ONLY | Low | APPROPRIATE |
| prd_audit_history | READ-ONLY | Low | APPROPRIATE |
| prd_validation_results | READ-ONLY | Low | APPROPRIATE |
| product_requirements_v2 | READ-ONLY | Medium | APPROPRIATE (core business data, but single-tenant) |
| raid_decisions | READ-ONLY | Low | APPROPRIATE |
| raid_impacts | READ-ONLY | Low | APPROPRIATE |
| raid_log | READ-ONLY | Low | APPROPRIATE |
| raid_mitigations | READ-ONLY | Low | APPROPRIATE |
| retrospective_metadata | READ-ONLY | Low | APPROPRIATE |
| sd_gate_metrics | READ-ONLY | Low | APPROPRIATE |
| sd_metrics | READ-ONLY | Low | APPROPRIATE |
| schema_validation_history | READ-ONLY | Low | APPROPRIATE |
| strategic_directives_v2 | READ-ONLY | High | APPROPRIATE (single-tenant; would need scoping for multi-tenant) |
| sync_state | READ-ONLY | Low | APPROPRIATE |
| test_results | READ-ONLY | Low | APPROPRIATE |
| training_examples | READ-ONLY | Low | APPROPRIATE |
| user_stories | READ-ONLY | Medium | APPROPRIATE |
| user_story_handoffs | READ-ONLY | Low | APPROPRIATE |
| user_story_test_results | READ-ONLY | Low | APPROPRIATE |
| validation_evidence | READ-ONLY | Low | APPROPRIATE |
| workflow_checkpoints | READ-ONLY | Low | APPROPRIATE |
| workflow_recovery_state | READ-ONLY | Low | APPROPRIATE |
| working_sd_sessions | READ-ONLY | Low | APPROPRIATE |
| lead_evaluations | READ-ONLY | Low | APPROPRIATE |

### 1.3 Migration 019: Standard Policy Set (59 tables, conditional) - READ-ONLY

Same pattern applied via `enable_rls_if_exists()`. Tables may or may not exist in all environments.

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| leo_handoff_executions | READ-ONLY | Low | APPROPRIATE |
| leo_handoff_rejections | READ-ONLY | Low | APPROPRIATE |
| leo_handoff_templates | READ-ONLY | Low | APPROPRIATE |
| leo_handoff_validations | READ-ONLY | Low | APPROPRIATE |
| leo_interfaces | READ-ONLY | Low | APPROPRIATE |
| leo_mandatory_validations | READ-ONLY | Low | APPROPRIATE |
| leo_nfr_requirements | READ-ONLY | Low | APPROPRIATE |
| leo_protocol_changes | READ-ONLY | Low | APPROPRIATE |
| leo_protocol_file_audit | READ-ONLY | Low | APPROPRIATE |
| leo_protocol_references | READ-ONLY | Low | APPROPRIATE |
| leo_reasoning_sessions | READ-ONLY | Low | APPROPRIATE |
| leo_reasoning_triggers | READ-ONLY | Low | APPROPRIATE |
| leo_risk_spikes | READ-ONLY | Low | APPROPRIATE |
| leo_sub_agent_handoffs | READ-ONLY | Low | APPROPRIATE |
| leo_sub_agent_triggers | READ-ONLY | Low | APPROPRIATE |
| leo_sub_agents | READ-ONLY | Low | APPROPRIATE |
| leo_subagent_handoffs | READ-ONLY | Low | APPROPRIATE |
| leo_test_plans | READ-ONLY | Low | APPROPRIATE |
| leo_validation_rules | READ-ONLY | Low | APPROPRIATE |
| leo_workflow_phases | READ-ONLY | Low | APPROPRIATE |
| operations_audit_log | READ-ONLY | Medium | OVERLY_PERMISSIVE - should be APPEND-ONLY |
| plan_conflict_rules | READ-ONLY | Low | APPROPRIATE |
| plan_subagent_queries | READ-ONLY | Low | APPROPRIATE |
| plan_verification_results | READ-ONLY | Low | APPROPRIATE |
| prd_ui_mappings | READ-ONLY | Low | APPROPRIATE |
| prds_backup_20251016 | READ-ONLY | Low | APPROPRIATE (backup table) |
| proposal_approvals | READ-ONLY | Medium | APPROPRIATE |
| proposal_notifications | READ-ONLY | Low | APPROPRIATE |
| proposal_state_transitions | READ-ONLY | Low | APPROPRIATE |
| retro_notifications | READ-ONLY | Low | APPROPRIATE |
| retrospective_action_items | READ-ONLY | Low | APPROPRIATE |
| retrospective_insights | READ-ONLY | Low | APPROPRIATE |
| retrospective_learning_links | READ-ONLY | Low | APPROPRIATE |
| retrospective_templates | READ-ONLY | Low | APPROPRIATE |
| retrospective_triggers | READ-ONLY | Low | APPROPRIATE |
| retrospectives | READ-ONLY | Medium | APPROPRIATE (single-tenant; team performance data) |
| risk_assessments | READ-ONLY | Medium | APPROPRIATE |
| schema_expectations | READ-ONLY | Low | APPROPRIATE |
| sd_backlog_map | READ-ONLY | Low | APPROPRIATE |
| sd_business_evaluations | READ-ONLY | Medium | APPROPRIATE |
| sd_dependency_graph | READ-ONLY | Low | APPROPRIATE |
| sd_execution_timeline | READ-ONLY | Low | APPROPRIATE |
| sd_overlap_analysis | READ-ONLY | Low | APPROPRIATE |
| sd_scope_deliverables | READ-ONLY | Low | APPROPRIATE |
| sd_state_transitions | READ-ONLY | Low | APPROPRIATE |
| sd_testing_status | READ-ONLY | Low | APPROPRIATE |
| sdip_ai_analysis | READ-ONLY | Low | APPROPRIATE |
| sub_agent_execution_batches | READ-ONLY | Low | APPROPRIATE |
| sub_agent_executions | READ-ONLY | Low | APPROPRIATE |
| sub_agent_gate_requirements | READ-ONLY | Low | APPROPRIATE |
| subagent_activations | READ-ONLY | Low | APPROPRIATE |
| subagent_requirements | READ-ONLY | Low | APPROPRIATE |
| submission_groups | READ-ONLY | Low | APPROPRIATE |
| submission_screenshots | READ-ONLY | Low | APPROPRIATE |
| submission_steps | READ-ONLY | Low | APPROPRIATE |
| test_coverage_policies | READ-ONLY | Low | APPROPRIATE |
| test_plans | READ-ONLY | Low | APPROPRIATE |
| ui_validation_checkpoints | READ-ONLY | Low | APPROPRIATE |
| ui_validation_results | READ-ONLY | Low | APPROPRIATE |

### 1.4 Migration 020: Context Learning Tables (5 tables) - READ-ONLY

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| context_embeddings | READ-ONLY | Low | APPROPRIATE |
| feedback_events | READ-ONLY | Low | APPROPRIATE |
| interaction_history | READ-ONLY | Medium | NEEDS_REVIEW - could contain user behavior data |
| learning_configurations | READ-ONLY | Low | APPROPRIATE |
| user_context_patterns | READ-ONLY | Medium | NEEDS_REVIEW - user behavioral patterns |

### 1.5 Migration 021: Agent & Documentation Tables (10 tables) - READ-ONLY

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| agent_coordination_state | READ-ONLY | Low | APPROPRIATE |
| agent_events | READ-ONLY | Low | APPROPRIATE |
| agent_execution_cache | READ-ONLY | Low | APPROPRIATE |
| agent_knowledge_base | READ-ONLY | Low | APPROPRIATE |
| agent_performance_metrics | READ-ONLY | Low | APPROPRIATE |
| compliance_alerts | READ-ONLY | Medium | APPROPRIATE |
| documentation_health_checks | READ-ONLY | Low | APPROPRIATE |
| documentation_inventory | READ-ONLY | Low | APPROPRIATE |
| documentation_templates | READ-ONLY | Low | APPROPRIATE |
| documentation_violations | READ-ONLY | Low | APPROPRIATE |

### 1.6 Migration 20260123: Unprotected Tables (17 tables) - SERVICE-ONLY

These were correctly identified as internal-only tables and restricted to service_role:

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| db_agent_config | SERVICE-ONLY | Low | APPROPRIATE |
| db_agent_invocations | SERVICE-ONLY | Low | APPROPRIATE |
| improvement_quality_assessments | SERVICE-ONLY | Low | APPROPRIATE |
| learning_decisions | SERVICE-ONLY | Low | APPROPRIATE |
| leo_autonomous_directives | SERVICE-ONLY | Low | APPROPRIATE |
| pattern_occurrences | SERVICE-ONLY | Low | APPROPRIATE |
| pattern_resolution_signals | SERVICE-ONLY | Low | APPROPRIATE |
| uat_audit_trail | SERVICE-ONLY | Medium | APPROPRIATE |
| uat_coverage_metrics | SERVICE-ONLY | Low | APPROPRIATE |
| uat_issues | SERVICE-ONLY | Low | APPROPRIATE |
| uat_performance_metrics | SERVICE-ONLY | Low | APPROPRIATE |
| uat_screenshots | SERVICE-ONLY | Low | APPROPRIATE |
| uat_test_cases | SERVICE-ONLY | Low | APPROPRIATE |
| uat_test_results | SERVICE-ONLY | Low | APPROPRIATE |
| uat_test_runs | SERVICE-ONLY | Low | APPROPRIATE |
| uat_test_schedules | SERVICE-ONLY | Low | APPROPRIATE |
| uat_test_suites | SERVICE-ONLY | Low | APPROPRIATE |

### 1.7 Migration 20260123: Fix Overly Permissive (17 tables) - APPEND-ONLY / READ-ONLY / CUSTOM

**Audit tables made APPEND-ONLY** (INSERT + SELECT for authenticated):

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| activity_logs | APPEND-ONLY | Low | APPROPRIATE |
| continuous_execution_log | APPEND-ONLY | Low | APPROPRIATE |
| model_usage_log | APPEND-ONLY | Medium | APPROPRIATE (AI model cost tracking) |
| context_usage_log | APPEND-ONLY | Low | APPROPRIATE |
| context_usage_daily | APPEND-ONLY | Low | APPROPRIATE |
| sd_checkpoint_history | APPEND-ONLY | Low | APPROPRIATE |
| sd_type_change_audit | APPEND-ONLY | Low | APPROPRIATE |
| workflow_executions | APPEND-ONLY | Low | APPROPRIATE |
| wizard_analytics | APPEND-ONLY | Low | APPROPRIATE |

**Internal tables made READ-ONLY** (service_role ALL + authenticated SELECT):

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| pattern_subagent_mapping | READ-ONLY | Low | APPROPRIATE |
| scaffold_patterns | READ-ONLY | Low | APPROPRIATE |
| sd_baseline_rationale | READ-ONLY | Low | APPROPRIATE |
| sd_intensity_adjustments | READ-ONLY | Low | APPROPRIATE |
| sd_intensity_gate_exemptions | READ-ONLY | Low | APPROPRIATE |
| sd_type_gate_exemptions | READ-ONLY | Low | APPROPRIATE |

**Session/Claims tables made CUSTOM**:

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| claude_sessions | CUSTOM (service_role ALL + auth SELECT + auth INSERT) | High | NEEDS_REVIEW - contains session claims, heartbeats, sd_id claims |
| sd_claims | CUSTOM (service_role ALL + auth SELECT/INSERT/UPDATE) | High | NEEDS_REVIEW - note: this table may no longer exist per MEMORY.md |

### 1.8 Migration 20260222: Security Definer Views + agent_skills - SERVICE-ONLY

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| agent_skills | SERVICE-ONLY* | Low | APPROPRIATE (later got authenticated_read in 20260310) |

**Views converted to SECURITY INVOKER** (11 views):
- v_active_sessions, v_agent_departments, v_agent_effective_capabilities
- v_chairman_escalation_events, v_chairman_pending_decisions, v_cross_venture_patterns
- v_department_membership, v_eva_accuracy, v_flywheel_velocity
- v_live_sessions, v_okr_hierarchy

### 1.9 Migration 20260302: Chairman Tables (5 tables) - READ-ONLY / SERVICE-ONLY

| Table | Pattern | Post-Migration State | Sensitivity | Assessment |
|-------|---------|---------------------|-------------|------------|
| chairman_decisions | READ-ONLY | service_role ALL + authenticated SELECT | High | APPROPRIATE (governance decisions) |
| chairman_preferences | READ-ONLY | service_role ALL + authenticated SELECT | Medium | APPROPRIATE |
| ventures | READ-ONLY | service_role ALL + authenticated SELECT | High | NEEDS_REVIEW - financial data, exit readiness |
| eva_orchestration_events | SERVICE-ONLY | service_role ALL, no auth access | Low | APPROPRIATE (internal) |
| brainstorm_sessions | READ-ONLY | service_role ALL + authenticated SELECT | Medium | APPROPRIATE |

### 1.10 Migration 20260310: Security Linter Remediation

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| eva_interactions | SERVICE-ONLY | High | APPROPRIATE (session_id exposure risk) |
| app_rankings | SERVICE-ONLY | Low | APPROPRIATE (fixed defective missing TO clause) |
| leo_protocol_state | SERVICE-ONLY | Low | APPROPRIATE |
| evidence_gate_mapping | SERVICE-ONLY | Low | APPROPRIATE |
| skill_assessment_scores | SERVICE-ONLY | Low | APPROPRIATE |

**Additional authenticated SELECT policies added** (for SECURITY INVOKER views):
- venture_capabilities, agent_skills, agent_registry, sd_capabilities
- chairman_decisions (already had equivalent), ventures (already had equivalent)
- lifecycle_stage_config, venture_stage_decisions

**Additional views converted to SECURITY INVOKER** (10 views):
- v_capability_ledger, v_skill_health, v_unified_capabilities
- v_archived_ventures, v_active_sessions (duplicate from 20260222), v_active_ventures
- v_orphan_visions, v_feedback_with_sensemaking
- v_chairman_pending_decisions (duplicate from 20260222), v_scanner_capabilities

### 1.11 Individual Table Migrations - Various Patterns

#### Voice Conversation Tables (Migration 004) - USER-SCOPED

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| voice_conversations | USER-SCOPED | High | APPROPRIATE - uses auth.uid() = user_id |
| voice_usage_metrics | USER-SCOPED | Medium | APPROPRIATE - scoped via conversation ownership |
| voice_cached_responses | CUSTOM | Low | APPROPRIATE - public read, service_role write |
| voice_function_calls | USER-SCOPED | Medium | APPROPRIATE - scoped via conversation ownership |

**NOTE**: `get_voice_usage_stats()` function uses SECURITY DEFINER - potential RLS bypass.

#### directive_submissions (Migration 20251102) - OPEN (ANON + AUTH)

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| directive_submissions | OPEN (anon+auth INSERT/SELECT/UPDATE) | Medium | OVERLY_PERMISSIVE - anon can INSERT/UPDATE |

**CRITICAL FINDING**: This table allows anonymous users to INSERT and UPDATE records. While migration 018 also added READ-ONLY policies on top, the anon policies from 20251102 remain active. Anonymous write access to directive_submissions is a security concern.

#### EVA Chat Tables (Migration 20260309) - USER-SCOPED

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| eva_chat_conversations | USER-SCOPED | High | APPROPRIATE - auth.uid() = user_id |
| eva_chat_messages | USER-SCOPED | High | APPROPRIATE - scoped via conversation ownership |

**NOTE**: Three SECURITY DEFINER functions (`create_eva_conversation`, `get_eva_conversations`, `get_conversation_messages`) bypass RLS.

#### Stage Zero Requests (Migration 20260303) - USER-SCOPED

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| stage_zero_requests | USER-SCOPED | Medium | APPROPRIATE - auth.uid() = requested_by |

Best example of well-designed RLS in this codebase: INSERT (own), SELECT (own), UPDATE (own pending only), no DELETE for authenticated.

#### Venture Factory Tables (Migration 20260309) - VENTURE-SCOPED

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| ehg_services | READ-ONLY (auth SELECT only) | Low | APPROPRIATE (service registry is read-only) |
| service_tasks | VENTURE-SCOPED | Medium | APPROPRIATE - scoped via ventures.created_by |
| venture_service_bindings | VENTURE-SCOPED (read-only) | Low | APPROPRIATE |
| service_telemetry | VENTURE-SCOPED | Medium | APPROPRIATE |
| venture_exit_readiness | VENTURE-SCOPED (read-only) | High | APPROPRIATE |

#### Venture Tiers (Migration 20260309) - VENTURE-SCOPED

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| venture_tiers | VENTURE-SCOPED | Medium | APPROPRIATE - SELECT/INSERT/UPDATE scoped |

#### Cascade Invalidation System (Migration 20260302) - READ-ONLY

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| cascade_invalidation_log | READ-ONLY | Low | APPROPRIATE |
| cascade_invalidation_flags | READ-ONLY | Low | APPROPRIATE |
| okr_vision_alignment_records | READ-ONLY | Low | APPROPRIATE |

#### Financial Contract (Migration 20260304) - READ-ONLY

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| venture_financial_contract | READ-ONLY | High | NEEDS_REVIEW - contains capital requirements, CAC, LTV |

**NOTE**: `validate_financial_consistency()` function uses SECURITY DEFINER - bypasses RLS.

#### Worker Heartbeats (Migration 20260307) - SERVICE-ONLY (via auth.role())

| Table | Pattern | Sensitivity | Assessment |
|-------|---------|-------------|------------|
| worker_heartbeats | SERVICE-ONLY | Low | APPROPRIATE (uses auth.role() = 'service_role' check) |

#### Other Individual Tables

| Table | Migration | Pattern | Sensitivity | Assessment |
|-------|-----------|---------|-------------|------------|
| venture_capabilities | 20260222 | READ-ONLY | Medium | APPROPRIATE |
| sd_capabilities | 20251202 | READ-ONLY | Low | APPROPRIATE |
| capability_reuse_log | 20260108 | READ-ONLY | Low | APPROPRIATE |
| leo_effort_policies | 20251204 | READ-ONLY + ANON-READ | Low | NEEDS_REVIEW - anon SELECT |
| shipping_decisions | 20260105 | READ-ONLY | Low | APPROPRIATE |
| eva_event_schemas | 20260301 | READ-ONLY | Low | APPROPRIATE |
| domain_knowledge | 20260228 | SERVICE-ONLY (defective*) | Medium | NEEDS_REVIEW - missing TO clause |
| claude_code_releases | 20260228 | SERVICE-ONLY (defective*) | Low | NEEDS_REVIEW - missing TO clause |
| app_rankings | 20260228/20260310 | SERVICE-ONLY (fixed) | Low | APPROPRIATE (fixed in 20260310) |
| competitive_baselines | 20260309 | SERVICE-ONLY | Medium | APPROPRIATE |
| confidence_calibration_log | 20260309 | CUSTOM (open SELECT + open INSERT) | Medium | OVERLY_PERMISSIVE - no role targeting |
| system_health | 010 | CUSTOM (anon SELECT added) | Low | APPROPRIATE |

---

## 2. Policy Classification Summary

### Distribution by Pattern

| Pattern | Count | Percentage |
|---------|-------|------------|
| READ-ONLY (service_role ALL + authenticated SELECT) | ~130 | ~73% |
| SERVICE-ONLY (service_role only) | ~22 | ~12% |
| APPEND-ONLY (auth INSERT+SELECT, no UPDATE/DELETE) | 9 | ~5% |
| USER-SCOPED (auth.uid() filtering) | 7 | ~4% |
| VENTURE-SCOPED (ownership subquery) | 6 | ~3% |
| CUSTOM/OPEN | 5 | ~3% |

### Pattern Quality Assessment

| Pattern | Security Quality | Notes |
|---------|-----------------|-------|
| READ-ONLY | **ACCEPTABLE** (single-tenant) | No row-level filtering but prevents writes via authenticated client |
| SERVICE-ONLY | **GOOD** | Strictest pattern, used appropriately for internal tables |
| APPEND-ONLY | **GOOD** | Correct for audit/log tables - prevents tampering |
| USER-SCOPED | **EXCELLENT** | True row-level security; only 7 tables use this |
| VENTURE-SCOPED | **EXCELLENT** | True row-level security via ownership; only 6 tables use this |
| CUSTOM/OPEN | **POOR** | Several tables need review; defective policies found |

---

## 3. Sensitivity Analysis

### HIGH Sensitivity Tables

| Table | Current Pattern | Current Assessment | Recommendation |
|-------|----------------|-------------------|----------------|
| strategic_directives_v2 | READ-ONLY | APPROPRIATE (single-tenant) | Stay READ-ONLY; add user-scoping if multi-tenant |
| claude_sessions | CUSTOM (SELECT+INSERT) | NEEDS_REVIEW | Should scope INSERT/SELECT to own session_id or user_id |
| ventures | READ-ONLY | NEEDS_REVIEW | Contains financial data, should consider VENTURE-SCOPED |
| chairman_decisions | READ-ONLY | APPROPRIATE | Governance data; consider ROLE-BASED if chairman role exists |
| venture_financial_contract | READ-ONLY | NEEDS_REVIEW | Financial metrics exposed to all authenticated users |
| eva_interactions | SERVICE-ONLY | APPROPRIATE | Correctly restricted after session_id exposure finding |
| voice_conversations | USER-SCOPED | APPROPRIATE | Properly scoped to user_id = auth.uid() |
| eva_chat_conversations | USER-SCOPED | APPROPRIATE | Properly scoped |
| eva_chat_messages | USER-SCOPED | APPROPRIATE | Properly scoped via conversation ownership |

### MEDIUM Sensitivity Tables Needing Review

| Table | Issue |
|-------|-------|
| directive_submissions | Anonymous INSERT/UPDATE access remains from migration 20251102 |
| model_usage_log | Contains AI model cost tracking; APPEND-ONLY is appropriate |
| venture_exit_readiness | VENTURE-SCOPED (read-only) is good, but contains sensitive separation data |
| confidence_calibration_log | Missing role targeting on SELECT and INSERT policies |
| domain_knowledge | SERVICE-ONLY but policy missing TO clause (defective) |
| interaction_history | May contain user behavior patterns; READ-ONLY may be too permissive |

---

## 4. Multi-Tenancy Readiness Assessment

### Current State: NOT READY

| Dimension | Status | Details |
|-----------|--------|---------|
| Tables using auth.uid() | **7** (~4%) | voice_conversations, voice_usage_metrics, voice_function_calls, eva_chat_conversations, eva_chat_messages, stage_zero_requests, (partial: claude_sessions) |
| Tables with user_id column | **~10** | voice_conversations, eva_chat_conversations, stage_zero_requests, and a few others with `created_by` or `user_id` |
| Tables using venture ownership | **6** (~3%) | service_tasks, venture_service_bindings, service_telemetry, venture_exit_readiness, venture_tiers (all from venture factory) |
| Tables with USING(true) | **~130** (~73%) | No row-level filtering whatsoever |

### Is USING(true) Deliberate?

**YES** - this is a deliberate single-tenant design choice. Evidence:

1. Migration 018 comments state: "Authenticated users: Read-only access (for developers viewing data)"
2. The system is designed for a single operator (Chairman) with Claude Code CLI sessions as the primary writers
3. The application architecture uses service_role for all backend writes (~160+ createClient calls)
4. Only user-facing features (voice conversations, EVA chat, stage zero requests) implemented proper user-scoping

### Multi-Tenancy Migration Path

To support multi-tenancy, the following would be required:

1. **Phase 1**: Add `user_id UUID REFERENCES auth.users(id)` to all tables that need user-scoping
2. **Phase 2**: Add `organization_id` for team/company-level isolation
3. **Phase 3**: Replace USING(true) with USING(user_id = auth.uid()) or USING(organization_id = auth.jwt()->>'org_id')
4. **Phase 4**: Audit all SECURITY DEFINER functions to ensure they respect the new scoping
5. **Phase 5**: Migrate service_role usage to authenticated client where possible

**Estimated effort**: 40-80 hours of schema changes, policy updates, and testing.

---

## 5. Policy Gap Analysis

### 5.1 Tables with Defective Policies

| Table | Defect | Migration | Status |
|-------|--------|-----------|--------|
| app_rankings | Original policy missing `TO service_role` clause (applied to all roles) | 20260228 | **FIXED** in 20260310 |
| domain_knowledge | Policy missing `TO service_role` clause: `FOR ALL USING(true)` | 20260228 | **UNFIXED** - applies to all roles |
| claude_code_releases | Policy missing `TO service_role` clause: `FOR ALL USING(true)` | 20260228 | **UNFIXED** - applies to all roles |
| confidence_calibration_log | Policies missing role targeting: `FOR SELECT USING(true)` and `FOR INSERT WITH CHECK(true)` with no TO clause | 20260309 | **UNFIXED** - applies to all roles |

**CRITICAL**: `domain_knowledge`, `claude_code_releases`, and `confidence_calibration_log` have policies with `FOR ALL/SELECT/INSERT USING(true)` but NO `TO service_role` clause. In PostgreSQL, a policy without a role specification applies to ALL roles, meaning **anonymous users can read and write these tables** (subject to GRANT permissions).

### 5.2 Tables with Conflicting/Stacked Policies

| Table | Conflict |
|-------|----------|
| directive_submissions | Migration 20251102 grants anon INSERT/SELECT/UPDATE; Migration 018 adds standard READ-ONLY. Both active. Net effect: anon has INSERT+SELECT+UPDATE, authenticated has INSERT+SELECT+UPDATE |
| claude_sessions | Migration 20260123 intended to restrict but added SELECT+INSERT for authenticated. Combined with any prior policies, the effective access may be broader than intended |

### 5.3 SECURITY DEFINER Functions (RLS Bypass Risk)

These functions execute with the privileges of the function creator, bypassing ALL RLS:

| Function | Tables Accessed | Risk |
|----------|----------------|------|
| get_voice_usage_stats() | voice_conversations, voice_usage_metrics, voice_function_calls | LOW - reads user's own data but parameter is user-supplied UUID |
| fn_cascade_invalidation_on_vision_update() | cascade_invalidation_log, cascade_invalidation_flags, eva_architecture_plans, objectives | LOW - trigger context only |
| validate_financial_consistency() | venture_financial_contract | MEDIUM - any caller can validate against any venture's financial data |
| create_eva_conversation() | eva_chat_conversations | LOW - user_id parameter could be spoofed |
| get_eva_conversations() | eva_chat_conversations, eva_chat_messages | LOW - user_id parameter could be spoofed |
| get_conversation_messages() | eva_chat_messages | MEDIUM - no user ownership verification |

**Recommendation**: `get_conversation_messages()` should verify that the calling user owns the conversation. `validate_financial_consistency()` should check venture ownership.

---

## 6. The service_role Problem

### Scale of the Problem

The security audit found **160+ `createClient` calls** using the service_role key. When service_role is used, ALL RLS policies are completely bypassed. This means:

- Every RLS policy in this report is irrelevant for ~95% of database operations
- RLS only matters for the ~5% of operations that go through the Supabase client (browser/frontend)
- The entire RLS infrastructure is essentially protecting against **frontend-initiated queries only**

### Why service_role Is Used Everywhere

1. **CLI Architecture**: Claude Code CLI sessions use service_role because they are backend processes without user authentication context
2. **Edge Functions**: Supabase Edge Functions use service_role for backend operations (AUTH-001 finding)
3. **Scripts**: All LEO protocol scripts (sd:next, handoffs, etc.) use service_role
4. **Triggers/Functions**: SECURITY DEFINER functions effectively operate as service_role

### Operations That Genuinely Need service_role

| Category | Justification |
|----------|--------------|
| CLI session management | No user auth context available in CLI |
| Automated workflows | Background processing, cron jobs, event handlers |
| Cross-tenant operations | Admin operations that span all data |
| System health monitoring | Needs to read all tables for health checks |
| Schema migrations | DDL operations require elevated access |

### Operations That Could Use Authenticated Client

| Category | Current | Could Be |
|----------|---------|----------|
| Frontend reads | service_role in some edge functions | Authenticated client with RLS |
| User-initiated actions | service_role via edge function proxy | Authenticated client directly |
| EVA chat | SECURITY DEFINER functions | Authenticated client with RLS policies |
| Chairman dashboard reads | service_role | Authenticated client with role-based policies |

### Recommendation

The service_role usage pattern is deeply embedded in the architecture and cannot be changed quickly. The pragmatic approach:

1. **Short-term**: Ensure frontend-facing code paths use authenticated client where possible
2. **Medium-term**: Add `auth.uid()` scoping to user-facing tables even though most writes go through service_role
3. **Long-term**: If multi-tenancy is needed, systematically migrate edge functions from service_role to authenticated client

---

## 7. Policy Tightening Roadmap

### Phase 1: Quick Wins (HIGH Priority - Immediate)

These are defects that should be fixed now:

| # | Table | Current | Action | Effort |
|---|-------|---------|--------|--------|
| 1 | domain_knowledge | Defective (no TO clause) | Add `TO service_role` to existing policy; add `authenticated_read` for SELECT | 5 min |
| 2 | claude_code_releases | Defective (no TO clause) | Add `TO service_role` to existing policy; add `authenticated_read` for SELECT | 5 min |
| 3 | confidence_calibration_log | Defective (no role targeting) | Add `TO authenticated` for SELECT, `TO service_role` for INSERT | 5 min |
| 4 | directive_submissions | Anon INSERT/UPDATE access | Drop anon INSERT/UPDATE policies if wizard no longer needs anon access; keep anon SELECT if needed | 10 min |
| 5 | get_conversation_messages() | No ownership check | Add `WHERE conversation_id IN (SELECT id FROM eva_chat_conversations WHERE user_id = auth.uid())` | 15 min |

**Migration SQL for Phase 1**:

```sql
-- Fix 1: domain_knowledge
DROP POLICY IF EXISTS "Service role full access on domain_knowledge" ON domain_knowledge;
CREATE POLICY "service_role_full_access_domain_knowledge" ON domain_knowledge
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_domain_knowledge" ON domain_knowledge
  FOR SELECT TO authenticated USING (true);

-- Fix 2: claude_code_releases
DROP POLICY IF EXISTS "Service role full access on claude_code_releases" ON claude_code_releases;
CREATE POLICY "service_role_full_access_claude_code_releases" ON claude_code_releases
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_claude_code_releases" ON claude_code_releases
  FOR SELECT TO authenticated USING (true);

-- Fix 3: confidence_calibration_log
DROP POLICY IF EXISTS "calibration_log_select_venture_scoped" ON confidence_calibration_log;
DROP POLICY IF EXISTS "calibration_log_insert_service_role" ON confidence_calibration_log;
CREATE POLICY "calibration_log_select_authenticated" ON confidence_calibration_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "calibration_log_all_service_role" ON confidence_calibration_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Fix 4: directive_submissions (assess if anon access is still needed first)
-- DROP POLICY IF EXISTS "Allow anonymous inserts" ON directive_submissions;
-- DROP POLICY IF EXISTS "Allow public updates" ON directive_submissions;
-- REVOKE INSERT, UPDATE ON directive_submissions FROM anon;
```

### Phase 2: Business Data Protection (MEDIUM Priority - Next Sprint)

| # | Table | Current | Recommended | Justification |
|---|-------|---------|-------------|---------------|
| 1 | governance_audit_log | READ-ONLY | APPEND-ONLY | Audit logs should not be deletable by any client |
| 2 | operations_audit_log | READ-ONLY | APPEND-ONLY | Same as above |
| 3 | venture_financial_contract | READ-ONLY | READ-ONLY (no change, but add SECURITY INVOKER to validate_financial_consistency) | Financial data; function bypasses RLS |
| 4 | claude_sessions | CUSTOM | Keep current but audit INSERT validation | Session claim data is high-sensitivity |
| 5 | leo_effort_policies | READ-ONLY + ANON-READ | Remove anon SELECT if not needed by public API | Assess if anon access is still required |
| 6 | competitive_baselines | SERVICE-ONLY | Add authenticated READ for UI display | Currently no UI can read this table |

### Phase 3: Multi-Tenancy Preparation (LOW Priority - Future)

These changes would be needed IF multi-tenancy is pursued:

| # | Category | Tables Affected | Action |
|---|----------|----------------|--------|
| 1 | Core business tables | strategic_directives_v2, product_requirements_v2, user_stories | Add `created_by` or `organization_id` column; add ownership USING clause |
| 2 | Venture tables | ventures, chairman_decisions, chairman_preferences | Already have `created_by`; add `USING(created_by = auth.uid())` |
| 3 | Retrospective tables | retrospectives, retrospective_metadata, retrospective_action_items | Add owner column; scope to owner |
| 4 | LEO protocol tables | ~50 leo_* tables | Assess which need user-scoping vs which are shared infrastructure |
| 5 | SECURITY DEFINER functions | All listed in Section 5.3 | Convert to SECURITY INVOKER where possible |

---

## 8. SECURITY INVOKER View Status

### Converted (21 views total across two migrations)

| View | Converted In |
|------|-------------|
| v_active_sessions | 20260222 + 20260310 (duplicate) |
| v_agent_departments | 20260222 |
| v_agent_effective_capabilities | 20260222 |
| v_chairman_escalation_events | 20260222 |
| v_chairman_pending_decisions | 20260222 + 20260310 (duplicate) |
| v_cross_venture_patterns | 20260222 |
| v_department_membership | 20260222 |
| v_eva_accuracy | 20260222 |
| v_flywheel_velocity | 20260222 |
| v_live_sessions | 20260222 |
| v_okr_hierarchy | 20260222 |
| v_capability_ledger | 20260310 |
| v_skill_health | 20260310 |
| v_unified_capabilities | 20260310 |
| v_archived_ventures | 20260310 |
| v_active_ventures | 20260310 |
| v_orphan_visions | 20260310 |
| v_feedback_with_sensemaking | 20260310 |
| v_scanner_capabilities | 20260310 |

### Remaining Assessment Needed

Any remaining views in the public schema that were NOT included in these migrations should be audited to determine if they still use SECURITY DEFINER. Run:

```sql
SELECT c.relname AS view_name, c.reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND (c.reloptions IS NULL OR NOT 'security_invoker=on' = ANY(c.reloptions))
ORDER BY c.relname;
```

---

## 9. Comprehensive Table-to-Pattern Index

For quick reference, here is every table mentioned in the migrations with its final effective policy pattern:

### SERVICE-ONLY Tables (~22)

```
agent_skills*                    app_rankings
claude_code_releases**           competitive_baselines
db_agent_config                  db_agent_invocations
domain_knowledge**               eva_interactions
eva_orchestration_events         evidence_gate_mapping
improvement_quality_assessments  learning_decisions
leo_autonomous_directives        leo_protocol_state
pattern_occurrences              pattern_resolution_signals
skill_assessment_scores          uat_audit_trail
uat_coverage_metrics             uat_issues
uat_performance_metrics          uat_screenshots
uat_test_cases                   uat_test_results
uat_test_runs                    uat_test_schedules
uat_test_suites                  worker_heartbeats

* agent_skills: SERVICE-ONLY + authenticated_read added in 20260310
** Defective: missing TO clause, effectively OPEN to all roles
```

### APPEND-ONLY Tables (9)

```
activity_logs                    continuous_execution_log
context_usage_daily              context_usage_log
model_usage_log                  sd_checkpoint_history
sd_type_change_audit             wizard_analytics
workflow_executions
```

### USER-SCOPED Tables (7)

```
eva_chat_conversations           eva_chat_messages
stage_zero_requests              voice_cached_responses*
voice_conversations              voice_function_calls
voice_usage_metrics

* voice_cached_responses: public SELECT, service_role INSERT
```

### VENTURE-SCOPED Tables (6)

```
service_tasks                    service_telemetry
venture_exit_readiness           venture_service_bindings
venture_tiers                    (ehg_services has auth SELECT only)
```

### CUSTOM Tables (5)

```
claude_sessions                  confidence_calibration_log**
directive_submissions***         sd_claims
system_health

** Defective policies (no role targeting)
*** Anon INSERT/UPDATE access
```

### READ-ONLY Tables (~130+)

All remaining tables from migrations 018, 019, 020, 021, plus individually created tables with the standard `service_role ALL + authenticated SELECT USING(true)` pattern.

---

## 10. Key Recommendations Summary

### Immediate Actions (This Week)

1. **Fix 3 defective policies** - domain_knowledge, claude_code_releases, confidence_calibration_log are missing TO clauses, making them accessible to anonymous users
2. **Assess directive_submissions anon access** - Determine if the SD submission wizard still requires anonymous access; if not, remove anon INSERT/UPDATE

### Short-Term (Next 2 Weeks)

3. **Convert governance/operations audit logs to APPEND-ONLY** - Audit logs should never be modifiable
4. **Audit remaining SECURITY DEFINER views** - Run the query from Section 8 to find any remaining views
5. **Add ownership check to `get_conversation_messages()`** - Prevents cross-user chat message leakage

### Medium-Term (Next Month)

6. **Create an automated RLS policy audit script** - Extend `audit-rls-policies.js` to check for missing TO clauses and USING(true) classification
7. **Document the single-tenant design decision** - Make it explicit that USING(true) is intentional for the current single-operator model
8. **Add service_role usage inventory** - Map which edge functions use service_role and which could use authenticated client

### Long-Term (Multi-Tenancy)

9. **Add user_id/organization_id columns** to core business tables
10. **Implement VENTURE-SCOPED pattern** from venture factory as the template for all venture-related tables
11. **Migrate edge functions** from service_role to authenticated client where possible

---

## Appendix A: Migration History Timeline

| Date | Migration | Tables Affected | Action |
|------|-----------|----------------|--------|
| 2025-09-01 | 004 | 4 voice tables | USER-SCOPED policies (best practice) |
| 2025-10-15 | 010 | system_health | Added anon SELECT |
| 2025-10-26 | 018 | 65 tables | Bulk READ-ONLY standard policies |
| 2025-10-26 | 019 | 59 tables | Bulk READ-ONLY (conditional) |
| 2025-10-26 | 020 | 5 context learning tables | READ-ONLY |
| 2025-10-26 | 021 | 10 agent/doc tables | READ-ONLY |
| 2025-11-02 | 20251102 | directive_submissions | OPEN (anon + auth access) |
| 2025-12-02 | 20251202 | sd_capabilities | READ-ONLY |
| 2025-12-04 | 20251204 | leo_effort_policies | READ-ONLY + ANON-READ |
| 2026-01-05 | 20260105 | shipping_decisions | READ-ONLY |
| 2026-01-08 | 20260108 | capability_reuse_log | READ-ONLY |
| 2026-01-23 | 20260123 (enable) | 17 tables | SERVICE-ONLY |
| 2026-01-23 | 20260123 (fix) | 17 tables | APPEND-ONLY / READ-ONLY / CUSTOM |
| 2026-02-22 | 20260222 | agent_skills + 11 views | SERVICE-ONLY + SECURITY INVOKER |
| 2026-02-22 | 20260222 | venture_capabilities | READ-ONLY |
| 2026-02-28 | 20260228 | app_rankings, claude_code_releases, domain_knowledge | SERVICE-ONLY (some defective) |
| 2026-03-01 | 20260301 | eva_event_schemas | READ-ONLY |
| 2026-03-02 | 20260302 (cascade) | 3 cascade tables | READ-ONLY |
| 2026-03-02 | 20260302 (chairman) | 5 chairman tables | READ-ONLY / SERVICE-ONLY |
| 2026-03-03 | 20260303 | stage_zero_requests | USER-SCOPED (best practice) |
| 2026-03-04 | 20260304 | venture_financial_contract | READ-ONLY |
| 2026-03-07 | 20260307 | worker_heartbeats | SERVICE-ONLY |
| 2026-03-09 | 20260309 (factory) | 5 factory tables | VENTURE-SCOPED / READ-ONLY |
| 2026-03-09 | 20260309 (tiers) | venture_tiers | VENTURE-SCOPED |
| 2026-03-09 | 20260309 (chat) | 2 chat tables | USER-SCOPED |
| 2026-03-09 | 20260309 (baselines) | competitive_baselines | SERVICE-ONLY |
| 2026-03-09 | 20260309 (calibration) | confidence_calibration_log | CUSTOM (defective) |
| 2026-03-10 | 20260310 | 5 tables + 10 views + 8 auth SELECT | SERVICE-ONLY / SECURITY INVOKER |

---

## Appendix B: Design Principle Observations

### What Was Done Well

1. **100% RLS enablement** - Every table has RLS enabled, which is the correct first step
2. **SECURITY INVOKER conversion** - 21 views converted from SECURITY DEFINER
3. **Progressive tightening** - Each migration round tightened policies further (018 -> 20260123 -> 20260302 -> 20260310)
4. **Excellent user-scoped patterns** - voice_conversations, eva_chat, stage_zero_requests, venture_factory show proper auth.uid() usage
5. **APPEND-ONLY for audit tables** - Correctly prevents tampering with log data

### What Could Be Improved

1. **Bulk approach created debt** - Migrations 018/019 applied identical USING(true) to 124 tables without sensitivity analysis
2. **Missing TO clause pattern** - At least 3 tables have policies without explicit role targeting, making them effectively OPEN to all roles including anonymous
3. **SECURITY DEFINER functions** - 6+ functions bypass RLS; some lack ownership verification
4. **service_role dominance** - With 160+ service_role client calls, RLS is effectively bypassed for the vast majority of operations
5. **No automated policy validation** - No CI/CD check ensures new tables get appropriate (not just default) policies

---

*Report generated by Chief Security Architect Sub-Agent*
*Model: Claude Opus 4.6 (1M context)*
*Migration files analyzed: 32*
*Tables inventoried: ~180+*
*Policies classified: ~350+*
