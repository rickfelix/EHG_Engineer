import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const FLIP_IDS = ['47283f94-437e-4143-9c0a-e01770b7cccb', 'cfec2d37-6f4e-4a4d-923b-727bcccba3ad'];

for (const id of FLIP_IDS) {
  const { data: a, error } = await supabase
    .from('ai_quality_assessments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) { console.log(id, 'ERROR', error.message); continue; }
  console.log(`\n=== assessment ${id} ===`);
  console.log('content_id:', a.content_id, 'content_type:', a.content_type, 'weighted_score:', a.weighted_score, 'sd_type:', a.sd_type);
  console.log('scores:', JSON.stringify(a.scores, null, 2));
  console.log('feedback:', JSON.stringify(a.feedback, null, 2));

  const { data: retro, error: e2 } = await supabase
    .from('retrospectives')
    .select('id, sd_id, quality_score, title, key_learnings, what_went_well, what_needs_improvement')
    .eq('id', a.content_id)
    .maybeSingle();
  if (e2) console.log('retro lookup error:', e2.message);
  if (retro) {
    console.log('--- linked retrospective ---');
    console.log('sd_id:', retro.sd_id, 'quality_score:', retro.quality_score, 'title:', retro.title);
  } else {
    console.log('--- no retrospective row found for this content_id (may be a different table) ---');
  }
}
