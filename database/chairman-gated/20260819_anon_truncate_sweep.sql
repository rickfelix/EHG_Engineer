-- SD-LEO-INFRA-ANON-TRUNCATE-SWEEP-001 (FR-2)
-- @approved-by: <chairman fills in before apply -- ceremony ref QF-20260803-856>
--
-- WHAT: revokes anon's TRUNCATE grant on 760 ordinary tables (relkind='r', owned by
-- postgres) where anon currently holds it -- a Supabase default GRANT ALL artifact. RLS cannot gate
-- TRUNCATE at all, so this is the only mechanism that closes it. Live-enumerated
-- 2026-08-19T01:46:30.529Z via pg_catalog aclexplode() (NOT information_schema.role_table_grants,
-- which is role-filtered and returns different results under different connecting identities -- see
-- PRD FR-1 for the full measured rationale). Views (170, TRUNCATE structurally inapplicable) and 3
-- storage.* tables (owned by supabase_storage_admin -- a REVOKE from this session would report
-- success and silently change nothing) are excluded BY MECHANISM (owner check), not by this list
-- happening to omit them.
--
-- THIS IS A SINGLE FILE BY DESIGN (reversed from an earlier <=50-relations-per-file batching plan).
-- "REVOKE takes AccessExclusiveLock" did not reproduce under live pg_locks measurement -- REVOKE only
-- takes RowExclusiveLock on pg_class (catalog-only; RangeVarGetRelid with NoLock). The codebase's own
-- precedent already stages far larger single files (302 statements in
-- 20260317_rls_tighten_phase1.sql; 155 in 20260317_security_definer_audit.sql) with no batching.
--
-- NEVER APPLIED BY THE BUILDER. The chairman applies by hand per the QF-20260803-856 ceremony
-- checklist (path fence -> @approved-by matching git user.email -> git-committed ->
-- MIGRATION_APPLY_TOKEN -> post-conditions). SET LOCAL lock_timeout is kept as house convention
-- (protects against contention on the shared pg_class catalog relation during this transaction, not
-- against a lock on the 760 target relations, which REVOKE does not take).
--
-- Rollback: 20260819_anon_truncate_sweep_DOWN.sql (grant-precise -- re-grants exactly TRUNCATE,
-- never a broader GRANT ALL).
--
-- Enumeration artifact: anon-truncate-sweep-enumeration.json (committed alongside this file).

BEGIN;

SET LOCAL lock_timeout = '5s';

-- Baseline capture, BEFORE any REVOKE runs. The anon TRUNCATE-holding population is heterogeneous
-- (2 distinct ACL signatures measured at PLAN phase) -- NOT every relation holds the same set of
-- other privileges (EXEC-phase discovery: an early draft of this post-condition assumed a uniform
-- 7-privilege baseline and 9 relations genuinely failed that assumption, a false positive). The
-- correct check is a per-relation BEFORE/AFTER diff of the actual privilege set, not an assumed
-- fixed set -- this temp table is that "before" snapshot.
CREATE TEMP TABLE _sweep_baseline AS
SELECT rel::text AS rel_text, rel,
       (SELECT array_agg(a.privilege_type ORDER BY a.privilege_type)
        FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid = rel), acldefault('r', (SELECT relowner FROM pg_class WHERE oid = rel)))) a
        JOIN pg_roles r ON r.oid = a.grantee
        WHERE r.rolname = 'anon') AS anon_privs
