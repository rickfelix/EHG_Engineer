import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..'), '.env') });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sub_agent_execution_results').select('detailed_analysis,recommendations').eq('id', '5f31b9b9-acb6-4a17-884b-5ac25b07c6bb').maybeSingle();
const da = data.detailed_analysis;
const obj = typeof da === 'string' ? JSON.parse(da) : da;
const findings = obj.findings || obj;
for (const f of findings) {
  console.log('\n### ' + f.id + ' [' + f.severity + '] status=' + f.status);
  console.log('TITLE: ' + f.title);
  console.log('LOC: ' + (f.location||''));
  console.log('REC: ' + (f.recommendation||'').slice(0,600));
}
