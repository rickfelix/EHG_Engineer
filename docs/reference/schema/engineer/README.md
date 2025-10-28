# Database Schema Documentation

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Tables**: 159

This directory contains comprehensive, auto-generated documentation for all tables in the **EHG_Engineer** Supabase database.

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Quick Start

- **[Database Schema Overview](database-schema-overview.md)** - Quick reference for all tables (15-20KB)
- **[Detailed Table Docs](tables/)** - Individual files for each table (2-5KB each)

---

## All Tables (159)

### LEO Protocol

- [leo_adrs](tables/leo_adrs.md)
- [leo_agents](tables/leo_agents.md)
- [leo_artifacts](tables/leo_artifacts.md)
- [leo_complexity_thresholds](tables/leo_complexity_thresholds.md)
- [leo_gate_reviews](tables/leo_gate_reviews.md)
- [leo_handoff_executions](tables/leo_handoff_executions.md)
- [leo_handoff_rejections](tables/leo_handoff_rejections.md)
- [leo_handoff_templates](tables/leo_handoff_templates.md)
- [leo_interfaces](tables/leo_interfaces.md)
- [leo_nfr_requirements](tables/leo_nfr_requirements.md)
- [leo_protocol_changes](tables/leo_protocol_changes.md)
- [leo_protocol_file_audit](tables/leo_protocol_file_audit.md)
- [leo_protocol_references](tables/leo_protocol_references.md)
- [leo_protocol_sections](tables/leo_protocol_sections.md)
- [leo_protocols](tables/leo_protocols.md)
- [leo_reasoning_sessions](tables/leo_reasoning_sessions.md)
- [leo_reasoning_triggers](tables/leo_reasoning_triggers.md)
- [leo_risk_spikes](tables/leo_risk_spikes.md)
- [leo_subagent_handoffs](tables/leo_subagent_handoffs.md)
- [leo_test_plans](tables/leo_test_plans.md)
- [leo_workflow_phases](tables/leo_workflow_phases.md)

### Strategic Directives

- [cross_sd_utilization](tables/cross_sd_utilization.md)
- [sd_backlog_map](tables/sd_backlog_map.md)
- [sd_business_evaluations](tables/sd_business_evaluations.md)
- [sd_dependency_graph](tables/sd_dependency_graph.md)
- [sd_execution_timeline](tables/sd_execution_timeline.md)
- [sd_overlap_analysis](tables/sd_overlap_analysis.md)
- [sd_phase_handoffs](tables/sd_phase_handoffs.md)
- [sd_phase_tracking](tables/sd_phase_tracking.md)
- [sd_scope_deliverables](tables/sd_scope_deliverables.md)
- [sd_state_transitions](tables/sd_state_transitions.md)
- [sd_testing_status](tables/sd_testing_status.md)
- [strategic_directives_v2](tables/strategic_directives_v2.md)
- [working_sd_sessions](tables/working_sd_sessions.md)

### Retrospectives

- [retrospective_action_items](tables/retrospective_action_items.md)
- [retrospective_insights](tables/retrospective_insights.md)
- [retrospective_learning_links](tables/retrospective_learning_links.md)
- [retrospective_templates](tables/retrospective_templates.md)
- [retrospective_triggers](tables/retrospective_triggers.md)
- [retrospectives](tables/retrospectives.md)

### Handoffs & Phases

- [exec_handoff_preparations](tables/exec_handoff_preparations.md)
- [handoff_validation_rules](tables/handoff_validation_rules.md)
- [handoff_verification_gates](tables/handoff_verification_gates.md)

### Sub-Agents

- [leo_sub_agent_handoffs](tables/leo_sub_agent_handoffs.md)
- [leo_sub_agent_triggers](tables/leo_sub_agent_triggers.md)
- [leo_sub_agents](tables/leo_sub_agents.md)

### Validation & Quality

- [leo_codebase_validations](tables/leo_codebase_validations.md)
- [leo_handoff_validations](tables/leo_handoff_validations.md)
- [leo_mandatory_validations](tables/leo_mandatory_validations.md)
- [leo_validation_rules](tables/leo_validation_rules.md)

### Knowledge & Learning

- [agent_knowledge_base](tables/agent_knowledge_base.md)
- [issue_patterns](tables/issue_patterns.md)

### Other

