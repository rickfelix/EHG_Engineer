/* session-role-orient.cjs — SessionStart hook (QF-20260511-026).
 * Emits 3-line [ROLE] block (SOLO | WORKER | COORDINATOR). */
const fs = require('fs');
const path = require('path');
const { drainAndExit } = require('../../lib/hooks/drain-undici.cjs'); // QF-20260719-890: drain before post-fetch exits
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const COORD_FILE = path.resolve(__dirname, '../../.claude/active-coordinator.json');
const BUDGET_MS = 1500;
const STALE_MIN = 10;
const SOLO = [
  '[ROLE] SOLO — no active coordinator detected.',
  '[ROLE] Canonical pause points apply (CLAUDE.md 5-point list). Log harness bugs: node scripts/log-harness-bug.js "<symptom>".',
  '[ROLE] If /leo next returns no workable SD AND AUTO-PROCEED=ON → fall through to /leo assist Phase 1 (continuation, NOT pause).'
];
const COORDINATOR = [
  '[ROLE] COORDINATOR — you manage the fleet.',
  '[ROLE] Drain worker signals via /coordinator inbox (filtered by payload->signal_type IS NOT NULL).',
  '[ROLE] 3+ matching signals within 60min auto-promote to feedback (category=harness_backlog) → SD pipeline.'
];
const workerLines = (callsign, coordShort) => [
  `[ROLE] WORKER (${callsign ? `callsign: ${callsign}` : 'no callsign'}) under coordinator session=${coordShort}.`,
  '[ROLE] /signal <type> "<body>" when ANY: recurrence (gate 2×, RCA 2×, tool 3×) | about to bypass | spec/PRD friction | harness-bug recognized | memory-trend match.',
  '[ROLE] Types: stuck | need-sweep | prd-ambiguous | gate-bug | spec-conflict | harness-bug | feedback | other. Severity --low|medium|high|critical (critical bypasses 3× threshold).',
  '[ROLE] Coordinator check-in EVERY /loop iteration: FIRST run /checkin (or poll node scripts/fleet-dashboard.cjs inbox) — check in AS A LOOP STEP, NEVER a hand-rolled bounded Bash poll (those overshoot the 120000ms Bash timeout and exit-143). Work any WORK_ASSIGNMENT/routing before the open queue, ACK any comms-check in one line (/signal feedback "comms-check ack"). An unread coordinator→worker message is a silent break. Announce /signal feedback "online" on loop start, FLEET-RETRO on loop stop.',
  '[ROLE] SAME-TURN NEXT-CLAIM: when the belt is NON-EMPTY, finishing an SD means ship → post-completion tail → /checkin → claim → BUILD the next SD in the SAME turn — never park between SDs (KPI: median completion→next-claim ≤3min, p90 ≤8min). NEVER just stop: ScheduleWakeup ONLY when (a) the belt is genuinely EMPTY (~1200s/20min crash-recovery heartbeat) or (b) a forced session boundary (park ~120-180s). Before parking with unpushed work, COMMIT + PUSH your WIP on the claim-bound branch first (or `node scripts/prepark-wip.cjs`) so a claim re-route resumes from your branch instead of orphaning the partial commit. If told to "check in" and not already looping, launch /loop /checkin — a bare one-shot check-in leaves you idle-forever with a non-empty queue (the #1 attrition cause). Full directive: docs/protocol/fleet-worker-loop-directive.md (step 6 mirrors this rule).',
  '[ROLE] WIND-DOWN HANDSHAKE (before you finish an SD or go idle): (1) NEVER drop an in-progress SD to claim another — FINISH it or hand it off explicitly (a half-done unclaimed SD is an orphan); (2) before going quiet, /signal feedback "winding down — finished <SD>, anything queued for me? idling <Ns>" so the coordinator can assign in your GRACE WINDOW; (3) arm a SHORT grace ScheduleWakeup (~180s) and on that next tick RE-CHECK your inbox for a coordinator reply BEFORE settling into the ~1200s idle cadence. Announce, give the grace window, then idle — do not vanish mid-stream.'
];

function readCoordFile() {
  try { return fs.existsSync(COORD_FILE) ? JSON.parse(fs.readFileSync(COORD_FILE, 'utf8')) : null; } catch { return null; }
}
async function pgGet(qs) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), BUDGET_MS);
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${qs}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: ctl.signal });
    return res.ok ? await res.json() : null;
  } catch { return null; } finally { clearTimeout(timer); }
}
async function fetchMeta(sid) {
  return (await pgGet(`claude_sessions?session_id=eq.${sid}&select=metadata`))?.[0]?.metadata || null;
}
async function findActiveCoord() {
  const cutoff = new Date(Date.now() - STALE_MIN * 60_000).toISOString();
  return (await pgGet(`claude_sessions?heartbeat_at=gte.${cutoff}&metadata->>is_coordinator=eq.true&order=heartbeat_at.desc&limit=1&select=session_id`))?.[0]?.session_id || null;
}
function decide(sessionId, meta, coordFile) {
  if (meta?.is_coordinator) return COORDINATOR;
  if (coordFile?.session_id === sessionId) return COORDINATOR;
  if (coordFile?.session_id) return workerLines(meta?.callsign, coordFile.session_id.slice(0, 8));
  return SOLO;
}
function main() {
  return new Promise(resolve => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { input += c; });
    process.stdin.on('end', async () => {
      const sessionId = (() => { try { return JSON.parse(input)?.session_id; } catch { return null; } })();
      let coordFile = readCoordFile();
      if (!coordFile && sessionId) {
        const dbCoord = await findActiveCoord();
        if (dbCoord) coordFile = { session_id: dbCoord };
      }
      const meta = sessionId ? await fetchMeta(sessionId) : null;
      decide(sessionId, meta, coordFile).forEach(l => console.log(l));
      resolve();
    });
    process.stdin.on('error', () => resolve());
    setTimeout(resolve, BUDGET_MS + 300);
  });
}
if (require.main === module) main().then(() => drainAndExit(0)).catch(() => drainAndExit(0));
module.exports = { readCoordFile, fetchMeta, findActiveCoord, decide, SOLO, COORDINATOR, workerLines };
