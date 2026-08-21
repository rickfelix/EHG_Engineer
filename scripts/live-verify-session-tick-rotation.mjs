#!/usr/bin/env node
/**
 * SD-MAN-INFRA-CORRECTIVE-VISION-GAP-001 FR-2 — pre-armed observer for a REAL /clear rotation.
 *
 * WHY THIS SCRIPT EXISTS (TESTING evidence d8ad67a2, finding C6): a real /clear destroys the
 * session issuing it, so that session cannot observe its own aftermath. This must be started
 * BEFORE the /clear, from a separate process, and persist results somewhere a later session can
 * read -- mirroring tests/acceptance/rotation-closes-all-daemons.cjs's runnable-not-narrated
 * pattern, but observing a REAL hook-driven rotation instead of a simulated row release (that
 * script's own header explains why simulating the release is fine for FR-2's structural proof,
 * but the smoke_test_steps this SD closes explicitly call for a genuine /clear through the real
 * SessionStart hook -- that is what this script watches for).
 *
 * USAGE (two terminals / two processes):
 *   Terminal A (the session that will be /clear-ed):
 *     note its own CLAUDE_SESSION_ID, then run /clear
 *   Terminal B (started BEFORE the /clear, from anywhere -- does not need to be the rotating
 *   session):
 *     node scripts/live-verify-session-tick-rotation.mjs --session <SID> [--parked-worker <SID2>] [--timeout-s 60]
 *
 * Persists a JSON result file (default .claude/live-verify-results/<SID>-<timestamp>.json) that a
 * LATER session (or this same terminal B process) can read back -- satisfying FR-2's "captured by
 * the observer, not narrated" acceptance criteria.
 *
 * Watches, for the target --session:
 *   - status transitions to 'released' within --timeout-s seconds (default 60 -- smoke step 4 /
 *     success criterion 1)
 *   - heartbeat_at STOPS advancing for a fixed 90s after release (smoke step 5's freeze check;
 *     not controlled by --timeout-s, which bounds only the wait-for-release phase)
 *
 * If --parked-worker is given, ALSO watches that session across the SAME 90s window (should be
 * unaffected the whole time -- smoke step 6, "the step the fix must not fail"):
 *   - heartbeat_at is sampled before and after the 90s window and must have ADVANCED (two
 *     identical samples would mean the parked worker itself went silent, not proof it survived)
 *   - status must not flip to released
 *
 * DOES NOT invoke scripts/adam-register.cjs (no role-mutating write from an observer) -- smoke
 * step 8 / success criterion 4 (registration succeeds immediately post-rotation) is proven at the
 * unit level by tests/unit/coordination/adam-singleton.test.js against the real
 * decideSingleAdamGuard function, not re-proven live by this script; adamRegisterProbe below only
 * confirms that function is importable from the checkout this observer is running against.
 *
 * Exits 0 on full PASS, 1 on any watched outcome not observed within --timeout-s / the fixed
 * 90s freeze window, 2 on missing args.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function parseArgs(argv) {
  const get = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  return {
    session: get('--session'),
    parkedWorker: get('--parked-worker') || null,
    timeoutS: Number(get('--timeout-s') || 60),
    outDir: get('--out-dir') || path.join('.claude', 'live-verify-results'),
  };
}

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll `sb` for the target session's row until `predicate(row)` is true or timeoutMs elapses.
 * `sleepFn`/`clockFn` are injectable so this is testable without real waits (hermetic, matching
 * this repo's established convention -- see tests/unit/coordination/adam-singleton.test.js).
 */
export async function pollUntil(sb, sessionId, predicate, { timeoutMs = 60000, intervalMs = 2000, sleepFn = realSleep, clockFn = Date.now } = {}) {
  const deadline = clockFn() + timeoutMs;
  let last = null;
  while (clockFn() < deadline) {
    const { data } = await sb.from('claude_sessions').select('session_id,status,heartbeat_at,metadata').eq('session_id', sessionId).maybeSingle();
    last = data || null;
    if (last && predicate(last)) return { ok: true, row: last };
    await sleepFn(intervalMs);
  }
  return { ok: false, row: last };
}

/**
 * PURE: given a heartbeat sample taken at t0 and again after waitMs, is it frozen (unchanged)?
 * Injectable clock/sleep for unit testing without real waits.
 */
