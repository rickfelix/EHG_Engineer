import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: one, error: e0 } = await sb.from('quick_fixes').select('*').limit(1);
if (e0) { console.log('quick_fixes ERR', e0.code, e0.message); process.exit(0); }
console.log('quick_fixes cols:', Object.keys(one[0]||{}).join(', '));
const { data: qf, error } = await sb.from('quick_fixes').select('*').order('created_at',{ascending:false}).limit(500);
if (error) { console.log('ERR', error.message); process.exit(0); }
const txt = r => `${r.key||r.id||''} ${r.title||''} ${r.description||''}`;
const hits = (qf||[]).filter(r=>/observ|publish.?outcome|graduat|recordPublish|publish_ledger/i.test(txt(r)));
console.log('scanned', qf.length, 'QFs; hits:', hits.length);
hits.forEach(r=>console.log('  ', String(r.status).padEnd(10), r.key||r.id, '|', (r.title||'').slice(0,95)));
