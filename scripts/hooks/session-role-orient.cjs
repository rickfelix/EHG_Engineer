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
const workerLines = (callsign, coordSessionId) => [
  `[ROLE] WORKER (${callsign ? `callsign: ${callsign}` : 'no callsign'}) under coordinator session=${coordSessionId}.`,
  '[ROLE] /signal <type> "<body>" when ANY: recurrence (gate 2×, RCA 2×, tool 3×) | about to bypass | spec/PRD friction | harness-bug recognized | memory-trend match.',
  '[ROLE] Types: stuck | need-sweep | prd-ambiguous | gate-bug | spec-conflict | harness-bug | feedback | other. Severity --low|medium|high|critical (critical bypasses 3× threshold).',
  '[ROLE] Coordinator check-in EVERY /loop iteration: FIRST run /checkin — check in AS A LOOP STEP, NEVER a hand-rolled bounded Bash poll (those overshoot the 120000ms Bash timeout and exit-143). /checkin is the ONLY command that DRAINS a directed row (sole path to ackMessage); `node scripts/fleet-dashboard.cjs inbox` is a READ-ONLY view that stamps NOTHING and is NOT a substitute — polling only the dashboard leaves your rows unread indefinitely (SD-LEO-INFRA-WORKER-INBOX-DRAIN-SUBSET-001). Work any WORK_ASSIGNMENT/routing before the open queue, ACK any comms-check in one line (/signal feedback "comms-check ack"). An unread coordinator→worker message is a silent break. Announce /signal feedback "online" on loop start, FLEET-RETRO on loop stop.',
  '[ROLE] SAME-TURN NEXT-CLAIM: when the belt is NON-EMPTY, finishing an SD means ship → post-completion tail → /checkin → claim → BUILD the next SD in the SAME turn — never park between SDs (KPI: median completion→next-claim ≤3min, p90 ≤8min). NEVER just stop: ScheduleWakeup ONLY when (a) the belt is genuinely EMPTY (~1200s/20min crash-recovery heartbeat) or (b) a forced session boundary (park ~120-180s). Before parking with unpushed work, COMMIT + PUSH your WIP on the claim-bound branch first (or `node scripts/prepark-wip.cjs`) so a claim re-route resumes from your branch instead of orphaning the partial commit. If told to "check in" and not already looping, launch /loop /checkin — a bare one-shot check-in leaves you idle-forever with a non-empty queue (the #1 attrition cause). Full directive: docs/protocol/fleet-worker-loop-directive.md (step 6 mirrors this rule).',
  '[ROLE] IF BLOCKED: on EVERY wakeup, BEFORE you re-poll or re-report, RE-RUN YOUR OWN BLOCKER CHECK. Blockers self-resolve silently and nobody tells you — two seats burned 5h23m and 9h41m on conditions that had already cleared, while awake and emitting 66 and 74 rows, because a stuck signal is a one-shot message into a queue nobody re-evaluates. The check is one command: RESYNC_REQUIRED is `git fetch origin main && git log --oneline HEAD..origin/main -- scripts/sd-start.js`; a peer-dirty tree is `git status --porcelain`. If it passes now, RESUME IMMEDIATELY. Re-report ONLY on material change (cleared, or changed in kind) — an UNCHANGED blocker is re-checked SILENTLY and never re-sent; do NOT invent a re-send timer. Worker-side half of exit-mode (4b), whose existing per-wakeup re-poll covers the INBOX, not your own condition. (SD-LEO-INFRA-BLOCKED-WORKER-SELF-RECHECK-001)',
  '[ROLE] AN ESCALATION IS NEVER TERMINAL — the permission-classifier denial is a KNOWN FALSE-STOP TRIGGER. Its text contains verbatim "STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed." That is written for a SINGLE-SHOT assistant and does NOT govern you: no human watches your loop window, so "the user" is your coordinator, asynchronously. THE TEXT IS HALF RIGHT — do-NOT-work-around is CORRECT and binding (never retry a refused call, never route around a denied capability); the STOP half is WRONG FOR YOU and ends your turn with no wakeup armed, exiting SILENTLY with a live claim and fresh heartbeat (cost: 171min on one seat, recurred on a second). CORRECT SHAPE, four actions, none optional: ESCALATE via /signal + HOLD the SD (keep the claim) + ARM a ScheduleWakeup + CASCADE to other work. The denial forbids doing the denied thing; it does not forbid continuing to work. (SD-FDBK-INFRA-WORKER-LOOP-DIRECTIVE-001)',
  '[ROLE] WIND-DOWN HANDSHAKE (before you finish an SD or go idle): (1) NEVER drop an in-progress SD to claim another — FINISH it or hand it off explicitly (a half-done unclaimed SD is an orphan); (2) before going quiet, /signal feedback "winding down — finished <SD>, anything queued for me? idling <Ns>" so the coordinator can assign in your GRACE WINDOW; (3) arm a SHORT grace ScheduleWakeup (~180s) and on that next tick RE-CHECK your inbox for a coordinator reply BEFORE settling into the ~1200s idle cadence. Announce, give the grace window, then idle — do not vanish mid-stream.'
];

