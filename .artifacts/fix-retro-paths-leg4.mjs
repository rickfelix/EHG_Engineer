import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
);

const RETRO_ID = '8fa57b2f-ed34-4da1-ba23-331b0535a769';

const correctedFiles = [
  "lib/drive-loop/score/leg4-capacity.js",
  "tests/unit/drive-loop/score/leg4-capacity.test.js",
  "tests/unit/cron/drive-report-sweep.test.js",
  "tests/unit/belt-verdict.test.js",
  "tests/unit/capacity-verdict-store.test.js",
  "tests/unit/drive-loop/drive-score-gradient-historical.test.js"
];

const { data, error } = await supabase
  .from('retrospectives')
  .update({ related_files: correctedFiles, updated_at: new Date().toISOString() })
  .eq('id', RETRO_ID)
  .select('id, related_files')
  .single();

if (error) { console.error('Update failed:', error.message); process.exit(1); }
console.log(JSON.stringify(data, null, 2));
