// SD-MAN-INFRA-VENTURE-CRACK-GATE-001: strengthens the FR-9 correction from
// crack-gate-fr1-fr9-independent-sweep-corrections.cjs per val-fr79's follow-up pushback --
// the earlier note framed this as a wrong-file citation; val-fr79 correctly pointed out the
// substantive issue is that criterion [1]'s "exists AND PASSES" cannot be true in ANY
// environment that exists today, not just that it's currently skipped. Verified directly
// before writing this: tests/helpers/db-target.js:25 DESIGNATED_NON_PROD_REFS is genuinely
// Object.freeze([]) -- empty, not just "not yet populated for this run".
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: prdRow, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements')
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001')
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  const fr = prdRow.functional_requirements;
  const fr9 = fr.find((f) => f.id === 'FR-9');
  if (!fr9) throw new Error('FR-9 not found');

  fr9.acceptance_criteria.push(
    "CORRECTION, strengthened (independent post-ship sweep, val-fr79): criterion [1]'s \"exists AND PASSES\" is not merely mis-citing a file -- it is substantively unmet on \"passes\", the same class as FR-8's own known limitation. Verified directly: tests/helpers/db-target.js:25 DESIGNATED_NON_PROD_REFS is Object.freeze([]) -- genuinely empty, not just unpopulated for this run. The describeDb-gated smoke suite's only path to executing is VITEST_DB_ALLOW_REF matching an entry in that list, or the live target ref itself being designated non-prod; the observed ref (dedlbzhpgkmetvhbkyzq) is production, explicitly forbidden by tests/helpers/db-available.js. So the test cannot pass in ANY environment that exists today -- a SKIPPED test is being counted as a PASSING one. Corrected statement: \"exists; cannot execute pending a designated non-prod target (QF-20260726-459 Part 2)\", not \"exists and passes\".",
  );

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: fr })
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001');
  if (updateErr) throw updateErr;
  console.log('FR-9 "cannot pass" clarification appended.');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
