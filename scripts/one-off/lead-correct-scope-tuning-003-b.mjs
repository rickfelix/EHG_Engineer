#!/usr/bin/env node
/**
 * LEAD-phase scope correction for SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B, after Explore evidence
 * (bc236f00) confirmed that FR-1/FR-2/FR-3's target threshold values are ALREADY live in
 * scripts/modules/ai-quality-evaluator/config.js -- applied by QF-20260817-837 (bugfix.prd=65,
 * feature.prd=65, commits 95c47ad7/882a789b, 2026-08-28) and QF-20260807-698 (security.default=70,
 * commit 3f285a83, 2026-08-16), both predating this SD's 2026-09-05 creation and the parent SD's
 * own 2026-09-04 shadow-rescore. The parent's shadow-rescore 'current_threshold' field (60/60/65)
 * reflects the historical per-assessment pass_threshold recorded over a 28-day window mixing
 * pre/post-QF assessments, not config.js's live value -- exactly the ambiguity scoring.js's own
 * getPassThreshold() comment (QF-20260830-735) and tests/unit/quality/ai-quality-evaluator-config.test.js
 * (lines 44-68) already document and pin.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B';

const description = `Apply the three zero-flip threshold increases from parent SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003 (FR-1 bugfix x prd, FR-2 feature x prd, FR-3 security x user_story) in scripts/modules/ai-quality-evaluator/config.js.

LEAD-PHASE CORRECTION (Explore evidence bc236f00, 2026-09-05): all three target values are ALREADY live -- bugfix.prd=65 and feature.prd=65 (QF-20260817-837, commits 95c47ad7/882a789b, landed 2026-08-28), and security's effective user_story threshold=70 via its shared default (QF-20260807-698, commit 3f285a83, landed 2026-08-16) -- both predating this SD and the parent's own 2026-09-04 shadow-rescore measurement, whose 'current_threshold' reads reflect historical per-assessment values from a mixed pre/post-QF 28-day window, not the live config.

Scope is corrected from "apply a threshold change" to "verify and durably document the already-applied values" -- add the TUNING-003 shadow re-score row citations (d9ad5522, 1cdcaecd, 22cbb767: zero PASS-to-FAIL flips across all three pairs) into config.js's existing QF-20260817-837/QF-20260807-698 comment blocks, and add the one still-missing direct pin (getPassThreshold('user_story', security) === 70) to the existing test file, so this SD's acceptance requirement -- each pair carries its before value, after value, shadow re-score row id, and rollback -- is satisfied without any functional config change.`;

const scope = `IN SCOPE: add TUNING-003 shadow re-score row citations (feedback.id d9ad5522-654c-4fc2-81e1-ee92ea05c16f for bugfix x prd, 1cdcaecd-bb34-4dc9-82ba-7c5270dace77 for feature x prd, 22cbb767-741c-44d0-a669-e8cb62448bbd for security x user_story) into scripts/modules/ai-quality-evaluator/config.js's existing bugfix/feature/security comment blocks; add one direct pin to tests/unit/quality/ai-quality-evaluator-config.test.js asserting getPassThreshold('user_story', { sd_type: 'security' }) === 70 (currently only indirectly covered via .default).

OUT OF SCOPE: changing any SD_TYPE_PASS_THRESHOLDS value (none needs to change -- all three are already correct); FR-4 through FR-11 (siblings -A/-C/-D/-E's scope); re-litigating whether QF-20260817-837's already-applied bugfix/feature x retrospective raises (sibling -D's pairs) had the required defect-outcome inspection -- flagged separately to the coordinator (signal 4594b2fc), not this child's job to resolve.`;

const success_criteria = [
  {
    criterion: "config.js's bugfix, feature, and security SD_TYPE_PASS_THRESHOLDS comment blocks each cite their TUNING-003 shadow re-score feedback row id and zero-flip evidence alongside the existing before/after/QF citation",
    measure: 'grep config.js for feedback ids d9ad5522, 1cdcaecd, and 22cbb767 -- all three present adjacent to their pair\'s threshold key',
  },
  {
    criterion: "getPassThreshold('user_story', { sd_type: 'security' }) === 70 is directly asserted, not just indirectly covered via .default",
    measure: 'New assertion added to tests/unit/quality/ai-quality-evaluator-config.test.js; npx vitest run tests/unit/quality/ai-quality-evaluator-config.test.js passes',
  },
  {
    criterion: 'No SD_TYPE_PASS_THRESHOLDS value changes in this PR -- the diff is comments and test coverage only',
    measure: 'git diff scripts/modules/ai-quality-evaluator/config.js touches only comment lines, verified by reviewing the diff before merge',
  },
];

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: "Run: node -e \"import('./scripts/modules/ai-quality-evaluator/scoring.js').then(m=>console.log(m.getPassThreshold('prd',{sd_type:'bugfix'}), m.getPassThreshold('prd',{sd_type:'feature'}), m.getPassThreshold('user_story',{sd_type:'security'})))\"",
    expected_outcome: 'Prints "65 65 70" -- confirming all three FR-1/FR-2/FR-3 target thresholds are already live and unchanged by this SD',
  },
  {
    step_number: 2,
    instruction: 'Open scripts/modules/ai-quality-evaluator/config.js and read the bugfix, feature, and security SD_TYPE_PASS_THRESHOLDS comment blocks',
    expected_outcome: 'Each now cites its TUNING-003 shadow re-score feedback row id (d9ad5522 / 1cdcaecd / 22cbb767) and zero-flip pass-rate evidence, not just the original QF citation',
  },
  {
    step_number: 3,
    instruction: 'Run: npx vitest run tests/unit/quality/ai-quality-evaluator-config.test.js',
    expected_outcome: 'All tests pass, including the new direct pin for security x user_story = 70',
  },
];

const exploration_summary = {
  files_explored: [
    'scripts/modules/ai-quality-evaluator/config.js',
    'scripts/modules/ai-quality-evaluator/scoring.js',
    'tests/unit/quality/ai-quality-evaluator-config.test.js',
  ],
  explored_at: new Date().toISOString(),
  explored_by: 'Explore-agent-bc236f00',
};

const mechanism_verifications = [
  { claim: 'bugfix.prd is already 65 in live config.js', verified_by: 'Explore-agent-bc236f00', verified_at: 'scripts/modules/ai-quality-evaluator/config.js:120' },
  { claim: 'feature.prd is already 65 in live config.js', verified_by: 'Explore-agent-bc236f00', verified_at: 'scripts/modules/ai-quality-evaluator/config.js:59' },
  { claim: 'security.default is already 70, covering user_story (no dedicated override key)', verified_by: 'Explore-agent-bc236f00', verified_at: 'scripts/modules/ai-quality-evaluator/config.js:86' },
  { claim: 'getPassThreshold() reads config.js live, not the historical view column', verified_by: 'Explore-agent-bc236f00', verified_at: 'scripts/modules/ai-quality-evaluator/scoring.js:76-90' },
  { claim: 'all three values already pinned by pre-existing CI tests (QF-20260817-837/QF-20260807-698 dispositions)', verified_by: 'Explore-agent-bc236f00', verified_at: 'tests/unit/quality/ai-quality-evaluator-config.test.js:44-68' },
];

async function main() {
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ description, scope, success_criteria, smoke_test_steps, exploration_summary, scope_reduction_percentage: 90 })
    .eq('sd_key', SD_KEY);
  if (error) throw new Error(error.message);

  const { data: mdRow, error: mdReadErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (mdReadErr) throw new Error(mdReadErr.message);

  const { error: mdErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: { ...mdRow.metadata, mechanism_verifications } })
    .eq('sd_key', SD_KEY);
  if (mdErr) throw new Error(mdErr.message);

  console.log('SD corrected:', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
}
