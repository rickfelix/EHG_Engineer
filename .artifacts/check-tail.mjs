import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E';

const { data: flags } = await supabase.from('feedback').select('id, category, created_at, content').ilike('content', `%${SD_KEY}%`).order('created_at', { ascending: false }).limit(5);
console.log('Feedback/completion-flags mentions:', JSON.stringify(flags?.map(f=>({id:f.id,category:f.category,created_at:f.created_at})), null, 2));

const { data: heal } = await supabase.from('heal_scores').select('*').ilike('sd_key', SD_KEY).order('created_at', { ascending: false }).limit(3).catch?.(()=>null);
console.log('Heal attempt result type:', typeof heal);
