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
    // multiple runs rather than needing an unbounded read here.
    const HELD_ROWS_BATCH_LIMIT = 200;
    const { data: heldRows, error } = await supabase
      .from('chairman_held_sends')
      .select('*')
      .eq('status', 'held')
      .order('held_at', { ascending: true })
      .limit(HELD_ROWS_BATCH_LIMIT);
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
    // Per-row try/catch (NOT one try/catch around the whole loop): a single row whose
    // releaseHeldSend call throws for an unanticipated reason must not abort every other row in
    // the same sweep -- one poison row silently blocking the entire batch was flagged as an
    // amplifier of the dispatch-throw risk this module's own try/catch already guards against.
    for (const row of heldRows || []) {
      try {
        const outcome = await releaseHeldSend(supabase, row, deps.releaseDeps || {});
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

    logger.log?.(`[chairman-held-sends-release] ${JSON.stringify({
      ts: new Date().toISOString(), ok: true,
      checked: (heldRows || []).length, released, refused, held_still: heldStill, skipped, audit_write_failed: auditWriteFailed, row_errors: rowErrors, stranded_in_releasing: strandedInReleasing,
    })}`);
    return { exitCode: EXIT_OK, summary: { checked: (heldRows || []).length, released, refused, heldStill, skipped, auditWriteFailed, rowErrors, strandedInReleasing, outcomes } };
  } catch (err) {
    logger.log?.(`[chairman-held-sends-release] ${JSON.stringify({ ts: new Date().toISOString(), ok: false, reason: 'infra', error: String(err && err.message).slice(0, 200) })}`);
    return { exitCode: EXIT_INFRA, summary: { error: err.message } };
  }
}

if (isMainModule(import.meta.url)) {
  const { exitCode } = await main();
  process.exit(exitCode);
}
