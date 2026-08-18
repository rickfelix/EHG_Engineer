// SD-MAN-INFRA-VENTURE-CRACK-GATE-001: PRD corrections from an independent post-ship
// security + validation sweep (4 teammates: sec-diff-sweep, val-fr56, val-fr79, val-fr110).
// Two genuine PRD-wording issues, neither a code defect:
//   FR-1: criterion [0]'s leading clause ("A venture past nursery...") contradicts its own
//     explanatory continuation, which correctly documents the portfolio-wide (no nursery
//     filter) design actually shipped. fetchAllVentureIds() has no stage/status filter --
//     confirmed by direct code read, this was deliberate (152 ventures total vs. 3 with a
//     deployment_url), not an oversight -- but the leading clause's wording was never updated
//     to match.
//   FR-9: criterion [1] cites tests/unit/eva/bridge/venture-user-feedback-emitter.test.js as
//     holding the describeDb-gated smoke block. That file is 5 fully-mocked vi.fn() tests with
//     NO describeDb block -- its own header explicitly says the describeDb suite "cannot live
//     in this unit-tier file". The real suite is the sibling
//     tests/unit/eva/bridge/venture-user-feedback-emitter-smoke.db.test.js.
// Both appended as correction notes (this SD's own established pattern), not silent rewrites --
// preserves the audit trail of what was originally claimed vs. later corrected.
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

  const fr1 = fr.find((f) => f.id === 'FR-1');
  if (!fr1) throw new Error('FR-1 not found');
  fr1.acceptance_criteria.push(
    "CORRECTION (independent post-ship sweep, val-fr110): criterion [0]'s leading clause (\"A venture past nursery with no existing pbn_verdict\") is WORDING DRIFT, not the actual design -- its own explanatory continuation already documents the real, deliberate behavior: scripts/cron/venture-ops-actuals-sweep.mjs's fetchAllVentureIds() has no stage/nursery/status filter at all (confirmed by direct code read), sweeping the WHOLE portfolio (measured live: 152 ventures) every cycle, not a nursery-scoped subset. \"Past nursery\" should read \"any venture\" -- the design was never nursery-scoped, only the leading clause's phrasing was.",
  );

  const fr9 = fr.find((f) => f.id === 'FR-9');
  if (!fr9) throw new Error('FR-9 not found');
  fr9.acceptance_criteria.push(
    "CORRECTION (independent post-ship sweep, val-fr79): criterion [1] cites the wrong file. tests/unit/eva/bridge/venture-user-feedback-emitter.test.js is 5 fully-mocked vi.fn() tests with NO describeDb block (its own header explicitly states the describeDb suite \"cannot live in this unit-tier file\", per this repo's DB-test-guard convention). The real describeDb-gated smoke suite proving a live PostgREST round-trip is the SIBLING file tests/unit/eva/bridge/venture-user-feedback-emitter-smoke.db.test.js -- verified live: 'Test Files 1 passed | 1 skipped (2)', banner '[vitest][db-tier] SKIPPED at runtime -- no designated non-production target', consistent with every other DB-tier test in this SD.",
  );

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: fr })
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001');
  if (updateErr) throw updateErr;
  console.log('FR-1 and FR-9 corrections appended.');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
