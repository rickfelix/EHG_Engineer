import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function show(label, q) {
  const { data, error } = await q;
  console.log(`\n=== ${label} === (err: ${error?.message||'none'}) count=${data?.length ?? 0}`);
  for (const r of (data||[])) {
    console.log(` - ${r.id||r.sd_key} | ${r.status} | ${r.current_phase||''} | ${(r.title||'').slice(0,110)}`);
  }
}

const cols = 'id,sd_key,title,status,current_phase,created_at';
await show('DEMAND anywhere in id', sb.from('strategic_directives_v2').select(cols).ilike('id','%DEMAND%'));
await show('DEMAND in title', sb.from('strategic_directives_v2').select(cols).ilike('title','%demand%'));
await show('ENGINE-FAIL in id', sb.from('strategic_directives_v2').select(cols).ilike('id','%ENGINE-FAIL%'));
await show('STAGE_GATE / STAGE-GATE in id', sb.from('strategic_directives_v2').select(cols).ilike('id','%STAGE-GATE%'));
await show('title ~ stage gate', sb.from('strategic_directives_v2').select(cols).ilike('title','%stage gate%'));
await show('title ~ stage-gate', sb.from('strategic_directives_v2').select(cols).ilike('title','%stage-gate%'));
await show('desc ~ STAGE_GATE_PREDICATE_ARMED', sb.from('strategic_directives_v2').select(cols).ilike('description','%STAGE_GATE_PREDICATE_ARMED%'));
await show('scope ~ STAGE_GATE_PREDICATE_ARMED', sb.from('strategic_directives_v2').select(cols).ilike('scope','%STAGE_GATE_PREDICATE_ARMED%'));
await show('desc ~ venture_channel_publish_ledger', sb.from('strategic_directives_v2').select(cols).ilike('description','%venture_channel_publish_ledger%'));
await show('desc ~ dryRun', sb.from('strategic_directives_v2').select(cols).ilike('description','%dryRun%'));
await show('desc ~ autonomy-gate / graduation', sb.from('strategic_directives_v2').select(cols).ilike('description','%evaluateGraduation%'));
await show('desc ~ sovereign-alert', sb.from('strategic_directives_v2').select(cols).ilike('description','%sovereign-alert%'));
await show('id ~ PUBLISH', sb.from('strategic_directives_v2').select(cols).ilike('id','%PUBLISH%'));
await show('id ~ MARKETING', sb.from('strategic_directives_v2').select(cols).ilike('id','%MARKETING%'));
await show('id ~ GO-LIVE / GOLIVE', sb.from('strategic_directives_v2').select(cols).or('id.ilike.%GO-LIVE%,id.ilike.%GOLIVE%'));
