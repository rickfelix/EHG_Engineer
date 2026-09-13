import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: row, error } = await s.from('leo_protocol_sections').select('id,content').eq('id', 635).single();
if (error) throw error;

let content = row.content;
content = content.replace(
  "**The coordinator's operational heartbeat is governed, not ad hoc.** All 39 of the coordinator's session-cron loops",
  "**The coordinator's operational heartbeat is governed, not ad hoc.** All 40 of the coordinator's session-cron loops"
);
content += "\n\n**2026-09-13 addition (QF-20260913-254):** `gauge-finding-disposition-sweep` was registered (hourly, `23 * * * *`, `gha_backed: true, session_arm: true`) -- `scripts/gauge-findings/disposition-sweep.mjs` (shipped by QF-20260911-425) had ZERO invokers anywhere since it shipped (no STANDARD_LOOPS entry, no cron, no GHA workflow), so the designed drain for `invariant_gauge_finding` feedback never ran (5726 outstanding rows, 21 distinct fingerprints, measured live). Wired the same way QF-20260913-812 wired `batch-mint-sweep`: the script now calls `stampLastFired('standard_loop:gauge-finding-disposition-sweep')` on every successful tick, and `scripts/hooks/recurring-tick-exemptions.json` carries its entry. Unlike `batch-mint-sweep.mjs`, this script lives under `scripts/gauge-findings/`, not `scripts/cron/` -- `lib/periodic-liveness/enumerate-processes.mjs`'s `discoverCronScripts` only scans `scripts/cron/`, so there was never a `cron_script:disposition-sweep.mjs` shadow row to retire. Total loop count 39 -> 40, gha_backed count 18 -> 19.";

const { error: updErr } = await s.from('leo_protocol_sections').update({ content }).eq('id', 635);
if (updErr) throw updErr;
console.log('Updated leo_protocol_sections id=635');
