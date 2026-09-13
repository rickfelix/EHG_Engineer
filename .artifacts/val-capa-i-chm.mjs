import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// chairman_decisions 978b0c19 - prefix match on id
const { data, error } = await sb.from('chairman_decisions').select('*').limit(2000);
if (error) { console.error('ERR chairman_decisions:', error.message); }
else {
  const hits = (data||[]).filter(r => JSON.stringify(r.id||'').includes('978b0c19') || JSON.stringify(r).includes('978b0c19'));
  console.log('chairman_decisions total rows:', data.length, '| 978b0c19 hits:', hits.length);
  for (const h of hits) console.log(JSON.stringify(h, null, 1).slice(0,4000));
}
