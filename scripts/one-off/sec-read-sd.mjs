import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
const sb = await getSupabaseClient();
const { data, error } = await sb.from('strategic_directives_v2')
  .select('id,sd_key,title,status,current_phase,metadata,success_criteria,scope')
  .eq('sd_key','SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001').maybeSingle();
if (error) { console.log('ERR', error.message); process.exit(1); }
console.log('status/phase:', data.status, data.current_phase);
const blob = JSON.stringify(data);
for (const term of ['rls','lockdown','anon','authenticated','pg_default_acl','leo-keys','worktree','chairman-gated','TRUNCATE','race','TOCTOU','concurren']) {
  const hits = (blob.match(new RegExp(term,'gi'))||[]).length;
  console.log(`  term "${term}": ${hits}`);
}
const md = data.metadata || {};
console.log('metadata keys:', Object.keys(md));
if (md.pre_purge_evidence) console.log('pre_purge_evidence:', JSON.stringify(md.pre_purge_evidence).slice(0,900));
