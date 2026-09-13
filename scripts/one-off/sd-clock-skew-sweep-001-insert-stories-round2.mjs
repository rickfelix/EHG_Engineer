#!/usr/bin/env node
// PLAN round 2: user stories for FR-6/FR-7 (added to the PRD after prospective TESTING findings),
// closing the FR_DELIVERY_TRACEABILITY gap at EXEC-TO-PLAN.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001';
const PRD_ID = `PRD-${SD_KEY}`;

const { data: sd, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
if (sdErr) { console.error('SD_LOOKUP_FAILED', sdErr); process.exit(1); }

function ctx({ files, approach, tests }) {
  return `## Implementation Guidance\n\n**Files to modify:**\n${files.map((f) => `- ${f}`).join('\n')}\n\n**Approach:**\n${approach}\n\n**Test coverage:**\n${tests}`;
}

const rows = [
  {
    story_key: `${SD_KEY}:US-006`,
    prd_id: PRD_ID,
    sd_id: sd.id,
    title: 'Diff-mode rename handling does not misclassify a pre-existing violation as new (FR-6)',
    user_role: 'Any engineer renaming a test file',
    user_want: 'a renamed, already-violating test file to still be reported as pre-existing debt, not a new blocking violation',
    user_benefit: 'a routine rename never trips a false-positive CI block',
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      { scenario: 'Rename preserves baseline status', given: 'a file already violating at the merge base is renamed and still violates', when: 'runDiffMode executes', then: 'the file is classified preExisting, not newViolations' },
    ],
    implementation_context: ctx({
      files: ['scripts/lint/wall-clock-test-lint.mjs'],
      approach: 'parseRenameMap(nameStatus) built from `git diff --name-status -M`; readAtMergeBase(run, mergeBase, file, renames) looks up the OLD path when the file was renamed.',
      tests: 'scripts/lint/wall-clock-test-lint.test.js: "a RENAMED file already violating at its OLD path is pre-existing" (runDiffMode describe block).',
    }),
    validation_status: 'validated',
    created_by: 'PLAN_LEAD_MANUAL',
  },
  {
    story_key: `${SD_KEY}:US-007`,
    prd_id: PRD_ID,
    sd_id: sd.id,
    title: 'wall-clock-test-lint.mjs ships with its own test coverage (FR-7)',
    user_role: 'Future maintainer of the lint tool',
    user_want: 'the lint tool itself to be covered by tests, not just its consumers',
    user_benefit: 'a regression in the detector logic is caught before it silently stops (or over-) flagging real files',
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      { scenario: 'Tool has direct test coverage', given: 'scripts/lint/wall-clock-test-lint.test.js', when: 'run via vitest', then: 'all 16 cases pass, covering isViolation, parseRenameMap, and runDiffMode' },
    ],
    implementation_context: ctx({
      files: ['scripts/lint/wall-clock-test-lint.test.js'],
      approach: 'Pure-function tests for isViolation (all clearing/flagging shapes) and parseRenameMap; an injectable readCurrentFile seam added to runDiffMode so its file-content partition logic is testable without touching disk.',
      tests: 'This IS the test file — self-verifying via `npx vitest run scripts/lint/wall-clock-test-lint.test.js`.',
    }),
    validation_status: 'validated',
    created_by: 'PLAN_LEAD_MANUAL',
  },
];

const { error } = await supabase.from('user_stories').upsert(rows, { onConflict: 'story_key' });
if (error) { console.error('STORIES_INSERT_FAILED', error); process.exit(1); }
console.log('Inserted', rows.length, 'additional user stories for', SD_KEY);
