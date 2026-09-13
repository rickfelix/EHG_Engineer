import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD='fbbf9a6d-e079-4c22-9189-88336aae9a16';
const ROW='d12076b3-bf85-4af9-bab8-f247b10517f3';

const { data: sd } = await sb.from('strategic_directives_v2').select('sd_key, target_application').eq('id', SD).single();
console.log('SD target_application =', sd?.target_application, '| sd_key =', sd?.sd_key);

const res = await resolveSubAgentRepo({ subAgentCode:'TESTING', sdId: SD, targetApplication: sd?.target_application, fallback: 'EHG_Engineer' });
console.log('resolution =', JSON.stringify(res));

const { data: cur } = await sb.from('sub_agent_execution_results').select('metadata, verdict').eq('id', ROW).single();
const results = { verdict: cur.verdict, metadata: cur.metadata };
applySubAgentRepoVerdict(results, res, { skipVerdictAdjust: true });

const { data, error } = await sb.from('sub_agent_execution_results').update({ metadata: results.metadata }).eq('id', ROW).select('id, verdict, confidence');
if (error){ console.error('UPDATE ERROR', JSON.stringify(error)); process.exit(1); }
console.log('UPDATED:', JSON.stringify(data[0]));
console.log('repo_path =', results.metadata.repo_path, '| repo_resolved =', results.metadata.repo_resolved, '| registry_source =', results.metadata.registry_source);
