# Database Schema Overview

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-09T22:29:31.897Z
**Tables**: 340
**Source**: Supabase PostgreSQL introspection

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

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
| [activity_logs](tables/activity_logs.md) | 243 | ✅ | 2 | - |
| [advisory_checkpoints](tables/advisory_checkpoints.md) | 3 | ✅ | 4 | - |
| [agent_artifacts](tables/agent_artifacts.md) | 3,984 | ✅ | 3 | Stores large tool outputs as artifacts with summary pointers for context efficiency |
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
| [agent_registry](tables/agent_registry.md) | 7 | ✅ | 2 | - |
| [agent_relationships](tables/agent_relationships.md) | 2 | ✅ | 1 | - |
| [agent_task_contracts](tables/agent_task_contracts.md) | 3,993 | ✅ | 4 | Task contracts for sub-agent handoffs. Sub-agents read their contract from this table
instead of inheriting parent agent context, reducing context overhead by 50-70%.
Pattern: Extends sd_data_contracts for agent-to-agent communication.
Reference: SD-FOUND-AGENTIC-CONTEXT-001 (Agentic Context Engineering v3.0) |
| [agent_tools](tables/agent_tools.md) | 8 | ✅ | 2 | - |
| [agentic_reviews](tables/agentic_reviews.md) | 12 | ✅ | 4 | - |
| [agents](tables/agents.md) | 0 | ✅ | 2 | Governance agents for chairman/CEO system. Separate from crewai_agents (research automation). Referenced by ventures.ceo_agent_id and directive_delegations. |
| [ai_quality_assessments](tables/ai_quality_assessments.md) | 5,330 | ✅ | 3 | AI-powered quality assessments using Russian Judge rubrics (gpt-4o-mini). Stores all quality evaluations for meta-analysis and continuous improvement. |
| [app_config](tables/app_config.md) | 1 | ✅ | 3 | - |
| [archetype_benchmarks](tables/archetype_benchmarks.md) | 7 | ✅ | 2 | - |
| [assumption_sets](tables/assumption_sets.md) | 0 | ✅ | 4 | Golden Nugget: Versioned assumption sets for Assumptions vs Reality calibration |
| [audit_finding_sd_links](tables/audit_finding_sd_links.md) | 87 | ✅ | 2 | Join table supporting many-to-many relationships between audit findings and SDs.
   Supports primary (1:1), supporting (N:1), and theme (N:1) link types. |
| [audit_finding_sd_mapping](tables/audit_finding_sd_mapping.md) | 76 | ✅ | 2 | Maps runtime audit findings to Strategic Directives with full traceability.
   Created from triangulated recommendations (Claude + OpenAI + Antigravity).
   Key invariant: original_issue_id is immutable - verbatim Chairman feedback preserved. |
