import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('leo_protocol_sections').select('*').in('id', [627, 375, 524, 590, 612, 210]).order('id');
for (const r of data) { const { content, ...rest } = r; console.log(JSON.stringify({ ...rest, content_len: content.length })); }
