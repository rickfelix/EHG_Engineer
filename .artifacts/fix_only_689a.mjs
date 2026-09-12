import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('leo_protocol_sections').select('content').eq('id', 601).single();
const from = 'already-built but reading low from a STALE/manual KR';
const to = 'already-built but reading low ONLY from a STALE/manual KR';
if (!data.content.includes(from)) { console.log(data.content.includes(to) ? 'already fixed' : 'ANCHOR NOT FOUND'); process.exit(0); }
const { error } = await sb.from('leo_protocol_sections').update({ content: data.content.replace(from, to) }).eq('id', 601);
console.log(error ? 'ERR ' + error.message : 'row 601: restored ONLY in the decompose rule');
