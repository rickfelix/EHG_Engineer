#!/usr/bin/env node
/**
 * PLAN-phase PRD correction for SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B.
 *
 * The PRD as first authored told EXEC to cite parent SD-003's shadow re-score rows as the
 * per-pair safety evidence. That framing is wrong, and the error is structural, not clerical:
 * gate-threshold-shadow-rescore.mjs:59 filters the re-score population by the view's HISTORICAL
 * current_threshold, so each shadow row only ever re-scored the PRE-raise population and never
 * touched a single assessment scored under the live raised bar. Those rows are therefore VACUOUS
 * as post-raise evidence.
 *
 * The replacement evidence is a direct query against ai_quality_assessments at the live
 * pass_threshold, independently re-verified by the EXEC worker (not accepted from a sub-agent
 * report): bugfix x prd n=46 45/46 97.8%; feature x prd n=10 9/10 90.0%; security x user_story
 * n=31 27/31 87.1%.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B';

const functional_requirements = [
  {
    id: 'FR-1',
    title: 'Record bugfix x prd and feature x prd as already-applied, with REAL post-raise evidence',
    description:
      "In scripts/modules/ai-quality-evaluator/config.js, extend the existing bugfix and feature SD_TYPE_PASS_THRESHOLDS comment blocks to record two things. (a) The parent SD-003 shadow re-score rows for these pairs (d9ad5522 for bugfix x prd, 1cdcaecd for feature x prd) are VACUOUS as post-raise safety evidence: gate-threshold-shadow-rescore.mjs:59 filters the population by the view's HISTORICAL current_threshold (60), so each row only ever re-scored the PRE-raise population and never touched an assessment scored under the live 65. They must not be cited as confirming the live bar. (b) The REAL post-raise numbers, queried directly against ai_quality_assessments WHERE pass_threshold=65 and independently re-verified by the EXEC worker: bugfix x prd n=46, pass 45/46 (97.8%), window 2026-08-29..2026-09-05; feature x prd n=10, pass 9/10 (90.0%), window 2026-08-28..2026-09-05. Both meet the MIN_SAMPLE>=10 floor. No prd value is edited -- both are already 65.",
    priority: 'critical',
    acceptance_criteria: [
      'The bugfix comment block states row d9ad5522 is vacuous as post-raise evidence AND gives the real n=46 / 97.8% post-raise measurement',
      'The feature comment block states row 1cdcaecd is vacuous as post-raise evidence AND gives the real n=10 / 90.0% post-raise measurement',
      'git diff on config.js shows no change to any numeric threshold value (comment lines only)',
    ],
  },
  {
    id: 'FR-2',
    title: 'Record security x user_story as already-applied via the shared default, with REAL post-raise evidence',
    description:
      "Extend the security SD_TYPE_PASS_THRESHOLDS comment block to record that (a) parent SD-003's shadow row 22cbb767 is VACUOUS for the same structural reason -- it re-scored the PRE-raise 65-group (n=17) and never an assessment scored under the live 70; and (b) the REAL post-raise number, queried directly against ai_quality_assessments WHERE pass_threshold=70 and independently re-verified by the EXEC worker: n=31, pass 27/31 (87.1%), window 2026-08-16..2026-08-29, clearing the MIN_SAMPLE>=10 floor. Also record that this pair needs NO dedicated user_story override key because the shared default is already 70 (QF-20260807-698), which is how the recommended 65->70 was satisfied.",
    priority: 'critical',
    acceptance_criteria: [
      'The security comment block states row 22cbb767 is vacuous as post-raise evidence AND gives the real n=31 / 87.1% post-raise measurement',
      'The security comment states user_story resolves to default=70 and needs no override key',
      'SD_TYPE_PASS_THRESHOLDS.security remains exactly { default: 70, retrospective: 75 } -- no key added',
    ],
  },
  {
    id: 'FR-3',
    title: 'Add the missing direct test pin for security x user_story',
    description:
      "tests/unit/quality/ai-quality-evaluator-config.test.js currently pins security x user_story only indirectly (asserting .user_story is undefined and .default is 70). Add a direct assertion that getPassThreshold('user_story', { sd_type: 'security' }) === 70, pinning the value the gate actually resolves at runtime rather than only the config shape it derives from, so a future wrong user_story override fails loudly.",
    priority: 'high',
    acceptance_criteria: [
      "A new assertion getPassThreshold('user_story', { sd_type: 'security' }) === 70 exists in the test file",
      'npx vitest run tests/unit/quality/ai-quality-evaluator-config.test.js passes with the new assertion included',
      'Negative control: temporarily setting security.default to 65 makes the new assertion FAIL (run once locally, then reverted)',
    ],
  },
];

const acceptance_criteria = [
  'Each of the three pairs records BOTH that its SD-003 shadow row is vacuous as post-raise evidence AND its real directly-queried post-raise measurement',
  'No SD_TYPE_PASS_THRESHOLDS value changes: git diff on config.js touches comment lines only',
  "getPassThreshold('user_story', { sd_type: 'security' }) === 70 is directly asserted and passing",
  'Every post-raise number in the committed comments was independently re-verified by the EXEC worker against ai_quality_assessments, not accepted from a sub-agent report',
  'The PR description states explicitly that no threshold changed and why (already applied by QF-20260817-837 / QF-20260807-698)',
];

const risks = [
  {
    risk: 'Citing the SD-003 shadow rows as safety evidence would be citing a measurement that structurally cannot speak to the live bar -- the original PRD framing made exactly this error before it was caught',
    mitigation: 'The comments now state the vacuity explicitly and supply the real post-raise measurement instead; the vacuity is traced to gate-threshold-shadow-rescore.mjs:59',
    severity: 'medium',
  },
  {
    risk: 'A future reader concludes the raises happened in this SD, misattributing the gate-behaviour change and its date',
    mitigation: 'PR description, config.js comments, SD description and retrospective all name the actual QFs and commits that made the raises',
    severity: 'low',
  },
  {
    risk: 'Sibling children 003-C and 003-D proceed on the same stale premise',
    mitigation: 'Escalated to the coordinator (signal 4594b2fc, high) with the root cause and the 003-D inspection-bypass concern',
    severity: 'medium',
  },
  {
    risk: 'The post-raise windows are short (feature x prd n=10 sits exactly at the sample floor), so a later regression could appear that these numbers cannot yet see',
    mitigation: 'Numbers are recorded with their explicit n and window so a future reader can re-measure; the parent SD-003 FR-9 14-day pass-rate check remains the ongoing outcome arm',
    severity: 'low',
  },
];

async function main() {
  const { data: cur, error: readErr } = await supabase
    .from('product_requirements_v2')
    .select('metadata')
    .eq('id', PRD_ID)
    .single();
  if (readErr) throw new Error(readErr.message);

  const metadata = {
    ...(cur.metadata || {}),
    shadow_rows_are_vacuous_as_post_raise_evidence: true,
    shadow_vacuity_root_cause: 'scripts/gate-threshold-shadow-rescore.mjs:59 filters the re-score population by the historical pass_threshold, so a shadow row never scores an assessment under the live raised bar',
    post_raise_measurements_verified_by: 'EXEC worker direct query against ai_quality_assessments, 2026-09-05 (sub-agent numbers independently re-run, all three matched exactly)',
    post_raise_measurements: {
      bugfix_prd: 'n=46 pass=45 97.8% window 2026-08-29..2026-09-05',
      feature_prd: 'n=10 pass=9 90.0% window 2026-08-28..2026-09-05',
      security_user_story: 'n=31 pass=27 87.1% window 2026-08-16..2026-08-29',
    },
  };

  const { error } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements, acceptance_criteria, risks, metadata })
    .eq('id', PRD_ID);
  if (error) throw new Error(error.message);

  console.log('PRD corrected: FRs now require real post-raise evidence, not the vacuous shadow rows');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
}
