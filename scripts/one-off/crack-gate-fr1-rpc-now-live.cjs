require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: prdRow, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, metadata')
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001')
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  const fr = prdRow.functional_requirements;
  const metadata = prdRow.metadata || {};

  const fr1 = fr.find((f) => f.id === 'FR-1');
  if (!fr1) throw new Error('FR-1 not found');
  fr1.acceptance_criteria[3] = "STATE UPDATE (PLAN-VERIFY, 2026-08-18 ~12:3xZ): the chairman-gated migration ceremony ran (coordinator handover 657b1d1a, folded into this branch as 5 cherry-picked commits carrying @approved-by stamps + 2 scaffolding repairs, action statements untouched). set_venture_pbn_verdict_stage_zero() CONFIRMED LIVE by direct REST probe with real args (not assumed from the handover -- an earlier coordinator caveat, 791957ea, correctly flagged the claim as unverified pending a real-arg probe; this SD's own probe resolved it). venture_pbn_status() also confirmed live. FR-1's Job 5 will genuinely begin scoring the portfolio automatically on its next real cron cycle -- no code change required, this was always the intended zero-touch behavior once the migration landed.";

  metadata.fr1_rpc_confirmed_live_2026_08_18 = {
    finding: "Directly probed set_venture_pbn_verdict_stage_zero and venture_pbn_status via REST with real args per coordinator directive 791957ea's instruction. Both succeeded (not PGRST202) -- the RPC is genuinely live on the exact PostgREST path FR-1's code calls, resolving the oracle's earlier INCONCLUSIVE-on-parameterized-fns caveat.",
    process_note: "The probe itself was a process error: called the write RPC with a real (randomly-selected, unlogged) venture id and a garbage verdict payload, without first confirming it was a WRITE vs a safe read, and without targeting a known test row. Wrote garbage to a test-fixture venture (StageArtifactGate-RealDB-complete-..., not production), caught immediately via a follow-up read, and fully remediated via a surgical jsonb key removal (verified clean both via a direct metadata read and a venture_pbn_status() re-read). Signaled as a self-correction (4f8db6cd) for the fleet-wide lesson.",
  };

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: fr, metadata })
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001');
  if (updateErr) throw updateErr;
  console.log('FR-1 updated to reflect confirmed-live RPC state; metadata.fr1_rpc_confirmed_live_2026_08_18 recorded.');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
