import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { assertOutreachAuthorized, checkStageGate, shouldEnforceBlock } = await import('../lib/governance/stage-gate-predicate.js');

const { data: vs } = await sb.from('ventures').select('id,name,is_demo,status,current_lifecycle_stage,launch_mode')
  .or('name.ilike.%AltifyAI%,name.ilike.%ApexNiche%');

for (const v of vs) {
  const actorId = `probe:TESTING-AGENT-DEMAND-ENGINE-FAIL-001:${Date.now()}`;
  const out = await assertOutreachAuthorized({ supabase: sb, ventureId: v.id, actorType: 'channel_publish', actorId });
  const raw = await checkStageGate({ supabase: sb, ventureId: v.id, requiredStage: 24, actorType: 'channel_publish', actorId: actorId+':raw', armed: true });
  console.log(`\n--- ${v.name} (S${v.current_lifecycle_stage}, launch_mode=${v.launch_mode}, status=${v.status}, is_demo=${v.is_demo}) ---`);
  console.log('  assertOutreachAuthorized -> authorized=%s mode=%s reason=%s', out.authorized, out.mode, out.reason);
  console.log('  snapshot:', JSON.stringify(out.snapshot));
  console.log('  checkStageGate(armed:true).blocked=%s verdict=%s | shouldEnforceBlock=%s', raw.blocked, raw.verdict, shouldEnforceBlock(raw));
}

// Positive live control: is there any venture that IS outreach-authorized today?
const { data: live } = await sb.from('ventures').select('id,name,is_demo,status,current_lifecycle_stage,launch_mode')
  .eq('launch_mode','live').eq('is_demo', false).eq('status','active').gte('current_lifecycle_stage', 24).limit(3);
console.log('\n=== live-authorized ventures in prod today:', live?.length ?? 0, JSON.stringify((live||[]).map(x=>x.name)));
for (const v of (live||[])) {
  const out = await assertOutreachAuthorized({ supabase: sb, ventureId: v.id, actorType: 'channel_publish', actorId: `probe:POS:${Date.now()}` });
  console.log(`  ${v.name} -> authorized=${out.authorized} mode=${out.mode}`);
}
