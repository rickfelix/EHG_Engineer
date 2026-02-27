# Database Schema Overview

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-27T22:03:40.633Z
**Tables**: 503
**Source**: Supabase PostgreSQL introspection

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Table of Contents

- [Quick Reference](#quick-reference)
- [Tables by Category](#tables-by-category)
- [RLS Policy Patterns](#rls-policy-patterns)
- [Foreign Key Relationships](#foreign-key-relationships)
- [Common Patterns](#common-patterns)

---

## Quick Reference

| Table | Rows | RLS | Policies | Description |
|-------|------|-----|----------|-------------|
| [_migration_metadata](tables/_migration_metadata.md) | 2 | ✅ | 0 | - |
| [activity_logs](tables/activity_logs.md) | 243 | ✅ | 3 | RLS: Append-only for authenticated, no delete/update |
| [advisory_checkpoints](tables/advisory_checkpoints.md) | 3 | ✅ | 4 | - |
| [aegis_constitutions](tables/aegis_constitutions.md) | 7 | ✅ | 4 | Registry of governance frameworks (constitutions) in AEGIS |
| [aegis_rules](tables/aegis_rules.md) | 45 | ✅ | 4 | Unified storage for all governance rules across all constitutions |
| [aegis_violations](tables/aegis_violations.md) | 31 | ✅ | 4 | Unified audit log for all governance violations across all constitutions |
| [agent_artifacts](tables/agent_artifacts.md) | 8,561 | ✅ | 3 | Stores large tool outputs as artifacts with summary pointers for context efficiency |
| [agent_avatars](tables/agent_avatars.md) | 66 | ✅ | 2 | - |
| [agent_coordination_state](tables/agent_coordination_state.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Agent coordination state tracking |
| [agent_departments](tables/agent_departments.md) | 12 | ✅ | 2 | - |
| [agent_events](tables/agent_events.md) | 22 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Agent event log |
| [agent_execution_cache](tables/agent_execution_cache.md) | 3 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Agent execution cache |
| [agent_intelligence_insights](tables/agent_intelligence_insights.md) | 0 | ✅ | 2 | Contains specific learned behaviors and adjustments that agents should make based on historical data |
| [agent_knowledge_base](tables/agent_knowledge_base.md) | 5 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Agent knowledge base |
| [agent_learning_outcomes](tables/agent_learning_outcomes.md) | 0 | ✅ | 2 | Tracks the complete workflow chain from LEAD decision through PLAN validation to EXEC implementation and final business outcomes |
| [agent_memory_stores](tables/agent_memory_stores.md) | 0 | ✅ | 1 | INDUSTRIAL-HARDENING-v2.9.0: Memory partition table.
CRITICAL: All queries MUST include venture_id filter.
Example: SELECT * FROM agent_memory_stores WHERE agent_id = ? AND venture_id = ? |
| [agent_messages](tables/agent_messages.md) | 0 | ✅ | 1 | - |
| [agent_performance_metrics](tables/agent_performance_metrics.md) | 3 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Agent performance metrics (from context learning schema) |
| [agent_registry](tables/agent_registry.md) | 8 | ✅ | 2 | - |
| [agent_relationships](tables/agent_relationships.md) | 2 | ✅ | 1 | - |
| [agent_skills](tables/agent_skills.md) | 0 | ✅ | 1 | Skill metadata for context-based injection into agent prompts (SD-EVA-FEAT-SKILL-PACKAGING-001) |
| [agent_task_contracts](tables/agent_task_contracts.md) | 8,605 | ✅ | 4 | Task contracts for sub-agent handoffs. Sub-agents read their contract from this table
instead of inheriting parent agent context, reducing context overhead by 50-70%.
Pattern: Extends sd_data_contracts for agent-to-agent communication.
Reference: SD-FOUND-AGENTIC-CONTEXT-001 (Agentic Context Engineering v3.0) |
| [agent_tools](tables/agent_tools.md) | 8 | ✅ | 2 | - |
| [agentic_reviews](tables/agentic_reviews.md) | 12 | ✅ | 4 | - |
| [agents](tables/agents.md) | 0 | ✅ | 2 | Governance agents for chairman/CEO system. Separate from crewai_agents (research automation). Referenced by ventures.ceo_agent_id and directive_delegations. |
| [ai_quality_assessments](tables/ai_quality_assessments.md) | 15,560 | ✅ | 3 | AI-powered quality assessments using Russian Judge rubrics (gpt-4o-mini). Stores all quality evaluations for meta-analysis and continuous improvement. |
| [app_config](tables/app_config.md) | 1 | ✅ | 3 | - |
| [app_rankings](tables/app_rankings.md) | 0 | ❌ | 0 | Scraped app ranking data from Apple App Store, Google Play, and Product Hunt (SD-LEO-FEAT-AUTOMATED-RANKING-DATA-001) |
| [archetype_benchmarks](tables/archetype_benchmarks.md) | 7 | ✅ | 2 | - |
| [archetype_profile_interactions](tables/archetype_profile_interactions.md) | 18 | ✅ | 2 | Interaction matrix between 6 EHG venture archetypes and evaluation profiles, defining weight adjustments and execution guidance |
| [assumption_sets](tables/assumption_sets.md) | 0 | ✅ | 4 | Golden Nugget: Versioned assumption sets for Assumptions vs Reality calibration |
| [audit_finding_sd_links](tables/audit_finding_sd_links.md) | 87 | ✅ | 2 | Join table supporting many-to-many relationships between audit findings and SDs.
   Supports primary (1:1), supporting (N:1), and theme (N:1) link types. |
| [audit_finding_sd_mapping](tables/audit_finding_sd_mapping.md) | 76 | ✅ | 2 | Maps runtime audit findings to Strategic Directives with full traceability.
   Created from triangulated recommendations (Claude + OpenAI + Antigravity).
   Key invariant: original_issue_id is immutable - verbatim Chairman feedback preserved. |
| [audit_log](tables/audit_log.md) | 143 | ✅ | 1 | Generic audit log for tracking system events, changes, and governance actions across all LEO Protocol entities. |
| [audit_triangulation_log](tables/audit_triangulation_log.md) | 0 | ✅ | 4 | - |
| [auto_apply_allowlist](tables/auto_apply_allowlist.md) | 6 | ✅ | 2 | Tables that AUTO-tier is permitted to modify. Default-deny: unlisted tables are blocked. |
| [auto_apply_denylist](tables/auto_apply_denylist.md) | 18 | ✅ | 2 | Tables that AUTO-tier must NEVER modify. Includes governance, safety, and critical system tables. |
| [backlog_item_completion](tables/backlog_item_completion.md) | 1 | ✅ | 2 | RLS enabled: service_role full access, authenticated read-only |
| [blueprint_board_submissions](tables/blueprint_board_submissions.md) | 0 | ✅ | 5 | Tracks blueprint submissions for board review (SD-BLUEPRINT-UI-001:US-002,US-003) |
| [blueprint_selection_signals](tables/blueprint_selection_signals.md) | 0 | ✅ | 3 | - |
| [board_meeting_attendance](tables/board_meeting_attendance.md) | 0 | ✅ | 1 | Attendance and voting records for board meetings |
| [board_meetings](tables/board_meetings.md) | 0 | ✅ | 1 | Board meetings with agenda, outcomes, and workflow linkage |
| [board_members](tables/board_members.md) | 7 | ✅ | 2 | Board of Directors members with voting weights and expertise domains |
| [brainstorm_question_effectiveness](tables/brainstorm_question_effectiveness.md) | 0 | ✅ | 2 | Aggregates question effectiveness metrics across all sessions. Used to identify high-value vs low-value questions, optimize question ordering, and refine domain-specific brainstorm workflows. |
| [brainstorm_question_interactions](tables/brainstorm_question_interactions.md) | 0 | ✅ | 2 | Tracks individual question-answer interactions during brainstorm sessions. Used to measure question effectiveness (skip rates, answer quality, revision patterns) and optimize question flows. |
| [brainstorm_sessions](tables/brainstorm_sessions.md) | 116 | ✅ | 2 | Tracks brainstorming sessions across domains (venture, protocol, integration, architecture) with outcome classification, quality metrics, and capability matching. Used for question effectiveness analysis and retrospective integration. |
| [brand_genome_submissions](tables/brand_genome_submissions.md) | 0 | ✅ | 5 | Brand identity genome for ventures ensuring marketing consistency |
| [brand_variants](tables/brand_variants.md) | 0 | ✅ | 6 | - |
| [campaign_content](tables/campaign_content.md) | 0 | ✅ | 2 | - |
| [capital_transactions](tables/capital_transactions.md) | 30 | ✅ | 2 | - |
| [chairman_approval_requests](tables/chairman_approval_requests.md) | 0 | ✅ | 1 | Centralized queue for chairman approval decisions. SD-STAGE-13-001. |
| [chairman_constraints](tables/chairman_constraints.md) | 10 | ✅ | 1 | Strategic constraints from the chairman applied to every venture during Stage 0 synthesis. Evolves over time from kill gate outcomes and retrospectives. |
| [chairman_decisions](tables/chairman_decisions.md) | 0 | ✅ | 4 | SD-HARDENING-V1-001: Chairman-only decision records.
RLS hardened - only chairman (fn_is_chairman()) can access.
SECURITY FIX: Replaced USING(true) from 20251216000001_chairman_unified_decisions.sql |
| [chairman_directives](tables/chairman_directives.md) | 0 | ✅ | 4 | - |
| [chairman_feedback](tables/chairman_feedback.md) | 0 | ✅ | 4 | - |
| [chairman_interests](tables/chairman_interests.md) | 0 | ✅ | 5 | Stores chairman/user market interests, customer segments, focus areas, and exclusions for personalized opportunity filtering. SD-CHAIRMAN-INTERESTS-001. |
| [chairman_notifications](tables/chairman_notifications.md) | 0 | ✅ | 2 | Tracks all notification delivery attempts for the Chairman notification service (SD-EVA-FEAT-NOTIFICATION-001) |
| [chairman_overrides](tables/chairman_overrides.md) | 0 | ✅ | 1 | - |
| [chairman_preferences](tables/chairman_preferences.md) | 1 | ✅ | 4 | - |
| [chairman_settings](tables/chairman_settings.md) | 0 | ✅ | 4 | Configurable venture selection parameters for the Chairman. Supports company-level defaults and venture-specific overrides. |
| [channel_budgets](tables/channel_budgets.md) | 0 | ✅ | 2 | - |
| [circuit_breaker_blocks](tables/circuit_breaker_blocks.md) | 1,272 | ✅ | 2 | Audit log for Circuit Breaker blocks (Law 3).
Records all handoffs rejected due to validation_score < 85%.
Part of EHG Immutable Laws v9.0.0 Manifesto enforcement. |
| [claude_sessions](tables/claude_sessions.md) | 9,136 | ✅ | 4 | Tracks active Claude Code sessions for multi-instance coordination. Sessions auto-register and update heartbeat on sd:next/sd:claim. |
| [companies](tables/companies.md) | 93 | ✅ | 6 | - |
| [competitors](tables/competitors.md) | 0 | ✅ | 5 | - |
| [compliance_alerts](tables/compliance_alerts.md) | 14 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Compliance alerts and violations |
| [compliance_artifact_templates](tables/compliance_artifact_templates.md) | 7 | ✅ | 1 | SD-LIFECYCLE-GAP-002: Templates for generating compliance artifacts |
| [compliance_checklist_items](tables/compliance_checklist_items.md) | 39 | ✅ | 1 | SD-LIFECYCLE-GAP-002: Individual checklist items with REQUIRED/RECOMMENDED tiers |
| [compliance_checklists](tables/compliance_checklists.md) | 3 | ✅ | 1 | SD-LIFECYCLE-GAP-002: Archetype-specific compliance checklists with versioning |
| [compliance_checks](tables/compliance_checks.md) | 12 | ✅ | 2 | Stores compliance check run history for the Always-On Compliance orchestrator |
| [compliance_events](tables/compliance_events.md) | 8 | ✅ | 2 | CCE Event Store: Normalized compliance events for UI and external consumers |
| [compliance_gate_events](tables/compliance_gate_events.md) | 0 | ✅ | 2 | SD-LIFECYCLE-GAP-002: Audit trail for gate evaluations and metrics |
| [compliance_policies](tables/compliance_policies.md) | 6 | ✅ | 2 | CCE Policy Registry: Configurable compliance rules with JSONB configuration |
| [compliance_violations](tables/compliance_violations.md) | 687 | ✅ | 3 | Stores individual compliance violations detected during checks |
| [component_registry_embeddings](tables/component_registry_embeddings.md) | 0 | ✅ | 2 | Component registry with semantic search embeddings for AI-powered recommendations during PRD creation |
| [connection_selection_log](tables/connection_selection_log.md) | 728 | ✅ | 1 | Audit trail for connection method selection. Auto-cleanup recommended at 30 days. |
| [connection_strategies](tables/connection_strategies.md) | 5 | ✅ | 1 | Ranked connection methods per service. Used by lib/connection-router.js to select optimal connection without trial-and-error. |
| [constitutional_amendments](tables/constitutional_amendments.md) | 1 | ✅ | 1 | Tracks proposed amendments to protocol constitution rules (protocol_constitution table) |
| [content_types](tables/content_types.md) | 3 | ✅ | 2 | - |
| [context_embeddings](tables/context_embeddings.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 020) - Vector embeddings for semantic similarity matching |
| [context_usage_daily](tables/context_usage_daily.md) | 0 | ✅ | 3 | Aggregated daily context usage metrics for trend analysis |
| [context_usage_log](tables/context_usage_log.md) | 12 | ✅ | 3 | Raw context usage entries from Claude Code status line (server-authoritative token counts) |
| [continuous_execution_log](tables/continuous_execution_log.md) | 5,889 | ✅ | 3 | RLS: Append-only for authenticated |
| [counterfactual_scores](tables/counterfactual_scores.md) | 0 | ✅ | 1 | - |
| [cross_agent_correlations](tables/cross_agent_correlations.md) | 0 | ✅ | 2 | Tracks how decisions by one agent correlate with outcomes in other agents |
| [cross_sd_utilization](tables/cross_sd_utilization.md) | 1 | ✅ | 2 | Manages cross-SD utilization requests and approvals |
| [cultural_design_styles](tables/cultural_design_styles.md) | 4 | ✅ | 4 | - |
| [daily_rollups](tables/daily_rollups.md) | 0 | ✅ | 2 | - |
| [db_agent_config](tables/db_agent_config.md) | 4 | ✅ | 1 | Runtime configuration for database sub-agent auto-invocation (SD-LEO-INFRA-DATABASE-SUB-AGENT-001) |
| [db_agent_invocations](tables/db_agent_invocations.md) | 0 | ✅ | 1 | Audit trail for database sub-agent invocation decisions (SD-LEO-INFRA-DATABASE-SUB-AGENT-001) |
| [debate_arguments](tables/debate_arguments.md) | 6 | ✅ | 2 | - |
| [debate_circuit_breaker](tables/debate_circuit_breaker.md) | 0 | ✅ | 2 | - |
| [debate_sessions](tables/debate_sessions.md) | 3 | ✅ | 3 | - |
| [defect_taxonomy](tables/defect_taxonomy.md) | 9 | ✅ | 2 | Classification taxonomy for defect categorization and prevention stage mapping |
| [department_agents](tables/department_agents.md) | 1 | ✅ | 2 | - |
| [department_capabilities](tables/department_capabilities.md) | 1 | ✅ | 2 | - |
| [department_messages](tables/department_messages.md) | 1 | ✅ | 2 | - |
| [departments](tables/departments.md) | 5 | ✅ | 2 | - |
| [directive_submissions](tables/directive_submissions.md) | 53 | ✅ | 2 | - |
| [discovery_strategies](tables/discovery_strategies.md) | 4 | ✅ | 1 | Configuration for the Find Me Opportunities discovery mode entry path in Stage 0 |
| [distribution_channels](tables/distribution_channels.md) | 4 | ✅ | 2 | - |
| [distribution_history](tables/distribution_history.md) | 0 | ✅ | 2 | - |
| [doctrine_constraint_violations](tables/doctrine_constraint_violations.md) | 0 | ✅ | 2 | Audit log for Doctrine of Constraint violations (Law 1).
Captures all attempts by EXEC agents to create/modify governance artifacts.
Part of EHG Immutable Laws v9.0.0 Manifesto enforcement. |
| [documentation_health_checks](tables/documentation_health_checks.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Documentation health check results |
| [documentation_inventory](tables/documentation_inventory.md) | 398 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Documentation inventory |
| [documentation_templates](tables/documentation_templates.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Documentation templates |
| [documentation_violations](tables/documentation_violations.md) | 282 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Documentation violations |
| [domain_knowledge](tables/domain_knowledge.md) | 0 | ✅ | 1 | - |
| [ehg_alerts](tables/ehg_alerts.md) | 0 | ✅ | 2 | - |
| [ehg_component_patterns](tables/ehg_component_patterns.md) | 4 | ✅ | 2 | Reusable UI patterns and components |
| [ehg_design_decisions](tables/ehg_design_decisions.md) | 0 | ✅ | 4 | Historical design decisions for learning and consistency |
| [ehg_feature_areas](tables/ehg_feature_areas.md) | 10 | ✅ | 2 | Major feature domains in the EHG application (Ventures, Analytics, etc.) |
| [ehg_page_routes](tables/ehg_page_routes.md) | 8 | ✅ | 2 | All page routes with their purposes and relationships |
| [ehg_user_workflows](tables/ehg_user_workflows.md) | 3 | ✅ | 2 | Documented user journeys through the application |
| [enhancement_proposal_audit](tables/enhancement_proposal_audit.md) | 0 | ✅ | 2 | - |
| [enhancement_proposals](tables/enhancement_proposals.md) | 1 | ✅ | 2 | Stores LEO-generated enhancement proposals for protocol improvements |
| [eva_actions](tables/eva_actions.md) | 0 | ✅ | 2 | EVA orchestration actions - tracks all automated and manual actions executed during sessions |
| [eva_agent_communications](tables/eva_agent_communications.md) | 0 | ✅ | 2 | Inter-agent messaging for EVA orchestration - tracks all agent-to-agent communications |
| [eva_architecture_plans](tables/eva_architecture_plans.md) | 3 | ✅ | 2 | Architecture Plans linked to Vision documents. ON DELETE RESTRICT on vision_id prevents deleting a vision that has architecture plans. |
| [eva_artifact_dependencies](tables/eva_artifact_dependencies.md) | 7 | ✅ | 2 | Cross-stage data contracts ensuring artifacts from earlier stages are validated before later stages proceed |
| [eva_audit_log](tables/eva_audit_log.md) | 80 | ✅ | 3 | EVA Audit Trail - All actions logged |
| [eva_automation_executions](tables/eva_automation_executions.md) | 0 | ✅ | 1 | Log of all automation rule executions |
| [eva_automation_rules](tables/eva_automation_rules.md) | 4 | ✅ | 1 | EVA automation rules for Class A auto-fix and Class B auto-draft actions (SD-EVA-AUTOMATION-001) |
| [eva_circuit_breaker](tables/eva_circuit_breaker.md) | 1 | ✅ | 2 | EVA Circuit Breaker - Protects ventures from cascading EVA failures. State machine: closed → open → half_open → closed |
| [eva_circuit_state_transitions](tables/eva_circuit_state_transitions.md) | 0 | ✅ | 2 | Audit log of all EVA circuit breaker state transitions |
| [eva_claude_code_intake](tables/eva_claude_code_intake.md) | 0 | ✅ | 2 | Tracks Claude Code GitHub releases for automated monitoring and chairman approval pipeline |
| [eva_config](tables/eva_config.md) | 2 | ✅ | 2 | - |
| [eva_decisions](tables/eva_decisions.md) | 0 | ✅ | 2 | EVA Decision Router - Chairman decision tracking |
| [eva_event_ledger](tables/eva_event_ledger.md) | 0 | ✅ | 2 | - |
| [eva_event_log](tables/eva_event_log.md) | 0 | ✅ | 2 | - |
| [eva_events](tables/eva_events.md) | 0 | ✅ | 2 | EVA Event Bus - All venture-related events |
| [eva_events_dlq](tables/eva_events_dlq.md) | 1 | ✅ | 2 | - |
| [eva_idea_categories](tables/eva_idea_categories.md) | 18 | ✅ | 2 | - |
| [eva_interactions](tables/eva_interactions.md) | 854 | ❌ | 0 | Core table capturing all EVA chairman-system interactions for closed-loop learning (SD-LEO-FEAT-DATA-FLYWHEEL-001) |
| [eva_orchestration_events](tables/eva_orchestration_events.md) | 0 | ✅ | 2 | EVA orchestration lifecycle events for Chairman Dashboard Event Feed. Real-time enabled. |
| [eva_orchestration_sessions](tables/eva_orchestration_sessions.md) | 0 | ✅ | 2 | EVA orchestration sessions - tracks multi-agent coordination for ventures and strategic initiatives |
| [eva_saga_log](tables/eva_saga_log.md) | 0 | ✅ | 1 | Saga execution logs for Eva Orchestrator compensation pattern |
| [eva_scheduler_heartbeat](tables/eva_scheduler_heartbeat.md) | 1 | ✅ | 2 | - |
| [eva_scheduler_metrics](tables/eva_scheduler_metrics.md) | 4,189 | ✅ | 2 | - |
| [eva_scheduler_queue](tables/eva_scheduler_queue.md) | 1 | ✅ | 2 | - |
| [eva_stage_gate_results](tables/eva_stage_gate_results.md) | 0 | ✅ | 2 | Tracks EVA gate evaluations with kill gate enforcement (stages 3,5,13,23 require 70% score) |
| [eva_sync_state](tables/eva_sync_state.md) | 4 | ✅ | 2 | - |
| [eva_todoist_intake](tables/eva_todoist_intake.md) | 104 | ✅ | 2 | - |
| [eva_trace_log](tables/eva_trace_log.md) | 0 | ✅ | 1 | - |
| [eva_ventures](tables/eva_ventures.md) | 1 | ✅ | 2 | EVA Operating System - Venture tracking with health metrics |
| [eva_vision_documents](tables/eva_vision_documents.md) | 3 | ✅ | 2 | Stores EHG portfolio (L1) and venture-specific (L2) vision documents for the EVA Vision Governance System. L2 visions link to L1 via parent_vision_id. |
| [eva_vision_gaps](tables/eva_vision_gaps.md) | 0 | ✅ | 2 | - |
| [eva_vision_iterations](tables/eva_vision_iterations.md) | 1 | ✅ | 2 | Tracks scoring cycle history. UNIQUE(vision_id, iteration_number) ensures one record per cycle. completed_at is NULL until the iteration scoring run finishes. |
| [eva_vision_scores](tables/eva_vision_scores.md) | 1,245 | ✅ | 2 | Append-only scoring records. rubric_snapshot is frozen at score time for immutable audit trail. sd_id is an intentional soft TEXT reference to SD keys — no FK to allow async SD creation. |
| [eva_weekly_review_templates](tables/eva_weekly_review_templates.md) | 2 | ✅ | 1 | Templates for automated weekly review generation |
| [eva_youtube_intake](tables/eva_youtube_intake.md) | 101 | ✅ | 2 | - |
| [evaluation_profile_outcomes](tables/evaluation_profile_outcomes.md) | 0 | ✅ | 2 | Per-gate survival signals linking evaluation profile+version to venture outcomes at tracked boundaries |
| [evaluation_profiles](tables/evaluation_profiles.md) | 9 | ✅ | 2 | Configurable evaluation weight profiles for EVA Stage 0 synthesis scoring |
| [evidence_gate_mapping](tables/evidence_gate_mapping.md) | 8 | ❌ | 0 | - |
| [exec_authorizations](tables/exec_authorizations.md) | 0 | ✅ | 2 | - |
| [exec_handoff_preparations](tables/exec_handoff_preparations.md) | 0 | ✅ | 2 | Tracks EXEC→PLAN handoff preparation and delivery |
| [exec_implementation_sessions](tables/exec_implementation_sessions.md) | 0 | ✅ | 2 | Stores results from EXEC Implementation Excellence Orchestrator - systematic implementation tracking and quality assurance |
| [exec_quality_checkpoints](tables/exec_quality_checkpoints.md) | 0 | ✅ | 2 | Tracks completion of quality checkpoints during EXEC implementation |
| [exec_sub_agent_activations](tables/exec_sub_agent_activations.md) | 0 | ✅ | 2 | Detailed results from sub-agent activations during EXEC implementation |
| [execution_sequences_v2](tables/execution_sequences_v2.md) | 0 | ✅ | 2 | - |
| [feedback](tables/feedback.md) | 28 | ✅ | 6 | - |
| [feedback_events](tables/feedback_events.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 020) - User feedback events for continuous learning |
| [feedback_quality_config](tables/feedback_quality_config.md) | 1 | ✅ | 2 | Configuration for Feedback Quality Layer. SD: SD-LEO-SELF-IMPROVE-001C |
| [feedback_sd_map](tables/feedback_sd_map.md) | 0 | ✅ | 4 | - |
| [financial_models](tables/financial_models.md) | 5 | ✅ | 4 | Venture capital financial models with templates (SaaS, marketplace, etc.) |
| [financial_projections](tables/financial_projections.md) | 5 | ✅ | 1 | Financial projections for venture models (monthly/quarterly/yearly) |
| [financial_scenarios](tables/financial_scenarios.md) | 5 | ✅ | 1 | Scenario analysis results (Monte Carlo, sensitivity, etc.) |
| [fit_gate_scores](tables/fit_gate_scores.md) | 0 | ✅ | 4 | Asset Factory fit gate scoring with multi-criteria evaluation framework |
| [folder_structure_snapshot](tables/folder_structure_snapshot.md) | 0 | ✅ | 2 | - |
| [gap_analysis_results](tables/gap_analysis_results.md) | 105 | ✅ | 3 | Stores integration gap analysis results comparing PRD requirements against actual implementation. Part of SD-LEO-FEAT-INTEGRATION-GAP-DETECTOR-001. |
| [gate_requirements_templates](tables/gate_requirements_templates.md) | 5 | ✅ | 2 | Templates for generating verification gates with standard requirements |
| [github_operations](tables/github_operations.md) | 0 | ✅ | 4 | Tracks all GitHub operations initiated by the LEO Protocol GitHub Sub-Agent |
| [governance_audit_log](tables/governance_audit_log.md) | 107,490 | ✅ | 3 | - |
| [governance_decisions](tables/governance_decisions.md) | 0 | ✅ | 2 | - |
| [governance_policies](tables/governance_policies.md) | 0 | ✅ | 2 | - |
| [governance_proposals](tables/governance_proposals.md) | 2 | ✅ | 2 | - |
| [handoff_audit_log](tables/handoff_audit_log.md) | 10,205 | ✅ | 2 | Audit trail for all handoff creation attempts, including blocked bypasses |
| [handoff_validation_rules](tables/handoff_validation_rules.md) | 8 | ✅ | 2 | - |
| [handoff_verification_gates](tables/handoff_verification_gates.md) | 0 | ✅ | 2 | Mandatory verification checkpoints that must pass before handoffs can proceed |
| [hap_blocks_v2](tables/hap_blocks_v2.md) | 0 | ✅ | 2 | - |
| [import_audit](tables/import_audit.md) | 1 | ✅ | 2 | - |
| [improvement_quality_assessments](tables/improvement_quality_assessments.md) | 0 | ✅ | 1 | AI quality judge evaluations for protocol improvements |
| [intake_submissions](tables/intake_submissions.md) | 0 | ✅ | 5 | Asset Factory multi-step intake wizard submissions with version tracking |
| [integration_config](tables/integration_config.md) | 2 | ✅ | 1 | Database-backed configuration for data-plane pipeline integration. SD: SD-LEO-SELF-IMPROVE-001L |
| [integrity_metrics](tables/integrity_metrics.md) | 1 | ✅ | 2 | - |
| [intelligence_analysis](tables/intelligence_analysis.md) | 0 | ✅ | 4 | - |
| [intelligence_patterns](tables/intelligence_patterns.md) | 0 | ✅ | 2 | Stores learned patterns about project types, complexity factors, and their typical outcomes |
| [interaction_history](tables/interaction_history.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 020) - Complete history of context monitoring interactions |
| [issue_patterns](tables/issue_patterns.md) | 352 | ✅ | 4 | Learning history system: stores recurring issues, proven solutions, and success metrics for cross-session knowledge retention |
| [judge_verdicts](tables/judge_verdicts.md) | 1 | ✅ | 3 | - |
| [key_results](tables/key_results.md) | 28 | ✅ | 2 | Measurable outcomes (the KR in OKRs) |
| [kr_progress_snapshots](tables/kr_progress_snapshots.md) | 28 | ✅ | 2 | Historical tracking of Key Result values |
| [lead_evaluations](tables/lead_evaluations.md) | 1 | ✅ | 2 | Stores results from LEAD Critical Evaluator framework - mandatory business value assessments |
| [learning_configurations](tables/learning_configurations.md) | 1 | ✅ | 2 | RLS enabled 2025-10-26 (migration 020) - Adaptive configuration parameters that evolve |
| [learning_decisions](tables/learning_decisions.md) | 130 | ✅ | 1 | Tracks all /learn command actions, findings, and user approvals to close the feedback loop on organizational learning. |
| [learning_inbox](tables/learning_inbox.md) | 0 | ✅ | 3 | Unified view of all learnable items from various sources (patterns, feedback, retrospectives, improvements) |
| [leo_adrs](tables/leo_adrs.md) | 0 | ✅ | 2 | - |
| [leo_agents](tables/leo_agents.md) | 3 | ✅ | 3 | - |
| [leo_artifacts](tables/leo_artifacts.md) | 0 | ✅ | 2 | - |
| [leo_audit_checklists](tables/leo_audit_checklists.md) | 10 | ✅ | 2 | Artifact requirements per SD type for health audits |
| [leo_audit_config](tables/leo_audit_config.md) | 1 | ✅ | 2 | Configuration for LEO Self-Audit automated health checks |
| [leo_autonomous_directives](tables/leo_autonomous_directives.md) | 5 | ✅ | 1 | - |
| [leo_codebase_validations](tables/leo_codebase_validations.md) | 0 | ✅ | 2 | - |
| [leo_complexity_thresholds](tables/leo_complexity_thresholds.md) | 4 | ✅ | 2 | Configuration for automatic complexity detection and reasoning depth triggers |
| [leo_effort_policies](tables/leo_effort_policies.md) | 16 | ✅ | 3 | LEO Protocol effort policies by phase and complexity level |
| [leo_error_log](tables/leo_error_log.md) | 53 | ✅ | 2 | LEO Protocol error log for critical failures that need operator attention. Part of SD-GENESIS-V32-PULSE resilience infrastructure. |
| [leo_events](tables/leo_events.md) | 19 | ✅ | 1 | Append-only event log for auditability. SD: SD-LEO-SELF-IMPROVE-001B |
| [leo_execution_jobs](tables/leo_execution_jobs.md) | 2 | ✅ | 1 | Execution work items from prioritized proposals. SD: SD-LEO-SELF-IMPROVE-001L |
| [leo_feature_flag_approvals](tables/leo_feature_flag_approvals.md) | 0 | ✅ | 2 | Approval workflow tracking for feature flag state transitions |
| [leo_feature_flag_audit](tables/leo_feature_flag_audit.md) | 12 | ✅ | 2 | Immutable audit log for all feature flag changes |
| [leo_feature_flag_audit_log](tables/leo_feature_flag_audit_log.md) | 6 | ✅ | 2 | Audit trail for all feature flag operations |
| [leo_feature_flag_policies](tables/leo_feature_flag_policies.md) | 4 | ✅ | 2 | Per-environment rollout policies for feature flags |
| [leo_feature_flags](tables/leo_feature_flags.md) | 4 | ✅ | 2 | Feature flag definitions for LEO Protocol runtime control |
| [leo_feedback](tables/leo_feedback.md) | 0 | ✅ | 2 | - |
| [leo_gate_reviews](tables/leo_gate_reviews.md) | 438 | ✅ | 2 | - |
| [leo_handoff_executions](tables/leo_handoff_executions.md) | 5,320 | ✅ | 3 | Tracks all LEO Protocol handoff executions with full audit trail. Used by unified-handoff-system.js for workflow orchestration. |
| [leo_handoff_rejections](tables/leo_handoff_rejections.md) | 0 | ✅ | 2 | Tracks rejected handoffs with improvement guidance for LEO Protocol v4.2.0 |
| [leo_handoff_templates](tables/leo_handoff_templates.md) | 5 | ✅ | 3 | - |
| [leo_handoff_validations](tables/leo_handoff_validations.md) | 0 | ✅ | 2 | Stores validation results for handoff executions in LEO Protocol v4.2.0 |
| [leo_integration_contracts](tables/leo_integration_contracts.md) | 10 | ✅ | 3 | OIV integration contracts defining expected code integration points to verify. Each contract specifies a file, function, and import chain that must be verifiable. |
| [leo_integration_verification_results](tables/leo_integration_verification_results.md) | 17 | ✅ | 4 | Audit trail of OIV verification runs with per-checkpoint breakdown (L1-L5). Links to contracts and SD context. |
| [leo_interfaces](tables/leo_interfaces.md) | 4 | ✅ | 2 | - |
| [leo_kb_generation_log](tables/leo_kb_generation_log.md) | 0 | ✅ | 3 | Tracks KB file generation timestamps for staleness detection - warn if >30 days old |
| [leo_kill_switches](tables/leo_kill_switches.md) | 1 | ✅ | 2 | Emergency kill switches for instant global disablement |
| [leo_mandatory_validations](tables/leo_mandatory_validations.md) | 2 | ✅ | 2 | - |
| [leo_nfr_requirements](tables/leo_nfr_requirements.md) | 0 | ✅ | 2 | - |
| [leo_planner_rankings](tables/leo_planner_rankings.md) | 5 | ✅ | 2 | Stores Central Planner output for stability tracking and audit |
| [leo_prioritization_config](tables/leo_prioritization_config.md) | 0 | ✅ | 2 | System-wide prioritization configuration. SD: SD-LEO-SELF-IMPROVE-001B |
| [leo_process_scripts](tables/leo_process_scripts.md) | 8 | ✅ | 3 | Documents all LEO process scripts with usage patterns and examples - single source of truth for script documentation |
| [leo_prompts](tables/leo_prompts.md) | 0 | ✅ | 2 | Versioned agent prompts for reproducibility. SD: SD-LEO-SELF-IMPROVE-001B |
| [leo_proposal_transitions](tables/leo_proposal_transitions.md) | 0 | ✅ | 2 | Audit trail of proposal status changes |
| [leo_proposals](tables/leo_proposals.md) | 1 | ✅ | 4 | Protocol improvement proposals with enforced lifecycle states |
| [leo_protocol_changes](tables/leo_protocol_changes.md) | 6 | ✅ | 2 | - |
| [leo_protocol_file_audit](tables/leo_protocol_file_audit.md) | 0 | ✅ | 2 | - |
| [leo_protocol_references](tables/leo_protocol_references.md) | 0 | ✅ | 2 | - |
| [leo_protocol_sections](tables/leo_protocol_sections.md) | 220 | ✅ | 4 | - |
| [leo_protocol_state](tables/leo_protocol_state.md) | 0 | ❌ | 0 | - |
| [leo_protocols](tables/leo_protocols.md) | 5 | ✅ | 3 | - |
| [leo_reasoning_sessions](tables/leo_reasoning_sessions.md) | 0 | ✅ | 2 | Tracks automatic chain-of-thought reasoning sessions with complexity-based depth selection |
| [leo_reasoning_triggers](tables/leo_reasoning_triggers.md) | 7 | ✅ | 2 | Rules for automatically triggering different reasoning depths based on content analysis |
| [leo_risk_spikes](tables/leo_risk_spikes.md) | 0 | ✅ | 2 | - |
| [leo_schema_constraints](tables/leo_schema_constraints.md) | 16 | ✅ | 3 | Documents all CHECK constraints for LEO tables - used by agents to pre-validate data before insert |
| [leo_scoring_prioritization_config](tables/leo_scoring_prioritization_config.md) | 1 | ✅ | 2 | Active rubric selection and deterministic scoring settings per scope. SD: SD-LEO-SELF-IMPROVE-001G Phase 3a |
| [leo_scoring_rubrics](tables/leo_scoring_rubrics.md) | 281 | ✅ | 2 | Versioned, immutable scoring rubrics for deterministic prioritization. SD: SD-LEO-SELF-IMPROVE-001G Phase 3a |
| [leo_settings](tables/leo_settings.md) | 1 | ✅ | 3 | Global LEO Protocol settings (singleton pattern). Stores default values for AUTO-PROCEED and Orchestrator Chaining that apply to all new sessions. |
| [leo_simplification_rules](tables/leo_simplification_rules.md) | 8 | ✅ | 1 | Database-driven rules for /simplify command. Rules are regex patterns that match code and provide replacements. |
| [leo_sub_agent_handoffs](tables/leo_sub_agent_handoffs.md) | 1 | ✅ | 2 | - |
| [leo_sub_agent_triggers](tables/leo_sub_agent_triggers.md) | 490 | ✅ | 3 | - |
| [leo_sub_agents](tables/leo_sub_agents.md) | 32 | ✅ | 3 | - |
| [leo_subagent_handoffs](tables/leo_subagent_handoffs.md) | 1 | ✅ | 2 | Stores distilled summaries passed between sub-agents |
| [leo_test_plans](tables/leo_test_plans.md) | 1 | ✅ | 2 | - |
| [leo_validation_rules](tables/leo_validation_rules.md) | 63 | ✅ | 3 | - |
| [leo_vetting_outcomes](tables/leo_vetting_outcomes.md) | 0 | ✅ | 3 | - |
| [leo_vetting_rubrics](tables/leo_vetting_rubrics.md) | 1 | ✅ | 2 | Versioned rubrics for evaluating proposals |
| [leo_workflow_phases](tables/leo_workflow_phases.md) | 0 | ✅ | 2 | - |
| [lifecycle_phases](tables/lifecycle_phases.md) | 6 | ✅ | 4 | Venture Vision v2.0 - 6 Phase Definitions |
| [lifecycle_stage_config](tables/lifecycle_stage_config.md) | 25 | ✅ | 4 | 25-stage venture lifecycle configuration. Stage 10 (Strategic Narrative & Positioning)
includes cultural_design_config artifact for venture-based design style selection.
Reference: docs/workflow/stages_v2.yaml |
| [llm_canary_metrics](tables/llm_canary_metrics.md) | 0 | ✅ | 1 | Rolling window metrics. Consider BRIN index or partitioning for high volume. |
| [llm_canary_state](tables/llm_canary_state.md) | 1 | ✅ | 1 | - |
| [llm_canary_transitions](tables/llm_canary_transitions.md) | 0 | ✅ | 1 | - |
| [llm_models](tables/llm_models.md) | 17 | ✅ | 2 | - |
| [llm_providers](tables/llm_providers.md) | 4 | ✅ | 2 | - |
| [market_segments](tables/market_segments.md) | 6 | ✅ | 3 | - |
| [marketing_attribution](tables/marketing_attribution.md) | 0 | ✅ | 2 | - |
| [marketing_campaigns](tables/marketing_campaigns.md) | 0 | ✅ | 2 | - |
| [marketing_channels](tables/marketing_channels.md) | 0 | ✅ | 2 | - |
| [marketing_content](tables/marketing_content.md) | 0 | ✅ | 2 | - |
| [marketing_content_queue](tables/marketing_content_queue.md) | 0 | ✅ | 2 | - |
| [marketing_content_variants](tables/marketing_content_variants.md) | 0 | ✅ | 2 | - |
| [missions](tables/missions.md) | 1 | ✅ | 1 | - |
| [model_usage_log](tables/model_usage_log.md) | 2,035 | ✅ | 3 | RLS: Append-only for authenticated |
| [modeling_requests](tables/modeling_requests.md) | 0 | ✅ | 1 | Horizontal forecasting and modeling engine serving Stage 0 components including time-horizon positioning, build cost estimation, and market analysis |
| [monthly_ceo_reports](tables/monthly_ceo_reports.md) | 0 | ✅ | 2 | Monthly CEO performance reports generated by the VentureCEORuntime agent |
| [naming_favorites](tables/naming_favorites.md) | 0 | ✅ | 1 | - |
| [naming_suggestions](tables/naming_suggestions.md) | 0 | ✅ | 2 | - |
| [nav_preferences](tables/nav_preferences.md) | 2 | ✅ | 2 | - |
| [nav_routes](tables/nav_routes.md) | 46 | ✅ | 4 | - |
| [nursery_evaluation_log](tables/nursery_evaluation_log.md) | 0 | ✅ | 1 | Audit trail of nursery item re-evaluations triggered by capability additions, market shifts, portfolio gaps, and related outcomes |
| [objectives](tables/objectives.md) | 7 | ✅ | 2 | Qualitative goals (the O in OKRs) |
| [okr_generation_log](tables/okr_generation_log.md) | 1 | ✅ | 2 | Audit trail for automated OKR generation runs |
| [operations_audit_log](tables/operations_audit_log.md) | 1 | ✅ | 2 | - |
| [opportunities](tables/opportunities.md) | 0 | ✅ | 2 | - |
| [opportunity_blueprints](tables/opportunity_blueprints.md) | 8 | ✅ | 2 | - |
| [opportunity_categories](tables/opportunity_categories.md) | 0 | ✅ | 1 | - |
| [opportunity_scans](tables/opportunity_scans.md) | 2 | ✅ | 2 | Tracks AI opportunity discovery scans. Each scan can generate multiple blueprints. |
| [opportunity_scores](tables/opportunity_scores.md) | 0 | ✅ | 1 | - |
| [opportunity_sources](tables/opportunity_sources.md) | 4 | ✅ | 2 | - |
| [orchestration_metrics](tables/orchestration_metrics.md) | 0 | ✅ | 4 | Performance analytics for EVA orchestration - tracks efficiency, quality, and resource utilization |
| [outcome_signals](tables/outcome_signals.md) | 558 | ✅ | 1 | - |
| [pattern_occurrences](tables/pattern_occurrences.md) | 0 | ✅ | 1 | Tracks individual pattern occurrences for trend calculation. |
| [pattern_resolution_signals](tables/pattern_resolution_signals.md) | 0 | ✅ | 1 | Signals indicating pattern resolution for evidence tracking |
| [pattern_subagent_mapping](tables/pattern_subagent_mapping.md) | 59 | ✅ | 3 | RLS: Service role write, authenticated read |
| [pending_ceo_handoffs](tables/pending_ceo_handoffs.md) | 4 | ✅ | 2 | Persists pending CEO handoff reviews. Replaces in-memory Map in venture-state-machine.js.
Part of SD-HARDENING-V2-002C: Idempotency & Persistence. |
| [persona_config](tables/persona_config.md) | 3 | ✅ | 1 | Per-application persona validation rules. SD-MAN-GEN-TITLE-TARGET-APPLICATION-001 |
| [pipeline_metrics](tables/pipeline_metrics.md) | 0 | ✅ | 2 | Time-series metrics for self-improvement pipeline. Retention: 30 days. |
| [plan_conflict_rules](tables/plan_conflict_rules.md) | 3 | ✅ | 2 | - |
| [plan_quality_gates](tables/plan_quality_gates.md) | 0 | ✅ | 2 | Tracks completion of quality gates defined during PLAN validation |
| [plan_sub_agent_executions](tables/plan_sub_agent_executions.md) | 0 | ✅ | 2 | Detailed results from sub-agent executions during PLAN validation |
| [plan_subagent_queries](tables/plan_subagent_queries.md) | 0 | ✅ | 2 | - |
| [plan_technical_validations](tables/plan_technical_validations.md) | 0 | ✅ | 2 | Stores results from PLAN Technical Validation Orchestrator - systematic technical validation and risk assessment |
| [plan_verification_results](tables/plan_verification_results.md) | 0 | ✅ | 2 | - |
| [portfolio_profile_allocations](tables/portfolio_profile_allocations.md) | 3 | ✅ | 1 | - |
| [portfolios](tables/portfolios.md) | 8 | ✅ | 7 | - |
| [pr_metrics](tables/pr_metrics.md) | 1 | ✅ | 4 | - |
| [prd_research_audit_log](tables/prd_research_audit_log.md) | 4 | ✅ | 6 | Audit log for all knowledge retrieval operations (monitoring and optimization) |
| [prd_ui_mappings](tables/prd_ui_mappings.md) | 8 | ✅ | 2 | - |
| [prds_backup_20251016](tables/prds_backup_20251016.md) | 9 | ✅ | 2 | - |
| [product_requirements_v2](tables/product_requirements_v2.md) | 1,183 | ✅ | 6 | Product Requirements Documents (PRDs) for Strategic Directives. Created by PLAN agent during PLAN_PRD phase. Contains comprehensive implementation specifications: requirements, architecture, testing, risks, and acceptance criteria. One PRD per SD (1:1 relationship via sd_uuid foreign key). |
| [profiles](tables/profiles.md) | 2 | ✅ | 4 | - |
| [prompt_templates](tables/prompt_templates.md) | 1 | ✅ | 2 | - |
| [proposal_approvals](tables/proposal_approvals.md) | 0 | ✅ | 2 | - |
| [proposal_debate_rounds](tables/proposal_debate_rounds.md) | 0 | ✅ | 2 | - |
| [proposal_debates](tables/proposal_debates.md) | 0 | ✅ | 2 | - |
| [proposal_notifications](tables/proposal_notifications.md) | 0 | ✅ | 2 | - |
| [proposal_state_transitions](tables/proposal_state_transitions.md) | 0 | ✅ | 2 | - |
| [protocol_constitution](tables/protocol_constitution.md) | 14 | ✅ | 4 | Immutable constitution rules for LEO self-improvement governance. Cannot be modified or deleted. |
| [protocol_improvement_audit_log](tables/protocol_improvement_audit_log.md) | 245 | ✅ | 2 | Audit trail for all protocol improvement actions. Tracks who approved what and when changes were applied. |
| [protocol_improvement_queue](tables/protocol_improvement_queue.md) | 82 | ✅ | 5 | Queue for protocol improvements extracted from retrospectives. Enforces database-first approach by requiring target_table and payload. |
| [public_portfolio](tables/public_portfolio.md) | 2 | ✅ | 4 | - |
| [quick_fixes](tables/quick_fixes.md) | 38 | ✅ | 2 | LEO Quick-Fix Workflow: Lightweight issue tracking for UAT-discovered bugs/polish (≤50 LOC).
   Auto-escalates to full SD if criteria not met.
   Part of LEO Protocol v4.2.1 |
| [rca_auto_trigger_config](tables/rca_auto_trigger_config.md) | 8 | ✅ | 2 | - |
| [rca_learning_records](tables/rca_learning_records.md) | 1 | ✅ | 3 | Normalized learning signals for EVA integration and pattern recognition |
| [recursion_events](tables/recursion_events.md) | 0 | ✅ | 4 | - |
| [releases](tables/releases.md) | 0 | ✅ | 4 | - |
| [remediation_manifests](tables/remediation_manifests.md) | 1 | ✅ | 4 | Corrective and Preventive Action (CAPA) plans linked to root cause reports |
| [research_sessions](tables/research_sessions.md) | 101 | ✅ | 2 | - |
| [retro_notifications](tables/retro_notifications.md) | 1,554 | ✅ | 2 | - |
| [retrospective_action_items](tables/retrospective_action_items.md) | 0 | ✅ | 2 | - |
| [retrospective_contributions](tables/retrospective_contributions.md) | 1 | ✅ | 4 | - |
| [retrospective_insights](tables/retrospective_insights.md) | 0 | ✅ | 2 | - |
| [retrospective_learning_links](tables/retrospective_learning_links.md) | 0 | ✅ | 2 | - |
| [retrospective_templates](tables/retrospective_templates.md) | 2 | ✅ | 2 | - |
| [retrospective_triggers](tables/retrospective_triggers.md) | 0 | ✅ | 2 | - |
| [retrospectives](tables/retrospectives.md) | 1,760 | ✅ | 2 | - |
| [risk_assessments](tables/risk_assessments.md) | 295 | ✅ | 2 | BMAD Enhancement: Multi-domain risk assessment for Strategic Directives |
| [risk_escalation_log](tables/risk_escalation_log.md) | 0 | ✅ | 2 | SD-LIFECYCLE-GAP-005: Audit trail for risk escalations requiring chairman/EVA review |
| [risk_gate_passage_log](tables/risk_gate_passage_log.md) | 0 | ✅ | 2 | SD-LIFECYCLE-GAP-005: Tracks gate passage attempts and outcomes with risk summary |
| [risk_recalibration_forms](tables/risk_recalibration_forms.md) | 0 | ✅ | 2 | SD-LIFECYCLE-GAP-005: Risk re-calibration forms at phase boundary gates (Gates 3, 4, 5, 6) |
| [root_cause_reports](tables/root_cause_reports.md) | 323 | ✅ | 4 | Root cause investigation records for failures, defects, and quality issues across LEO Protocol |
| [runtime_audits](tables/runtime_audits.md) | 0 | ✅ | 4 | - |
| [scaffold_patterns](tables/scaffold_patterns.md) | 49 | ✅ | 3 | Pattern library for AI-driven code generation in Genesis simulations |
| [schema_expectations](tables/schema_expectations.md) | 5 | ✅ | 2 | - |
| [screen_layouts](tables/screen_layouts.md) | 1 | ✅ | 2 | - |
| [sd_backlog_map](tables/sd_backlog_map.md) | 6 | ✅ | 2 | - |
| [sd_baseline_issues](tables/sd_baseline_issues.md) | 11 | ✅ | 4 | Tracks pre-existing codebase issues that should not block unrelated SD completion. Part of LEO Protocol governance. |
| [sd_baseline_items](tables/sd_baseline_items.md) | 1,636 | ✅ | 1 | Individual SD assignments within a baseline, including track assignment, sequence, and effort estimates. |
| [sd_baseline_rationale](tables/sd_baseline_rationale.md) | 10 | ✅ | 3 | - |
| [sd_burn_rate_snapshots](tables/sd_burn_rate_snapshots.md) | 0 | ✅ | 1 | Periodic snapshots of velocity metrics for trending and forecasting. |
| [sd_business_evaluations](tables/sd_business_evaluations.md) | 0 | ✅ | 2 | - |
| [sd_capabilities](tables/sd_capabilities.md) | 64 | ✅ | 2 | Junction table tracking which capabilities were registered/updated/deprecated by which Strategic Directives. Provides full audit trail. |
| [sd_checkpoint_history](tables/sd_checkpoint_history.md) | 2,967 | ✅ | 3 | RLS: Append-only for authenticated |
| [sd_conflict_matrix](tables/sd_conflict_matrix.md) | 0 | ✅ | 1 | Potential conflicts between SDs that should not run in parallel. |
| [sd_contract_exceptions](tables/sd_contract_exceptions.md) | 0 | ✅ | 4 | Tracks all contract exceptions with full audit trail and automatic scrutiny assessment.
Each exception records the violation, justification, scrutiny level, and approval status.
This ensures transparency and governance for any contract boundary changes. |
| [sd_contract_violations](tables/sd_contract_violations.md) | 0 | ✅ | 4 | Tracks all contract violations detected during SD lifecycle.
BLOCKER violations prevent SD completion.
WARNING violations can be overridden with documented justification. |
| [sd_corrections](tables/sd_corrections.md) | 0 | ✅ | 1 | LEO 5.0 Corrections - tracks wall invalidation and correction workflows |
| [sd_data_contracts](tables/sd_data_contracts.md) | 0 | ✅ | 4 | Data contracts define schema boundaries for child SDs. Children can only touch
tables/columns explicitly allowed by their parent's contract. Violations are BLOCKERs.
Reference: Consistency + Autonomy Architecture Plan |
| [sd_dependency_graph](tables/sd_dependency_graph.md) | 0 | ✅ | 2 | Tracks dependencies and relationships between strategic directives |
| [sd_effectiveness_metrics](tables/sd_effectiveness_metrics.md) | 501 | ✅ | 1 | - |
| [sd_exec_file_operations](tables/sd_exec_file_operations.md) | 0 | ✅ | 4 | Tracks file operations during EXEC phase for automatic deliverable matching. Part of SD-DELIVERABLES-V2-001. |
| [sd_execution_actuals](tables/sd_execution_actuals.md) | 15 | ✅ | 1 | Actual execution metrics for variance analysis against baseline plan. |
| [sd_execution_baselines](tables/sd_execution_baselines.md) | 7 | ✅ | 1 | Point-in-time snapshots of SD execution plans. Only one baseline can be active at a time. Rebaseline requires LEAD approval. |
| [sd_execution_timeline](tables/sd_execution_timeline.md) | 3 | ✅ | 2 | - |
| [sd_gate_results](tables/sd_gate_results.md) | 4 | ✅ | 1 | LEO 5.0 Gate results - tracks individual gate validation outcomes |
| [sd_governance_bypass_audit](tables/sd_governance_bypass_audit.md) | 489 | ✅ | 2 | Audit trail for governance trigger bypasses.
All bypass requests are logged for security review.
Fixed: sd_id is TEXT to match strategic_directives_v2.id (VARCHAR). |
| [sd_intensity_adjustments](tables/sd_intensity_adjustments.md) | 3 | ✅ | 3 | Adjustments to validation requirements based on intensity level.
Overrides take precedence over sd_type_validation_profiles defaults.
Weight adjustments are ADDED to base weights (must sum to 0 to maintain 100% total). |
| [sd_intensity_gate_exemptions](tables/sd_intensity_gate_exemptions.md) | 21 | ✅ | 3 | Intensity-specific gate exemptions. Overrides sd_type_gate_exemptions when intensity_level is set. |
| [sd_key_result_alignment](tables/sd_key_result_alignment.md) | 65 | ✅ | 2 | Links Strategic Directives to Key Results |
| [sd_kickbacks](tables/sd_kickbacks.md) | 0 | ✅ | 1 | LEO 5.0 Kickback tracking - manages phase kickbacks for failure recovery |
| [sd_overlap_analysis](tables/sd_overlap_analysis.md) | 641 | ✅ | 2 | Stores overlap analysis results between strategic directives |
| [sd_phase_handoffs](tables/sd_phase_handoffs.md) | 9,470 | ✅ | 11 | DEPRECATED: Use leo_handoff_executions instead. This table is empty (0 records) and was created after leo_handoff_executions (166 records). Kept for backwards compatibility only. Single source of truth: leo_handoff_executions. |
| [sd_phase_tracking](tables/sd_phase_tracking.md) | 9 | ✅ | 2 | Tracks LEO Protocol phase completion for strategic directives |
| [sd_proposals](tables/sd_proposals.md) | 0 | ✅ | 3 | Proactive SD proposals generated by observer agents - LEO Protocol v4.4 |
| [sd_scope_deliverables](tables/sd_scope_deliverables.md) | 6,367 | ✅ | 2 | Tracks deliverables extracted from SD scope documents to ensure all promises are fulfilled |
| [sd_session_activity](tables/sd_session_activity.md) | 0 | ✅ | 1 | Granular tracking of SD work per session for continuity detection. |
| [sd_state_transitions](tables/sd_state_transitions.md) | 9 | ✅ | 2 | - |
| [sd_stream_completions](tables/sd_stream_completions.md) | 0 | ✅ | 1 | - |
| [sd_stream_requirements](tables/sd_stream_requirements.md) | 88 | ✅ | 1 | - |
| [sd_subagent_deliverable_mapping](tables/sd_subagent_deliverable_mapping.md) | 9 | ✅ | 2 | Maps sub-agent codes to deliverable types for automatic completion triggers |
| [sd_testing_status](tables/sd_testing_status.md) | 3 | ✅ | 2 | Tracks testing status for Strategic Directives. Prevents duplicate testing and provides work-down plan visualization. |
| [sd_type_change_audit](tables/sd_type_change_audit.md) | 26 | ✅ | 3 | RLS: Append-only for authenticated |
| [sd_type_gate_exemptions](tables/sd_type_gate_exemptions.md) | 57 | ✅ | 3 | Defines which gates are exempted, optional, or required for each SD type. Used by handoff executors and retro generator. |
| [sd_type_validation_profiles](tables/sd_type_validation_profiles.md) | 18 | ✅ | 4 | Configurable validation profiles for different SD types. Each type has different requirements for completion. |
| [sd_ux_contracts](tables/sd_ux_contracts.md) | 0 | ✅ | 4 | UX contracts define component/design boundaries for child SDs. Children can only
modify components within allowed paths and must use parent's cultural design style.
Violations are WARNINGs (can override with justification).
Reference: Consistency + Autonomy Architecture Plan |
| [sd_wall_states](tables/sd_wall_states.md) | 0 | ✅ | 1 | LEO 5.0 Wall states - tracks phase boundary status for Strategic Directives |
| [sd_workflow_template_steps](tables/sd_workflow_template_steps.md) | 68 | ✅ | 2 | SD-LEO-INFRA-WORKFLOW-TEMPLATES-TYPE-001: Ordered steps with weights for each workflow template |
| [sd_workflow_templates](tables/sd_workflow_templates.md) | 12 | ✅ | 2 | SD-LEO-INFRA-WORKFLOW-TEMPLATES-TYPE-001: Per-SD-type workflow definitions for progress calculation |
| [sdip_ai_analysis](tables/sdip_ai_analysis.md) | 0 | ✅ | 2 | - |
| [sdip_groups](tables/sdip_groups.md) | 0 | ✅ | 4 | Manually grouped SDIP submissions for combined analysis |
| [sdip_submissions](tables/sdip_submissions.md) | 0 | ✅ | 4 | Strategic Directive Initiation Protocol submissions with full validation workflow |
| [self_audit_findings](tables/self_audit_findings.md) | 0 | ✅ | 1 | Stores findings from LEO self-discovery routines (SD-LEO-SELF-IMPROVE-002B) |
| [sensemaking_analyses](tables/sensemaking_analyses.md) | 8 | ✅ | 1 | - |
| [sensemaking_knowledge_base](tables/sensemaking_knowledge_base.md) | 0 | ✅ | 1 | - |
| [sensemaking_personas](tables/sensemaking_personas.md) | 6 | ✅ | 1 | - |
| [sensemaking_telegram_sessions](tables/sensemaking_telegram_sessions.md) | 8 | ✅ | 1 | - |
| [session_lifecycle_events](tables/session_lifecycle_events.md) | 3,186 | ✅ | 2 | Audit log for session lifecycle events: create, heartbeat, stale, release. Part of FR-5. |
| [shipping_decisions](tables/shipping_decisions.md) | 868 | ✅ | 2 | - |
| [simulation_sessions](tables/simulation_sessions.md) | 5 | ✅ | 2 | Tracks Genesis simulation lifecycle including ephemeral deployments and incineration |
| [soul_extractions](tables/soul_extractions.md) | 0 | ✅ | 2 | Stores extracted structured requirements from simulations for regeneration gates (Stage 16/17) |
| [stage13_assessments](tables/stage13_assessments.md) | 0 | ✅ | 1 | EVA-generated exit readiness assessments. SD-STAGE-13-001. |
| [stage13_substage_states](tables/stage13_substage_states.md) | 0 | ✅ | 1 | Tracks current Stage 13 substage position per venture. SD-STAGE-13-001. |
| [stage13_valuations](tables/stage13_valuations.md) | 0 | ✅ | 1 | EVA-generated valuation models with confidence scores. SD-STAGE-13-001. |
| [stage_data_contracts](tables/stage_data_contracts.md) | 2 | ✅ | 2 | - |
| [stage_events](tables/stage_events.md) | 0 | ✅ | 4 | - |
| [stage_of_death_predictions](tables/stage_of_death_predictions.md) | 0 | ✅ | 1 | - |
| [story_test_mappings](tables/story_test_mappings.md) | 0 | ✅ | 4 | Links user stories to test results with traceability |
| [strategic_directives_v2](tables/strategic_directives_v2.md) | 1,398 | ✅ | 7 | RLS enabled: service_role full access, authenticated read-only |
| [strategic_themes](tables/strategic_themes.md) | 11 | ✅ | 1 | Annual strategic themes derived from EVA vision dimensions, used to group and prioritize Strategic Directives |
| [strategic_vision](tables/strategic_vision.md) | 1 | ✅ | 2 | Top-level organizational vision (2-5 year horizon) |
| [sub_agent_execution_batches](tables/sub_agent_execution_batches.md) | 2 | ✅ | 2 | - |
| [sub_agent_execution_results](tables/sub_agent_execution_results.md) | 16,733 | ✅ | 4 | LEO 5.0 Sub-agent execution results - tracks individual sub-agent runs and outputs |
| [sub_agent_execution_results_archive](tables/sub_agent_execution_results_archive.md) | 2,036 | ✅ | 4 | - |
| [sub_agent_executions](tables/sub_agent_executions.md) | 109 | ✅ | 2 | - |
| [sub_agent_gate_requirements](tables/sub_agent_gate_requirements.md) | 13 | ✅ | 2 | - |
| [sub_agent_spawn_events](tables/sub_agent_spawn_events.md) | 0 | ✅ | 1 | LEO 5.0 Sub-agent spawn events - tracks batch spawning of sub-agents |
| [subagent_activations](tables/subagent_activations.md) | 0 | ✅ | 2 | - |
| [subagent_requirements](tables/subagent_requirements.md) | 0 | ✅ | 2 | - |
| [subagent_validation_results](tables/subagent_validation_results.md) | 7,914 | ✅ | 3 | - |
| [submission_groups](tables/submission_groups.md) | 0 | ✅ | 2 | - |
| [submission_screenshots](tables/submission_screenshots.md) | 0 | ✅ | 2 | - |
| [submission_steps](tables/submission_steps.md) | 0 | ✅ | 2 | - |
| [substage_transition_log](tables/substage_transition_log.md) | 0 | ✅ | 1 | Audit trail of all Stage 13 substage transitions. SD-STAGE-13-001. |
| [system_alerts](tables/system_alerts.md) | 0 | ✅ | 2 | System-wide alerts including circuit breaker trips requiring Chairman attention |
| [system_events](tables/system_events.md) | 69 | ✅ | 3 | Black Box audit log for all agent actions, state transitions, and resource consumption.
   Supports all 6 Pillars: Command Engine (events), Crew Registry (agents),
   Capital Ledger (tokens), Truth Layer (calibration). Created by SD-UNIFIED-PATH-1.1.1. |
| [system_health](tables/system_health.md) | 1 | ✅ | 6 | Circuit breaker state machine for external service health monitoring |
| [system_settings](tables/system_settings.md) | 3 | ✅ | 2 | Unified source of truth for AUTO safety state and rate limits. Replaces split-brain freeze logic. |
| [task_hydration_log](tables/task_hydration_log.md) | 1,131 | ✅ | 1 | LEO 5.0 Task hydration log - tracks phase task generation events |
| [team_templates](tables/team_templates.md) | 3 | ✅ | 3 | Pre-built team templates for one-command team creation. Each template defines roles, task structure, and a leader agent. |
| [tech_stack_references](tables/tech_stack_references.md) | 0 | ✅ | 8 | Cache for Context7 MCP and retrospective research results with 24-hour TTL |
| [telegram_bot_interactions](tables/telegram_bot_interactions.md) | 79 | ✅ | 0 | Audit log for Chairman Telegram Bot interactions (SD-EHG-FEAT-CHAIRMAN-TELEGRAM-BOT-001) |
| [telegram_conversations](tables/telegram_conversations.md) | 4 | ✅ | 0 | Multi-turn conversation state for the Chairman Telegram Bot (SD-EHG-FEAT-CHAIRMAN-TELEGRAM-BOT-001) |
| [telegram_forum_topics](tables/telegram_forum_topics.md) | 8 | ✅ | 1 | - |
| [telemetry_analysis_runs](tables/telemetry_analysis_runs.md) | 4 | ✅ | 2 | Tracks lifecycle of telemetry auto-analysis runs (QUEUED->RUNNING->SUCCEEDED/FAILED/TIMED_OUT) |
| [telemetry_thresholds](tables/telemetry_thresholds.md) | 1 | ✅ | 2 | - |
| [test_coverage_policies](tables/test_coverage_policies.md) | 3 | ✅ | 2 | LOC-based test coverage policy enforcement for QA sub-agent. SD-QUALITY-002. |
| [test_plans](tables/test_plans.md) | 1 | ✅ | 2 | BMAD Enhancement: Structured test architecture planning for Strategic Directives |
| [test_results](tables/test_results.md) | 35 | ✅ | 4 | Individual test outcomes linked to test_runs |
| [test_runs](tables/test_runs.md) | 10 | ✅ | 4 | Immutable test execution records. Part of unified test evidence architecture (LEO v4.3.4) |
| [tool_access_grants](tables/tool_access_grants.md) | 1 | ✅ | 1 | - |
| [tool_registry](tables/tool_registry.md) | 13 | ✅ | 2 | - |
| [tool_usage_ledger](tables/tool_usage_ledger.md) | 0 | ✅ | 4 | - |
| [uat_audit_trail](tables/uat_audit_trail.md) | 0 | ✅ | 1 | - |
| [uat_cases](tables/uat_cases.md) | 81 | ✅ | 7 | - |
| [uat_coverage_metrics](tables/uat_coverage_metrics.md) | 0 | ✅ | 1 | - |
| [uat_credential_history](tables/uat_credential_history.md) | 0 | ✅ | 2 | Audit trail for credential rotations |
| [uat_credentials](tables/uat_credentials.md) | 2 | ✅ | 1 | Stores encrypted test credentials for UAT environments |
| [uat_debt_registry](tables/uat_debt_registry.md) | 0 | ✅ | 1 | Stores deferred human-judgment testing items from Vision QA and /uat workflows. Part of Three-Tier Testing Architecture (SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001). |
| [uat_defects](tables/uat_defects.md) | 0 | ✅ | 5 | - |
| [uat_issues](tables/uat_issues.md) | 0 | ✅ | 1 | - |
| [uat_performance_metrics](tables/uat_performance_metrics.md) | 0 | ✅ | 1 | - |
| [uat_results](tables/uat_results.md) | 123 | ✅ | 5 | - |
| [uat_runs](tables/uat_runs.md) | 4 | ✅ | 6 | - |
| [uat_screenshots](tables/uat_screenshots.md) | 0 | ✅ | 1 | - |
| [uat_test_cases](tables/uat_test_cases.md) | 2,082 | ✅ | 1 | - |
| [uat_test_results](tables/uat_test_results.md) | 10 | ✅ | 1 | - |
| [uat_test_runs](tables/uat_test_runs.md) | 1 | ✅ | 1 | - |
| [uat_test_schedules](tables/uat_test_schedules.md) | 0 | ✅ | 1 | - |
| [uat_test_suites](tables/uat_test_suites.md) | 100 | ✅ | 1 | - |
| [uat_test_users](tables/uat_test_users.md) | 0 | ✅ | 1 | Tracks test users created in EHG for UAT testing |
| [ui_validation_checkpoints](tables/ui_validation_checkpoints.md) | 6 | ✅ | 2 | - |
| [ui_validation_results](tables/ui_validation_results.md) | 2 | ✅ | 2 | - |
| [user_blueprint_bookmarks](tables/user_blueprint_bookmarks.md) | 0 | ✅ | 5 | Stores user bookmarks for opportunity blueprints (SD-BLUEPRINT-UI-001:US-004) |
| [user_company_access](tables/user_company_access.md) | 9 | ✅ | 3 | - |
| [user_context_patterns](tables/user_context_patterns.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 020) - Learned patterns of user behavior and context |
| [user_navigation_analytics](tables/user_navigation_analytics.md) | 112 | ✅ | 2 | - |
| [user_organizations](tables/user_organizations.md) | 0 | ✅ | 1 | Multi-tenant user-organization membership for RLS policies |
| [user_preferences](tables/user_preferences.md) | 2 | ✅ | 2 | - |
| [user_stories](tables/user_stories.md) | 4,275 | ✅ | 3 | RLS enabled: service_role full access, authenticated read-only |
| [validation_audit_log](tables/validation_audit_log.md) | 35,312 | ✅ | 3 | Audit log for LEO Protocol validation failures including bypass detection, coverage validation, and gate failures |
| [validation_evidence](tables/validation_evidence.md) | 0 | ✅ | 2 | - |
| [validation_gate_registry](tables/validation_gate_registry.md) | 72 | ✅ | 2 | Database-first policy for validation gate applicability per SD type and validation profile. Part of SD-LEO-INFRA-VALIDATION-GATE-REGISTRY-001. |
| [venture_archetypes](tables/venture_archetypes.md) | 14 | ✅ | 5 | Recurring venture patterns with visual themes and historical performance data. Stage 0 uses archetype recognition to trigger specific benchmarks, pitfalls, and strategies. |
| [venture_artifacts](tables/venture_artifacts.md) | 8 | ✅ | 5 | - |
| [venture_blueprints](tables/venture_blueprints.md) | 0 | ✅ | 1 | Pre-made venture templates for the Blueprint Browse entry path in Stage 0 |
| [venture_briefs](tables/venture_briefs.md) | 0 | ✅ | 1 | Stage 0 output contract - structured brief produced by the synthesis engine that becomes Stage 1 input |
| [venture_capabilities](tables/venture_capabilities.md) | 7 | ✅ | 2 | Tracks reusable capabilities across ventures for the Capability Lattice (SD-LEO-FEAT-CAPABILITY-LATTICE-001) |
| [venture_compliance_artifacts](tables/venture_compliance_artifacts.md) | 0 | ✅ | 4 | SD-LIFECYCLE-GAP-002: Venture-owned generated artifacts |
| [venture_compliance_progress](tables/venture_compliance_progress.md) | 0 | ✅ | 4 | SD-LIFECYCLE-GAP-002: Per-venture compliance item completion tracking |
| [venture_decisions](tables/venture_decisions.md) | 0 | ✅ | 4 | Gate decisions for ventures - created for chairman_unified_decisions VIEW |
| [venture_dependencies](tables/venture_dependencies.md) | 0 | ✅ | 2 | Directed dependency graph between ventures for stage-transition blocking (Decision #32) |
| [venture_documents](tables/venture_documents.md) | 0 | ✅ | 1 | - |
| [venture_drafts](tables/venture_drafts.md) | 704 | ✅ | 1 | - |
| [venture_nursery](tables/venture_nursery.md) | 0 | ✅ | 1 | Stores venture ideas not ready for Stage 1 at seed/sprout/ready maturity levels with trigger conditions for automatic re-evaluation |
| [venture_phase_budgets](tables/venture_phase_budgets.md) | 0 | ✅ | 3 | INDUSTRIAL-HARDENING-v3.0: Phase-level token budget tracking. Enables granular budget allocation across venture lifecycle stages. Default 20k tokens per phase. |
| [venture_raid_summary](tables/venture_raid_summary.md) | 136 | ✅ | 2 | - |
| [venture_stage_transitions](tables/venture_stage_transitions.md) | 0 | ✅ | 1 | - |
| [venture_stage_work](tables/venture_stage_work.md) | 33 | ✅ | 5 | - |
| [venture_templates](tables/venture_templates.md) | 0 | ✅ | 2 | Reusable patterns extracted from ventures completing Stage 25 |
| [venture_token_budgets](tables/venture_token_budgets.md) | 5 | ✅ | 3 | INDUSTRIAL-HARDENING-v3.0: Venture-level token budget tracking. Enforces Economic Circuit Breaker policy. Default 100k tokens per venture. |
| [venture_token_ledger](tables/venture_token_ledger.md) | 0 | ✅ | 4 | Golden Nugget: Token/compute investment tracking per venture |
| [venture_tool_quotas](tables/venture_tool_quotas.md) | 0 | ✅ | 1 | - |
| [ventures](tables/ventures.md) | 10 | ✅ | 5 | - |
| [vertical_complexity_multipliers](tables/vertical_complexity_multipliers.md) | 5 | ✅ | 2 | Industry vertical complexity factors for Truth Normalization (SD-HARDENING-V2) |
| [voice_cached_responses](tables/voice_cached_responses.md) | 0 | ✅ | 4 | - |
| [voice_conversations](tables/voice_conversations.md) | 0 | ✅ | 4 | - |
| [voice_function_calls](tables/voice_function_calls.md) | 0 | ✅ | 5 | - |
| [voice_usage_metrics](tables/voice_usage_metrics.md) | 0 | ✅ | 3 | - |
| [wizard_analytics](tables/wizard_analytics.md) | 62 | ✅ | 3 | - |
| [work_item_thresholds](tables/work_item_thresholds.md) | 1 | ✅ | 2 | - |
| [workflow_checkpoints](tables/workflow_checkpoints.md) | 2 | ✅ | 2 | Stores workflow state checkpoints for recovery |
| [workflow_executions](tables/workflow_executions.md) | 579 | ✅ | 3 | - |
| [workflow_recovery_state](tables/workflow_recovery_state.md) | 0 | ✅ | 2 | Tracks recovery attempts and status |
| [workflow_trace_log](tables/workflow_trace_log.md) | 100,365 | ✅ | 1 | Stores workflow telemetry spans for bottleneck detection (SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001A) |
| [working_sd_sessions](tables/working_sd_sessions.md) | 0 | ✅ | 2 | - |

## Tables by Category

### LEO Protocol (52 tables)

- [leo_adrs](tables/leo_adrs.md)
- [leo_agents](tables/leo_agents.md)
- [leo_artifacts](tables/leo_artifacts.md)
- [leo_audit_checklists](tables/leo_audit_checklists.md) - Artifact requirements per SD type for health audits
- [leo_audit_config](tables/leo_audit_config.md) - Configuration for LEO Self-Audit automated health checks
- [leo_autonomous_directives](tables/leo_autonomous_directives.md)
- [leo_complexity_thresholds](tables/leo_complexity_thresholds.md) - Configuration for automatic complexity detection and reasoning depth triggers
- [leo_effort_policies](tables/leo_effort_policies.md) - LEO Protocol effort policies by phase and complexity level
- [leo_error_log](tables/leo_error_log.md) - LEO Protocol error log for critical failures that need operator attention. Part of SD-GENESIS-V32-PULSE resilience infrastructure.
- [leo_events](tables/leo_events.md) - Append-only event log for auditability. SD: SD-LEO-SELF-IMPROVE-001B
- [leo_execution_jobs](tables/leo_execution_jobs.md) - Execution work items from prioritized proposals. SD: SD-LEO-SELF-IMPROVE-001L
- [leo_feature_flag_approvals](tables/leo_feature_flag_approvals.md) - Approval workflow tracking for feature flag state transitions
- [leo_feature_flag_audit](tables/leo_feature_flag_audit.md) - Immutable audit log for all feature flag changes
- [leo_feature_flag_audit_log](tables/leo_feature_flag_audit_log.md) - Audit trail for all feature flag operations
- [leo_feature_flag_policies](tables/leo_feature_flag_policies.md) - Per-environment rollout policies for feature flags
- [leo_feature_flags](tables/leo_feature_flags.md) - Feature flag definitions for LEO Protocol runtime control
- [leo_feedback](tables/leo_feedback.md)
- [leo_gate_reviews](tables/leo_gate_reviews.md)
- [leo_handoff_executions](tables/leo_handoff_executions.md) - Tracks all LEO Protocol handoff executions with full audit trail. Used by unified-handoff-system.js for workflow orchestration.
- [leo_handoff_rejections](tables/leo_handoff_rejections.md) - Tracks rejected handoffs with improvement guidance for LEO Protocol v4.2.0
- [leo_handoff_templates](tables/leo_handoff_templates.md)
- [leo_integration_contracts](tables/leo_integration_contracts.md) - OIV integration contracts defining expected code integration points to verify. Each contract specifies a file, function, and import chain that must be verifiable.
- [leo_integration_verification_results](tables/leo_integration_verification_results.md) - Audit trail of OIV verification runs with per-checkpoint breakdown (L1-L5). Links to contracts and SD context.
- [leo_interfaces](tables/leo_interfaces.md)
- [leo_kb_generation_log](tables/leo_kb_generation_log.md) - Tracks KB file generation timestamps for staleness detection - warn if >30 days old
- [leo_kill_switches](tables/leo_kill_switches.md) - Emergency kill switches for instant global disablement
- [leo_nfr_requirements](tables/leo_nfr_requirements.md)
- [leo_planner_rankings](tables/leo_planner_rankings.md) - Stores Central Planner output for stability tracking and audit
- [leo_prioritization_config](tables/leo_prioritization_config.md) - System-wide prioritization configuration. SD: SD-LEO-SELF-IMPROVE-001B
- [leo_process_scripts](tables/leo_process_scripts.md) - Documents all LEO process scripts with usage patterns and examples - single source of truth for script documentation
- [leo_prompts](tables/leo_prompts.md) - Versioned agent prompts for reproducibility. SD: SD-LEO-SELF-IMPROVE-001B
- [leo_proposal_transitions](tables/leo_proposal_transitions.md) - Audit trail of proposal status changes
- [leo_proposals](tables/leo_proposals.md) - Protocol improvement proposals with enforced lifecycle states
- [leo_protocol_changes](tables/leo_protocol_changes.md)
- [leo_protocol_file_audit](tables/leo_protocol_file_audit.md)
- [leo_protocol_references](tables/leo_protocol_references.md)
- [leo_protocol_sections](tables/leo_protocol_sections.md)
- [leo_protocol_state](tables/leo_protocol_state.md)
- [leo_protocols](tables/leo_protocols.md)
- [leo_reasoning_sessions](tables/leo_reasoning_sessions.md) - Tracks automatic chain-of-thought reasoning sessions with complexity-based depth selection
- [leo_reasoning_triggers](tables/leo_reasoning_triggers.md) - Rules for automatically triggering different reasoning depths based on content analysis
- [leo_risk_spikes](tables/leo_risk_spikes.md)
- [leo_schema_constraints](tables/leo_schema_constraints.md) - Documents all CHECK constraints for LEO tables - used by agents to pre-validate data before insert
- [leo_scoring_prioritization_config](tables/leo_scoring_prioritization_config.md) - Active rubric selection and deterministic scoring settings per scope. SD: SD-LEO-SELF-IMPROVE-001G Phase 3a
- [leo_scoring_rubrics](tables/leo_scoring_rubrics.md) - Versioned, immutable scoring rubrics for deterministic prioritization. SD: SD-LEO-SELF-IMPROVE-001G Phase 3a
- [leo_settings](tables/leo_settings.md) - Global LEO Protocol settings (singleton pattern). Stores default values for AUTO-PROCEED and Orchestrator Chaining that apply to all new sessions.
- [leo_simplification_rules](tables/leo_simplification_rules.md) - Database-driven rules for /simplify command. Rules are regex patterns that match code and provide replacements.
- [leo_subagent_handoffs](tables/leo_subagent_handoffs.md) - Stores distilled summaries passed between sub-agents
- [leo_test_plans](tables/leo_test_plans.md)
- [leo_vetting_outcomes](tables/leo_vetting_outcomes.md)
- [leo_vetting_rubrics](tables/leo_vetting_rubrics.md) - Versioned rubrics for evaluating proposals
- [leo_workflow_phases](tables/leo_workflow_phases.md)

### Strategic Directives (49 tables)

- [audit_finding_sd_links](tables/audit_finding_sd_links.md) - Join table supporting many-to-many relationships between audit findings and SDs.
   Supports primary (1:1), supporting (N:1), and theme (N:1) link types.
- [audit_finding_sd_mapping](tables/audit_finding_sd_mapping.md) - Maps runtime audit findings to Strategic Directives with full traceability.
   Created from triangulated recommendations (Claude + OpenAI + Antigravity).
   Key invariant: original_issue_id is immutable - verbatim Chairman feedback preserved.
- [cross_sd_utilization](tables/cross_sd_utilization.md) - Manages cross-SD utilization requests and approvals
- [feedback_sd_map](tables/feedback_sd_map.md)
- [sd_backlog_map](tables/sd_backlog_map.md)
- [sd_baseline_issues](tables/sd_baseline_issues.md) - Tracks pre-existing codebase issues that should not block unrelated SD completion. Part of LEO Protocol governance.
- [sd_baseline_items](tables/sd_baseline_items.md) - Individual SD assignments within a baseline, including track assignment, sequence, and effort estimates.
- [sd_baseline_rationale](tables/sd_baseline_rationale.md)
- [sd_burn_rate_snapshots](tables/sd_burn_rate_snapshots.md) - Periodic snapshots of velocity metrics for trending and forecasting.
- [sd_business_evaluations](tables/sd_business_evaluations.md)
- [sd_capabilities](tables/sd_capabilities.md) - Junction table tracking which capabilities were registered/updated/deprecated by which Strategic Directives. Provides full audit trail.
- [sd_checkpoint_history](tables/sd_checkpoint_history.md) - RLS: Append-only for authenticated
- [sd_conflict_matrix](tables/sd_conflict_matrix.md) - Potential conflicts between SDs that should not run in parallel.
- [sd_contract_exceptions](tables/sd_contract_exceptions.md) - Tracks all contract exceptions with full audit trail and automatic scrutiny assessment.
Each exception records the violation, justification, scrutiny level, and approval status.
This ensures transparency and governance for any contract boundary changes.
- [sd_contract_violations](tables/sd_contract_violations.md) - Tracks all contract violations detected during SD lifecycle.
BLOCKER violations prevent SD completion.
WARNING violations can be overridden with documented justification.
- [sd_corrections](tables/sd_corrections.md) - LEO 5.0 Corrections - tracks wall invalidation and correction workflows
- [sd_data_contracts](tables/sd_data_contracts.md) - Data contracts define schema boundaries for child SDs. Children can only touch
tables/columns explicitly allowed by their parent's contract. Violations are BLOCKERs.
Reference: Consistency + Autonomy Architecture Plan
- [sd_dependency_graph](tables/sd_dependency_graph.md) - Tracks dependencies and relationships between strategic directives
- [sd_effectiveness_metrics](tables/sd_effectiveness_metrics.md)
- [sd_exec_file_operations](tables/sd_exec_file_operations.md) - Tracks file operations during EXEC phase for automatic deliverable matching. Part of SD-DELIVERABLES-V2-001.
- [sd_execution_actuals](tables/sd_execution_actuals.md) - Actual execution metrics for variance analysis against baseline plan.
- [sd_execution_baselines](tables/sd_execution_baselines.md) - Point-in-time snapshots of SD execution plans. Only one baseline can be active at a time. Rebaseline requires LEAD approval.
- [sd_execution_timeline](tables/sd_execution_timeline.md)
- [sd_gate_results](tables/sd_gate_results.md) - LEO 5.0 Gate results - tracks individual gate validation outcomes
- [sd_governance_bypass_audit](tables/sd_governance_bypass_audit.md) - Audit trail for governance trigger bypasses.
All bypass requests are logged for security review.
Fixed: sd_id is TEXT to match strategic_directives_v2.id (VARCHAR).
- [sd_intensity_adjustments](tables/sd_intensity_adjustments.md) - Adjustments to validation requirements based on intensity level.
Overrides take precedence over sd_type_validation_profiles defaults.
Weight adjustments are ADDED to base weights (must sum to 0 to maintain 100% total).
- [sd_intensity_gate_exemptions](tables/sd_intensity_gate_exemptions.md) - Intensity-specific gate exemptions. Overrides sd_type_gate_exemptions when intensity_level is set.
- [sd_key_result_alignment](tables/sd_key_result_alignment.md) - Links Strategic Directives to Key Results
- [sd_kickbacks](tables/sd_kickbacks.md) - LEO 5.0 Kickback tracking - manages phase kickbacks for failure recovery
- [sd_overlap_analysis](tables/sd_overlap_analysis.md) - Stores overlap analysis results between strategic directives
- [sd_phase_handoffs](tables/sd_phase_handoffs.md) - DEPRECATED: Use leo_handoff_executions instead. This table is empty (0 records) and was created after leo_handoff_executions (166 records). Kept for backwards compatibility only. Single source of truth: leo_handoff_executions.
- [sd_phase_tracking](tables/sd_phase_tracking.md) - Tracks LEO Protocol phase completion for strategic directives
- [sd_proposals](tables/sd_proposals.md) - Proactive SD proposals generated by observer agents - LEO Protocol v4.4
- [sd_scope_deliverables](tables/sd_scope_deliverables.md) - Tracks deliverables extracted from SD scope documents to ensure all promises are fulfilled
- [sd_session_activity](tables/sd_session_activity.md) - Granular tracking of SD work per session for continuity detection.
- [sd_state_transitions](tables/sd_state_transitions.md)
- [sd_stream_completions](tables/sd_stream_completions.md)
- [sd_stream_requirements](tables/sd_stream_requirements.md)
- [sd_subagent_deliverable_mapping](tables/sd_subagent_deliverable_mapping.md) - Maps sub-agent codes to deliverable types for automatic completion triggers
- [sd_testing_status](tables/sd_testing_status.md) - Tracks testing status for Strategic Directives. Prevents duplicate testing and provides work-down plan visualization.
- [sd_type_change_audit](tables/sd_type_change_audit.md) - RLS: Append-only for authenticated
- [sd_type_gate_exemptions](tables/sd_type_gate_exemptions.md) - Defines which gates are exempted, optional, or required for each SD type. Used by handoff executors and retro generator.
- [sd_type_validation_profiles](tables/sd_type_validation_profiles.md) - Configurable validation profiles for different SD types. Each type has different requirements for completion.
- [sd_ux_contracts](tables/sd_ux_contracts.md) - UX contracts define component/design boundaries for child SDs. Children can only
modify components within allowed paths and must use parent's cultural design style.
Violations are WARNINGs (can override with justification).
Reference: Consistency + Autonomy Architecture Plan
- [sd_wall_states](tables/sd_wall_states.md) - LEO 5.0 Wall states - tracks phase boundary status for Strategic Directives
- [sd_workflow_template_steps](tables/sd_workflow_template_steps.md) - SD-LEO-INFRA-WORKFLOW-TEMPLATES-TYPE-001: Ordered steps with weights for each workflow template
- [sd_workflow_templates](tables/sd_workflow_templates.md) - SD-LEO-INFRA-WORKFLOW-TEMPLATES-TYPE-001: Per-SD-type workflow definitions for progress calculation
- [strategic_directives_v2](tables/strategic_directives_v2.md) - RLS enabled: service_role full access, authenticated read-only
- [working_sd_sessions](tables/working_sd_sessions.md)

### Retrospectives (7 tables)

- [retrospective_action_items](tables/retrospective_action_items.md)
- [retrospective_contributions](tables/retrospective_contributions.md)
- [retrospective_insights](tables/retrospective_insights.md)
- [retrospective_learning_links](tables/retrospective_learning_links.md)
- [retrospective_templates](tables/retrospective_templates.md)
- [retrospective_triggers](tables/retrospective_triggers.md)
- [retrospectives](tables/retrospectives.md)

### Handoffs & Phases (7 tables)

- [exec_handoff_preparations](tables/exec_handoff_preparations.md) - Tracks EXEC→PLAN handoff preparation and delivery
- [handoff_audit_log](tables/handoff_audit_log.md) - Audit trail for all handoff creation attempts, including blocked bypasses
- [handoff_validation_rules](tables/handoff_validation_rules.md)
- [handoff_verification_gates](tables/handoff_verification_gates.md) - Mandatory verification checkpoints that must pass before handoffs can proceed
- [lifecycle_phases](tables/lifecycle_phases.md) - Venture Vision v2.0 - 6 Phase Definitions
- [pending_ceo_handoffs](tables/pending_ceo_handoffs.md) - Persists pending CEO handoff reviews. Replaces in-memory Map in venture-state-machine.js.
Part of SD-HARDENING-V2-002C: Idempotency & Persistence.
- [venture_phase_budgets](tables/venture_phase_budgets.md) - INDUSTRIAL-HARDENING-v3.0: Phase-level token budget tracking. Enables granular budget allocation across venture lifecycle stages. Default 20k tokens per phase.

### Sub-Agents (3 tables)

- [leo_sub_agent_handoffs](tables/leo_sub_agent_handoffs.md)
- [leo_sub_agent_triggers](tables/leo_sub_agent_triggers.md)
- [leo_sub_agents](tables/leo_sub_agents.md)

### Validation & Quality (4 tables)

- [leo_codebase_validations](tables/leo_codebase_validations.md)
- [leo_handoff_validations](tables/leo_handoff_validations.md) - Stores validation results for handoff executions in LEO Protocol v4.2.0
- [leo_mandatory_validations](tables/leo_mandatory_validations.md)
- [leo_validation_rules](tables/leo_validation_rules.md)

### Knowledge & Learning (4 tables)

- [agent_knowledge_base](tables/agent_knowledge_base.md) - RLS enabled 2025-10-26 (migration 021) - Agent knowledge base
- [domain_knowledge](tables/domain_knowledge.md)
- [issue_patterns](tables/issue_patterns.md) - Learning history system: stores recurring issues, proven solutions, and success metrics for cross-session knowledge retention
- [sensemaking_knowledge_base](tables/sensemaking_knowledge_base.md)

### Other (377 tables)

- [_migration_metadata](tables/_migration_metadata.md)
- [activity_logs](tables/activity_logs.md) - RLS: Append-only for authenticated, no delete/update
- [advisory_checkpoints](tables/advisory_checkpoints.md)
- [aegis_constitutions](tables/aegis_constitutions.md) - Registry of governance frameworks (constitutions) in AEGIS
- [aegis_rules](tables/aegis_rules.md) - Unified storage for all governance rules across all constitutions
- [aegis_violations](tables/aegis_violations.md) - Unified audit log for all governance violations across all constitutions
- [agent_artifacts](tables/agent_artifacts.md) - Stores large tool outputs as artifacts with summary pointers for context efficiency
- [agent_avatars](tables/agent_avatars.md)
- [agent_coordination_state](tables/agent_coordination_state.md) - RLS enabled 2025-10-26 (migration 021) - Agent coordination state tracking
- [agent_departments](tables/agent_departments.md)
- [agent_events](tables/agent_events.md) - RLS enabled 2025-10-26 (migration 021) - Agent event log
- [agent_execution_cache](tables/agent_execution_cache.md) - RLS enabled 2025-10-26 (migration 021) - Agent execution cache
- [agent_intelligence_insights](tables/agent_intelligence_insights.md) - Contains specific learned behaviors and adjustments that agents should make based on historical data
- [agent_learning_outcomes](tables/agent_learning_outcomes.md) - Tracks the complete workflow chain from LEAD decision through PLAN validation to EXEC implementation and final business outcomes
- [agent_memory_stores](tables/agent_memory_stores.md) - INDUSTRIAL-HARDENING-v2.9.0: Memory partition table.
CRITICAL: All queries MUST include venture_id filter.
Example: SELECT * FROM agent_memory_stores WHERE agent_id = ? AND venture_id = ?
- [agent_messages](tables/agent_messages.md)
- [agent_performance_metrics](tables/agent_performance_metrics.md) - RLS enabled 2025-10-26 (migration 021) - Agent performance metrics (from context learning schema)
- [agent_registry](tables/agent_registry.md)
- [agent_relationships](tables/agent_relationships.md)
- [agent_skills](tables/agent_skills.md) - Skill metadata for context-based injection into agent prompts (SD-EVA-FEAT-SKILL-PACKAGING-001)
- [agent_task_contracts](tables/agent_task_contracts.md) - Task contracts for sub-agent handoffs. Sub-agents read their contract from this table
instead of inheriting parent agent context, reducing context overhead by 50-70%.
Pattern: Extends sd_data_contracts for agent-to-agent communication.
Reference: SD-FOUND-AGENTIC-CONTEXT-001 (Agentic Context Engineering v3.0)
- [agent_tools](tables/agent_tools.md)
- [agentic_reviews](tables/agentic_reviews.md)
- [agents](tables/agents.md) - Governance agents for chairman/CEO system. Separate from crewai_agents (research automation). Referenced by ventures.ceo_agent_id and directive_delegations.
- [ai_quality_assessments](tables/ai_quality_assessments.md) - AI-powered quality assessments using Russian Judge rubrics (gpt-4o-mini). Stores all quality evaluations for meta-analysis and continuous improvement.
- [app_config](tables/app_config.md)
- [app_rankings](tables/app_rankings.md) - Scraped app ranking data from Apple App Store, Google Play, and Product Hunt (SD-LEO-FEAT-AUTOMATED-RANKING-DATA-001)
- [archetype_benchmarks](tables/archetype_benchmarks.md)
- [archetype_profile_interactions](tables/archetype_profile_interactions.md) - Interaction matrix between 6 EHG venture archetypes and evaluation profiles, defining weight adjustments and execution guidance
- [assumption_sets](tables/assumption_sets.md) - Golden Nugget: Versioned assumption sets for Assumptions vs Reality calibration
- [audit_log](tables/audit_log.md) - Generic audit log for tracking system events, changes, and governance actions across all LEO Protocol entities.
- [audit_triangulation_log](tables/audit_triangulation_log.md)
- [auto_apply_allowlist](tables/auto_apply_allowlist.md) - Tables that AUTO-tier is permitted to modify. Default-deny: unlisted tables are blocked.
- [auto_apply_denylist](tables/auto_apply_denylist.md) - Tables that AUTO-tier must NEVER modify. Includes governance, safety, and critical system tables.
- [backlog_item_completion](tables/backlog_item_completion.md) - RLS enabled: service_role full access, authenticated read-only
- [blueprint_board_submissions](tables/blueprint_board_submissions.md) - Tracks blueprint submissions for board review (SD-BLUEPRINT-UI-001:US-002,US-003)
- [blueprint_selection_signals](tables/blueprint_selection_signals.md)
- [board_meeting_attendance](tables/board_meeting_attendance.md) - Attendance and voting records for board meetings
- [board_meetings](tables/board_meetings.md) - Board meetings with agenda, outcomes, and workflow linkage
- [board_members](tables/board_members.md) - Board of Directors members with voting weights and expertise domains
- [brainstorm_question_effectiveness](tables/brainstorm_question_effectiveness.md) - Aggregates question effectiveness metrics across all sessions. Used to identify high-value vs low-value questions, optimize question ordering, and refine domain-specific brainstorm workflows.
- [brainstorm_question_interactions](tables/brainstorm_question_interactions.md) - Tracks individual question-answer interactions during brainstorm sessions. Used to measure question effectiveness (skip rates, answer quality, revision patterns) and optimize question flows.
- [brainstorm_sessions](tables/brainstorm_sessions.md) - Tracks brainstorming sessions across domains (venture, protocol, integration, architecture) with outcome classification, quality metrics, and capability matching. Used for question effectiveness analysis and retrospective integration.
- [brand_genome_submissions](tables/brand_genome_submissions.md) - Brand identity genome for ventures ensuring marketing consistency
- [brand_variants](tables/brand_variants.md)
- [campaign_content](tables/campaign_content.md)
- [capital_transactions](tables/capital_transactions.md)
- [chairman_approval_requests](tables/chairman_approval_requests.md) - Centralized queue for chairman approval decisions. SD-STAGE-13-001.
- [chairman_constraints](tables/chairman_constraints.md) - Strategic constraints from the chairman applied to every venture during Stage 0 synthesis. Evolves over time from kill gate outcomes and retrospectives.
- [chairman_decisions](tables/chairman_decisions.md) - SD-HARDENING-V1-001: Chairman-only decision records.
RLS hardened - only chairman (fn_is_chairman()) can access.
SECURITY FIX: Replaced USING(true) from 20251216000001_chairman_unified_decisions.sql
- [chairman_directives](tables/chairman_directives.md)
- [chairman_feedback](tables/chairman_feedback.md)
- [chairman_interests](tables/chairman_interests.md) - Stores chairman/user market interests, customer segments, focus areas, and exclusions for personalized opportunity filtering. SD-CHAIRMAN-INTERESTS-001.
- [chairman_notifications](tables/chairman_notifications.md) - Tracks all notification delivery attempts for the Chairman notification service (SD-EVA-FEAT-NOTIFICATION-001)
- [chairman_overrides](tables/chairman_overrides.md)
- [chairman_preferences](tables/chairman_preferences.md)
- [chairman_settings](tables/chairman_settings.md) - Configurable venture selection parameters for the Chairman. Supports company-level defaults and venture-specific overrides.
- [channel_budgets](tables/channel_budgets.md)
- [circuit_breaker_blocks](tables/circuit_breaker_blocks.md) - Audit log for Circuit Breaker blocks (Law 3).
Records all handoffs rejected due to validation_score < 85%.
Part of EHG Immutable Laws v9.0.0 Manifesto enforcement.
- [claude_sessions](tables/claude_sessions.md) - Tracks active Claude Code sessions for multi-instance coordination. Sessions auto-register and update heartbeat on sd:next/sd:claim.
- [companies](tables/companies.md)
- [competitors](tables/competitors.md)
- [compliance_alerts](tables/compliance_alerts.md) - RLS enabled 2025-10-26 (migration 021) - Compliance alerts and violations
- [compliance_artifact_templates](tables/compliance_artifact_templates.md) - SD-LIFECYCLE-GAP-002: Templates for generating compliance artifacts
- [compliance_checklist_items](tables/compliance_checklist_items.md) - SD-LIFECYCLE-GAP-002: Individual checklist items with REQUIRED/RECOMMENDED tiers
- [compliance_checklists](tables/compliance_checklists.md) - SD-LIFECYCLE-GAP-002: Archetype-specific compliance checklists with versioning
- [compliance_checks](tables/compliance_checks.md) - Stores compliance check run history for the Always-On Compliance orchestrator
- [compliance_events](tables/compliance_events.md) - CCE Event Store: Normalized compliance events for UI and external consumers
- [compliance_gate_events](tables/compliance_gate_events.md) - SD-LIFECYCLE-GAP-002: Audit trail for gate evaluations and metrics
- [compliance_policies](tables/compliance_policies.md) - CCE Policy Registry: Configurable compliance rules with JSONB configuration
- [compliance_violations](tables/compliance_violations.md) - Stores individual compliance violations detected during checks
- [component_registry_embeddings](tables/component_registry_embeddings.md) - Component registry with semantic search embeddings for AI-powered recommendations during PRD creation
- [connection_selection_log](tables/connection_selection_log.md) - Audit trail for connection method selection. Auto-cleanup recommended at 30 days.
- [connection_strategies](tables/connection_strategies.md) - Ranked connection methods per service. Used by lib/connection-router.js to select optimal connection without trial-and-error.
- [constitutional_amendments](tables/constitutional_amendments.md) - Tracks proposed amendments to protocol constitution rules (protocol_constitution table)
- [content_types](tables/content_types.md)
- [context_embeddings](tables/context_embeddings.md) - RLS enabled 2025-10-26 (migration 020) - Vector embeddings for semantic similarity matching
- [context_usage_daily](tables/context_usage_daily.md) - Aggregated daily context usage metrics for trend analysis
- [context_usage_log](tables/context_usage_log.md) - Raw context usage entries from Claude Code status line (server-authoritative token counts)
- [continuous_execution_log](tables/continuous_execution_log.md) - RLS: Append-only for authenticated
- [counterfactual_scores](tables/counterfactual_scores.md)
- [cross_agent_correlations](tables/cross_agent_correlations.md) - Tracks how decisions by one agent correlate with outcomes in other agents
- [cultural_design_styles](tables/cultural_design_styles.md)
- [daily_rollups](tables/daily_rollups.md)
- [db_agent_config](tables/db_agent_config.md) - Runtime configuration for database sub-agent auto-invocation (SD-LEO-INFRA-DATABASE-SUB-AGENT-001)
- [db_agent_invocations](tables/db_agent_invocations.md) - Audit trail for database sub-agent invocation decisions (SD-LEO-INFRA-DATABASE-SUB-AGENT-001)
- [debate_arguments](tables/debate_arguments.md)
- [debate_circuit_breaker](tables/debate_circuit_breaker.md)
- [debate_sessions](tables/debate_sessions.md)
- [defect_taxonomy](tables/defect_taxonomy.md) - Classification taxonomy for defect categorization and prevention stage mapping
- [department_agents](tables/department_agents.md)
- [department_capabilities](tables/department_capabilities.md)
- [department_messages](tables/department_messages.md)
- [departments](tables/departments.md)
- [directive_submissions](tables/directive_submissions.md)
- [discovery_strategies](tables/discovery_strategies.md) - Configuration for the Find Me Opportunities discovery mode entry path in Stage 0
- [distribution_channels](tables/distribution_channels.md)
- [distribution_history](tables/distribution_history.md)
- [doctrine_constraint_violations](tables/doctrine_constraint_violations.md) - Audit log for Doctrine of Constraint violations (Law 1).
Captures all attempts by EXEC agents to create/modify governance artifacts.
Part of EHG Immutable Laws v9.0.0 Manifesto enforcement.
- [documentation_health_checks](tables/documentation_health_checks.md) - RLS enabled 2025-10-26 (migration 021) - Documentation health check results
- [documentation_inventory](tables/documentation_inventory.md) - RLS enabled 2025-10-26 (migration 021) - Documentation inventory
- [documentation_templates](tables/documentation_templates.md) - RLS enabled 2025-10-26 (migration 021) - Documentation templates
- [documentation_violations](tables/documentation_violations.md) - RLS enabled 2025-10-26 (migration 021) - Documentation violations
- [ehg_alerts](tables/ehg_alerts.md)
- [ehg_component_patterns](tables/ehg_component_patterns.md) - Reusable UI patterns and components
- [ehg_design_decisions](tables/ehg_design_decisions.md) - Historical design decisions for learning and consistency
- [ehg_feature_areas](tables/ehg_feature_areas.md) - Major feature domains in the EHG application (Ventures, Analytics, etc.)
- [ehg_page_routes](tables/ehg_page_routes.md) - All page routes with their purposes and relationships
- [ehg_user_workflows](tables/ehg_user_workflows.md) - Documented user journeys through the application
- [enhancement_proposal_audit](tables/enhancement_proposal_audit.md)
- [enhancement_proposals](tables/enhancement_proposals.md) - Stores LEO-generated enhancement proposals for protocol improvements
- [eva_actions](tables/eva_actions.md) - EVA orchestration actions - tracks all automated and manual actions executed during sessions
- [eva_agent_communications](tables/eva_agent_communications.md) - Inter-agent messaging for EVA orchestration - tracks all agent-to-agent communications
- [eva_architecture_plans](tables/eva_architecture_plans.md) - Architecture Plans linked to Vision documents. ON DELETE RESTRICT on vision_id prevents deleting a vision that has architecture plans.
- [eva_artifact_dependencies](tables/eva_artifact_dependencies.md) - Cross-stage data contracts ensuring artifacts from earlier stages are validated before later stages proceed
- [eva_audit_log](tables/eva_audit_log.md) - EVA Audit Trail - All actions logged
- [eva_automation_executions](tables/eva_automation_executions.md) - Log of all automation rule executions
- [eva_automation_rules](tables/eva_automation_rules.md) - EVA automation rules for Class A auto-fix and Class B auto-draft actions (SD-EVA-AUTOMATION-001)
- [eva_circuit_breaker](tables/eva_circuit_breaker.md) - EVA Circuit Breaker - Protects ventures from cascading EVA failures. State machine: closed → open → half_open → closed
- [eva_circuit_state_transitions](tables/eva_circuit_state_transitions.md) - Audit log of all EVA circuit breaker state transitions
- [eva_claude_code_intake](tables/eva_claude_code_intake.md) - Tracks Claude Code GitHub releases for automated monitoring and chairman approval pipeline
- [eva_config](tables/eva_config.md)
- [eva_decisions](tables/eva_decisions.md) - EVA Decision Router - Chairman decision tracking
- [eva_event_ledger](tables/eva_event_ledger.md)
- [eva_event_log](tables/eva_event_log.md)
- [eva_events](tables/eva_events.md) - EVA Event Bus - All venture-related events
- [eva_events_dlq](tables/eva_events_dlq.md)
- [eva_idea_categories](tables/eva_idea_categories.md)
- [eva_interactions](tables/eva_interactions.md) - Core table capturing all EVA chairman-system interactions for closed-loop learning (SD-LEO-FEAT-DATA-FLYWHEEL-001)
- [eva_orchestration_events](tables/eva_orchestration_events.md) - EVA orchestration lifecycle events for Chairman Dashboard Event Feed. Real-time enabled.
- [eva_orchestration_sessions](tables/eva_orchestration_sessions.md) - EVA orchestration sessions - tracks multi-agent coordination for ventures and strategic initiatives
- [eva_saga_log](tables/eva_saga_log.md) - Saga execution logs for Eva Orchestrator compensation pattern
- [eva_scheduler_heartbeat](tables/eva_scheduler_heartbeat.md)
- [eva_scheduler_metrics](tables/eva_scheduler_metrics.md)
- [eva_scheduler_queue](tables/eva_scheduler_queue.md)
- [eva_stage_gate_results](tables/eva_stage_gate_results.md) - Tracks EVA gate evaluations with kill gate enforcement (stages 3,5,13,23 require 70% score)
- [eva_sync_state](tables/eva_sync_state.md)
- [eva_todoist_intake](tables/eva_todoist_intake.md)
- [eva_trace_log](tables/eva_trace_log.md)
- [eva_ventures](tables/eva_ventures.md) - EVA Operating System - Venture tracking with health metrics
- [eva_vision_documents](tables/eva_vision_documents.md) - Stores EHG portfolio (L1) and venture-specific (L2) vision documents for the EVA Vision Governance System. L2 visions link to L1 via parent_vision_id.
- [eva_vision_gaps](tables/eva_vision_gaps.md)
- [eva_vision_iterations](tables/eva_vision_iterations.md) - Tracks scoring cycle history. UNIQUE(vision_id, iteration_number) ensures one record per cycle. completed_at is NULL until the iteration scoring run finishes.
- [eva_vision_scores](tables/eva_vision_scores.md) - Append-only scoring records. rubric_snapshot is frozen at score time for immutable audit trail. sd_id is an intentional soft TEXT reference to SD keys — no FK to allow async SD creation.
- [eva_weekly_review_templates](tables/eva_weekly_review_templates.md) - Templates for automated weekly review generation
- [eva_youtube_intake](tables/eva_youtube_intake.md)
- [evaluation_profile_outcomes](tables/evaluation_profile_outcomes.md) - Per-gate survival signals linking evaluation profile+version to venture outcomes at tracked boundaries
- [evaluation_profiles](tables/evaluation_profiles.md) - Configurable evaluation weight profiles for EVA Stage 0 synthesis scoring
- [evidence_gate_mapping](tables/evidence_gate_mapping.md)
- [exec_authorizations](tables/exec_authorizations.md)
- [exec_implementation_sessions](tables/exec_implementation_sessions.md) - Stores results from EXEC Implementation Excellence Orchestrator - systematic implementation tracking and quality assurance
- [exec_quality_checkpoints](tables/exec_quality_checkpoints.md) - Tracks completion of quality checkpoints during EXEC implementation
- [exec_sub_agent_activations](tables/exec_sub_agent_activations.md) - Detailed results from sub-agent activations during EXEC implementation
- [execution_sequences_v2](tables/execution_sequences_v2.md)
- [feedback](tables/feedback.md)
- [feedback_events](tables/feedback_events.md) - RLS enabled 2025-10-26 (migration 020) - User feedback events for continuous learning
- [feedback_quality_config](tables/feedback_quality_config.md) - Configuration for Feedback Quality Layer. SD: SD-LEO-SELF-IMPROVE-001C
- [financial_models](tables/financial_models.md) - Venture capital financial models with templates (SaaS, marketplace, etc.)
- [financial_projections](tables/financial_projections.md) - Financial projections for venture models (monthly/quarterly/yearly)
- [financial_scenarios](tables/financial_scenarios.md) - Scenario analysis results (Monte Carlo, sensitivity, etc.)
- [fit_gate_scores](tables/fit_gate_scores.md) - Asset Factory fit gate scoring with multi-criteria evaluation framework
- [folder_structure_snapshot](tables/folder_structure_snapshot.md)
- [gap_analysis_results](tables/gap_analysis_results.md) - Stores integration gap analysis results comparing PRD requirements against actual implementation. Part of SD-LEO-FEAT-INTEGRATION-GAP-DETECTOR-001.
- [gate_requirements_templates](tables/gate_requirements_templates.md) - Templates for generating verification gates with standard requirements
- [github_operations](tables/github_operations.md) - Tracks all GitHub operations initiated by the LEO Protocol GitHub Sub-Agent
- [governance_audit_log](tables/governance_audit_log.md)
- [governance_decisions](tables/governance_decisions.md)
- [governance_policies](tables/governance_policies.md)
- [governance_proposals](tables/governance_proposals.md)
- [hap_blocks_v2](tables/hap_blocks_v2.md)
- [import_audit](tables/import_audit.md)
- [improvement_quality_assessments](tables/improvement_quality_assessments.md) - AI quality judge evaluations for protocol improvements
- [intake_submissions](tables/intake_submissions.md) - Asset Factory multi-step intake wizard submissions with version tracking
- [integration_config](tables/integration_config.md) - Database-backed configuration for data-plane pipeline integration. SD: SD-LEO-SELF-IMPROVE-001L
- [integrity_metrics](tables/integrity_metrics.md)
- [intelligence_analysis](tables/intelligence_analysis.md)
- [intelligence_patterns](tables/intelligence_patterns.md) - Stores learned patterns about project types, complexity factors, and their typical outcomes
- [interaction_history](tables/interaction_history.md) - RLS enabled 2025-10-26 (migration 020) - Complete history of context monitoring interactions
- [judge_verdicts](tables/judge_verdicts.md)
- [key_results](tables/key_results.md) - Measurable outcomes (the KR in OKRs)
- [kr_progress_snapshots](tables/kr_progress_snapshots.md) - Historical tracking of Key Result values
- [lead_evaluations](tables/lead_evaluations.md) - Stores results from LEAD Critical Evaluator framework - mandatory business value assessments
- [learning_configurations](tables/learning_configurations.md) - RLS enabled 2025-10-26 (migration 020) - Adaptive configuration parameters that evolve
- [learning_decisions](tables/learning_decisions.md) - Tracks all /learn command actions, findings, and user approvals to close the feedback loop on organizational learning.
- [learning_inbox](tables/learning_inbox.md) - Unified view of all learnable items from various sources (patterns, feedback, retrospectives, improvements)
- [lifecycle_stage_config](tables/lifecycle_stage_config.md) - 25-stage venture lifecycle configuration. Stage 10 (Strategic Narrative & Positioning)
includes cultural_design_config artifact for venture-based design style selection.
Reference: docs/workflow/stages_v2.yaml
- [llm_canary_metrics](tables/llm_canary_metrics.md) - Rolling window metrics. Consider BRIN index or partitioning for high volume.
- [llm_canary_state](tables/llm_canary_state.md)
- [llm_canary_transitions](tables/llm_canary_transitions.md)
- [llm_models](tables/llm_models.md)
- [llm_providers](tables/llm_providers.md)
- [market_segments](tables/market_segments.md)
- [marketing_attribution](tables/marketing_attribution.md)
- [marketing_campaigns](tables/marketing_campaigns.md)
- [marketing_channels](tables/marketing_channels.md)
- [marketing_content](tables/marketing_content.md)
- [marketing_content_queue](tables/marketing_content_queue.md)
- [marketing_content_variants](tables/marketing_content_variants.md)
- [missions](tables/missions.md)
- [model_usage_log](tables/model_usage_log.md) - RLS: Append-only for authenticated
- [modeling_requests](tables/modeling_requests.md) - Horizontal forecasting and modeling engine serving Stage 0 components including time-horizon positioning, build cost estimation, and market analysis
- [monthly_ceo_reports](tables/monthly_ceo_reports.md) - Monthly CEO performance reports generated by the VentureCEORuntime agent
- [naming_favorites](tables/naming_favorites.md)
- [naming_suggestions](tables/naming_suggestions.md)
- [nav_preferences](tables/nav_preferences.md)
- [nav_routes](tables/nav_routes.md)
- [nursery_evaluation_log](tables/nursery_evaluation_log.md) - Audit trail of nursery item re-evaluations triggered by capability additions, market shifts, portfolio gaps, and related outcomes
- [objectives](tables/objectives.md) - Qualitative goals (the O in OKRs)
- [okr_generation_log](tables/okr_generation_log.md) - Audit trail for automated OKR generation runs
- [operations_audit_log](tables/operations_audit_log.md)
- [opportunities](tables/opportunities.md)
- [opportunity_blueprints](tables/opportunity_blueprints.md)
- [opportunity_categories](tables/opportunity_categories.md)
- [opportunity_scans](tables/opportunity_scans.md) - Tracks AI opportunity discovery scans. Each scan can generate multiple blueprints.
- [opportunity_scores](tables/opportunity_scores.md)
- [opportunity_sources](tables/opportunity_sources.md)
- [orchestration_metrics](tables/orchestration_metrics.md) - Performance analytics for EVA orchestration - tracks efficiency, quality, and resource utilization
- [outcome_signals](tables/outcome_signals.md)
- [pattern_occurrences](tables/pattern_occurrences.md) - Tracks individual pattern occurrences for trend calculation.
- [pattern_resolution_signals](tables/pattern_resolution_signals.md) - Signals indicating pattern resolution for evidence tracking
- [pattern_subagent_mapping](tables/pattern_subagent_mapping.md) - RLS: Service role write, authenticated read
- [persona_config](tables/persona_config.md) - Per-application persona validation rules. SD-MAN-GEN-TITLE-TARGET-APPLICATION-001
- [pipeline_metrics](tables/pipeline_metrics.md) - Time-series metrics for self-improvement pipeline. Retention: 30 days.
- [plan_conflict_rules](tables/plan_conflict_rules.md)
- [plan_quality_gates](tables/plan_quality_gates.md) - Tracks completion of quality gates defined during PLAN validation
- [plan_sub_agent_executions](tables/plan_sub_agent_executions.md) - Detailed results from sub-agent executions during PLAN validation
- [plan_subagent_queries](tables/plan_subagent_queries.md)
- [plan_technical_validations](tables/plan_technical_validations.md) - Stores results from PLAN Technical Validation Orchestrator - systematic technical validation and risk assessment
- [plan_verification_results](tables/plan_verification_results.md)
- [portfolio_profile_allocations](tables/portfolio_profile_allocations.md)
- [portfolios](tables/portfolios.md)
- [pr_metrics](tables/pr_metrics.md)
- [prd_research_audit_log](tables/prd_research_audit_log.md) - Audit log for all knowledge retrieval operations (monitoring and optimization)
- [prd_ui_mappings](tables/prd_ui_mappings.md)
- [prds_backup_20251016](tables/prds_backup_20251016.md)
- [product_requirements_v2](tables/product_requirements_v2.md) - Product Requirements Documents (PRDs) for Strategic Directives. Created by PLAN agent during PLAN_PRD phase. Contains comprehensive implementation specifications: requirements, architecture, testing, risks, and acceptance criteria. One PRD per SD (1:1 relationship via sd_uuid foreign key).
- [profiles](tables/profiles.md)
- [prompt_templates](tables/prompt_templates.md)
- [proposal_approvals](tables/proposal_approvals.md)
- [proposal_debate_rounds](tables/proposal_debate_rounds.md)
- [proposal_debates](tables/proposal_debates.md)
- [proposal_notifications](tables/proposal_notifications.md)
- [proposal_state_transitions](tables/proposal_state_transitions.md)
- [protocol_constitution](tables/protocol_constitution.md) - Immutable constitution rules for LEO self-improvement governance. Cannot be modified or deleted.
- [protocol_improvement_audit_log](tables/protocol_improvement_audit_log.md) - Audit trail for all protocol improvement actions. Tracks who approved what and when changes were applied.
- [protocol_improvement_queue](tables/protocol_improvement_queue.md) - Queue for protocol improvements extracted from retrospectives. Enforces database-first approach by requiring target_table and payload.
- [public_portfolio](tables/public_portfolio.md)
- [quick_fixes](tables/quick_fixes.md) - LEO Quick-Fix Workflow: Lightweight issue tracking for UAT-discovered bugs/polish (≤50 LOC).
   Auto-escalates to full SD if criteria not met.
   Part of LEO Protocol v4.2.1
- [rca_auto_trigger_config](tables/rca_auto_trigger_config.md)
- [rca_learning_records](tables/rca_learning_records.md) - Normalized learning signals for EVA integration and pattern recognition
- [recursion_events](tables/recursion_events.md)
- [releases](tables/releases.md)
- [remediation_manifests](tables/remediation_manifests.md) - Corrective and Preventive Action (CAPA) plans linked to root cause reports
- [research_sessions](tables/research_sessions.md)
- [retro_notifications](tables/retro_notifications.md)
- [risk_assessments](tables/risk_assessments.md) - BMAD Enhancement: Multi-domain risk assessment for Strategic Directives
- [risk_escalation_log](tables/risk_escalation_log.md) - SD-LIFECYCLE-GAP-005: Audit trail for risk escalations requiring chairman/EVA review
- [risk_gate_passage_log](tables/risk_gate_passage_log.md) - SD-LIFECYCLE-GAP-005: Tracks gate passage attempts and outcomes with risk summary
- [risk_recalibration_forms](tables/risk_recalibration_forms.md) - SD-LIFECYCLE-GAP-005: Risk re-calibration forms at phase boundary gates (Gates 3, 4, 5, 6)
- [root_cause_reports](tables/root_cause_reports.md) - Root cause investigation records for failures, defects, and quality issues across LEO Protocol
- [runtime_audits](tables/runtime_audits.md)
- [scaffold_patterns](tables/scaffold_patterns.md) - Pattern library for AI-driven code generation in Genesis simulations
- [schema_expectations](tables/schema_expectations.md)
- [screen_layouts](tables/screen_layouts.md)
- [sdip_ai_analysis](tables/sdip_ai_analysis.md)
- [sdip_groups](tables/sdip_groups.md) - Manually grouped SDIP submissions for combined analysis
- [sdip_submissions](tables/sdip_submissions.md) - Strategic Directive Initiation Protocol submissions with full validation workflow
- [self_audit_findings](tables/self_audit_findings.md) - Stores findings from LEO self-discovery routines (SD-LEO-SELF-IMPROVE-002B)
- [sensemaking_analyses](tables/sensemaking_analyses.md)
- [sensemaking_personas](tables/sensemaking_personas.md)
- [sensemaking_telegram_sessions](tables/sensemaking_telegram_sessions.md)
- [session_lifecycle_events](tables/session_lifecycle_events.md) - Audit log for session lifecycle events: create, heartbeat, stale, release. Part of FR-5.
- [shipping_decisions](tables/shipping_decisions.md)
- [simulation_sessions](tables/simulation_sessions.md) - Tracks Genesis simulation lifecycle including ephemeral deployments and incineration
- [soul_extractions](tables/soul_extractions.md) - Stores extracted structured requirements from simulations for regeneration gates (Stage 16/17)
- [stage13_assessments](tables/stage13_assessments.md) - EVA-generated exit readiness assessments. SD-STAGE-13-001.
- [stage13_substage_states](tables/stage13_substage_states.md) - Tracks current Stage 13 substage position per venture. SD-STAGE-13-001.
- [stage13_valuations](tables/stage13_valuations.md) - EVA-generated valuation models with confidence scores. SD-STAGE-13-001.
- [stage_data_contracts](tables/stage_data_contracts.md)
- [stage_events](tables/stage_events.md)
- [stage_of_death_predictions](tables/stage_of_death_predictions.md)
- [story_test_mappings](tables/story_test_mappings.md) - Links user stories to test results with traceability
- [strategic_themes](tables/strategic_themes.md) - Annual strategic themes derived from EVA vision dimensions, used to group and prioritize Strategic Directives
- [strategic_vision](tables/strategic_vision.md) - Top-level organizational vision (2-5 year horizon)
- [sub_agent_execution_batches](tables/sub_agent_execution_batches.md)
- [sub_agent_execution_results](tables/sub_agent_execution_results.md) - LEO 5.0 Sub-agent execution results - tracks individual sub-agent runs and outputs
- [sub_agent_execution_results_archive](tables/sub_agent_execution_results_archive.md)
- [sub_agent_executions](tables/sub_agent_executions.md)
- [sub_agent_gate_requirements](tables/sub_agent_gate_requirements.md)
- [sub_agent_spawn_events](tables/sub_agent_spawn_events.md) - LEO 5.0 Sub-agent spawn events - tracks batch spawning of sub-agents
- [subagent_activations](tables/subagent_activations.md)
- [subagent_requirements](tables/subagent_requirements.md)
- [subagent_validation_results](tables/subagent_validation_results.md)
- [submission_groups](tables/submission_groups.md)
- [submission_screenshots](tables/submission_screenshots.md)
- [submission_steps](tables/submission_steps.md)
- [substage_transition_log](tables/substage_transition_log.md) - Audit trail of all Stage 13 substage transitions. SD-STAGE-13-001.
- [system_alerts](tables/system_alerts.md) - System-wide alerts including circuit breaker trips requiring Chairman attention
- [system_events](tables/system_events.md) - Black Box audit log for all agent actions, state transitions, and resource consumption.
   Supports all 6 Pillars: Command Engine (events), Crew Registry (agents),
   Capital Ledger (tokens), Truth Layer (calibration). Created by SD-UNIFIED-PATH-1.1.1.
- [system_health](tables/system_health.md) - Circuit breaker state machine for external service health monitoring
- [system_settings](tables/system_settings.md) - Unified source of truth for AUTO safety state and rate limits. Replaces split-brain freeze logic.
- [task_hydration_log](tables/task_hydration_log.md) - LEO 5.0 Task hydration log - tracks phase task generation events
- [team_templates](tables/team_templates.md) - Pre-built team templates for one-command team creation. Each template defines roles, task structure, and a leader agent.
- [tech_stack_references](tables/tech_stack_references.md) - Cache for Context7 MCP and retrospective research results with 24-hour TTL
- [telegram_bot_interactions](tables/telegram_bot_interactions.md) - Audit log for Chairman Telegram Bot interactions (SD-EHG-FEAT-CHAIRMAN-TELEGRAM-BOT-001)
- [telegram_conversations](tables/telegram_conversations.md) - Multi-turn conversation state for the Chairman Telegram Bot (SD-EHG-FEAT-CHAIRMAN-TELEGRAM-BOT-001)
- [telegram_forum_topics](tables/telegram_forum_topics.md)
- [telemetry_analysis_runs](tables/telemetry_analysis_runs.md) - Tracks lifecycle of telemetry auto-analysis runs (QUEUED->RUNNING->SUCCEEDED/FAILED/TIMED_OUT)
- [telemetry_thresholds](tables/telemetry_thresholds.md)
- [test_coverage_policies](tables/test_coverage_policies.md) - LOC-based test coverage policy enforcement for QA sub-agent. SD-QUALITY-002.
- [test_plans](tables/test_plans.md) - BMAD Enhancement: Structured test architecture planning for Strategic Directives
- [test_results](tables/test_results.md) - Individual test outcomes linked to test_runs
- [test_runs](tables/test_runs.md) - Immutable test execution records. Part of unified test evidence architecture (LEO v4.3.4)
- [tool_access_grants](tables/tool_access_grants.md)
- [tool_registry](tables/tool_registry.md)
- [tool_usage_ledger](tables/tool_usage_ledger.md)
- [uat_audit_trail](tables/uat_audit_trail.md)
- [uat_cases](tables/uat_cases.md)
- [uat_coverage_metrics](tables/uat_coverage_metrics.md)
- [uat_credential_history](tables/uat_credential_history.md) - Audit trail for credential rotations
- [uat_credentials](tables/uat_credentials.md) - Stores encrypted test credentials for UAT environments
- [uat_debt_registry](tables/uat_debt_registry.md) - Stores deferred human-judgment testing items from Vision QA and /uat workflows. Part of Three-Tier Testing Architecture (SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001).
- [uat_defects](tables/uat_defects.md)
- [uat_issues](tables/uat_issues.md)
- [uat_performance_metrics](tables/uat_performance_metrics.md)
- [uat_results](tables/uat_results.md)
- [uat_runs](tables/uat_runs.md)
- [uat_screenshots](tables/uat_screenshots.md)
- [uat_test_cases](tables/uat_test_cases.md)
- [uat_test_results](tables/uat_test_results.md)
- [uat_test_runs](tables/uat_test_runs.md)
- [uat_test_schedules](tables/uat_test_schedules.md)
- [uat_test_suites](tables/uat_test_suites.md)
- [uat_test_users](tables/uat_test_users.md) - Tracks test users created in EHG for UAT testing
- [ui_validation_checkpoints](tables/ui_validation_checkpoints.md)
- [ui_validation_results](tables/ui_validation_results.md)
- [user_blueprint_bookmarks](tables/user_blueprint_bookmarks.md) - Stores user bookmarks for opportunity blueprints (SD-BLUEPRINT-UI-001:US-004)
- [user_company_access](tables/user_company_access.md)
- [user_context_patterns](tables/user_context_patterns.md) - RLS enabled 2025-10-26 (migration 020) - Learned patterns of user behavior and context
- [user_navigation_analytics](tables/user_navigation_analytics.md)
- [user_organizations](tables/user_organizations.md) - Multi-tenant user-organization membership for RLS policies
- [user_preferences](tables/user_preferences.md)
- [user_stories](tables/user_stories.md) - RLS enabled: service_role full access, authenticated read-only
- [validation_audit_log](tables/validation_audit_log.md) - Audit log for LEO Protocol validation failures including bypass detection, coverage validation, and gate failures
- [validation_evidence](tables/validation_evidence.md)
- [validation_gate_registry](tables/validation_gate_registry.md) - Database-first policy for validation gate applicability per SD type and validation profile. Part of SD-LEO-INFRA-VALIDATION-GATE-REGISTRY-001.
- [venture_archetypes](tables/venture_archetypes.md) - Recurring venture patterns with visual themes and historical performance data. Stage 0 uses archetype recognition to trigger specific benchmarks, pitfalls, and strategies.
- [venture_artifacts](tables/venture_artifacts.md)
- [venture_blueprints](tables/venture_blueprints.md) - Pre-made venture templates for the Blueprint Browse entry path in Stage 0
- [venture_briefs](tables/venture_briefs.md) - Stage 0 output contract - structured brief produced by the synthesis engine that becomes Stage 1 input
- [venture_capabilities](tables/venture_capabilities.md) - Tracks reusable capabilities across ventures for the Capability Lattice (SD-LEO-FEAT-CAPABILITY-LATTICE-001)
- [venture_compliance_artifacts](tables/venture_compliance_artifacts.md) - SD-LIFECYCLE-GAP-002: Venture-owned generated artifacts
- [venture_compliance_progress](tables/venture_compliance_progress.md) - SD-LIFECYCLE-GAP-002: Per-venture compliance item completion tracking
- [venture_decisions](tables/venture_decisions.md) - Gate decisions for ventures - created for chairman_unified_decisions VIEW
- [venture_dependencies](tables/venture_dependencies.md) - Directed dependency graph between ventures for stage-transition blocking (Decision #32)
- [venture_documents](tables/venture_documents.md)
- [venture_drafts](tables/venture_drafts.md)
- [venture_nursery](tables/venture_nursery.md) - Stores venture ideas not ready for Stage 1 at seed/sprout/ready maturity levels with trigger conditions for automatic re-evaluation
- [venture_raid_summary](tables/venture_raid_summary.md)
- [venture_stage_transitions](tables/venture_stage_transitions.md)
- [venture_stage_work](tables/venture_stage_work.md)
- [venture_templates](tables/venture_templates.md) - Reusable patterns extracted from ventures completing Stage 25
- [venture_token_budgets](tables/venture_token_budgets.md) - INDUSTRIAL-HARDENING-v3.0: Venture-level token budget tracking. Enforces Economic Circuit Breaker policy. Default 100k tokens per venture.
- [venture_token_ledger](tables/venture_token_ledger.md) - Golden Nugget: Token/compute investment tracking per venture
- [venture_tool_quotas](tables/venture_tool_quotas.md)
- [ventures](tables/ventures.md)
- [vertical_complexity_multipliers](tables/vertical_complexity_multipliers.md) - Industry vertical complexity factors for Truth Normalization (SD-HARDENING-V2)
- [voice_cached_responses](tables/voice_cached_responses.md)
- [voice_conversations](tables/voice_conversations.md)
- [voice_function_calls](tables/voice_function_calls.md)
- [voice_usage_metrics](tables/voice_usage_metrics.md)
- [wizard_analytics](tables/wizard_analytics.md)
- [work_item_thresholds](tables/work_item_thresholds.md)
- [workflow_checkpoints](tables/workflow_checkpoints.md) - Stores workflow state checkpoints for recovery
- [workflow_executions](tables/workflow_executions.md)
- [workflow_recovery_state](tables/workflow_recovery_state.md) - Tracks recovery attempts and status
- [workflow_trace_log](tables/workflow_trace_log.md) - Stores workflow telemetry spans for bottleneck detection (SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001A)

## RLS Policy Patterns

Common RLS policy patterns found in this database:

### Pattern 1: Public Read Access
```sql
CREATE POLICY "select_all_policy" ON table_name
FOR SELECT TO anon, authenticated
USING (true);
```

### Pattern 2: Authenticated Write
```sql
CREATE POLICY "insert_authenticated_policy" ON table_name
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);
```

### Pattern 3: Row-Level Security by User
```sql
CREATE POLICY "user_access_policy" ON table_name
FOR ALL TO authenticated
USING (user_id = auth.uid());
```

## Foreign Key Relationships

_Key relationships between tables:_

**advisory_checkpoints**:
- `stage_number` → `lifecycle_stage_config.stage_number`

**aegis_constitutions**:
- `parent_constitution_id` → `aegis_constitutions.id`
- `superseded_by` → `aegis_constitutions.id`

**aegis_rules**:
- `constitution_id` → `aegis_constitutions.id`
- `superseded_by` → `aegis_rules.id`

**aegis_violations**:
- `constitution_id` → `aegis_constitutions.id`
- `rule_id` → `aegis_rules.id`

**agent_artifacts**:
- `sd_id` → `strategic_directives_v2.id`

**agent_learning_outcomes**:
- `sd_id` → `strategic_directives_v2.id`

**agent_memory_stores**:
- `agent_id` → `agent_registry.id`
- `parent_version_id` → `agent_memory_stores.id`
- `venture_id` → `ventures.id`

**agent_messages**:
- `from_agent_id` → `agent_registry.id`
- `response_message_id` → `agent_messages.id`
- `to_agent_id` → `agent_registry.id`

**agent_registry**:
- `parent_agent_id` → `agent_registry.id`
- `portfolio_id` → `portfolios.id`
- `venture_id` → `ventures.id`

**agent_relationships**:
- `from_agent_id` → `agent_registry.id`
- `to_agent_id` → `agent_registry.id`

**agent_task_contracts**:
- `output_artifact_id` → `agent_artifacts.id`
- `sd_id` → `strategic_directives_v2.id`

**archetype_profile_interactions**:
- `profile_id` → `evaluation_profiles.id`

**assumption_sets**:
- `parent_version_id` → `assumption_sets.id`

**audit_finding_sd_links**:
- `mapping_id` → `audit_finding_sd_mapping.id`

**audit_triangulation_log**:
- `audit_id` → `runtime_audits.id`

**blueprint_board_submissions**:
- `blueprint_id` → `opportunity_blueprints.id`
- `board_meeting_id` → `board_meetings.id`

**blueprint_selection_signals**:
- `blueprint_id` → `opportunity_blueprints.id`
- `user_id` → `users.id`

**board_meeting_attendance**:
- `board_member_id` → `board_members.id`
- `meeting_id` → `board_meetings.id`

**brainstorm_question_interactions**:
- `session_id` → `brainstorm_sessions.id`

**brand_genome_submissions**:
- `previous_version_id` → `brand_genome_submissions.id`

**campaign_content**:
- `campaign_id` → `marketing_campaigns.id`
- `content_id` → `marketing_content.id`

**capital_transactions**:
- `stage_work_id` → `venture_stage_work.id`
- `venture_id` → `ventures.id`

**chairman_approval_requests**:
- `venture_id` → `ventures.id`

**chairman_decisions**:
- `preference_ref_id` → `chairman_preferences.id`
- `venture_id` → `ventures.id`

**chairman_directives**:
- `issued_by` → `users.id`
- `portfolio_id` → `portfolios.id`
- `venture_id` → `ventures.id`

**chairman_feedback**:
- `company_id` → `companies.id`

**chairman_interests**:
- `user_id` → `users.id`

**chairman_notifications**:
- `decision_id` → `chairman_decisions.id`

**chairman_settings**:
- `company_id` → `companies.id`
- `created_by` → `users.id`
- `venture_id` → `ventures.id`

**channel_budgets**:
- `venture_id` → `ventures.id`

**competitors**:
- `venture_id` → `ventures.id`

**compliance_checklist_items**:
- `checklist_id` → `compliance_checklists.id`

**compliance_checklists**:
- `created_by` → `users.id`

**compliance_events**:
- `check_id` → `compliance_checks.id`
- `policy_id` → `compliance_policies.policy_id`

**compliance_gate_events**:
- `created_by` → `users.id`
- `venture_id` → `ventures.id`

**compliance_policies**:
- `superseded_by` → `compliance_policies.id`
- `supersedes` → `compliance_policies.id`

**compliance_violations**:
- `check_id` → `compliance_checks.id`
- `policy_id` → `governance_policies.id`

**context_embeddings**:
- `interaction_id` → `interaction_history.id`

**continuous_execution_log**:
- `child_sd_id` → `strategic_directives_v2.id`
- `parent_sd_id` → `strategic_directives_v2.id`

**counterfactual_scores**:
- `profile_id` → `evaluation_profiles.id`

**daily_rollups**:
- `content_id` → `marketing_content.id`
- `variant_id` → `marketing_content_variants.id`
- `venture_id` → `ventures.id`

**debate_arguments**:
- `debate_session_id` → `debate_sessions.id`
- `in_response_to_argument_id` → `debate_arguments.id`

**debate_circuit_breaker**:
- `sd_id` → `strategic_directives_v2.id`

**debate_sessions**:
- `sd_id` → `strategic_directives_v2.id`

**department_agents**:
- `agent_id` → `agent_registry.id`
- `department_id` → `departments.id`

**department_capabilities**:
- `department_id` → `departments.id`

**department_messages**:
- `department_id` → `departments.id`
- `sender_agent_id` → `agent_registry.id`

**departments**:
- `parent_department_id` → `departments.id`

**distribution_history**:
- `channel_id` → `distribution_channels.id`
- `posted_by` → `users.id`
- `queue_item_id` → `marketing_content_queue.id`
- `venture_id` → `ventures.id`

**documentation_inventory**:
- `related_sd_id` → `strategic_directives_v2.id`

**documentation_violations**:
- `related_sd_id` → `strategic_directives_v2.id`

**domain_knowledge**:
- `source_session_id` → `brainstorm_sessions.id`

**ehg_design_decisions**:
- `feature_area_id` → `ehg_feature_areas.id`
- `route_id` → `ehg_page_routes.id`

**ehg_feature_areas**:
- `parent_area_id` → `ehg_feature_areas.id`

**ehg_page_routes**:
- `feature_area_id` → `ehg_feature_areas.id`

**enhancement_proposal_audit**:
- `proposal_id` → `enhancement_proposals.id`

**eva_actions**:
- `company_id` → `companies.id`
- `session_id` → `eva_orchestration_sessions.session_id`
- `venture_id` → `ventures.id`

**eva_agent_communications**:
- `in_reply_to` → `eva_agent_communications.communication_id`
- `session_id` → `eva_orchestration_sessions.session_id`

**eva_architecture_plans**:
- `venture_id` → `ventures.id`
- `vision_id` → `eva_vision_documents.id`

**eva_audit_log**:
- `eva_venture_id` → `eva_ventures.id`

**eva_automation_executions**:
- `decision_id` → `eva_decisions.id`
- `rule_id` → `eva_automation_rules.id`
- `venture_id` → `eva_ventures.id`

**eva_automation_rules**:
- `created_by` → `users.id`

**eva_circuit_state_transitions**:
- `circuit_id` → `eva_circuit_breaker.id`

**eva_decisions**:
- `eva_venture_id` → `eva_ventures.id`

**eva_event_ledger**:
- `event_id` → `eva_events.id`

**eva_events**:
- `eva_venture_id` → `eva_ventures.id`

**eva_events_dlq**:
- `event_id` → `eva_events.id`

**eva_interactions**:
- `parent_interaction_id` → `eva_interactions.id`
- `sd_id` → `strategic_directives_v2.id`
- `session_id` → `claude_sessions.session_id`
- `venture_id` → `ventures.id`

**eva_orchestration_events**:
- `venture_id` → `ventures.id`

**eva_orchestration_sessions**:
- `company_id` → `companies.id`

**eva_saga_log**:
- `venture_id` → `ventures.id`

**eva_scheduler_metrics**:
- `venture_id` → `eva_ventures.id`

**eva_scheduler_queue**:
- `venture_id` → `eva_ventures.id`

**eva_stage_gate_results**:
- `venture_id` → `ventures.id`

**eva_todoist_intake**:
- `youtube_intake_id` → `eva_youtube_intake.id`

**eva_trace_log**:
- `venture_id` → `ventures.id`

**eva_ventures**:
- `venture_id` → `ventures.id`

**eva_vision_documents**:
- `parent_vision_id` → `eva_vision_documents.id`
- `venture_id` → `ventures.id`

**eva_vision_gaps**:
- `vision_score_id` → `eva_vision_scores.id`

**eva_vision_iterations**:
- `vision_id` → `eva_vision_documents.id`

**eva_vision_scores**:
- `arch_plan_id` → `eva_architecture_plans.id`
- `vision_id` → `eva_vision_documents.id`

**evaluation_profile_outcomes**:
- `profile_id` → `evaluation_profiles.id`

**exec_handoff_preparations**:
- `sd_id` → `strategic_directives_v2.id`
- `session_id` → `exec_implementation_sessions.id`

**exec_implementation_sessions**:
- `prd_id` → `product_requirements_v2.id`
- `sd_id` → `strategic_directives_v2.id`

**exec_quality_checkpoints**:
- `sd_id` → `strategic_directives_v2.id`
- `session_id` → `exec_implementation_sessions.id`

**exec_sub_agent_activations**:
- `sd_id` → `strategic_directives_v2.id`
- `session_id` → `exec_implementation_sessions.id`

**execution_sequences_v2**:
- `directive_id` → `strategic_directives_v2.id`

**feedback**:
- `duplicate_of_id` → `feedback.id`
- `duplicate_of_id` → `feedback.id`
- `quick_fix_id` → `quick_fixes.id`
- `quick_fix_id` → `quick_fixes.id`
- `strategic_directive_id` → `strategic_directives_v2.id`

**feedback_events**:
- `interaction_id` → `interaction_history.id`

**feedback_sd_map**:
- `feedback_id` → `feedback.id`
- `sd_id` → `strategic_directives_v2.id`

**financial_models**:
- `company_id` → `companies.id`
- `venture_id` → `ventures.id`
- `company_id` → `companies.id`
- `venture_id` → `ventures.id`

**financial_projections**:
- `model_id` → `financial_models.id`
- `model_id` → `financial_models.id`

**financial_scenarios**:
- `model_id` → `financial_models.id`
- `model_id` → `financial_models.id`

**fit_gate_scores**:
- `intake_submission_id` → `intake_submissions.id`
- `previous_score_id` → `fit_gate_scores.id`

**gap_analysis_results**:
- `prd_id` → `product_requirements_v2.id`
- `sd_key` → `strategic_directives_v2.sd_key`

**governance_decisions**:
- `venture_id` → `ventures.id`

**governance_proposals**:
- `parent_proposal_id` → `governance_proposals.id`
- `prd_id` → `product_requirements_v2.id`
- `sd_id` → `strategic_directives_v2.id`

**hap_blocks_v2**:
- `execution_sequence_id` → `execution_sequences_v2.id`
- `strategic_directive_id` → `strategic_directives_v2.id`

**improvement_quality_assessments**:
- `improvement_id` → `protocol_improvement_queue.id`

**intake_submissions**:
- `fit_gate_score_id` → `fit_gate_scores.id`
- `previous_version_id` → `intake_submissions.id`

**intelligence_analysis**:
- `venture_id` → `ventures.id`

**issue_patterns**:
- `assigned_sd_id` → `strategic_directives_v2.id`
- `first_seen_sd_id` → `strategic_directives_v2.id`
- `last_seen_sd_id` → `strategic_directives_v2.id`

**judge_verdicts**:
- `debate_session_id` → `debate_sessions.id`

**key_results**:
- `objective_id` → `objectives.id`

**kr_progress_snapshots**:
- `key_result_id` → `key_results.id`

**lead_evaluations**:
- `sd_id` → `strategic_directives_v2.id`

**learning_decisions**:
- `sd_created_id` → `strategic_directives_v2.id`
- `sd_id` → `strategic_directives_v2.id`

**leo_adrs**:
- `architecture_plan_id` → `eva_architecture_plans.id`
- `superseded_by` → `leo_adrs.id`

**leo_codebase_validations**:
- `prd_id` → `product_requirements_v2.id`
- `sd_id` → `strategic_directives_v2.id`

**leo_execution_jobs**:
- `proposal_id` → `leo_proposals.id`

**leo_feature_flag_policies**:
- `flag_id` → `leo_feature_flags.id`

**leo_handoff_executions**:
- `template_id` → `leo_handoff_templates.id`
- `sd_id` → `strategic_directives_v2.id`

**leo_handoff_rejections**:
- `execution_id` → `leo_handoff_executions.id`

**leo_handoff_templates**:
- `from_agent` → `leo_agents.agent_code`
- `to_agent` → `leo_agents.agent_code`

**leo_handoff_validations**:
- `execution_id` → `leo_handoff_executions.id`

**leo_integration_verification_results**:
- `contract_id` → `leo_integration_contracts.id`

**leo_mandatory_validations**:
- `sub_agent_code` → `leo_sub_agents.code`

**leo_proposal_transitions**:
- `proposal_id` → `leo_proposals.id`

**leo_protocol_changes**:
- `protocol_id` → `leo_protocols.id`

**leo_protocol_file_audit**:
- `sd_id` → `strategic_directives_v2.id`

**leo_protocol_references**:
- `protocol_id` → `leo_protocols.id`

**leo_protocol_sections**:
- `scoring_rubric_id` → `leo_scoring_rubrics.id`
- `protocol_id` → `leo_protocols.id`

**leo_protocols**:
- `superseded_by` → `leo_protocols.id`

**leo_scoring_prioritization_config**:
- `active_rubric_id` → `leo_scoring_rubrics.id`

**leo_scoring_rubrics**:
- `supersedes_rubric_id` → `leo_scoring_rubrics.id`

**leo_sub_agent_triggers**:
- `sub_agent_id` → `leo_sub_agents.id`

**leo_subagent_handoffs**:
- `prd_id` → `product_requirements_v2.id`
- `sd_id` → `strategic_directives_v2.id`

**leo_vetting_outcomes**:
- `feedback_id` → `leo_feedback.id`
- `proposal_id` → `leo_proposals.id`
- `rubric_version_id` → `leo_vetting_rubrics.id`

**leo_workflow_phases**:
- `protocol_id` → `leo_protocols.id`
- `responsible_agent` → `leo_agents.agent_code`

**llm_canary_transitions**:
- `canary_state_id` → `llm_canary_state.id`

**llm_models**:
- `provider_id` → `llm_providers.id`

**marketing_attribution**:
- `campaign_id` → `marketing_campaigns.id`
- `content_id` → `marketing_content.id`
- `variant_id` → `marketing_content_variants.id`
- `venture_id` → `ventures.id`

**marketing_campaigns**:
- `venture_id` → `ventures.id`

**marketing_channels**:
- `venture_id` → `ventures.id`

**marketing_content**:
- `venture_id` → `ventures.id`

**marketing_content_queue**:
- `created_by` → `users.id`
- `reviewed_by` → `users.id`
- `venture_id` → `ventures.id`

**marketing_content_variants**:
- `content_id` → `marketing_content.id`

**missions**:
- `venture_id` → `ventures.id`

**modeling_requests**:
- `brief_id` → `venture_briefs.id`
- `nursery_id` → `venture_nursery.id`
- `venture_id` → `ventures.id`

**monthly_ceo_reports**:
- `venture_id` → `ventures.id`

**naming_favorites**:
- `naming_suggestion_id` → `naming_suggestions.id`
- `venture_id` → `ventures.id`

**naming_suggestions**:
- `brand_genome_id` → `brand_genome_submissions.id`
- `venture_id` → `ventures.id`

**nursery_evaluation_log**:
- `nursery_id` → `venture_nursery.id`

**objectives**:
- `vision_id` → `strategic_vision.id`

**okr_generation_log**:
- `vision_id` → `strategic_vision.id`

**opportunities**:
- `master_opportunity_id` → `opportunities.id`
- `source_id` → `opportunity_sources.id`

**opportunity_blueprints**:
- `scan_id` → `opportunity_scans.id`

**opportunity_categories**:
- `opportunity_id` → `opportunities.id`

**opportunity_scores**:
- `opportunity_id` → `opportunities.id`

**orchestration_metrics**:
- `company_id` → `companies.id`
- `session_id` → `eva_orchestration_sessions.session_id`
- `venture_id` → `ventures.id`

**outcome_signals**:
- `sd_id` → `strategic_directives_v2.id`

**pattern_occurrences**:
- `pattern_id` → `issue_patterns.pattern_id`
- `sd_id` → `strategic_directives_v2.id`

**pending_ceo_handoffs**:
- `venture_id` → `ventures.id`

**plan_quality_gates**:
- `sd_id` → `strategic_directives_v2.id`
- `validation_id` → `plan_technical_validations.id`

**plan_sub_agent_executions**:
- `sd_id` → `strategic_directives_v2.id`
- `validation_id` → `plan_technical_validations.id`

**plan_technical_validations**:
- `sd_id` → `strategic_directives_v2.id`

**portfolio_profile_allocations**:
- `profile_id` → `evaluation_profiles.id`

**portfolios**:
- `company_id` → `companies.id`

**prd_research_audit_log**:
- `sd_id` → `strategic_directives_v2.id`

**product_requirements_v2**:
- `sd_id` → `strategic_directives_v2.id`
- `sd_id` → `strategic_directives_v2.id`
- `venture_id` → `ventures.id`

**proposal_approvals**:
- `proposal_id` → `governance_proposals.id`

**proposal_debate_rounds**:
- `debate_id` → `proposal_debates.id`

**proposal_notifications**:
- `proposal_id` → `governance_proposals.id`

**proposal_state_transitions**:
- `proposal_id` → `governance_proposals.id`

**protocol_improvement_audit_log**:
- `improvement_id` → `protocol_improvement_queue.id`

**protocol_improvement_queue**:
- `assigned_sd_id` → `strategic_directives_v2.id`
- `source_retro_id` → `retrospectives.id`

**public_portfolio**:
- `venture_id` → `ventures.id`

**quick_fixes**:
- `escalated_to_sd_id` → `strategic_directives_v2.id`
- `routing_threshold_id` → `work_item_thresholds.id`

**rca_learning_records**:
- `rcr_id` → `root_cause_reports.id`

**recursion_events**:
- `parent_recursion_id` → `recursion_events.id`

**remediation_manifests**:
- `rcr_id` → `root_cause_reports.id`

**retrospective_action_items**:
- `retrospective_id` → `retrospectives.id`

**retrospective_contributions**:
- `retro_id` → `retrospectives.id`

**retrospective_insights**:
- `retrospective_id` → `retrospectives.id`

**retrospective_learning_links**:
- `retrospective_id` → `retrospectives.id`

**retrospective_triggers**:
- `template_id` → `retrospective_templates.id`

**retrospectives**:
- `audit_id` → `runtime_audits.id`
- `sd_id` → `strategic_directives_v2.id`
- `test_run_id` → `test_runs.id`

**risk_assessments**:
- `sd_id` → `strategic_directives_v2.id`

**risk_escalation_log**:
- `risk_form_id` → `risk_recalibration_forms.id`
- `venture_id` → `ventures.id`

**risk_gate_passage_log**:
- `risk_form_id` → `risk_recalibration_forms.id`
- `venture_id` → `ventures.id`

**risk_recalibration_forms**:
- `approved_by` → `users.id`
- `assessor_id` → `users.id`
- `previous_assessment_id` → `risk_recalibration_forms.id`
- `venture_id` → `ventures.id`

**root_cause_reports**:
- `prd_id` → `product_requirements_v2.id`
- `sd_id` → `strategic_directives_v2.id`

**sd_backlog_map**:
- `sd_id` → `strategic_directives_v2.id`

**sd_baseline_issues**:
- `discovered_by_sd_id` → `strategic_directives_v2.id`
- `last_seen_sd_id` → `strategic_directives_v2.id`
- `owner_sd_id` → `strategic_directives_v2.id`
- `remediation_sd_id` → `strategic_directives_v2.id`

**sd_baseline_items**:
- `baseline_id` → `sd_execution_baselines.id`

**sd_baseline_rationale**:
- `baseline_id` → `sd_execution_baselines.id`

**sd_burn_rate_snapshots**:
- `baseline_id` → `sd_execution_baselines.id`

**sd_business_evaluations**:
- `sd_id` → `strategic_directives_v2.id`

**sd_capabilities**:
- `sd_uuid` → `strategic_directives_v2.uuid_id`

**sd_checkpoint_history**:
- `sd_id` → `strategic_directives_v2.id`

**sd_contract_exceptions**:
- `sd_id` → `strategic_directives_v2.id`

**sd_contract_violations**:
- `sd_id` → `strategic_directives_v2.id`

**sd_corrections**:
- `sd_id` → `strategic_directives_v2.uuid_id`

**sd_data_contracts**:
- `parent_sd_id` → `strategic_directives_v2.id`

**sd_effectiveness_metrics**:
- `sd_id` → `strategic_directives_v2.id`

**sd_exec_file_operations**:
- `deliverable_id` → `sd_scope_deliverables.id`
- `sd_id` → `strategic_directives_v2.id`
- `user_story_id` → `user_stories.id`

**sd_execution_actuals**:
- `baseline_id` → `sd_execution_baselines.id`

**sd_execution_baselines**:
- `superseded_by` → `sd_execution_baselines.id`

**sd_gate_results**:
- `sd_id` → `strategic_directives_v2.uuid_id`

**sd_key_result_alignment**:
- `key_result_id` → `key_results.id`
- `sd_id` → `strategic_directives_v2.id`

**sd_kickbacks**:
- `sd_id` → `strategic_directives_v2.uuid_id`

**sd_phase_handoffs**:
- `sd_id` → `strategic_directives_v2.id`
- `venture_id` → `ventures.id`

**sd_phase_tracking**:
- `sd_id` → `strategic_directives_v2.id`

**sd_proposals**:
- `created_sd_id` → `strategic_directives_v2.id`
- `venture_id` → `ventures.id`

**sd_scope_deliverables**:
- `checkpoint_sd_id` → `strategic_directives_v2.id`
- `sd_id` → `strategic_directives_v2.id`
- `user_story_id` → `user_stories.id`

**sd_stream_completions**:
- `sd_id` → `strategic_directives_v2.id`

**sd_testing_status**:
- `sd_id` → `strategic_directives_v2.id`

**sd_type_change_audit**:
- `sd_id` → `strategic_directives_v2.id`

**sd_ux_contracts**:
- `parent_sd_id` → `strategic_directives_v2.id`

**sd_wall_states**:
- `sd_id` → `strategic_directives_v2.uuid_id`

**sd_workflow_template_steps**:
- `template_id` → `sd_workflow_templates.id`

**sdip_ai_analysis**:
- `submission_id` → `directive_submissions.submission_id`

**sdip_submissions**:
- `group_id` → `sdip_groups.id`

**sensemaking_analyses**:
- `prompt_template_id` → `prompt_templates.id`

**sensemaking_telegram_sessions**:
- `analysis_id` → `sensemaking_analyses.id`

**soul_extractions**:
- `simulation_session_id` → `simulation_sessions.id`

**stage13_assessments**:
- `venture_id` → `ventures.id`

**stage13_substage_states**:
- `venture_id` → `ventures.id`

**stage13_valuations**:
- `venture_id` → `ventures.id`

**stage_of_death_predictions**:
- `profile_id` → `evaluation_profiles.id`

**story_test_mappings**:
- `test_result_id` → `test_results.id`
- `test_run_id` → `test_runs.id`
- `user_story_id` → `user_stories.id`

**strategic_directives_v2**:
- `parent_sd_id` → `strategic_directives_v2.id`
- `target_release_id` → `releases.id`
- `venture_id` → `ventures.id`
- `vision_origin_score_id` → `eva_vision_scores.id`

**strategic_themes**:
- `vision_key` → `eva_vision_documents.vision_key`

**sub_agent_execution_results**:
- `risk_assessment_id` → `risk_assessments.id`
- `sd_id` → `strategic_directives_v2.id`

**sub_agent_executions**:
- `sub_agent_id` → `leo_sub_agents.id`

**sub_agent_spawn_events**:
- `sd_id` → `strategic_directives_v2.uuid_id`

**subagent_activations**:
- `sd_id` → `strategic_directives_v2.id`

**subagent_requirements**:
- `sd_id` → `strategic_directives_v2.id`

**subagent_validation_results**:
- `execution_id` → `sub_agent_execution_results.id`

**submission_screenshots**:
- `submission_id` → `directive_submissions.submission_id`

**submission_steps**:
- `submission_id` → `directive_submissions.submission_id`

**substage_transition_log**:
- `venture_id` → `ventures.id`

**system_events**:
- `parent_event_id` → `system_events.id`
- `prd_id` → `product_requirements_v2.id`

**task_hydration_log**:
- `sd_id` → `strategic_directives_v2.uuid_id`

**tech_stack_references**:
- `sd_id` → `strategic_directives_v2.id`

**test_plans**:
- `prd_id` → `product_requirements_v2.id`
- `sd_id` → `strategic_directives_v2.id`

**test_results**:
- `test_run_id` → `test_runs.id`

**test_runs**:
- `sd_id` → `strategic_directives_v2.id`

**tool_access_grants**:
- `agent_id` → `agent_registry.id`
- `granted_by` → `agent_registry.id`
- `tool_id` → `tool_registry.id`

**tool_usage_ledger**:
- `agent_id` → `agent_registry.id`
- `tool_id` → `tool_registry.id`
- `venture_id` → `ventures.id`

**uat_coverage_metrics**:
- `run_id` → `uat_test_runs.id`

**uat_defects**:
- `case_id` → `uat_cases.id`
- `run_id` → `uat_runs.id`

**uat_issues**:
- `run_id` → `uat_test_runs.id`
- `test_case_id` → `uat_test_cases.id`
- `test_result_id` → `uat_test_results.id`

**uat_performance_metrics**:
- `run_id` → `uat_test_runs.id`
- `test_result_id` → `uat_test_results.id`

**uat_results**:
- `case_id` → `uat_cases.id`
- `run_id` → `uat_runs.id`

**uat_runs**:
- `active_case_id` → `uat_cases.id`

**uat_screenshots**:
- `run_id` → `uat_test_runs.id`
- `test_result_id` → `uat_test_results.id`

**uat_test_cases**:
- `suite_id` → `uat_test_suites.id`

**uat_test_results**:
- `run_id` → `uat_test_runs.id`
- `test_case_id` → `uat_test_cases.id`

**uat_test_runs**:
- `suite_id` → `uat_test_suites.id`

**uat_test_schedules**:
- `suite_id` → `uat_test_suites.id`

**user_blueprint_bookmarks**:
- `blueprint_id` → `opportunity_blueprints.id`

**user_company_access**:
- `company_id` → `companies.id`
- `granted_by` → `users.id`
- `user_id` → `users.id`

**user_stories**:
- `prd_id` → `product_requirements_v2.id`
- `sd_id` → `strategic_directives_v2.id`

**validation_evidence**:
- `validation_id` → `ui_validation_results.id`

**venture_artifacts**:
- `venture_id` → `ventures.id`

**venture_briefs**:
- `profile_id` → `evaluation_profiles.id`
- `venture_id` → `ventures.id`

**venture_capabilities**:
- `origin_venture_id` → `ventures.id`

**venture_compliance_artifacts**:
- `checklist_item_id` → `compliance_checklist_items.id`
- `created_by` → `users.id`
- `template_id` → `compliance_artifact_templates.id`
- `venture_id` → `ventures.id`

**venture_compliance_progress**:
- `checklist_item_id` → `compliance_checklist_items.id`
- `owner_user_id` → `users.id`
- `updated_by` → `users.id`
- `venture_id` → `ventures.id`

**venture_decisions**:
- `venture_id` → `ventures.id`

**venture_dependencies**:
- `dependent_venture_id` → `ventures.id`
- `provider_venture_id` → `ventures.id`

**venture_documents**:
- `venture_id` → `ventures.id`

**venture_nursery**:
- `brief_id` → `venture_briefs.id`
- `promoted_to_venture_id` → `ventures.id`

**venture_phase_budgets**:
- `venture_id` → `ventures.id`

**venture_stage_transitions**:
- `venture_id` → `ventures.id`

**venture_stage_work**:
- `sd_id` → `strategic_directives_v2.id`
- `venture_id` → `ventures.id`

**venture_templates**:
- `source_venture_id` → `ventures.id`

**venture_token_budgets**:
- `venture_id` → `ventures.id`

**venture_tool_quotas**:
- `tool_id` → `tool_registry.id`
- `venture_id` → `ventures.id`

**ventures**:
- `archetype` → `archetype_benchmarks.archetype`
- `architecture_plan_id` → `eva_architecture_plans.id`
- `brief_id` → `venture_briefs.id`
- `ceo_agent_id` → `agents.id`
- `company_id` → `companies.id`
- `portfolio_id` → `portfolios.id`
- `vision_id` → `eva_vision_documents.id`

**voice_conversations**:
- `user_id` → `users.id`

**voice_function_calls**:
- `conversation_id` → `voice_conversations.id`

**voice_usage_metrics**:
- `conversation_id` → `voice_conversations.id`

**work_item_thresholds**:
- `supersedes_id` → `work_item_thresholds.id`

**working_sd_sessions**:
- `sd_id` → `strategic_directives_v2.id`

## Common Patterns

### Timestamps
Most tables include:
- `created_at` (timestamptz) - Auto-set on insert
- `updated_at` (timestamptz) - Auto-updated via trigger

### UUID Primary Keys
Most tables use `uuid` type with `gen_random_uuid()` default

### JSONB Fields
Complex data structures stored as `jsonb` for flexibility:
- Enables querying with `->`, `->>`, `@>` operators
- Indexed with GIN indexes for performance

---

*This documentation is auto-generated from the Supabase database.*
*To regenerate: `npm run schema:docs`*
