import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const s = createClient(url, key);

const { data, error } = await s
  .from('retrospectives')
  .select('id, sd_id, retro_type, retrospective_type, status, quality_score, created_at, what_went_well, key_learnings, action_items, what_needs_improvement')
  .eq('id', 'd846a24e-218b-4633-9cfb-0c362f2a260b')
  .single();

if (error) {
  console.error(error);
  process.exit(1);
}

console.log('id:', data.id);
console.log('sd_id:', data.sd_id);
console.log('retro_type:', data.retro_type, '| retrospective_type:', data.retrospective_type);
console.log('status:', data.status, '| quality_score:', data.quality_score);
console.log('created_at:', data.created_at);
console.log('what_went_well count:', data.what_went_well?.length);
console.log('key_learnings count:', data.key_learnings?.length);
console.log('action_items count:', data.action_items?.length);
console.log('what_needs_improvement count:', data.what_needs_improvement?.length);
