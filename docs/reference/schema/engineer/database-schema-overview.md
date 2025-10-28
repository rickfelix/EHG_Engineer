# Database Schema Overview

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Tables**: 159
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
| [agent_coordination_state](tables/agent_coordination_state.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Agent coordination state tracking |
| [agent_events](tables/agent_events.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Agent event log |
| [agent_execution_cache](tables/agent_execution_cache.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Agent execution cache |
| [agent_intelligence_insights](tables/agent_intelligence_insights.md) | 0 | ✅ | 2 | Contains specific learned behaviors and adjustments that agents should make based on historical data |
| [agent_knowledge_base](tables/agent_knowledge_base.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Agent knowledge base |
| [agent_learning_outcomes](tables/agent_learning_outcomes.md) | 0 | ✅ | 2 | Tracks the complete workflow chain from LEAD decision through PLAN validation to EXEC implementation and final business outcomes |
| [agent_performance_metrics](tables/agent_performance_metrics.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Agent performance metrics (from context learning schema) |
| [agentic_reviews](tables/agentic_reviews.md) | 12 | ✅ | 3 | - |
| [backlog_item_completion](tables/backlog_item_completion.md) | 0 | ✅ | 2 | RLS enabled: service_role full access, authenticated read-only |
| [board_meeting_attendance](tables/board_meeting_attendance.md) | 0 | ✅ | 2 | Attendance and voting records for board meetings |
| [board_meetings](tables/board_meetings.md) | 0 | ✅ | 2 | Board meetings with agenda, outcomes, and workflow linkage |
| [board_members](tables/board_members.md) | 7 | ✅ | 2 | Board of Directors members with voting weights and expertise domains |
| [compliance_alerts](tables/compliance_alerts.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Compliance alerts and violations |
| [component_registry_embeddings](tables/component_registry_embeddings.md) | 0 | ✅ | 2 | Component registry with semantic search embeddings for AI-powered recommendations during PRD creation |
| [context_embeddings](tables/context_embeddings.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 020) - Vector embeddings for semantic similarity matching |
| [crewai_flow_executions](tables/crewai_flow_executions.md) | 0 | ✅ | 2 | Execution history and state tracking for workflows |
| [crewai_flow_templates](tables/crewai_flow_templates.md) | 3 | ✅ | 2 | Pre-built workflow templates (official and user-created) |
| [crewai_flows](tables/crewai_flows.md) | 0 | ✅ | 4 | Visual workflow definitions created in React Flow builder, with generated Python code |
| [cross_agent_correlations](tables/cross_agent_correlations.md) | 0 | ✅ | 2 | Tracks how decisions by one agent correlate with outcomes in other agents |
| [cross_sd_utilization](tables/cross_sd_utilization.md) | 0 | ✅ | 2 | Manages cross-SD utilization requests and approvals |
| [defect_taxonomy](tables/defect_taxonomy.md) | 9 | ✅ | 2 | Classification taxonomy for defect categorization and prevention stage mapping |
| [directive_submissions](tables/directive_submissions.md) | 0 | ✅ | 2 | - |
| [documentation_health_checks](tables/documentation_health_checks.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Documentation health check results |
| [documentation_inventory](tables/documentation_inventory.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Documentation inventory |
| [documentation_templates](tables/documentation_templates.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Documentation templates |
| [documentation_violations](tables/documentation_violations.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 021) - Documentation violations |
| [ehg_component_patterns](tables/ehg_component_patterns.md) | 4 | ✅ | 1 | Reusable UI patterns and components |
| [ehg_design_decisions](tables/ehg_design_decisions.md) | 0 | ✅ | 2 | Historical design decisions for learning and consistency |
| [ehg_feature_areas](tables/ehg_feature_areas.md) | 10 | ✅ | 1 | Major feature domains in the EHG application (Ventures, Analytics, etc.) |
| [ehg_page_routes](tables/ehg_page_routes.md) | 8 | ✅ | 1 | All page routes with their purposes and relationships |
| [ehg_user_workflows](tables/ehg_user_workflows.md) | 3 | ✅ | 1 | Documented user journeys through the application |
| [exec_authorizations](tables/exec_authorizations.md) | 0 | ✅ | 2 | - |
| [exec_handoff_preparations](tables/exec_handoff_preparations.md) | 0 | ✅ | 2 | Tracks EXEC→PLAN handoff preparation and delivery |
| [exec_implementation_sessions](tables/exec_implementation_sessions.md) | 0 | ✅ | 2 | Stores results from EXEC Implementation Excellence Orchestrator - systematic implementation tracking and quality assurance |
| [exec_quality_checkpoints](tables/exec_quality_checkpoints.md) | 0 | ✅ | 2 | Tracks completion of quality checkpoints during EXEC implementation |
| [exec_sub_agent_activations](tables/exec_sub_agent_activations.md) | 0 | ✅ | 2 | Detailed results from sub-agent activations during EXEC implementation |
| [execution_sequences_v2](tables/execution_sequences_v2.md) | 0 | ✅ | 2 | - |
| [feedback_events](tables/feedback_events.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 020) - User feedback events for continuous learning |
| [folder_structure_snapshot](tables/folder_structure_snapshot.md) | 0 | ✅ | 2 | - |
| [gate_requirements_templates](tables/gate_requirements_templates.md) | 0 | ✅ | 2 | Templates for generating verification gates with standard requirements |
| [github_operations](tables/github_operations.md) | 0 | ✅ | 2 | Tracks all GitHub operations initiated by the LEO Protocol GitHub Sub-Agent |
| [governance_audit_log](tables/governance_audit_log.md) | 0 | ✅ | 2 | - |
| [governance_proposals](tables/governance_proposals.md) | 0 | ✅ | 2 | - |
| [handoff_validation_rules](tables/handoff_validation_rules.md) | 0 | ✅ | 2 | - |
| [handoff_verification_gates](tables/handoff_verification_gates.md) | 0 | ✅ | 2 | Mandatory verification checkpoints that must pass before handoffs can proceed |
| [hap_blocks_v2](tables/hap_blocks_v2.md) | 0 | ✅ | 2 | - |
| [import_audit](tables/import_audit.md) | 0 | ✅ | 2 | - |
| [integrity_metrics](tables/integrity_metrics.md) | 0 | ✅ | 2 | - |
| [intelligence_patterns](tables/intelligence_patterns.md) | 0 | ✅ | 2 | Stores learned patterns about project types, complexity factors, and their typical outcomes |
| [interaction_history](tables/interaction_history.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 020) - Complete history of context monitoring interactions |
| [issue_patterns](tables/issue_patterns.md) | 11 | ✅ | 3 | Learning history system: stores recurring issues, proven solutions, and success metrics for cross-session knowledge retention |
| [lead_evaluations](tables/lead_evaluations.md) | 0 | ✅ | 2 | Stores results from LEAD Critical Evaluator framework - mandatory business value assessments |
| [learning_configurations](tables/learning_configurations.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 020) - Adaptive configuration parameters that evolve |
| [leo_adrs](tables/leo_adrs.md) | 0 | ✅ | 2 | - |
| [leo_agents](tables/leo_agents.md) | 0 | ✅ | 2 | - |
| [leo_artifacts](tables/leo_artifacts.md) | 0 | ✅ | 2 | - |
| [leo_codebase_validations](tables/leo_codebase_validations.md) | 0 | ✅ | 2 | - |
| [leo_complexity_thresholds](tables/leo_complexity_thresholds.md) | 0 | ✅ | 2 | Configuration for automatic complexity detection and reasoning depth triggers |
| [leo_gate_reviews](tables/leo_gate_reviews.md) | 0 | ✅ | 2 | - |
| [leo_handoff_executions](tables/leo_handoff_executions.md) | 0 | ✅ | 2 | Tracks all LEO Protocol handoff executions with full audit trail. Used by unified-handoff-system.js for workflow orchestration. |
| [leo_handoff_rejections](tables/leo_handoff_rejections.md) | 0 | ✅ | 2 | Tracks rejected handoffs with improvement guidance for LEO Protocol v4.2.0 |
| [leo_handoff_templates](tables/leo_handoff_templates.md) | 0 | ✅ | 2 | - |
| [leo_handoff_validations](tables/leo_handoff_validations.md) | 0 | ✅ | 2 | Stores validation results for handoff executions in LEO Protocol v4.2.0 |
| [leo_interfaces](tables/leo_interfaces.md) | 0 | ✅ | 2 | - |
| [leo_mandatory_validations](tables/leo_mandatory_validations.md) | 0 | ✅ | 2 | - |
| [leo_nfr_requirements](tables/leo_nfr_requirements.md) | 0 | ✅ | 2 | - |
| [leo_protocol_changes](tables/leo_protocol_changes.md) | 0 | ✅ | 2 | - |
| [leo_protocol_file_audit](tables/leo_protocol_file_audit.md) | 0 | ✅ | 2 | - |
| [leo_protocol_references](tables/leo_protocol_references.md) | 0 | ✅ | 2 | - |
| [leo_protocol_sections](tables/leo_protocol_sections.md) | 0 | ✅ | 2 | - |
| [leo_protocols](tables/leo_protocols.md) | 1 | ✅ | 3 | - |
| [leo_reasoning_sessions](tables/leo_reasoning_sessions.md) | 0 | ✅ | 2 | Tracks automatic chain-of-thought reasoning sessions with complexity-based depth selection |
| [leo_reasoning_triggers](tables/leo_reasoning_triggers.md) | 0 | ✅ | 2 | Rules for automatically triggering different reasoning depths based on content analysis |
| [leo_risk_spikes](tables/leo_risk_spikes.md) | 0 | ✅ | 2 | - |
| [leo_sub_agent_handoffs](tables/leo_sub_agent_handoffs.md) | 0 | ✅ | 2 | - |
| [leo_sub_agent_triggers](tables/leo_sub_agent_triggers.md) | 0 | ✅ | 2 | - |
| [leo_sub_agents](tables/leo_sub_agents.md) | 0 | ✅ | 2 | - |
| [leo_subagent_handoffs](tables/leo_subagent_handoffs.md) | 0 | ✅ | 2 | Stores distilled summaries passed between sub-agents |
| [leo_test_plans](tables/leo_test_plans.md) | 0 | ✅ | 2 | - |
| [leo_validation_rules](tables/leo_validation_rules.md) | 0 | ✅ | 2 | - |
| [leo_workflow_phases](tables/leo_workflow_phases.md) | 0 | ✅ | 2 | - |
| [nav_routes](tables/nav_routes.md) | 0 | ✅ | 4 | - |
| [operations_audit_log](tables/operations_audit_log.md) | 0 | ✅ | 2 | - |
| [opportunities](tables/opportunities.md) | 0 | ✅ | 2 | - |
| [opportunity_categories](tables/opportunity_categories.md) | 0 | ✅ | 1 | - |
| [opportunity_scores](tables/opportunity_scores.md) | 0 | ✅ | 1 | - |
| [opportunity_sources](tables/opportunity_sources.md) | 0 | ✅ | 2 | - |
| [plan_conflict_rules](tables/plan_conflict_rules.md) | 0 | ✅ | 2 | - |
| [plan_quality_gates](tables/plan_quality_gates.md) | 0 | ✅ | 2 | Tracks completion of quality gates defined during PLAN validation |
| [plan_sub_agent_executions](tables/plan_sub_agent_executions.md) | 0 | ✅ | 2 | Detailed results from sub-agent executions during PLAN validation |
| [plan_subagent_queries](tables/plan_subagent_queries.md) | 0 | ✅ | 2 | - |
| [plan_technical_validations](tables/plan_technical_validations.md) | 0 | ✅ | 2 | Stores results from PLAN Technical Validation Orchestrator - systematic technical validation and risk assessment |
| [plan_verification_results](tables/plan_verification_results.md) | 0 | ✅ | 2 | - |
| [pr_metrics](tables/pr_metrics.md) | 1 | ✅ | 3 | - |
| [prd_research_audit_log](tables/prd_research_audit_log.md) | 6 | ✅ | 4 | Audit log for all knowledge retrieval operations (monitoring and optimization) |
| [prd_ui_mappings](tables/prd_ui_mappings.md) | 0 | ✅ | 2 | - |
| [prds_backup_20251016](tables/prds_backup_20251016.md) | 0 | ✅ | 2 | - |
| [product_requirements_v2](tables/product_requirements_v2.md) | 0 | ✅ | 2 | Product Requirements Documents (PRDs) for Strategic Directives. Created by PLAN agent during PLAN_PRD phase. Contains comprehensive implementation specifications: requirements, architecture, testing, risks, and acceptance criteria. One PRD per SD (1:1 relationship via sd_uuid foreign key). |
| [proposal_approvals](tables/proposal_approvals.md) | 0 | ✅ | 2 | - |
| [proposal_notifications](tables/proposal_notifications.md) | 0 | ✅ | 2 | - |
| [proposal_state_transitions](tables/proposal_state_transitions.md) | 0 | ✅ | 2 | - |
| [rca_learning_records](tables/rca_learning_records.md) | 1 | ✅ | 3 | Normalized learning signals for EVA integration and pattern recognition |
| [remediation_manifests](tables/remediation_manifests.md) | 1 | ✅ | 4 | Corrective and Preventive Action (CAPA) plans linked to root cause reports |
| [retro_notifications](tables/retro_notifications.md) | 0 | ✅ | 2 | - |
| [retrospective_action_items](tables/retrospective_action_items.md) | 0 | ✅ | 2 | - |
| [retrospective_insights](tables/retrospective_insights.md) | 0 | ✅ | 2 | - |
| [retrospective_learning_links](tables/retrospective_learning_links.md) | 0 | ✅ | 2 | - |
| [retrospective_templates](tables/retrospective_templates.md) | 0 | ✅ | 2 | - |
| [retrospective_triggers](tables/retrospective_triggers.md) | 0 | ✅ | 2 | - |
| [retrospectives](tables/retrospectives.md) | 0 | ✅ | 2 | - |
| [risk_assessments](tables/risk_assessments.md) | 0 | ✅ | 2 | BMAD Enhancement: Multi-domain risk assessment for Strategic Directives |
| [root_cause_reports](tables/root_cause_reports.md) | 3 | ✅ | 4 | Root cause investigation records for failures, defects, and quality issues across LEO Protocol |
| [schema_expectations](tables/schema_expectations.md) | 0 | ✅ | 2 | - |
| [sd_backlog_map](tables/sd_backlog_map.md) | 0 | ✅ | 2 | - |
| [sd_business_evaluations](tables/sd_business_evaluations.md) | 0 | ✅ | 2 | - |
| [sd_dependency_graph](tables/sd_dependency_graph.md) | 0 | ✅ | 2 | Tracks dependencies and relationships between strategic directives |
| [sd_execution_timeline](tables/sd_execution_timeline.md) | 0 | ✅ | 2 | - |
| [sd_overlap_analysis](tables/sd_overlap_analysis.md) | 0 | ✅ | 2 | Stores overlap analysis results between strategic directives |
| [sd_phase_handoffs](tables/sd_phase_handoffs.md) | 440 | ✅ | 8 | DEPRECATED: Use leo_handoff_executions instead. This table is empty (0 records) and was created after leo_handoff_executions (166 records). Kept for backwards compatibility only. Single source of truth: leo_handoff_executions. |
| [sd_phase_tracking](tables/sd_phase_tracking.md) | 0 | ✅ | 2 | Tracks LEO Protocol phase completion for strategic directives |
| [sd_scope_deliverables](tables/sd_scope_deliverables.md) | 0 | ✅ | 2 | Tracks deliverables extracted from SD scope documents to ensure all promises are fulfilled |
| [sd_state_transitions](tables/sd_state_transitions.md) | 0 | ✅ | 2 | - |
| [sd_testing_status](tables/sd_testing_status.md) | 0 | ✅ | 2 | Tracks testing status for Strategic Directives. Prevents duplicate testing and provides work-down plan visualization. |
| [sdip_ai_analysis](tables/sdip_ai_analysis.md) | 0 | ✅ | 2 | - |
| [sdip_groups](tables/sdip_groups.md) | 0 | ✅ | 4 | Manually grouped SDIP submissions for combined analysis |
| [sdip_submissions](tables/sdip_submissions.md) | 0 | ✅ | 4 | Strategic Directive Initiation Protocol submissions with full validation workflow |
| [strategic_directives_v2](tables/strategic_directives_v2.md) | 0 | ✅ | 2 | RLS enabled: service_role full access, authenticated read-only |
| [sub_agent_execution_batches](tables/sub_agent_execution_batches.md) | 0 | ✅ | 2 | - |
| [sub_agent_execution_results](tables/sub_agent_execution_results.md) | 1,506 | ✅ | 3 | Full sub-agent execution reports for compression system |
| [sub_agent_executions](tables/sub_agent_executions.md) | 0 | ✅ | 2 | - |
| [sub_agent_gate_requirements](tables/sub_agent_gate_requirements.md) | 0 | ✅ | 2 | - |
| [subagent_activations](tables/subagent_activations.md) | 0 | ✅ | 2 | - |
| [subagent_requirements](tables/subagent_requirements.md) | 0 | ✅ | 2 | - |
| [submission_groups](tables/submission_groups.md) | 0 | ✅ | 2 | - |
| [submission_screenshots](tables/submission_screenshots.md) | 0 | ✅ | 2 | - |
| [submission_steps](tables/submission_steps.md) | 0 | ✅ | 2 | - |
| [system_health](tables/system_health.md) | 1 | ✅ | 5 | Circuit breaker state machine for external service health monitoring |
| [tech_stack_references](tables/tech_stack_references.md) | 1 | ✅ | 8 | Cache for Context7 MCP and retrospective research results with 24-hour TTL |
| [test_coverage_policies](tables/test_coverage_policies.md) | 0 | ✅ | 2 | LOC-based test coverage policy enforcement for QA sub-agent. SD-QUALITY-002. |
| [test_plans](tables/test_plans.md) | 0 | ✅ | 2 | BMAD Enhancement: Structured test architecture planning for Strategic Directives |
| [uat_cases](tables/uat_cases.md) | 81 | ✅ | 7 | - |
| [uat_credential_history](tables/uat_credential_history.md) | 0 | ✅ | 1 | Audit trail for credential rotations |
| [uat_credentials](tables/uat_credentials.md) | 2 | ✅ | 1 | Stores encrypted test credentials for UAT environments |
| [uat_defects](tables/uat_defects.md) | 0 | ✅ | 5 | - |
| [uat_results](tables/uat_results.md) | 123 | ✅ | 5 | - |
| [uat_runs](tables/uat_runs.md) | 2 | ✅ | 6 | - |
| [uat_test_users](tables/uat_test_users.md) | 0 | ✅ | 1 | Tracks test users created in EHG for UAT testing |
| [ui_validation_checkpoints](tables/ui_validation_checkpoints.md) | 0 | ✅ | 2 | - |
| [ui_validation_results](tables/ui_validation_results.md) | 0 | ✅ | 2 | - |
| [user_context_patterns](tables/user_context_patterns.md) | 0 | ✅ | 2 | RLS enabled 2025-10-26 (migration 020) - Learned patterns of user behavior and context |
| [user_stories](tables/user_stories.md) | 0 | ✅ | 2 | RLS enabled: service_role full access, authenticated read-only |
| [validation_evidence](tables/validation_evidence.md) | 0 | ✅ | 2 | - |
| [voice_cached_responses](tables/voice_cached_responses.md) | 0 | ✅ | 2 | - |
| [voice_conversations](tables/voice_conversations.md) | 0 | ✅ | 3 | - |
| [voice_function_calls](tables/voice_function_calls.md) | 0 | ✅ | 1 | - |
| [voice_usage_metrics](tables/voice_usage_metrics.md) | 0 | ✅ | 1 | - |
| [workflow_checkpoints](tables/workflow_checkpoints.md) | 0 | ✅ | 2 | Stores workflow state checkpoints for recovery |
| [workflow_recovery_state](tables/workflow_recovery_state.md) | 0 | ✅ | 2 | Tracks recovery attempts and status |
| [working_sd_sessions](tables/working_sd_sessions.md) | 0 | ✅ | 2 | - |

## Tables by Category

### LEO Protocol (21 tables)

- [leo_adrs](tables/leo_adrs.md)
- [leo_agents](tables/leo_agents.md)
- [leo_artifacts](tables/leo_artifacts.md)
- [leo_complexity_thresholds](tables/leo_complexity_thresholds.md) - Configuration for automatic complexity detection and reasoning depth triggers
- [leo_gate_reviews](tables/leo_gate_reviews.md)
- [leo_handoff_executions](tables/leo_handoff_executions.md) - Tracks all LEO Protocol handoff executions with full audit trail. Used by unified-handoff-system.js for workflow orchestration.
- [leo_handoff_rejections](tables/leo_handoff_rejections.md) - Tracks rejected handoffs with improvement guidance for LEO Protocol v4.2.0
- [leo_handoff_templates](tables/leo_handoff_templates.md)
- [leo_interfaces](tables/leo_interfaces.md)
- [leo_nfr_requirements](tables/leo_nfr_requirements.md)
- [leo_protocol_changes](tables/leo_protocol_changes.md)
- [leo_protocol_file_audit](tables/leo_protocol_file_audit.md)
- [leo_protocol_references](tables/leo_protocol_references.md)
- [leo_protocol_sections](tables/leo_protocol_sections.md)
- [leo_protocols](tables/leo_protocols.md)
- [leo_reasoning_sessions](tables/leo_reasoning_sessions.md) - Tracks automatic chain-of-thought reasoning sessions with complexity-based depth selection
- [leo_reasoning_triggers](tables/leo_reasoning_triggers.md) - Rules for automatically triggering different reasoning depths based on content analysis
- [leo_risk_spikes](tables/leo_risk_spikes.md)
- [leo_subagent_handoffs](tables/leo_subagent_handoffs.md) - Stores distilled summaries passed between sub-agents
- [leo_test_plans](tables/leo_test_plans.md)
- [leo_workflow_phases](tables/leo_workflow_phases.md)

### Strategic Directives (13 tables)

- [cross_sd_utilization](tables/cross_sd_utilization.md) - Manages cross-SD utilization requests and approvals
- [sd_backlog_map](tables/sd_backlog_map.md)
- [sd_business_evaluations](tables/sd_business_evaluations.md)
- [sd_dependency_graph](tables/sd_dependency_graph.md) - Tracks dependencies and relationships between strategic directives
- [sd_execution_timeline](tables/sd_execution_timeline.md)
- [sd_overlap_analysis](tables/sd_overlap_analysis.md) - Stores overlap analysis results between strategic directives
- [sd_phase_handoffs](tables/sd_phase_handoffs.md) - DEPRECATED: Use leo_handoff_executions instead. This table is empty (0 records) and was created after leo_handoff_executions (166 records). Kept for backwards compatibility only. Single source of truth: leo_handoff_executions.
- [sd_phase_tracking](tables/sd_phase_tracking.md) - Tracks LEO Protocol phase completion for strategic directives
- [sd_scope_deliverables](tables/sd_scope_deliverables.md) - Tracks deliverables extracted from SD scope documents to ensure all promises are fulfilled
- [sd_state_transitions](tables/sd_state_transitions.md)
- [sd_testing_status](tables/sd_testing_status.md) - Tracks testing status for Strategic Directives. Prevents duplicate testing and provides work-down plan visualization.
- [strategic_directives_v2](tables/strategic_directives_v2.md) - RLS enabled: service_role full access, authenticated read-only
- [working_sd_sessions](tables/working_sd_sessions.md)

### Retrospectives (6 tables)

- [retrospective_action_items](tables/retrospective_action_items.md)
- [retrospective_insights](tables/retrospective_insights.md)
- [retrospective_learning_links](tables/retrospective_learning_links.md)
- [retrospective_templates](tables/retrospective_templates.md)
- [retrospective_triggers](tables/retrospective_triggers.md)
- [retrospectives](tables/retrospectives.md)

### Handoffs & Phases (3 tables)

- [exec_handoff_preparations](tables/exec_handoff_preparations.md) - Tracks EXEC→PLAN handoff preparation and delivery
- [handoff_validation_rules](tables/handoff_validation_rules.md)
- [handoff_verification_gates](tables/handoff_verification_gates.md) - Mandatory verification checkpoints that must pass before handoffs can proceed

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

### Other (107 tables)

- [agent_coordination_state](tables/agent_coordination_state.md) - RLS enabled 2025-10-26 (migration 021) - Agent coordination state tracking
- [agent_events](tables/agent_events.md) - RLS enabled 2025-10-26 (migration 021) - Agent event log
- [agent_execution_cache](tables/agent_execution_cache.md) - RLS enabled 2025-10-26 (migration 021) - Agent execution cache
- [agent_intelligence_insights](tables/agent_intelligence_insights.md) - Contains specific learned behaviors and adjustments that agents should make based on historical data
- [agent_learning_outcomes](tables/agent_learning_outcomes.md) - Tracks the complete workflow chain from LEAD decision through PLAN validation to EXEC implementation and final business outcomes
- [agent_performance_metrics](tables/agent_performance_metrics.md) - RLS enabled 2025-10-26 (migration 021) - Agent performance metrics (from context learning schema)
- [agentic_reviews](tables/agentic_reviews.md)
- [backlog_item_completion](tables/backlog_item_completion.md) - RLS enabled: service_role full access, authenticated read-only
- [board_meeting_attendance](tables/board_meeting_attendance.md) - Attendance and voting records for board meetings
- [board_meetings](tables/board_meetings.md) - Board meetings with agenda, outcomes, and workflow linkage
- [board_members](tables/board_members.md) - Board of Directors members with voting weights and expertise domains
- [compliance_alerts](tables/compliance_alerts.md) - RLS enabled 2025-10-26 (migration 021) - Compliance alerts and violations
- [component_registry_embeddings](tables/component_registry_embeddings.md) - Component registry with semantic search embeddings for AI-powered recommendations during PRD creation
- [context_embeddings](tables/context_embeddings.md) - RLS enabled 2025-10-26 (migration 020) - Vector embeddings for semantic similarity matching
- [crewai_flow_executions](tables/crewai_flow_executions.md) - Execution history and state tracking for workflows
- [crewai_flow_templates](tables/crewai_flow_templates.md) - Pre-built workflow templates (official and user-created)
- [crewai_flows](tables/crewai_flows.md) - Visual workflow definitions created in React Flow builder, with generated Python code
- [cross_agent_correlations](tables/cross_agent_correlations.md) - Tracks how decisions by one agent correlate with outcomes in other agents
- [defect_taxonomy](tables/defect_taxonomy.md) - Classification taxonomy for defect categorization and prevention stage mapping
- [directive_submissions](tables/directive_submissions.md)
- [documentation_health_checks](tables/documentation_health_checks.md) - RLS enabled 2025-10-26 (migration 021) - Documentation health check results
- [documentation_inventory](tables/documentation_inventory.md) - RLS enabled 2025-10-26 (migration 021) - Documentation inventory
- [documentation_templates](tables/documentation_templates.md) - RLS enabled 2025-10-26 (migration 021) - Documentation templates
- [documentation_violations](tables/documentation_violations.md) - RLS enabled 2025-10-26 (migration 021) - Documentation violations
- [ehg_component_patterns](tables/ehg_component_patterns.md) - Reusable UI patterns and components
- [ehg_design_decisions](tables/ehg_design_decisions.md) - Historical design decisions for learning and consistency
- [ehg_feature_areas](tables/ehg_feature_areas.md) - Major feature domains in the EHG application (Ventures, Analytics, etc.)
- [ehg_page_routes](tables/ehg_page_routes.md) - All page routes with their purposes and relationships
- [ehg_user_workflows](tables/ehg_user_workflows.md) - Documented user journeys through the application
- [exec_authorizations](tables/exec_authorizations.md)
- [exec_implementation_sessions](tables/exec_implementation_sessions.md) - Stores results from EXEC Implementation Excellence Orchestrator - systematic implementation tracking and quality assurance
- [exec_quality_checkpoints](tables/exec_quality_checkpoints.md) - Tracks completion of quality checkpoints during EXEC implementation
- [exec_sub_agent_activations](tables/exec_sub_agent_activations.md) - Detailed results from sub-agent activations during EXEC implementation
- [execution_sequences_v2](tables/execution_sequences_v2.md)
- [feedback_events](tables/feedback_events.md) - RLS enabled 2025-10-26 (migration 020) - User feedback events for continuous learning
- [folder_structure_snapshot](tables/folder_structure_snapshot.md)
- [gate_requirements_templates](tables/gate_requirements_templates.md) - Templates for generating verification gates with standard requirements
- [github_operations](tables/github_operations.md) - Tracks all GitHub operations initiated by the LEO Protocol GitHub Sub-Agent
- [governance_audit_log](tables/governance_audit_log.md)
- [governance_proposals](tables/governance_proposals.md)
- [hap_blocks_v2](tables/hap_blocks_v2.md)
- [import_audit](tables/import_audit.md)
- [integrity_metrics](tables/integrity_metrics.md)
- [intelligence_patterns](tables/intelligence_patterns.md) - Stores learned patterns about project types, complexity factors, and their typical outcomes
- [interaction_history](tables/interaction_history.md) - RLS enabled 2025-10-26 (migration 020) - Complete history of context monitoring interactions
- [lead_evaluations](tables/lead_evaluations.md) - Stores results from LEAD Critical Evaluator framework - mandatory business value assessments
- [learning_configurations](tables/learning_configurations.md) - RLS enabled 2025-10-26 (migration 020) - Adaptive configuration parameters that evolve
- [nav_routes](tables/nav_routes.md)
- [operations_audit_log](tables/operations_audit_log.md)
- [opportunities](tables/opportunities.md)
- [opportunity_categories](tables/opportunity_categories.md)
- [opportunity_scores](tables/opportunity_scores.md)
- [opportunity_sources](tables/opportunity_sources.md)
- [plan_conflict_rules](tables/plan_conflict_rules.md)
- [plan_quality_gates](tables/plan_quality_gates.md) - Tracks completion of quality gates defined during PLAN validation
- [plan_sub_agent_executions](tables/plan_sub_agent_executions.md) - Detailed results from sub-agent executions during PLAN validation
- [plan_subagent_queries](tables/plan_subagent_queries.md)
- [plan_technical_validations](tables/plan_technical_validations.md) - Stores results from PLAN Technical Validation Orchestrator - systematic technical validation and risk assessment
- [plan_verification_results](tables/plan_verification_results.md)
- [pr_metrics](tables/pr_metrics.md)
- [prd_research_audit_log](tables/prd_research_audit_log.md) - Audit log for all knowledge retrieval operations (monitoring and optimization)
- [prd_ui_mappings](tables/prd_ui_mappings.md)
- [prds_backup_20251016](tables/prds_backup_20251016.md)
- [product_requirements_v2](tables/product_requirements_v2.md) - Product Requirements Documents (PRDs) for Strategic Directives. Created by PLAN agent during PLAN_PRD phase. Contains comprehensive implementation specifications: requirements, architecture, testing, risks, and acceptance criteria. One PRD per SD (1:1 relationship via sd_uuid foreign key).
- [proposal_approvals](tables/proposal_approvals.md)
- [proposal_notifications](tables/proposal_notifications.md)
- [proposal_state_transitions](tables/proposal_state_transitions.md)
- [rca_learning_records](tables/rca_learning_records.md) - Normalized learning signals for EVA integration and pattern recognition
- [remediation_manifests](tables/remediation_manifests.md) - Corrective and Preventive Action (CAPA) plans linked to root cause reports
- [retro_notifications](tables/retro_notifications.md)
- [risk_assessments](tables/risk_assessments.md) - BMAD Enhancement: Multi-domain risk assessment for Strategic Directives
- [root_cause_reports](tables/root_cause_reports.md) - Root cause investigation records for failures, defects, and quality issues across LEO Protocol
- [schema_expectations](tables/schema_expectations.md)
- [sdip_ai_analysis](tables/sdip_ai_analysis.md)
- [sdip_groups](tables/sdip_groups.md) - Manually grouped SDIP submissions for combined analysis
- [sdip_submissions](tables/sdip_submissions.md) - Strategic Directive Initiation Protocol submissions with full validation workflow
- [sub_agent_execution_batches](tables/sub_agent_execution_batches.md)
- [sub_agent_execution_results](tables/sub_agent_execution_results.md) - Full sub-agent execution reports for compression system
- [sub_agent_executions](tables/sub_agent_executions.md)
- [sub_agent_gate_requirements](tables/sub_agent_gate_requirements.md)
- [subagent_activations](tables/subagent_activations.md)
- [subagent_requirements](tables/subagent_requirements.md)
- [submission_groups](tables/submission_groups.md)
- [submission_screenshots](tables/submission_screenshots.md)
- [submission_steps](tables/submission_steps.md)
- [system_health](tables/system_health.md) - Circuit breaker state machine for external service health monitoring
- [tech_stack_references](tables/tech_stack_references.md) - Cache for Context7 MCP and retrospective research results with 24-hour TTL
- [test_coverage_policies](tables/test_coverage_policies.md) - LOC-based test coverage policy enforcement for QA sub-agent. SD-QUALITY-002.
- [test_plans](tables/test_plans.md) - BMAD Enhancement: Structured test architecture planning for Strategic Directives
- [uat_cases](tables/uat_cases.md)
- [uat_credential_history](tables/uat_credential_history.md) - Audit trail for credential rotations
- [uat_credentials](tables/uat_credentials.md) - Stores encrypted test credentials for UAT environments
- [uat_defects](tables/uat_defects.md)
- [uat_results](tables/uat_results.md)
- [uat_runs](tables/uat_runs.md)
- [uat_test_users](tables/uat_test_users.md) - Tracks test users created in EHG for UAT testing
- [ui_validation_checkpoints](tables/ui_validation_checkpoints.md)
- [ui_validation_results](tables/ui_validation_results.md)
- [user_context_patterns](tables/user_context_patterns.md) - RLS enabled 2025-10-26 (migration 020) - Learned patterns of user behavior and context
- [user_stories](tables/user_stories.md) - RLS enabled: service_role full access, authenticated read-only
- [validation_evidence](tables/validation_evidence.md)
- [voice_cached_responses](tables/voice_cached_responses.md)
- [voice_conversations](tables/voice_conversations.md)
- [voice_function_calls](tables/voice_function_calls.md)
- [voice_usage_metrics](tables/voice_usage_metrics.md)
- [workflow_checkpoints](tables/workflow_checkpoints.md) - Stores workflow state checkpoints for recovery
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

**agent_learning_outcomes**:
- `sd_id` → `strategic_directives_v2.id`

**board_meeting_attendance**:
- `board_member_id` → `board_members.id`
- `meeting_id` → `board_meetings.id`

**context_embeddings**:
- `interaction_id` → `interaction_history.id`

**crewai_flow_executions**:
- `flow_id` → `crewai_flows.id`

**crewai_flows**:
- `parent_flow_id` → `crewai_flows.id`

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

**governance_proposals**:
- `parent_proposal_id` → `governance_proposals.id`
- `prd_id` → `product_requirements_v2.id`
- `sd_id` → `strategic_directives_v2.id`

**hap_blocks_v2**:
- `execution_sequence_id` → `execution_sequences_v2.id`
- `strategic_directive_id` → `strategic_directives_v2.id`

**issue_patterns**:
- `first_seen_sd_id` → `strategic_directives_v2.id`
- `last_seen_sd_id` → `strategic_directives_v2.id`

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

**opportunities**:
- `master_opportunity_id` → `opportunities.id`
- `source_id` → `opportunity_sources.id`

**opportunity_categories**:
- `opportunity_id` → `opportunities.id`

**opportunity_scores**:
- `opportunity_id` → `opportunities.id`

**plan_quality_gates**:
- `sd_id` → `strategic_directives_v2.id`
- `validation_id` → `plan_technical_validations.id`

**plan_sub_agent_executions**:
- `sd_id` → `strategic_directives_v2.id`
- `validation_id` → `plan_technical_validations.id`

**plan_technical_validations**:
- `sd_id` → `strategic_directives_v2.id`

**prd_research_audit_log**:
- `sd_id` → `strategic_directives_v2.id`

**product_requirements_v2**:
- `sd_uuid` → `strategic_directives_v2.uuid_id`
- `sd_id` → `strategic_directives_v2.id`

**proposal_approvals**:
- `proposal_id` → `governance_proposals.id`

**proposal_notifications**:
- `proposal_id` → `governance_proposals.id`

**proposal_state_transitions**:
- `proposal_id` → `governance_proposals.id`

**rca_learning_records**:
- `rcr_id` → `root_cause_reports.id`

**remediation_manifests**:
- `rcr_id` → `root_cause_reports.id`

**retrospective_action_items**:
- `retrospective_id` → `retrospectives.id`

**retrospective_insights**:
- `retrospective_id` → `retrospectives.id`

**retrospective_learning_links**:
- `retrospective_id` → `retrospectives.id`

**retrospective_triggers**:
- `template_id` → `retrospective_templates.id`

**retrospectives**:
- `sd_id` → `strategic_directives_v2.id`

**risk_assessments**:
- `sd_id` → `strategic_directives_v2.id`

**root_cause_reports**:
- `prd_id` → `product_requirements_v2.id`
- `sd_id` → `strategic_directives_v2.id`

**sd_backlog_map**:
- `sd_id` → `strategic_directives_v2.id`

**sd_business_evaluations**:
- `sd_id` → `strategic_directives_v2.id`

**sd_phase_handoffs**:
- `sd_id` → `strategic_directives_v2.id`

**sd_phase_tracking**:
- `sd_id` → `strategic_directives_v2.id`

**sd_scope_deliverables**:
- `sd_id` → `strategic_directives_v2.id`

**sd_testing_status**:
- `sd_id` → `strategic_directives_v2.id`

**sdip_ai_analysis**:
- `submission_id` → `directive_submissions.submission_id`

**sdip_submissions**:
- `group_id` → `sdip_groups.id`

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

**submission_screenshots**:
- `submission_id` → `directive_submissions.submission_id`

**submission_steps**:
- `submission_id` → `directive_submissions.submission_id`

**tech_stack_references**:
- `sd_id` → `strategic_directives_v2.id`

**test_plans**:
- `prd_id` → `product_requirements_v2.id`
- `sd_id` → `strategic_directives_v2.id`

**uat_defects**:
- `case_id` → `uat_cases.id`
- `run_id` → `uat_runs.id`

**uat_results**:
- `case_id` → `uat_cases.id`
- `run_id` → `uat_runs.id`

**uat_runs**:
- `active_case_id` → `uat_cases.id`

**user_stories**:
- `prd_id` → `product_requirements_v2.id`
- `sd_id` → `strategic_directives_v2.id`

**validation_evidence**:
- `validation_id` → `ui_validation_results.id`

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
