#!/usr/bin/env node
/**
 * Coordinator consumer for the Drive Report instrument.
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-C.
 *
 * Writes a coordinator-lane consumption receipt for the newest drive report, so a starving binding
 * is visible as a ROW rather than as an absence nobody queries.
 *
 * ─── REWRITTEN: THE CONTRACT MOVED UNDER THIS SD MID-BUILD ─────────────────────────────────────
 * The first version read and merged a `consumption_receipts` jsonb map on drive_reports. Sibling -B
 * DELETED that column by coordinator ruling (commit 356accbf) and replaced it with
 * public.drive_report_receipts — ONE ROW per (report_id, lane), UNIQUE(report_id, lane) — roughly
 * two minutes after this file was last edited. The ruling's stated reason was exactly the hazard
 * the old version spent effort guarding: a jsonb map forces read-merge-write on every writer
 * forever, and one forgetful commit silently clobbers another lane's receipt.
 *
 * The old version would have failed in this SD's OWN target shape: PostgREST answers a missing
 * column with 42703, the fail-soft branch logs a no-op, the process exits 0, and the tick reports
 * `drive-report-consume:ok` forever having written nothing. AN INSTRUMENT BUILT TO MAKE AN
 * UNCONSUMED REPORT VISIBLE WOULD HAVE HAD NO CHANNEL THROUGH WHICH ITS OWN TOTAL FAILURE WAS
 * VISIBLE. That is why the write below is a single native upsert and why a write failure is now
 * surfaced rather than swallowed.
 *
 * ─── WHY THIS HOST ─────────────────────────────────────────────────────────────────────────────
 * COMPOSED_CORES runs on the coordinator's own quiet tick. The original ruling placed this in
 * lib/checkin/steps/, which was reversed on measurement: build-forbidden-guard ejects any
 * is_coordinator session to action:'idle' before the step would run, AND the coordinator never runs
 * /checkin at all. A consumer that never runs is indistinguishable from a producer that never
 * produced.
 */
// dotenv FIRST. This was THE ONLY COMPOSED_CORES SCRIPT WITHOUT IT, and the omission was not
// cosmetic: without the env loaded, createClient THROWS before any of this module's own error
// handling runs, stdout is 0 BYTES, and the host's `|| 'ok'` default fires. The tick would have
// reported drive-report-consume:ok for a process that died on line one.
import 'dotenv/config';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const require_ = createRequire(import.meta.url);

/**
 * The one lane this consumer writes.
 *
 * DEFINED LOCALLY, DELIBERATELY, AND IT IS NOT A DUPLICATE CONTRACT. The canonical list lives in
 * sibling -B's lib/drive-loop/lanes.js, which is NOT ON THIS BRANCH — importing it would make this
 * branch unbuildable until -B merges. Copying the whole module instead would create two lane
 * modules in one directory where `require('../lib/drive-loop/lanes')` resolves to the .js, which is
 * a worse failure than a single named constant.
 *
 * UNDERSCORE, NOT HYPHEN, AND THE DISTINCTION IS THE WHOLE HAZARD. -B's SQL is
 * CHECK (lane IN ('coordinator','adam','chairman_brief')). A receipt written as 'chairman-brief'
 * INSERTS CLEANLY and satisfies UNIQUE(report_id, lane) SEPARATELY from the real lane — so a
 * typo produces a receipt nobody reads while the real lane still looks unconsumed. The first
 * version of this file got that wrong. tests/unit/drive-loop/lane-agrees-with-producer.test.js
 * ARMS ITSELF the moment -B's module appears on this branch and fails if the two ever disagree.
 */
export const COORDINATOR_LANE = 'coordinator';

/** Bound so a black-holed write cannot stall the coordinator tick (precedent: receipt-ledger). */
export const WRITE_TIMEOUT_MS = 2000;