FROM unnest(ARRAY[
  'public.activation_catalog_expectations',
    'public.activity_logs',
    'public.adam_adherence_ledger',
    'public.adam_delegated_apply_ledger',
    'public.adam_task_ledger',
    'public.adherence_rubrics',
    'public.advisory_checkpoints',
    'public.aegis_constitutions',
    'public.aegis_rules',
    'public.aegis_violations',
    'public.agent_artifacts',
    'public.agent_avatars',
    'public.agent_coordination_state',
    'public.agent_departments',
    'public.agent_events',
    'public.agent_execution_cache',
    'public.agent_intelligence_insights',
    'public.agent_knowledge_base',
    'public.agent_learning_outcomes',
    'public.agent_memory_stores',
    'public.agent_messages',
    'public.agent_performance_metrics',
    'public.agent_registry',
    'public.agent_relationships',
    'public.agent_task_contracts',
    'public.agentic_reviews',
    'public.agents',
    'public.ai_gen_dwell_tracking',
    'public.ai_gen_provenance',
    'public.ai_quality_assessments',
    'public.anthropic_plugin_registry',
    'public.apa_standing_assessments',
    'public.app_config',
    'public.archetype_benchmarks',
    'public.archetype_profile_interactions',
    'public.architectural_prevention_findings',
    'public.assumption_sets',
    'public.audit_finding_sd_links',
    'public.audit_finding_sd_mapping',
    'public.audit_triangulation_log',
    'public.auto_apply_allowlist',
    'public.auto_apply_denylist',
    'public.backlog_item_completion',
    'public.batch_operation_log',
    'public.blueprint_board_submissions',
    'public.blueprint_quality_assessments',
    'public.blueprint_selection_signals',
    'public.blueprint_templates',
    'public.board_meeting_attendance',
    'public.board_meetings',
    'public.board_members',
    'public.brainstorm_question_effectiveness',
    'public.brainstorm_question_interactions',
    'public.brainstorm_sessions',
    'public.brainstorm_vote_tallies',
    'public.brand_genome_submissions',
    'public.brand_variants',
    'public.build_completion_forecast_log',
    'public.bypass_ledger',
    'public.campaign_content',
    'public.campaign_enrollments',
    'public.capability_reuse_log',
    'public.capacity_limit_events',
    'public.capital_transactions',
    'public.capital_transactions_preimg_qparity20260610',
    'public.cascade_invalidation_flags',
    'public.cascade_invalidation_log',
    'public.cascade_watcher_heartbeats',
    'public.chairman_approval_requests',
    'public.chairman_constraints',
    'public.chairman_constraints_proposals',
    'public.chairman_dashboard_config',
    'public.chairman_decisions',
    'public.chairman_directives',
    'public.chairman_feedback',
    'public.chairman_interests',
    'public.chairman_notifications',
    'public.chairman_overrides',
    'public.chairman_preferences',
    'public.chairman_settings',
    'public.chairman_stepup_tokens',
    'public.chairman_switchon_policy',
    'public.chairman_webauthn_challenges',
    'public.chairman_webauthn_credentials',
    'public.channel_budgets',
    'public.ci_snapshots',
    'public.circuit_breaker_blocks',
    'public.claim_rejects',
    'public.claude_code_releases',
    'public.cleanup_orchestration_state',
    'public.client_error_events',
    'public.codebase_health_config',
    'public.codebase_health_snapshots',
    'public.codebase_semantic_index',
    'public.companies',
    'public.competitive_baselines',
    'public.competitor_intelligence',
    'public.competitors',
    'public.compliance_alerts',
    'public.compliance_artifact_templates',
    'public.compliance_checklist_items',
    'public.compliance_checklists',
    'public.compliance_checks',
    'public.compliance_events',
    'public.compliance_gate_events',
    'public.compliance_policies',
    'public.compliance_violations',
    'public.component_registry_embeddings',
    'public.constitutional_amendments',
    'public.content_types',
    'public.context_embeddings',
    'public.context_usage_daily',
    'public.context_usage_log',
    'public.continuous_execution_log',
    'public.contract_chain_links',
    'public.convergence_ledger_runs',
    'public.convergence_ledger_stages',
    'public.conversion_ledger',
    'public.coordinator_follow_ons',
    'public.coordinator_role_history',
    'public.cost_governor_log',
    'public.council_adjudications',
    'public.counterfactual_scores',
    'public.coverage_matrix',
    'public.coverage_matrix_rotation_runs',
    'public.creative_assets',
    'public.crm_contact_venture_access',
    'public.crm_contacts',
    'public.crm_inbound_events',
    'public.crm_orgs',
    'public.crm_pipeline_cases',
    'public.crm_pipeline_stage_defs',
    'public.crm_pipeline_stage_edges',
    'public.crm_pipeline_transitions',
    'public.cron_run_locks',
    'public.cross_agent_correlations',
    'public.cross_sd_utilization',
    'public.cultural_design_styles',
    'public.customer_personas',
    'public.daily_rollups',
    'public.db_agent_config',
    'public.db_agent_invocations',
    'public.debate_arguments',
    'public.debate_circuit_breaker',
    'public.debate_sessions',
    'public.defect_taxonomy',
    'public.department_agents',
    'public.department_capabilities',
    'public.department_messages',
    'public.departments',
    'public.design_pattern_usage',
    'public.design_quality_scores',
    'public.directive_submissions',
    'public.discovery_strategies',
    'public.distribution_channels',
    'public.distribution_history',
    'public.doctrine_constraint_violations',
    'public.document_section_schemas',
    'public.documentation_health_checks',
    'public.documentation_inventory',
    'public.documentation_templates',
    'public.documentation_violations',
    'public.domain_knowledge',
    'public.door_routing_ledger',
    'public.ehg_alerts',
    'public.ehg_component_patterns',
    'public.ehg_design_decisions',
    'public.ehg_feature_areas',
    'public.ehg_page_routes',
    'public.ehg_services',
    'public.ehg_user_workflows',
    'public.ehg_wiki_sections',
    'public.enhancement_proposal_audit',
    'public.enhancement_proposals',
    'public.eva_actions',
    'public.eva_agent_communications',
    'public.eva_architecture_decisions',
    'public.eva_architecture_plans',
    'public.eva_artifact_dependencies',
    'public.eva_audit_log',
    'public.eva_audit_log_preimg_qparity20260610',
    'public.eva_automation_executions',
    'public.eva_automation_executions_qparity20260610',
    'public.eva_automation_rules',
    'public.eva_cascade_errors',
    'public.eva_chat_conversations',
    'public.eva_chat_messages',
    'public.eva_circuit_breaker',
    'public.eva_circuit_state_transitions',
    'public.eva_claude_code_intake',
    'public.eva_config',
    'public.eva_consultant_digests',
    'public.eva_consultant_recommendations',
    'public.eva_consultant_snapshots',
    'public.eva_consultant_trends',
    'public.eva_decisions',
    'public.eva_decisions_qparity20260610',
    'public.eva_event_ledger',
    'public.eva_event_log',
    'public.eva_event_schemas',
    'public.eva_events',
    'public.eva_events_dlq',
    'public.eva_events_qparity20260610',
    'public.eva_friday_decisions',
    'public.eva_friday_meeting_agenda',
    'public.eva_friday_meetings',
    'public.eva_friday_outcomes',
    'public.eva_idea_categories',
    'public.eva_orchestration_sessions',
    'public.eva_preferences',
    'public.eva_saga_log',
    'public.eva_scheduler_heartbeat',
    'public.eva_scheduler_metrics',
    'public.eva_scheduler_metrics_qparity20260610',
    'public.eva_scheduler_queue',
    'public.eva_scheduler_queue_qparity20260610',
    'public.eva_source_health',
    'public.eva_stage_gate_results',
    'public.eva_stage_gate_results_qparity20260610',
    'public.eva_support_decision_log',
    'public.eva_support_research_cache',
    'public.eva_sync_state',
    'public.eva_todoist_intake',
    'public.eva_trace_log',
    'public.eva_translation_gates',
    'public.eva_updates',
    'public.eva_ventures',
    'public.eva_ventures_qparity20260610',
    'public.eva_vision_documents',
    'public.eva_vision_gaps',
    'public.eva_vision_iterations',
    'public.eva_vision_scores',
    'public.eva_weekly_review_templates',
    'public.eva_youtube_config',
    'public.eva_youtube_intake',
    'public.eva_youtube_scans',
    'public.eva_youtube_scores',
    'public.evaluation_profile_outcomes',
    'public.evaluation_profiles',
    'public.exec_authorizations',
    'public.exec_handoff_preparations',
    'public.exec_implementation_sessions',
    'public.exec_quality_checkpoints',
    'public.exec_sub_agent_activations',
    'public.execute_teams',
    'public.execution_sequences_v2',
    'public.exit_playbooks',
    'public.experiment_assignments',
    'public.experiment_outcomes',
    'public.experiments',
    'public.fable_suitability_map',
    'public.factory_guardrail_state_qparity20260610',
    'public.failure_patterns',
    'public.feedback',
    'public.feedback_events',
    'public.feedback_quality_config',
    'public.feedback_sd_map',
    'public.file_claim_locks',
    'public.financial_models',
    'public.financial_projections',
    'public.financial_scenarios',
    'public.fit_gate_scores',
    'public.fleet_desired_slots',
    'public.fleet_liveness_estimates',
    'public.fleet_worker_pulse',
    'public.folder_structure_snapshot',
    'public.forecast_ledger',
    'public.forecast_records',
    'public.gap_analysis_results',
    'public.gate_boundary_config',
    'public.gate_boundary_config_audit',
    'public.gate_requirements_templates',
    'public.gate_witness_events',
    'public.gate_witness_registry',
    'public.gauge_finding_dispositions',
    'public.genesis_deployments',
    'public.genesis_tier_config',
    'public.github_operations',
    'public.global_competitors',
    'public.goal_evaluator_verdicts',
    'public.governance_audit_log',
    'public.governance_decisions',
    'public.governance_policies',
    'public.governance_probe_registry',
    'public.governance_proposals',
    'public.governed_change_proposals',
    'public.grill_convergence_artifacts',
    'public.grill_fixtures',
    'public.gvos_adherence_logs',
    'public.gvos_archetypes',
    'public.gvos_prompt_rubrics',
    'public.gvos_token_versions',
    'public.gvos_tokens',
    'public.handoff_audit_log',
    'public.handoff_validation_rules',
    'public.handoff_verification_gates',
    'public.hap_blocks_v2',
    'public.hold_state_contract_violations',
    'public.import_audit',
    'public.improvement_quality_assessments',
    'public.intake_submissions',
    'public.integration_config',
    'public.integration_verification_records',
    'public.integrity_metrics',
    'public.intelligence_analysis',
    'public.intelligence_patterns',
    'public.interaction_history',
    'public.issue_patterns',
    'public.judge_verdicts',
    'public.key_results',
    'public.kr_progress_snapshots',
    'public.launch_mode_audit',
    'public.lead_evaluations',
    'public.learning_configurations',
    'public.learning_decisions',
    'public.learning_inbox',
    'public.legal_processes',
    'public.legal_templates',
    'public.leo_adrs',
    'public.leo_agents',
    'public.leo_artifacts',
    'public.leo_audit_checklists',
    'public.leo_audit_config',
    'public.leo_auto_exec_audit',
    'public.leo_auto_exec_forbidden',
    'public.leo_auto_exec_policy',
    'public.leo_autonomous_directives',
    'public.leo_codebase_validations',
    'public.leo_complexity_thresholds',
    'public.leo_effort_policies',
    'public.leo_error_log',
    'public.leo_events',
    'public.leo_execution_jobs',
    'public.leo_feature_flag_approvals',
    'public.leo_feature_flag_audit',
    'public.leo_feature_flag_policies',
    'public.leo_feature_flags',
    'public.leo_feedback',
    'public.leo_gate_reviews',
    'public.leo_handoff_executions',
    'public.leo_handoff_rejections',
    'public.leo_handoff_templates',
    'public.leo_handoff_validations',
    'public.leo_integration_contracts',
    'public.leo_integration_verification_results',
    'public.leo_interfaces',
    'public.leo_kb_generation_log',
    'public.leo_kill_switches',
    'public.leo_mandatory_validations',
    'public.leo_nfr_requirements',
    'public.leo_planner_rankings',
    'public.leo_prioritization_config',
    'public.leo_process_scripts',
    'public.leo_prompts',
    'public.leo_proposal_transitions',
    'public.leo_proposals',
    'public.leo_protocol_changes',
    'public.leo_protocol_file_audit',
    'public.leo_protocol_references',
    'public.leo_protocol_sections',
    'public.leo_protocols',
    'public.leo_reasoning_sessions',
    'public.leo_reasoning_triggers',
    'public.leo_risk_spikes',
    'public.leo_schema_constraints',
    'public.leo_scoring_prioritization_config',
    'public.leo_scoring_rubrics',
    'public.leo_settings',
    'public.leo_simplification_rules',
    'public.leo_sub_agent_triggers',
    'public.leo_sub_agents',
    'public.leo_subagent_handoffs',
    'public.leo_test_plans',
    'public.leo_validation_rules',
    'public.leo_vetting_outcomes',
    'public.leo_vetting_rubrics',
    'public.leo_wiring_validations',
    'public.leo_workflow_phases',
    'public.lifecycle_phases',
    'public.llm_models',
    'public.llm_providers',
    'public.loop_registry',
    'public.management_reviews',
    'public.market_segments',
    'public.market_signal_observations',
    'public.market_signal_scanner_budget',
    'public.marketing_attribution',
    'public.marketing_campaigns',
    'public.marketing_channels',
    'public.marketing_content',
    'public.marketing_content_queue',
    'public.marketing_content_variants',
    'public.marketing_feedback_cycles',
    'public.marketing_pipeline_runs',
    'public.mental_model_applications',
    'public.mental_model_archetype_affinity',
    'public.mental_model_effectiveness',
    'public.mental_models',
    'public.merge_witness_telemetry',
    'public.missions',
    'public.model_capability_reference',
    'public.modeling_requests',
    'public.monthly_ceo_reports',
    'public.naming_favorites',
    'public.naming_suggestions',
    'public.nav_preferences',
    'public.nav_routes',
    'public.north_star',
    'public.nursery_evaluation_log',
    'public.objectives',
    'public.okr_alignments',
    'public.okr_generation_log',
    'public.okr_snapshots',
    'public.okr_vision_alignment_records',
    'public.operations_audit_log',
    'public.opportunities',
    'public.opportunity_blueprints',
    'public.opportunity_categories',
    'public.opportunity_scans',
    'public.opportunity_scores',
    'public.opportunity_sources',
    'public.ops_agent_health',
    'public.ops_customer_health_scores',
    'public.ops_friday_scorecards',
    'public.ops_health_alerts',
    'public.ops_payment_events',
    'public.ops_product_health',
    'public.ops_quarterly_assessments',
    'public.ops_revenue_alerts',
    'public.ops_revenue_metrics',
    'public.orchestration_metrics',
    'public.pattern_improvements',
    'public.pattern_occurrences',
    'public.pattern_resolution_signals',
    'public.pattern_subagent_mapping',
    'public.pcvp_verification_log',
    'public.pending_ceo_handoffs',
    'public.periodic_process_registry',
    'public.persona_behavioral_data',
    'public.pipeline_metrics',
    'public.plan_conflict_rules',
    'public.plan_critiques',
    'public.plan_quality_gates',
    'public.plan_sub_agent_executions',
    'public.plan_subagent_queries',
    'public.plan_technical_validations',
    'public.plan_verification_results',
    'public.pocock_adrs',
    'public.pocock_glossary_terms',
    'public.pocock_oos_findings',
    'public.policy_audit_log',
    'public.portfolio_allocation_policies',
    'public.portfolio_profile_allocations',
    'public.portfolios',
    'public.post_build_verdicts',
    'public.postmortem_pattern_links',
    'public.pr_metrics',
    'public.prd_research_audit_log',
    'public.prd_ui_mappings',
    'public.product_hunt_cache',
    'public.product_requirements_v2',
    'public.profiles',
    'public.prompt_templates',
    'public.proposal_approvals',
    'public.proposal_debate_rounds',
    'public.proposal_debates',
    'public.proposal_notifications',
    'public.proposal_state_transitions',
    'public.protected_resources',
    'public.protocol_constitution',
    'public.protocol_improvement_audit_log',
    'public.protocol_improvement_queue',
    'public.public_portfolio',
    'public.quarantine_meta_qparity20260610',
    'public.quick_fixes',
    'public.raid_log',
    'public.rca_auto_trigger_config',
    'public.rca_learning_records',
    'public.rd_batch_runs',
    'public.rd_proposals',
    'public.recursion_events',
    'public.releases',
    'public.remediation_manifests',
    'public.research_intelligence_reference',
    'public.research_sessions',
    'public.retro_notifications',
    'public.retrospective_action_items',
    'public.retrospective_contributions',
    'public.retrospective_insights',
    'public.retrospective_learning_links',
    'public.retrospective_templates',
    'public.retrospective_triggers',
    'public.retrospectives',
    'public.retrospectives_audit',
    'public.risk_assessments',
    'public.risk_escalation_log',
    'public.risk_forecasts',
    'public.risk_gate_passage_log',
    'public.risk_recalibration_forms',
    'public.risk_templates',
    'public.roadmap_baseline_snapshots',
    'public.roadmap_wave_items',
    'public.roadmap_waves',
    'public.role_drain_sets',
    'public.root_cause_reports',
    'public.runtime_audits',
    'public.scaffold_patterns',
    'public.schema_expectations',
    'public.schema_migrations',
    'public.schema_migrations_applied',
    'public.scope_completion_chain',
    'public.screen_layouts',
    'public.sd_backlog_map',
    'public.sd_baseline_issues',
    'public.sd_baseline_items_purge_backup_20260609',
    'public.sd_baseline_items_recon_backup',
    'public.sd_baseline_rationale',
    'public.sd_business_evaluations',
    'public.sd_capabilities',
    'public.sd_checkpoint_history',
    'public.sd_contract_exceptions',
    'public.sd_contract_violations',
    'public.sd_corrections',
    'public.sd_data_contracts',
    'public.sd_dependency_graph',
    'public.sd_exec_file_operations',
    'public.sd_execution_timeline',
    'public.sd_gate_results',
    'public.sd_governance_bypass_audit',
    'public.sd_intensity_adjustments',
    'public.sd_intensity_gate_exemptions',
    'public.sd_key_result_alignment',
    'public.sd_kickbacks',
    'public.sd_overlap_analysis',
    'public.sd_phase_handoffs',
    'public.sd_phase_tracking',
    'public.sd_proposals',
    'public.sd_scope_deliverables',
    'public.sd_state_transitions',
    'public.sd_stream_completions',
    'public.sd_stream_requirements',
    'public.sd_subagent_deliverable_mapping',
    'public.sd_testing_status',
    'public.sd_type_change_audit',
    'public.sd_type_gate_exemptions',
    'public.sd_type_validation_profiles',
    'public.sd_ux_contracts',
    'public.sd_wall_states',
    'public.sd_workflow_template_steps',
    'public.sd_workflow_templates',
    'public.sdip_ai_analysis',
    'public.sdip_groups',
    'public.sdip_submissions',
    'public.selection_postures',
    'public.sensemaking_analyses',
    'public.sensemaking_knowledge_base',
    'public.sensemaking_personas',
    'public.sensemaking_telegram_sessions',
    'public.service_tasks',
    'public.service_telemetry',
    'public.session_lifecycle_events',
    'public.ship_escape_audit',
    'public.shipping_decisions',
    'public.simulation_sessions',
    'public.sms_approved_spend_ledger',
    'public.sms_decision_class_whitelist',
    'public.sms_inbound_log',
    'public.sms_inbound_suspensions',
    'public.sms_outbound_obligations',
    'public.sms_relay_secret',
    'public.sms_relay_staging',
    'public.solomon_advice_outcome_ledger',
    'public.soul_extractions',
    'public.sourcing_chairman_queue',
    'public.sourcing_engine_activation_state',
    'public.specialist_assessments',
    'public.specialist_registry',
    'public.srip_brand_interviews',
    'public.srip_quality_checks',
    'public.srip_site_dna',
    'public.srip_synthesis_prompts',
    'public.stage13_assessments',
    'public.stage13_substage_states',
    'public.stage13_valuations',
    'public.stage_data_contracts',
    'public.stage_events',
    'public.stage_executions',
    'public.stage_executions_qparity20260610',
    'public.stage_of_death_predictions',
    'public.stage_prop_contracts',
    'public.stage_proving_journal',
    'public.stage_zero_requests',
    'public.stitch_generation_metrics',
    'public.story_test_mappings',
    'public.strategic_directives_v2',
    'public.strategic_roadmaps',
    'public.strategic_themes',
    'public.strategic_vision',
    'public.strategy_objectives',
    'public.sub_agent_execution_batches',
    'public.sub_agent_execution_results',
    'public.sub_agent_execution_results_archive',
    'public.sub_agent_executions',
    'public.sub_agent_gate_requirements',
    'public.sub_agent_spawn_events',
    'public.subagent_activations',
    'public.subagent_requirements',
    'public.subagent_validation_results',
    'public.submission_groups',
    'public.submission_screenshots',
    'public.submission_steps',
    'public.substage_transition_log',
    'public.switchon_auto_actions',
    'public.switchon_decision_audit',
    'public.system_alerts',
    'public.system_events',
    'public.system_health',
    'public.system_settings',
    'public.task_hydration_log',
    'public.taste_interaction_logs',
    'public.taste_profiles',
    'public.team_assignments',
    'public.team_templates',
    'public.tech_stack_references',
    'public.telegram_bot_interactions',
    'public.telegram_conversations',
    'public.telegram_forum_topics',
    'public.telemetry_analysis_runs',
    'public.telemetry_thresholds',
    'public.test_coverage_policies',
    'public.test_plans',
    'public.test_results',
    'public.test_runs',
    'public.tool_access_grants',
    'public.tool_registry',
    'public.tool_usage_ledger',
    'public.trust_promotions',
    'public.uat_audit_trail',
    'public.uat_cases',
    'public.uat_coverage_metrics',
    'public.uat_credential_history',
    'public.uat_credentials',
    'public.uat_debt_registry',
    'public.uat_defects',
    'public.uat_issues',
    'public.uat_performance_metrics',
    'public.uat_results',
    'public.uat_runs',
    'public.uat_screenshots',
    'public.uat_test_cases',
    'public.uat_test_results',
    'public.uat_test_runs',
    'public.uat_test_schedules',
    'public.uat_test_suites',
    'public.uat_test_users',
    'public.ui_validation_checkpoints',
    'public.ui_validation_results',
    'public.user_blueprint_bookmarks',
    'public.user_company_access',
    'public.user_context_patterns',
    'public.user_navigation_analytics',
    'public.user_organizations',
    'public.user_preferences',
    'public.user_stories',
    'public.v_hc_flag_enabled',
    'public.v_s22_flag_enabled',
    'public.validation_audit_log',
    'public.validation_evidence',
    'public.validation_gate_registry',
    'public.value_authenticity_criteria_library',
    'public.value_authenticity_criteria_selections',
    'public.venture_archetypes',
    'public.venture_artifact_summaries_qparity20260610',
    'public.venture_artifacts',
    'public.venture_artifacts_qparity20260610',
    'public.venture_artifacts_storm_quarantine_20260704',
    'public.venture_asset_registry',
    'public.venture_audience_weekly',
    'public.venture_blueprints',
    'public.venture_briefs',
    'public.venture_capabilities',
    'public.venture_capture_snapshots',
    'public.venture_channel_autonomy',
    'public.venture_channel_publish_ledger',
    'public.venture_channel_secrets',
    'public.venture_competitive_analysis',
    'public.venture_compliance',
    'public.venture_compliance_artifacts',
    'public.venture_compliance_progress',
    'public.venture_data_room_artifacts',
    'public.venture_data_room_artifacts_qparity20260610',
    'public.venture_db_secrets',
    'public.venture_decision_dossiers',
    'public.venture_decisions',
    'public.venture_dependencies',
    'public.venture_deployments',
    'public.venture_design_pass_ledger',
    'public.venture_distribution_channels',
    'public.venture_documents',
    'public.venture_drafts',
    'public.venture_email_identities',
    'public.venture_exit_profiles',
    'public.venture_exit_readiness',
    'public.venture_financial_contract',
    'public.venture_financial_projections',
    'public.venture_fundamentals',
    'public.venture_guardrail_state',
    'public.venture_gvos_profile',
    'public.venture_inbound_messages',
    'public.venture_legal_overrides',
    'public.venture_market_analysis',
    'public.venture_milestones',
    'public.venture_nursery',
    'public.venture_persona_mapping',
    'public.venture_phase_budgets',
    'public.venture_postmortems',
    'public.venture_preview_instances',
    'public.venture_provisioning_state',
    'public.venture_quality_findings',
    'public.venture_raid_summary',
    'public.venture_resources',
    'public.venture_resources_qparity20260610',
    'public.venture_revenue_entries',
    'public.venture_separability_scores',
    'public.venture_separability_scores_qparity20260610',
    'public.venture_service_bindings',
    'public.venture_stage_transitions',
    'public.venture_stage_transitions_qparity20260610',
    'public.venture_stage_work_qparity20260610',
    'public.venture_stages',
    'public.venture_stages_audit',
    'public.venture_support_tickets',
    'public.venture_telemetry',
    'public.venture_templates',
    'public.venture_tiers',
    'public.venture_token_budgets',
    'public.venture_token_ledger',
    'public.venture_tool_quotas',
    'public.venture_write_ledger',
    'public.ventures',
    'public.ventures_kill_log',
    'public.ventures_qparity20260610',
    'public.vertical_complexity_multipliers',
    'public.vision_build_gauge',
    'public.vision_ladder_criteria',
    'public.vision_ladder_rungs',
    'public.voice_cached_responses',
    'public.voice_conversations',
    'public.voice_function_calls',
    'public.voice_usage_metrics',
    'public.wizard_analytics',
    'public.work_item_thresholds',
    'public.worker_heartbeats',
    'public.worker_spawn_requests',
    'public.workflow_checkpoints',
    'public.workflow_executions',
    'public.workflow_recovery_state',
    'public.workflow_trace_log',
    'public.working_sd_sessions',
    'public.worktree_gate_metrics'
]::regclass[]) AS rel;

