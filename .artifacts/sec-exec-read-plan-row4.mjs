import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..'), '.env') });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sub_agent_execution_results').select('metadata,raw_output,recommendations,summary').eq('id', '5f31b9b9-acb6-4a17-884b-5ac25b07c6bb').maybeSingle();
const m = data.metadata || {};
console.log('META KEYS:', Object.keys(m).join(', '));
const cand = m.full_results || m.results || m.raw || null;
const findings = (cand && cand.findings) || m.findings || (data.raw_output && (typeof data.raw_output==='string'? JSON.parse(data.raw_output):data.raw_output).findings) || null;
if (!findings) { console.log('NO FINDINGS. metadata dump:'); console.log(JSON.stringify(m).slice(0,3000)); console.log('RECS:', JSON.stringify(data.recommendations).slice(0,2000)); }
else for (const f of findings) console.log('\n### ' + f.id + ' [' + f.severity + '] ' + f.status + '\nTITLE: ' + f.title + '\nREC: ' + String(f.recommendation||'').slice(0,500));