/**
 * Describe why the supabase env is unusable, or null when it is fine.
 *
 * A PURE FUNCTION ON PURPOSE, so the check is testable WITHOUT a client. Inlined in main() it could
 * only be tested by calling main(), which can reach createClient — and the repo's DB-test guard
 * correctly refuses a unit test that can touch a database. A guard blocking a test is usually the
 * guard being right about the shape of the test.
 *
 * WHY IT EXISTS AT ALL: with a missing or EMPTY url/key, createClient THROWS before any of this
 * module's error handling runs — exit 0, ZERO-BYTE STDOUT, and the host's `tail(stdout) || 'ok'`
 * reports the instrument healthy. A SERVICE-KEY ROTATION WOULD SILENCE IT PERMANENTLY while the
 * tick said fine. Adding dotenv fixed the missing-FILE case and left the empty-VALUE case open.
 */
export function describeSupabaseEnvProblem(env = process.env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (url && key) return null;
  return `env: SUPABASE_URL=${url ? 'set' : 'MISSING'} key=${key ? 'set' : 'MISSING'}`;
}

// resolveActorSessionId WAS DELETED HERE, AND THE DELETION IS A FINDING RATHER THAN A TIDY-UP.
//
// It resolved the actor from CLAUDE_SESSION_ID with getActiveCoordinatorId as a FALLBACK. When the
// seat check moved into main(), that function became DEAD CODE — main() never called it — but its
// THREE TESTS AND ITS MUTANT KEPT SCORING. One of those tests asserted the fallback behaviour was
// CORRECT, which is to say it PINNED THE EXPLOITED VULNERABILITY AS THE SPECIFICATION.
//
// A reviewer proved the cost decisively: re-introducing the original hole in main() — a one-token
// change — left the suite 32/32 GREEN and the harness would have reported 14/14 KILLED. My fix was
// DEFENDED BY A DECOY: the tests and the mutant exercised a fossil while the real path sat
// unprotected, and the mutation score ROSE as the protection FELL.
//
// A MUTATION SCORE MEASURES THE CODE THE TESTS REACH. After a refactor moves logic, the old
// function plus its old tests plus its old mutants keep scoring, and the result is indistinguishable
// from coverage. When you move logic, check who still calls what you left behind.

/**
 * Best-effort check that the executing seat is the coordinator.
 *
 * ─── THIS IS AN ACCIDENT GUARD. IT IS NOT A SECURITY BOUNDARY. READ THIS BEFORE TRUSTING IT. ───
 *
 * A SESSION ID IS AN IDENTIFIER, NOT A CREDENTIAL. The coordinator's id is readable from
 * .claude/active-coordinator.json, which sits in every worktree. A security review read it,
 * exported it as CLAUDE_SESSION_ID from a WORKER seat, and this check passed. It also forged BOTH
 * SIDES — overwriting the pointer file with any id holding a fresh heartbeat and matching the env
 * var — and with COORDINATOR_TWOWAY_V2 at its documented default (OFF) getActiveCoordinatorId
 * returned the attacker-chosen value. NO COMPARISON OF TWO READABLE VALUES CAN AUTHENTICATE A SEAT.
 *
 * Three attempts were made to close this properly and all three failed, each in a way worth
 * recording: the first compared a value to ITSELF (the resolver was both the fallback and the
 * reference); the second was defended by a DECOY — a dead function whose tests kept the mutation
 * score green while the live path sat open; and the third still turned on a readable value.
 *
 * RULED (coordinator, option (a)): keep this as a MISTAKE GUARD and stop pretending otherwise. It
 * genuinely stops the accident it was written for — a worker or a cron wrapper running this script
 * without deliberately impersonating the coordinator — and that accident is the realistic one,
 * because the first receipt for a lane WINS and a single stray run permanently makes a starving
 * binding read as fed. It stops none of the deliberate cases above.
 *
 * WHY IT WAS NOT DELETED OUTRIGHT, which is a deviation from the literal ruling and is stated so it
 * can be overruled: removing it makes the ACCIDENTAL write easier while removing no attacker
 * capability, since an attacker was never blocked. The honest change is to the CLAIM, not the code.
 *
 * A REAL FIX NEEDS SOMETHING THE PROCESS CANNOT SELF-ASSERT — claude_sessions.pid checked against
 * the live process tree, or an RPC that derives the actor server-side so the claim and the claimant
 * are not the same party. Both are fleet-wide identity questions, not a -C question. Filed as a
 * completion flag.
 *
 * Fails CLOSED: an unresolvable coordinator means no write.
 */
