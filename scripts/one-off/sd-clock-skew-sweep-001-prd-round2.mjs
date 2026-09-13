#!/usr/bin/env node
// PRD round 2: incorporates prospective TESTING sub-agent findings (invocation 3d3cbef7,
// 2026-09-13). Real, verified defects found in the piece (d) draft and fixed before EXEC:
// (1) the fake-clock token only matched 1 of 4 entry points (3 take `now` positionally) --
// measured false-positive rate: 9 of 11 baseline files were FPs once the entry-point-call
// detection was tightened to require a trailing `(` and a literal new Date(...) token was added;
// (2) a renamed file's merge-base lookup used the NEW path, misclassifying a pre-existing
// violation as newly-introduced -- fixed with a parseRenameMap, mirroring shell-injection-argv-
// lint.mjs; (3) no test file existed for the lint tool -- scripts/lint/wall-clock-test-lint.test.js
// added (16 tests). The observed_offset_ms "decay" finding was independently verified FALSE for
// this SD's actual implementation (empirically probed: vi.setSystemTime does not decay with real
// elapsed time) -- not applied.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001';

const { data: prd, error: readErr } = await supabase.from('product_requirements_v2').select('functional_requirements,acceptance_criteria,risks').eq('id', PRD_ID).single();
if (readErr) { console.error('READ_FAILED', readErr); process.exit(1); }

const functional_requirements = prd.functional_requirements.map((fr) => {
  if (fr.id === 'FR-3') {
    return {
      ...fr,
      description: `${fr.description} A prospective TESTING sub-agent review (invocation 3d3cbef7) found the naive `
        + '"now:" token matched only 1 of the 4 entry points (the other 3 take `now` positionally) and measured a '
        + '>=27% false-positive rate on the initial 11-file census; fixed by requiring a trailing `(` (a real call, '
        + 'never a `name: stub` DI/vi.mock() key) plus a literal `new Date(...)` clearing token. Re-measured baseline: 2 files, not 11.',
      acceptance_criteria: [
        ...fr.acceptance_criteria,
        'ENTRY_POINT_RE requires a trailing `(` -- a bare `name: stub` object key is never counted as a live call',
        'FAKE_CLOCK_TOKEN_RE also matches a literal new Date(\'...\'|"..."|`...`|<digits>) anywhere in the file',
        '--all census, re-measured after the fix: 2 violations / 4173 test files scanned (both genuine: reconcileOutboundSms called with no now: option)',
      ],
    };
  }
  return fr;
});

functional_requirements.push({
  id: 'FR-6',
  title: 'Diff-mode rename handling does not misclassify a pre-existing violation as new',
  priority: 'high',
  description: 'collectDiffTestFiles parses git diff --name-status -M into a rename map (newPath -> oldPath); readAtMergeBase looks up the OLD path for a renamed file, mirroring scripts/lint/shell-injection-argv-lint.mjs\'s parseRenameMap. Without this, a file already violating before a mid-branch rename would misread as newly introduced (found by prospective TESTING review, invocation 3d3cbef7).',
  acceptance_criteria: [
    'parseRenameMap(nameStatus) maps a git diff -M R100 line\'s new path to its old path',
    'runDiffMode classifies a renamed, already-violating file as preExisting, verified by an injected-runner unit test',
  ],
});

functional_requirements.push({
  id: 'FR-7',
  title: 'wall-clock-test-lint.mjs ships with its own test coverage',
  priority: 'high',
  description: 'A test-hygiene tool with zero tests of its own is the exact blind-guard class this SD exists to close (prospective TESTING review, invocation 3d3cbef7: "the seams are there, the tests are not"). scripts/lint/wall-clock-test-lint.test.js covers isViolation (all clearing/flagging shapes), parseRenameMap, and runDiffMode (new/pre-existing/regressed/clean/renamed partitions, plus the degraded-merge-base path), via an injectable readCurrentFile seam added specifically to make this testable without touching disk.',
  acceptance_criteria: [
    'npx vitest run scripts/lint/wall-clock-test-lint.test.js passes all 16 cases',
    'runDiffMode accepts an injectable readCurrentFile parameter (default: real fs read) so its file-content logic is unit-testable',
  ],
});

const acceptance_criteria = [
  ...prd.acceptance_criteria,
  'npx vitest run scripts/lint/wall-clock-test-lint.test.js passes all 16 cases',
];

const risks = [
  ...prd.risks,
  { risk: 'wall-clock-test-lint.mjs is comment-blind (a whole-file substring scan): a comment mentioning an entry point or a fake-clock token can clear or trip a violation that the real code does not carry', probability: 'LOW', impact: 'LOW', mitigation: 'Documented explicitly in the tool\'s own header comment as a stated, accepted limitation (advisory-only tool, not yet CI-blocking) rather than silently assumed away', rollback_plan: 'N/A -- a documentation-only limitation, not a defect requiring rollback' },
];

const { error: writeErr } = await supabase.from('product_requirements_v2').update({ functional_requirements, acceptance_criteria, risks }).eq('id', PRD_ID);
if (writeErr) { console.error('WRITE_FAILED', writeErr); process.exit(1); }
console.log('PRD round-2 updated with prospective TESTING findings for', PRD_ID);
