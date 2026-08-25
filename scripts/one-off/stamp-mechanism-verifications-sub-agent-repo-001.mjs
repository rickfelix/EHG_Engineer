import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-SUB-AGENT-REPO-001';

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error(readErr); process.exit(1); }

const mechanism_verifications = [
  { verified_by: 'Explore agent (Task tool, LEAD phase)', verified_at: 'lib/sub-agents/resolve-repo.js:227' },
  { verified_by: 'Explore agent (Task tool, LEAD phase)', verified_at: 'lib/sub-agents/regression.js:776' },
  { verified_by: 'VALIDATION agent (Task tool, LEAD phase, adversarial re-review)', verified_at: 'lib/sub-agents/regression.js:265' },
];

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: { ...(sd.metadata || {}), mechanism_verifications } })
  .eq('id', sd.id);
if (updateErr) { console.error(updateErr); process.exit(1); }

console.log('mechanism_verifications stamped on SD metadata:', JSON.stringify(mechanism_verifications, null, 2));
