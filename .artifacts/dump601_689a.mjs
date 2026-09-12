import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
for (const id of [601, 602, 614, 626, 627]) {
  const { data } = await sb.from('leo_protocol_sections').select('content').eq('id', id).single();
  fs.writeFileSync(`.artifacts/adam-before-${id}.md`, data.content);
  console.log(id, data.content.length, 'chars', Buffer.byteLength(data.content,'utf8'), 'bytes', 'CRLF?', data.content.includes('\r\n'));
}
