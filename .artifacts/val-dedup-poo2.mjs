import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: me } = await sb.from('strategic_directives_v2')
  .select('id,sd_key,title,status,current_phase,priority,metadata,description,scope,created_at,parent_sd_id')
  .eq('sd_key','SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001').maybeSingle();
console.log('=== THIS SD ===');
console.log('id:', me?.id, '| status:', me?.status, '| phase:', me?.current_phase, '| priority:', me?.priority, '| parent:', me?.parent_sd_id);
console.log('created:', me?.created_at);
console.log('decomposition_recommended:', JSON.stringify(me?.metadata?.decomposition_recommended));
console.log('metadata:', JSON.stringify(me?.metadata, null, 1).slice(0,2500));

console.log('\n=== TARGETED DEDUP: SDs mentioning recordPublishOutcome / graduation / publish ledger ===');
for (const pat of ['recordPublishOutcome','evaluateGraduation','venture_channel_publish_ledger','publish outcome','post-outcome','graduation streak']) {
  const { data, error } = await sb.from('strategic_directives_v2')
    .select('sd_key,title,status,current_phase,created_at')
    .or(`title.ilike.%${pat}%,description.ilike.%${pat}%,scope.ilike.%${pat}%`)
    .order('created_at',{ascending:false}).limit(25);
  console.log(`\n-- pattern "${pat}": ${error? 'ERR '+error.message : (data||[]).length+' hits'}`);
  (data||[]).forEach(s=>console.log(`   ${s.status.padEnd(10)} ${(s.current_phase||'-').padEnd(12)} ${s.sd_key} | ${(s.title||'').slice(0,105)}`));
}
