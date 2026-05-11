import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const SD_ID = '5de33889-820f-4758-a96f-363f17908e97';
const SD_KEY = 'SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001';

const { data: prdsBy_sd_id, error: e1 } = await supabase
  .from('product_requirements_v2')
  .select('id, sd_id, status, created_at, functional_requirements')
  .eq('sd_id', SD_ID);

console.log('PRDs by sd_id:', JSON.stringify(prdsBy_sd_id, null, 2));
if (e1) console.error('err1:', e1.message);

const { data: prdsByKey, error: e2 } = await supabase
  .from('product_requirements_v2')
  .select('id, sd_id, status, created_at')
  .like('id', `PRD-${SD_KEY}%`);

console.log('PRDs by id LIKE PRD-SD_KEY%:', JSON.stringify(prdsByKey, null, 2));
if (e2) console.error('err2:', e2.message);