REVOKE TRUNCATE ON public.activation_catalog_expectations FROM anon;
REVOKE TRUNCATE ON public.activity_logs FROM anon;
REVOKE TRUNCATE ON public.adam_adherence_ledger FROM anon;
REVOKE TRUNCATE ON public.adam_delegated_apply_ledger FROM anon;
REVOKE TRUNCATE ON public.adam_task_ledger FROM anon;
REVOKE TRUNCATE ON public.adherence_rubrics FROM anon;
REVOKE TRUNCATE ON public.advisory_checkpoints FROM anon;
REVOKE TRUNCATE ON public.aegis_constitutions FROM anon;
REVOKE TRUNCATE ON public.aegis_rules FROM anon;
REVOKE TRUNCATE ON public.aegis_violations FROM anon;
REVOKE TRUNCATE ON public.agent_artifacts FROM anon;
REVOKE TRUNCATE ON public.agent_avatars FROM anon;
REVOKE TRUNCATE ON public.agent_coordination_state FROM anon;
REVOKE TRUNCATE ON public.agent_departments FROM anon;
REVOKE TRUNCATE ON public.agent_events FROM anon;
REVOKE TRUNCATE ON public.agent_execution_cache FROM anon;
REVOKE TRUNCATE ON public.agent_intelligence_insights FROM anon;
REVOKE TRUNCATE ON public.agent_knowledge_base FROM anon;
REVOKE TRUNCATE ON public.agent_learning_outcomes FROM anon;
REVOKE TRUNCATE ON public.agent_memory_stores FROM anon;
REVOKE TRUNCATE ON public.agent_messages FROM anon;
REVOKE TRUNCATE ON public.agent_performance_metrics FROM anon;
REVOKE TRUNCATE ON public.agent_registry FROM anon;
REVOKE TRUNCATE ON public.agent_relationships FROM anon;
REVOKE TRUNCATE ON public.agent_task_contracts FROM anon;
REVOKE TRUNCATE ON public.agentic_reviews FROM anon;
REVOKE TRUNCATE ON public.agents FROM anon;
REVOKE TRUNCATE ON public.ai_gen_dwell_tracking FROM anon;
REVOKE TRUNCATE ON public.ai_gen_provenance FROM anon;
REVOKE TRUNCATE ON public.ai_quality_assessments FROM anon;
REVOKE TRUNCATE ON public.anthropic_plugin_registry FROM anon;
REVOKE TRUNCATE ON public.apa_standing_assessments FROM anon;
REVOKE TRUNCATE ON public.app_config FROM anon;
REVOKE TRUNCATE ON public.archetype_benchmarks FROM anon;
REVOKE TRUNCATE ON public.archetype_profile_interactions FROM anon;
REVOKE TRUNCATE ON public.architectural_prevention_findings FROM anon;
REVOKE TRUNCATE ON public.assumption_sets FROM anon;
REVOKE TRUNCATE ON public.audit_finding_sd_links FROM anon;
REVOKE TRUNCATE ON public.audit_finding_sd_mapping FROM anon;
REVOKE TRUNCATE ON public.audit_triangulation_log FROM anon;
REVOKE TRUNCATE ON public.auto_apply_allowlist FROM anon;
REVOKE TRUNCATE ON public.auto_apply_denylist FROM anon;
REVOKE TRUNCATE ON public.backlog_item_completion FROM anon;
REVOKE TRUNCATE ON public.batch_operation_log FROM anon;
REVOKE TRUNCATE ON public.blueprint_board_submissions FROM anon;
REVOKE TRUNCATE ON public.blueprint_quality_assessments FROM anon;
REVOKE TRUNCATE ON public.blueprint_selection_signals FROM anon;
REVOKE TRUNCATE ON public.blueprint_templates FROM anon;
REVOKE TRUNCATE ON public.board_meeting_attendance FROM anon;
REVOKE TRUNCATE ON public.board_meetings FROM anon;
REVOKE TRUNCATE ON public.board_members FROM anon;
REVOKE TRUNCATE ON public.brainstorm_question_effectiveness FROM anon;
REVOKE TRUNCATE ON public.brainstorm_question_interactions FROM anon;
REVOKE TRUNCATE ON public.brainstorm_sessions FROM anon;
REVOKE TRUNCATE ON public.brainstorm_vote_tallies FROM anon;
REVOKE TRUNCATE ON public.brand_genome_submissions FROM anon;
REVOKE TRUNCATE ON public.brand_variants FROM anon;
REVOKE TRUNCATE ON public.build_completion_forecast_log FROM anon;
REVOKE TRUNCATE ON public.bypass_ledger FROM anon;
REVOKE TRUNCATE ON public.campaign_content FROM anon;
REVOKE TRUNCATE ON public.campaign_enrollments FROM anon;
REVOKE TRUNCATE ON public.capability_reuse_log FROM anon;
REVOKE TRUNCATE ON public.capacity_limit_events FROM anon;
REVOKE TRUNCATE ON public.capital_transactions FROM anon;
REVOKE TRUNCATE ON public.capital_transactions_preimg_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.cascade_invalidation_flags FROM anon;
REVOKE TRUNCATE ON public.cascade_invalidation_log FROM anon;
REVOKE TRUNCATE ON public.cascade_watcher_heartbeats FROM anon;
REVOKE TRUNCATE ON public.chairman_approval_requests FROM anon;
REVOKE TRUNCATE ON public.chairman_constraints FROM anon;
REVOKE TRUNCATE ON public.chairman_constraints_proposals FROM anon;
REVOKE TRUNCATE ON public.chairman_dashboard_config FROM anon;
REVOKE TRUNCATE ON public.chairman_decisions FROM anon;
REVOKE TRUNCATE ON public.chairman_directives FROM anon;
REVOKE TRUNCATE ON public.chairman_feedback FROM anon;
REVOKE TRUNCATE ON public.chairman_interests FROM anon;
REVOKE TRUNCATE ON public.chairman_notifications FROM anon;
REVOKE TRUNCATE ON public.chairman_overrides FROM anon;
REVOKE TRUNCATE ON public.chairman_preferences FROM anon;
REVOKE TRUNCATE ON public.chairman_settings FROM anon;
REVOKE TRUNCATE ON public.chairman_stepup_tokens FROM anon;
REVOKE TRUNCATE ON public.chairman_switchon_policy FROM anon;
REVOKE TRUNCATE ON public.chairman_webauthn_challenges FROM anon;
REVOKE TRUNCATE ON public.chairman_webauthn_credentials FROM anon;
REVOKE TRUNCATE ON public.channel_budgets FROM anon;
REVOKE TRUNCATE ON public.ci_snapshots FROM anon;
REVOKE TRUNCATE ON public.circuit_breaker_blocks FROM anon;
REVOKE TRUNCATE ON public.claim_rejects FROM anon;
REVOKE TRUNCATE ON public.claude_code_releases FROM anon;
REVOKE TRUNCATE ON public.cleanup_orchestration_state FROM anon;
REVOKE TRUNCATE ON public.client_error_events FROM anon;
REVOKE TRUNCATE ON public.codebase_health_config FROM anon;
REVOKE TRUNCATE ON public.codebase_health_snapshots FROM anon;
REVOKE TRUNCATE ON public.codebase_semantic_index FROM anon;
REVOKE TRUNCATE ON public.companies FROM anon;
REVOKE TRUNCATE ON public.competitive_baselines FROM anon;
REVOKE TRUNCATE ON public.competitor_intelligence FROM anon;
REVOKE TRUNCATE ON public.competitors FROM anon;
REVOKE TRUNCATE ON public.compliance_alerts FROM anon;
REVOKE TRUNCATE ON public.compliance_artifact_templates FROM anon;
REVOKE TRUNCATE ON public.compliance_checklist_items FROM anon;
REVOKE TRUNCATE ON public.compliance_checklists FROM anon;
REVOKE TRUNCATE ON public.compliance_checks FROM anon;
REVOKE TRUNCATE ON public.compliance_events FROM anon;
REVOKE TRUNCATE ON public.compliance_gate_events FROM anon;
REVOKE TRUNCATE ON public.compliance_policies FROM anon;
REVOKE TRUNCATE ON public.compliance_violations FROM anon;
REVOKE TRUNCATE ON public.component_registry_embeddings FROM anon;
REVOKE TRUNCATE ON public.constitutional_amendments FROM anon;
REVOKE TRUNCATE ON public.content_types FROM anon;
REVOKE TRUNCATE ON public.context_embeddings FROM anon;
REVOKE TRUNCATE ON public.context_usage_daily FROM anon;
REVOKE TRUNCATE ON public.context_usage_log FROM anon;
REVOKE TRUNCATE ON public.continuous_execution_log FROM anon;
REVOKE TRUNCATE ON public.contract_chain_links FROM anon;
REVOKE TRUNCATE ON public.convergence_ledger_runs FROM anon;
REVOKE TRUNCATE ON public.convergence_ledger_stages FROM anon;
REVOKE TRUNCATE ON public.conversion_ledger FROM anon;
REVOKE TRUNCATE ON public.coordinator_follow_ons FROM anon;
REVOKE TRUNCATE ON public.coordinator_role_history FROM anon;
REVOKE TRUNCATE ON public.cost_governor_log FROM anon;
REVOKE TRUNCATE ON public.council_adjudications FROM anon;
REVOKE TRUNCATE ON public.counterfactual_scores FROM anon;
REVOKE TRUNCATE ON public.coverage_matrix FROM anon;
REVOKE TRUNCATE ON public.coverage_matrix_rotation_runs FROM anon;
REVOKE TRUNCATE ON public.creative_assets FROM anon;
REVOKE TRUNCATE ON public.crm_contact_venture_access FROM anon;
REVOKE TRUNCATE ON public.crm_contacts FROM anon;
REVOKE TRUNCATE ON public.crm_inbound_events FROM anon;
REVOKE TRUNCATE ON public.crm_orgs FROM anon;
REVOKE TRUNCATE ON public.crm_pipeline_cases FROM anon;
REVOKE TRUNCATE ON public.crm_pipeline_stage_defs FROM anon;
REVOKE TRUNCATE ON public.crm_pipeline_stage_edges FROM anon;
REVOKE TRUNCATE ON public.crm_pipeline_transitions FROM anon;
REVOKE TRUNCATE ON public.cron_run_locks FROM anon;
REVOKE TRUNCATE ON public.cross_agent_correlations FROM anon;
REVOKE TRUNCATE ON public.cross_sd_utilization FROM anon;
REVOKE TRUNCATE ON public.cultural_design_styles FROM anon;
REVOKE TRUNCATE ON public.customer_personas FROM anon;
REVOKE TRUNCATE ON public.daily_rollups FROM anon;
REVOKE TRUNCATE ON public.db_agent_config FROM anon;
REVOKE TRUNCATE ON public.db_agent_invocations FROM anon;
REVOKE TRUNCATE ON public.debate_arguments FROM anon;
REVOKE TRUNCATE ON public.debate_circuit_breaker FROM anon;
REVOKE TRUNCATE ON public.debate_sessions FROM anon;
REVOKE TRUNCATE ON public.defect_taxonomy FROM anon;
REVOKE TRUNCATE ON public.department_agents FROM anon;
REVOKE TRUNCATE ON public.department_capabilities FROM anon;
REVOKE TRUNCATE ON public.department_messages FROM anon;
REVOKE TRUNCATE ON public.departments FROM anon;
REVOKE TRUNCATE ON public.design_pattern_usage FROM anon;
REVOKE TRUNCATE ON public.design_quality_scores FROM anon;
REVOKE TRUNCATE ON public.directive_submissions FROM anon;
REVOKE TRUNCATE ON public.discovery_strategies FROM anon;
REVOKE TRUNCATE ON public.distribution_channels FROM anon;
REVOKE TRUNCATE ON public.distribution_history FROM anon;
REVOKE TRUNCATE ON public.doctrine_constraint_violations FROM anon;
REVOKE TRUNCATE ON public.document_section_schemas FROM anon;
REVOKE TRUNCATE ON public.documentation_health_checks FROM anon;
REVOKE TRUNCATE ON public.documentation_inventory FROM anon;
REVOKE TRUNCATE ON public.documentation_templates FROM anon;
REVOKE TRUNCATE ON public.documentation_violations FROM anon;
REVOKE TRUNCATE ON public.domain_knowledge FROM anon;
REVOKE TRUNCATE ON public.door_routing_ledger FROM anon;
REVOKE TRUNCATE ON public.ehg_alerts FROM anon;
REVOKE TRUNCATE ON public.ehg_component_patterns FROM anon;
REVOKE TRUNCATE ON public.ehg_design_decisions FROM anon;
REVOKE TRUNCATE ON public.ehg_feature_areas FROM anon;
REVOKE TRUNCATE ON public.ehg_page_routes FROM anon;
REVOKE TRUNCATE ON public.ehg_services FROM anon;
REVOKE TRUNCATE ON public.ehg_user_workflows FROM anon;
REVOKE TRUNCATE ON public.ehg_wiki_sections FROM anon;
REVOKE TRUNCATE ON public.enhancement_proposal_audit FROM anon;
REVOKE TRUNCATE ON public.enhancement_proposals FROM anon;
REVOKE TRUNCATE ON public.eva_actions FROM anon;
REVOKE TRUNCATE ON public.eva_agent_communications FROM anon;
REVOKE TRUNCATE ON public.eva_architecture_decisions FROM anon;
REVOKE TRUNCATE ON public.eva_architecture_plans FROM anon;
REVOKE TRUNCATE ON public.eva_artifact_dependencies FROM anon;
REVOKE TRUNCATE ON public.eva_audit_log FROM anon;
REVOKE TRUNCATE ON public.eva_audit_log_preimg_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.eva_automation_executions FROM anon;
REVOKE TRUNCATE ON public.eva_automation_executions_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.eva_automation_rules FROM anon;
REVOKE TRUNCATE ON public.eva_cascade_errors FROM anon;
REVOKE TRUNCATE ON public.eva_chat_conversations FROM anon;
REVOKE TRUNCATE ON public.eva_chat_messages FROM anon;
REVOKE TRUNCATE ON public.eva_circuit_breaker FROM anon;
REVOKE TRUNCATE ON public.eva_circuit_state_transitions FROM anon;
REVOKE TRUNCATE ON public.eva_claude_code_intake FROM anon;
REVOKE TRUNCATE ON public.eva_config FROM anon;
REVOKE TRUNCATE ON public.eva_consultant_digests FROM anon;
REVOKE TRUNCATE ON public.eva_consultant_recommendations FROM anon;
REVOKE TRUNCATE ON public.eva_consultant_snapshots FROM anon;
REVOKE TRUNCATE ON public.eva_consultant_trends FROM anon;
REVOKE TRUNCATE ON public.eva_decisions FROM anon;
REVOKE TRUNCATE ON public.eva_decisions_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.eva_event_ledger FROM anon;
REVOKE TRUNCATE ON public.eva_event_log FROM anon;
REVOKE TRUNCATE ON public.eva_event_schemas FROM anon;
REVOKE TRUNCATE ON public.eva_events FROM anon;
REVOKE TRUNCATE ON public.eva_events_dlq FROM anon;
REVOKE TRUNCATE ON public.eva_events_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.eva_friday_decisions FROM anon;
REVOKE TRUNCATE ON public.eva_friday_meeting_agenda FROM anon;
REVOKE TRUNCATE ON public.eva_friday_meetings FROM anon;
REVOKE TRUNCATE ON public.eva_friday_outcomes FROM anon;
REVOKE TRUNCATE ON public.eva_idea_categories FROM anon;
REVOKE TRUNCATE ON public.eva_orchestration_sessions FROM anon;
REVOKE TRUNCATE ON public.eva_preferences FROM anon;
REVOKE TRUNCATE ON public.eva_saga_log FROM anon;
REVOKE TRUNCATE ON public.eva_scheduler_heartbeat FROM anon;
REVOKE TRUNCATE ON public.eva_scheduler_metrics FROM anon;
REVOKE TRUNCATE ON public.eva_scheduler_metrics_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.eva_scheduler_queue FROM anon;
REVOKE TRUNCATE ON public.eva_scheduler_queue_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.eva_source_health FROM anon;
REVOKE TRUNCATE ON public.eva_stage_gate_results FROM anon;
REVOKE TRUNCATE ON public.eva_stage_gate_results_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.eva_support_decision_log FROM anon;
REVOKE TRUNCATE ON public.eva_support_research_cache FROM anon;
REVOKE TRUNCATE ON public.eva_sync_state FROM anon;
REVOKE TRUNCATE ON public.eva_todoist_intake FROM anon;
REVOKE TRUNCATE ON public.eva_trace_log FROM anon;
REVOKE TRUNCATE ON public.eva_translation_gates FROM anon;
REVOKE TRUNCATE ON public.eva_updates FROM anon;
REVOKE TRUNCATE ON public.eva_ventures FROM anon;
REVOKE TRUNCATE ON public.eva_ventures_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.eva_vision_documents FROM anon;
REVOKE TRUNCATE ON public.eva_vision_gaps FROM anon;
REVOKE TRUNCATE ON public.eva_vision_iterations FROM anon;
REVOKE TRUNCATE ON public.eva_vision_scores FROM anon;
REVOKE TRUNCATE ON public.eva_weekly_review_templates FROM anon;
REVOKE TRUNCATE ON public.eva_youtube_config FROM anon;
REVOKE TRUNCATE ON public.eva_youtube_intake FROM anon;
REVOKE TRUNCATE ON public.eva_youtube_scans FROM anon;
REVOKE TRUNCATE ON public.eva_youtube_scores FROM anon;
REVOKE TRUNCATE ON public.evaluation_profile_outcomes FROM anon;
REVOKE TRUNCATE ON public.evaluation_profiles FROM anon;
REVOKE TRUNCATE ON public.exec_authorizations FROM anon;
REVOKE TRUNCATE ON public.exec_handoff_preparations FROM anon;
REVOKE TRUNCATE ON public.exec_implementation_sessions FROM anon;
REVOKE TRUNCATE ON public.exec_quality_checkpoints FROM anon;
REVOKE TRUNCATE ON public.exec_sub_agent_activations FROM anon;
REVOKE TRUNCATE ON public.execute_teams FROM anon;
REVOKE TRUNCATE ON public.execution_sequences_v2 FROM anon;
REVOKE TRUNCATE ON public.exit_playbooks FROM anon;
REVOKE TRUNCATE ON public.experiment_assignments FROM anon;
REVOKE TRUNCATE ON public.experiment_outcomes FROM anon;
REVOKE TRUNCATE ON public.experiments FROM anon;
REVOKE TRUNCATE ON public.fable_suitability_map FROM anon;
REVOKE TRUNCATE ON public.factory_guardrail_state_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.failure_patterns FROM anon;
REVOKE TRUNCATE ON public.feedback FROM anon;
REVOKE TRUNCATE ON public.feedback_events FROM anon;
REVOKE TRUNCATE ON public.feedback_quality_config FROM anon;
REVOKE TRUNCATE ON public.feedback_sd_map FROM anon;
REVOKE TRUNCATE ON public.file_claim_locks FROM anon;
REVOKE TRUNCATE ON public.financial_models FROM anon;
REVOKE TRUNCATE ON public.financial_projections FROM anon;
REVOKE TRUNCATE ON public.financial_scenarios FROM anon;
REVOKE TRUNCATE ON public.fit_gate_scores FROM anon;
REVOKE TRUNCATE ON public.fleet_desired_slots FROM anon;
REVOKE TRUNCATE ON public.fleet_liveness_estimates FROM anon;
REVOKE TRUNCATE ON public.fleet_worker_pulse FROM anon;
REVOKE TRUNCATE ON public.folder_structure_snapshot FROM anon;
REVOKE TRUNCATE ON public.forecast_ledger FROM anon;
REVOKE TRUNCATE ON public.forecast_records FROM anon;
REVOKE TRUNCATE ON public.gap_analysis_results FROM anon;
REVOKE TRUNCATE ON public.gate_boundary_config FROM anon;
REVOKE TRUNCATE ON public.gate_boundary_config_audit FROM anon;
REVOKE TRUNCATE ON public.gate_requirements_templates FROM anon;
REVOKE TRUNCATE ON public.gate_witness_events FROM anon;
REVOKE TRUNCATE ON public.gate_witness_registry FROM anon;
REVOKE TRUNCATE ON public.gauge_finding_dispositions FROM anon;
REVOKE TRUNCATE ON public.genesis_deployments FROM anon;
REVOKE TRUNCATE ON public.genesis_tier_config FROM anon;
REVOKE TRUNCATE ON public.github_operations FROM anon;
REVOKE TRUNCATE ON public.global_competitors FROM anon;
REVOKE TRUNCATE ON public.goal_evaluator_verdicts FROM anon;
REVOKE TRUNCATE ON public.governance_audit_log FROM anon;
REVOKE TRUNCATE ON public.governance_decisions FROM anon;
REVOKE TRUNCATE ON public.governance_policies FROM anon;
REVOKE TRUNCATE ON public.governance_probe_registry FROM anon;
REVOKE TRUNCATE ON public.governance_proposals FROM anon;
REVOKE TRUNCATE ON public.governed_change_proposals FROM anon;
REVOKE TRUNCATE ON public.grill_convergence_artifacts FROM anon;
REVOKE TRUNCATE ON public.grill_fixtures FROM anon;
REVOKE TRUNCATE ON public.gvos_adherence_logs FROM anon;
REVOKE TRUNCATE ON public.gvos_archetypes FROM anon;
REVOKE TRUNCATE ON public.gvos_prompt_rubrics FROM anon;
REVOKE TRUNCATE ON public.gvos_token_versions FROM anon;
REVOKE TRUNCATE ON public.gvos_tokens FROM anon;
REVOKE TRUNCATE ON public.handoff_audit_log FROM anon;
REVOKE TRUNCATE ON public.handoff_validation_rules FROM anon;
REVOKE TRUNCATE ON public.handoff_verification_gates FROM anon;
REVOKE TRUNCATE ON public.hap_blocks_v2 FROM anon;
REVOKE TRUNCATE ON public.hold_state_contract_violations FROM anon;
REVOKE TRUNCATE ON public.import_audit FROM anon;
REVOKE TRUNCATE ON public.improvement_quality_assessments FROM anon;
REVOKE TRUNCATE ON public.intake_submissions FROM anon;
REVOKE TRUNCATE ON public.integration_config FROM anon;
REVOKE TRUNCATE ON public.integration_verification_records FROM anon;
REVOKE TRUNCATE ON public.integrity_metrics FROM anon;
REVOKE TRUNCATE ON public.intelligence_analysis FROM anon;
REVOKE TRUNCATE ON public.intelligence_patterns FROM anon;
REVOKE TRUNCATE ON public.interaction_history FROM anon;
REVOKE TRUNCATE ON public.issue_patterns FROM anon;
REVOKE TRUNCATE ON public.judge_verdicts FROM anon;
REVOKE TRUNCATE ON public.key_results FROM anon;
REVOKE TRUNCATE ON public.kr_progress_snapshots FROM anon;
REVOKE TRUNCATE ON public.launch_mode_audit FROM anon;
REVOKE TRUNCATE ON public.lead_evaluations FROM anon;
REVOKE TRUNCATE ON public.learning_configurations FROM anon;
REVOKE TRUNCATE ON public.learning_decisions FROM anon;
REVOKE TRUNCATE ON public.learning_inbox FROM anon;
REVOKE TRUNCATE ON public.legal_processes FROM anon;
REVOKE TRUNCATE ON public.legal_templates FROM anon;
REVOKE TRUNCATE ON public.leo_adrs FROM anon;
REVOKE TRUNCATE ON public.leo_agents FROM anon;
REVOKE TRUNCATE ON public.leo_artifacts FROM anon;
REVOKE TRUNCATE ON public.leo_audit_checklists FROM anon;
REVOKE TRUNCATE ON public.leo_audit_config FROM anon;
REVOKE TRUNCATE ON public.leo_auto_exec_audit FROM anon;
REVOKE TRUNCATE ON public.leo_auto_exec_forbidden FROM anon;
REVOKE TRUNCATE ON public.leo_auto_exec_policy FROM anon;
REVOKE TRUNCATE ON public.leo_autonomous_directives FROM anon;
REVOKE TRUNCATE ON public.leo_codebase_validations FROM anon;
REVOKE TRUNCATE ON public.leo_complexity_thresholds FROM anon;
REVOKE TRUNCATE ON public.leo_effort_policies FROM anon;
REVOKE TRUNCATE ON public.leo_error_log FROM anon;
REVOKE TRUNCATE ON public.leo_events FROM anon;
REVOKE TRUNCATE ON public.leo_execution_jobs FROM anon;
REVOKE TRUNCATE ON public.leo_feature_flag_approvals FROM anon;
REVOKE TRUNCATE ON public.leo_feature_flag_audit FROM anon;
REVOKE TRUNCATE ON public.leo_feature_flag_policies FROM anon;
REVOKE TRUNCATE ON public.leo_feature_flags FROM anon;
REVOKE TRUNCATE ON public.leo_feedback FROM anon;
REVOKE TRUNCATE ON public.leo_gate_reviews FROM anon;
REVOKE TRUNCATE ON public.leo_handoff_executions FROM anon;
REVOKE TRUNCATE ON public.leo_handoff_rejections FROM anon;
REVOKE TRUNCATE ON public.leo_handoff_templates FROM anon;
REVOKE TRUNCATE ON public.leo_handoff_validations FROM anon;
REVOKE TRUNCATE ON public.leo_integration_contracts FROM anon;
REVOKE TRUNCATE ON public.leo_integration_verification_results FROM anon;
REVOKE TRUNCATE ON public.leo_interfaces FROM anon;
REVOKE TRUNCATE ON public.leo_kb_generation_log FROM anon;
REVOKE TRUNCATE ON public.leo_kill_switches FROM anon;
REVOKE TRUNCATE ON public.leo_mandatory_validations FROM anon;
REVOKE TRUNCATE ON public.leo_nfr_requirements FROM anon;
REVOKE TRUNCATE ON public.leo_planner_rankings FROM anon;
REVOKE TRUNCATE ON public.leo_prioritization_config FROM anon;
REVOKE TRUNCATE ON public.leo_process_scripts FROM anon;
REVOKE TRUNCATE ON public.leo_prompts FROM anon;
REVOKE TRUNCATE ON public.leo_proposal_transitions FROM anon;
REVOKE TRUNCATE ON public.leo_proposals FROM anon;
REVOKE TRUNCATE ON public.leo_protocol_changes FROM anon;
REVOKE TRUNCATE ON public.leo_protocol_file_audit FROM anon;
REVOKE TRUNCATE ON public.leo_protocol_references FROM anon;
REVOKE TRUNCATE ON public.leo_protocol_sections FROM anon;
REVOKE TRUNCATE ON public.leo_protocols FROM anon;
REVOKE TRUNCATE ON public.leo_reasoning_sessions FROM anon;
REVOKE TRUNCATE ON public.leo_reasoning_triggers FROM anon;
REVOKE TRUNCATE ON public.leo_risk_spikes FROM anon;
REVOKE TRUNCATE ON public.leo_schema_constraints FROM anon;
REVOKE TRUNCATE ON public.leo_scoring_prioritization_config FROM anon;
REVOKE TRUNCATE ON public.leo_scoring_rubrics FROM anon;
REVOKE TRUNCATE ON public.leo_settings FROM anon;
REVOKE TRUNCATE ON public.leo_simplification_rules FROM anon;
REVOKE TRUNCATE ON public.leo_sub_agent_triggers FROM anon;
REVOKE TRUNCATE ON public.leo_sub_agents FROM anon;
REVOKE TRUNCATE ON public.leo_subagent_handoffs FROM anon;
REVOKE TRUNCATE ON public.leo_test_plans FROM anon;
REVOKE TRUNCATE ON public.leo_validation_rules FROM anon;
REVOKE TRUNCATE ON public.leo_vetting_outcomes FROM anon;
REVOKE TRUNCATE ON public.leo_vetting_rubrics FROM anon;
REVOKE TRUNCATE ON public.leo_wiring_validations FROM anon;
REVOKE TRUNCATE ON public.leo_workflow_phases FROM anon;
REVOKE TRUNCATE ON public.lifecycle_phases FROM anon;
REVOKE TRUNCATE ON public.llm_models FROM anon;
REVOKE TRUNCATE ON public.llm_providers FROM anon;
REVOKE TRUNCATE ON public.loop_registry FROM anon;
REVOKE TRUNCATE ON public.management_reviews FROM anon;
REVOKE TRUNCATE ON public.market_segments FROM anon;
REVOKE TRUNCATE ON public.market_signal_observations FROM anon;
REVOKE TRUNCATE ON public.market_signal_scanner_budget FROM anon;
REVOKE TRUNCATE ON public.marketing_attribution FROM anon;
REVOKE TRUNCATE ON public.marketing_campaigns FROM anon;
REVOKE TRUNCATE ON public.marketing_channels FROM anon;
REVOKE TRUNCATE ON public.marketing_content FROM anon;
REVOKE TRUNCATE ON public.marketing_content_queue FROM anon;
REVOKE TRUNCATE ON public.marketing_content_variants FROM anon;
REVOKE TRUNCATE ON public.marketing_feedback_cycles FROM anon;
REVOKE TRUNCATE ON public.marketing_pipeline_runs FROM anon;
REVOKE TRUNCATE ON public.mental_model_applications FROM anon;
REVOKE TRUNCATE ON public.mental_model_archetype_affinity FROM anon;
REVOKE TRUNCATE ON public.mental_model_effectiveness FROM anon;
REVOKE TRUNCATE ON public.mental_models FROM anon;
REVOKE TRUNCATE ON public.merge_witness_telemetry FROM anon;
REVOKE TRUNCATE ON public.missions FROM anon;
REVOKE TRUNCATE ON public.model_capability_reference FROM anon;
REVOKE TRUNCATE ON public.modeling_requests FROM anon;
REVOKE TRUNCATE ON public.monthly_ceo_reports FROM anon;
REVOKE TRUNCATE ON public.naming_favorites FROM anon;
REVOKE TRUNCATE ON public.naming_suggestions FROM anon;
REVOKE TRUNCATE ON public.nav_preferences FROM anon;
REVOKE TRUNCATE ON public.nav_routes FROM anon;
REVOKE TRUNCATE ON public.north_star FROM anon;
REVOKE TRUNCATE ON public.nursery_evaluation_log FROM anon;
REVOKE TRUNCATE ON public.objectives FROM anon;
REVOKE TRUNCATE ON public.okr_alignments FROM anon;
REVOKE TRUNCATE ON public.okr_generation_log FROM anon;
REVOKE TRUNCATE ON public.okr_snapshots FROM anon;
REVOKE TRUNCATE ON public.okr_vision_alignment_records FROM anon;
REVOKE TRUNCATE ON public.operations_audit_log FROM anon;
REVOKE TRUNCATE ON public.opportunities FROM anon;
REVOKE TRUNCATE ON public.opportunity_blueprints FROM anon;
REVOKE TRUNCATE ON public.opportunity_categories FROM anon;
REVOKE TRUNCATE ON public.opportunity_scans FROM anon;
REVOKE TRUNCATE ON public.opportunity_scores FROM anon;
REVOKE TRUNCATE ON public.opportunity_sources FROM anon;
REVOKE TRUNCATE ON public.ops_agent_health FROM anon;
REVOKE TRUNCATE ON public.ops_customer_health_scores FROM anon;
REVOKE TRUNCATE ON public.ops_friday_scorecards FROM anon;
REVOKE TRUNCATE ON public.ops_health_alerts FROM anon;
REVOKE TRUNCATE ON public.ops_payment_events FROM anon;
REVOKE TRUNCATE ON public.ops_product_health FROM anon;
REVOKE TRUNCATE ON public.ops_quarterly_assessments FROM anon;
REVOKE TRUNCATE ON public.ops_revenue_alerts FROM anon;
REVOKE TRUNCATE ON public.ops_revenue_metrics FROM anon;
REVOKE TRUNCATE ON public.orchestration_metrics FROM anon;
REVOKE TRUNCATE ON public.pattern_improvements FROM anon;
REVOKE TRUNCATE ON public.pattern_occurrences FROM anon;
REVOKE TRUNCATE ON public.pattern_resolution_signals FROM anon;
REVOKE TRUNCATE ON public.pattern_subagent_mapping FROM anon;
REVOKE TRUNCATE ON public.pcvp_verification_log FROM anon;
REVOKE TRUNCATE ON public.pending_ceo_handoffs FROM anon;
REVOKE TRUNCATE ON public.periodic_process_registry FROM anon;
REVOKE TRUNCATE ON public.persona_behavioral_data FROM anon;
REVOKE TRUNCATE ON public.pipeline_metrics FROM anon;
REVOKE TRUNCATE ON public.plan_conflict_rules FROM anon;
REVOKE TRUNCATE ON public.plan_critiques FROM anon;
REVOKE TRUNCATE ON public.plan_quality_gates FROM anon;
REVOKE TRUNCATE ON public.plan_sub_agent_executions FROM anon;
REVOKE TRUNCATE ON public.plan_subagent_queries FROM anon;
REVOKE TRUNCATE ON public.plan_technical_validations FROM anon;
REVOKE TRUNCATE ON public.plan_verification_results FROM anon;
REVOKE TRUNCATE ON public.pocock_adrs FROM anon;
REVOKE TRUNCATE ON public.pocock_glossary_terms FROM anon;
REVOKE TRUNCATE ON public.pocock_oos_findings FROM anon;
REVOKE TRUNCATE ON public.policy_audit_log FROM anon;
REVOKE TRUNCATE ON public.portfolio_allocation_policies FROM anon;
REVOKE TRUNCATE ON public.portfolio_profile_allocations FROM anon;
REVOKE TRUNCATE ON public.portfolios FROM anon;
REVOKE TRUNCATE ON public.post_build_verdicts FROM anon;
REVOKE TRUNCATE ON public.postmortem_pattern_links FROM anon;
REVOKE TRUNCATE ON public.pr_metrics FROM anon;
REVOKE TRUNCATE ON public.prd_research_audit_log FROM anon;
REVOKE TRUNCATE ON public.prd_ui_mappings FROM anon;
REVOKE TRUNCATE ON public.product_hunt_cache FROM anon;
REVOKE TRUNCATE ON public.product_requirements_v2 FROM anon;
REVOKE TRUNCATE ON public.profiles FROM anon;
REVOKE TRUNCATE ON public.prompt_templates FROM anon;
REVOKE TRUNCATE ON public.proposal_approvals FROM anon;
REVOKE TRUNCATE ON public.proposal_debate_rounds FROM anon;
REVOKE TRUNCATE ON public.proposal_debates FROM anon;
REVOKE TRUNCATE ON public.proposal_notifications FROM anon;
REVOKE TRUNCATE ON public.proposal_state_transitions FROM anon;
REVOKE TRUNCATE ON public.protected_resources FROM anon;
REVOKE TRUNCATE ON public.protocol_constitution FROM anon;
REVOKE TRUNCATE ON public.protocol_improvement_audit_log FROM anon;
REVOKE TRUNCATE ON public.protocol_improvement_queue FROM anon;
REVOKE TRUNCATE ON public.public_portfolio FROM anon;
REVOKE TRUNCATE ON public.quarantine_meta_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.quick_fixes FROM anon;
REVOKE TRUNCATE ON public.raid_log FROM anon;
REVOKE TRUNCATE ON public.rca_auto_trigger_config FROM anon;
REVOKE TRUNCATE ON public.rca_learning_records FROM anon;
REVOKE TRUNCATE ON public.rd_batch_runs FROM anon;
REVOKE TRUNCATE ON public.rd_proposals FROM anon;
REVOKE TRUNCATE ON public.recursion_events FROM anon;
REVOKE TRUNCATE ON public.releases FROM anon;
REVOKE TRUNCATE ON public.remediation_manifests FROM anon;
REVOKE TRUNCATE ON public.research_intelligence_reference FROM anon;
REVOKE TRUNCATE ON public.research_sessions FROM anon;
REVOKE TRUNCATE ON public.retro_notifications FROM anon;
REVOKE TRUNCATE ON public.retrospective_action_items FROM anon;
REVOKE TRUNCATE ON public.retrospective_contributions FROM anon;
REVOKE TRUNCATE ON public.retrospective_insights FROM anon;
REVOKE TRUNCATE ON public.retrospective_learning_links FROM anon;
REVOKE TRUNCATE ON public.retrospective_templates FROM anon;
REVOKE TRUNCATE ON public.retrospective_triggers FROM anon;
REVOKE TRUNCATE ON public.retrospectives FROM anon;
REVOKE TRUNCATE ON public.retrospectives_audit FROM anon;
REVOKE TRUNCATE ON public.risk_assessments FROM anon;
REVOKE TRUNCATE ON public.risk_escalation_log FROM anon;
REVOKE TRUNCATE ON public.risk_forecasts FROM anon;
REVOKE TRUNCATE ON public.risk_gate_passage_log FROM anon;
REVOKE TRUNCATE ON public.risk_recalibration_forms FROM anon;
REVOKE TRUNCATE ON public.risk_templates FROM anon;
REVOKE TRUNCATE ON public.roadmap_baseline_snapshots FROM anon;
REVOKE TRUNCATE ON public.roadmap_wave_items FROM anon;
REVOKE TRUNCATE ON public.roadmap_waves FROM anon;
REVOKE TRUNCATE ON public.role_drain_sets FROM anon;
REVOKE TRUNCATE ON public.root_cause_reports FROM anon;
REVOKE TRUNCATE ON public.runtime_audits FROM anon;
REVOKE TRUNCATE ON public.scaffold_patterns FROM anon;
REVOKE TRUNCATE ON public.schema_expectations FROM anon;
REVOKE TRUNCATE ON public.schema_migrations FROM anon;
REVOKE TRUNCATE ON public.schema_migrations_applied FROM anon;
REVOKE TRUNCATE ON public.scope_completion_chain FROM anon;
REVOKE TRUNCATE ON public.screen_layouts FROM anon;
REVOKE TRUNCATE ON public.sd_backlog_map FROM anon;
REVOKE TRUNCATE ON public.sd_baseline_issues FROM anon;
REVOKE TRUNCATE ON public.sd_baseline_items_purge_backup_20260609 FROM anon;
REVOKE TRUNCATE ON public.sd_baseline_items_recon_backup FROM anon;
REVOKE TRUNCATE ON public.sd_baseline_rationale FROM anon;
REVOKE TRUNCATE ON public.sd_business_evaluations FROM anon;
REVOKE TRUNCATE ON public.sd_capabilities FROM anon;
REVOKE TRUNCATE ON public.sd_checkpoint_history FROM anon;
REVOKE TRUNCATE ON public.sd_contract_exceptions FROM anon;
REVOKE TRUNCATE ON public.sd_contract_violations FROM anon;
REVOKE TRUNCATE ON public.sd_corrections FROM anon;
REVOKE TRUNCATE ON public.sd_data_contracts FROM anon;
REVOKE TRUNCATE ON public.sd_dependency_graph FROM anon;
REVOKE TRUNCATE ON public.sd_exec_file_operations FROM anon;
REVOKE TRUNCATE ON public.sd_execution_timeline FROM anon;
REVOKE TRUNCATE ON public.sd_gate_results FROM anon;
REVOKE TRUNCATE ON public.sd_governance_bypass_audit FROM anon;
REVOKE TRUNCATE ON public.sd_intensity_adjustments FROM anon;
REVOKE TRUNCATE ON public.sd_intensity_gate_exemptions FROM anon;
REVOKE TRUNCATE ON public.sd_key_result_alignment FROM anon;
REVOKE TRUNCATE ON public.sd_kickbacks FROM anon;
REVOKE TRUNCATE ON public.sd_overlap_analysis FROM anon;
REVOKE TRUNCATE ON public.sd_phase_handoffs FROM anon;
REVOKE TRUNCATE ON public.sd_phase_tracking FROM anon;
REVOKE TRUNCATE ON public.sd_proposals FROM anon;
REVOKE TRUNCATE ON public.sd_scope_deliverables FROM anon;
REVOKE TRUNCATE ON public.sd_state_transitions FROM anon;
REVOKE TRUNCATE ON public.sd_stream_completions FROM anon;
REVOKE TRUNCATE ON public.sd_stream_requirements FROM anon;
REVOKE TRUNCATE ON public.sd_subagent_deliverable_mapping FROM anon;
REVOKE TRUNCATE ON public.sd_testing_status FROM anon;
REVOKE TRUNCATE ON public.sd_type_change_audit FROM anon;
REVOKE TRUNCATE ON public.sd_type_gate_exemptions FROM anon;
REVOKE TRUNCATE ON public.sd_type_validation_profiles FROM anon;
REVOKE TRUNCATE ON public.sd_ux_contracts FROM anon;
REVOKE TRUNCATE ON public.sd_wall_states FROM anon;
REVOKE TRUNCATE ON public.sd_workflow_template_steps FROM anon;
REVOKE TRUNCATE ON public.sd_workflow_templates FROM anon;
REVOKE TRUNCATE ON public.sdip_ai_analysis FROM anon;
REVOKE TRUNCATE ON public.sdip_groups FROM anon;
REVOKE TRUNCATE ON public.sdip_submissions FROM anon;
REVOKE TRUNCATE ON public.selection_postures FROM anon;
REVOKE TRUNCATE ON public.sensemaking_analyses FROM anon;
REVOKE TRUNCATE ON public.sensemaking_knowledge_base FROM anon;
REVOKE TRUNCATE ON public.sensemaking_personas FROM anon;
REVOKE TRUNCATE ON public.sensemaking_telegram_sessions FROM anon;
REVOKE TRUNCATE ON public.service_tasks FROM anon;
REVOKE TRUNCATE ON public.service_telemetry FROM anon;
REVOKE TRUNCATE ON public.session_lifecycle_events FROM anon;
REVOKE TRUNCATE ON public.ship_escape_audit FROM anon;
REVOKE TRUNCATE ON public.shipping_decisions FROM anon;
REVOKE TRUNCATE ON public.simulation_sessions FROM anon;
REVOKE TRUNCATE ON public.sms_approved_spend_ledger FROM anon;
REVOKE TRUNCATE ON public.sms_decision_class_whitelist FROM anon;
REVOKE TRUNCATE ON public.sms_inbound_log FROM anon;
REVOKE TRUNCATE ON public.sms_inbound_suspensions FROM anon;
REVOKE TRUNCATE ON public.sms_outbound_obligations FROM anon;
REVOKE TRUNCATE ON public.sms_relay_secret FROM anon;
REVOKE TRUNCATE ON public.sms_relay_staging FROM anon;
REVOKE TRUNCATE ON public.solomon_advice_outcome_ledger FROM anon;
REVOKE TRUNCATE ON public.soul_extractions FROM anon;
REVOKE TRUNCATE ON public.sourcing_chairman_queue FROM anon;
REVOKE TRUNCATE ON public.sourcing_engine_activation_state FROM anon;
REVOKE TRUNCATE ON public.specialist_assessments FROM anon;
REVOKE TRUNCATE ON public.specialist_registry FROM anon;
REVOKE TRUNCATE ON public.srip_brand_interviews FROM anon;
REVOKE TRUNCATE ON public.srip_quality_checks FROM anon;
REVOKE TRUNCATE ON public.srip_site_dna FROM anon;
REVOKE TRUNCATE ON public.srip_synthesis_prompts FROM anon;
REVOKE TRUNCATE ON public.stage13_assessments FROM anon;
REVOKE TRUNCATE ON public.stage13_substage_states FROM anon;
REVOKE TRUNCATE ON public.stage13_valuations FROM anon;
REVOKE TRUNCATE ON public.stage_data_contracts FROM anon;
REVOKE TRUNCATE ON public.stage_events FROM anon;
REVOKE TRUNCATE ON public.stage_executions FROM anon;
REVOKE TRUNCATE ON public.stage_executions_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.stage_of_death_predictions FROM anon;
REVOKE TRUNCATE ON public.stage_prop_contracts FROM anon;
REVOKE TRUNCATE ON public.stage_proving_journal FROM anon;
REVOKE TRUNCATE ON public.stage_zero_requests FROM anon;
REVOKE TRUNCATE ON public.stitch_generation_metrics FROM anon;
REVOKE TRUNCATE ON public.story_test_mappings FROM anon;
REVOKE TRUNCATE ON public.strategic_directives_v2 FROM anon;
REVOKE TRUNCATE ON public.strategic_roadmaps FROM anon;
REVOKE TRUNCATE ON public.strategic_themes FROM anon;
REVOKE TRUNCATE ON public.strategic_vision FROM anon;
REVOKE TRUNCATE ON public.strategy_objectives FROM anon;
REVOKE TRUNCATE ON public.sub_agent_execution_batches FROM anon;
REVOKE TRUNCATE ON public.sub_agent_execution_results FROM anon;
REVOKE TRUNCATE ON public.sub_agent_execution_results_archive FROM anon;
REVOKE TRUNCATE ON public.sub_agent_executions FROM anon;
REVOKE TRUNCATE ON public.sub_agent_gate_requirements FROM anon;
REVOKE TRUNCATE ON public.sub_agent_spawn_events FROM anon;
REVOKE TRUNCATE ON public.subagent_activations FROM anon;
REVOKE TRUNCATE ON public.subagent_requirements FROM anon;
REVOKE TRUNCATE ON public.subagent_validation_results FROM anon;
REVOKE TRUNCATE ON public.submission_groups FROM anon;
REVOKE TRUNCATE ON public.submission_screenshots FROM anon;
REVOKE TRUNCATE ON public.submission_steps FROM anon;
REVOKE TRUNCATE ON public.substage_transition_log FROM anon;
REVOKE TRUNCATE ON public.switchon_auto_actions FROM anon;
REVOKE TRUNCATE ON public.switchon_decision_audit FROM anon;
REVOKE TRUNCATE ON public.system_alerts FROM anon;
REVOKE TRUNCATE ON public.system_events FROM anon;
REVOKE TRUNCATE ON public.system_health FROM anon;
REVOKE TRUNCATE ON public.system_settings FROM anon;
REVOKE TRUNCATE ON public.task_hydration_log FROM anon;
REVOKE TRUNCATE ON public.taste_interaction_logs FROM anon;
REVOKE TRUNCATE ON public.taste_profiles FROM anon;
REVOKE TRUNCATE ON public.team_assignments FROM anon;
REVOKE TRUNCATE ON public.team_templates FROM anon;
REVOKE TRUNCATE ON public.tech_stack_references FROM anon;
REVOKE TRUNCATE ON public.telegram_bot_interactions FROM anon;
REVOKE TRUNCATE ON public.telegram_conversations FROM anon;
REVOKE TRUNCATE ON public.telegram_forum_topics FROM anon;
REVOKE TRUNCATE ON public.telemetry_analysis_runs FROM anon;
REVOKE TRUNCATE ON public.telemetry_thresholds FROM anon;
REVOKE TRUNCATE ON public.test_coverage_policies FROM anon;
REVOKE TRUNCATE ON public.test_plans FROM anon;
REVOKE TRUNCATE ON public.test_results FROM anon;
REVOKE TRUNCATE ON public.test_runs FROM anon;
REVOKE TRUNCATE ON public.tool_access_grants FROM anon;
REVOKE TRUNCATE ON public.tool_registry FROM anon;
REVOKE TRUNCATE ON public.tool_usage_ledger FROM anon;
REVOKE TRUNCATE ON public.trust_promotions FROM anon;
REVOKE TRUNCATE ON public.uat_audit_trail FROM anon;
REVOKE TRUNCATE ON public.uat_cases FROM anon;
REVOKE TRUNCATE ON public.uat_coverage_metrics FROM anon;
REVOKE TRUNCATE ON public.uat_credential_history FROM anon;
REVOKE TRUNCATE ON public.uat_credentials FROM anon;
REVOKE TRUNCATE ON public.uat_debt_registry FROM anon;
REVOKE TRUNCATE ON public.uat_defects FROM anon;
REVOKE TRUNCATE ON public.uat_issues FROM anon;
REVOKE TRUNCATE ON public.uat_performance_metrics FROM anon;
REVOKE TRUNCATE ON public.uat_results FROM anon;
REVOKE TRUNCATE ON public.uat_runs FROM anon;
REVOKE TRUNCATE ON public.uat_screenshots FROM anon;
REVOKE TRUNCATE ON public.uat_test_cases FROM anon;
REVOKE TRUNCATE ON public.uat_test_results FROM anon;
REVOKE TRUNCATE ON public.uat_test_runs FROM anon;
REVOKE TRUNCATE ON public.uat_test_schedules FROM anon;
REVOKE TRUNCATE ON public.uat_test_suites FROM anon;
REVOKE TRUNCATE ON public.uat_test_users FROM anon;
REVOKE TRUNCATE ON public.ui_validation_checkpoints FROM anon;
REVOKE TRUNCATE ON public.ui_validation_results FROM anon;
REVOKE TRUNCATE ON public.user_blueprint_bookmarks FROM anon;
REVOKE TRUNCATE ON public.user_company_access FROM anon;
REVOKE TRUNCATE ON public.user_context_patterns FROM anon;
REVOKE TRUNCATE ON public.user_navigation_analytics FROM anon;
REVOKE TRUNCATE ON public.user_organizations FROM anon;
REVOKE TRUNCATE ON public.user_preferences FROM anon;
REVOKE TRUNCATE ON public.user_stories FROM anon;
REVOKE TRUNCATE ON public.v_hc_flag_enabled FROM anon;
REVOKE TRUNCATE ON public.v_s22_flag_enabled FROM anon;
REVOKE TRUNCATE ON public.validation_audit_log FROM anon;
REVOKE TRUNCATE ON public.validation_evidence FROM anon;
REVOKE TRUNCATE ON public.validation_gate_registry FROM anon;
REVOKE TRUNCATE ON public.value_authenticity_criteria_library FROM anon;
REVOKE TRUNCATE ON public.value_authenticity_criteria_selections FROM anon;
REVOKE TRUNCATE ON public.venture_archetypes FROM anon;
REVOKE TRUNCATE ON public.venture_artifact_summaries_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.venture_artifacts FROM anon;
REVOKE TRUNCATE ON public.venture_artifacts_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.venture_artifacts_storm_quarantine_20260704 FROM anon;
REVOKE TRUNCATE ON public.venture_asset_registry FROM anon;
REVOKE TRUNCATE ON public.venture_audience_weekly FROM anon;
REVOKE TRUNCATE ON public.venture_blueprints FROM anon;
REVOKE TRUNCATE ON public.venture_briefs FROM anon;
REVOKE TRUNCATE ON public.venture_capabilities FROM anon;
REVOKE TRUNCATE ON public.venture_capture_snapshots FROM anon;
REVOKE TRUNCATE ON public.venture_channel_autonomy FROM anon;
REVOKE TRUNCATE ON public.venture_channel_publish_ledger FROM anon;
REVOKE TRUNCATE ON public.venture_channel_secrets FROM anon;
REVOKE TRUNCATE ON public.venture_competitive_analysis FROM anon;
REVOKE TRUNCATE ON public.venture_compliance FROM anon;
REVOKE TRUNCATE ON public.venture_compliance_artifacts FROM anon;
REVOKE TRUNCATE ON public.venture_compliance_progress FROM anon;
REVOKE TRUNCATE ON public.venture_data_room_artifacts FROM anon;
REVOKE TRUNCATE ON public.venture_data_room_artifacts_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.venture_db_secrets FROM anon;
REVOKE TRUNCATE ON public.venture_decision_dossiers FROM anon;
REVOKE TRUNCATE ON public.venture_decisions FROM anon;
REVOKE TRUNCATE ON public.venture_dependencies FROM anon;
REVOKE TRUNCATE ON public.venture_deployments FROM anon;
REVOKE TRUNCATE ON public.venture_design_pass_ledger FROM anon;
REVOKE TRUNCATE ON public.venture_distribution_channels FROM anon;
REVOKE TRUNCATE ON public.venture_documents FROM anon;
REVOKE TRUNCATE ON public.venture_drafts FROM anon;
REVOKE TRUNCATE ON public.venture_email_identities FROM anon;
REVOKE TRUNCATE ON public.venture_exit_profiles FROM anon;
REVOKE TRUNCATE ON public.venture_exit_readiness FROM anon;
REVOKE TRUNCATE ON public.venture_financial_contract FROM anon;
REVOKE TRUNCATE ON public.venture_financial_projections FROM anon;
REVOKE TRUNCATE ON public.venture_fundamentals FROM anon;
REVOKE TRUNCATE ON public.venture_guardrail_state FROM anon;
REVOKE TRUNCATE ON public.venture_gvos_profile FROM anon;
REVOKE TRUNCATE ON public.venture_inbound_messages FROM anon;
REVOKE TRUNCATE ON public.venture_legal_overrides FROM anon;
REVOKE TRUNCATE ON public.venture_market_analysis FROM anon;
REVOKE TRUNCATE ON public.venture_milestones FROM anon;
REVOKE TRUNCATE ON public.venture_nursery FROM anon;
REVOKE TRUNCATE ON public.venture_persona_mapping FROM anon;
REVOKE TRUNCATE ON public.venture_phase_budgets FROM anon;
REVOKE TRUNCATE ON public.venture_postmortems FROM anon;
REVOKE TRUNCATE ON public.venture_preview_instances FROM anon;
REVOKE TRUNCATE ON public.venture_provisioning_state FROM anon;
REVOKE TRUNCATE ON public.venture_quality_findings FROM anon;
REVOKE TRUNCATE ON public.venture_raid_summary FROM anon;
REVOKE TRUNCATE ON public.venture_resources FROM anon;
REVOKE TRUNCATE ON public.venture_resources_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.venture_revenue_entries FROM anon;
REVOKE TRUNCATE ON public.venture_separability_scores FROM anon;
REVOKE TRUNCATE ON public.venture_separability_scores_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.venture_service_bindings FROM anon;
REVOKE TRUNCATE ON public.venture_stage_transitions FROM anon;
REVOKE TRUNCATE ON public.venture_stage_transitions_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.venture_stage_work_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.venture_stages FROM anon;
REVOKE TRUNCATE ON public.venture_stages_audit FROM anon;
REVOKE TRUNCATE ON public.venture_support_tickets FROM anon;
REVOKE TRUNCATE ON public.venture_telemetry FROM anon;
REVOKE TRUNCATE ON public.venture_templates FROM anon;
REVOKE TRUNCATE ON public.venture_tiers FROM anon;
REVOKE TRUNCATE ON public.venture_token_budgets FROM anon;
REVOKE TRUNCATE ON public.venture_token_ledger FROM anon;
REVOKE TRUNCATE ON public.venture_tool_quotas FROM anon;
REVOKE TRUNCATE ON public.venture_write_ledger FROM anon;
REVOKE TRUNCATE ON public.ventures FROM anon;
REVOKE TRUNCATE ON public.ventures_kill_log FROM anon;
REVOKE TRUNCATE ON public.ventures_qparity20260610 FROM anon;
REVOKE TRUNCATE ON public.vertical_complexity_multipliers FROM anon;
REVOKE TRUNCATE ON public.vision_build_gauge FROM anon;
REVOKE TRUNCATE ON public.vision_ladder_criteria FROM anon;
REVOKE TRUNCATE ON public.vision_ladder_rungs FROM anon;
REVOKE TRUNCATE ON public.voice_cached_responses FROM anon;
REVOKE TRUNCATE ON public.voice_conversations FROM anon;
REVOKE TRUNCATE ON public.voice_function_calls FROM anon;
REVOKE TRUNCATE ON public.voice_usage_metrics FROM anon;
REVOKE TRUNCATE ON public.wizard_analytics FROM anon;
REVOKE TRUNCATE ON public.work_item_thresholds FROM anon;
REVOKE TRUNCATE ON public.worker_heartbeats FROM anon;
REVOKE TRUNCATE ON public.worker_spawn_requests FROM anon;
REVOKE TRUNCATE ON public.workflow_checkpoints FROM anon;
REVOKE TRUNCATE ON public.workflow_executions FROM anon;
REVOKE TRUNCATE ON public.workflow_recovery_state FROM anon;
REVOKE TRUNCATE ON public.workflow_trace_log FROM anon;
REVOKE TRUNCATE ON public.working_sd_sessions FROM anon;
REVOKE TRUNCATE ON public.worktree_gate_metrics FROM anon;

