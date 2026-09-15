import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Can we read the registry? What columns come back?
const { data, error } = await sb.from('validation_gate_registry').select('gate_key, sd_type, applicability').order('gate_key').range(0, 4);
console.log('READ ok?', !error, error?.message || '');
console.log('sample:', JSON.stringify(data?.slice(0,3)));

// 2. Total row count (exact head count, per count-discipline)
const { count, error: cErr } = await sb.from('validation_gate_registry').select('*', { count: 'exact', head: true });
console.log('exact row count:', cErr ? 'unavailable' : count);

// 3. Distinct applicability values
const { data: all } = await sb.from('validation_gate_registry').select('applicability, sd_type').range(0, 999);
console.log('distinct applicability:', [...new Set((all||[]).map(r=>r.applicability))].join(', '));
console.log('null sd_type rows:', (all||[]).filter(r=>r.sd_type==null).length, '| sd_type=all rows:', (all||[]).filter(r=>String(r.sd_type).toLowerCase()==='all').length);
