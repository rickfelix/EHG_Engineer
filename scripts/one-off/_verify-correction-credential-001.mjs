import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await supabase.from('chairman_decisions').select('brief_data').eq('id', 'a94f88c8-bf97-4c04-a11a-084817cdc185').maybeSingle();
console.log(data?.brief_data?.recommendation?.includes('CORRECTION') ? 'CORRECTION_PRESENT' : 'CORRECTION_MISSING');
console.log(data?.brief_data?.context?.correction_note ? 'CONTEXT_NOTE_PRESENT' : 'CONTEXT_NOTE_MISSING');