-- Post-condition: per-relation diff against _sweep_baseline. Uses regclass array elements (via the
-- baseline table, captured from the same unnest(ARRAY[...]::regclass[]) source) rather than a
-- hardcoded text-name list -- a relation dropped/renamed between staging and apply would have
-- already raised 42P01 at the baseline-capture step above, converting a vacuous pass into a hard
-- failure at the earliest possible point. Asserts (a) TRUNCATE is gone from the current privilege
-- set, and (b) the current set equals baseline MINUS TRUNCATE exactly -- not an assumed fixed set of
-- "should be true" privileges, which a heterogeneous population (2 measured signatures) would falsely
-- fail. Never information_schema.role_table_grants (role-filtered -- see FR-1/FR-2 in the PRD).
DO $$
DECLARE
  b RECORD;
  current_privs text[];
  expected_privs text[];
  bad_truncate_count integer := 0;
  bad_diff_count integer := 0;
  checked_count integer := 0;
BEGIN
  FOR b IN SELECT rel_text, rel, anon_privs FROM _sweep_baseline
  LOOP
    checked_count := checked_count + 1;

    SELECT array_agg(a.privilege_type ORDER BY a.privilege_type)
    INTO current_privs
    FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid = b.rel), acldefault('r', (SELECT relowner FROM pg_class WHERE oid = b.rel)))) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE r.rolname = 'anon';

    IF has_table_privilege('anon', b.rel, 'TRUNCATE') OR 'TRUNCATE' = ANY(coalesce(current_privs, ARRAY[]::text[])) THEN
      bad_truncate_count := bad_truncate_count + 1;
      RAISE WARNING 'POST_CONDITION: anon still has TRUNCATE on %', b.rel_text;
    END IF;

    SELECT array_agg(p ORDER BY p) INTO expected_privs
    FROM unnest(coalesce(b.anon_privs, ARRAY[]::text[])) p
    WHERE p != 'TRUNCATE';

    IF coalesce(current_privs, ARRAY[]::text[]) IS DISTINCT FROM coalesce(expected_privs, ARRAY[]::text[]) THEN
      bad_diff_count := bad_diff_count + 1;
      RAISE WARNING 'POST_CONDITION: anon privilege set changed beyond TRUNCATE on % -- before(minus truncate)=%, after=%', b.rel_text, expected_privs, current_privs;
    END IF;
  END LOOP;

  IF checked_count != 760 THEN
    RAISE EXCEPTION 'POST_CONDITION_COUNT_MISMATCH: expected % relations, checked %', 760, checked_count;
  END IF;
  IF bad_truncate_count > 0 THEN
    RAISE EXCEPTION 'POST_CONDITION_FAILED: % relation(s) still show anon TRUNCATE after REVOKE', bad_truncate_count;
  END IF;
  IF bad_diff_count > 0 THEN
    RAISE EXCEPTION 'POST_CONDITION_FAILED: % relation(s) changed anon privileges beyond TRUNCATE -- REVOKE was over-broad or under-broad', bad_diff_count;
  END IF;

  RAISE NOTICE 'POST_CONDITION_PASSED: % relations verified via per-relation before/after diff -- anon TRUNCATE revoked, every other privilege exactly unchanged', checked_count;
END $$;

DROP TABLE IF EXISTS _sweep_baseline;

COMMIT;