| [audit_triangulation_log](tables/audit_triangulation_log.md) | 0 | ✅ | 4 | - |
| [backlog_item_completion](tables/backlog_item_completion.md) | 1 | ✅ | 2 | RLS enabled: service_role full access, authenticated read-only |
| [blueprint_board_submissions](tables/blueprint_board_submissions.md) | 0 | ✅ | 5 | Tracks blueprint submissions for board review (SD-BLUEPRINT-UI-001:US-002,US-003) |
| [blueprint_selection_signals](tables/blueprint_selection_signals.md) | 0 | ✅ | 3 | - |
| [board_meeting_attendance](tables/board_meeting_attendance.md) | 0 | ✅ | 1 | Attendance and voting records for board meetings |
| [board_meetings](tables/board_meetings.md) | 0 | ✅ | 1 | Board meetings with agenda, outcomes, and workflow linkage |
| [board_members](tables/board_members.md) | 7 | ✅ | 2 | Board of Directors members with voting weights and expertise domains |
| [brand_genome_submissions](tables/brand_genome_submissions.md) | 0 | ✅ | 5 | Brand identity genome for ventures ensuring marketing consistency |
| [brand_variants](tables/brand_variants.md) | 0 | ✅ | 6 | - |
| [capital_transactions](tables/capital_transactions.md) | 30 | ✅ | 2 | - |
| [chairman_approval_requests](tables/chairman_approval_requests.md) | 0 | ✅ | 1 | Centralized queue for chairman approval decisions. SD-STAGE-13-001. |
| [chairman_decisions](tables/chairman_decisions.md) | 0 | ✅ | 4 | SD-HARDENING-V1-001: Chairman-only decision records.
RLS hardened - only chairman (fn_is_chairman()) can access.
SECURITY FIX: Replaced USING(true) from 20251216000001_chairman_unified_decisions.sql |
| [chairman_directives](tables/chairman_directives.md) | 0 | ✅ | 4 | - |
| [chairman_feedback](tables/chairman_feedback.md) | 0 | ✅ | 4 | - |
| [chairman_interests](tables/chairman_interests.md) | 0 | ✅ | 5 | Stores chairman/user market interests, customer segments, focus areas, and exclusions for personalized opportunity filtering. SD-CHAIRMAN-INTERESTS-001. |
| [chairman_settings](tables/chairman_settings.md) | 0 | ✅ | 4 | Configurable venture selection parameters for the Chairman. Supports company-level defaults and venture-specific overrides. |
| [circuit_breaker_blocks](tables/circuit_breaker_blocks.md) | 561 | ✅ | 2 | Audit log for Circuit Breaker blocks (Law 3).
Records all handoffs rejected due to validation_score < 85%.
Part of EHG Immutable Laws v9.0.0 Manifesto enforcement. |
| [claude_sessions](tables/claude_sessions.md) | 3,440 | ✅ | 2 | Tracks active Claude Code sessions for multi-instance coordination. Sessions auto-register and update heartbeat on sd:next/sd:claim. |
| [companies](tables/companies.md) | 75 | ✅ | 6 | - |
| [competitors](tables/competitors.md) | 0 | ✅ | 5 | - |
| [compliance_alerts](tables/compliance_alerts.md) | 14 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Compliance alerts and violations |
| [compliance_checks](tables/compliance_checks.md) | 5 | ✅ | 2 | Stores compliance check run history for the Always-On Compliance orchestrator |
| [compliance_events](tables/compliance_events.md) | 8 | ✅ | 2 | CCE Event Store: Normalized compliance events for UI and external consumers |
| [compliance_policies](tables/compliance_policies.md) | 6 | ✅ | 2 | CCE Policy Registry: Configurable compliance rules with JSONB configuration |
| [compliance_violations](tables/compliance_violations.md) | 162 | ✅ | 3 | Stores individual compliance violations detected during checks |
| [component_registry_embeddings](tables/component_registry_embeddings.md) | 0 | ✅ | 2 | Component registry with semantic search embeddings for AI-powered recommendations during PRD creation |
| [content_types](tables/content_types.md) | 3 | ✅ | 2 | - |
| [context_embeddings](tables/context_embeddings.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 020) - Vector embeddings for semantic similarity matching |
| [context_usage_daily](tables/context_usage_daily.md) | 0 | ✅ | 2 | Aggregated daily context usage metrics for trend analysis |
| [context_usage_log](tables/context_usage_log.md) | 12 | ✅ | 2 | Raw context usage entries from Claude Code status line (server-authoritative token counts) |
| [continuous_execution_log](tables/continuous_execution_log.md) | 0 | ✅ | 2 | - |
| [crew_members](tables/crew_members.md) | 15 | ✅ | 2 | - |
| [crew_semantic_diffs](tables/crew_semantic_diffs.md) | 2 | ✅ | 2 | GOVERNED-ENGINE-v5.1.0: Stores semantic validation results for crew outputs.
THE LAW: truth_score = (business_accuracy * 0.6) + (technical_accuracy * 0.4)
Crew outputs MUST pass gate_threshold to be accepted. |
| [crewai_agents](tables/crewai_agents.md) | 80 | ✅ | 2 | - |
| [crewai_crews](tables/crewai_crews.md) | 3 | ✅ | 2 | - |
| [crewai_flow_executions](tables/crewai_flow_executions.md) | 0 | ✅ | 5 | Execution history and state tracking for workflows |
| [crewai_flow_templates](tables/crewai_flow_templates.md) | 3 | ✅ | 4 | Pre-built workflow templates (official and user-created) |
| [crewai_flows](tables/crewai_flows.md) | 3 | ✅ | 4 | Visual workflow definitions created in React Flow builder, with generated Python code |
| [cross_agent_correlations](tables/cross_agent_correlations.md) | 0 | ✅ | 2 | Tracks how decisions by one agent correlate with outcomes in other agents |
| [cross_sd_utilization](tables/cross_sd_utilization.md) | 1 | ✅ | 2 | Manages cross-SD utilization requests and approvals |
| [cultural_design_styles](tables/cultural_design_styles.md) | 4 | ✅ | 4 | - |
| [defect_taxonomy](tables/defect_taxonomy.md) | 9 | ✅ | 2 | Classification taxonomy for defect categorization and prevention stage mapping |
| [directive_submissions](tables/directive_submissions.md) | 53 | ✅ | 2 | - |
| [distribution_channels](tables/distribution_channels.md) | 4 | ✅ | 2 | - |
| [distribution_history](tables/distribution_history.md) | 0 | ✅ | 2 | - |
| [doctrine_constraint_violations](tables/doctrine_constraint_violations.md) | 0 | ✅ | 2 | Audit log for Doctrine of Constraint violations (Law 1).
Captures all attempts by EXEC agents to create/modify governance artifacts.
Part of EHG Immutable Laws v9.0.0 Manifesto enforcement. |
| [documentation_health_checks](tables/documentation_health_checks.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Documentation health check results |
| [documentation_inventory](tables/documentation_inventory.md) | 398 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Documentation inventory |
| [documentation_templates](tables/documentation_templates.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Documentation templates |
| [documentation_violations](tables/documentation_violations.md) | 282 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Documentation violations |
| [ehg_component_patterns](tables/ehg_component_patterns.md) | 4 | ✅ | 2 | Reusable UI patterns and components |
| [ehg_design_decisions](tables/ehg_design_decisions.md) | 0 | ✅ | 4 | Historical design decisions for learning and consistency |
| [ehg_feature_areas](tables/ehg_feature_areas.md) | 10 | ✅ | 2 | Major feature domains in the EHG application (Ventures, Analytics, etc.) |
| [ehg_page_routes](tables/ehg_page_routes.md) | 8 | ✅ | 2 | All page routes with their purposes and relationships |
| [ehg_user_workflows](tables/ehg_user_workflows.md) | 3 | ✅ | 2 | Documented user journeys through the application |
| [eva_actions](tables/eva_actions.md) | 0 | ✅ | 4 | EVA orchestration actions - tracks all automated and manual actions executed during sessions |
| [eva_agent_communications](tables/eva_agent_communications.md) | 0 | ✅ | 4 | Inter-agent messaging for EVA orchestration - tracks all agent-to-agent communications |
| [eva_audit_log](tables/eva_audit_log.md) | 0 | ✅ | 1 | EVA Audit Trail - All actions logged |
| [eva_automation_executions](tables/eva_automation_executions.md) | 0 | ✅ | 1 | Log of all automation rule executions |
| [eva_automation_rules](tables/eva_automation_rules.md) | 4 | ✅ | 1 | EVA automation rules for Class A auto-fix and Class B auto-draft actions (SD-EVA-AUTOMATION-001) |
| [eva_circuit_breaker](tables/eva_circuit_breaker.md) | 1 | ✅ | 2 | EVA Circuit Breaker - Protects ventures from cascading EVA failures. State machine: closed → open → half_open → closed |
| [eva_circuit_state_transitions](tables/eva_circuit_state_transitions.md) | 0 | ✅ | 2 | Audit log of all EVA circuit breaker state transitions |
| [eva_decisions](tables/eva_decisions.md) | 0 | ✅ | 1 | EVA Decision Router - Chairman decision tracking |
| [eva_events](tables/eva_events.md) | 0 | ✅ | 1 | EVA Event Bus - All venture-related events |
| [eva_orchestration_sessions](tables/eva_orchestration_sessions.md) | 0 | ✅ | 4 | EVA orchestration sessions - tracks multi-agent coordination for ventures and strategic initiatives |
| [eva_ventures](tables/eva_ventures.md) | 0 | ✅ | 1 | EVA Operating System - Venture tracking with health metrics |
| [eva_weekly_review_templates](tables/eva_weekly_review_templates.md) | 2 | ✅ | 1 | Templates for automated weekly review generation |
| [exec_authorizations](tables/exec_authorizations.md) | 0 | ✅ | 2 | - |
| [exec_handoff_preparations](tables/exec_handoff_preparations.md) | 0 | ✅ | 2 | Tracks EXEC→PLAN handoff preparation and delivery |
| [exec_implementation_sessions](tables/exec_implementation_sessions.md) | 0 | ✅ | 2 | Stores results from EXEC Implementation Excellence Orchestrator - systematic implementation tracking and quality assurance |
| [exec_quality_checkpoints](tables/exec_quality_checkpoints.md) | 0 | ✅ | 2 | Tracks completion of quality checkpoints during EXEC implementation |
| [exec_sub_agent_activations](tables/exec_sub_agent_activations.md) | 0 | ✅ | 2 | Detailed results from sub-agent activations during EXEC implementation |
| [execution_sequences_v2](tables/execution_sequences_v2.md) | 0 | ✅ | 2 | - |
| [feedback_events](tables/feedback_events.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 020) - User feedback events for continuous learning |
| [financial_models](tables/financial_models.md) | 3 | ✅ | 4 | Venture capital financial models with templates (SaaS, marketplace, etc.) |
| [financial_projections](tables/financial_projections.md) | 3 | ✅ | 1 | Financial projections for venture models (monthly/quarterly/yearly) |
| [financial_scenarios](tables/financial_scenarios.md) | 3 | ✅ | 1 | Scenario analysis results (Monte Carlo, sensitivity, etc.) |
| [fit_gate_scores](tables/fit_gate_scores.md) | 0 | ✅ | 4 | Asset Factory fit gate scoring with multi-criteria evaluation framework |
| [folder_structure_snapshot](tables/folder_structure_snapshot.md) | 0 | ✅ | 2 | - |
| [gate_requirements_templates](tables/gate_requirements_templates.md) | 5 | ✅ | 2 | Templates for generating verification gates with standard requirements |
| [github_operations](tables/github_operations.md) | 0 | ✅ | 4 | Tracks all GitHub operations initiated by the LEO Protocol GitHub Sub-Agent |
| [governance_audit_log](tables/governance_audit_log.md) | 60,529 | ✅ | 3 | - |
| [governance_policies](tables/governance_policies.md) | 0 | ✅ | 2 | - |
| [governance_proposals](tables/governance_proposals.md) | 2 | ✅ | 2 | - |
| [handoff_audit_log](tables/handoff_audit_log.md) | 2,884 | ✅ | 2 | Audit trail for all handoff creation attempts, including blocked bypasses |
| [handoff_validation_rules](tables/handoff_validation_rules.md) | 8 | ✅ | 2 | - |
| [handoff_verification_gates](tables/handoff_verification_gates.md) | 0 | ✅ | 2 | Mandatory verification checkpoints that must pass before handoffs can proceed |
| [hap_blocks_v2](tables/hap_blocks_v2.md) | 0 | ✅ | 2 | - |
| [import_audit](tables/import_audit.md) | 1 | ✅ | 2 | - |
| [intake_submissions](tables/intake_submissions.md) | 0 | ✅ | 5 | Asset Factory multi-step intake wizard submissions with version tracking |
| [integrity_metrics](tables/integrity_metrics.md) | 1 | ✅ | 2 | - |
| [intelligence_analysis](tables/intelligence_analysis.md) | 0 | ✅ | 4 | - |
| [intelligence_patterns](tables/intelligence_patterns.md) | 0 | ✅ | 2 | Stores learned patterns about project types, complexity factors, and their typical outcomes |
| [interaction_history](tables/interaction_history.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 020) - Complete history of context monitoring interactions |
| [issue_patterns](tables/issue_patterns.md) | 16 | ✅ | 4 | Learning history system: stores recurring issues, proven solutions, and success metrics for cross-session knowledge retention |
| [key_results](tables/key_results.md) | 10 | ✅ | 2 | Measurable outcomes (the KR in OKRs) |
| [kr_progress_snapshots](tables/kr_progress_snapshots.md) | 10 | ✅ | 2 | Historical tracking of Key Result values |
| [lead_evaluations](tables/lead_evaluations.md) | 0 | ✅ | 2 | Stores results from LEAD Critical Evaluator framework - mandatory business value assessments |
| [learning_configurations](tables/learning_configurations.md) | 1 | ✅ | 2 | RLS enabled 2025-10-26 (migration 020) - Adaptive configuration parameters that evolve |
| [leo_adrs](tables/leo_adrs.md) | 0 | ✅ | 2 | - |
| [leo_agents](tables/leo_agents.md) | 3 | ✅ | 3 | - |
| [leo_artifacts](tables/leo_artifacts.md) | 0 | ✅ | 2 | - |
| [leo_codebase_validations](tables/leo_codebase_validations.md) | 0 | ✅ | 2 | - |
| [leo_complexity_thresholds](tables/leo_complexity_thresholds.md) | 4 | ✅ | 2 | Configuration for automatic complexity detection and reasoning depth triggers |
| [leo_effort_policies](tables/leo_effort_policies.md) | 16 | ✅ | 3 | LEO Protocol effort policies by phase and complexity level |
| [leo_error_log](tables/leo_error_log.md) | 9 | ✅ | 2 | LEO Protocol error log for critical failures that need operator attention. Part of SD-GENESIS-V32-PULSE resilience infrastructure. |
| [leo_gate_reviews](tables/leo_gate_reviews.md) | 437 | ✅ | 2 | - |
| [leo_handoff_executions](tables/leo_handoff_executions.md) | 1,346 | ✅ | 3 | Tracks all LEO Protocol handoff executions with full audit trail. Used by unified-handoff-system.js for workflow orchestration. |
| [leo_handoff_rejections](tables/leo_handoff_rejections.md) | 0 | ✅ | 2 | Tracks rejected handoffs with improvement guidance for LEO Protocol v4.2.0 |
| [leo_handoff_templates](tables/leo_handoff_templates.md) | 5 | ✅ | 3 | - |
| [leo_handoff_validations](tables/leo_handoff_validations.md) | 0 | ✅ | 2 | Stores validation results for handoff executions in LEO Protocol v4.2.0 |
| [leo_interfaces](tables/leo_interfaces.md) | 4 | ✅ | 2 | - |
| [leo_kb_generation_log](tables/leo_kb_generation_log.md) | 0 | ✅ | 3 | Tracks KB file generation timestamps for staleness detection - warn if >30 days old |
| [leo_mandatory_validations](tables/leo_mandatory_validations.md) | 2 | ✅ | 2 | - |
| [leo_nfr_requirements](tables/leo_nfr_requirements.md) | 0 | ✅ | 2 | - |
| [leo_process_scripts](tables/leo_process_scripts.md) | 8 | ✅ | 3 | Documents all LEO process scripts with usage patterns and examples - single source of truth for script documentation |
| [leo_protocol_changes](tables/leo_protocol_changes.md) | 6 | ✅ | 2 | - |
| [leo_protocol_file_audit](tables/leo_protocol_file_audit.md) | 0 | ✅ | 2 | - |
| [leo_protocol_references](tables/leo_protocol_references.md) | 0 | ✅ | 2 | - |
| [leo_protocol_sections](tables/leo_protocol_sections.md) | 137 | ✅ | 4 | - |
| [leo_protocols](tables/leo_protocols.md) | 5 | ✅ | 3 | - |
| [leo_reasoning_sessions](tables/leo_reasoning_sessions.md) | 0 | ✅ | 2 | Tracks automatic chain-of-thought reasoning sessions with complexity-based depth selection |
| [leo_reasoning_triggers](tables/leo_reasoning_triggers.md) | 7 | ✅ | 2 | Rules for automatically triggering different reasoning depths based on content analysis |
| [leo_risk_spikes](tables/leo_risk_spikes.md) | 0 | ✅ | 2 | - |
| [leo_schema_constraints](tables/leo_schema_constraints.md) | 16 | ✅ | 3 | Documents all CHECK constraints for LEO tables - used by agents to pre-validate data before insert |
| [leo_sub_agent_handoffs](tables/leo_sub_agent_handoffs.md) | 1 | ✅ | 2 | - |
| [leo_sub_agent_triggers](tables/leo_sub_agent_triggers.md) | 376 | ✅ | 3 | - |
| [leo_sub_agents](tables/leo_sub_agents.md) | 26 | ✅ | 3 | - |
| [leo_subagent_handoffs](tables/leo_subagent_handoffs.md) | 1 | ✅ | 2 | Stores distilled summaries passed between sub-agents |
| [leo_test_plans](tables/leo_test_plans.md) | 1 | ✅ | 2 | - |
| [leo_validation_rules](tables/leo_validation_rules.md) | 21 | ✅ | 3 | - |
| [leo_workflow_phases](tables/leo_workflow_phases.md) | 0 | ✅ | 2 | - |
| [lifecycle_phases](tables/lifecycle_phases.md) | 6 | ✅ | 4 | Venture Vision v2.0 - 6 Phase Definitions |
| [lifecycle_stage_config](tables/lifecycle_stage_config.md) | 25 | ✅ | 4 | 25-stage venture lifecycle configuration. Stage 10 (Strategic Narrative & Positioning)
includes cultural_design_config artifact for venture-based design style selection.
Reference: docs/workflow/stages_v2.yaml |
| [llm_models](tables/llm_models.md) | 8 | ✅ | 2 | - |
| [llm_providers](tables/llm_providers.md) | 2 | ✅ | 2 | - |
| [market_segments](tables/market_segments.md) | 6 | ✅ | 3 | - |
| [marketing_content_queue](tables/marketing_content_queue.md) | 0 | ✅ | 2 | - |
| [model_usage_log](tables/model_usage_log.md) | 594 | ✅ | 2 | - |
| [naming_favorites](tables/naming_favorites.md) | 0 | ✅ | 1 | - |
| [naming_suggestions](tables/naming_suggestions.md) | 0 | ✅ | 2 | - |
| [nav_preferences](tables/nav_preferences.md) | 2 | ✅ | 2 | - |
| [nav_routes](tables/nav_routes.md) | 46 | ✅ | 4 | - |
| [objectives](tables/objectives.md) | 3 | ✅ | 2 | Qualitative goals (the O in OKRs) |
| [operations_audit_log](tables/operations_audit_log.md) | 1 | ✅ | 2 | - |
| [opportunities](tables/opportunities.md) | 0 | ✅ | 2 | - |
| [opportunity_blueprints](tables/opportunity_blueprints.md) | 8 | ✅ | 2 | - |
| [opportunity_categories](tables/opportunity_categories.md) | 0 | ✅ | 1 | - |
| [opportunity_scans](tables/opportunity_scans.md) | 2 | ✅ | 2 | Tracks AI opportunity discovery scans. Each scan can generate multiple blueprints. |
| [opportunity_scores](tables/opportunity_scores.md) | 0 | ✅ | 1 | - |
| [opportunity_sources](tables/opportunity_sources.md) | 4 | ✅ | 2 | - |
| [orchestration_metrics](tables/orchestration_metrics.md) | 0 | ✅ | 4 | Performance analytics for EVA orchestration - tracks efficiency, quality, and resource utilization |
| [pattern_subagent_mapping](tables/pattern_subagent_mapping.md) | 59 | ✅ | 2 | - |
| [pending_ceo_handoffs](tables/pending_ceo_handoffs.md) | 4 | ✅ | 2 | Persists pending CEO handoff reviews. Replaces in-memory Map in venture-state-machine.js.
Part of SD-HARDENING-V2-002C: Idempotency & Persistence. |
| [plan_conflict_rules](tables/plan_conflict_rules.md) | 3 | ✅ | 2 | - |
| [plan_quality_gates](tables/plan_quality_gates.md) | 0 | ✅ | 2 | Tracks completion of quality gates defined during PLAN validation |
| [plan_sub_agent_executions](tables/plan_sub_agent_executions.md) | 0 | ✅ | 2 | Detailed results from sub-agent executions during PLAN validation |
| [plan_subagent_queries](tables/plan_subagent_queries.md) | 0 | ✅ | 2 | - |
| [plan_technical_validations](tables/plan_technical_validations.md) | 0 | ✅ | 2 | Stores results from PLAN Technical Validation Orchestrator - systematic technical validation and risk assessment |
| [plan_verification_results](tables/plan_verification_results.md) | 0 | ✅ | 2 | - |
| [portfolios](tables/portfolios.md) | 8 | ✅ | 7 | - |
| [pr_metrics](tables/pr_metrics.md) | 1 | ✅ | 4 | - |
| [prd_research_audit_log](tables/prd_research_audit_log.md) | 4 | ✅ | 6 | Audit log for all knowledge retrieval operations (monitoring and optimization) |
| [prd_ui_mappings](tables/prd_ui_mappings.md) | 8 | ✅ | 2 | - |
| [prds_backup_20251016](tables/prds_backup_20251016.md) | 9 | ✅ | 2 | - |
| [product_requirements_v2](tables/product_requirements_v2.md) | 369 | ✅ | 3 | Product Requirements Documents (PRDs) for Strategic Directives. Created by PLAN agent during PLAN_PRD phase. Contains comprehensive implementation specifications: requirements, architecture, testing, risks, and acceptance criteria. One PRD per SD (1:1 relationship via sd_uuid foreign key). |
| [profiles](tables/profiles.md) | 2 | ✅ | 4 | - |
| [prompt_templates](tables/prompt_templates.md) | 1 | ✅ | 2 | - |
| [proposal_approvals](tables/proposal_approvals.md) | 0 | ✅ | 2 | - |
| [proposal_notifications](tables/proposal_notifications.md) | 0 | ✅ | 2 | - |
| [proposal_state_transitions](tables/proposal_state_transitions.md) | 0 | ✅ | 2 | - |
| [protocol_improvement_audit_log](tables/protocol_improvement_audit_log.md) | 28 | ✅ | 2 | Audit trail for all protocol improvement actions. Tracks who approved what and when changes were applied. |
| [protocol_improvement_queue](tables/protocol_improvement_queue.md) | 24 | ✅ | 5 | Queue for protocol improvements extracted from retrospectives. Enforces database-first approach by requiring target_table and payload. |
| [quick_fixes](tables/quick_fixes.md) | 20 | ✅ | 2 | LEO Quick-Fix Workflow: Lightweight issue tracking for UAT-discovered bugs/polish (≤50 LOC).
   Auto-escalates to full SD if criteria not met.
   Part of LEO Protocol v4.2.1 |
| [rca_learning_records](tables/rca_learning_records.md) | 1 | ✅ | 3 | Normalized learning signals for EVA integration and pattern recognition |
| [recursion_events](tables/recursion_events.md) | 0 | ✅ | 4 | - |
| [remediation_manifests](tables/remediation_manifests.md) | 1 | ✅ | 4 | Corrective and Preventive Action (CAPA) plans linked to root cause reports |
| [research_sessions](tables/research_sessions.md) | 101 | ✅ | 2 | - |
| [retro_notifications](tables/retro_notifications.md) | 686 | ✅ | 2 | - |
| [retrospective_action_items](tables/retrospective_action_items.md) | 0 | ✅ | 2 | - |
| [retrospective_contributions](tables/retrospective_contributions.md) | 1 | ✅ | 4 | - |
| [retrospective_insights](tables/retrospective_insights.md) | 0 | ✅ | 2 | - |
| [retrospective_learning_links](tables/retrospective_learning_links.md) | 0 | ✅ | 2 | - |
| [retrospective_templates](tables/retrospective_templates.md) | 2 | ✅ | 2 | - |
| [retrospective_triggers](tables/retrospective_triggers.md) | 0 | ✅ | 2 | - |
| [retrospectives](tables/retrospectives.md) | 382 | ✅ | 2 | - |
| [risk_assessments](tables/risk_assessments.md) | 1 | ✅ | 2 | BMAD Enhancement: Multi-domain risk assessment for Strategic Directives |
| [root_cause_reports](tables/root_cause_reports.md) | 4 | ✅ | 4 | Root cause investigation records for failures, defects, and quality issues across LEO Protocol |
| [runtime_audits](tables/runtime_audits.md) | 0 | ✅ | 4 | - |
| [scaffold_patterns](tables/scaffold_patterns.md) | 49 | ✅ | 2 | Pattern library for AI-driven code generation in Genesis simulations |
| [schema_expectations](tables/schema_expectations.md) | 5 | ✅ | 2 | - |
| [screen_layouts](tables/screen_layouts.md) | 1 | ✅ | 2 | - |
| [sd_backlog_map](tables/sd_backlog_map.md) | 6 | ✅ | 2 | - |
| [sd_baseline_issues](tables/sd_baseline_issues.md) | 7 | ✅ | 4 | Tracks pre-existing codebase issues that should not block unrelated SD completion. Part of LEO Protocol governance. |
| [sd_baseline_items](tables/sd_baseline_items.md) | 15 | ✅ | 1 | Individual SD assignments within a baseline, including track assignment, sequence, and effort estimates. |
| [sd_baseline_rationale](tables/sd_baseline_rationale.md) | 10 | ✅ | 2 | - |
| [sd_burn_rate_snapshots](tables/sd_burn_rate_snapshots.md) | 0 | ✅ | 1 | Periodic snapshots of velocity metrics for trending and forecasting. |
| [sd_business_evaluations](tables/sd_business_evaluations.md) | 0 | ✅ | 2 | - |
| [sd_capabilities](tables/sd_capabilities.md) | 0 | ✅ | 2 | Junction table tracking which capabilities were registered/updated/deprecated by which Strategic Directives. Provides full audit trail. |
| [sd_checkpoint_history](tables/sd_checkpoint_history.md) | 0 | ✅ | 2 | - |
| [sd_claims](tables/sd_claims.md) | 1,335 | ✅ | 2 | Historical record of SD claims by sessions. Supports analytics and audit trail. |
| [sd_conflict_matrix](tables/sd_conflict_matrix.md) | 0 | ✅ | 1 | Potential conflicts between SDs that should not run in parallel. |
| [sd_contract_exceptions](tables/sd_contract_exceptions.md) | 0 | ✅ | 4 | Tracks all contract exceptions with full audit trail and automatic scrutiny assessment.
Each exception records the violation, justification, scrutiny level, and approval status.
This ensures transparency and governance for any contract boundary changes. |
| [sd_contract_violations](tables/sd_contract_violations.md) | 0 | ✅ | 4 | Tracks all contract violations detected during SD lifecycle.
BLOCKER violations prevent SD completion.
WARNING violations can be overridden with documented justification. |
| [sd_data_contracts](tables/sd_data_contracts.md) | 0 | ✅ | 4 | Data contracts define schema boundaries for child SDs. Children can only touch
tables/columns explicitly allowed by their parent's contract. Violations are BLOCKERs.
Reference: Consistency + Autonomy Architecture Plan |
| [sd_dependency_graph](tables/sd_dependency_graph.md) | 0 | ✅ | 2 | Tracks dependencies and relationships between strategic directives |
| [sd_exec_file_operations](tables/sd_exec_file_operations.md) | 0 | ✅ | 4 | Tracks file operations during EXEC phase for automatic deliverable matching. Part of SD-DELIVERABLES-V2-001. |
| [sd_execution_actuals](tables/sd_execution_actuals.md) | 15 | ✅ | 1 | Actual execution metrics for variance analysis against baseline plan. |
| [sd_execution_baselines](tables/sd_execution_baselines.md) | 4 | ✅ | 1 | Point-in-time snapshots of SD execution plans. Only one baseline can be active at a time. Rebaseline requires LEAD approval. |
| [sd_execution_timeline](tables/sd_execution_timeline.md) | 3 | ✅ | 2 | - |
| [sd_governance_bypass_audit](tables/sd_governance_bypass_audit.md) | 132 | ✅ | 2 | Audit trail for governance trigger bypasses.
All bypass requests are logged for security review.
Fixed: sd_id is TEXT to match strategic_directives_v2.id (VARCHAR). |
| [sd_intensity_adjustments](tables/sd_intensity_adjustments.md) | 3 | ✅ | 2 | Adjustments to validation requirements based on intensity level.
Overrides take precedence over sd_type_validation_profiles defaults.
Weight adjustments are ADDED to base weights (must sum to 0 to maintain 100% total). |
| [sd_intensity_gate_exemptions](tables/sd_intensity_gate_exemptions.md) | 21 | ✅ | 2 | Intensity-specific gate exemptions. Overrides sd_type_gate_exemptions when intensity_level is set. |
| [sd_key_result_alignment](tables/sd_key_result_alignment.md) | 28 | ✅ | 2 | Links Strategic Directives to Key Results |
| [sd_overlap_analysis](tables/sd_overlap_analysis.md) | 641 | ✅ | 2 | Stores overlap analysis results between strategic directives |
| [sd_phase_handoffs](tables/sd_phase_handoffs.md) | 2,517 | ✅ | 8 | DEPRECATED: Use leo_handoff_executions instead. This table is empty (0 records) and was created after leo_handoff_executions (166 records). Kept for backwards compatibility only. Single source of truth: leo_handoff_executions. |
| [sd_phase_tracking](tables/sd_phase_tracking.md) | 9 | ✅ | 2 | Tracks LEO Protocol phase completion for strategic directives |
| [sd_proposals](tables/sd_proposals.md) | 0 | ✅ | 3 | Proactive SD proposals generated by observer agents - LEO Protocol v4.4 |
| [sd_scope_deliverables](tables/sd_scope_deliverables.md) | 1,830 | ✅ | 2 | Tracks deliverables extracted from SD scope documents to ensure all promises are fulfilled |
| [sd_session_activity](tables/sd_session_activity.md) | 0 | ✅ | 1 | Granular tracking of SD work per session for continuity detection. |
| [sd_state_transitions](tables/sd_state_transitions.md) | 9 | ✅ | 2 | - |
| [sd_subagent_deliverable_mapping](tables/sd_subagent_deliverable_mapping.md) | 9 | ✅ | 2 | Maps sub-agent codes to deliverable types for automatic completion triggers |
| [sd_testing_status](tables/sd_testing_status.md) | 3 | ✅ | 2 | Tracks testing status for Strategic Directives. Prevents duplicate testing and provides work-down plan visualization. |
| [sd_type_change_audit](tables/sd_type_change_audit.md) | 26 | ✅ | 2 | Audit log for SD type changes with risk assessment. Part of SD-LEO-COMPLETION-GATES-001 governance enhancement. |
| [sd_type_gate_exemptions](tables/sd_type_gate_exemptions.md) | 57 | ✅ | 2 | Defines which gates are exempted, optional, or required for each SD type. Used by handoff executors and retro generator. |
| [sd_type_validation_profiles](tables/sd_type_validation_profiles.md) | 12 | ✅ | 4 | Configurable validation profiles for different SD types. Each type has different requirements for completion. |
| [sd_ux_contracts](tables/sd_ux_contracts.md) | 0 | ✅ | 4 | UX contracts define component/design boundaries for child SDs. Children can only
modify components within allowed paths and must use parent's cultural design style.
Violations are WARNINGs (can override with justification).
Reference: Consistency + Autonomy Architecture Plan |
| [sdip_ai_analysis](tables/sdip_ai_analysis.md) | 0 | ✅ | 2 | - |
| [sdip_groups](tables/sdip_groups.md) | 0 | ✅ | 4 | Manually grouped SDIP submissions for combined analysis |
| [sdip_submissions](tables/sdip_submissions.md) | 0 | ✅ | 4 | Strategic Directive Initiation Protocol submissions with full validation workflow |
| [shipping_decisions](tables/shipping_decisions.md) | 0 | ✅ | 2 | - |
| [simulation_sessions](tables/simulation_sessions.md) | 5 | ✅ | 2 | Tracks Genesis simulation lifecycle including ephemeral deployments and incineration |
| [soul_extractions](tables/soul_extractions.md) | 0 | ✅ | 2 | Stores extracted structured requirements from simulations for regeneration gates (Stage 16/17) |
| [stage13_assessments](tables/stage13_assessments.md) | 0 | ✅ | 1 | EVA-generated exit readiness assessments. SD-STAGE-13-001. |
| [stage13_substage_states](tables/stage13_substage_states.md) | 0 | ✅ | 1 | Tracks current Stage 13 substage position per venture. SD-STAGE-13-001. |
| [stage13_valuations](tables/stage13_valuations.md) | 0 | ✅ | 1 | EVA-generated valuation models with confidence scores. SD-STAGE-13-001. |
| [stage_data_contracts](tables/stage_data_contracts.md) | 2 | ✅ | 2 | - |
| [stage_events](tables/stage_events.md) | 0 | ✅ | 4 | - |
| [story_test_mappings](tables/story_test_mappings.md) | 0 | ✅ | 4 | Links user stories to test results with traceability |
| [strategic_directives_v2](tables/strategic_directives_v2.md) | 418 | ✅ | 4 | RLS enabled: service_role full access, authenticated read-only |
| [strategic_vision](tables/strategic_vision.md) | 1 | ✅ | 2 | Top-level organizational vision (2-5 year horizon) |
| [sub_agent_execution_batches](tables/sub_agent_execution_batches.md) | 2 | ✅ | 2 | - |
| [sub_agent_execution_results](tables/sub_agent_execution_results.md) | 9,503 | ✅ | 4 | Sub-agent execution results with optimized autovacuum settings (5% threshold).
Last performance fix: 2025-11-21 (VACUUM FULL to remove 340 dead rows causing RETRO timeout) |
| [sub_agent_execution_results_archive](tables/sub_agent_execution_results_archive.md) | 2,036 | ✅ | 4 | - |
| [sub_agent_executions](tables/sub_agent_executions.md) | 71 | ✅ | 2 | - |
| [sub_agent_gate_requirements](tables/sub_agent_gate_requirements.md) | 13 | ✅ | 2 | - |
| [subagent_activations](tables/subagent_activations.md) | 0 | ✅ | 2 | - |
| [subagent_requirements](tables/subagent_requirements.md) | 0 | ✅ | 2 | - |
| [subagent_validation_results](tables/subagent_validation_results.md) | 3,400 | ✅ | 3 | - |
| [submission_groups](tables/submission_groups.md) | 0 | ✅ | 2 | - |
| [submission_screenshots](tables/submission_screenshots.md) | 0 | ✅ | 2 | - |
| [submission_steps](tables/submission_steps.md) | 0 | ✅ | 2 | - |
| [substage_transition_log](tables/substage_transition_log.md) | 0 | ✅ | 1 | Audit trail of all Stage 13 substage transitions. SD-STAGE-13-001. |
| [system_alerts](tables/system_alerts.md) | 0 | ✅ | 2 | System-wide alerts including circuit breaker trips requiring Chairman attention |
| [system_events](tables/system_events.md) | 67 | ✅ | 3 | Black Box audit log for all agent actions, state transitions, and resource consumption.
   Supports all 6 Pillars: Command Engine (events), Crew Registry (agents),
   Capital Ledger (tokens), Truth Layer (calibration). Created by SD-UNIFIED-PATH-1.1.1. |
| [system_health](tables/system_health.md) | 1 | ✅ | 6 | Circuit breaker state machine for external service health monitoring |
| [tech_stack_references](tables/tech_stack_references.md) | 0 | ✅ | 8 | Cache for Context7 MCP and retrospective research results with 24-hour TTL |
| [test_coverage_policies](tables/test_coverage_policies.md) | 3 | ✅ | 2 | LOC-based test coverage policy enforcement for QA sub-agent. SD-QUALITY-002. |
| [test_plans](tables/test_plans.md) | 0 | ✅ | 2 | BMAD Enhancement: Structured test architecture planning for Strategic Directives |
| [test_results](tables/test_results.md) | 0 | ✅ | 4 | Individual test outcomes linked to test_runs |
| [test_runs](tables/test_runs.md) | 5 | ✅ | 4 | Immutable test execution records. Part of unified test evidence architecture (LEO v4.3.4) |
| [tool_access_grants](tables/tool_access_grants.md) | 1 | ✅ | 1 | - |
| [tool_registry](tables/tool_registry.md) | 13 | ✅ | 2 | - |
| [tool_usage_ledger](tables/tool_usage_ledger.md) | 0 | ✅ | 4 | - |
| [uat_audit_trail](tables/uat_audit_trail.md) | 0 | ❌ | 0 | - |
| [uat_cases](tables/uat_cases.md) | 81 | ✅ | 7 | - |
| [uat_coverage_metrics](tables/uat_coverage_metrics.md) | 0 | ❌ | 0 | - |
| [uat_credential_history](tables/uat_credential_history.md) | 0 | ✅ | 2 | Audit trail for credential rotations |
| [uat_credentials](tables/uat_credentials.md) | 2 | ✅ | 1 | Stores encrypted test credentials for UAT environments |
| [uat_defects](tables/uat_defects.md) | 0 | ✅ | 5 | - |
| [uat_issues](tables/uat_issues.md) | 0 | ❌ | 0 | - |
| [uat_performance_metrics](tables/uat_performance_metrics.md) | 0 | ❌ | 0 | - |
| [uat_results](tables/uat_results.md) | 123 | ✅ | 5 | - |
| [uat_runs](tables/uat_runs.md) | 2 | ✅ | 6 | - |
| [uat_screenshots](tables/uat_screenshots.md) | 0 | ❌ | 0 | - |
| [uat_test_cases](tables/uat_test_cases.md) | 2,082 | ❌ | 0 | - |
| [uat_test_results](tables/uat_test_results.md) | 0 | ❌ | 0 | - |
| [uat_test_runs](tables/uat_test_runs.md) | 0 | ❌ | 0 | - |
| [uat_test_schedules](tables/uat_test_schedules.md) | 0 | ❌ | 0 | - |
| [uat_test_suites](tables/uat_test_suites.md) | 100 | ❌ | 0 | - |
| [uat_test_users](tables/uat_test_users.md) | 0 | ✅ | 1 | Tracks test users created in EHG for UAT testing |
| [ui_validation_checkpoints](tables/ui_validation_checkpoints.md) | 6 | ✅ | 2 | - |
| [ui_validation_results](tables/ui_validation_results.md) | 2 | ✅ | 2 | - |
| [user_blueprint_bookmarks](tables/user_blueprint_bookmarks.md) | 0 | ✅ | 5 | Stores user bookmarks for opportunity blueprints (SD-BLUEPRINT-UI-001:US-004) |
| [user_company_access](tables/user_company_access.md) | 9 | ✅ | 3 | - |
| [user_context_patterns](tables/user_context_patterns.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 020) - Learned patterns of user behavior and context |
| [user_navigation_analytics](tables/user_navigation_analytics.md) | 112 | ✅ | 2 | - |
| [user_organizations](tables/user_organizations.md) | 0 | ✅ | 1 | Multi-tenant user-organization membership for RLS policies |
| [user_preferences](tables/user_preferences.md) | 2 | ✅ | 2 | - |
| [user_stories](tables/user_stories.md) | 1,332 | ✅ | 3 | RLS enabled: service_role full access, authenticated read-only |
| [validation_evidence](tables/validation_evidence.md) | 0 | ✅ | 2 | - |
| [venture_archetypes](tables/venture_archetypes.md) | 8 | ✅ | 4 | Venture archetype templates for categorizing and styling ventures |
| [venture_artifacts](tables/venture_artifacts.md) | 0 | ✅ | 5 | - |
| [venture_decisions](tables/venture_decisions.md) | 0 | ✅ | 4 | Gate decisions for ventures - created for chairman_unified_decisions VIEW |
| [venture_documents](tables/venture_documents.md) | 0 | ✅ | 1 | - |
| [venture_drafts](tables/venture_drafts.md) | 704 | ✅ | 1 | - |
| [venture_phase_budgets](tables/venture_phase_budgets.md) | 0 | ✅ | 3 | INDUSTRIAL-HARDENING-v3.0: Phase-level token budget tracking. Enables granular budget allocation across venture lifecycle stages. Default 20k tokens per phase. |
| [venture_raid_summary](tables/venture_raid_summary.md) | 136 | ✅ | 2 | - |
| [venture_stage_transitions](tables/venture_stage_transitions.md) | 0 | ✅ | 1 | - |
| [venture_stage_work](tables/venture_stage_work.md) | 33 | ✅ | 5 | - |
| [venture_token_budgets](tables/venture_token_budgets.md) | 5 | ✅ | 3 | INDUSTRIAL-HARDENING-v3.0: Venture-level token budget tracking. Enforces Economic Circuit Breaker policy. Default 100k tokens per venture. |
| [venture_token_ledger](tables/venture_token_ledger.md) | 0 | ✅ | 4 | Golden Nugget: Token/compute investment tracking per venture |
| [venture_tool_quotas](tables/venture_tool_quotas.md) | 0 | ✅ | 1 | - |
| [ventures](tables/ventures.md) | 7 | ✅ | 5 | - |
| [vertical_complexity_multipliers](tables/vertical_complexity_multipliers.md) | 5 | ✅ | 2 | Industry vertical complexity factors for Truth Normalization (SD-HARDENING-V2) |
| [voice_cached_responses](tables/voice_cached_responses.md) | 0 | ✅ | 4 | - |
| [voice_conversations](tables/voice_conversations.md) | 0 | ✅ | 4 | - |
| [voice_function_calls](tables/voice_function_calls.md) | 0 | ✅ | 5 | - |
| [voice_usage_metrics](tables/voice_usage_metrics.md) | 0 | ✅ | 3 | - |
| [wizard_analytics](tables/wizard_analytics.md) | 62 | ✅ | 2 | - |
| [workflow_checkpoints](tables/workflow_checkpoints.md) | 2 | ✅ | 2 | Stores workflow state checkpoints for recovery |
| [workflow_executions](tables/workflow_executions.md) | 579 | ✅ | 2 | - |
| [workflow_recovery_state](tables/workflow_recovery_state.md) | 0 | ✅ | 2 | Tracks recovery attempts and status |
| [working_sd_sessions](tables/working_sd_sessions.md) | 0 | ✅ | 2 | - |

## Tables by Category

### LEO Protocol (26 tables)

- [leo_adrs](tables/leo_adrs.md)
- [leo_agents](tables/leo_agents.md)
- [leo_artifacts](tables/leo_artifacts.md)
- [leo_complexity_thresholds](tables/leo_complexity_thresholds.md) - Configuration for automatic complexity detection and reasoning depth triggers
- [leo_effort_policies](tables/leo_effort_policies.md) - LEO Protocol effort policies by phase and complexity level
- [leo_error_log](tables/leo_error_log.md) - LEO Protocol error log for critical failures that need operator attention. Part of SD-GENESIS-V32-PULSE resilience infrastructure.
- [leo_gate_reviews](tables/leo_gate_reviews.md)
- [leo_handoff_executions](tables/leo_handoff_executions.md) - Tracks all LEO Protocol handoff executions with full audit trail. Used by unified-handoff-system.js for workflow orchestration.
- [leo_handoff_rejections](tables/leo_handoff_rejections.md) - Tracks rejected handoffs with improvement guidance for LEO Protocol v4.2.0
- [leo_handoff_templates](tables/leo_handoff_templates.md)
- [leo_interfaces](tables/leo_interfaces.md)
- [leo_kb_generation_log](tables/leo_kb_generation_log.md) - Tracks KB file generation timestamps for staleness detection - warn if >30 days old
- [leo_nfr_requirements](tables/leo_nfr_requirements.md)
- [leo_process_scripts](tables/leo_process_scripts.md) - Documents all LEO process scripts with usage patterns and examples - single source of truth for script documentation
- [leo_protocol_changes](tables/leo_protocol_changes.md)
- [leo_protocol_file_audit](tables/leo_protocol_file_audit.md)
- [leo_protocol_references](tables/leo_protocol_references.md)
- [leo_protocol_sections](tables/leo_protocol_sections.md)
- [leo_protocols](tables/leo_protocols.md)
- [leo_reasoning_sessions](tables/leo_reasoning_sessions.md) - Tracks automatic chain-of-thought reasoning sessions with complexity-based depth selection
- [leo_reasoning_triggers](tables/leo_reasoning_triggers.md) - Rules for automatically triggering different reasoning depths based on content analysis
- [leo_risk_spikes](tables/leo_risk_spikes.md)
- [leo_schema_constraints](tables/leo_schema_constraints.md) - Documents all CHECK constraints for LEO tables - used by agents to pre-validate data before insert
- [leo_subagent_handoffs](tables/leo_subagent_handoffs.md) - Stores distilled summaries passed between sub-agents
- [leo_test_plans](tables/leo_test_plans.md)
- [leo_workflow_phases](tables/leo_workflow_phases.md)

### Strategic Directives (40 tables)

- [audit_finding_sd_links](tables/audit_finding_sd_links.md) - Join table supporting many-to-many relationships between audit findings and SDs.
   Supports primary (1:1), supporting (N:1), and theme (N:1) link types.
- [audit_finding_sd_mapping](tables/audit_finding_sd_mapping.md) - Maps runtime audit findings to Strategic Directives with full traceability.
   Created from triangulated recommendations (Claude + OpenAI + Antigravity).
   Key invariant: original_issue_id is immutable - verbatim Chairman feedback preserved.
- [cross_sd_utilization](tables/cross_sd_utilization.md) - Manages cross-SD utilization requests and approvals
- [sd_backlog_map](tables/sd_backlog_map.md)
- [sd_baseline_issues](tables/sd_baseline_issues.md) - Tracks pre-existing codebase issues that should not block unrelated SD completion. Part of LEO Protocol governance.
- [sd_baseline_items](tables/sd_baseline_items.md) - Individual SD assignments within a baseline, including track assignment, sequence, and effort estimates.
- [sd_baseline_rationale](tables/sd_baseline_rationale.md)
- [sd_burn_rate_snapshots](tables/sd_burn_rate_snapshots.md) - Periodic snapshots of velocity metrics for trending and forecasting.
- [sd_business_evaluations](tables/sd_business_evaluations.md)
- [sd_capabilities](tables/sd_capabilities.md) - Junction table tracking which capabilities were registered/updated/deprecated by which Strategic Directives. Provides full audit trail.
- [sd_checkpoint_history](tables/sd_checkpoint_history.md)
- [sd_claims](tables/sd_claims.md) - Historical record of SD claims by sessions. Supports analytics and audit trail.
- [sd_conflict_matrix](tables/sd_conflict_matrix.md) - Potential conflicts between SDs that should not run in parallel.
- [sd_contract_exceptions](tables/sd_contract_exceptions.md) - Tracks all contract exceptions with full audit trail and automatic scrutiny assessment.
Each exception records the violation, justification, scrutiny level, and approval status.
This ensures transparency and governance for any contract boundary changes.
- [sd_contract_violations](tables/sd_contract_violations.md) - Tracks all contract violations detected during SD lifecycle.
BLOCKER violations prevent SD completion.
WARNING violations can be overridden with documented justification.
- [sd_data_contracts](tables/sd_data_contracts.md) - Data contracts define schema boundaries for child SDs. Children can only touch
tables/columns explicitly allowed by their parent's contract. Violations are BLOCKERs.
Reference: Consistency + Autonomy Architecture Plan
- [sd_dependency_graph](tables/sd_dependency_graph.md) - Tracks dependencies and relationships between strategic directives
- [sd_exec_file_operations](tables/sd_exec_file_operations.md) - Tracks file operations during EXEC phase for automatic deliverable matching. Part of SD-DELIVERABLES-V2-001.
- [sd_execution_actuals](tables/sd_execution_actuals.md) - Actual execution metrics for variance analysis against baseline plan.
- [sd_execution_baselines](tables/sd_execution_baselines.md) - Point-in-time snapshots of SD execution plans. Only one baseline can be active at a time. Rebaseline requires LEAD approval.
- [sd_execution_timeline](tables/sd_execution_timeline.md)
- [sd_governance_bypass_audit](tables/sd_governance_bypass_audit.md) - Audit trail for governance trigger bypasses.
All bypass requests are logged for security review.
Fixed: sd_id is TEXT to match strategic_directives_v2.id (VARCHAR).
- [sd_intensity_adjustments](tables/sd_intensity_adjustments.md) - Adjustments to validation requirements based on intensity level.
Overrides take precedence over sd_type_validation_profiles defaults.
Weight adjustments are ADDED to base weights (must sum to 0 to maintain 100% total).
- [sd_intensity_gate_exemptions](tables/sd_intensity_gate_exemptions.md) - Intensity-specific gate exemptions. Overrides sd_type_gate_exemptions when intensity_level is set.
- [sd_key_result_alignment](tables/sd_key_result_alignment.md) - Links Strategic Directives to Key Results
- [sd_overlap_analysis](tables/sd_overlap_analysis.md) - Stores overlap analysis results between strategic directives
- [sd_phase_handoffs](tables/sd_phase_handoffs.md) - DEPRECATED: Use leo_handoff_executions instead. This table is empty (0 records) and was created after leo_handoff_executions (166 records). Kept for backwards compatibility only. Single source of truth: leo_handoff_executions.
- [sd_phase_tracking](tables/sd_phase_tracking.md) - Tracks LEO Protocol phase completion for strategic directives
- [sd_proposals](tables/sd_proposals.md) - Proactive SD proposals generated by observer agents - LEO Protocol v4.4
- [sd_scope_deliverables](tables/sd_scope_deliverables.md) - Tracks deliverables extracted from SD scope documents to ensure all promises are fulfilled
- [sd_session_activity](tables/sd_session_activity.md) - Granular tracking of SD work per session for continuity detection.
- [sd_state_transitions](tables/sd_state_transitions.md)
- [sd_subagent_deliverable_mapping](tables/sd_subagent_deliverable_mapping.md) - Maps sub-agent codes to deliverable types for automatic completion triggers
- [sd_testing_status](tables/sd_testing_status.md) - Tracks testing status for Strategic Directives. Prevents duplicate testing and provides work-down plan visualization.
- [sd_type_change_audit](tables/sd_type_change_audit.md) - Audit log for SD type changes with risk assessment. Part of SD-LEO-COMPLETION-GATES-001 governance enhancement.
- [sd_type_gate_exemptions](tables/sd_type_gate_exemptions.md) - Defines which gates are exempted, optional, or required for each SD type. Used by handoff executors and retro generator.
- [sd_type_validation_profiles](tables/sd_type_validation_profiles.md) - Configurable validation profiles for different SD types. Each type has different requirements for completion.
- [sd_ux_contracts](tables/sd_ux_contracts.md) - UX contracts define component/design boundaries for child SDs. Children can only
modify components within allowed paths and must use parent's cultural design style.
Violations are WARNINGs (can override with justification).
Reference: Consistency + Autonomy Architecture Plan
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

### Knowledge & Learning (2 tables)

- [agent_knowledge_base](tables/agent_knowledge_base.md) - RLS enabled 2025-10-26 (migration 021) - Agent knowledge base
- [issue_patterns](tables/issue_patterns.md) - Learning history system: stores recurring issues, proven solutions, and success metrics for cross-session knowledge retention

### Other (251 tables)

- [activity_logs](tables/activity_logs.md)
- [advisory_checkpoints](tables/advisory_checkpoints.md)
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
- [agent_task_contracts](tables/agent_task_contracts.md) - Task contracts for sub-agent handoffs. Sub-agents read their contract from this table
instead of inheriting parent agent context, reducing context overhead by 50-70%.
Pattern: Extends sd_data_contracts for agent-to-agent communication.
Reference: SD-FOUND-AGENTIC-CONTEXT-001 (Agentic Context Engineering v3.0)
- [agent_tools](tables/agent_tools.md)
- [agentic_reviews](tables/agentic_reviews.md)
- [agents](tables/agents.md) - Governance agents for chairman/CEO system. Separate from crewai_agents (research automation). Referenced by ventures.ceo_agent_id and directive_delegations.
- [ai_quality_assessments](tables/ai_quality_assessments.md) - AI-powered quality assessments using Russian Judge rubrics (gpt-4o-mini). Stores all quality evaluations for meta-analysis and continuous improvement.
- [app_config](tables/app_config.md)
- [archetype_benchmarks](tables/archetype_benchmarks.md)
- [assumption_sets](tables/assumption_sets.md) - Golden Nugget: Versioned assumption sets for Assumptions vs Reality calibration
- [audit_triangulation_log](tables/audit_triangulation_log.md)
- [backlog_item_completion](tables/backlog_item_completion.md) - RLS enabled: service_role full access, authenticated read-only
- [blueprint_board_submissions](tables/blueprint_board_submissions.md) - Tracks blueprint submissions for board review (SD-BLUEPRINT-UI-001:US-002,US-003)
- [blueprint_selection_signals](tables/blueprint_selection_signals.md)
- [board_meeting_attendance](tables/board_meeting_attendance.md) - Attendance and voting records for board meetings
- [board_meetings](tables/board_meetings.md) - Board meetings with agenda, outcomes, and workflow linkage
- [board_members](tables/board_members.md) - Board of Directors members with voting weights and expertise domains
- [brand_genome_submissions](tables/brand_genome_submissions.md) - Brand identity genome for ventures ensuring marketing consistency
- [brand_variants](tables/brand_variants.md)
- [capital_transactions](tables/capital_transactions.md)
- [chairman_approval_requests](tables/chairman_approval_requests.md) - Centralized queue for chairman approval decisions. SD-STAGE-13-001.
- [chairman_decisions](tables/chairman_decisions.md) - SD-HARDENING-V1-001: Chairman-only decision records.
RLS hardened - only chairman (fn_is_chairman()) can access.
SECURITY FIX: Replaced USING(true) from 20251216000001_chairman_unified_decisions.sql
- [chairman_directives](tables/chairman_directives.md)
- [chairman_feedback](tables/chairman_feedback.md)
- [chairman_interests](tables/chairman_interests.md) - Stores chairman/user market interests, customer segments, focus areas, and exclusions for personalized opportunity filtering. SD-CHAIRMAN-INTERESTS-001.
- [chairman_settings](tables/chairman_settings.md) - Configurable venture selection parameters for the Chairman. Supports company-level defaults and venture-specific overrides.
- [circuit_breaker_blocks](tables/circuit_breaker_blocks.md) - Audit log for Circuit Breaker blocks (Law 3).
Records all handoffs rejected due to validation_score < 85%.
Part of EHG Immutable Laws v9.0.0 Manifesto enforcement.
- [claude_sessions](tables/claude_sessions.md) - Tracks active Claude Code sessions for multi-instance coordination. Sessions auto-register and update heartbeat on sd:next/sd:claim.
- [companies](tables/companies.md)
- [competitors](tables/competitors.md)
- [compliance_alerts](tables/compliance_alerts.md) - RLS enabled 2025-10-26 (migration 021) - Compliance alerts and violations
- [compliance_checks](tables/compliance_checks.md) - Stores compliance check run history for the Always-On Compliance orchestrator
- [compliance_events](tables/compliance_events.md) - CCE Event Store: Normalized compliance events for UI and external consumers
- [compliance_policies](tables/compliance_policies.md) - CCE Policy Registry: Configurable compliance rules with JSONB configuration
- [compliance_violations](tables/compliance_violations.md) - Stores individual compliance violations detected during checks
- [component_registry_embeddings](tables/component_registry_embeddings.md) - Component registry with semantic search embeddings for AI-powered recommendations during PRD creation
- [content_types](tables/content_types.md)
- [context_embeddings](tables/context_embeddings.md) - RLS enabled 2025-10-26 (migration 020) - Vector embeddings for semantic similarity matching
- [context_usage_daily](tables/context_usage_daily.md) - Aggregated daily context usage metrics for trend analysis
- [context_usage_log](tables/context_usage_log.md) - Raw context usage entries from Claude Code status line (server-authoritative token counts)
- [continuous_execution_log](tables/continuous_execution_log.md)
- [crew_members](tables/crew_members.md)
- [crew_semantic_diffs](tables/crew_semantic_diffs.md) - GOVERNED-ENGINE-v5.1.0: Stores semantic validation results for crew outputs.
THE LAW: truth_score = (business_accuracy * 0.6) + (technical_accuracy * 0.4)
Crew outputs MUST pass gate_threshold to be accepted.
- [crewai_agents](tables/crewai_agents.md)
- [crewai_crews](tables/crewai_crews.md)
- [crewai_flow_executions](tables/crewai_flow_executions.md) - Execution history and state tracking for workflows
- [crewai_flow_templates](tables/crewai_flow_templates.md) - Pre-built workflow templates (official and user-created)
- [crewai_flows](tables/crewai_flows.md) - Visual workflow definitions created in React Flow builder, with generated Python code
- [cross_agent_correlations](tables/cross_agent_correlations.md) - Tracks how decisions by one agent correlate with outcomes in other agents
- [cultural_design_styles](tables/cultural_design_styles.md)
- [defect_taxonomy](tables/defect_taxonomy.md) - Classification taxonomy for defect categorization and prevention stage mapping
- [directive_submissions](tables/directive_submissions.md)
- [distribution_channels](tables/distribution_channels.md)
- [distribution_history](tables/distribution_history.md)
- [doctrine_constraint_violations](tables/doctrine_constraint_violations.md) - Audit log for Doctrine of Constraint violations (Law 1).
Captures all attempts by EXEC agents to create/modify governance artifacts.
Part of EHG Immutable Laws v9.0.0 Manifesto enforcement.
- [documentation_health_checks](tables/documentation_health_checks.md) - RLS enabled 2025-10-26 (migration 021) - Documentation health check results
- [documentation_inventory](tables/documentation_inventory.md) - RLS enabled 2025-10-26 (migration 021) - Documentation inventory
- [documentation_templates](tables/documentation_templates.md) - RLS enabled 2025-10-26 (migration 021) - Documentation templates
- [documentation_violations](tables/documentation_violations.md) - RLS enabled 2025-10-26 (migration 021) - Documentation violations
- [ehg_component_patterns](tables/ehg_component_patterns.md) - Reusable UI patterns and components
- [ehg_design_decisions](tables/ehg_design_decisions.md) - Historical design decisions for learning and consistency
- [ehg_feature_areas](tables/ehg_feature_areas.md) - Major feature domains in the EHG application (Ventures, Analytics, etc.)
- [ehg_page_routes](tables/ehg_page_routes.md) - All page routes with their purposes and relationships
- [ehg_user_workflows](tables/ehg_user_workflows.md) - Documented user journeys through the application
- [eva_actions](tables/eva_actions.md) - EVA orchestration actions - tracks all automated and manual actions executed during sessions
- [eva_agent_communications](tables/eva_agent_communications.md) - Inter-agent messaging for EVA orchestration - tracks all agent-to-agent communications
- [eva_audit_log](tables/eva_audit_log.md) - EVA Audit Trail - All actions logged
- [eva_automation_executions](tables/eva_automation_executions.md) - Log of all automation rule executions
- [eva_automation_rules](tables/eva_automation_rules.md) - EVA automation rules for Class A auto-fix and Class B auto-draft actions (SD-EVA-AUTOMATION-001)
- [eva_circuit_breaker](tables/eva_circuit_breaker.md) - EVA Circuit Breaker - Protects ventures from cascading EVA failures. State machine: closed → open → half_open → closed
- [eva_circuit_state_transitions](tables/eva_circuit_state_transitions.md) - Audit log of all EVA circuit breaker state transitions
- [eva_decisions](tables/eva_decisions.md) - EVA Decision Router - Chairman decision tracking
- [eva_events](tables/eva_events.md) - EVA Event Bus - All venture-related events
- [eva_orchestration_sessions](tables/eva_orchestration_sessions.md) - EVA orchestration sessions - tracks multi-agent coordination for ventures and strategic initiatives
- [eva_ventures](tables/eva_ventures.md) - EVA Operating System - Venture tracking with health metrics
- [eva_weekly_review_templates](tables/eva_weekly_review_templates.md) - Templates for automated weekly review generation
- [exec_authorizations](tables/exec_authorizations.md)
- [exec_implementation_sessions](tables/exec_implementation_sessions.md) - Stores results from EXEC Implementation Excellence Orchestrator - systematic implementation tracking and quality assurance
- [exec_quality_checkpoints](tables/exec_quality_checkpoints.md) - Tracks completion of quality checkpoints during EXEC implementation
- [exec_sub_agent_activations](tables/exec_sub_agent_activations.md) - Detailed results from sub-agent activations during EXEC implementation
- [execution_sequences_v2](tables/execution_sequences_v2.md)
- [feedback_events](tables/feedback_events.md) - RLS enabled 2025-10-26 (migration 020) - User feedback events for continuous learning
- [financial_models](tables/financial_models.md) - Venture capital financial models with templates (SaaS, marketplace, etc.)
- [financial_projections](tables/financial_projections.md) - Financial projections for venture models (monthly/quarterly/yearly)
- [financial_scenarios](tables/financial_scenarios.md) - Scenario analysis results (Monte Carlo, sensitivity, etc.)
- [fit_gate_scores](tables/fit_gate_scores.md) - Asset Factory fit gate scoring with multi-criteria evaluation framework
- [folder_structure_snapshot](tables/folder_structure_snapshot.md)
- [gate_requirements_templates](tables/gate_requirements_templates.md) - Templates for generating verification gates with standard requirements
- [github_operations](tables/github_operations.md) - Tracks all GitHub operations initiated by the LEO Protocol GitHub Sub-Agent
- [governance_audit_log](tables/governance_audit_log.md)
- [governance_policies](tables/governance_policies.md)
- [governance_proposals](tables/governance_proposals.md)
- [hap_blocks_v2](tables/hap_blocks_v2.md)
- [import_audit](tables/import_audit.md)
- [intake_submissions](tables/intake_submissions.md) - Asset Factory multi-step intake wizard submissions with version tracking
- [integrity_metrics](tables/integrity_metrics.md)
- [intelligence_analysis](tables/intelligence_analysis.md)
- [intelligence_patterns](tables/intelligence_patterns.md) - Stores learned patterns about project types, complexity factors, and their typical outcomes
- [interaction_history](tables/interaction_history.md) - RLS enabled 2025-10-26 (migration 020) - Complete history of context monitoring interactions
- [key_results](tables/key_results.md) - Measurable outcomes (the KR in OKRs)
- [kr_progress_snapshots](tables/kr_progress_snapshots.md) - Historical tracking of Key Result values
- [lead_evaluations](tables/lead_evaluations.md) - Stores results from LEAD Critical Evaluator framework - mandatory business value assessments
- [learning_configurations](tables/learning_configurations.md) - RLS enabled 2025-10-26 (migration 020) - Adaptive configuration parameters that evolve
- [lifecycle_stage_config](tables/lifecycle_stage_config.md) - 25-stage venture lifecycle configuration. Stage 10 (Strategic Narrative & Positioning)
includes cultural_design_config artifact for venture-based design style selection.
Reference: docs/workflow/stages_v2.yaml
- [llm_models](tables/llm_models.md)
- [llm_providers](tables/llm_providers.md)
- [market_segments](tables/market_segments.md)
- [marketing_content_queue](tables/marketing_content_queue.md)
- [model_usage_log](tables/model_usage_log.md)
- [naming_favorites](tables/naming_favorites.md)
- [naming_suggestions](tables/naming_suggestions.md)
- [nav_preferences](tables/nav_preferences.md)
- [nav_routes](tables/nav_routes.md)
- [objectives](tables/objectives.md) - Qualitative goals (the O in OKRs)
- [operations_audit_log](tables/operations_audit_log.md)
- [opportunities](tables/opportunities.md)
- [opportunity_blueprints](tables/opportunity_blueprints.md)
- [opportunity_categories](tables/opportunity_categories.md)
- [opportunity_scans](tables/opportunity_scans.md) - Tracks AI opportunity discovery scans. Each scan can generate multiple blueprints.
- [opportunity_scores](tables/opportunity_scores.md)
- [opportunity_sources](tables/opportunity_sources.md)
- [orchestration_metrics](tables/orchestration_metrics.md) - Performance analytics for EVA orchestration - tracks efficiency, quality, and resource utilization
- [pattern_subagent_mapping](tables/pattern_subagent_mapping.md)
- [plan_conflict_rules](tables/plan_conflict_rules.md)
- [plan_quality_gates](tables/plan_quality_gates.md) - Tracks completion of quality gates defined during PLAN validation
- [plan_sub_agent_executions](tables/plan_sub_agent_executions.md) - Detailed results from sub-agent executions during PLAN validation
- [plan_subagent_queries](tables/plan_subagent_queries.md)
- [plan_technical_validations](tables/plan_technical_validations.md) - Stores results from PLAN Technical Validation Orchestrator - systematic technical validation and risk assessment
- [plan_verification_results](tables/plan_verification_results.md)
- [portfolios](tables/portfolios.md)
- [pr_metrics](tables/pr_metrics.md)
- [prd_research_audit_log](tables/prd_research_audit_log.md) - Audit log for all knowledge retrieval operations (monitoring and optimization)
- [prd_ui_mappings](tables/prd_ui_mappings.md)
- [prds_backup_20251016](tables/prds_backup_20251016.md)
- [product_requirements_v2](tables/product_requirements_v2.md) - Product Requirements Documents (PRDs) for Strategic Directives. Created by PLAN agent during PLAN_PRD phase. Contains comprehensive implementation specifications: requirements, architecture, testing, risks, and acceptance criteria. One PRD per SD (1:1 relationship via sd_uuid foreign key).
- [profiles](tables/profiles.md)
- [prompt_templates](tables/prompt_templates.md)
- [proposal_approvals](tables/proposal_approvals.md)
- [proposal_notifications](tables/proposal_notifications.md)
- [proposal_state_transitions](tables/proposal_state_transitions.md)
- [protocol_improvement_audit_log](tables/protocol_improvement_audit_log.md) - Audit trail for all protocol improvement actions. Tracks who approved what and when changes were applied.
- [protocol_improvement_queue](tables/protocol_improvement_queue.md) - Queue for protocol improvements extracted from retrospectives. Enforces database-first approach by requiring target_table and payload.
- [quick_fixes](tables/quick_fixes.md) - LEO Quick-Fix Workflow: Lightweight issue tracking for UAT-discovered bugs/polish (≤50 LOC).
   Auto-escalates to full SD if criteria not met.
   Part of LEO Protocol v4.2.1
- [rca_learning_records](tables/rca_learning_records.md) - Normalized learning signals for EVA integration and pattern recognition
- [recursion_events](tables/recursion_events.md)
- [remediation_manifests](tables/remediation_manifests.md) - Corrective and Preventive Action (CAPA) plans linked to root cause reports
- [research_sessions](tables/research_sessions.md)
- [retro_notifications](tables/retro_notifications.md)
- [risk_assessments](tables/risk_assessments.md) - BMAD Enhancement: Multi-domain risk assessment for Strategic Directives
- [root_cause_reports](tables/root_cause_reports.md) - Root cause investigation records for failures, defects, and quality issues across LEO Protocol
- [runtime_audits](tables/runtime_audits.md)
- [scaffold_patterns](tables/scaffold_patterns.md) - Pattern library for AI-driven code generation in Genesis simulations
- [schema_expectations](tables/schema_expectations.md)
- [screen_layouts](tables/screen_layouts.md)
- [sdip_ai_analysis](tables/sdip_ai_analysis.md)
- [sdip_groups](tables/sdip_groups.md) - Manually grouped SDIP submissions for combined analysis
- [sdip_submissions](tables/sdip_submissions.md) - Strategic Directive Initiation Protocol submissions with full validation workflow
- [shipping_decisions](tables/shipping_decisions.md)
- [simulation_sessions](tables/simulation_sessions.md) - Tracks Genesis simulation lifecycle including ephemeral deployments and incineration
- [soul_extractions](tables/soul_extractions.md) - Stores extracted structured requirements from simulations for regeneration gates (Stage 16/17)
- [stage13_assessments](tables/stage13_assessments.md) - EVA-generated exit readiness assessments. SD-STAGE-13-001.
- [stage13_substage_states](tables/stage13_substage_states.md) - Tracks current Stage 13 substage position per venture. SD-STAGE-13-001.
- [stage13_valuations](tables/stage13_valuations.md) - EVA-generated valuation models with confidence scores. SD-STAGE-13-001.
- [stage_data_contracts](tables/stage_data_contracts.md)
- [stage_events](tables/stage_events.md)
- [story_test_mappings](tables/story_test_mappings.md) - Links user stories to test results with traceability
- [strategic_vision](tables/strategic_vision.md) - Top-level organizational vision (2-5 year horizon)
- [sub_agent_execution_batches](tables/sub_agent_execution_batches.md)
- [sub_agent_execution_results](tables/sub_agent_execution_results.md) - Sub-agent execution results with optimized autovacuum settings (5% threshold).
Last performance fix: 2025-11-21 (VACUUM FULL to remove 340 dead rows causing RETRO timeout)
- [sub_agent_execution_results_archive](tables/sub_agent_execution_results_archive.md)
- [sub_agent_executions](tables/sub_agent_executions.md)
- [sub_agent_gate_requirements](tables/sub_agent_gate_requirements.md)
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
- [tech_stack_references](tables/tech_stack_references.md) - Cache for Context7 MCP and retrospective research results with 24-hour TTL
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
- [validation_evidence](tables/validation_evidence.md)
- [venture_archetypes](tables/venture_archetypes.md) - Venture archetype templates for categorizing and styling ventures
- [venture_artifacts](tables/venture_artifacts.md)
- [venture_decisions](tables/venture_decisions.md) - Gate decisions for ventures - created for chairman_unified_decisions VIEW
- [venture_documents](tables/venture_documents.md)
- [venture_drafts](tables/venture_drafts.md)
- [venture_raid_summary](tables/venture_raid_summary.md)
- [venture_stage_transitions](tables/venture_stage_transitions.md)
- [venture_stage_work](tables/venture_stage_work.md)
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
- [workflow_checkpoints](tables/workflow_checkpoints.md) - Stores workflow state checkpoints for recovery
- [workflow_executions](tables/workflow_executions.md)
- [workflow_recovery_state](tables/workflow_recovery_state.md) - Tracks recovery attempts and status

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

**brand_genome_submissions**:
- `previous_version_id` → `brand_genome_submissions.id`

**capital_transactions**:
- `stage_work_id` → `venture_stage_work.id`
- `venture_id` → `ventures.id`

**chairman_approval_requests**:
- `venture_id` → `ventures.id`

**chairman_decisions**:
- `venture_id` → `ventures.id`

**chairman_directives**:
- `issued_by` → `users.id`
- `portfolio_id` → `portfolios.id`
- `venture_id` → `ventures.id`

**chairman_feedback**:
- `company_id` → `companies.id`

**chairman_interests**:
- `user_id` → `users.id`

**chairman_settings**:
- `company_id` → `companies.id`
- `created_by` → `users.id`
- `venture_id` → `ventures.id`

**competitors**:
- `venture_id` → `ventures.id`

**compliance_events**:
- `check_id` → `compliance_checks.id`
- `policy_id` → `compliance_policies.policy_id`

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

**crew_semantic_diffs**:
- `execution_id` → `crewai_flow_executions.id`
- `venture_id` → `ventures.id`

**crewai_flow_executions**:
- `flow_id` → `crewai_flows.id`
- `venture_id` → `ventures.id`

**crewai_flows**:
- `parent_flow_id` → `crewai_flows.id`
- `venture_id` → `ventures.id`

**distribution_history**:
- `channel_id` → `distribution_channels.id`
- `posted_by` → `users.id`
- `queue_item_id` → `marketing_content_queue.id`
- `venture_id` → `ventures.id`

**documentation_inventory**:
- `related_sd_id` → `strategic_directives_v2.id`

**documentation_violations**:
- `related_sd_id` → `strategic_directives_v2.id`

**ehg_design_decisions**:
- `feature_area_id` → `ehg_feature_areas.id`
- `route_id` → `ehg_page_routes.id`

**ehg_feature_areas**:
- `parent_area_id` → `ehg_feature_areas.id`

**ehg_page_routes**:
- `feature_area_id` → `ehg_feature_areas.id`

**eva_actions**:
- `company_id` → `companies.id`
- `session_id` → `eva_orchestration_sessions.session_id`
- `venture_id` → `ventures.id`

**eva_agent_communications**:
- `in_reply_to` → `eva_agent_communications.communication_id`
- `session_id` → `eva_orchestration_sessions.session_id`

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

**eva_events**:
- `eva_venture_id` → `eva_ventures.id`

**eva_orchestration_sessions**:
- `company_id` → `companies.id`

**eva_ventures**:
- `venture_id` → `ventures.id`

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

**feedback_events**:
- `interaction_id` → `interaction_history.id`

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

**governance_proposals**:
- `parent_proposal_id` → `governance_proposals.id`
- `prd_id` → `product_requirements_v2.id`
- `sd_id` → `strategic_directives_v2.id`

**hap_blocks_v2**:
- `execution_sequence_id` → `execution_sequences_v2.id`
- `strategic_directive_id` → `strategic_directives_v2.id`

**intake_submissions**:
- `fit_gate_score_id` → `fit_gate_scores.id`
- `previous_version_id` → `intake_submissions.id`

**intelligence_analysis**:
- `venture_id` → `ventures.id`

**issue_patterns**:
- `first_seen_sd_id` → `strategic_directives_v2.id`
- `last_seen_sd_id` → `strategic_directives_v2.id`

**key_results**:
- `objective_id` → `objectives.id`

**kr_progress_snapshots**:
- `key_result_id` → `key_results.id`

**lead_evaluations**:
- `sd_id` → `strategic_directives_v2.id`

**leo_adrs**:
- `superseded_by` → `leo_adrs.id`

**leo_codebase_validations**:
- `prd_id` → `product_requirements_v2.id`
- `sd_id` → `strategic_directives_v2.id`

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

**leo_mandatory_validations**:
- `sub_agent_code` → `leo_sub_agents.code`

**leo_protocol_changes**:
- `protocol_id` → `leo_protocols.id`

**leo_protocol_file_audit**:
- `sd_id` → `strategic_directives_v2.id`

**leo_protocol_references**:
- `protocol_id` → `leo_protocols.id`

**leo_protocol_sections**:
- `protocol_id` → `leo_protocols.id`

**leo_protocols**:
- `superseded_by` → `leo_protocols.id`

**leo_sub_agent_triggers**:
- `sub_agent_id` → `leo_sub_agents.id`

**leo_subagent_handoffs**:
- `prd_id` → `product_requirements_v2.id`
- `sd_id` → `strategic_directives_v2.id`

**leo_workflow_phases**:
- `protocol_id` → `leo_protocols.id`
- `responsible_agent` → `leo_agents.agent_code`

**llm_models**:
- `provider_id` → `llm_providers.id`

**marketing_content_queue**:
- `created_by` → `users.id`
- `reviewed_by` → `users.id`
- `venture_id` → `ventures.id`

**naming_favorites**:
- `naming_suggestion_id` → `naming_suggestions.id`
- `venture_id` → `ventures.id`

**naming_suggestions**:
- `brand_genome_id` → `brand_genome_submissions.id`
- `venture_id` → `ventures.id`

**objectives**:
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

**portfolios**:
- `company_id` → `companies.id`

**prd_research_audit_log**:
- `sd_id` → `strategic_directives_v2.id`

**product_requirements_v2**:
- `sd_id` → `strategic_directives_v2.id`
- `sd_id` → `strategic_directives_v2.id`

**proposal_approvals**:
- `proposal_id` → `governance_proposals.id`

**proposal_notifications**:
- `proposal_id` → `governance_proposals.id`

**proposal_state_transitions**:
- `proposal_id` → `governance_proposals.id`

**protocol_improvement_audit_log**:
- `improvement_id` → `protocol_improvement_queue.id`

**protocol_improvement_queue**:
- `source_retro_id` → `retrospectives.id`

**quick_fixes**:
- `escalated_to_sd_id` → `strategic_directives_v2.id`

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

**sd_claims**:
- `session_id` → `claude_sessions.session_id`

**sd_contract_exceptions**:
- `sd_id` → `strategic_directives_v2.id`

**sd_contract_violations**:
- `sd_id` → `strategic_directives_v2.id`

**sd_data_contracts**:
- `parent_sd_id` → `strategic_directives_v2.id`

**sd_exec_file_operations**:
- `deliverable_id` → `sd_scope_deliverables.id`
- `sd_id` → `strategic_directives_v2.id`
- `user_story_id` → `user_stories.id`

**sd_execution_actuals**:
- `baseline_id` → `sd_execution_baselines.id`

**sd_execution_baselines**:
- `superseded_by` → `sd_execution_baselines.id`

**sd_key_result_alignment**:
- `key_result_id` → `key_results.id`
- `sd_id` → `strategic_directives_v2.id`

**sd_phase_handoffs**:
- `sd_id` → `strategic_directives_v2.id`

**sd_phase_tracking**:
- `sd_id` → `strategic_directives_v2.id`

**sd_proposals**:
- `created_sd_id` → `strategic_directives_v2.id`
- `venture_id` → `ventures.id`

**sd_scope_deliverables**:
- `checkpoint_sd_id` → `strategic_directives_v2.id`
- `sd_id` → `strategic_directives_v2.id`
- `user_story_id` → `user_stories.id`

**sd_testing_status**:
- `sd_id` → `strategic_directives_v2.id`

**sd_type_change_audit**:
- `sd_id` → `strategic_directives_v2.id`

**sd_ux_contracts**:
- `parent_sd_id` → `strategic_directives_v2.id`

**sdip_ai_analysis**:
- `submission_id` → `directive_submissions.submission_id`

**sdip_submissions**:
- `group_id` → `sdip_groups.id`

**soul_extractions**:
- `simulation_session_id` → `simulation_sessions.id`

**stage13_assessments**:
- `venture_id` → `ventures.id`

**stage13_substage_states**:
- `venture_id` → `ventures.id`

**stage13_valuations**:
- `venture_id` → `ventures.id`

**story_test_mappings**:
- `test_result_id` → `test_results.id`
- `test_run_id` → `test_runs.id`
- `user_story_id` → `user_stories.id`

**strategic_directives_v2**:
- `parent_sd_id` → `strategic_directives_v2.id`

**sub_agent_execution_results**:
- `risk_assessment_id` → `risk_assessments.id`

**sub_agent_executions**:
- `sub_agent_id` → `leo_sub_agents.id`

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

**venture_decisions**:
- `venture_id` → `ventures.id`

**venture_documents**:
- `venture_id` → `ventures.id`

**venture_phase_budgets**:
- `venture_id` → `ventures.id`

**venture_stage_transitions**:
- `venture_id` → `ventures.id`

**venture_stage_work**:
- `sd_id` → `strategic_directives_v2.id`
- `venture_id` → `ventures.id`

**venture_token_budgets**:
- `venture_id` → `ventures.id`

**venture_tool_quotas**:
- `tool_id` → `tool_registry.id`
- `venture_id` → `ventures.id`

**ventures**:
- `archetype` → `archetype_benchmarks.archetype`
- `ceo_agent_id` → `agents.id`
- `company_id` → `companies.id`
- `portfolio_id` → `portfolios.id`

**voice_conversations**:
- `user_id` → `users.id`

**voice_function_calls**:
- `conversation_id` → `voice_conversations.id`

**voice_usage_metrics**:
- `conversation_id` → `voice_conversations.id`

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
