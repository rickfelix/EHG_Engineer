// Re-run the founding measurement of SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001.
//
// ORIGINAL (2026-07-26 ~15:20Z, by Adam): five of eleven registered seats had NO operating-system
// process, and FOUR of those still read status=active, is_alive=true, heartbeat within the minute.
//
// IMPORTANT SCOPE NOTE, so this is not over-read: the fixes for this SD live on an UNMERGED branch
// (PR #6537). The live fleet is therefore still running pre-fix code. This does NOT demonstrate the
// fix working; it establishes whether the defect still manifests, which is a different and weaker
// claim. Saying which one is being made is the point.
//
// THE CONTROL RUNS FIRST, before any verdict is believed — the same discipline the original used:
// process.kill(self,0) must report EXISTS and process.kill(999999,0) must report ESRCH, so the
// instrument is shown to discriminate in BOTH directions rather than only ever failing.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isProcessRunning } = require('../../lib/fleet/cc-pid-liveness.cjs');
const { resolveCcPidFromTerminalId } = require('../../lib/fleet/resolve-cc-pid.cjs');
const { isSessionAlive } = require('../../lib/fleet/session-liveness.cjs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── CONTROL ─────────────────────────────────────────────────────────────────
const selfAlive = isProcessRunning(process.pid);
const bogusAlive = isProcessRunning(999999);
console.log('CONTROL: self=%s (expect true), pid999999=%s (expect false)', selfAlive, bogusAlive);
if (!selfAlive || bogusAlive) {
  console.log('CONTROL FAILED — the instrument does not discriminate. Verdicts below are WORTHLESS.');
  process.exit(2);
}

// POPULATION MATTERS, and getting it wrong manufactures a false all-clear.
// A first attempt used .neq('status','released') and got back exactly 1000 rows — PostgREST's
// DEFAULT PAGE CAP, not a fleet — sweeping in months of historical sessions, every one of which
// abstained for want of a marker. It duly reported "no seat with a confirmed-gone process reads
// alive", which would have been a fail-green produced by looking at the wrong 1000 rows.
// The registered-seat population is what the original measured: currently active/idle seats with a
// recent heartbeat. Bound it explicitly and ASSERT we are under the page cap, so a truncated read
// can never again be mistaken for a clean one.
const SINCE = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const PAGE_CAP = 1000;
const { data, error } = await supabase
  .from('claude_sessions')
  .select('session_id,status,is_alive,heartbeat_at,process_alive_at,terminal_id,pid,metadata')
  .in('status', ['active', 'idle'])
  .gte('heartbeat_at', SINCE)
  .order('heartbeat_at', { ascending: false });
if (error) { console.log('QUERY ERROR (not evidence of an empty fleet):', error.message); process.exit(2); }
if ((data || []).length >= PAGE_CAP) {
  console.log(`TRUNCATED at the ${PAGE_CAP}-row page cap — the population is larger than this read. ABORTING rather than reporting a partial as a whole.`);
  process.exit(2);
}

const now = Date.now();
const rows = data || [];
let noProcess = 0;
let noProcessButReadsAlive = 0;
const offenders = [];

for (const r of rows) {
  const ccPid = resolveCcPidFromTerminalId(r.terminal_id, r.session_id);
  const resolvable = ccPid != null;
  const osAlive = resolvable ? isProcessRunning(Number(ccPid)) : null; // null = COULD NOT DETERMINE
  const verdict = isSessionAlive(r, { nowMs: now });
  const hbAgeS = r.heartbeat_at ? Math.round((now - Date.parse(r.heartbeat_at)) / 1000) : null;

  if (osAlive === false) {
    noProcess += 1;
    if (verdict.alive) {
      noProcessButReadsAlive += 1;
      offenders.push({
        session: r.session_id.slice(0, 8),
        callsign: r.metadata?.callsign ?? null,
        ccPid,
        status: r.status,
        is_alive: r.is_alive,
        heartbeat_age_s: hbAgeS,
        reads_alive_because: verdict.reason,
      });
    }
  }
}

const unresolvable = rows.filter((r) => resolveCcPidFromTerminalId(r.terminal_id, r.session_id) == null).length;

console.log('\n=== SEAT LIVENESS RE-MEASUREMENT (live fleet, PRE-FIX code) ===');
console.log('measured_at              :', new Date().toISOString());
console.log('registered seats examined:', rows.length);
console.log('pid UNRESOLVABLE (abstain):', unresolvable, '(NOT counted as dead — could-not-determine)');
console.log('pid resolved + OS says GONE:', noProcess);
console.log('  ...of those, STILL READ ALIVE:', noProcessButReadsAlive, '  <-- the defect');
if (offenders.length) {
  console.log('\noffenders:');
  for (const o of offenders) console.log(' ', JSON.stringify(o));
} else {
  console.log('\nno seat with a confirmed-gone process currently reads alive.');
}
console.log('\nORIGINAL 2026-07-26: 11 seats, 5 with no process, 4 of those reading alive.');

// ── A/B THE RESOLVER ON THE SAME LIVE POPULATION ────────────────────────────
// The SD's founding complaint was that the PID rung "resolved NOTHING". Rather than quote the
// commit message for that, re-derive it here: run the PRE-C2 logic and the shipped resolver over
// the same rows and print both counts. This is the difference C2 actually makes, today.
function preC2(terminalId) {
  if (!terminalId) return null;                       // 75% of the live fleet dies right here
  const seg = String(terminalId).split('-').pop();    // assumed "win-cc-{port}-{pid}"
  const n = Number(seg);
  return Number.isFinite(n) ? n : null;               // a UUID's last group is hex, never a pid
}
let oldOk = 0;
let newOk = 0;
let nullTid = 0;
for (const r of rows) {
  if (!r.terminal_id) nullTid += 1;
  if (preC2(r.terminal_id) != null) oldOk += 1;
  if (resolveCcPidFromTerminalId(r.terminal_id, r.session_id) != null) newOk += 1;
}
console.log('\n=== RESOLVER A/B on the same %d rows ===', rows.length);
console.log('terminal_id IS NULL       :', nullTid);
console.log('PRE-C2 resolver resolved  :', oldOk, 'of', rows.length);
console.log('SHIPPED resolver resolved :', newOk, 'of', rows.length);
