import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_UUID = '6b090e53-3732-43e9-9f07-939bae2a0f69';
const ROW_ID = '572efcd1-7c42-44d5-8cae-45b8421dd081';

const { data: sds } = await sb.from('strategic_directives_v2').select('target_application').eq('id', SD_UUID);
const targetApplication = sds[0].target_application;
console.log('target_application:', JSON.stringify(targetApplication));

const { data: rows } = await sb.from('sub_agent_execution_results').select('metadata,verdict,confidence,warnings').eq('id', ROW_ID);
const results = { metadata: rows[0].metadata, verdict: rows[0].verdict, confidence: rows[0].confidence, warnings: rows[0].warnings };

const resolution = await resolveSubAgentRepo({ sdId: SD_UUID, targetApplication, subAgentCode: 'TESTING', supabase: sb });
console.log('resolution:', JSON.stringify(resolution));
applySubAgentRepoVerdict(results, resolution);

const { data: upd, error } = await sb.from('sub_agent_execution_results')
  .update({ metadata: results.metadata, verdict: results.verdict, confidence: results.confidence, warnings: results.warnings })
  .eq('id', ROW_ID)
  .select('id,verdict,confidence,metadata');
if (error) { console.log('UPDATE ERR', error.message); process.exit(1); }
console.log('UPDATED', JSON.stringify({
  id: upd[0].id,
  verdict: upd[0].verdict,
  confidence: upd[0].confidence,
  repo_path: upd[0].metadata.repo_path,
  repo_resolved: upd[0].metadata.repo_resolved,
  registry_source: upd[0].metadata.registry_source,
  executed_from_cwd: upd[0].metadata.executed_from_cwd,
}, null, 1));

const { data: app } = await sb.from('applications').select('name,local_path').ilike('name', `%${String(targetApplication || 'EHG_Engineer')}%`);
console.log('applications rows:', JSON.stringify(app));