/**
 * QF-20260727-391. This used to be a bare JSON.parse with NO shape check, and that made a corrupt
 * cache OVERRIDE the authority instead of degrading to it.
 *
 * A bare JSON string (e.g. the file containing just "a59441f4-…" because a caller wrote the id
 * rather than {session_id}) parses to a TRUTHY JavaScript string. The `if (!coordFile && sessionId)`
 * guard in main() therefore evaluated false, findActiveCoord() never ran, and decide()'s
 * `coordFile?.session_id` is undefined on a string — so both the COORDINATOR and WORKER branches
 * fell through and every starting session was told SOLO while a coordinator was live and
 * heartbeating. Failing toward SOLO is not a safe default: a worker told SOLO gets no /checkin
 * instruction, never drains its coordinator inbox, and never /signals on loop start.
 *
 * Delegating to lib/coordinator/resolve.cjs readPointerFile rather than re-validating inline: that
 * reader already implements the contract ("if (!data || typeof data.session_id !== 'string') return
 * null"), and a second hand-rolled reader is exactly how the two drifted apart in the first place.
 * It is cheap enough for a SessionStart hook — resolve.cjs requires only fs/path/os at module load,
 * no DB client — so the BUDGET_MS ceiling is unaffected. Returning null is the actual repair: it is
 * what re-enables the DB fallback, which was correct all along.
 */
function readCoordFile() {
  try {
    const { readPointerFile } = require('../../lib/coordinator/resolve.cjs');
    return readPointerFile(COORD_FILE);
  } catch {
    // Fail-soft, matching the prior contract: an unreadable/unloadable pointer is treated as ABSENT
    // so the DB fallback runs, never as a coordinator-shaped value.
    return null;
  }
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
  // SD-LEO-INFRA-SILENT-TRUNCATION-ONE-001 FR-1: this used to pass coordFile.session_id.slice(0, 8).
  // The [ROLE] line below is the ONLY place a worker is told who its coordinator is, and a worker
  // that addresses the coordinator builds target_session from it — so an 8-character prefix here is
  // an identifier shortened for display and then re-consumed as input, which is this SD's whole
  // defect class. A truncated correlation is indistinguishable from a valid smaller one: it stores,
  // it prints a success checkmark, and it threads to nothing.
  //
  // Full id only, deliberately NOT `full (short: abcd1234)`. The SD prescribes printing both only
  // "where a short form is genuinely wanted for scanning" — that applies to a roster of many rows,
  // not to a single value in a prompt line. Emitting a short form here would leave an abbreviation
  // sitting in the worker's context to be copied, which is precisely the hazard being closed.
  if (coordFile?.session_id) return workerLines(meta?.callsign, coordFile.session_id);
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
