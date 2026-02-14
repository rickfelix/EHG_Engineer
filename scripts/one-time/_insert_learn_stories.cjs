process.env.DOTENV_CONFIG_PATH = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env';
require('C:/Users/rickf/Projects/_EHG/EHG_Engineer/node_modules/dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });
const { createClient } = require('C:/Users/rickf/Projects/_EHG/EHG_Engineer/node_modules/@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-028';
const PRD = 'PRD-LEARN-028';

const stories = [
  {
    story_key: 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-028:US-001',
    prd_id: PRD,
    sd_id: SD,
    title: 'Remove invalid EXEC_IMPLEMENTATION_COMPLETE from sub-agent triggers',
    user_role: 'Infrastructure Engineer',
    user_want: 'invalid handoff types removed from the sub-agent registry',
    user_benefit: 'ensures only valid handoff types are used in trigger keywords, preventing unexpected behavior',
    story_points: 3,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'Query returns 0 results for SELECT * FROM leo_sub_agents WHERE trigger_keywords LIKE \'%EXEC_IMPLEMENTATION_COMPLETE%\'',
      'Affects DATABASE, GITHUB, TESTING, and DOCMON sub-agents',
      'No data loss - changes are removals only'
    ],
    definition_of_done: [
      'PR reviewed and approved',
      'Changes verified in staging database',
      'No impact to other sub-agents'
    ],
    technical_notes: 'EXEC_IMPLEMENTATION_COMPLETE was never a valid handoff type. Valid types are: LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-COMPLETE.',
    implementation_context: JSON.stringify({
      affected_tables: ['leo_sub_agents'],
      affected_records: 'DATABASE, GITHUB, TESTING, DOCMON sub-agents',
      removal_strategy: 'Query and remove EXEC_IMPLEMENTATION_COMPLETE from trigger_keywords array/string',
      validation: 'Query returns 0 results after removal'
    }),
    test_scenarios: [
      'SELECT COUNT(*) FROM leo_sub_agents WHERE trigger_keywords LIKE \'%EXEC_IMPLEMENTATION_COMPLETE%\' should return 0',
      'Verify DATABASE sub-agent no longer has invalid trigger'
    ],
    given_when_then: 'Given EXEC_IMPLEMENTATION_COMPLETE exists in sub-agent trigger keywords, When the removal script runs, Then all instances are removed and database query returns 0 results',
    created_by: 'SYSTEM'
  },
  {
    story_key: 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-028:US-002',
    prd_id: PRD,
    sd_id: SD,
    title: 'Add EXEC-TO-PLAN as correct replacement trigger keyword',
    user_role: 'Infrastructure Engineer',
    user_want: 'valid handoff triggers configured for implementation completion workflows',
    user_benefit: 'ensures sub-agents are triggered at the correct handoff boundaries for infrastructure operations',
    story_points: 3,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'DATABASE sub-agent has EXEC-TO-PLAN in trigger_keywords',
      'GITHUB sub-agent has EXEC-TO-PLAN in trigger_keywords',
      'TESTING sub-agent has EXEC-TO-PLAN in trigger_keywords',
      'DOCMON sub-agent has EXEC-TO-PLAN in trigger_keywords'
    ],
    definition_of_done: [
      'All 4 affected sub-agents updated',
      'Verified via database query',
      'No conflicts with existing triggers'
    ],
    technical_notes: 'EXEC-TO-PLAN is the correct trigger for operations that should occur when moving from execution to planning phases.',
    implementation_context: JSON.stringify({
      affected_tables: ['leo_sub_agents'],
      affected_records: 'DATABASE, GITHUB, TESTING, DOCMON',
      update_strategy: 'Add EXEC-TO-PLAN to trigger_keywords for each sub-agent',
      validation: 'Query returns 4 rows with EXEC-TO-PLAN present'
    }),
    test_scenarios: [
      'SELECT * FROM leo_sub_agents WHERE name IN (\'DATABASE\', \'GITHUB\', \'TESTING\', \'DOCMON\') AND trigger_keywords LIKE \'%EXEC-TO-PLAN%\'',
      'Verify 4 rows returned with expected trigger configuration'
    ],
    given_when_then: 'Given DATABASE, GITHUB, TESTING, DOCMON sub-agents need EXEC-TO-PLAN triggers, When the replacement script runs, Then all 4 sub-agents have EXEC-TO-PLAN in their trigger_keywords',
    created_by: 'SYSTEM'
  },
  {
    story_key: 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-028:US-003',
    prd_id: PRD,
    sd_id: SD,
    title: 'Mark issue pattern PAT-AUTO-ec5c4c80 as resolved',
    user_role: 'Infrastructure Engineer',
    user_want: 'invalid handoff type pattern marked as complete',
    user_benefit: 'ensures issue tracking reflects the fix and prevents future regressions',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'Pattern PAT-AUTO-ec5c4c80 status is set to resolved',
      'Resolved timestamp is recorded',
      'Pattern links to PR or commit that fixed it'
    ],
    definition_of_done: [
      'Database updated',
      'Pattern marked resolved with context'
    ],
    technical_notes: 'This pattern was auto-detected from sub-agent configuration drift. Resolved by removing invalid EXEC_IMPLEMENTATION_COMPLETE references.',
    implementation_context: JSON.stringify({
      affected_tables: ['issue_patterns'],
      pattern_id: 'PAT-AUTO-ec5c4c80',
      update_strategy: 'Set status=resolved for this pattern',
      root_cause: 'Invalid EXEC_IMPLEMENTATION_COMPLETE in sub-agent triggers'
    }),
    test_scenarios: [
      'SELECT * FROM issue_patterns WHERE pattern_id=\'PAT-AUTO-ec5c4c80\' shows status=resolved'
    ],
    given_when_then: 'Given PAT-AUTO-ec5c4c80 tracks invalid handoff type usage, When the removal and replacement is complete, Then the pattern status updates to resolved',
    created_by: 'SYSTEM'
  },
  {
    story_key: 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-028:US-004',
    prd_id: PRD,
    sd_id: SD,
    title: 'Mark issue pattern PAT-AUTO-c205e83a as resolved',
    user_role: 'Infrastructure Engineer',
    user_want: 'testing gate failure pattern marked as resolved',
    user_benefit: 'ensures infrastructure SDs no longer fail the testingSubAgentVerified gate',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'Pattern PAT-AUTO-c205e83a status is set to resolved',
      'Context notes that shouldSkipCodeValidation() fix resolves it',
      'Pattern is linked to shouldSkipCodeValidation gate logic'
    ],
    definition_of_done: [
      'Database pattern record updated',
      'Context documented for future reference'
    ],
    technical_notes: 'testingSubAgentVerified gate was failing for infrastructure SDs. The shouldSkipCodeValidation() function handles this.',
    implementation_context: JSON.stringify({
      affected_tables: ['issue_patterns'],
      pattern_id: 'PAT-AUTO-c205e83a',
      update_strategy: 'Set status=resolved for this pattern',
      root_cause: 'testingSubAgentVerified gate failure for infrastructure SDs - now handled by shouldSkipCodeValidation()'
    }),
    test_scenarios: [
      'SELECT * FROM issue_patterns WHERE pattern_id=\'PAT-AUTO-c205e83a\' shows status=resolved',
      'Infrastructure SDs pass testingSubAgentVerified gate with shouldSkipCodeValidation=true'
    ],
    given_when_then: 'Given PAT-AUTO-c205e83a represents gate failures for infrastructure SDs, When shouldSkipCodeValidation correctly identifies them, Then the pattern can be marked resolved',
    created_by: 'SYSTEM'
  },
  {
    story_key: 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-028:US-005',
    prd_id: PRD,
    sd_id: SD,
    title: 'Regenerate CLAUDE.md with corrected sub-agent trigger keywords',
    user_role: 'Infrastructure Engineer',
    user_want: 'CLAUDE.md reflects corrected trigger keywords in sub-agent documentation',
    user_benefit: 'ensures documentation is always in sync with database configuration',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'CLAUDE.md is regenerated via generate-claude-md-from-db.js',
      'Sub-agent trigger keyword references show EXEC-TO-PLAN, not EXEC_IMPLEMENTATION_COMPLETE',
      'All 4 affected sub-agents are correctly documented'
    ],
    definition_of_done: [
      'Script executed successfully',
      'CLAUDE.md updated and committed',
      'No old references to EXEC_IMPLEMENTATION_COMPLETE remain'
    ],
    technical_notes: 'CLAUDE.md is auto-generated from the database using generate-claude-md-from-db.js.',
    implementation_context: JSON.stringify({
      affected_files: ['CLAUDE.md', 'scripts/generate-claude-md-from-db.js'],
      regeneration_source: 'leo_sub_agents table trigger_keywords field',
      validation: 'Check CLAUDE.md for EXEC-TO-PLAN presence and EXEC_IMPLEMENTATION_COMPLETE absence'
    }),
    test_scenarios: [
      'Run generate-claude-md-from-db.js',
      'Verify CLAUDE.md contains EXEC-TO-PLAN for DATABASE, GITHUB, TESTING, DOCMON',
      'grep -c "EXEC_IMPLEMENTATION_COMPLETE" CLAUDE.md returns 0'
    ],
    given_when_then: 'Given trigger keywords are corrected in the database, When generate-claude-md-from-db.js runs, Then CLAUDE.md reflects the corrected triggers',
    created_by: 'SYSTEM'
  }
];

(async () => {
  try {
    console.log(`Inserting ${stories.length} user stories for ${PRD}...`);
    const { data, error } = await sb.from('user_stories').insert(stories);
    if (error) {
      console.error('Error inserting stories:', error);
      process.exit(1);
    }
    console.log(`Successfully inserted ${stories.length} user stories`);
    stories.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.story_key} - ${s.title}`);
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
})();
