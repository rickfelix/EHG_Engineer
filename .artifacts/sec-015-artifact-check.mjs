import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ID = 'bb81b2c9-0748-4dc3-b149-a73e92f0f3d9';
for (const t of ['context_artifacts', 'artifacts', 'compressed_artifacts', 'agent_artifacts']) {
  const { data, error } = await sb.from(t).select('*').eq('id', ID);
  if (error) { console.log(`${t}: ${error.message.slice(0, 80)}`); continue; }
  console.log(`${t}: FOUND ${data?.length} row(s)`);
  if (data?.length) {
    const r = data[0];
    console.log('  columns:', Object.keys(r).join(', '));
    const body = r.content || r.body || r.data || r.payload;
    const s = typeof body === 'string' ? body : JSON.stringify(body);
    console.log('  content length:', s?.length);
    console.log('  contains all 12 findings?', (s?.match(/"area":/g) || []).length, 'area keys');
    console.log('  preview:', s?.slice(0, 200));
  }
}
