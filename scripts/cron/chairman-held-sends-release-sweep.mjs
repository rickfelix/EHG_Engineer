#!/usr/bin/env node
/**
 * Chairman held-send release sweep — SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 (FR-1 release path).
 *
 * Mirrors scripts/cron/adam-late-verdict-reconcile-sweep.mjs's durability rationale: a Solomon
 * verdict can land long after the session that requested it has ended, so reconciliation must run
 * as a durable cron, not only inside a live Adam session. Reuses lib/adam/chairman-held-send-release.js
 * (which itself reuses lib/coordinator/reply-class.cjs resolveAnswerRows() — no new verdict lookup
 * is built here or there).
 *
 * Exit codes: 0 = ran clean (0 released is a normal, healthy outcome). 1 = INFRA failure.
 */
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const EXIT_OK = 0;
const EXIT_INFRA = 1;

function buildSupabase(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  return createClient(url, key);
}

/**
 * SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-6) — JS-based orphan detector, DELIBERATELY not a
 * SQL view: the existing public.v_chairman_held_sends_unreconcilable view is db-tier-only (no
 * unit-tier equivalent) and, per its own definition, is scoped to consult_correlation_id IS NULL
 * or a row past hold_expires_at — it is structurally BLIND for a row's first 24h. This detector
 * covers the gap the view cannot see: rows that carry a correlation id (so the view considers them
 * fine) but are still stuck for a reason the view was never built to check.
 *
 * Pure function — no I/O — so it is fully unit-testable without a database. Takes the rows already
 * fetched by the caller (status IN ('held','releasing')), never queries itself.
 *
 * @param {Array<object>} rows - chairman_held_sends rows (id, decision_id, status, attempts,
 *   consult_row_id, claimed_at)
 * @param {object} [opts]
 * @param {number} [opts.now] - injected clock (epoch ms), for deterministic tests
 * @param {number} [opts.staleReleasingMs] - how long a row may sit in status='releasing' before
 *   it counts as stuck (default: 15 min, matching this sweep's own cron cadence — a row still
 *   'releasing' one full cadence later was never re-claimed by anything)
 * @returns {Array<{id:string, decisionId:string|null, reasons:string[]}>}
 */
export function detectOrphanedHeldSends(rows, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const staleReleasingMs = Number.isInteger(opts.staleReleasingMs) ? opts.staleReleasingMs : 15 * 60 * 1000;
  const orphans = [];
  for (const row of rows || []) {
    const reasons = [];
    // consult_row_id IS NULL: distinct from the view's consult_correlation_id-null check — a row
    // can carry a correlation id (so the pre-send consult DID run) while its readback-verify
    // insert (FR-1) never confirmed, leaving nothing to cross-check the correlation against.
    if (row.status === 'held' && row.consult_correlation_id != null && row.consult_row_id == null) {
      reasons.push('no_consult_row_id');
    }
    // attempts > 0 while still held: this row has already been claimed, dispatched, and unclaimed
    // back at least once — a live retry loop that keeps failing, not a fresh hold.
    if (row.status === 'held' && Number.isInteger(row.attempts) && row.attempts > 0) {
      reasons.push('retried_and_still_held');
    }
    // Stuck in 'releasing': the main claim-and-dispatch loop only ever reads status='held', so a
    // row a prior run left claimed but never unclaimed (an unclaim write that itself failed, or a
    // process that died mid-dispatch) is invisible to every later run — it can ONLY be found by a
    // scan like this one that also reads 'releasing'.
    if (row.status === 'releasing') {
      const claimedAtMs = row.claimed_at ? new Date(row.claimed_at).getTime() : NaN;
      if (!Number.isFinite(claimedAtMs) || (now - claimedAtMs) > staleReleasingMs) {
        reasons.push('stuck_in_releasing');
      }
    }
    if (reasons.length > 0) orphans.push({ id: row.id, decisionId: row.decision_id ?? null, reasons });
  }
  return orphans;
}

