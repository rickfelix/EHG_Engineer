import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('exploration_summary')
  .eq('sd_key', 'SD-LEO-INFRA-VISION-KEY-STAMP-AT-SD-CREATION-001')
  .single();
if (readErr) { console.error(readErr); process.exit(1); }

const files = data.exploration_summary.files_explored;
files[1].finding = "executeVisionFidelity() short-circuits with skipped_reason=no_vision_key whenever sd.metadata.vision_key is absent -- the root of the 2142/2142 skip metric. Also found loadVisionDocument()/loadArchPlan() querying a nonexistent 'key' column on both eva_vision_documents and eva_architecture_plans (real columns: vision_key, plan_key) -- a SECOND bug that would have kept the gate permanently no-op even after stamping vision_key.";

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({ exploration_summary: { files_explored: files } })
  .eq('sd_key', 'SD-LEO-INFRA-VISION-KEY-STAMP-AT-SD-CREATION-001');
console.log(error ? 'ERROR: ' + error.message : 'fixed');
