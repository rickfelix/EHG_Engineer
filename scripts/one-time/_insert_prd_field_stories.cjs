process.env.DOTENV_CONFIG_PATH = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env';
require('C:/Users/rickf/Projects/_EHG/EHG_Engineer/node_modules/dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });
const { createClient } = require('C:/Users/rickf/Projects/_EHG/EHG_Engineer/node_modules/@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD = 'SD-LEO-INFRA-PRD-FIELD-CONSUMPTION-001';
const PRD = 'PRD-SD-LEO-INFRA-PRD-FIELD-CONSUMPTION-001';

const stories = [
  {
    story_key: SD + ':US-001',
    prd_id: PRD,
    sd_id: SD,
    title: 'Wire test_scenarios into EXEC-TO-PLAN gate-3',
    user_role: 'LEO Protocol Engine',
    user_want: 'the EXEC-TO-PLAN gate-3 to read the PRD test_scenarios field and validate that test coverage addresses each scenario',
    user_benefit: 'test coverage gaps are caught at the gate before plan verification, preventing incomplete implementations from passing',
    story_points: 3,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      'gate-3 reads test_scenarios from product_requirements_v2 for the active SD',
      'Each test_scenario is checked against actual test files for coverage',
      'Gate score reflects percentage of test_scenarios with corresponding tests',
      'Missing scenario coverage produces a warning with specific scenario text'
    ],
    definition_of_done: ['Code change in gate-3 file', 'Unit test for new field consumption', 'No regression in existing gate-3 checks'],
    implementation_context: JSON.stringify({
      affected_files: ['scripts/modules/handoff/validation/validator-registry/gates/gate-3-exec-to-plan.js'],
      test_approach: 'Unit test: mock PRD with test_scenarios, verify gate reads and scores them',
      dependencies: ['product_requirements_v2.test_scenarios field']
    }),
    created_by: 'SYSTEM'
  },
  {
    story_key: SD + ':US-002',
    prd_id: PRD,
    sd_id: SD,
    title: 'Wire acceptance_criteria into implementation fidelity gate-2',
    user_role: 'LEO Protocol Engine',
    user_want: 'the implementation fidelity gate-2 to consume the PRD acceptance_criteria field and score implementation completeness against each criterion',
    user_benefit: 'acceptance criteria are validated programmatically rather than only during manual UAT, catching gaps earlier in the pipeline',
    story_points: 3,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      'gate-2 fetches acceptance_criteria from product_requirements_v2',
      'Each criterion is evaluated against implementation evidence (code, tests, config)',
      'Gate score includes acceptance_criteria coverage as a weighted factor',
      'Unmet criteria are listed in gate output with specific remediation guidance'
    ],
    definition_of_done: ['Code change in gate-2 file', 'Unit test for acceptance_criteria consumption', 'No regression in existing gate-2 checks'],
    implementation_context: JSON.stringify({
      affected_files: ['scripts/modules/implementation-fidelity/gates/gate-2-implementation-fidelity.js'],
      test_approach: 'Unit test: mock PRD with acceptance_criteria, verify gate evaluates each criterion',
      dependencies: ['product_requirements_v2.acceptance_criteria field']
    }),
    created_by: 'SYSTEM'
  },
  {
    story_key: SD + ':US-003',
    prd_id: PRD,
    sd_id: SD,
    title: 'Wire risks into PLAN-TO-EXEC handoff context as warnings',
    user_role: 'LEO Protocol Engine',
    user_want: 'the PLAN-TO-EXEC handoff to include PRD risks field as contextual warnings in the handoff payload',
    user_benefit: 'the EXEC phase agent is aware of known risks before implementation begins, enabling proactive mitigation rather than reactive debugging',
    story_points: 2,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      'PLAN-TO-EXEC handoff reads risks from product_requirements_v2',
      'Risks are included in the handoff payload under a warnings section',
      'EXEC phase context loader displays risks to the implementing agent',
      'Empty risks field does not break handoff (graceful null handling)'
    ],
    definition_of_done: ['Code change in PLAN-TO-EXEC handoff builder', 'Integration test for risk propagation', 'Null safety verified'],
    implementation_context: JSON.stringify({
      affected_files: ['scripts/modules/handoff/validation/validator-registry/gates/gate-1-plan-to-exec.js', 'scripts/modules/handoff/cli/cli-main.js'],
      test_approach: 'Integration test: create handoff with risks field populated, verify payload contains warnings',
      dependencies: ['product_requirements_v2.risks field']
    }),
    created_by: 'SYSTEM'
  },
  {
    story_key: SD + ':US-004',
    prd_id: PRD,
    sd_id: SD,
    title: 'Wire system_architecture into design sub-agent prompt',
    user_role: 'Design Sub-Agent',
    user_want: 'to receive the PRD system_architecture field as part of my prompt context when spawned',
    user_benefit: 'design decisions are informed by the documented architecture, reducing misalignment between design output and system structure',
    story_points: 2,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      'Design sub-agent prompt builder fetches system_architecture from PRD',
      'Architecture content is injected into the sub-agent system prompt',
      'Sub-agent output references architecture constraints when making design decisions',
      'Missing system_architecture field results in graceful fallback (no crash)'
    ],
    definition_of_done: ['Code change in design sub-agent index.js', 'Prompt includes architecture section', 'Null handling tested'],
    implementation_context: JSON.stringify({
      affected_files: ['lib/sub-agents/design/index.js'],
      test_approach: 'Unit test: mock PRD with system_architecture, verify prompt includes architecture section',
      dependencies: ['product_requirements_v2.system_architecture field', 'design sub-agent prompt builder']
    }),
    created_by: 'SYSTEM'
  },
  {
    story_key: SD + ':US-005',
    prd_id: PRD,
    sd_id: SD,
    title: 'Wire implementation_approach into EXEC handoff payload',
    user_role: 'LEO Protocol Engine',
    user_want: 'the EXEC handoff payload to include the PRD implementation_approach field so the executing agent has a prescribed approach',
    user_benefit: 'implementation follows the planned approach rather than being invented ad hoc, improving consistency between plan and execution',
    story_points: 2,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      'EXEC handoff builder reads implementation_approach from product_requirements_v2',
      'Field content is included in the handoff payload context section',
      'Executing agent can reference the approach during implementation',
      'Null implementation_approach does not break handoff'
    ],
    definition_of_done: ['Code change in handoff payload builder', 'Integration test', 'Null safety verified'],
    implementation_context: JSON.stringify({
      affected_files: ['scripts/modules/handoff/cli/cli-main.js', 'scripts/modules/handoff/payload-builder.js'],
      test_approach: 'Integration test: create PLAN-TO-EXEC handoff, verify payload includes implementation_approach',
      dependencies: ['product_requirements_v2.implementation_approach field']
    }),
    created_by: 'SYSTEM'
  },
  {
    story_key: SD + ':US-006',
    prd_id: PRD,
    sd_id: SD,
    title: 'Wire data_model and api_specifications into database and API sub-agents',
    user_role: 'Database Sub-Agent',
    user_want: 'to receive the PRD data_model field as context, and the API sub-agent to receive api_specifications, when spawned for implementation tasks',
    user_benefit: 'sub-agents produce outputs aligned with the documented data model and API spec rather than inferring structure from code alone',
    story_points: 3,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      'Database sub-agent prompt builder fetches data_model from PRD',
      'API sub-agent prompt builder fetches api_specifications from PRD',
      'Each field is injected into the respective sub-agent system prompt',
      'Missing fields result in graceful fallback with no prompt injection errors'
    ],
    definition_of_done: ['Code changes in database and API sub-agent builders', 'Both sub-agents tested with and without field data', 'No regression in existing sub-agent behavior'],
    implementation_context: JSON.stringify({
      affected_files: ['lib/sub-agents/database/index.js', 'lib/sub-agents/api/index.js'],
      test_approach: 'Unit tests: mock PRD with data_model and api_specifications, verify each sub-agent prompt includes the field',
      dependencies: ['product_requirements_v2.data_model field', 'product_requirements_v2.api_specifications field']
    }),
    created_by: 'SYSTEM'
  },
  {
    story_key: SD + ':US-007',
    prd_id: PRD,
    sd_id: SD,
    title: 'Wire performance_requirements into performance validation',
    user_role: 'LEO Protocol Engine',
    user_want: 'performance validation checks to consume the PRD performance_requirements field and verify implementation meets stated benchmarks',
    user_benefit: 'performance regressions are caught against PRD-defined thresholds rather than arbitrary defaults, ensuring SLA compliance',
    story_points: 3,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      'Performance validation reads performance_requirements from PRD',
      'Each requirement is parsed into testable threshold (e.g., response time < 200ms)',
      'Validation reports pass/fail per requirement',
      'Missing performance_requirements skips validation gracefully'
    ],
    definition_of_done: ['Code change in performance validation module', 'Unit tests for threshold parsing', 'Null handling tested'],
    implementation_context: JSON.stringify({
      affected_files: ['scripts/modules/performance/validation.js'],
      test_approach: 'Unit test: mock PRD with performance_requirements, verify thresholds are parsed and validated',
      dependencies: ['product_requirements_v2.performance_requirements field']
    }),
    created_by: 'SYSTEM'
  },
  {
    story_key: SD + ':US-008',
    prd_id: PRD,
    sd_id: SD,
    title: 'Resolve Category D fields with relaxed constraints or minimal consumption',
    user_role: 'LEO Protocol Maintainer',
    user_want: 'Category D PRD fields (rarely used or legacy) to either have their NOT NULL constraints relaxed or have minimal downstream readers added',
    user_benefit: 'the PRD field audit shows zero unconsumed fields, eliminating false negatives in field coverage reports and reducing noise in PRD validation',
    story_points: 2,
    priority: 'low',
    status: 'draft',
    acceptance_criteria: [
      'All Category D fields identified and documented',
      'Each field either has a consumer or has constraint relaxed to nullable',
      'Migration file created for any schema changes',
      'Grep audit of codebase confirms zero unconsumed non-nullable PRD fields'
    ],
    definition_of_done: ['Category D field list documented', 'Schema changes migrated if needed', 'Grep audit passes'],
    implementation_context: JSON.stringify({
      affected_files: ['database/migrations/', 'product_requirements_v2 schema'],
      test_approach: 'Grep audit: verify every non-nullable PRD field has at least one downstream reader in codebase',
      dependencies: ['Category D field identification from PRD audit']
    }),
    created_by: 'SYSTEM'
  }
];

async function main() {
  const { data, error } = await sb.from('user_stories').insert(stories).select('story_key, title, priority, status, story_points');
  if (error) {
    console.error('Insert error:', JSON.stringify(error, null, 2));
    return;
  }
  console.log('SUCCESS: Inserted ' + data.length + ' stories:\n');
  data.forEach(s => console.log('  ' + s.story_key + ' - ' + s.title + ' [' + s.priority + ', ' + s.story_points + 'pts]'));

  // Verify by querying back
  console.log('\n--- Verification Query ---');
  const { data: verify, error: verr } = await sb.from('user_stories')
    .select('story_key, title, priority, status')
    .eq('sd_id', SD)
    .order('story_key');
  if (verr) { console.error('Verify error:', verr); return; }
  console.log('Total stories for ' + SD + ': ' + verify.length);
  verify.forEach(s => console.log('  ' + s.story_key + ' [' + s.status + '] - ' + s.title));
}
main();
