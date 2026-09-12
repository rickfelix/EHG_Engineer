import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '8667b9ad-02b4-4bfa-b908-6d3882697e0b';
const { data: sd } = await supabase.from('strategic_directives_v2').select('id, sd_key, status, current_phase, progress, updated_at, metadata').eq('id', SD_ID).maybeSingle();
console.log('SD:', JSON.stringify({ ...sd, metadata: undefined }, null, 2));

const { data: handoffs } = await supabase.from('sd_phase_handoffs').select('id, handoff_type, status, verdict, created_at').eq('sd_id', SD_ID).order('created_at', { ascending: false }).limit(5);
console.log('Recent handoffs:', JSON.stringify(handoffs, null, 2));

const { data: retros } = await supabase.from('retrospectives').select('id, title, status, quality_score, created_at').eq('sd_id', SD_ID).order('created_at', { ascending: false }).limit(3);
console.log('Retros:', JSON.stringify(retros, null, 2));
