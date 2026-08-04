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
 * Resolve the actor whose id goes on the receipt.
 *
 * PRECEDENCE IS LOAD-BEARING: the env var is the seat ACTUALLY EXECUTING; the DB pointer is the
 * seat BELIEVED to be coordinating. For an instrument measuring EXECUTION, the executing seat is
 * the truth — otherwise the receipt asserts something nobody verified.
 */
export async function resolveActorSessionId({ env = process.env, resolveCoordinatorId } = {}) {
  const fromEnv = env.CLAUDE_SESSION_ID;
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
  if (typeof resolveCoordinatorId === 'function') {
    try {
      const fallback = await resolveCoordinatorId();
      if (typeof fallback === 'string' && fallback.trim()) return fallback.trim();
    } catch { /* fail-soft: an unresolvable actor is a no-op, never a throw */ }
  }
  return null;
}

/**
 * Is the executing seat actually the coordinator?
 *
 * THIS EXISTS BECAUSE THE "STRUCTURALLY COORDINATOR-ONLY" PREMISE WAS FALSE. The first version had
 * no such check, justified by the host being coordinator-only. A security review disproved it in
 * one command: the script has an isMainModule entry, a .env carrying the service-role key sits in
 * every worktree, coordinator-quiet-tick.mjs carries no is_coordinator guard either, and the review
 * ran this script from a WORKER seat — and again with a FORGED CLAUDE_SESSION_ID — to exit 0 with
 * no complaint. Because the first receipt for a lane wins, ONE INCIDENTAL RUN PERMANENTLY MAKES A
 * STARVING BINDING READ AS FED. It was unexploitable only because the table did not exist yet:
 * safety by coincidence, which is not safety.
 *
 * Compares the EXECUTING session to the elected coordinator. Fails CLOSED — an unresolvable
 * coordinator means we do not write.
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
 * or the host reports a failed tick for a reason it cannot show. So an always-0 exit plus a
 * status-only summary means A GENUINE WRITE FAILURE WOULD BE COMPLETELY UNOBSERVABLE. This
 * breadcrumb is the channel: written on failure, REMOVED on success, so its mere existence is the
 * signal and a stale one cannot accumulate.
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

export async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const { getActiveCoordinatorId } = require_('../lib/coordinator/resolve.cjs');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
  let coordinatorId = null;
  try { coordinatorId = await getActiveCoordinatorId(supabase); } catch { /* fail closed below */ }

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
  const sessionId = typeof process.env.CLAUDE_SESSION_ID === 'string' && process.env.CLAUDE_SESSION_ID.trim()
    ? process.env.CLAUDE_SESSION_ID.trim()
    : null;
  const outcome = await runDriveReportConsumeCore(supabase, { sessionId, coordinatorId });
  recordOutcome(outcome);

  // THE STATUS MUST GO TO STDOUT OR IT IS NOT A CHANNEL AT ALL.
  // scriptCore reads ONLY STDOUT and defaults to the literal 'ok' when it is empty. Every failure
  // above goes to console.ERROR, so the previous version printed `drive-report-consume:ok` on the
  // tick EXACTLY WHEN THE INSTRUMENT WAS DEAD — this SD's own target defect, reproduced one level
  // up, for the second time in this SD. Measured: stdout was empty on the failing path.
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
