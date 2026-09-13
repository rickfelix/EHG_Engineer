import dotenv from 'dotenv';
dotenv.config();
import { getSupabaseClient } from '../lib/sub-agent-executor/index.js';
import { resolveSubAgentRepo, getSubAgentCapability } from '../lib/sub-agents/resolve-repo.js';
const sb = await getSupabaseClient();
const SD='a281d3a9-c69a-456c-b514-2de7790ea6a7';
const { data: sd } = await sb.from('strategic_directives_v2').select('sd_key, target_application').eq('id',SD).maybeSingle();
console.log('SD target_application:', JSON.stringify(sd));
console.log('TESTING capability:', JSON.stringify(getSubAgentCapability('TESTING')));
const { data: apps } = await sb.from('applications').select('name, local_path').limit(10);
console.log('applications:', JSON.stringify(apps, null, 1));
for (const ta of [sd?.target_application, 'EHG_Engineer']) {
  const r = await resolveSubAgentRepo({ sdId: SD, targetApplication: ta, subAgentCode: 'TESTING', fallback: process.cwd(), supabase: sb });
  console.log(`resolve(targetApplication=${ta}):`, JSON.stringify(r));
}
