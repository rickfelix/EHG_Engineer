#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-SIXTEEN-SITE-LIVENESS-001';

const mechanism_verifications = [
  {
    verified_by: 'validation-agent (LEAD, row 23094172-0f1e-4df7-8c17-ab6a89b1f9e3)',
    verified_at: 'lib/fleet/session-predicates.mjs:77-84',
    claim: 'isDispatchableFleetMember deliberately diverges from everClaimed; the divergence rationale comment is present verbatim at these exact lines (definition itself at :90).',
  },
  {
    verified_by: 'validation-agent (LEAD, row 23094172-0f1e-4df7-8c17-ab6a89b1f9e3)',
    verified_at: 'lib/fleet/genuine-worker.mjs:163-164',
    claim: 'everClaimed includes released_at per QF-20260728-930, cited at genuine-worker.mjs:152.',
  },
  {
    verified_by: 'Explore (LEAD, row 7273bbc5-2000-4e79-8299-cb7e2e9ba379)',
    verified_at: 'lib/fleet/session-predicates.mjs:90,104,110',
    claim: 'isDispatchableFleetMember does NOT call everClaimed; it checks quarantined_at (:104) and parked_until (:110) directly — a distinct axis from the everClaimed/isFleetWorker family.',
  },
];

async function main() {
  const { data: row, error: e0 } = await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  if (e0) throw e0;
  const md = { ...row.metadata, mechanism_verifications };
  const { error: e1 } = await supabase.from('strategic_directives_v2').update({ metadata: md }).eq('sd_key', SD_KEY);
  if (e1) throw e1;
  console.log('mechanism_verifications recorded');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