/**
 * Dependency-injected entrypoint: deps.{logger, env, supabase, releaseHeldSend} so the sweep is
 * unit-testable with a fake supabase and a stubbed release function.
 */
export async function main(argv = process.argv, deps = {}) {
  const logger = deps.logger || console;
  const env = deps.env || process.env;

  let supabase;
  try {
    supabase = deps.supabase || buildSupabase(env);
  } catch (err) {
    logger.log?.(`[chairman-held-sends-release] ${JSON.stringify({ ts: new Date().toISOString(), ok: false, reason: 'infra', error: err.message })}`);
    return { exitCode: EXIT_INFRA, summary: { error: err.message } };
  }

  try {
    const releaseHeldSend = deps.releaseHeldSend
      || (await import('../../lib/adam/chairman-held-send-release.js')).releaseHeldSend;

    // Bounded batch per sweep run (matches this repo's convention for operational sweeps) -- a
    // 15-minute cadence and per-row retry-via-attempts means an oversized backlog drains across
    // multiple runs rather than needing an unbounded read here. Literal (not a named constant):
    // count-truncation-diff-lint's classifier only recognizes a numeric literal inside limit(...).
    const { data: heldRows, error } = await supabase
      .from('chairman_held_sends')
      .select('*')
      .eq('status', 'held')
      .order('held_at', { ascending: true })
      .limit(200);
    if (error) {
      // database/migrations/20260824_chairman_held_sends.sql is @chairman-gated (requires the
      // chairman's own approval to apply -- EXEC cannot self-approve it). Until it lands, this
      // table genuinely does not exist, and that is an EXPECTED, non-alarming state, not an INFRA
      // failure -- exiting 1 here every 15 minutes until the chairman applies the migration would
      // be pure CI noise on a schedule nobody can act on. Detected by PostgREST's own "table not
      // found in schema cache" wording (matches the sibling pattern already seen live in this repo
      // for other unapplied/renamed tables), scoped narrowly so any OTHER read failure (RLS denial,
      // network error, genuine schema drift) still reports EXIT_INFRA as before.
      const tableMissing = /schema cache|does not exist/i.test(String(error.message || ''));
      if (tableMissing) {
        logger.log?.(`[chairman-held-sends-release] ${JSON.stringify({ ts: new Date().toISOString(), ok: true, reason: 'table_not_yet_applied', error: error.message })}`);
        return { exitCode: EXIT_OK, summary: { checked: 0, released: 0, refused: 0, heldStill: 0, skipped: 0, auditWriteFailed: 0, rowErrors: 0, strandedInReleasing: 0, tableApplied: false } };
      }
      logger.log?.(`[chairman-held-sends-release] ${JSON.stringify({ ts: new Date().toISOString(), ok: false, reason: 'read_failed', error: error.message })}`);
      return { exitCode: EXIT_INFRA, summary: { error: error.message } };
    }

    let released = 0, refused = 0, heldStill = 0, skipped = 0, auditWriteFailed = 0, rowErrors = 0, strandedInReleasing = 0;
    const outcomes = [];
    // SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-2): default context.now to a real clock, same
    // precedent as lib/chairman/record-pending-decision.mjs:232 (QF-20260727-589) — without it
    // etHour() (rubric-engine/lint.js) has no clock and every re-evaluated rubric throws
    // gate_unavailable. MERGED, never default-only: deps.releaseDeps.context (if the caller
    // supplied one, e.g. a test injecting a fixed epoch) always wins over this default, and
    // every other releaseDeps key (resolveVerifiedAnswer, sendChairmanSMS, sendOpts, claimedBy)
    // passes through unchanged — the existing sweep test that passes releaseDeps:{} explicitly
    // must keep working byte-identically apart from gaining this default clock.
    const baseReleaseDeps = deps.releaseDeps || {};
    const releaseDeps = { ...baseReleaseDeps, context: { now: Date.now(), ...(baseReleaseDeps.context || {}) } };
    // Per-row try/catch (NOT one try/catch around the whole loop): a single row whose
    // releaseHeldSend call throws for an unanticipated reason must not abort every other row in
    // the same sweep -- one poison row silently blocking the entire batch was flagged as an
    // amplifier of the dispatch-throw risk this module's own try/catch already guards against.
    for (const row of heldRows || []) {
      try {
        const outcome = await releaseHeldSend(supabase, row, releaseDeps);
        outcomes.push({ id: row.id, action: outcome.action, reason: outcome.reason });
        // A failed unclaim (0-row match or a write error) means the row is STILL status='releasing'
        // despite the dispatch not having succeeded -- not genuinely back in the held pool, so it
        // must not be silently folded into heldStill (SECURITY sub-agent finding S-8).
        if ((outcome.action === 'dispatch_not_sent_unclaimed' || outcome.action === 'dispatch_threw_unclaimed') && outcome.unclaimError) {
          strandedInReleasing += 1;
        } else if (outcome.action === 'released') released += 1;
        else if (outcome.action === 'refuse') refused += 1;
        else if (outcome.action === 'hold' || outcome.action === 'dispatch_not_sent_unclaimed' || outcome.action === 'dispatch_threw_unclaimed') heldStill += 1;
        else if (outcome.action === 'released_but_audit_write_failed') { released += 1; auditWriteFailed += 1; }
        else skipped += 1;
      } catch (err) {
        rowErrors += 1;
        outcomes.push({ id: row.id, action: 'row_error', error: String(err && err.message).slice(0, 200) });
      }
    }

    // SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-6): broader read for orphan detection ONLY,
    // covering status='releasing' too — deliberately SEPARATE from the held-only claimable read
    // above, since a 'releasing' row must never enter the claim-and-dispatch loop (it would race
    // whatever process already claimed it). Best-effort: a failure here must never fail the sweep
    // that already ran successfully above.
    let orphans = [];
    try {
      const { data: orphanScanRows, error: orphanScanError } = await supabase
        .from('chairman_held_sends')
        .select('id, decision_id, status, attempts, consult_correlation_id, consult_row_id, claimed_at')
        .in('status', ['held', 'releasing'])
        .limit(500);
      if (!orphanScanError) orphans = detectOrphanedHeldSends(orphanScanRows || []);
    } catch (err) {
      logger.log?.(`[chairman-held-sends-release] ${JSON.stringify({ ts: new Date().toISOString(), ok: true, reason: 'orphan_scan_skipped', error: String(err && err.message) })}`);
    }
    if (orphans.length > 0) {
      logger.log?.(`[chairman-held-sends-release] ${JSON.stringify({ ts: new Date().toISOString(), ok: true, orphans_detected: orphans.length, orphans })}`);
    }

    logger.log?.(`[chairman-held-sends-release] ${JSON.stringify({
      ts: new Date().toISOString(), ok: true,
      checked: (heldRows || []).length, released, refused, held_still: heldStill, skipped, audit_write_failed: auditWriteFailed, row_errors: rowErrors, stranded_in_releasing: strandedInReleasing,
    })}`);
    return { exitCode: EXIT_OK, summary: { checked: (heldRows || []).length, released, refused, heldStill, skipped, auditWriteFailed, rowErrors, strandedInReleasing, outcomes, orphans } };
  } catch (err) {
    logger.log?.(`[chairman-held-sends-release] ${JSON.stringify({ ts: new Date().toISOString(), ok: false, reason: 'infra', error: String(err && err.message).slice(0, 200) })}`);
    return { exitCode: EXIT_INFRA, summary: { error: err.message } };
  }
}

if (isMainModule(import.meta.url)) {
  const { exitCode } = await main();
  process.exit(exitCode);
}
