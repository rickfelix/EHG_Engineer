import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const s = createClient(url, key);

const { data, error } = await s
  .from('strategic_directives_v2')
  .select('id, sd_key, title, status, sd_type, category, priority, created_at, updated_at')
  .eq('sd_key', 'SD-LEO-INFRA-LOOP-EVIDENCE-COLLECTORS-001')
  .single();

console.log(JSON.stringify({ data, error }, null, 2));

const { data: handoffs } = await s
  .from('sd_phase_handoffs')
  .select('id, from_phase, to_phase, status, created_at')
  .eq('sd_id', data?.id)
  .order('created_at', { ascending: true });
console.log('handoffs:', JSON.stringify(handoffs, null, 2));

const { data: existingRetro } = await s
  .from('retrospectives')
  .select('id, retro_type, created_at, status')
  .eq('sd_id', data?.id);
console.log('existing retros:', JSON.stringify(existingRetro, null, 2));
