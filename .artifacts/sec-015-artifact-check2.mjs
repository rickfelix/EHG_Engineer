import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data } = await sb.from('agent_artifacts').select('*').eq('id', 'bb81b2c9-0748-4dc3-b149-a73e92f0f3d9');
const r = data[0];
console.log('sd_id        :', r.sd_id);
console.log('type         :', r.type, '| token_count:', r.token_count);
console.log('expires_at   :', r.expires_at);
console.log('blob_path    :', r.content_blob_path);
const s = r.content_text;
console.log('content_text length:', s?.length);
const areas = [...String(s).matchAll(/"area":"(.*?)"/g)].map((m) => m[1]);
console.log('findings recovered  :', areas.length);
areas.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
console.log('\ndiff_verdict in artifact:', /"diff_verdict":"(\w+)"/.exec(s)?.[1]);
