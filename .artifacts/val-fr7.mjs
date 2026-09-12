import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from('strategic_directives_v2')
  .select('id,sd_key,title,status,metadata,description,scope')
  .or('sd_key.eq.SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-E,id.eq.SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-E');
if (!data?.length) { console.log('001-E NOT FOUND'); }
for (const d of data||[]) {
  const blob = JSON.stringify({ desc: d.description, scope: d.scope, meta: d.metadata });
  console.log('001-E status:', d.status);
  console.log(' mentions PART-001?', blob.includes('DEMAND-ENGINE-PART-001'));
  console.log(' mentions FAIL-001?', blob.includes('DEMAND-ENGINE-FAIL-001'));
  const m = blob.match(/[^"]{0,260}(DEMAND-ENGINE-(PART|FAIL)-001)[^"]{0,260}/g);
  (m||[]).slice(0,4).forEach(x => console.log('  ...', x.replace(/\n/g,' ')));
}
// Part B SD metadata: prerequisite + FR-4 dependency citation
const { data: pb } = await s.from('strategic_directives_v2').select('metadata,description,scope').eq('sd_key','SD-LEO-INFRA-DEMAND-ENGINE-PART-001').maybeSingle();
const pbb = JSON.stringify(pb||{});
console.log('\nPART-001 cites FAIL-001 as prereq?', pbb.includes('DEMAND-ENGINE-FAIL-001'));
console.log('PART-001 cites execution_mode/FR-4 discriminator?', /execution_mode|discriminator/i.test(pbb));
