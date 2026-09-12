import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { checkStageGate, shouldEnforceBlock } = await import('../lib/governance/stage-gate-predicate.js').catch(()=>import('./lib/governance/stage-gate-predicate.js'));

async function probe(label, ventureId) {
  const r = await checkStageGate({ supabase: sb, ventureId, requiredStage: 24, actorType:'channel_publish', actorId:`PROBE-TESTING-${Date.now()}` });
  console.log(`${label}\n   verdict=${r.verdict} blocked=${r.blocked} armed=${r.armed} reason=${r.reason} inScope=${r.inScope}\n   >>> shouldEnforceBlock = ${shouldEnforceBlock(r)}  ${shouldEnforceBlock(r)?'(WOULD REFUSE)':'(PUBLISH PROCEEDS)'}`);
}
// below-go-live, non-demo (the exact scenario the SD wants blocked)
const { data: below } = await sb.from('ventures').select('id,name,current_lifecycle_stage').eq('is_demo',false).lt('current_lifecycle_stage',24).limit(1).single();
await probe(`A) NON-DEMO BELOW S24: ${below.name} (S${below.current_lifecycle_stage})`, below.id);
// demo venture below go-live
const { data: demo } = await sb.from('ventures').select('id,name,current_lifecycle_stage').eq('is_demo',true).lt('current_lifecycle_stage',24).limit(1).single();
await probe(`B) IS_DEMO BELOW S24: ${demo.name} (S${demo.current_lifecycle_stage})`, demo.id);
// non-demo at/past S24 but launch_mode simulated
const { data: go } = await sb.from('ventures').select('id,name,current_lifecycle_stage,launch_mode').eq('is_demo',false).gte('current_lifecycle_stage',24).limit(1).single();
await probe(`C) NON-DEMO S${go.current_lifecycle_stage} launch_mode=${go.launch_mode}: ${go.name}`, go.id);
