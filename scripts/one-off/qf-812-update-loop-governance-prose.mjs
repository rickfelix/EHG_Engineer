// QF-20260913-812 — one-shot update to the coordinator_role_contract loop-governance prose
// (leo_protocol_sections id=635, title "Coordinator loop-registry governance (STANDARD_LOOPS)"),
// required in the same PR as any STANDARD_LOOPS change per that section's own closing note.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SECTION_ID = 635;

const ADDITION = `

**2026-09-13 addition (QF-20260913-812):** \`batch-mint-sweep\` was registered (every 10 minutes, \`gha_backed: true, session_arm: true\`) -- its GHA leg (\`.github/workflows/batch-mint-sweep-cron.yml\`) was measured schedule-starved (scheduled runs landing two to five hours apart against its own every-10-minute cron for three days), so every bounded-wait batch-mint hold waited hours for release. Session-armed beside the GHA leg (kept as backup), matching the \`index-jam-detector\` wiring: \`scripts/cron/batch-mint-sweep.mjs\` now calls \`stampLastFired('standard_loop:batch-mint-sweep')\` on every successful tick, \`scripts/hooks/recurring-tick-exemptions.json\` carries its entry, and its \`cron_script:batch-mint-sweep.mjs\` periodic_process_registry shadow was retired (\`currently_expected_active=false\`) now that the STANDARD_LOOPS entry owns this cadence. Total loop count 38 -> 39, gha_backed count 17 -> 18.`;

async function main() {
  const { data, error } = await sb.from('leo_protocol_sections').select('id, content').eq('id', SECTION_ID).single();
  if (error) throw error;
  let content = data.content;
  if (content.includes('QF-20260913-812')) {
    console.log('[qf-812] already applied — no-op');
    return;
  }
  content = content.replace('All 38 of the coordinator', 'All 39 of the coordinator') + ADDITION;
  const { error: upErr } = await sb.from('leo_protocol_sections').update({ content }).eq('id', SECTION_ID);
  if (upErr) throw upErr;
  console.log(`[qf-812] updated leo_protocol_sections id=${SECTION_ID}`);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('[qf-812] FAILED:', e.message); process.exit(1); });
}
