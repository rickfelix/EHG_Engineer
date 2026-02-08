-- Migration: CLI Venture Lifecycle SD Hierarchy
-- Created: 2026-02-07
-- Purpose: Create the full SD hierarchy for CLI Venture Lifecycle Infrastructure
-- Plan: radiant-wibbling-starlight.md (approved)
-- Total: 28 SDs (1 top orchestrator + 4 phase orchestrators + 23 children)

DO $$
DECLARE
  -- Top-level orchestrator
  v_top UUID := gen_random_uuid();

  -- Phase orchestrators
  v_orch_foundation UUID := gen_random_uuid();
  v_orch_templates UUID := gen_random_uuid();
  v_orch_intelligence UUID := gen_random_uuid();
  v_orch_dashboard UUID := gen_random_uuid();

  -- Foundation children (Phase 1a)
  v_venture_context UUID := gen_random_uuid();
  v_sd_namespacing UUID := gen_random_uuid();
  v_chairman_prefs UUID := gen_random_uuid();
  v_filter_engine UUID := gen_random_uuid();
  v_reality_gates UUID := gen_random_uuid();
  v_stage_gates_ext UUID := gen_random_uuid();
  v_eva_orchestrator UUID := gen_random_uuid();

  -- Templates children (Phase 1b)
  v_tmpl_truth UUID := gen_random_uuid();
  v_tmpl_engine UUID := gen_random_uuid();
  v_tmpl_identity UUID := gen_random_uuid();
  v_tmpl_blueprint UUID := gen_random_uuid();
  v_tmpl_build UUID := gen_random_uuid();
  v_tmpl_launch UUID := gen_random_uuid();

  -- Intelligence children (Phase 2a)
  v_devils_advocate UUID := gen_random_uuid();
  v_lifecycle_bridge UUID := gen_random_uuid();
  v_service_ports UUID := gen_random_uuid();
  v_constraint_drift UUID := gen_random_uuid();

  -- Dashboard children (Phase 2b)
  v_dash_overview UUID := gen_random_uuid();
  v_dash_financial UUID := gen_random_uuid();
  v_dash_competitive UUID := gen_random_uuid();
  v_dash_build UUID := gen_random_uuid();

  -- Phase 3 children (direct children of top)
  v_cross_venture UUID := gen_random_uuid();
  v_filter_calibrate UUID := gen_random_uuid();

  -- Shared defaults
  v_default_metrics JSONB := '[{"metric":"Implementation completeness","target":"100% of scope items implemented"},{"metric":"Test coverage","target":">=80% code coverage for new code"},{"metric":"Zero regressions","target":"0 existing tests broken"}]'::jsonb;
  v_default_principles JSONB := '["Follow LEO Protocol for all changes","Database-first pattern enforcement","Reuse existing infrastructure where possible"]'::jsonb;

