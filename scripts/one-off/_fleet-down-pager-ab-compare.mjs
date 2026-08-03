// A/B the freeze term on ONE row set, so fleet churn cannot be mistaken for a predicate change.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { liveFleetWorkers, isFleetWorker, isKnownWedged, FREEZE_CUT_MINUTES } from '../../lib/fleet/genuine-worker.mjs';
import { PULSE_SESSION_COLUMNS, fetchPulseSessions } from '../fleet-worker-pulse.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const me = process.env.CLAUDE_SESSION_ID;
const t = Date.now();

const rows = await fetchPulseSessions(db);
console.log('cut point:', FREEZE_CUT_MINUTES, 'min');
console.log('columns  :', PULSE_SESSION_COLUMNS, '\n');

// OLD predicate, recomputed on the SAME rows: genuine + heartbeat-fresh, no freeze term.
const oldLive = rows.filter((s) => isFleetWorker(s, me) && s.heartbeat_at && t - new Date(s.heartbeat_at).getTime() < 900000);
const newLive = liveFleetWorkers(rows, me, t);

console.log(`OLD (heartbeat-only) active = ${oldLive.length}`);
console.log(`NEW (freeze-aware)   active = ${newLive.length}\n`);

const dropped = oldLive.filter((o) => !newLive.some((n) => n.session_id === o.session_id));
if (!dropped.length) console.log('No seat is excluded by the freeze term right now — the two agree.');
for (const s of dropped) {
  const silent = s.last_tool_at ? Math.round((t - Date.parse(s.last_tool_at)) / 60000) : null;
  console.log(`EXCLUDED ${s.session_id.slice(0, 8)} loop_state=${s.loop_state} tool_silent=${silent}m wedged=${isKnownWedged(s, t)}`);
}

console.log('\nfull population seen by the pulse:');
for (const s of rows.filter((s) => isFleetWorker(s, me))) {
  const silent = s.last_tool_at ? Math.round((t - Date.parse(s.last_tool_at)) / 60000) : 'null';
  const hb = Math.round((t - Date.parse(s.heartbeat_at)) / 60000);
  console.log(`  ${s.session_id.slice(0, 8)} status=${s.status} loop=${s.loop_state} hb=${hb}m tool_silent=${silent}m`);
}
