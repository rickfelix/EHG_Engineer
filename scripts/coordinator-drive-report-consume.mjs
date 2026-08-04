#!/usr/bin/env node
/**
 * Coordinator consumer for the Drive Report instrument.
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-C — FR-2..FR-5.
 *
 * Stamps a coordinator-lane consumption receipt on the newest drive report, so a starving binding
 * is visible as a FACT IN THE ARTIFACT rather than as an absence nobody queries.
 *
 * ─── WHY THIS LIVES IN COMPOSED_CORES AND NOT IN lib/checkin/steps/ ────────────────────────────
 * The original ruling placed it in the check-in pipeline. Two measurements reversed that:
 *   1. lib/checkin/steps/index.cjs registers build-forbidden-guard at slot 7, which short-circuits
 *      any is_coordinator session to action:'idle'. A coordinator-gated step at or after that slot
 *      can NEVER execute for a coordinator — while passing every unit test AND a hand-run demo.
 *   2. Decisively: THE COORDINATOR NEVER RUNS /checkin AT ALL. coordinator.md is 821 lines with
 *      zero occurrences; roll-call.cjs writes a roll_call row unconditionally, yet the live
 *      is_coordinator session has hundreds of coordination rows and ZERO roll_call.
 * A consumer that never runs is indistinguishable from a producer that never produced — so the
 * instrument would have reported PRODUCER STALLED about its own miswiring. This host runs on the
 * coordinator's own tick.
 *
 * ─── NO COORDINATOR PREDICATE IN THIS FILE. THAT IS DELIBERATE. ────────────────────────────────
 * COMPOSED_CORES runs only on the coordinator's quiet tick, so this module is STRUCTURALLY
 * coordinator-only. A coordinator check here would be a branch that is always true, and a branch
 * that is always true reads to a later maintainer like a real condition guarding something. Do not
 * add one "for safety" — it would guard nothing and mislead everyone.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const require_ = createRequire(import.meta.url);
const { DRIVE_REPORT_LANES } = require_('../lib/drive-loop/lanes.cjs');

/** Bound so a black-holed write cannot stall the coordinator tick (precedent: receipt-ledger). */
export const WRITE_TIMEOUT_MS = 2000;

/**
 * Resolve the actor whose id goes on the receipt.
 *
 * PRECEDENCE IS LOAD-BEARING: the env var is the seat ACTUALLY EXECUTING; the DB pointer is the
 * seat BELIEVED to be coordinating. When they disagree, an instrument measuring EXECUTION must
 * record the executing seat — otherwise the receipt asserts something nobody verified.
 *
 * Exported so the precedence itself is testable rather than buried in main().
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

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}: timed out after ${ms}ms`)), ms).unref?.()),
  ]);
}

/**
 * Consume the newest drive report for the coordinator lane.
 *
 * RETURNS FALSY ON EVERY PATH. In the check-in pipeline a truthy return is control flow — one core
 * returning truthy there once suppressed every self-claim tier below it and hid 151 open QFs and
 * 38 draft SDs for ~17.5h. THIS host (runCoresFailSoft) does NOT short-circuit and cores are
 * execFile'd children, so the return never crosses the process boundary: the falsy return here is
 * CHEAP INSURANCE against a future re-host, NOT protection of this one. The invariant this host
 * actually reads is the EXIT CODE — see main().
 *
 * @param {object} supabase service-role client (INJECTED — never constructed at module level, or
 *        every mutant becomes unreachable except by source regex)
 * @param {{nowMs?: number, sessionId?: string|null, logger?: object}} opts
 * @returns {Promise<undefined>}
 */
export async function runDriveReportConsumeCore(supabase, { nowMs = undefined, sessionId = null, logger = console } = {}) {
  const lane = DRIVE_REPORT_LANES.COORDINATOR;
  try {
    if (!sessionId) {
      logger.log('[drive-report-consume] no actor session id resolved — nothing stamped');
      return undefined;
    }

    const { data: rows, error: readErr } = await withTimeout(
      supabase.from('drive_reports')
        .select('id, consumption_receipts')
        .order('generated_at', { ascending: false })
        .limit(1),
      WRITE_TIMEOUT_MS, 'drive_reports read');

    // FAIL-SOFT. The producer (sibling -B) may not have landed its migration yet, so an absent
    // table is an EXPECTED state, not an error worth halting a tick for.
    if (readErr) {
      logger.error(`[drive-report-consume] read failed (${readErr.message}) — no-op`);
      return undefined;
    }
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) {
      logger.log('[drive-report-consume] no drive report to consume');
      return undefined;
    }

    const receipts = (row.consumption_receipts && typeof row.consumption_receipts === 'object' && !Array.isArray(row.consumption_receipts))
      ? row.consumption_receipts
      : {};

    // IDEMPOTENCY: already consumed by this lane => leave the existing timestamp untouched.
    if (receipts[lane]) {
      logger.log(`[drive-report-consume] report ${row.id} already consumed by lane '${lane}' — not re-stamping`);
      return undefined;
    }

    // READ-MERGE-WRITE, AND IT IS REQUIRED RATHER THAN MERELY CONVENIENT: PostgREST cannot express
    // jsonb_set, so updating this column REPLACES IT WHOLE. Writing { [lane]: … } alone would
    // DESTROY the adam and chairman-brief lanes that sibling -D adds. Spreading the lanes we read
    // is what preserves them.
    const merged = { ...receipts, [lane]: { actor: sessionId, at: new Date(nowMs ?? Date.now()).toISOString() } };

    // CONDITIONAL UPDATE + ROW-COUNT CHECK (precedent: sms-outbound-worker). The .is() predicate is
    // what makes the merge safe against a concurrent lane write: if another consumer stamped this
    // lane between our read and our write, the predicate no longer matches, zero rows come back,
    // and we leave their receipt alone instead of clobbering it with our stale merge.
    const { data: updated, error: writeErr } = await withTimeout(
      supabase.from('drive_reports')
        .update({ consumption_receipts: merged })
        .eq('id', row.id)
        .is(`consumption_receipts->${lane}`, null)
        .select('id'),
      WRITE_TIMEOUT_MS, 'drive_reports receipt write');

    if (writeErr) {
      logger.error(`[drive-report-consume] receipt write failed (${writeErr.message}) — no-op`);
      return undefined;
    }
    if (!updated || updated.length === 0) {
      logger.log(`[drive-report-consume] report ${row.id} was consumed concurrently — left as-is`);
      return undefined;
    }
    logger.log(`[drive-report-consume] stamped lane '${lane}' on report ${row.id} as ${sessionId}`);
    return undefined;
  } catch (e) {
    // The instrument is an OBSERVER. It must never take the coordinator tick down.
    logger.error(`[drive-report-consume] unexpected failure (${e && e.message}) — no-op`);
    return undefined;
  }
}

export async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const { getActiveCoordinatorId } = require_('../lib/coordinator/resolve.cjs');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
  const sessionId = await resolveActorSessionId({ resolveCoordinatorId: () => getActiveCoordinatorId(supabase) });
  await runDriveReportConsumeCore(supabase, { sessionId });
  // EXIT 0 ON EVERY PATH — this is the invariant the host actually reads. runCoresFailSoft treats a
  // non-zero child as a failed core; an observer that reports a tick failure because it had nothing
  // to observe would be worse than useless.
  return 0;
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  main()
    .then((code) => process.exit(code ?? 0))
    .catch((e) => { console.error(`[drive-report-consume] fatal (${e && e.message})`); process.exit(0); });
}
