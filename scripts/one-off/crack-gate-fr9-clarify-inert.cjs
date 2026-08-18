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
    "CLARIFICATION (PLAN-VERIFY review): unlike FR-1/FR-10 (whose blocked-on-external code needs ZERO changes once their respective migration/registrar-token lands -- the same call site starts succeeding), this emitter needs a SECOND change once QF-20260817-982 provisions ingest secrets: the sweep's call site (scripts/cron/venture-ops-actuals-sweep.mjs) hardcodes ingestSecret:null today, and whoever builds the provisioning mechanism must also wire a real per-venture secret lookup at that call site -- the emitter function itself is ready (accepts a real secret and calls the RPC correctly, proven by the describeDb smoke test), but the CALLER's hardcoded null is not self-resolving.",
  );

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: fr })
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001');
  if (updateErr) throw updateErr;
  console.log('FR-9 clarification appended.');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
