import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const { data: retroRow, error: e1 } = await supabase
  .from('sub_agent_execution_results')
  .select('id, sub_agent_code, verdict, created_at, sd_id, confidence, metadata')
  .eq('id', 'd4baac9b-948d-4d95-b615-5db64e9fdbc4')
  .single();
console.log('RETRO evidence row:', JSON.stringify(retroRow, null, 2));
if (e1) console.error(e1);

const { data: retro, error: e2 } = await supabase
  .from('retrospectives')
  .select('id, quality_score, status, generated_by, key_learnings, action_items')
  .eq('id', 'af093997-5019-4f82-9def-4a88ce8f818f')
  .single();
console.log('\nRetrospective status:', retro?.status, 'quality_score:', retro?.quality_score, 'generated_by:', retro?.generated_by);
console.log('key_learnings count:', retro?.key_learnings?.length, 'action_items count:', retro?.action_items?.length);
if (e2) console.error(e2);
