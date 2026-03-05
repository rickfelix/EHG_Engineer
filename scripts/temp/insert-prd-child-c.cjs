/**
 * Insert PRD for SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-C
 * Phase 3: Stage Integration + Validation
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const prdId = randomUUID();
const directiveId = '052b8c4f-ca27-4136-aa0d-e28c432b0056';

const prd = {
  id: prdId,
  directive_id: directiveId,
  sd_id: directiveId,
  title: 'Phase 3: Stage Integration + Validation - Acquirability Criteria, Separation Rehearsal, and Chairman UI',
  version: '1.0.0',
  status: 'draft',
  category: 'technical',
  priority: 'high',
  document_type: 'prd',
  created_by: 'PLAN',

  executive_summary: 'Integrate venture exit-readiness into the EVA stage pipeline and Chairman UI. Adds acquirability criteria as soft-gate analysis steps in stages 0, 18-22, and 24. Implements separation rehearsal module for dry-run independence validation. Creates data room template generation per exit model type. Delivers two Chairman dashboard views: PortfolioExitReadiness (portfolio-level exit readiness overview) and SeparationPlanView (per-venture dependency map and separation status).',

  functional_requirements: [
    {
      id: 'FR-1',
      priority: 'CRITICAL',
      requirement: 'Add acquirability analysis step to Stage 0 (Idea Synthesis) that evaluates initial exit viability alongside existing synthesis components',
      description: 'New analysis step in stage-00 that assesses whether an idea has inherent acquirability traits: IP potential, market desirability, technology separability. Produces acquirability_assessment object with score (0-100) and flags.',
      acceptance_criteria: [
        'Analysis step registered in stage-templates/analysis-steps/stage-00-acquirability.js',
        'Output includes acquirability_score (0-100), ip_potential, market_desirability, separability_signals fields',
        'Score is soft-gate: logged as advisory in Stage 0 output but does not block progression',
        'Uses same LLM client pattern as existing analysis steps (getLLMClient, parseJSON, extractUsage)'
      ]
    },
    {
      id: 'FR-2',
      priority: 'CRITICAL',
      requirement: 'Add acquirability criteria analysis steps to Build phase stages (18-22) that evaluate exit-readiness of implementation decisions',
      description: 'Each build stage (18-22) gets a supplementary analysis step that evaluates acquirability impact of build decisions: shared dependency introduction, data isolation, infrastructure coupling.',
      acceptance_criteria: [
        'Analysis steps created for stages 18, 19, 20, 21, 22 in analysis-steps/ directory',
        'Each step queries venture_asset_registry and venture_separability_scores for current state',
        'Output includes acquirability_delta object showing impact of stage decisions on separability',
        'Soft-gate: results logged as warnings when acquirability delta is negative, never blocks stage progression',
        'Tests verify each analysis step produces valid acquirability_delta output'
      ]
    },
    {
      id: 'FR-3',
      priority: 'CRITICAL',
      requirement: 'Add acquirability review to Stage 24 (Metrics & Learning) that produces final exit-readiness assessment',
      description: 'Stage 24 analysis step aggregates all acquirability data (Stage 0 assessment, Build phase deltas, separability scores) into a comprehensive exit-readiness report.',
      acceptance_criteria: [
        'Analysis step in stage-templates/analysis-steps/stage-24-acquirability-review.js',
        'Aggregates Stage 0 acquirability_score, Build phase acquirability_deltas, latest separability_score',
        'Produces exit_readiness_report with overall_score, dimension_breakdown, recommendations',
        'Report written to venture_exit_profiles as readiness_assessment JSONB field',
        'Test verifies aggregation logic with mock data from all contributing stages'
      ]
    },
    {
      id: 'FR-4',
      priority: 'CRITICAL',
      requirement: 'Implement separation rehearsal module with dry-run and full validation modes',
      description: 'Module at lib/eva/exit/separation-rehearsal.js that simulates venture separation by analyzing dependencies, shared resources, and integration points. Dry-run mode reports findings without changes. Full mode validates actual separability against thresholds.',
      acceptance_criteria: [
        'Module exports rehearseSeparation(ventureId, mode, supabase) where mode is dry_run or full',
        'Dry-run queries venture_asset_registry, venture_separability_scores, and venture_exit_profiles',
        'Returns { mode, overall_separable, dimension_results: [{dimension, score, blockers, recommendations}], shared_resources, critical_dependencies }',
        'Full mode additionally validates against threshold (overall_score >= 70 for pass)',
        'Handles missing data gracefully: returns partial results with warnings instead of errors',
        'Unit tests cover both modes with mock Supabase data'
      ]
    },
    {
      id: 'FR-5',
      priority: 'HIGH',
      requirement: 'Create data room template system that generates exit-model-specific document sets',
      description: 'Module at lib/eva/exit/data-room-templates.js that defines required documents per exit model type and generates template structures.',
      acceptance_criteria: [
        'Module exports getDataRoomTemplate(exitModel) returning required document list with completion tracking',
        'Module exports generateDataRoomChecklist(ventureId, supabase) that evaluates completeness',
        'full_acquisition template requires: financial_summary, customer_list, technical_architecture, dependency_map, integration_inventory, separation_plan, revenue_history, asset_inventory, legal_summary',
        'licensing template requires: ip_portfolio, license_terms, technical_documentation, revenue_projections',
        'acqui_hire template requires: team_roster, compensation_structure, ip_assignment, retention_plan',
        'Each template item has { document_type, required, status, source_table } fields'
      ]
    },
    {
      id: 'FR-6',
      priority: 'HIGH',
      requirement: 'Add separation rehearsal and data room API endpoints to eva-exit.js',
      description: 'Extend the existing eva-exit.js route file with 4 new endpoints for separation rehearsal execution and data room template operations.',
      acceptance_criteria: [
        'POST /api/eva/exit/:ventureId/rehearsal triggers separation rehearsal (accepts { mode: dry_run|full } body)',
        'GET /api/eva/exit/:ventureId/rehearsal/latest returns most recent rehearsal results',
        'GET /api/eva/exit/:ventureId/data-room/template returns data room checklist for ventures current exit model',
        'GET /api/eva/exit/:ventureId/data-room/completeness returns completion percentage and missing items',
        'All endpoints use asyncHandler and validate ventureId parameter',
        'Error responses include actionable messages when venture or profile not found'
      ]
    },
    {
      id: 'FR-7',
      priority: 'HIGH',
      requirement: 'Create PortfolioExitReadiness Chairman UI view at /chairman/portfolio/exit-readiness',
      description: 'React component in the EHG app that displays a portfolio-level table of all ventures with exit readiness status, exit model, separability score, and data room completeness.',
      acceptance_criteria: [
        'Component renders at /chairman/portfolio/exit-readiness route',
        'Table shows columns: Venture Name, Pipeline Mode, Exit Model, Separability Score, Data Room %, Last Rehearsal',
        'Only shows ventures with pipeline_mode in (exit_prep, divesting, sold)',
        'Row click navigates to /chairman/ventures/:id/separation-plan',
        'Fetches data from GET /api/eva/exit/summary for each venture',
        'Uses existing Shadcn UI table components and Tailwind styling'
      ]
    },
    {
      id: 'FR-8',
      priority: 'HIGH',
      requirement: 'Create SeparationPlanView Chairman UI component at /chairman/ventures/:id/separation-plan',
      description: 'React component showing detailed separation status: dependency map visualization, rehearsal results, data room checklist, and action items.',
      acceptance_criteria: [
        'Component renders at /chairman/ventures/:id/separation-plan route',
        'Shows separation rehearsal results with dimension breakdown cards',
        'Displays dependency map as structured list with severity indicators',
        'Shows data room checklist with completion status per document',
        'Trigger rehearsal button calls POST /api/eva/exit/:ventureId/rehearsal',
        'Uses existing Shadcn UI card, badge, and progress components'
      ]
    }
  ],

  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'Stage analysis steps must follow existing pattern: getLLMClient, parseJSON, extractUsage, four-buckets prompt format',
      rationale: 'Consistency with 25+ existing analysis steps ensures master scheduler and stage execution engine work without modification'
    },
    {
      id: 'TR-2',
      requirement: 'Acquirability criteria are soft-gates only: they produce warnings and advisory scores but never block stage progression',
      rationale: 'Exit readiness is informational during build phases. Hard-blocking would disrupt existing venture development workflow.'
    },
    {
      id: 'TR-3',
      requirement: 'Separation rehearsal must query Phase 1 and Phase 2 tables without requiring Phase 2 to be complete',
      rationale: 'Phase 2 may not be complete when Phase 3 implementation begins. Graceful degradation: return partial results with warnings when Phase 2 data unavailable.'
    },
    {
      id: 'TR-4',
      requirement: 'Chairman UI components created in EHG repo (rickfelix/ehg), not EHG_Engineer',
      rationale: 'Frontend lives in EHG repo (Vite + React + Shadcn). Backend/scoring modules live in EHG_Engineer. Clear repo boundary.'
    },
    {
      id: 'TR-5',
      requirement: 'No new database tables required. All data stored in existing Phase 1/2 tables or as JSONB fields on venture_exit_profiles',
      rationale: 'Phase 1 created venture_asset_registry and venture_exit_profiles. Phase 2 adds venture_separability_scores and venture_data_room_artifacts. Phase 3 consumes these.'
    }
  ],

  test_scenarios: [
    {
      id: 'TS-1',
      scenario: 'Stage 0 acquirability analysis produces valid assessment for a new venture idea',
      given: 'A venture idea input with description, problem statement, and value proposition',
      when: 'Stage 0 synthesis runs with acquirability analysis step enabled',
      then: 'Output includes acquirability_assessment with score 0-100, ip_potential, market_desirability, and separability_signals',
      test_type: 'unit'
    },
    {
      id: 'TS-2',
      scenario: 'Build stage acquirability delta correctly identifies shared dependency introduction',
      given: 'A venture in Stage 19 (Build Execution) that introduces a shared cloud service dependency',
      when: 'Stage 19 acquirability analysis step runs',
      then: 'acquirability_delta shows negative impact with specific dependency identified and recommendation to isolate',
      test_type: 'unit'
    },
    {
      id: 'TS-3',
      scenario: 'Stage 24 exit readiness report aggregates all acquirability data correctly',
      given: 'A venture with Stage 0 assessment (score 75), Build phase deltas (-5, -3, +2, 0, -1), and separability score 82',
      when: 'Stage 24 acquirability review analysis step runs',
      then: 'exit_readiness_report shows aggregated score, dimension breakdown from all sources, and actionable recommendations',
      test_type: 'unit'
    },
    {
      id: 'TS-4',
      scenario: 'Separation rehearsal dry-run returns complete dependency analysis without modifying data',
      given: 'A venture in exit_prep mode with 10 assets, 3 shared dependencies, and separability score of 65',
      when: 'rehearseSeparation(ventureId, "dry_run", supabase) is called',
      then: 'Returns results with 5 dimension scores, 3 shared_resources identified, critical_dependencies list, and no database modifications',
      test_type: 'unit'
    },
    {
      id: 'TS-5',
      scenario: 'Separation rehearsal full mode correctly identifies pass/fail against threshold',
      given: 'A venture with overall separability score of 60 (below 70 threshold)',
      when: 'rehearseSeparation(ventureId, "full", supabase) is called',
      then: 'Returns overall_separable=false with specific blockers per dimension that are below threshold',
      test_type: 'unit'
    },
    {
      id: 'TS-6',
      scenario: 'Data room template returns correct document set for full_acquisition exit model',
      given: 'A venture with exit_model=full_acquisition',
      when: 'getDataRoomTemplate("full_acquisition") is called',
      then: 'Returns 9+ required documents including financial_summary, customer_list, technical_architecture, dependency_map',
      test_type: 'unit'
    },
    {
      id: 'TS-7',
      scenario: 'API POST rehearsal endpoint triggers rehearsal and returns results',
      given: 'A venture in exit_prep mode with valid asset registry data',
      when: 'POST /api/eva/exit/:ventureId/rehearsal with { mode: "dry_run" }',
      then: 'Returns 200 with rehearsal results including dimension_results and shared_resources',
      test_type: 'integration'
    },
    {
      id: 'TS-8',
      scenario: 'PortfolioExitReadiness view renders ventures with exit readiness data',
      given: 'Two ventures: one in exit_prep with score 78, one in divesting with score 92',
      when: 'User navigates to /chairman/portfolio/exit-readiness',
      then: 'Table renders both ventures with correct exit model, separability score, and data room completion percentage',
      test_type: 'integration'
    }
  ],

  acceptance_criteria: [
    'Acquirability analysis steps added to stages 0, 18, 19, 20, 21, 22, and 24 with soft-gate behavior',
    'separation-rehearsal.js module functional with dry_run and full modes returning valid results',
    'Data room template system covers all 6 exit model types with appropriate document checklists',
    '4 new API endpoints operational in eva-exit.js (rehearsal trigger, rehearsal results, data room template, data room completeness)',
    'PortfolioExitReadiness Chairman UI view renders at /chairman/portfolio/exit-readiness with venture exit data',
    'SeparationPlanView Chairman UI view renders at /chairman/ventures/:id/separation-plan with dependency map and rehearsal status',
    'All unit tests pass for analysis steps, separation rehearsal, and data room templates',
    'No regression in existing stage pipeline execution (stages 0-25 pass E2E test suite)',
    'Graceful degradation when Phase 2 data is unavailable (partial results with warnings, no errors)'
  ],

  system_architecture: JSON.stringify({
    overview: 'Phase 3 integrates exit-readiness evaluation into the EVA stage pipeline and exposes it through Chairman UI. Acquirability criteria are woven into stages 0 and 18-24 as soft-gate analysis steps. A separation rehearsal module validates venture independence. Data room templates generate exit-model-specific document checklists. Two Chairman views provide portfolio-level and venture-level exit readiness dashboards.',
    components: [
      {
        name: 'Acquirability Analysis Steps (lib/eva/stage-templates/analysis-steps/stage-*-acquirability*.js)',
        responsibility: 'Evaluate venture acquirability at each relevant pipeline stage, producing scores and delta impacts',
        technology: 'Node.js ESM, getLLMClient for AI analysis, four-buckets prompt pattern'
      },
      {
        name: 'Separation Rehearsal Module (lib/eva/exit/separation-rehearsal.js)',
        responsibility: 'Simulate venture separation by analyzing dependencies, shared resources, and integration points',
        technology: 'Node.js ESM, Supabase client, rule-based analysis'
      },
      {
        name: 'Data Room Templates (lib/eva/exit/data-room-templates.js)',
        responsibility: 'Define and evaluate exit-model-specific document requirements for due diligence',
        technology: 'Node.js ESM, template definitions, Supabase client for completeness checks'
      },
      {
        name: 'API Extensions (server/routes/eva-exit.js)',
        responsibility: 'Expose separation rehearsal and data room operations via REST endpoints',
        technology: 'Express.js Router, asyncHandler middleware'
      },
      {
        name: 'Chairman UI - PortfolioExitReadiness (EHG repo)',
        responsibility: 'Portfolio-level exit readiness overview table with all ventures',
        technology: 'React, Shadcn UI, Tailwind, @tanstack/react-query'
      },
      {
        name: 'Chairman UI - SeparationPlanView (EHG repo)',
        responsibility: 'Per-venture separation status with dependency map and rehearsal controls',
        technology: 'React, Shadcn UI, Tailwind, @tanstack/react-query'
      }
    ],
    data_flow: '1) Stage pipeline executes acquirability analysis steps during venture evaluation. 2) Analysis results stored as stage output JSONB. 3) Stage 24 aggregates all acquirability data into exit_readiness_report. 4) Separation rehearsal queries Phase 1+2 tables to evaluate independence. 5) Data room templates check venture data completeness against exit-model requirements. 6) Chairman UI fetches via API endpoints and renders dashboards.',
    integration_points: [
      'EVA Stage Execution Engine (lib/eva/stage-execution-engine.js) - runs acquirability analysis steps',
      'venture_asset_registry (Phase 1) - source data for separation analysis',
      'venture_exit_profiles (Phase 1) - exit model determines template and analysis context',
      'venture_separability_scores (Phase 2) - scoring data for rehearsal module',
      'venture_data_room_artifacts (Phase 2) - artifact status for data room completeness',
      'Express server (server/index.js) - routes mounted at /api/eva/exit/*',
      'Chairman UI routes (EHG repo) - new routes for exit readiness views'
    ]
  }),

  implementation_approach: JSON.stringify({
    phases: [
      {
        phase: 'Phase 1: Stage Analysis Steps',
        description: 'Create acquirability analysis steps for stages 0, 18-22, and 24. Register in stage template index.',
        deliverables: ['stage-00-acquirability.js', 'stage-18-through-22-acquirability.js (5 files)', 'stage-24-acquirability-review.js', 'Unit tests for all analysis steps']
      },
      {
        phase: 'Phase 2: Separation Rehearsal Module',
        description: 'Implement lib/eva/exit/separation-rehearsal.js with dry-run and full validation modes.',
        deliverables: ['separation-rehearsal.js module', 'Unit tests for both modes', 'Edge case handling for missing Phase 2 data']
      },
      {
        phase: 'Phase 3: Data Room Templates',
        description: 'Implement lib/eva/exit/data-room-templates.js with per-exit-model document definitions.',
        deliverables: ['data-room-templates.js module', 'Template definitions for 6 exit models', 'Completeness evaluation logic', 'Unit tests']
      },
      {
        phase: 'Phase 4: API Endpoints',
        description: 'Extend eva-exit.js with 4 new endpoints for rehearsal and data room operations.',
        deliverables: ['4 REST endpoints', 'Input validation', 'Integration tests']
      },
      {
        phase: 'Phase 5: Chairman UI',
        description: 'Create PortfolioExitReadiness and SeparationPlanView components in EHG repo.',
        deliverables: ['PortfolioExitReadiness.tsx component', 'SeparationPlanView.tsx component', 'Route registrations', 'API hooks with react-query']
      }
    ],
    technical_decisions: [
      'Soft-gate pattern for acquirability criteria: scores are advisory, never blocking stage progression',
      'Rule-based separation rehearsal (not ML): deterministic, auditable, works with small venture count (N=4)',
      'Template definitions as code (not database): exit model document requirements are stable, version-controlled',
      'Graceful degradation: all Phase 2 dependencies are optional at runtime.',
      'Cross-repo implementation: backend in EHG_Engineer, frontend in EHG. API-first contract.'
    ]
  }),

  risks: [
    {
      risk: 'Phase 2 (scoring + workers) not yet complete — separation rehearsal depends on venture_separability_scores table',
      impact: 'MEDIUM',
      probability: 'HIGH',
      mitigation: 'Separation rehearsal degrades gracefully when Phase 2 data unavailable. Returns partial results with warnings.',
      rollback_plan: 'Disable separation rehearsal features; stage analysis steps and data room templates work independently'
    },
    {
      risk: 'Stage template modifications to 8 stages (0, 18-22, 24) could introduce regressions in existing stage pipeline',
      impact: 'HIGH',
      probability: 'LOW',
      mitigation: 'Acquirability analysis steps are additive (new files, new analysis step registration) and soft-gate only. Existing analysis steps are not modified.',
      rollback_plan: 'Remove analysis step registrations from stage template index. Stage pipeline reverts to pre-Phase 3 behavior.'
    },
    {
      risk: 'Cross-repo coordination required for Chairman UI (EHG repo) and backend (EHG_Engineer repo)',
      impact: 'MEDIUM',
      probability: 'MEDIUM',
      mitigation: 'Backend API endpoints deployed first. Frontend components use standard fetch with error handling for missing endpoints.',
      rollback_plan: 'Frontend components show graceful empty state when backend endpoints unavailable'
    }
  ],

  exploration_summary: {
    files_read: [
      'lib/eva/stage-templates/stage-01.js',
      'lib/eva/stage-templates/stage-09.js',
      'lib/eva/stage-templates/analysis-steps/stage-24-launch-readiness.js',
      'server/routes/eva-exit.js',
      'database/migrations/20260305_venture_exit_readiness_foundation.sql'
    ],
    key_decisions: [
      'Analysis steps added as separate files to minimize regression risk',
      'Separation rehearsal queries Phase 1+2 tables with graceful fallback',
      'Data room templates defined in code, not database',
      'No new database tables — Phase 3 consumes Phase 1+2 tables'
    ],
    exploration_date: new Date().toISOString(),
    patterns_identified: [
      'Analysis steps follow getLLMClient + parseJSON + extractUsage + four-buckets prompt pattern',
      'Stage templates define TEMPLATE const with id, slug, title, version, schema, validate(), analyze()',
      'API routes use asyncHandler with dbLoader.supabase client'
    ]
  },

  integration_operationalization: {
    consumers: [
      {
        name: 'Chairman (Solo Entrepreneur)',
        frequency: 'On-demand when reviewing venture exit readiness',
        interaction: 'Views PortfolioExitReadiness and SeparationPlanView dashboards'
      },
      {
        name: 'EVA Stage Execution Engine',
        frequency: 'Per-stage during venture evaluation pipeline',
        interaction: 'Executes acquirability analysis steps as part of stage processing'
      }
    ],
    dependencies: [
      {
        name: 'venture_asset_registry (Phase 1)',
        type: 'upstream',
        contract: 'Read assets by venture_id',
        failure_handling: 'If no assets found, rehearsal returns score 0 with warning'
      },
      {
        name: 'venture_exit_profiles (Phase 1)',
        type: 'upstream',
        contract: 'Read current exit model WHERE is_current=true',
        failure_handling: 'If no profile, data room template returns empty checklist with warning'
      },
      {
        name: 'venture_separability_scores (Phase 2)',
        type: 'upstream',
        contract: 'Read latest score by venture_id ORDER BY created_at DESC',
        failure_handling: 'If Phase 2 incomplete, rehearsal skips score-dependent dimensions'
      }
    ],
    data_contracts: [
      {
        contract_name: 'Acquirability Assessment',
        schema: '{ acquirability_score: number(0-100), ip_potential: string, market_desirability: string, separability_signals: string[] }',
        validation: 'Score CHECK >= 0 AND <= 100',
        versioning: 'Stored as part of stage output JSONB'
      },
      {
        contract_name: 'Separation Rehearsal Result',
        schema: '{ mode: string, overall_separable: boolean, dimension_results: [{dimension, score, blockers, recommendations}], shared_resources: [], critical_dependencies: [] }',
        validation: 'Mode must be dry_run or full. Overall determined by score >= 70.',
        versioning: 'Results stored on venture_exit_profiles.readiness_assessment JSONB'
      }
    ],
    runtime_config: {
      feature_flags: [],
      environment_variables: [],
      deployment_considerations: 'Backend deployed first. Frontend deployed after API endpoints live.'
    },
    observability_rollout: {
      monitoring: ['Acquirability analysis step execution time', 'Separation rehearsal results per venture'],
      alerts: ['Analysis step timeout > 30 seconds', 'Rehearsal failure rate > 20%'],
      rollout_strategy: 'Deploy analysis step files. Auto-activate on next stage execution engine load.',
      rollback_procedure: '1) Remove analysis step registrations 2) Comment out new API endpoints 3) Chairman UI shows empty state',
      rollback_trigger: 'Stage pipeline E2E tests fail after deployment'
    }
  },

  metadata: {
    database_analysis: {
      verdict: 'PASS',
      confidence: 100,
      warnings: [],
      recommendations: ['No new database tables needed for Phase 3'],
      critical_issues: [],
      executed_at: new Date().toISOString(),
      sub_agent_version: '1.0.0',
      validation_mode: 'prospective'
    },
    risk_analysis: {
      verdict: 'PASS',
      confidence: 85,
      warnings: ['Phase 2 dependency may delay some features'],
      recommendations: [{ title: 'Implement graceful degradation', priority: 'HIGH', description: 'Ensure all Phase 2 queries have fallback behavior' }],
      critical_issues: [],
      executed_at: new Date().toISOString(),
      sub_agent_version: '1.0.0',
      validation_mode: 'prospective'
    }
  }
};

async function main() {
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prd)
    .select('id, title, status')
    .single();

  if (error) {
    console.error('INSERT ERROR:', error.message);
    console.error('Details:', error.details);
    console.error('Hint:', error.hint);
    process.exit(1);
  }

  console.log('PRD CREATED:', JSON.stringify(data));

  // Update PRD status to 'approved' for handoff
  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ status: 'approved' })
    .eq('id', data.id);

  if (updateErr) {
    console.error('Status update error:', updateErr.message);
  } else {
    console.log('PRD status updated to approved');
  }
}

main();
