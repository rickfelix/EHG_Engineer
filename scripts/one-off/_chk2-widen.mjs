import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: a } = await s.from('strategic_directives_v2').select('id,sd_key,title,status,created_at').ilike('sd_key','%WIDEN%');
console.log('SD WIDEN:', JSON.stringify(a,null,1));
const { data: b } = await s.from('feedback').select('id,title,category,status,created_at').gte('created_at','2026-09-03T10:00:00Z').order('created_at',{ascending:false}).limit(15);
console.log('FEEDBACK today:', JSON.stringify((b||[]).map(r=>({t:r.title.slice(0,110),c:r.category,s:r.status,at:r.created_at})),null,1));
