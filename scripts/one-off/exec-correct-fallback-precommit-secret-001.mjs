#!/usr/bin/env node
// EXEC-phase correction for SD-LEO-FIX-PRE-COMMIT-SECRET-001's PRD (PRD-SD-LEO-FIX-PRE-COMMIT-SECRET-001).
// TDD (tests/unit/husky/pre-commit-merge-basis.test.js) FALSIFIED the LEAD-phase risk-agent/
// testing-agent claim that "an empty MERGE_HEAD-basis intersection must fall back to the
// HEAD-only basis" -- an empty intersection is the NORMAL, correct outcome of a clean
// non-conflicting merge (T2's own scenario proved this: the fixture-line fell out of the
// intersection legitimately, and an emptiness-triggered fallback would have reintroduced the
// false positive this SD exists to fix). The corrected, empirically-verified design gates the
// fallback on the MERGE_HEAD diff command's REAL exit status (a genuine git failure), never on
// the result being merely empty. Worker Golf, session 81425e08-c5b5-4fde-bafc-f0b9d5e9c349.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-FIX-PRE-COMMIT-SECRET-001';

async function main() {
  const { data: prd, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, technical_requirements, risks')
    .eq('id', PRD_ID)
    .single();
  if (fetchErr) throw fetchErr;

  const functional_requirements = prd.functional_requirements.map((fr) => {
    if (fr.id !== 'FR-3') return fr;
    return {
      ...fr,
      title: 'Exit-status-gated fallback: never confuse a legitimately empty result with a failure',
      description: 'If the MERGE_HEAD-basis diff command itself fails (nonzero exit -- a real git error, e.g. an invalid ref), fall back to the HEAD-only basis for that stream rather than using the failed command\'s output as-is. CORRECTED AT EXEC (TDD-falsified the LEAD-phase claim): the fallback MUST be gated on the diff command\'s real exit status, NEVER on the intersection or MERGE_HEAD-basis result being merely empty -- an empty MERGE_HEAD-basis result is the NORMAL, correct outcome of a clean non-conflicting merge (nothing the other parent brought in is genuinely new relative to itself), and a naive "empty means fallback" rule silently reintroduces the exact false-positive bug this SD fixes (measured live: tests/unit/husky/pre-commit-merge-basis.test.js T2 failed under the original emptiness-gated design, PASSED after gating on exit status instead).',
    };
  });

  const technical_requirements = prd.technical_requirements.map((tr) => {
    if (tr.id !== 'TR-3') return tr;
    return {
      ...tr,
      title: 'Filter ^+/^+++ before intersecting -- defensive default, not a proven correctness requirement',
      description: 'Apply the existing ^+ / ^+++ hunk-marker filter to each diff independently before intersecting (as originally specified). CORRECTED AT EXEC: empirically measured (same test suite, T9) that for this line-based grep -Fxf whole-line intersection, filtering before vs after intersecting produce the IDENTICAL final content-line result on the tested fixture shapes, because the trailing ^+/^+++ filter removes non-content lines (hunk headers, "--- /dev/null", etc.) regardless of when it runs, and grep -Fxf line-matching does not depend on neighboring line context. Filter-before remains the implementation choice as a defensive default (smaller/cleaner working sets into the intersection) but is not load-bearing for correctness the way TR-1/TR-2/FR-3 are.',
    };
  });

  const risks = prd.risks.map((r) => {
    if (!r.risk.startsWith('A wrong intersection implementation fails OPEN')) return r;
    return {
      ...r,
      mitigation: 'Exit-status-gated fallback (FR-3, corrected at EXEC) to the HEAD-only basis on a genuine MERGE_HEAD-diff failure -- NOT on emptiness, which is a normal, correct outcome of a clean merge and was TDD-falsified as a fallback trigger. Plus TR-2\'s grep -Fxf (sortedness-independent) instead of comm -12. Plus T5/T6/T7 as MUST-FAIL-IF-BROKEN regression tests pinning the guard-inversion, unsorted-comm, and real-diff-failure modes.',
    };
  });

  const { error } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements, technical_requirements, risks })
    .eq('id', PRD_ID);
  if (error) throw error;
  console.log('OK corrected FR-3/TR-3/risk in', PRD_ID);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  });
}