- [agent_coordination_state](tables/agent_coordination_state.md)
- [agent_events](tables/agent_events.md)
- [agent_execution_cache](tables/agent_execution_cache.md)
- [agent_intelligence_insights](tables/agent_intelligence_insights.md)
- [agent_learning_outcomes](tables/agent_learning_outcomes.md)
- [agent_performance_metrics](tables/agent_performance_metrics.md)
- [agentic_reviews](tables/agentic_reviews.md)
- [backlog_item_completion](tables/backlog_item_completion.md)
- [board_meeting_attendance](tables/board_meeting_attendance.md)
- [board_meetings](tables/board_meetings.md)
- [board_members](tables/board_members.md)
- [compliance_alerts](tables/compliance_alerts.md)
- [component_registry_embeddings](tables/component_registry_embeddings.md)
- [context_embeddings](tables/context_embeddings.md)
- [crewai_flow_executions](tables/crewai_flow_executions.md)
- [crewai_flow_templates](tables/crewai_flow_templates.md)
- [crewai_flows](tables/crewai_flows.md)
- [cross_agent_correlations](tables/cross_agent_correlations.md)
- [defect_taxonomy](tables/defect_taxonomy.md)
- [directive_submissions](tables/directive_submissions.md)
- [documentation_health_checks](tables/documentation_health_checks.md)
- [documentation_inventory](tables/documentation_inventory.md)
- [documentation_templates](tables/documentation_templates.md)
- [documentation_violations](tables/documentation_violations.md)
- [ehg_component_patterns](tables/ehg_component_patterns.md)
- [ehg_design_decisions](tables/ehg_design_decisions.md)
- [ehg_feature_areas](tables/ehg_feature_areas.md)
- [ehg_page_routes](tables/ehg_page_routes.md)
- [ehg_user_workflows](tables/ehg_user_workflows.md)
- [exec_authorizations](tables/exec_authorizations.md)
- [exec_implementation_sessions](tables/exec_implementation_sessions.md)
- [exec_quality_checkpoints](tables/exec_quality_checkpoints.md)
- [exec_sub_agent_activations](tables/exec_sub_agent_activations.md)
- [execution_sequences_v2](tables/execution_sequences_v2.md)
- [feedback_events](tables/feedback_events.md)
- [folder_structure_snapshot](tables/folder_structure_snapshot.md)
- [gate_requirements_templates](tables/gate_requirements_templates.md)
- [github_operations](tables/github_operations.md)
- [governance_audit_log](tables/governance_audit_log.md)
- [governance_proposals](tables/governance_proposals.md)
- [hap_blocks_v2](tables/hap_blocks_v2.md)
- [import_audit](tables/import_audit.md)
- [integrity_metrics](tables/integrity_metrics.md)
- [intelligence_patterns](tables/intelligence_patterns.md)
- [interaction_history](tables/interaction_history.md)
- [lead_evaluations](tables/lead_evaluations.md)
- [learning_configurations](tables/learning_configurations.md)
- [nav_routes](tables/nav_routes.md)
- [operations_audit_log](tables/operations_audit_log.md)
- [opportunities](tables/opportunities.md)
- [opportunity_categories](tables/opportunity_categories.md)
- [opportunity_scores](tables/opportunity_scores.md)
- [opportunity_sources](tables/opportunity_sources.md)
- [plan_conflict_rules](tables/plan_conflict_rules.md)
- [plan_quality_gates](tables/plan_quality_gates.md)
- [plan_sub_agent_executions](tables/plan_sub_agent_executions.md)
- [plan_subagent_queries](tables/plan_subagent_queries.md)
- [plan_technical_validations](tables/plan_technical_validations.md)
- [plan_verification_results](tables/plan_verification_results.md)
- [pr_metrics](tables/pr_metrics.md)
- [prd_research_audit_log](tables/prd_research_audit_log.md)
- [prd_ui_mappings](tables/prd_ui_mappings.md)
- [prds_backup_20251016](tables/prds_backup_20251016.md)
- [product_requirements_v2](tables/product_requirements_v2.md)
- [proposal_approvals](tables/proposal_approvals.md)
- [proposal_notifications](tables/proposal_notifications.md)
- [proposal_state_transitions](tables/proposal_state_transitions.md)
- [rca_learning_records](tables/rca_learning_records.md)
- [remediation_manifests](tables/remediation_manifests.md)
- [retro_notifications](tables/retro_notifications.md)
- [risk_assessments](tables/risk_assessments.md)
- [root_cause_reports](tables/root_cause_reports.md)
- [schema_expectations](tables/schema_expectations.md)
- [sdip_ai_analysis](tables/sdip_ai_analysis.md)
- [sdip_groups](tables/sdip_groups.md)
- [sdip_submissions](tables/sdip_submissions.md)
- [sub_agent_execution_batches](tables/sub_agent_execution_batches.md)
- [sub_agent_execution_results](tables/sub_agent_execution_results.md)
- [sub_agent_executions](tables/sub_agent_executions.md)
- [sub_agent_gate_requirements](tables/sub_agent_gate_requirements.md)
- [subagent_activations](tables/subagent_activations.md)
- [subagent_requirements](tables/subagent_requirements.md)
- [submission_groups](tables/submission_groups.md)
- [submission_screenshots](tables/submission_screenshots.md)
- [submission_steps](tables/submission_steps.md)
- [system_health](tables/system_health.md)
- [tech_stack_references](tables/tech_stack_references.md)
- [test_coverage_policies](tables/test_coverage_policies.md)
- [test_plans](tables/test_plans.md)
- [uat_cases](tables/uat_cases.md)
- [uat_credential_history](tables/uat_credential_history.md)
- [uat_credentials](tables/uat_credentials.md)
- [uat_defects](tables/uat_defects.md)
- [uat_results](tables/uat_results.md)
- [uat_runs](tables/uat_runs.md)
- [uat_test_users](tables/uat_test_users.md)
- [ui_validation_checkpoints](tables/ui_validation_checkpoints.md)
- [ui_validation_results](tables/ui_validation_results.md)
- [user_context_patterns](tables/user_context_patterns.md)
- [user_stories](tables/user_stories.md)
- [validation_evidence](tables/validation_evidence.md)
- [voice_cached_responses](tables/voice_cached_responses.md)
- [voice_conversations](tables/voice_conversations.md)
- [voice_function_calls](tables/voice_function_calls.md)
- [voice_usage_metrics](tables/voice_usage_metrics.md)
- [workflow_checkpoints](tables/workflow_checkpoints.md)
- [workflow_recovery_state](tables/workflow_recovery_state.md)

---

## Regenerating Documentation

```bash
# Generate all documentation
npm run schema:docs

# Generate single table
npm run schema:docs:table users

# Debug mode
npm run schema:docs --verbose
```

Documentation is automatically regenerated:
- After every successful migration (post-migration hook)
- Weekly via CI/CD (GitHub Actions)
- Manually via npm scripts

---

*Auto-generated by: `scripts/generate-schema-docs-from-db.js`*