export function isCoordinatorSeat(sessionId, coordinatorId) {
  return Boolean(sessionId) && Boolean(coordinatorId) && sessionId === coordinatorId;
}

/**
 * Race a query against a timer AND abort the underlying socket.
 *
 * THE TIMER ALONE IS ADVISORY, WHICH IS NOT WHAT THE OLD COMMENT CLAIMED. A reviewer measured it:
 * Promise.race settles this function, but with no AbortSignal the socket stays open and KEEPS THE
 * PROCESS ALIVE, so the real ceiling was the host's 90s execFile kill — whose SIGTERM produces a
 * NON-ZERO CHILD and therefore a FALSE FAILED CORE. An availability guard that hands the host a
 * false failure is worse than no guard.
 *
 * Callers pass a builder so the signal can be attached to the query itself, not merely raced.
 */
function withTimeout(buildQuery, ms, label) {
  const signal = AbortSignal.timeout(ms);
  const query = buildQuery(signal);
  return Promise.race([
    query,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}: timed out after ${ms}ms`)), ms).unref?.()),
  ]);
}

/**
 * Is this error the relation simply not existing yet?
 *
 * WHY THIS EXISTS AT ALL. This SD was written to stop a starving binding from reading as fed. It
 * shipped the exact inverse: BOTH tables live in sibling -B's unlanded migration, so on every tick
 * between this merge and -B's, the core returned status='failed' for a condition that is the
 * NORMAL, EXPECTED, CORRECT state of the world. An alarm that is guaranteed to be firing on the day
 * you install it teaches everyone to ignore it, and then it cannot report the real failure later.
 *
 * NOT A CATCH-ALL, AND DELIBERATELY NARROW. Only PGRST205 (PostgREST: relation absent from the
 * schema cache) and 42P01 (postgres: undefined_table) route here. Every other error — permission
 * denied, constraint violation, timeout, malformed query — still returns 'failed'. Widening this
 * predicate would rebuild the defect the SD exists to remove, one layer down.
 *
 * RESIDUAL RISK, STATED RATHER THAN SOLVED: after -B lands, a table DROPPED by accident produces
 * this same code, and this core would report pending_migration indefinitely. What keeps that from
 * being silent is that the status is NOT 'ok' — `runCoresFailSoft` records `key:status`, so the
 * one field that survives the tick's detail-dropping is the one that says something is wrong. A
 * permanent pending_migration is visible as not-healthy; it is simply mislabelled. Correctly
 * distinguishing "never existed" from "existed and vanished" needs state this core does not have.
 */
export function isRelationAbsent(err) {
  return err?.code === 'PGRST205' || err?.code === '42P01';
}

/**
 * Consume the newest drive report for the coordinator lane.
 *
 * RETURNS a small outcome object for tests and for the failure channel. The host
 * (runCoresFailSoft) does NOT short-circuit on a truthy return — it stringifies results into a
 * summary — so unlike the check-in pipeline there is no control-flow hazard here.
 *
 * @param {object} supabase service-role client, INJECTED — never constructed at module level, or
 *        every mutant becomes unreachable except by source regex.
 * @param {{nowMs?: number, sessionId?: string|null, coordinatorId?: string|null, logger?: object}} opts
 * @returns {Promise<{status: string, reason?: string, reportId?: string}>}
 */
export async function runDriveReportConsumeCore(supabase, {
  nowMs = undefined, sessionId = null, coordinatorId = null, logger = console,
} = {}) {
  try {
    if (!isCoordinatorSeat(sessionId, coordinatorId)) {
      logger.log('[drive-report-consume] not the coordinator seat — no receipt written');
      return { status: 'skipped', reason: 'not_coordinator_seat' };
    }

    const { data: rows, error: readErr } = await withTimeout(
      (signal) => supabase.from('drive_reports').select('id').order('generated_at', { ascending: false }).limit(1).abortSignal(signal),
      WRITE_TIMEOUT_MS, 'drive_reports read');

    if (readErr) {
      if (isRelationAbsent(readErr)) {
        logger.log('[drive-report-consume] drive_reports not provisioned yet — producer -B has not landed');
        return { status: 'pending_migration', reason: 'drive_reports absent' };
      }
      // A READ FAILURE IS NOT A NO-OP — it is the instrument being unable to see. Surfaced through
      // the failure channel rather than logged and forgotten.
      logger.error(`[drive-report-consume] READ FAILED: ${readErr.message}`);
      return { status: 'failed', reason: `read: ${readErr.message}` };
    }
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) {
      logger.log('[drive-report-consume] no drive report to consume');
      return { status: 'nothing_to_consume' };
    }

    // SINGLE NATIVE UPSERT. The UNIQUE(report_id, lane) constraint makes first-writer-wins a
    // property of the SCHEMA rather than something every writer has to remember, which is exactly
    // why -B moved to rows. ignoreDuplicates keeps the ORIGINAL consumed_at: a re-run must not
    // rewrite history, because the whole value of the receipt is WHEN the lane first saw the report.
    // No read-merge-write, so no sibling lane is reachable from this statement at all.
    // count:'exact' so INSERTED and ALREADY-PRESENT are distinguishable. Without it the previous
    // version logged "receipt recorded" unconditionally — FALSE ON EVERY TICK AFTER THE FIRST,
    // since ON CONFLICT DO NOTHING writes nothing the second time. A log line that claims a write
    // that did not happen is the same class of lie the receipt itself exists to prevent.
    const { error: writeErr, count } = await withTimeout(
      (signal) => supabase.from('drive_report_receipts')
        .upsert({
          report_id: row.id,
          lane: COORDINATOR_LANE,
          consumed_at: new Date(nowMs ?? Date.now()).toISOString(),
          metadata: { actor_session: sessionId },
        }, { onConflict: 'report_id,lane', ignoreDuplicates: true, count: 'exact' }).abortSignal(signal),
      WRITE_TIMEOUT_MS, 'drive_report_receipts upsert');

    if (writeErr) {
      if (isRelationAbsent(writeErr)) {
        // Reachable on its own: -B could land drive_reports and the receipts table separately, and
        // the read above would then succeed against a schema whose write target is still missing.
        logger.log(`[drive-report-consume] drive_report_receipts not provisioned yet — report ${row.id} left unconsumed`);
        return { status: 'pending_migration', reason: 'drive_report_receipts absent', reportId: row.id };
      }
      logger.error(`[drive-report-consume] WRITE FAILED for report ${row.id}: ${writeErr.message}`);
      return { status: 'failed', reason: `write: ${writeErr.message}`, reportId: row.id };
    }
    // count===0 means the lane had already consumed this report and ON CONFLICT DO NOTHING fired.
    // That is a correct, expected steady state — not a failure — but it must not be reported as a
    // fresh receipt.
    const inserted = count !== 0;
    logger.log(inserted
      ? `[drive-report-consume] receipt RECORDED for report ${row.id} lane ${COORDINATOR_LANE} by ${sessionId}`
      : `[drive-report-consume] receipt ALREADY PRESENT for report ${row.id} lane ${COORDINATOR_LANE} — nothing written`);
    return { status: 'ok', reportId: row.id, inserted };
  } catch (e) {
    logger.error(`[drive-report-consume] UNEXPECTED FAILURE: ${e && e.message}`);
    return { status: 'failed', reason: `unexpected: ${e && e.message}` };
  }
}

/**
 * Path of the failure breadcrumb.
 *
 * WHY A FILE. runCoresFailSoft records `key:status` and DROPS the detail, and the core must exit 0
 * or the host reports a failed tick for a reason it cannot show. Written on failure, REMOVED on
 * success, so a stale one cannot accumulate.
 *
 * IT IS FORENSICS, NOT A CHANNEL, AND AN EARLIER VERSION OF THIS COMMENT OVERCLAIMED BY CALLING IT
 * ONE. NOTHING READS IT — a repo-wide grep finds only this module and its own test. It is useful to
 * a human who already suspects a problem and goes looking; it will never TELL anyone. The only
 * surface the host consults is stdout, and the tick currently drops that detail too (the
 * coordinator has taken that fix). Do not mistake this file for observability.
 */
export const FAILURE_BREADCRUMB = path.join('.artifacts', 'drive-report-consume-last-failure.json');

export function recordOutcome(outcome, { root = process.cwd(), fsImpl = fs } = {}) {
  const file = path.join(root, FAILURE_BREADCRUMB);
  try {
    if (outcome && outcome.status === 'failed') {
      fsImpl.mkdirSync(path.dirname(file), { recursive: true });
      fsImpl.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...outcome }, null, 2));
      return 'written';
    }
    if (fsImpl.existsSync(file)) { fsImpl.rmSync(file); return 'cleared'; }
    return 'none';
  } catch {
    return 'none'; // the breadcrumb must never be the thing that breaks the tick
  }
}

/**
 * @param {{supabase?: object, env?: object, resolveCoordinatorId?: Function, logger?: object}} deps
 *
 * DEPENDENCIES ARE INJECTABLE BECAUSE THE EXPLOIT LIVES HERE, NOT IN THE CORE. main() previously
 * built its own client, so it was UNTESTABLE BY CONSTRUCTION — and the seat resolution it performs
 * is exactly the line the security bypass turns on. The mutation harness proved the gap: a mutant
 * restoring the fallback (`: null;` -> `: coordinatorId;`) SURVIVED the entire suite, because
 * nothing could reach this function. An untestable entry point around a security-relevant decision
 * is where a real vulnerability hides behind a green score.
 */
export async function main({ supabase: injectedDb, env = process.env, resolveCoordinatorId, logger = console } = {}) {
  const { createClient } = await import('@supabase/supabase-js');
  const { getActiveCoordinatorId } = require_('../lib/coordinator/resolve.cjs');

  let supabase = injectedDb;
  if (!supabase) {
    // VALIDATE BEFORE createClient. Adding dotenv removed a TRIGGER, not the defect: with a missing
    // or EMPTY url/key, createClient THROWS before recordOutcome and before anything reaches stdout
    // — exit 0, ZERO-BYTE STDOUT, and the host's `tail(stdout) || 'ok'` reports
    // drive-report-consume:ok. A SERVICE-KEY ROTATION WOULD SILENCE THIS INSTRUMENT PERMANENTLY
    // WHILE THE TICK SAID FINE. That is this SD's own target defect, and it survived two fixes:
    // dotenv covered the missing-file case and left the empty-value case wide open.
    const envProblem = describeSupabaseEnvProblem(env);
    if (envProblem) {
      const outcome = { status: 'failed', reason: envProblem };
      recordOutcome(outcome);
      logger.error(`[drive-report-consume] ${envProblem}`);
      console.log(`FAILED ${envProblem}`);   // stdout, because that is the only thing the host reads
      return 0;
    }
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
    supabase = createClient(url, key, {
      // THE CLIENT-LEVEL ABORT, which is what actually bounds the process. A Promise.race settles
      // the FUNCTION and leaves the socket open — the exact pattern withTimeout's own docstring
      // condemns, which I then used verbatim for the coordinator lookup. Measured: the seat decision
      // was correct at t+2112ms while the PROCESS RAN TO t+95021ms, past the host's 90s kill, whose
      // SIGTERM is the FALSE FAILED CORE the timeout exists to prevent. Signalling at the client
      // covers every query including the coordinator lookup that precedes the guarded ones.
      global: { fetch: (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(WRITE_TIMEOUT_MS) }) },
    });
  }
  const resolveCoord = resolveCoordinatorId ?? (() => getActiveCoordinatorId(supabase));
  // BOUNDED. This call sits BEFORE both guarded queries and was previously awaited UNBOUNDED — a
  // reviewer measured it still running at 95007ms against a blackholed DB, past the host's 90s
  // execFile kill, whose SIGTERM produces exactly the FALSE FAILED CORE that withTimeout exists to
  // prevent. A timeout that guards the two queries and misses the call that precedes them bounds
  // nothing: the slowest path was the unguarded one.
  let coordinatorId = null;
  try {
    coordinatorId = await Promise.race([
      resolveCoord(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('getActiveCoordinatorId: timed out')), WRITE_TIMEOUT_MS).unref?.()),
    ]);
  } catch { /* fail closed: an unresolvable coordinator means the seat check below refuses */ }

  // THE EXECUTING SEAT COMES FROM THE ENVIRONMENT ONLY — NO FALLBACK. This is the fix for a
  // SELF-SATISFYING GATE that a security review exploited on the previous version: main() resolved
  // the actor with getActiveCoordinatorId as a FALLBACK and then compared that same value to
  // coordinatorId, so with CLAUDE_SESSION_ID unset isCoordinatorSeat compared a value TO ITSELF and
  // opened. Demonstrated with `env -u CLAUDE_SESSION_ID`, and reproduced by me.
  //
  // THE FALLBACK AND THE REFERENCE CANNOT BE THE SAME SOURCE. A seat check is only a check if the
  // two sides are independently derived: the env var is what the process SELF-ASSERTS, the DB
  // pointer is what the fleet BELIEVES. Comparing the belief to itself proves nothing.
  //
  // AND THE FAILURE WAS WORSE THAN NO GUARD: the bogus receipt would have carried the COORDINATOR's
  // id rather than a junk value, so it read as a genuine consumption. A control that cannot stop a
  // lie but makes it credible is worse than the absence it replaced. Absent env var => refuse.
  const sessionId = typeof env.CLAUDE_SESSION_ID === 'string' && env.CLAUDE_SESSION_ID.trim()
    ? env.CLAUDE_SESSION_ID.trim()
    : null;
  const outcome = await runDriveReportConsumeCore(supabase, { sessionId, coordinatorId, logger });
  recordOutcome(outcome);

  // A FAILURE IS STILL NOT OBSERVABLE FROM THE TICK, AND SAYING SO IS THE HONEST STATE.
  //
  // I moved this line from stderr to stdout believing that closed the gap. IT DID NOT. scriptCore
  // does capture stdout into results[].detail — but coordinator-quiet-tick.mjs emits ONLY
  // tick.summary, which is `key:status`, at :392 and in --json at :374/:388. DETAIL IS NEVER
  // PRINTED OR PERSISTED. So the tick still reads `drive-report-consume:ok fail=0` while this
  // instrument is dead.
  //
  // I FIXED THE WRITER AND NEVER CHECKED THE READER — the same class as writing a channel nobody
  // reads, one layer further in. Surfacing `detail` belongs to the tick, not to this consumer, and
  // the coordinator has taken that item; it is filed as a completion flag rather than patched here,
  // because a consumer reaching into a shared host file to make its own failures visible is how a
  // one-line fix becomes a fleet-wide behaviour change nobody reviewed.
  //
  // Until that lands, the ONLY durable evidence of a failure is the breadcrumb file below. Emitting
  // on stdout is still correct — it is what the host would surface once it surfaces anything.
  if (outcome && outcome.status === 'failed') {
    console.log(`FAILED ${outcome.reason || 'unknown'}`);
  }
  // EXIT 0 ON EVERY PATH — an observer that reports a failed TICK because it could not observe is
  // worse than useless. Genuine failures travel via the breadcrumb above, not via the exit code.
  return 0;
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  // SET exitCode, DO NOT CALL process.exit(). MEASURED: the explicit process.exit(0) this replaced
  // produced a DETERMINISTIC EXIT 127 on Windows — "Assertion failed:
  // !(handle->flags & UV_HANDLE_CLOSING), src\\win\\async.c" — because forcing exit races a
  // still-closing async handle. Reproduced 5/5 with a positive control. The core's logic was
  // already correct; only the exit code was wrong, and the exit code is what the host reads.
  main()
    .then((code) => { process.exitCode = code ?? 0; })
    .catch((e) => { console.error(`[drive-report-consume] fatal: ${e && e.message}`); process.exitCode = 0; });
}
