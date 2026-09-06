import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-D';

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const mechanism_verifications = [
  { verified_at: 'scripts/modules/ai-quality-evaluator/config.js:58', verified_by: 'lead-audit-investigation' },
  { verified_at: 'scripts/modules/ai-quality-evaluator/config.js:89', verified_by: 'lead-audit-investigation' },
  { verified_at: 'scripts/modules/ai-quality-evaluator/config.js:133', verified_by: 'lead-audit-investigation' },
  { verified_at: 'scripts/modules/ai-quality-evaluator/config.js:215', verified_by: 'lead-audit-investigation' },
  { verified_at: 'scripts/one-off/_d-audit-query.mjs:1', verified_by: 'lead-audit-investigation' },
  { verified_at: 'scripts/one-off/_d-inspect-flips.mjs:1', verified_by: 'lead-audit-investigation' },
];

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'node scripts/one-off/_d-audit-query.mjs',
    expected_outcome: 'Prints n/pass/flip counts for all 5 pairs matching the verdicts recorded in config.js (infrastructure x prd: 0 flips; infrastructure x retrospective: 2 flips; feature x retrospective: 0 flips; security x retrospective: 0 flips, n=2; bugfix x retrospective: 0 flips)',
  },
  {
    step_number: 2,
    instruction: 'node scripts/one-off/_d-inspect-flips.mjs',
    expected_outcome: 'Prints full AI-judge feedback and linked retrospective quality_score for the two infrastructure x retrospective flip ids (47283f94-437e-4143-9c0a-e01770b7cccb, cfec2d37-6f4e-4a4d-923b-727bcccba3ad), showing genuine specificity/actionability defects',
  },
  {
    step_number: 3,
    instruction: "node -e \"import('./scripts/modules/ai-quality-evaluator/config.js').then(m => console.log(m.SD_TYPE_PASS_THRESHOLDS))\"",
    expected_outcome: 'Prints the same numeric threshold values as before this SD -- confirming zero rollback (all 5 verdicts are SOUND)',
  },
];

const key_changes = [
  {
    change: 'Recorded a formal SOUND verdict for infrastructure x prd and infrastructure x retrospective in config.js, citing live-queried n/pass/flip counts and (for retrospective) the 2 hand-inspected flip ids',
    impact: 'Closes the audit sibling E deferred to this child; no threshold value changes',
  },
  {
    change: 'Recorded a provisional-SOUND verdict for security x retrospective (n=2, below the >=10 sample floor, but 0 observed flips/failures)',
    impact: 'No rollback; flags the pair for continued monitoring rather than acting on an underpowered sample',
  },
  {
    change: 'Recorded a SOUND verdict for both Solomon-held three-flip pairs (bugfix x retrospective, feature x retrospective), each showing 0 actual flips in the live post-raise population',
    impact: 'Satisfies the hand-inspection Solomon\'s hold 9a3e1a95 required; no rollback for either pair',
  },
];

const success_criteria = [
  { criterion: 'One SOUND/UNSOUND verdict recorded per pair (5 of 5) with row ids cited for any pair with actual flipped assessments', measure: '5/5 pairs carry a verdict block in config.js' },
  { criterion: 'Every flipped assessment in the audited population (2 total, both in infrastructure x retrospective) is hand-inspected, not just counted', measure: '2/2 flipped rows inspected via feedback JSONB + linked retrospective quality_score' },
  { criterion: 'No config.js numeric threshold value changes since every verdict is SOUND', measure: 'SD_TYPE_PASS_THRESHOLDS output is byte-identical before/after this SD' },
];

const success_metrics = [
  {
    metric: 'Verdict coverage',
    target: '5 of 5 target pairs carry a recorded SOUND/UNSOUND verdict',
    actual: '100% -- 5 of 5 (infrastructure x prd, infrastructure x retrospective, security x retrospective, bugfix x retrospective, feature x retrospective) all recorded as SOUND',
    evidence: { kind: 'db_probe', ref: 'scripts/one-off/_d-audit-query.mjs' },
  },
  {
    metric: 'Flip hand-inspection completeness',
    target: '100% of flipped assessments hand-inspected',
    actual: '100% -- 2 of 2 flipped rows (the only flips across all 5 pairs) hand-inspected via scripts/one-off/_d-inspect-flips.mjs',
    evidence: { kind: 'db_probe', ref: 'scripts/one-off/_d-inspect-flips.mjs' },
  },
  {
    metric: 'Zero regressions',
    target: '0 existing tests broken',
    actual: '0 regressions -- tests/unit/quality/gate-threshold-shadow.test.js (12/12) and tests/unit/quality/ai-quality-evaluator-config.test.js (16/16) pass unmodified after the comment-only config.js edit',
  },
];

const mergedMetadata = { ...(sd.metadata || {}), mechanism_verifications };

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: mergedMetadata, smoke_test_steps, key_changes, success_criteria, success_metrics })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('SD enrichment fields + mechanism_verifications written for', SD_KEY);
