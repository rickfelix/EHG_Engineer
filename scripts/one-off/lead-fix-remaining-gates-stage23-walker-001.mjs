#!/usr/bin/env node
// LEAD-phase gate remediation for SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001:
// - GATE_MECHANISM_CLAIM_VERIFIER: needs metadata.mechanism_verifications naming who
//   read lib/apa/venture-step-executors.js and at what file:line (the Explore run above did).
// - GATE_SD_METRICS_SUFFICIENCY: success_metrics has only 2 unique entries; the gate
//   prefers success_metrics over success_criteria whenever success_metrics is non-empty,
//   so success_criteria's 4 entries don't count. Add 2 more distinct success_metrics.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001';

async function main() {
  const { data: current, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('success_metrics, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) { console.error('❌ Fetch failed:', fetchErr.message); process.exit(1); }

  const success_metrics = [
    ...current.success_metrics,
    {
      metric: 'overrides keyed by full step_id (not truncated metadata prefix)',
      target: '11/11, verified via diffing getVentureRegistration(\'ALTIFYAI\').stepOverrides keys against metadata.full_step_id_map at the merge commit of the last FR',
    },
    {
      metric: 'exhaustive/order-sensitive assertions remaining in tests/unit/apa/venture-step-executors.test.js against the ALTIFYAI stepOverrides key set',
      target: '0 (the :815 exhaustive .toEqual assertion is subsumed by the FR-12 shrinking-allowlist test before FR-1 merges)',
    },
  ];

  const metadata = {
    ...current.metadata,
    mechanism_verifications: [
      {
        verified_by: 'Explore sub-agent (LEAD phase, evidence 40b9805a-844d-46cd-83f2-ee667ed9e6a6)',
        verified_at: 'lib/apa/venture-step-executors.js:689',
      },
      {
        verified_by: 'Explore sub-agent (LEAD phase, evidence 40b9805a-844d-46cd-83f2-ee667ed9e6a6)',
        verified_at: 'lib/apa/venture-step-executors.js:396',
      },
      {
        verified_by: 'Explore sub-agent (LEAD phase, evidence 40b9805a-844d-46cd-83f2-ee667ed9e6a6)',
        verified_at: 'lib/apa/venture-step-executors.js:1026',
      },
    ],
  };

  const { error: updErr } = await supabase
    .from('strategic_directives_v2')
    .update({ success_metrics, metadata })
    .eq('sd_key', SD_KEY);
  if (updErr) { console.error('❌ Update failed:', updErr.message); process.exit(1); }

  console.log('✅ mechanism_verifications added, success_metrics extended to', success_metrics.length, 'entries.');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