BEGIN
  -- =============================================================================
  -- TOP-LEVEL ORCHESTRATOR
  -- =============================================================================
  INSERT INTO strategic_directives_v2 (
    id, sd_key, title, description, scope, rationale, sd_type, status, priority,
    category, current_phase, target_application, created_by, parent_sd_id,
    success_criteria, success_metrics, strategic_objectives, key_changes,
    key_principles, risks, metadata
  ) VALUES (
    v_top::text,
    'SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001',
    'CLI Venture Lifecycle Infrastructure',
    'Build CLI equivalent of the 25-stage venture lifecycle from the EHG GUI application. Eva orchestrates ventures through all stages from CLI with deterministic filter engine, reality gates, Chairman decision points, and model-isolated Devil''s Advocate.',
    'Full 25-stage venture lifecycle: THE TRUTH (1-5), THE ENGINE (6-9), THE IDENTITY (10-12), THE BLUEPRINT (13-16), THE BUILD LOOP (17-22), LAUNCH & LEARN (23-25). Foundation infrastructure, stage templates, intelligence layer, read-only dashboard.',
    'Chairman ran a 25-stage PoC through CLI (surface-level Opus markdown). The actual GUI has rich functionality at each stage. This orchestrator builds the real CLI equivalent with proper infrastructure.',
    'orchestrator', 'draft', 'high',
    'Infrastructure', 'LEAD', 'EHG_Engineer', 'Claude',
    NULL,
    '["All 25 stages executable from CLI","Artifacts stored in venture_artifacts with quality scoring","Kill gates enforce deterministic thresholds","Chairman reviews at decision gates","Filter Engine auto-proceeds on safe decisions"]'::jsonb,
    '[{"metric":"Stage coverage","target":"25/25 stages implemented"},{"metric":"Artifact storage","target":"100% of stage outputs in database"},{"metric":"Gate accuracy","target":"Kill gates match GUI thresholds"}]'::jsonb,
    '["Deliver CLI venture lifecycle matching GUI functionality","Enable Chairman to evaluate ventures without GUI dependency","Build reusable infrastructure on top of existing LEO Protocol"]'::jsonb,
    '[{"change":"Create Eva orchestrator for 25-stage lifecycle","type":"feature"},{"change":"Build decision filter engine with deterministic thresholds","type":"feature"},{"change":"Implement reality gates for phase boundary enforcement","type":"feature"},{"change":"Create 25 stage templates","type":"feature"}]'::jsonb,
    v_default_principles,
    '[{"risk":"Scope creep from GUI feature parity","mitigation":"Filter Engine (not Prediction) - deterministic thresholds only"},{"risk":"Context window exhaustion on long ventures","mitigation":"Stage-by-stage execution with artifact persistence"}]'::jsonb,
    '{"source":"plan","plan_name":"radiant-wibbling-starlight","total_children":23,"total_orchestrators":4,"estimated_points":105,"phases":["Foundation","Templates","Intelligence","Dashboard","Learning"]}'::jsonb
  );

  -- =============================================================================
  -- PHASE 1a: FOUNDATION ORCHESTRATOR
  -- =============================================================================
  INSERT INTO strategic_directives_v2 (
    id, sd_key, title, description, scope, rationale, sd_type, status, priority,
    category, current_phase, target_application, created_by, parent_sd_id,
    success_criteria, success_metrics, strategic_objectives, key_changes,
    key_principles, risks, metadata
  ) VALUES (
    v_orch_foundation::text,
    'SD-LEO-ORCH-CLI-VL-FOUNDATION-001',
    'CLI Venture Lifecycle - Foundation',
    'Foundation infrastructure for CLI venture lifecycle: context manager, SD namespacing, chairman preferences, filter engine, reality gates, stage gate extensions, and Eva orchestrator v1.',
    '7 children: Venture Context Manager, SD Namespacing, Chairman Preferences, Filter Engine, Reality Gates, Stage Gates Extension, Eva Orchestrator v1. Sequential dependencies.',
    'All other phases depend on this foundation. Must be built first with proper dependency ordering.',
    'orchestrator', 'draft', 'high',
    'Infrastructure', 'LEAD', 'EHG_Engineer', 'Claude',
    v_top::text,
    '["All 7 foundation components implemented and tested","Eva orchestrator can execute a single stage end-to-end","Filter Engine correctly auto-proceeds on safe decisions"]'::jsonb,
    '[{"metric":"Component completion","target":"7/7 foundation components"},{"metric":"Integration test","target":"Single stage E2E passes"}]'::jsonb,
    '["Build core infrastructure before stage templates","Establish proper dependency ordering"]'::jsonb,
    '[{"change":"Create 7 foundation infrastructure components","type":"feature"}]'::jsonb,
    v_default_principles,
    '[]'::jsonb,
    '{"source":"plan","phase":"Foundation","children_count":7,"estimated_points":28}'::jsonb
  );

  -- =============================================================================
  -- FOUNDATION CHILDREN (#1-#7)
  -- =============================================================================

  -- #1: Venture Context Manager
  INSERT INTO strategic_directives_v2 (
    id, sd_key, title, description, scope, rationale, sd_type, status, priority,
    category, current_phase, target_application, created_by, parent_sd_id,
    success_criteria, success_metrics, strategic_objectives, key_changes,
    key_principles, risks, metadata
  ) VALUES (
    v_venture_context::text,
    'SD-LEO-INFRA-VENTURE-CONTEXT-001',
    'Venture Context Manager',
    'Track active venture in claude_sessions.metadata.active_venture_id. Provide venture-scoped operations: SD prefix filtering, sd:next filtering, venture switching. Manage venture lifecycle state.',
    'New file: lib/eva/venture-context-manager.js. Extend claude_sessions metadata schema. Venture CRUD operations against ventures table.',
    'Eva needs to know which venture is active to scope all operations. This is the foundational context layer.',
    'infrastructure', 'draft', 'high',
    'Infrastructure', 'LEAD', 'EHG_Engineer', 'Claude',
    v_orch_foundation::text,
    '["Active venture tracked in session metadata","Venture switching works correctly","sd:next filters by active venture when set"]'::jsonb,
    v_default_metrics,
    '["Provide venture-scoped context for all Eva operations","Enable multi-venture support from session start"]'::jsonb,
    '[{"change":"Create lib/eva/venture-context-manager.js","type":"feature"},{"change":"Extend claude_sessions metadata for active_venture_id","type":"feature"}]'::jsonb,
    v_default_principles,
    '[]'::jsonb,
    '{"source":"plan","phase":"Foundation","child_index":0,"estimated_points":3,"depends_on":[]}'::jsonb
  );

  -- #2: Venture-Scoped SD Namespaces
  INSERT INTO strategic_directives_v2 (
    id, sd_key, title, description, scope, rationale, sd_type, status, priority,
    category, current_phase, target_application, created_by, parent_sd_id,
    success_criteria, success_metrics, strategic_objectives, key_changes,
    key_principles, risks, metadata
  ) VALUES (
    v_sd_namespacing::text,
    'SD-LEO-INFRA-SD-NAMESPACING-001',
    'Venture-Scoped SD Namespaces',
    'Support venture-scoped SD prefixes (SD-{VENTURE}-*). Filter sd:next by active venture. Ensure SD creation uses venture prefix when venture context is active.',
    'Extend scripts/modules/sd-key-generator.js for venture prefix. Update sd:next query filtering. Update leo-create-sd.js for venture context.',
    'SDs created during venture lifecycle must be namespaced to the venture for tracking and filtering.',
    'infrastructure', 'draft', 'high',
    'Infrastructure', 'LEAD', 'EHG_Engineer', 'Claude',
    v_orch_foundation::text,
    '["SD keys include venture prefix when venture active","sd:next filters by venture namespace","leo-create-sd.js auto-applies venture prefix"]'::jsonb,
    v_default_metrics,
    '["Enable venture-scoped SD tracking","Prevent SD namespace collisions across ventures"]'::jsonb,
    '[{"change":"Extend sd-key-generator.js for venture prefix support","type":"feature"},{"change":"Update sd:next for venture filtering","type":"feature"}]'::jsonb,
    v_default_principles,
    '[]'::jsonb,
    '{"source":"plan","phase":"Foundation","child_index":1,"estimated_points":3,"depends_on":["SD-LEO-INFRA-VENTURE-CONTEXT-001"]}'::jsonb
  );

  -- #3: Chairman Preference Store
  INSERT INTO strategic_directives_v2 (
    id, sd_key, title, description, scope, rationale, sd_type, status, priority,
    category, current_phase, target_application, created_by, parent_sd_id,
    success_criteria, success_metrics, strategic_objectives, key_changes,
    key_principles, risks, metadata
  ) VALUES (
    v_chairman_prefs::text,
    'SD-LEO-INFRA-CHAIRMAN-PREFS-001',
    'Chairman Preference Store',
    'Store Chairman preferences and directives that persist across ventures and sessions. Extend chairman_decisions table and create chairman_preferences table. Preferences include risk tolerance thresholds, budget limits, tech stack directives.',
    'New table: chairman_preferences. Extend chairman_decisions. New file: lib/eva/chairman-preference-store.js. Migration for schema changes.',
    'Chairman directives (e.g., "align with EHG stack", budget thresholds) must persist and be queryable by the Filter Engine.',
    'infrastructure', 'draft', 'high',
    'Infrastructure', 'LEAD', 'EHG_Engineer', 'Claude',
    v_orch_foundation::text,
    '["Chairman preferences stored in database","Preferences persist across sessions","Filter Engine can query preference thresholds"]'::jsonb,
    v_default_metrics,
    '["Store Chairman directives for Filter Engine consumption","Enable preference-driven decision automation"]'::jsonb,
    '[{"change":"Create chairman_preferences table","type":"feature"},{"change":"Create lib/eva/chairman-preference-store.js","type":"feature"}]'::jsonb,
    v_default_principles,
    '[]'::jsonb,
    '{"source":"plan","phase":"Foundation","child_index":2,"estimated_points":3,"depends_on":[]}'::jsonb
  );

  -- #4: Decision Filter Engine
  INSERT INTO strategic_directives_v2 (
    id, sd_key, title, description, scope, rationale, sd_type, status, priority,
    category, current_phase, target_application, created_by, parent_sd_id,
    success_criteria, success_metrics, strategic_objectives, key_changes,
    key_principles, risks, metadata
  ) VALUES (
    v_filter_engine::text,
    'SD-LEO-INFRA-FILTER-ENGINE-001',
    'Decision Filter Engine',
    'Deterministic risk-threshold engine that decides auto-proceed vs present-to-Chairman. Returns { auto_proceed, triggers[], recommendation }. Triggers: cost > threshold, new tech/vendor, strategic pivot, score < 7/10, novel pattern, constraint drift.',
    'New file: lib/eva/decision-filter-engine.js. Reads chairman_preferences for thresholds. Evaluates stage outputs against rules.',
    'Chairman Decision D01: Filter Engine (not Prediction) - deterministic risk thresholds. Must be rule-based, not ML-based.',
    'infrastructure', 'draft', 'high',
    'Infrastructure', 'LEAD', 'EHG_Engineer', 'Claude',
    v_orch_foundation::text,
    '["Filter Engine returns correct auto-proceed decisions","All 6 trigger types implemented","Chairman preferences drive thresholds"]'::jsonb,
    v_default_metrics,
    '["Implement deterministic decision filtering","Enable auto-proceed for safe decisions while flagging risks"]'::jsonb,
    '[{"change":"Create lib/eva/decision-filter-engine.js","type":"feature"},{"change":"Implement 6 trigger types with threshold evaluation","type":"feature"}]'::jsonb,
    v_default_principles,
    '[]'::jsonb,
    '{"source":"plan","phase":"Foundation","child_index":3,"estimated_points":5,"depends_on":["SD-LEO-INFRA-CHAIRMAN-PREFS-001"]}'::jsonb
  );

  -- #5: Reality Gate Enforcement
  INSERT INTO strategic_directives_v2 (
    id, sd_key, title, description, scope, rationale, sd_type, status, priority,
    category, current_phase, target_application, created_by, parent_sd_id,
    success_criteria, success_metrics, strategic_objectives, key_changes,
    key_principles, risks, metadata
  ) VALUES (
    v_reality_gates::text,
    'SD-LEO-INFRA-REALITY-GATES-001',
    'Reality Gate Enforcement',
    'Phase boundary enforcer. Queries venture_artifacts for artifact existence and quality scores. Optionally verifies deployed URLs for build phases. Chairman Decision D03: Always-on Reality Gates.',
    'New file: lib/eva/reality-gates.js. Query venture_artifacts table. Phase boundary checks at stages 5->6, 9->10, 12->13, 16->17, 20->21.',
    'Deployed artifacts required before advancing phases. Prevents advancing with incomplete work.',
    'infrastructure', 'draft', 'high',
    'Infrastructure', 'LEAD', 'EHG_Engineer', 'Claude',
    v_orch_foundation::text,
    '["Reality gates block phase transitions without required artifacts","Artifact quality scores checked against thresholds","Phase boundaries enforced at correct stage transitions"]'::jsonb,
    v_default_metrics,
    '["Enforce artifact existence at phase boundaries","Prevent advancement with incomplete deliverables"]'::jsonb,
    '[{"change":"Create lib/eva/reality-gates.js","type":"feature"},{"change":"Implement phase boundary checks for 5 transitions","type":"feature"}]'::jsonb,
    v_default_principles,
    '[]'::jsonb,
    '{"source":"plan","phase":"Foundation","child_index":4,"estimated_points":3,"depends_on":["SD-LEO-INFRA-VENTURE-CONTEXT-001"]}'::jsonb
  );

  -- #6: Extend Stage Gates (Kill Gates 3, 5, 13, 23)
  INSERT INTO strategic_directives_v2 (
    id, sd_key, title, description, scope, rationale, sd_type, status, priority,
    category, current_phase, target_application, created_by, parent_sd_id,
    success_criteria, success_metrics, strategic_objectives, key_changes,
    key_principles, risks, metadata
  ) VALUES (
    v_stage_gates_ext::text,
    'SD-LEO-INFRA-STAGE-GATES-EXT-001',
    'Extend Stage Gates for Kill and Promotion Gates',
    'Extend lib/agents/modules/venture-state-machine/stage-gates.js with kill gates (stages 3, 5, 13, 23) and promotion gates (stages 16, 17, 22). Kill gates require Chairman decision. Promotion gates require Chairman approval.',
    'Extend existing stage-gates.js. Add kill gate logic for 4 stages. Add promotion gate logic for 3 stages. Integrate with Filter Engine for threshold evaluation.',
    'The existing stage gates only cover financial viability (5->6), UAT signoff (21->22), and deployment health (22->23). Need full kill/promotion gate coverage.',
    'infrastructure', 'draft', 'high',
    'Infrastructure', 'LEAD', 'EHG_Engineer', 'Claude',
    v_orch_foundation::text,
    '["Kill gates implemented for stages 3, 5, 13, 23","Promotion gates implemented for stages 16, 17, 22","Gates integrate with Filter Engine thresholds"]'::jsonb,
    v_default_metrics,
    '["Complete kill gate coverage per lifecycle_stage_config","Enable Chairman decision points at critical stages"]'::jsonb,
    '[{"change":"Extend stage-gates.js with kill gate logic","type":"feature"},{"change":"Add promotion gate logic for 3 stages","type":"feature"}]'::jsonb,
    v_default_principles,
    '[]'::jsonb,
    '{"source":"plan","phase":"Foundation","child_index":5,"estimated_points":3,"depends_on":["SD-LEO-INFRA-FILTER-ENGINE-001"]}'::jsonb
  );

  -- #7: Eva Orchestrator v1
  INSERT INTO strategic_directives_v2 (
    id, sd_key, title, description, scope, rationale, sd_type, status, priority,
    category, current_phase, target_application, created_by, parent_sd_id,
    success_criteria, success_metrics, strategic_objectives, key_changes,
    key_principles, risks, metadata
  ) VALUES (
    v_eva_orchestrator::text,
    'SD-LEO-FEAT-EVA-ORCHESTRATOR-001',
    'Eva Orchestrator v1',
    'Core orchestration loop: load venture context, determine current stage, load template, execute analysis (sub-agents), run Filter Engine, present/auto-proceed, store artifacts, advance stage. Reuses VentureStateMachine for state management.',
    'New file: lib/eva/eva-orchestrator.js. Integrates with venture-context-manager, decision-filter-engine, reality-gates, stage-gates. Orchestrates stage execution loop.',
    'Eva is the central orchestrator that ties all foundation components together. This is the minimal viable orchestrator.',
    'feature', 'draft', 'high',
    'Feature', 'LEAD', 'EHG_Engineer', 'Claude',
    v_orch_foundation::text,
    '["Eva can execute a single stage end-to-end","Stage output stored in venture_artifacts","Filter Engine correctly invoked for auto-proceed decisions","Stage transitions respect gates"]'::jsonb,
    '[{"metric":"Stage execution","target":"Single stage E2E works"},{"metric":"Artifact storage","target":"100% of outputs persisted"},{"metric":"Gate integration","target":"All gates checked at transitions"}]'::jsonb,
    '["Create minimal viable Eva orchestrator","Integrate all foundation components into working loop"]'::jsonb,
    '[{"change":"Create lib/eva/eva-orchestrator.js","type":"feature"},{"change":"Implement stage execution loop with all integrations","type":"feature"}]'::jsonb,
    v_default_principles,
    '[{"risk":"Complex integration of 6 components","mitigation":"Build incrementally, test each integration point"}]'::jsonb,
    '{"source":"plan","phase":"Foundation","child_index":6,"estimated_points":8,"depends_on":["SD-LEO-INFRA-VENTURE-CONTEXT-001","SD-LEO-INFRA-SD-NAMESPACING-001","SD-LEO-INFRA-CHAIRMAN-PREFS-001","SD-LEO-INFRA-FILTER-ENGINE-001","SD-LEO-INFRA-REALITY-GATES-001","SD-LEO-INFRA-STAGE-GATES-EXT-001"]}'::jsonb
  );

  -- =============================================================================
  -- PHASE 1b: TEMPLATES ORCHESTRATOR
  -- =============================================================================
  INSERT INTO strategic_directives_v2 (
    id, sd_key, title, description, scope, rationale, sd_type, status, priority,
    category, current_phase, target_application, created_by, parent_sd_id,
    success_criteria, success_metrics, strategic_objectives, key_changes,
    key_principles, risks, metadata
  ) VALUES (
    v_orch_templates::text,
    'SD-LEO-ORCH-CLI-VL-TEMPLATES-001',
    'CLI Venture Lifecycle - Stage Templates',
    'Create 25 stage template files organized by lifecycle phase. Each template defines: input requirements, analysis prompt, output schema, sub-agents to invoke, validation rules, dashboard data extraction.',
    '6 children covering 6 lifecycle phases: THE TRUTH (1-5), THE ENGINE (6-9), THE IDENTITY (10-12), THE BLUEPRINT (13-16), THE BUILD LOOP (17-22), LAUNCH & LEARN (23-25). All parallelizable after Eva exists.',
    'Stage templates define what Eva does at each stage. Without templates, Eva has no stage-specific logic.',
    'orchestrator', 'draft', 'high',
    'Feature', 'LEAD', 'EHG_Engineer', 'Claude',
    v_top::text,
    '["All 25 stage templates created","Each template defines required fields","Templates integrate with Eva orchestrator"]'::jsonb,
    '[{"metric":"Template coverage","target":"25/25 stages"},{"metric":"Schema validation","target":"All output schemas defined"}]'::jsonb,
    '["Define stage-specific behavior for all 25 lifecycle stages","Enable Eva to execute any stage with proper structure"]'::jsonb,
    '[{"change":"Create lib/eva/stage-templates/stage-01 through stage-25","type":"feature"}]'::jsonb,
    v_default_principles,
    '[]'::jsonb,
    '{"source":"plan","phase":"Templates","children_count":6,"estimated_points":24,"depends_on":["SD-LEO-ORCH-CLI-VL-FOUNDATION-001"]}'::jsonb
  );

  -- Templates children (#8-#13)

  INSERT INTO strategic_directives_v2 (
    id, sd_key, title, description, scope, rationale, sd_type, status, priority,
    category, current_phase, target_application, created_by, parent_sd_id,
    success_criteria, success_metrics, strategic_objectives, key_changes,
    key_principles, risks, metadata
  ) VALUES
  -- #8: Templates THE TRUTH (Stages 1-5)
  (
    v_tmpl_truth,
    'SD-LEO-FEAT-TMPL-TRUTH-001',
    'Stage Templates: THE TRUTH (Stages 1-5)',
    'Create templates for Phase 1 stages: Draft Idea (structured input), AI Review (multi-model critique), Validation (KILL GATE, 6 metrics), Competitive Intel (competitor cards), Profitability (KILL GATE, 3-year model).',
    'Files: lib/eva/stage-templates/stage-01.js through stage-05.js. Includes kill gate integration for stages 3 and 5.',
    'THE TRUTH phase validates whether a venture idea is worth pursuing. Kill gates at 3 and 5 can terminate ventures.',
    'feature', 'draft', 'high',
    'Feature', 'LEAD', 'EHG_Engineer', 'Claude',
    v_orch_templates::text,
    '["5 stage templates created with proper schemas","Kill gates integrated for stages 3 and 5","6-metric validation scoring implemented for stage 3","3-year financial model template for stage 5"]'::jsonb,
    v_default_metrics,
    '["Implement venture validation stages","Enable kill decisions at critical checkpoints"]'::jsonb,
    '[{"change":"Create stage-01 through stage-05 templates","type":"feature"}]'::jsonb,
    v_default_principles, '[]'::jsonb,
    '{"source":"plan","phase":"Templates","child_index":0,"estimated_points":5,"stages":"1-5"}'::jsonb
  ),
  -- #9: Templates THE ENGINE (Stages 6-9)
  (
    v_tmpl_engine,
    'SD-LEO-FEAT-TMPL-ENGINE-001',
    'Stage Templates: THE ENGINE (Stages 6-9)',
    'Create templates for Phase 2 stages: Risk Matrix (category x severity x probability x impact), Pricing (tier structure, unit economics), BMC (9-block Business Model Canvas), Exit Strategy (timeline, valuation, targets).',
    'Files: lib/eva/stage-templates/stage-06.js through stage-09.js. Reality gate at phase 2->3 boundary.',
    'THE ENGINE phase builds the business model foundations.',
    'feature', 'draft', 'medium',
    'Feature', 'LEAD', 'EHG_Engineer', 'Claude',
    v_orch_templates::text,
    '["4 stage templates created","Risk matrix template produces structured output","BMC template covers all 9 blocks"]'::jsonb,
    v_default_metrics,
    '["Implement business model stages","Enable structured risk and pricing analysis"]'::jsonb,
    '[{"change":"Create stage-06 through stage-09 templates","type":"feature"}]'::jsonb,
    v_default_principles, '[]'::jsonb,
    '{"source":"plan","phase":"Templates","child_index":1,"estimated_points":3,"stages":"6-9"}'::jsonb
  ),
  -- #10: Templates THE IDENTITY (Stages 10-12)
  (
    v_tmpl_identity,
    'SD-LEO-FEAT-TMPL-IDENTITY-001',
    'Stage Templates: THE IDENTITY (Stages 10-12)',
    'Create templates for Phase 3 stages: Naming/Brand (brand genome, scoring), GTM (3-tier targets, 8 channels, budget/CAC), Sales Logic (funnel stages, metrics, customer journey).',
    'Files: lib/eva/stage-templates/stage-10.js through stage-12.js. Stage 10 requires SD creation. Reality gate at phase 3->4.',
    'THE IDENTITY phase establishes brand and go-to-market strategy.',
    'feature', 'draft', 'medium',
    'Feature', 'LEAD', 'EHG_Engineer', 'Claude',
    v_orch_templates::text,
    '["3 stage templates created","Brand naming template integrates scoring criteria","GTM template covers 8 acquisition channels"]'::jsonb,
    v_default_metrics,
    '["Implement brand and go-to-market stages","Enable structured market analysis"]'::jsonb,
    '[{"change":"Create stage-10 through stage-12 templates","type":"feature"}]'::jsonb,
    v_default_principles, '[]'::jsonb,
    '{"source":"plan","phase":"Templates","child_index":2,"estimated_points":3,"stages":"10-12"}'::jsonb
  ),
  -- #11: Templates THE BLUEPRINT (Stages 13-16)
  (
    v_tmpl_blueprint,
    'SD-LEO-FEAT-TMPL-BLUEPRINT-001',
    'Stage Templates: THE BLUEPRINT (Stages 13-16)',
    'Create templates for Phase 4 stages: Tech Stack (KILL GATE, 8 viability criteria), Data Model (ERD, RLS), User Stories (epics, As a/I want/So that, MoSCoW), Schema Firewall (PROMOTION GATE, 12-check validation).',
    'Files: lib/eva/stage-templates/stage-13.js through stage-16.js. Kill gate at 13, promotion gate at 16. Stages 14-15 create SDs.',
    'THE BLUEPRINT phase designs the technical foundation. Kill gate at tech stack, promotion gate at schema firewall.',
    'feature', 'draft', 'high',
    'Feature', 'LEAD', 'EHG_Engineer', 'Claude',
    v_orch_templates::text,
    '["4 stage templates created","Tech stack kill gate with 8 criteria and 60% threshold","Schema firewall promotion gate with 12-check validation","User story template supports INVEST compliance"]'::jsonb,
    v_default_metrics,
    '["Implement technical design stages","Enable structured architecture decisions"]'::jsonb,
    '[{"change":"Create stage-13 through stage-16 templates","type":"feature"}]'::jsonb,
    v_default_principles, '[]'::jsonb,
    '{"source":"plan","phase":"Templates","child_index":3,"estimated_points":5,"stages":"13-16"}'::jsonb
  ),
  -- #12: Templates THE BUILD LOOP (Stages 17-22)
  (
    v_tmpl_build,
    'SD-LEO-FEAT-TMPL-BUILD-001',
    'Stage Templates: THE BUILD LOOP (Stages 17-22)',
    'Create templates for Phase 5 stages: Environment (PROMOTION GATE), MVP Dev Loop (sprint plans, velocity, Lifecycle-to-SD Bridge), API Layer (specs, integrations), Security/Perf (OWASP, benchmarks), QA/UAT (test cases, bug tracking), Deployment (PROMOTION GATE, 14-item checklist).',
    'Files: lib/eva/stage-templates/stage-17.js through stage-22.js. Promotion gates at 17 and 22. Stage 18 bridges to LEO SDs.',
    'THE BUILD LOOP phase handles actual development. Stage 18 is the Lifecycle-to-SD Bridge where sprint items become real LEO SDs.',
    'feature', 'draft', 'high',
    'Feature', 'LEAD', 'EHG_Engineer', 'Claude',
    v_orch_templates::text,
    '["6 stage templates created","Promotion gates at stages 17 and 22","Stage 18 template supports sprint-to-SD bridge","Deployment checklist covers 14 items"]'::jsonb,
    v_default_metrics,
    '["Implement build and deployment stages","Enable sprint-to-SD bridge for real development"]'::jsonb,
    '[{"change":"Create stage-17 through stage-22 templates","type":"feature"}]'::jsonb,
    v_default_principles, '[]'::jsonb,
    '{"source":"plan","phase":"Templates","child_index":4,"estimated_points":5,"stages":"17-22"}'::jsonb
  ),
  -- #13: Templates LAUNCH & LEARN (Stages 23-25)
  (
    v_tmpl_launch,
    'SD-LEO-FEAT-TMPL-LAUNCH-001',
    'Stage Templates: LAUNCH & LEARN (Stages 23-25)',
    'Create templates for Phase 6 stages: Launch (KILL GATE, Go/No-Go, incident response), Analytics (AARRR pirate metrics, 5 categories, trends), Scale Planning (5-category initiatives, milestones, constraint drift check).',
    'Files: lib/eva/stage-templates/stage-23.js through stage-25.js. Kill gate at 23. Stage 25 re-surfaces Stage 1 vision for drift check.',
    'LAUNCH & LEARN phase handles production deployment and post-launch metrics.',
    'feature', 'draft', 'medium',
    'Feature', 'LEAD', 'EHG_Engineer', 'Claude',
    v_orch_templates::text,
    '["3 stage templates created","Launch kill gate with Go/No-Go decision","AARRR metrics template covers 5 categories","Stage 25 includes constraint drift detection vs Stage 1 vision"]'::jsonb,
    v_default_metrics,
    '["Implement launch and analytics stages","Enable post-launch monitoring and scale planning"]'::jsonb,
    '[{"change":"Create stage-23 through stage-25 templates","type":"feature"}]'::jsonb,
    v_default_principles, '[]'::jsonb,
    '{"source":"plan","phase":"Templates","child_index":5,"estimated_points":3,"stages":"23-25"}'::jsonb
  );

  -- =============================================================================
  -- PHASE 2a: INTELLIGENCE ORCHESTRATOR
  -- =============================================================================
  INSERT INTO strategic_directives_v2 (
    id, sd_key, title, description, scope, rationale, sd_type, status, priority,
    category, current_phase, target_application, created_by, parent_sd_id,
    success_criteria, success_metrics, strategic_objectives, key_changes,
    key_principles, risks, metadata
  ) VALUES (
    v_orch_intelligence::text,
    'SD-LEO-ORCH-CLI-VL-INTELLIGENCE-001',
    'CLI Venture Lifecycle - Intelligence Layer',
    'Advanced intelligence components: model-isolated Devil''s Advocate (GPT-4o), Lifecycle-to-SD Bridge, ported frontend services, constraint drift detection.',
    '4 children: Devil''s Advocate, Lifecycle-to-SD Bridge, Service Ports, Constraint Drift. Requires Foundation complete.',
    'Intelligence layer adds adversarial review, automatic SD generation, and drift detection on top of the foundation.',
    'orchestrator', 'draft', 'medium',
    'Feature', 'LEAD', 'EHG_Engineer', 'Claude',
    v_top::text,
    '["All 4 intelligence components implemented","Devil''s Advocate provides adversarial review at gates","Lifecycle-to-SD Bridge creates real SDs from sprint plans"]'::jsonb,
    '[{"metric":"Component completion","target":"4/4 intelligence components"},{"metric":"Devil''s Advocate coverage","target":"Active at all kill/promotion gates"}]'::jsonb,
    '["Add adversarial AI review capability","Enable automatic SD generation from lifecycle","Detect constraint drift across stages"]'::jsonb,
    '[{"change":"Create 4 intelligence layer components","type":"feature"}]'::jsonb,
    v_default_principles,
    '[]'::jsonb,
    '{"source":"plan","phase":"Intelligence","children_count":4,"estimated_points":18,"depends_on":["SD-LEO-ORCH-CLI-VL-FOUNDATION-001"]}'::jsonb
  );

  -- Intelligence children (#14-#17)
  INSERT INTO strategic_directives_v2 (
    id, sd_key, title, description, scope, rationale, sd_type, status, priority,
    category, current_phase, target_application, created_by, parent_sd_id,
    success_criteria, success_metrics, strategic_objectives, key_changes,
    key_principles, risks, metadata
  ) VALUES
  -- #14: Devil's Advocate
  (
    v_devils_advocate,
    'SD-LEO-FEAT-DEVILS-ADVOCATE-001',
    'Model-Isolated Devil''s Advocate',
    'Use LLM client factory to route adversarial review to GPT-4o (model-isolated per Chairman Decision D04). Eva sends analysis to Devil''s Advocate at decision gates for counter-arguments.',
    'New file: lib/eva/devils-advocate.js. Uses lib/llm/client-factory.js for GPT-4o routing. Invoked at kill gates (3,5,13,23) and promotion gates (16,17,22).',
    'Chairman Decision D04: Model-isolated Devil''s Advocate. GPT-4o provides independent adversarial perspective to prevent confirmation bias.',
    'feature', 'draft', 'medium',
    'Feature', 'LEAD', 'EHG_Engineer', 'Claude',
    v_orch_intelligence::text,
    '["Devil''s Advocate invoked at all kill/promotion gates","GPT-4o routed via LLM client factory","Counter-arguments stored in venture_artifacts","Chairman sees both Eva analysis and Devil''s Advocate response"]'::jsonb,
    v_default_metrics,
    '["Provide adversarial review at critical decision points","Prevent confirmation bias in venture evaluation"]'::jsonb,
    '[{"change":"Create lib/eva/devils-advocate.js","type":"feature"},{"change":"Integrate GPT-4o via LLM client factory","type":"feature"}]'::jsonb,
    v_default_principles, '[]'::jsonb,
    '{"source":"plan","phase":"Intelligence","child_index":0,"estimated_points":5,"depends_on":["SD-LEO-FEAT-EVA-ORCHESTRATOR-001"]}'::jsonb
  ),
  -- #15: Lifecycle-to-SD Bridge
  (
    v_lifecycle_bridge,
    'SD-LEO-FEAT-LIFECYCLE-SD-BRIDGE-001',
    'Lifecycle-to-SD Bridge',
    'Stage 18 sprint plans generate real LEO SDs. Sprint items become orchestrator children. Maps sprint features to SD types, creates SDs with venture namespace, tracks progress through LEO protocol.',
    'New file: lib/eva/lifecycle-sd-bridge.js. Integrates with leo-create-sd.js and sd-key-generator.js. Creates orchestrator SD for sprint with child SDs for features.',
    'The bridge from venture lifecycle to LEO execution. Sprint plans at Stage 18 become actionable SDs.',
    'feature', 'draft', 'medium',
    'Feature', 'LEAD', 'EHG_Engineer', 'Claude',
    v_orch_intelligence::text,
    '["Sprint plans create orchestrator SDs","Sprint items become child SDs with venture namespace","SDs created via leo-create-sd.js (not direct insert)","Progress tracked through standard LEO workflow"]'::jsonb,
    v_default_metrics,
    '["Bridge lifecycle planning to LEO execution","Enable automated SD creation from sprint plans"]'::jsonb,
    '[{"change":"Create lib/eva/lifecycle-sd-bridge.js","type":"feature"}]'::jsonb,
    v_default_principles, '[]'::jsonb,
    '{"source":"plan","phase":"Intelligence","child_index":1,"estimated_points":5,"depends_on":["SD-LEO-INFRA-SD-NAMESPACING-001","SD-LEO-FEAT-EVA-ORCHESTRATOR-001"]}'::jsonb
  ),
  -- #16: Port Frontend Services to CLI
  (
    v_service_ports,
    'SD-LEO-FEAT-SERVICE-PORTS-001',
    'Port Frontend Services to CLI',
    'Port key frontend services to CLI-compatible versions: ventureResearch, competitiveIntelligenceService, brandGenomeService. These provide structured data that stage templates can use instead of raw Opus generation.',
    'Port from EHG/src/services/: ventureResearch.ts, competitiveIntelligenceService.ts, brandGenomeService.ts. Create CLI-compatible JS versions in lib/eva/services/.',
    'Frontend services have structured logic that produces better output than raw LLM generation. Porting them improves CLI output quality.',
    'feature', 'draft', 'medium',
    'Feature', 'LEAD', 'EHG_Engineer', 'Claude',
    v_orch_intelligence::text,
    '["3 frontend services ported to CLI-compatible JS","Services produce same structured output as frontend versions","Stage templates use ported services when available"]'::jsonb,
    v_default_metrics,
    '["Reuse proven frontend service logic in CLI","Improve output quality over raw LLM generation"]'::jsonb,
    '[{"change":"Port ventureResearch, competitiveIntelligence, brandGenome services","type":"feature"}]'::jsonb,
    v_default_principles, '[]'::jsonb,
    '{"source":"plan","phase":"Intelligence","child_index":2,"estimated_points":5,"depends_on":["SD-LEO-FEAT-EVA-ORCHESTRATOR-001"]}'::jsonb
  ),
  -- #17: Constraint Drift Detection
  (
    v_constraint_drift,
    'SD-LEO-FEAT-CONSTRAINT-DRIFT-001',
    'Constraint Drift Detection',
    'Detect when later stage outputs contradict or drift from earlier stage assumptions. Stage 25 re-surfaces Stage 1 vision to check for drift. Uses assumption_sets table for tracking.',
    'New file: lib/eva/constraint-drift-detector.js. Queries assumption_sets and venture_artifacts. Compares current stage outputs against original assumptions.',
    'Over 25 stages, assumptions can drift. Detection ensures the venture stays aligned with original vision.',
    'feature', 'draft', 'low',
    'Feature', 'LEAD', 'EHG_Engineer', 'Claude',
    v_orch_intelligence::text,
    '["Drift detection compares current vs original assumptions","Stage 25 explicitly checks against Stage 1 vision","Drift triggers flagged to Chairman via Filter Engine"]'::jsonb,
    v_default_metrics,
    '["Detect assumption drift across venture lifecycle","Ensure long-running ventures stay aligned with original vision"]'::jsonb,
    '[{"change":"Create lib/eva/constraint-drift-detector.js","type":"feature"}]'::jsonb,
    v_default_principles, '[]'::jsonb,
    '{"source":"plan","phase":"Intelligence","child_index":3,"estimated_points":3,"depends_on":["SD-LEO-FEAT-EVA-ORCHESTRATOR-001"]}'::jsonb
  );

  -- =============================================================================
  -- PHASE 2b: DASHBOARD ORCHESTRATOR
  -- =============================================================================
  INSERT INTO strategic_directives_v2 (
    id, sd_key, title, description, scope, rationale, sd_type, status, priority,
    category, current_phase, target_application, created_by, parent_sd_id,
    success_criteria, success_metrics, strategic_objectives, key_changes,
    key_principles, risks, metadata
  ) VALUES (
    v_orch_dashboard::text,
    'SD-LEO-ORCH-CLI-VL-DASHBOARD-001',
    'CLI Venture Lifecycle - Dashboard',
    'Read-only lightweight web dashboard for visual venture data. Reads venture_artifacts via Supabase. Chairman Decision D03: Lightweight Dashboard. In EHG frontend repo.',
    '4 children: Overview, Financial Charts, Competitive Intelligence, Build Visualizations. All parallelizable. EHG frontend repo.',
    'Some stage outputs need visual representation (charts, matrices, ERDs). Dashboard provides read-only views.',
    'orchestrator', 'draft', 'medium',
    'Feature', 'LEAD', 'EHG', 'Claude',
    v_top::text,
    '["Dashboard renders venture data from database","All 4 view categories implemented","Read-only (no mutations from dashboard)"]'::jsonb,
    '[{"metric":"View coverage","target":"4/4 dashboard categories"},{"metric":"Data source","target":"100% from venture_artifacts table"}]'::jsonb,
    '["Provide visual representation of venture lifecycle data","Enable Chairman to review ventures visually"]'::jsonb,
    '[{"change":"Create venture-dashboard route in EHG frontend","type":"feature"}]'::jsonb,
    v_default_principles,
    '[]'::jsonb,
    '{"source":"plan","phase":"Dashboard","children_count":4,"estimated_points":18,"target_repo":"EHG"}'::jsonb
  );

  -- Dashboard children (#18-#21)
  INSERT INTO strategic_directives_v2 (
    id, sd_key, title, description, scope, rationale, sd_type, status, priority,
    category, current_phase, target_application, created_by, parent_sd_id,
    success_criteria, success_metrics, strategic_objectives, key_changes,
    key_principles, risks, metadata
  ) VALUES
  (
    v_dash_overview,
    'SD-EHG-FEAT-DASH-OVERVIEW-001',
    'Dashboard: Venture Overview',
    'Main dashboard view showing venture list, current stage progress, phase completion, and key metrics summary. Entry point for all other dashboard views.',
    'EHG frontend: src/components/venture-dashboard/VentureOverview.tsx, src/pages/venture-dashboard.tsx. Route: /venture-dashboard.',
    'Overview is the landing page for the dashboard. Shows all ventures and their lifecycle progress.',
    'feature', 'draft', 'medium',
    'Feature', 'LEAD', 'EHG', 'Claude',
    v_orch_dashboard::text,
    '["Venture list renders from database","Stage progress shown per venture","Phase completion percentages displayed"]'::jsonb,
    v_default_metrics,
    '["Provide venture lifecycle overview","Enable quick status assessment"]'::jsonb,
    '[{"change":"Create VentureOverview component and route","type":"feature"}]'::jsonb,
    v_default_principles, '[]'::jsonb,
    '{"source":"plan","phase":"Dashboard","child_index":0,"estimated_points":5}'::jsonb
  ),
  (
    v_dash_financial,
    'SD-EHG-FEAT-DASH-FINANCIAL-001',
    'Dashboard: Financial Charts',
    'Financial visualization: 3-year projection charts, break-even analysis, ROI tracking, funding requirements. Renders data from Stage 5 (Profitability) artifacts.',
    'EHG frontend: src/components/venture-dashboard/FinancialCharts.tsx. Chart library for projections.',
    'Financial data from Stage 5 needs visual representation for Chairman review.',
    'feature', 'draft', 'medium',
    'Feature', 'LEAD', 'EHG', 'Claude',
    v_orch_dashboard::text,
    '["3-year projection chart renders","Break-even analysis visualization","ROI threshold comparison displayed"]'::jsonb,
    v_default_metrics,
    '["Visualize financial projections","Enable data-driven investment decisions"]'::jsonb,
    '[{"change":"Create FinancialCharts component","type":"feature"}]'::jsonb,
    v_default_principles, '[]'::jsonb,
    '{"source":"plan","phase":"Dashboard","child_index":1,"estimated_points":5}'::jsonb
  ),
  (
    v_dash_competitive,
    'SD-EHG-FEAT-DASH-COMPETITIVE-001',
    'Dashboard: Competitive Intelligence',
    'Competitive landscape visualization: competitor scatter plot, feature comparison matrix, SWOT panels, threat level indicators. Renders data from Stage 4 artifacts.',
    'EHG frontend: src/components/venture-dashboard/CompetitiveIntel.tsx.',
    'Competitive intelligence data from Stage 4 needs visual representation.',
    'feature', 'draft', 'medium',
    'Feature', 'LEAD', 'EHG', 'Claude',
    v_orch_dashboard::text,
    '["Competitor scatter plot renders","Feature matrix comparison displayed","Threat levels color-coded"]'::jsonb,
    v_default_metrics,
    '["Visualize competitive landscape","Enable competitive position assessment"]'::jsonb,
    '[{"change":"Create CompetitiveIntel component","type":"feature"}]'::jsonb,
    v_default_principles, '[]'::jsonb,
    '{"source":"plan","phase":"Dashboard","child_index":2,"estimated_points":3}'::jsonb
  ),
  (
    v_dash_build,
    'SD-EHG-FEAT-DASH-BUILD-001',
    'Dashboard: Build Visualizations',
    'Build phase visualizations: sprint board with status tracking, burndown chart, ERD diagram (Mermaid), AARRR metrics cards, deployment checklist progress. Covers stages 17-25 data.',
    'EHG frontend: src/components/venture-dashboard/BuildDashboard.tsx.',
    'Build phase (stages 17-25) produces extensive data that needs visual tracking.',
    'feature', 'draft', 'medium',
    'Feature', 'LEAD', 'EHG', 'Claude',
    v_orch_dashboard::text,
    '["Sprint board renders with status tracking","AARRR metrics displayed in 5 categories","ERD renders via Mermaid","Deployment checklist shows progress"]'::jsonb,
    v_default_metrics,
    '["Visualize build phase progress","Enable sprint and deployment tracking"]'::jsonb,
    '[{"change":"Create BuildDashboard component","type":"feature"}]'::jsonb,
    v_default_principles, '[]'::jsonb,
    '{"source":"plan","phase":"Dashboard","child_index":3,"estimated_points":5}'::jsonb
  );

  -- =============================================================================
  -- PHASE 3: LEARNING (Direct children of top-level)
  -- =============================================================================
  INSERT INTO strategic_directives_v2 (
    id, sd_key, title, description, scope, rationale, sd_type, status, priority,
    category, current_phase, target_application, created_by, parent_sd_id,
    success_criteria, success_metrics, strategic_objectives, key_changes,
    key_principles, risks, metadata
  ) VALUES
  -- #22: Cross-Venture Pattern Learning
  (
    v_cross_venture,
    'SD-LEO-FEAT-CROSS-VENTURE-001',
    'Cross-Venture Pattern Learning',
    'After 5+ ventures, analyze patterns across ventures: which stages kill most ventures, common assumptions that fail, successful patterns worth replicating. Store learnings for Filter Engine calibration.',
    'New file: lib/eva/cross-venture-learning.js. Queries venture_artifacts and chairman_decisions across ventures. Generates pattern reports.',
    'Learning from multiple ventures improves future evaluation accuracy. Only viable after 5+ ventures with mixed outcomes.',
    'feature', 'draft', 'low',
    'Feature', 'LEAD', 'EHG_Engineer', 'Claude',
    v_top::text,
    '["Cross-venture analysis produces actionable patterns","Kill stage frequency analysis available","Successful patterns identified and documented"]'::jsonb,
    v_default_metrics,
    '["Learn from venture portfolio outcomes","Improve future venture evaluation accuracy"]'::jsonb,
    '[{"change":"Create lib/eva/cross-venture-learning.js","type":"feature"}]'::jsonb,
    v_default_principles, '[]'::jsonb,
    '{"source":"plan","phase":"Learning","child_index":0,"estimated_points":5,"depends_on":["5+ ventures completed"]}'::jsonb
  ),
  -- #23: Filter Threshold Calibration
  (
    v_filter_calibrate,
    'SD-LEO-FEAT-FILTER-CALIBRATE-001',
    'Filter Threshold Calibration',
    'Calibrate Filter Engine thresholds based on actual venture outcomes. Compare Filter Engine auto-proceed decisions against Chairman overrides to identify threshold drift. Adjust thresholds to reduce false positives/negatives.',
    'Extend lib/eva/decision-filter-engine.js with calibration module. Analyze chairman_decisions vs filter_decisions correlation.',
    'Filter Engine thresholds set initially may not be optimal. Calibration from real data improves accuracy.',
    'feature', 'draft', 'low',
    'Feature', 'LEAD', 'EHG_Engineer', 'Claude',
    v_top::text,
    '["Calibration analysis compares filter vs chairman decisions","False positive/negative rates calculated","Threshold adjustment recommendations generated"]'::jsonb,
    v_default_metrics,
    '["Calibrate Filter Engine from real outcomes","Reduce Chairman intervention over time"]'::jsonb,
    '[{"change":"Add calibration module to decision-filter-engine.js","type":"feature"}]'::jsonb,
    v_default_principles, '[]'::jsonb,
    '{"source":"plan","phase":"Learning","child_index":1,"estimated_points":3,"depends_on":["5+ ventures completed","SD-LEO-INFRA-FILTER-ENGINE-001"]}'::jsonb
  );

  -- =============================================================================
  -- ENRICH WITH PLAN AND CODEBASE REFERENCES
  -- =============================================================================

  -- Add plan file reference and codebase references to ALL SDs
  UPDATE strategic_directives_v2
  SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md',
    'plan_archived_path', 'docs/plans/archived/cli-venture-lifecycle-plan.md',
    'created_via', 'batch-migration-from-approved-plan',
    'chairman_decisions', jsonb_build_array(
      'D01: Filter Engine (not Prediction) - deterministic risk thresholds',
      'D02: Always-on Reality Gates - deployed artifacts required',
      'D03: Lightweight Dashboard - read-only web companion',
      'D04: Model-isolated Devil''s Advocate - GPT-4o via LLM client factory',
      'D05: Natural negative data - wait for organic rejections',
      'D06: Full LEO SDs - LEAD->PLAN->EXEC for everything'
    )
  )
  WHERE id = v_top::text;

  -- Foundation children: add reference files
  UPDATE strategic_directives_v2 SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md',
    'reference_files', jsonb_build_array(
      'lib/agents/venture-state-machine.js',
      'database/schema/ventures_table.sql',
      'lib/agents/modules/venture-state-machine/stage-gates.js'
    ),
    'existing_tables', jsonb_build_array('ventures', 'claude_sessions', 'venture_artifacts', 'lifecycle_stage_config')
  )
  WHERE id = v_venture_context::text;

  UPDATE strategic_directives_v2 SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md',
    'reference_files', jsonb_build_array(
      'scripts/modules/sd-key-generator.js',
      'scripts/leo-create-sd.js',
      'scripts/modules/sd-next/index.js'
    )
  )
  WHERE id = v_sd_namespacing::text;

  UPDATE strategic_directives_v2 SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md',
    'reference_files', jsonb_build_array(
      'database/schema/chairman_decisions_table.sql'
    ),
    'existing_tables', jsonb_build_array('chairman_decisions'),
    'new_tables', jsonb_build_array('chairman_preferences')
  )
  WHERE id = v_chairman_prefs::text;

  UPDATE strategic_directives_v2 SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md',
    'reference_files', jsonb_build_array(
      'lib/agents/modules/venture-state-machine/stage-gates.js',
      'database/schema/lifecycle_stage_config.sql'
    ),
    'existing_tables', jsonb_build_array('lifecycle_stage_config', 'chairman_preferences')
  )
  WHERE id = v_filter_engine::text;

  UPDATE strategic_directives_v2 SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md',
    'reference_files', jsonb_build_array(
      'lib/agents/modules/venture-state-machine/stage-gates.js',
      'database/schema/venture_artifacts.sql'
    ),
    'existing_tables', jsonb_build_array('venture_artifacts', 'venture_stage_transitions')
  )
  WHERE id = v_reality_gates::text;

  UPDATE strategic_directives_v2 SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md',
    'reference_files', jsonb_build_array(
      'lib/agents/modules/venture-state-machine/stage-gates.js',
      'database/schema/lifecycle_stage_config.sql'
    ),
    'stage_gate_config', jsonb_build_object(
      'kill_gates', jsonb_build_array(3, 5, 13, 23),
      'promotion_gates', jsonb_build_array(16, 17, 22),
      'advisory_checkpoints', jsonb_build_array(3, 5, 16)
    )
  )
  WHERE id = v_stage_gates_ext::text;

  UPDATE strategic_directives_v2 SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md',
    'reference_files', jsonb_build_array(
      'lib/agents/venture-state-machine.js',
      'lib/agents/modules/venture-state-machine/stage-gates.js',
      'lib/eva/venture-context-manager.js',
      'lib/eva/decision-filter-engine.js',
      'lib/eva/reality-gates.js'
    ),
    'core_loop', 'load venture context -> determine stage -> load template -> execute analysis -> run Filter Engine -> present/auto-proceed -> store artifacts -> advance stage'
  )
  WHERE id = v_eva_orchestrator::text;

  -- Template SDs: add GUI component references
  UPDATE strategic_directives_v2 SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md',
    'gui_stage_components', jsonb_build_array(
      'EHG/src/components/stages/v2/Stage01DraftIdea.tsx',
      'EHG/src/components/stages/v2/Stage02AIReview.tsx',
      'EHG/src/components/stages/v2/Stage03Validation.tsx',
      'EHG/src/components/stages/v2/Stage04CompetitiveIntel.tsx',
      'EHG/src/components/stages/v2/Stage05Profitability.tsx'
    ),
    'stage_details', jsonb_build_object(
      'stage_1', 'Draft Idea: structured input (description 50 char min, value prop, target market)',
      'stage_2', 'AI Review: multi-model critique with composite scoring',
      'stage_3', 'KILL GATE: 6-metric validation (Market Fit, Customer Need, Momentum, Revenue Potential, Competitive Barrier, Execution Feasibility) 0-100 each',
      'stage_4', 'Competitive Intel: competitor cards (position, threat H/M/L, strengths/weaknesses, SWOT)',
      'stage_5', 'KILL GATE: 3-year model, break-even calc, ROI threshold 15%, funding requirements'
    )
  )
  WHERE id = v_tmpl_truth::text;

  UPDATE strategic_directives_v2 SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md',
    'gui_stage_components', jsonb_build_array(
      'EHG/src/components/stages/v2/Stage06RiskEvaluation.tsx',
      'EHG/src/components/stages/v2/Stage07Pricing.tsx',
      'EHG/src/components/stages/v2/Stage08BMC.tsx',
      'EHG/src/components/stages/v2/Stage09ExitStrategy.tsx'
    ),
    'stage_details', jsonb_build_object(
      'stage_6', 'Risk Matrix: category x severity x probability x impact, mitigation strategies',
      'stage_7', 'Pricing: tier structure, unit economics (CAC/LTV/payback)',
      'stage_8', 'BMC: 9-block Business Model Canvas',
      'stage_9', 'Exit Strategy: timeline, valuation, target acquirers. Reality Gate at Phase 2->3'
    )
  )
  WHERE id = v_tmpl_engine::text;

  UPDATE strategic_directives_v2 SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md',
    'gui_stage_components', jsonb_build_array(
      'EHG/src/components/stages/v2/Stage10Naming.tsx',
      'EHG/src/components/stages/v2/Stage11GTM.tsx',
      'EHG/src/components/stages/v2/Stage12SalesLogic.tsx'
    ),
    'frontend_services', jsonb_build_array(
      'EHG/src/services/brandGenomeService.ts'
    ),
    'stage_details', jsonb_build_object(
      'stage_10', 'Naming/Brand (SD required): brand genome service, naming candidates with scoring',
      'stage_11', 'GTM: 3-tier target markets, 8 acquisition channels with budget/CAC, launch timeline',
      'stage_12', 'Sales Logic: funnel stages, success metrics, customer journey mapping. Reality Gate at Phase 3->4'
    )
  )
  WHERE id = v_tmpl_identity::text;

  UPDATE strategic_directives_v2 SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md',
    'gui_stage_components', jsonb_build_array(
      'EHG/src/components/stages/v2/Stage13TechStack.tsx',
      'EHG/src/components/stages/v2/Stage14DataModel.tsx',
      'EHG/src/components/stages/v2/Stage15UserStories.tsx',
      'EHG/src/components/stages/v2/Stage16SchemaFirewall.tsx'
    ),
    'stage_details', jsonb_build_object(
      'stage_13', 'KILL GATE: 8 viability criteria (1-5 scale), 60% threshold, risk levels',
      'stage_14', 'Data Model (SD required): entity builder with fields, types, constraints, relationships, RLS',
      'stage_15', 'User Stories (SD required): epic builder, As a/I want/So that, story points, MoSCoW, INVEST',
      'stage_16', 'PROMOTION GATE: 12-check validation across 4 categories, 80% threshold, Chairman signature. Reality Gate at Phase 4->5'
    )
  )
  WHERE id = v_tmpl_blueprint::text;

  UPDATE strategic_directives_v2 SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md',
    'gui_stage_components', jsonb_build_array(
      'EHG/src/components/stages/v2/Stage17Environment.tsx',
      'EHG/src/components/stages/v2/Stage18MVPDevLoop.tsx',
      'EHG/src/components/stages/v2/Stage19APILayer.tsx',
      'EHG/src/components/stages/v2/Stage20SecurityPerf.tsx',
      'EHG/src/components/stages/v2/Stage21QUAT.tsx',
      'EHG/src/components/stages/v2/Stage22Deployment.tsx'
    ),
    'stage_details', jsonb_build_object(
      'stage_17', 'PROMOTION GATE: Dev/staging/prod setup, secrets management, Chairman approval',
      'stage_18', 'MVP Dev Loop (SD required): sprint items with status, velocity, retrospectives. LIFECYCLE-TO-SD BRIDGE',
      'stage_19', 'API Layer (SD required): endpoint specs, auth types, status, external integrations',
      'stage_20', 'Security/Perf (SD required): OWASP compliance, benchmarks, load testing. Stop if critical vulnerability',
      'stage_21', 'QA/UAT (SD required): test cases, bug tracking, UAT sign-off. Gate: 100% UAT pass, 95% automated',
      'stage_22', 'PROMOTION GATE: 14-item pre-deploy checklist, strategy selection, rollback, Chairman approval'
    )
  )
  WHERE id = v_tmpl_build::text;

  UPDATE strategic_directives_v2 SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md',
    'gui_stage_components', jsonb_build_array(
      'EHG/src/components/stages/v2/Stage23Launch.tsx',
      'EHG/src/components/stages/v2/Stage24Analytics.tsx',
      'EHG/src/components/stages/v2/Stage25ScalePlanning.tsx'
    ),
    'stage_details', jsonb_build_object(
      'stage_23', 'KILL GATE: Final Go/No-Go, incident response setup, post-launch monitoring',
      'stage_24', 'Analytics: AARRR pirate metrics (Acquisition, Activation, Retention, Revenue, Referral), trend tracking, sentiment, funnels',
      'stage_25', 'Scale (SD required): 5-category initiatives (infra/team/market/product/funding), milestones. CONSTRAINT DRIFT CHECK vs Stage 1'
    )
  )
  WHERE id = v_tmpl_launch::text;

  -- Intelligence SDs: add reference files
  UPDATE strategic_directives_v2 SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md',
    'reference_files', jsonb_build_array(
      'lib/llm/client-factory.js',
      'lib/sub-agents/vetting/provider-adapters.js',
      'config/phase-model-routing.json'
    ),
    'llm_routing', 'GPT-4o via LLM client factory OpenAI adapter'
  )
  WHERE id = v_devils_advocate::text;

  UPDATE strategic_directives_v2 SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md',
    'reference_files', jsonb_build_array(
      'scripts/leo-create-sd.js',
      'scripts/modules/sd-key-generator.js',
      'lib/eva/venture-context-manager.js'
    )
  )
  WHERE id = v_lifecycle_bridge::text;

  UPDATE strategic_directives_v2 SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md',
    'frontend_services_to_port', jsonb_build_array(
      'EHG/src/services/ventureResearch.ts',
      'EHG/src/services/competitiveIntelligenceService.ts',
      'EHG/src/services/brandGenomeService.ts'
    ),
    'port_target_dir', 'lib/eva/services/'
  )
  WHERE id = v_service_ports::text;

  UPDATE strategic_directives_v2 SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md',
    'reference_files', jsonb_build_array(
      'lib/eva/decision-filter-engine.js'
    ),
    'existing_tables', jsonb_build_array('assumption_sets', 'venture_artifacts')
  )
  WHERE id = v_constraint_drift::text;

  -- Dashboard SDs: add plan references
  UPDATE strategic_directives_v2 SET metadata = metadata || jsonb_build_object(
    'plan_file_path', '~/.claude/plans/radiant-wibbling-starlight.md'
  ) WHERE id IN (v_orch_foundation::text, v_orch_templates::text, v_orch_intelligence::text, v_orch_dashboard::text, v_dash_overview::text, v_dash_financial::text, v_dash_competitive::text, v_dash_build::text, v_cross_venture::text, v_filter_calibrate::text);

  -- =============================================================================
  -- SET DEPENDENCY CHAINS
  -- =============================================================================

  -- Foundation children dependencies (using metadata.depends_on for reference)
  -- SD Namespacing depends on Venture Context
  UPDATE strategic_directives_v2
  SET dependency_chain = jsonb_build_array(v_venture_context::text::text)
  WHERE id = v_sd_namespacing::text;

  -- Filter Engine depends on Chairman Prefs
  UPDATE strategic_directives_v2
  SET dependency_chain = jsonb_build_array(v_chairman_prefs::text::text)
  WHERE id = v_filter_engine::text;

  -- Reality Gates depends on Venture Context
  UPDATE strategic_directives_v2
  SET dependency_chain = jsonb_build_array(v_venture_context::text::text)
  WHERE id = v_reality_gates::text;

  -- Stage Gates Extension depends on Filter Engine
  UPDATE strategic_directives_v2
  SET dependency_chain = jsonb_build_array(v_filter_engine::text::text)
  WHERE id = v_stage_gates_ext::text;

  -- Eva Orchestrator depends on all 6 foundation children
  UPDATE strategic_directives_v2
  SET dependency_chain = jsonb_build_array(
    v_venture_context::text::text,
    v_sd_namespacing::text::text,
    v_chairman_prefs::text::text,
    v_filter_engine::text::text,
    v_reality_gates::text::text,
    v_stage_gates_ext::text::text
  )
  WHERE id = v_eva_orchestrator::text;

  -- Log creation summary
  RAISE NOTICE 'CLI Venture Lifecycle SD Hierarchy Created:';
  RAISE NOTICE '  Top-level: SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001 (%) ', v_top;
  RAISE NOTICE '  Foundation orchestrator: 7 children';
  RAISE NOTICE '  Templates orchestrator: 6 children';
  RAISE NOTICE '  Intelligence orchestrator: 4 children';
  RAISE NOTICE '  Dashboard orchestrator: 4 children';
  RAISE NOTICE '  Learning: 2 direct children';
  RAISE NOTICE '  Total: 28 SDs created';
END $$;
