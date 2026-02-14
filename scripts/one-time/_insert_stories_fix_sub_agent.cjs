/**
 * One-time script: Insert user stories for SD-LEO-FIX-STORIES-SUB-AGENT-001
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sdKey = 'SD-LEO-FIX-STORIES-SUB-AGENT-001';
const sdId = '564859d2-d730-4cf1-96c1-12f2966c5a64';  // strategic_directives_v2.id (UUID)
const prdId = 'f0b272c5-5b70-4c72-b6e1-a730ead95773';

const stories = [
  {
    story_key: `${sdKey}:US-001`,
    prd_id: prdId,
    sd_id: sdId,
    title: 'Wire Auto-Validation into EXEC-TO-PLAN Handoff Pipeline',
    user_role: 'EXEC-TO-PLAN Handoff Pipeline',
    user_want: 'to automatically invoke user story validation (auto-validate-user-stories-on-exec-complete.js) during the EXEC-TO-PLAN handoff gate sequence',
    user_benefit: 'user story quality is validated at every EXEC-TO-PLAN transition without relying on manual invocation, catching quality issues before they propagate to PLAN review',
    story_points: 3,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Auto-validation invoked during EXEC-TO-PLAN handoff',
        given: 'An SD has user stories in the user_stories table AND the EXEC-TO-PLAN handoff is triggered',
        when: 'The EXEC-TO-PLAN gate sequence executes in scripts/modules/handoff/executors/exec-to-plan/',
        then: 'auto-validate-user-stories-on-exec-complete.js is called AND its results are included in the handoff validation output'
      },
      {
        id: 'AC-001-2',
        scenario: 'Validation failure blocks handoff',
        given: 'User stories fail the auto-validation quality check (score below threshold)',
        when: 'The EXEC-TO-PLAN handoff gate sequence executes',
        then: 'The handoff is blocked with a clear error message listing which stories failed AND their scores AND improvement guidance'
      },
      {
        id: 'AC-001-3',
        scenario: 'Validation passes for compliant stories',
        given: 'All user stories pass the auto-validation quality check',
        when: 'The EXEC-TO-PLAN handoff gate sequence executes',
        then: 'The handoff proceeds without blocking AND validation results are logged for audit'
      }
    ],
    definition_of_done: [
      'auto-validate-user-stories-on-exec-complete.js is imported and called from exec-to-plan gate pipeline',
      'Validation results are included in handoff gate output',
      'Failed validation blocks EXEC-TO-PLAN transition',
      'Unit tests verify integration point'
    ],
    technical_notes: 'The script scripts/auto-validate-user-stories-on-exec-complete.js already exists and works standalone. The integration point is in scripts/modules/handoff/executors/exec-to-plan/gates/. This is a wiring task, not a new feature.',
    implementation_approach: 'Import the auto-validate script into the exec-to-plan gate pipeline. Call it as part of the gate sequence. Return its result as a gate pass/fail signal.',
    implementation_context: JSON.stringify({
      affected_files: [
        'scripts/modules/handoff/executors/exec-to-plan/gates/',
        'scripts/auto-validate-user-stories-on-exec-complete.js'
      ],
      test_approach: 'Unit test verifying the gate calls auto-validate and surfaces results',
      dependencies: ['auto-validate-user-stories-on-exec-complete.js']
    }),
    created_by: 'STORIES',
    validation_status: 'validated'
  },
  {
    story_key: `${sdKey}:US-002`,
    prd_id: prdId,
    sd_id: sdId,
    title: 'Wire E2E Test Mapping into EXEC-TO-PLAN Handoff Pipeline',
    user_role: 'EXEC-TO-PLAN Handoff Pipeline',
    user_want: 'to automatically invoke E2E test-to-story mapping (map-e2e-tests-to-stories.js) during the EXEC-TO-PLAN handoff gate sequence',
    user_benefit: 'E2E test coverage per user story is verified at every EXEC-TO-PLAN transition, ensuring implementation completeness is tracked before returning to PLAN review',
    story_points: 3,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'E2E test mapping invoked during EXEC-TO-PLAN handoff',
        given: 'An SD has user stories in the user_stories table AND E2E tests exist in the test suite',
        when: 'The EXEC-TO-PLAN gate sequence executes',
        then: 'map-e2e-tests-to-stories.js is called AND its mapping results are included in the handoff validation output'
      },
      {
        id: 'AC-002-2',
        scenario: 'Missing E2E coverage produces warning',
        given: 'Some user stories have no matching E2E test files',
        when: 'The E2E test mapping runs during EXEC-TO-PLAN',
        then: 'A warning is produced listing unmapped stories AND their story_keys AND the handoff proceeds (non-blocking)'
      },
      {
        id: 'AC-002-3',
        scenario: 'Mapping results stored in user_stories table',
        given: 'E2E test mapping identifies matching test files for stories',
        when: 'The mapping completes during EXEC-TO-PLAN',
        then: 'The e2e_test_path and e2e_test_status columns in user_stories are updated for each matched story'
      }
    ],
    definition_of_done: [
      'map-e2e-tests-to-stories.js is imported and called from exec-to-plan gate pipeline',
      'Mapping results are included in handoff gate output',
      'Unmapped stories produce warnings (non-blocking)',
      'e2e_test_path and e2e_test_status columns updated on match',
      'Unit tests verify integration point'
    ],
    technical_notes: 'The script scripts/modules/handoff/map-e2e-tests-to-stories.js already exists. Integration point is scripts/modules/handoff/executors/exec-to-plan/gates/. This is a wiring task. The mapping is informational (warning), not blocking.',
    implementation_approach: 'Import map-e2e-tests-to-stories.js into the exec-to-plan gate pipeline. Call it as an informational gate (non-blocking). Surface warnings for unmapped stories.',
    implementation_context: JSON.stringify({
      affected_files: [
        'scripts/modules/handoff/executors/exec-to-plan/gates/',
        'scripts/modules/handoff/map-e2e-tests-to-stories.js'
      ],
      test_approach: 'Unit test verifying the gate calls mapping and surfaces results',
      dependencies: ['map-e2e-tests-to-stories.js']
    }),
    created_by: 'STORIES',
    validation_status: 'validated'
  },
  {
    story_key: `${sdKey}:US-003`,
    prd_id: prdId,
    sd_id: sdId,
    title: 'Remove Duplicate E2E Test Mapping Script',
    user_role: 'LEO Protocol Maintainer',
    user_want: 'the duplicate script scripts/map-e2e-tests-to-user-stories.mjs to be deleted since its functionality is already in scripts/modules/handoff/map-e2e-tests-to-stories.js',
    user_benefit: 'there is a single source of truth for E2E test-to-story mapping, eliminating confusion about which script to use and preventing divergent implementations',
    story_points: 1,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Duplicate script is removed',
        given: 'scripts/map-e2e-tests-to-user-stories.mjs exists as a duplicate of scripts/modules/handoff/map-e2e-tests-to-stories.js',
        when: 'The cleanup is performed',
        then: 'scripts/map-e2e-tests-to-user-stories.mjs is deleted from the repository'
      },
      {
        id: 'AC-003-2',
        scenario: 'No remaining references to deleted script',
        given: 'The duplicate script has been deleted',
        when: 'A codebase search is performed for map-e2e-tests-to-user-stories',
        then: 'No import statements, require calls, or documentation references point to the deleted file'
      },
      {
        id: 'AC-003-3',
        scenario: 'Canonical script retains all functionality',
        given: 'The duplicate is deleted',
        when: 'scripts/modules/handoff/map-e2e-tests-to-stories.js is compared to the deleted duplicate',
        then: 'All functionality from the duplicate is present in the canonical version (no feature regression)'
      }
    ],
    definition_of_done: [
      'scripts/map-e2e-tests-to-user-stories.mjs is deleted',
      'No remaining imports or references to the deleted file',
      'Canonical script scripts/modules/handoff/map-e2e-tests-to-stories.js retains full functionality',
      'git rm used to remove the file cleanly'
    ],
    technical_notes: 'Verify the canonical version (map-e2e-tests-to-stories.js) has all features from the duplicate before deleting. Check for any callers of the duplicate script.',
    implementation_approach: 'Diff the two scripts to confirm they are equivalent. Search codebase for references to the duplicate. Delete the duplicate via git rm. Update any references to point to the canonical location.',
    implementation_context: JSON.stringify({
      affected_files: [
        'scripts/map-e2e-tests-to-user-stories.mjs (DELETE)',
        'scripts/modules/handoff/map-e2e-tests-to-stories.js (KEEP)'
      ],
      test_approach: 'Verify no broken imports after deletion',
      dependencies: []
    }),
    created_by: 'STORIES',
    validation_status: 'validated'
  },
  {
    story_key: `${sdKey}:US-004`,
    prd_id: prdId,
    sd_id: sdId,
    title: 'Align Heuristic Type Names with CATEGORY_THRESHOLDS Keys',
    user_role: 'User Story Quality Validation System',
    user_want: 'the heuristicTypes array in user-story-quality-validation.js to use only type names that exist as keys in CATEGORY_THRESHOLDS (story-quality.js), removing types that have no corresponding threshold',
    user_benefit: 'heuristic validation decisions and threshold lookups are consistent, preventing silent mismatches where a type triggers heuristic mode but has no matching threshold (falling back to the stricter default of 70%)',
    story_points: 2,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Mismatched type names identified and removed',
        given: 'heuristicTypes contains quality_assurance, theming, ux, design, ui, layout, state-management AND CATEGORY_THRESHOLDS contains documentation, infrastructure, feature, database, security, bugfix, qa, etc.',
        when: 'The heuristicTypes array is aligned',
        then: 'Only type names that exist as keys in CATEGORY_THRESHOLDS remain in heuristicTypes AND removed types are documented in a code comment explaining why'
      },
      {
        id: 'AC-004-2',
        scenario: 'Missing CATEGORY_THRESHOLDS entries added for legitimate types',
        given: 'Some removed heuristic types represent legitimate SD categories (e.g., theming, ux, design) that should use heuristic validation',
        when: 'The alignment is performed',
        then: 'CATEGORY_THRESHOLDS gains new entries for any legitimate types that were in heuristicTypes but missing from thresholds, with appropriate score values'
      },
      {
        id: 'AC-004-3',
        scenario: 'No functional regression for existing SD types',
        given: 'SDs with types documentation, infrastructure, bugfix, database currently pass validation',
        when: 'The aligned validation runs against the same SDs',
        then: 'All previously-passing SDs still pass with the same or better scores'
      },
      {
        id: 'AC-004-4',
        scenario: 'Single source of truth for type-to-validation mapping',
        given: 'The alignment is complete',
        when: 'A developer needs to add a new SD type',
        then: 'They only need to add it to CATEGORY_THRESHOLDS AND heuristicTypes can derive from CATEGORY_THRESHOLDS keys instead of maintaining a separate list'
      }
    ],
    definition_of_done: [
      'heuristicTypes array aligned with CATEGORY_THRESHOLDS keys',
      'Missing threshold entries added for legitimate new types',
      'Code comment documenting the alignment decision',
      'No regression in existing SD type validation scores',
      'Unit tests verify aligned behavior'
    ],
    technical_notes: 'Current mismatches: quality_assurance (CATEGORY_THRESHOLDS has "quality assurance" with space), theming (not in thresholds), ux (not in thresholds), design (not in thresholds), ui (not in thresholds), layout (not in thresholds), state-management (not in thresholds). Ideal fix: import CATEGORY_THRESHOLDS and derive heuristicTypes from its keys, making a single source of truth.',
    implementation_approach: 'Import CATEGORY_THRESHOLDS into user-story-quality-validation.js. Replace the hardcoded heuristicTypes array with Object.keys(CATEGORY_THRESHOLDS). Add threshold entries for any legitimate types that need heuristic validation (theming, ux, design, ui, layout). Remove state-management if it is not a real SD type.',
    implementation_context: JSON.stringify({
      affected_files: [
        'scripts/modules/user-story-quality-validation.js',
        'scripts/modules/handoff/verifiers/plan-to-exec/story-quality.js'
      ],
      test_approach: 'Unit tests verifying heuristicTypes matches CATEGORY_THRESHOLDS keys',
      dependencies: ['CATEGORY_THRESHOLDS in story-quality.js']
    }),
    created_by: 'STORIES',
    validation_status: 'validated'
  }
];

async function main() {
  // Check for existing stories first
  const { data: existing } = await sb
    .from('user_stories')
    .select('story_key')
    .eq('sd_id', sdId);

  if (existing && existing.length > 0) {
    console.log(`Found ${existing.length} existing stories for ${sdId}:`);
    existing.forEach(s => console.log(`  - ${s.story_key}`));
    console.log('Deleting existing stories before re-inserting...');
    const { error: delError } = await sb
      .from('user_stories')
      .delete()
      .eq('sd_id', sdId);
    if (delError) {
      console.error('DELETE ERROR:', delError);
      process.exit(1);
    }
  }

  const { data, error } = await sb
    .from('user_stories')
    .insert(stories)
    .select('story_key, title, priority, status');

  if (error) {
    console.error('INSERT ERROR:', JSON.stringify(error, null, 2));
    process.exit(1);
  }

  console.log(`SUCCESS: Inserted ${data.length} user stories for ${sdId}:`);
  data.forEach(s => console.log(`  - ${s.story_key}: ${s.title} [${s.priority}]`));
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