export function isHeartbeatFrozen(hbBefore, hbAfter) {
  if (!hbBefore || !hbAfter) return false;
  return hbBefore === hbAfter;
}

async function runAdamRegisterProbe(sessionId) {
  // Only meaningful if the released session held the adam role -- probe non-destructively via
  // the pure guard function rather than actually invoking scripts/adam-register.cjs's real RPC
  // writes (this observer must never itself mutate role state).
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { decideSingleAdamGuard } = require('../lib/coordinator/adam-identity.cjs');
  return { probed: true, note: 'adam-register.cjs itself is not invoked by this observer (no role mutation); see FR-1 unit tests (adam-singleton.test.js) for the live registration-guard proof against a released row.', decideSingleAdamGuardAvailable: typeof decideSingleAdamGuard === 'function' };
}

export async function observeRotation({ sb, session, parkedWorker, now = () => Date.now(), sleepFn = realSleep, clockFn = Date.now, releaseTimeoutMs = 60_000, freezeWaitMs = 90_000 } = {}) {
  const result = {
    session, parkedWorker, startedAt: new Date(now()).toISOString(),
    releaseObserved: null, heartbeatFrozenObserved: null, parkedWorkerUnaffected: null,
    adamRegisterProbe: null, overall: 'FAIL',
  };

  const releaseWait = await pollUntil(sb, session, (row) => row.status === 'released', { timeoutMs: releaseTimeoutMs, sleepFn, clockFn });
  result.releaseObserved = releaseWait.ok;
  if (!releaseWait.ok) { result.overall = 'FAIL_NO_RELEASE'; return result; }

  const hbAtRelease = releaseWait.row.heartbeat_at;

  // Sample the parked worker BEFORE the freeze wait too (TESTING F6): a single
  // post-wait snapshot can only prove status, never "advancing" as the header claims.
  let parkedBefore = null;
  if (parkedWorker) {
    const p = await sb.from('claude_sessions').select('status,heartbeat_at').eq('session_id', parkedWorker).maybeSingle();
    parkedBefore = p.data || null;
  }

  await sleepFn(freezeWaitMs);

  const post = await sb.from('claude_sessions').select('heartbeat_at').eq('session_id', session).maybeSingle();
  result.heartbeatFrozenObserved = isHeartbeatFrozen(hbAtRelease, post.data?.heartbeat_at || null);

  if (parkedWorker) {
    const parkedAfter = await sb.from('claude_sessions').select('status,heartbeat_at').eq('session_id', parkedWorker).maybeSingle();
    const neverReleased = Boolean(parkedAfter.data && parkedAfter.data.status !== 'released');
    const heartbeatAdvanced = Boolean(parkedBefore?.heartbeat_at) && Boolean(parkedAfter.data?.heartbeat_at)
      && !isHeartbeatFrozen(parkedBefore.heartbeat_at, parkedAfter.data.heartbeat_at);
    result.parkedWorkerUnaffected = neverReleased && heartbeatAdvanced;
  } else {
    result.parkedWorkerUnaffected = 'not_provided';
  }

  result.adamRegisterProbe = await runAdamRegisterProbe(session);
  result.overall = (result.releaseObserved && result.heartbeatFrozenObserved && result.parkedWorkerUnaffected !== false)
    ? 'PASS' : 'PARTIAL';
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.session) {
    console.error('[live-verify] --session <SID> is required. See file header for usage.');
    process.exit(2);
  }
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log(`[live-verify] armed, watching session ${args.session}${args.parkedWorker ? ` (+ parked worker ${args.parkedWorker})` : ''}. Perform /clear now.`);

  const result = await observeRotation({ sb, session: args.session, parkedWorker: args.parkedWorker, releaseTimeoutMs: args.timeoutS * 1000 });

  fs.mkdirSync(args.outDir, { recursive: true });
  const outPath = path.join(args.outDir, `${args.session}-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`[live-verify] ${result.overall} -- results written to ${outPath}`);
  process.exit(result.overall === 'PASS' ? 0 : 1);
}

if (process.argv[1]?.endsWith('live-verify-session-tick-rotation.mjs')) {
  main().catch((err) => { console.error('[live-verify]', (err && err.message) || err); process.exit(1); });
}
