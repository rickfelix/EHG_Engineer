#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PRD_ID = 'd8b3ae3b-5a71-4262-9128-301d396a7b6f';
const SD_UUID = '052b8c4f-ca27-4136-aa0d-e28c432b0056';

const implCtx = (files, approach, deps) => JSON.stringify({
  affected_files: files,
  test_approach: approach,
  dependencies: deps
});

const stories = [
  {
    id: randomUUID(),
    story_key: 'VARC01:US-001',
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    title: 'Stage 0 Acquirability Assessment',
    user_role: 'EVA system',
    user_want: 'evaluate acquirability potential when synthesizing a new venture idea',
    user_benefit: 'exit-readiness signals are captured from day one',
    story_points: 5,
    priority: 'critical',
    status: 'ready',
    acceptance_criteria: [
      'Stage 0 analysis step produces acquirability_score (0-100)',
      'Output includes ip_potential, market_desirability, separability_signals',
      'Assessment is soft-gate: does not block stage progression',
      'Analysis step follows existing getLLMClient/parseJSON pattern'
    ],
    definition_of_done: ['Implementation complete', 'Unit tests passing', 'Stage 0 E2E unaffected'],
    created_by: 'PLAN',
    implementation_context: implCtx(
      ['lib/eva/stage-templates/analysis-steps/stage-00-acquirability.js'],
      'Unit test with mock venture idea input, verify output schema',
      ['getLLMClient', 'parseJSON', 'extractUsage', 'four-buckets prompt']
    ),
    architecture_references: [],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: []
  },
  {
    id: randomUUID(),
    story_key: 'VARC02:US-002',
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    title: 'Build Phase Acquirability Delta Analysis (Stages 18-22)',
    user_role: 'EVA system',
    user_want: 'evaluate acquirability impact of build decisions at each build stage',
    user_benefit: 'dependency and coupling risks are surfaced during implementation',
    story_points: 8,
    priority: 'critical',
    status: 'ready',
    acceptance_criteria: [
      'Analysis steps created for stages 18, 19, 20, 21, 22',
      'Each step produces acquirability_delta with impact assessment',
      'Queries venture_asset_registry for current dependency state',
      'Soft-gate: negative delta logged as warning, never blocks',
      'Unit tests for each analysis step'
    ],
    definition_of_done: ['5 analysis step files created', 'Unit tests for all 5', 'Existing E2E tests unaffected'],
    created_by: 'PLAN',
    implementation_context: implCtx(
      [
        'lib/eva/stage-templates/analysis-steps/stage-18-acquirability.js',
        'lib/eva/stage-templates/analysis-steps/stage-19-acquirability.js',
        'lib/eva/stage-templates/analysis-steps/stage-20-acquirability.js',
        'lib/eva/stage-templates/analysis-steps/stage-21-acquirability.js',
        'lib/eva/stage-templates/analysis-steps/stage-22-acquirability.js'
      ],
      'Unit tests with mock stage data and venture_asset_registry',
      ['venture_asset_registry table', 'venture_separability_scores table']
    ),
    architecture_references: [],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: []
  },
  {
    id: randomUUID(),
    story_key: 'VARC03:US-003',
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    title: 'Stage 24 Exit Readiness Aggregation Report',
    user_role: 'EVA system',
    user_want: 'aggregate all acquirability data into a comprehensive exit-readiness report',
    user_benefit: 'the Chairman has a single view of venture separability at metrics/learning stage',
    story_points: 5,
    priority: 'critical',
    status: 'ready',
    acceptance_criteria: [
      'Aggregates Stage 0 score, Build phase deltas, latest separability score',
      'Produces exit_readiness_report with overall_score and dimension_breakdown',
      'Report includes actionable recommendations',
      'Written to venture_exit_profiles.readiness_assessment JSONB',
      'Test verifies aggregation logic with mock data'
    ],
    definition_of_done: ['Implementation complete', 'Unit test with mock aggregation data', 'No Stage 24 regression'],
    created_by: 'PLAN',
    implementation_context: implCtx(
      ['lib/eva/stage-templates/analysis-steps/stage-24-acquirability-review.js'],
      'Unit test with mock data from stages 0, 18-22, and separability scores',
      ['venture_exit_profiles table', 'venture_separability_scores table']
    ),
    architecture_references: [],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: []
  },
  {
    id: randomUUID(),
    story_key: 'VARC04:US-004',
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    title: 'Separation Rehearsal Module',
    user_role: 'Chairman',
    user_want: 'run a separation rehearsal for any venture to understand its independence level',
    user_benefit: 'I can identify blockers before initiating exit',
    story_points: 8,
    priority: 'critical',
    status: 'ready',
    acceptance_criteria: [
      'Module exports rehearseSeparation(ventureId, mode, supabase)',
      'Dry-run mode: analyzes without modifying data',
      'Full mode: validates against threshold (>= 70 for pass)',
      'Returns dimension_results, shared_resources, critical_dependencies',
      'Handles missing Phase 2 data gracefully with partial results',
      'Unit tests for both modes'
    ],
    definition_of_done: ['separation-rehearsal.js created', 'Unit tests for dry_run and full', 'Graceful fallback tested'],
    created_by: 'PLAN',
    implementation_context: implCtx(
      ['lib/eva/exit/separation-rehearsal.js'],
      'Unit tests with mock Supabase data for both modes',
      ['venture_asset_registry', 'venture_separability_scores', 'venture_exit_profiles']
    ),
    architecture_references: [],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: []
  },
  {
    id: randomUUID(),
    story_key: 'VARC05:US-005',
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    title: 'Data Room Template System',
    user_role: 'Chairman',
    user_want: 'data room document checklists tailored to each exit model',
    user_benefit: 'I know what due diligence materials are needed for different exit strategies',
    story_points: 5,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'getDataRoomTemplate(exitModel) returns document list per exit type',
      'generateDataRoomChecklist(ventureId, supabase) evaluates completeness',
      'full_acquisition: 9+ required documents',
      'licensing: ip_portfolio, license_terms, technical_documentation, revenue_projections',
      'acqui_hire: team_roster, compensation_structure, ip_assignment, retention_plan',
      'Each item has { document_type, required, status, source_table }'
    ],
    definition_of_done: ['data-room-templates.js created', 'Templates for 6 exit models', 'Unit tests'],
    created_by: 'PLAN',
    implementation_context: implCtx(
      ['lib/eva/exit/data-room-templates.js'],
      'Unit tests per exit model type',
      ['venture_data_room_artifacts table (Phase 2)']
    ),
    architecture_references: [],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: []
  },
  {
    id: randomUUID(),
    story_key: 'VARC06:US-006',
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    title: 'Rehearsal and Data Room API Endpoints',
    user_role: 'frontend developer',
    user_want: 'API endpoints for separation rehearsal and data room operations',
    user_benefit: 'the Chairman UI can trigger rehearsals and display completeness',
    story_points: 5,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'POST /api/eva/exit/:ventureId/rehearsal triggers rehearsal',
      'GET /api/eva/exit/:ventureId/rehearsal/latest returns recent results',
      'GET /api/eva/exit/:ventureId/data-room/template returns checklist',
      'GET /api/eva/exit/:ventureId/data-room/completeness returns % and missing items',
      'All endpoints use asyncHandler, validate ventureId',
      'Error responses include actionable messages'
    ],
    definition_of_done: ['4 endpoints added to eva-exit.js', 'Integration tests', 'Error handling'],
    created_by: 'PLAN',
    implementation_context: implCtx(
      ['server/routes/eva-exit.js'],
      'Integration tests with Supabase test data',
      ['separation-rehearsal.js', 'data-room-templates.js', 'asyncHandler middleware']
    ),
    architecture_references: [],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: []
  },
  {
    id: randomUUID(),
    story_key: 'VARC07:US-007',
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    title: 'Portfolio Exit Readiness Dashboard',
    user_role: 'Chairman',
    user_want: 'a portfolio-level exit readiness view showing all ventures with exit status',
    user_benefit: 'I can monitor the entire portfolio exit-readiness at a glance',
    story_points: 5,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'Component at /chairman/portfolio/exit-readiness',
      'Table: Venture Name, Pipeline Mode, Exit Model, Separability Score, Data Room %, Last Rehearsal',
      'Filters to exit_prep, divesting, sold ventures only',
      'Row click navigates to separation plan view',
      'Uses Shadcn UI table + Tailwind styling'
    ],
    definition_of_done: ['PortfolioExitReadiness.tsx in EHG repo', 'Route registered', 'API hook created'],
    created_by: 'PLAN',
    implementation_context: implCtx(
      ['src/components/chairman-v2/PortfolioExitReadiness.tsx', 'src/routes/chairmanRoutes.tsx'],
      'Component renders with mock API data',
      ['GET /api/eva/exit/summary', 'Shadcn UI Table', '@tanstack/react-query']
    ),
    architecture_references: [],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: []
  },
  {
    id: randomUUID(),
    story_key: 'VARC08:US-008',
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    title: 'Separation Plan Detail View',
    user_role: 'Chairman',
    user_want: 'a detailed separation plan for each venture with dependency map, rehearsal results, and data room status',
    user_benefit: 'I can make informed exit decisions with complete visibility',
    story_points: 5,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'Component at /chairman/ventures/:id/separation-plan',
      'Shows rehearsal results with dimension breakdown cards',
      'Displays dependency map with severity indicators',
      'Shows data room checklist with completion status',
      'Trigger rehearsal button calls POST /rehearsal endpoint',
      'Uses Shadcn UI card, badge, and progress components'
    ],
    definition_of_done: ['SeparationPlanView.tsx in EHG repo', 'Route registered', 'API hooks created'],
    created_by: 'PLAN',
    implementation_context: implCtx(
      ['src/components/chairman-v2/SeparationPlanView.tsx', 'src/routes/chairmanRoutes.tsx'],
      'Component renders with mock rehearsal and data room data',
      ['POST /api/eva/exit/:ventureId/rehearsal', 'GET /api/eva/exit/:ventureId/data-room/template', 'Shadcn UI']
    ),
    architecture_references: [],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: []
  }
];

async function main() {
  const { data, error } = await supabase
    .from('user_stories')
    .insert(stories)
    .select('id, story_key, title, status');

  if (error) {
    console.error('Insert error:', error.message);
    console.error('Details:', error.details);
    process.exit(1);
  }

  console.log('Inserted', data.length, 'user stories');
  data.forEach(s => console.log(' ', s.story_key, '-', s.title, '(' + s.status + ')'));
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
