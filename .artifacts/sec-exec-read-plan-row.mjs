import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..'), '.env') });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results').select('*').eq('id', '5f31b9b9-acb6-4a17-884b-5ac25b07c6bb').maybeSingle();
if (error) { console.error(error); process.exit(1); }
console.log('COLUMNS:', Object.keys(data).join(', '));
console.log('phase=', data.phase, 'verdict=', data.verdict ?? data.status, 'sd_id=', data.sd_id);
const r = data.results || {};
console.log('RESULT KEYS:', Object.keys(r).join(', '));
for (const f of (r.findings || [])) {
  console.log('---', f.id, '|', f.severity, '|', f.status, '|', f.title);
}
