#!/usr/bin/env node
/**
 * Publish outcome observer — arms lib/marketing/observer/observe-outcome.js's
 * observeOutcome() on a registry-stamped cadence. Feeds the previously-unreachable
 * autonomy graduation rung: recordPublishOutcome()/evaluateGraduation()
 * (lib/marketing/autonomy-gate.js) had zero production callers before this SD.
 *
 * SD: SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001 (FR-4)
 *
 * NEVER called from publisher/index.js's publish() — self-reporting the outcome of a
 * post immediately after dispatching it is exactly the anti-pattern
 * venture_channel_publish_ledger exists to prevent (autonomy-gate.js's own docstring).
 * This script is the ONLY caller of recordPublishOutcome() in production.
 *
 * Usage:
 *   node scripts/cron/publish-outcome-observer.mjs --once
 *   node scripts/cron/publish-outcome-observer.mjs --once --dry-run
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { observeOutcome } from '../../lib/marketing/observer/observe-outcome.js';
import { recordPublishOutcome } from '../../lib/marketing/autonomy-gate.js';
import { registerArmedMachinery, armedProcessKey } from '../../lib/machinery-class/armed-registration.js';
import { stampLastFired } from '../../lib/periodic-liveness/stamp-last-fired.js';

export const SD_KEY = 'SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001';
export const ACTIVATION_TRIGGER = '.github/workflows/publish-outcome-observer-cron.yml';

// A row this old with no resolvable outcome yet is treated as a transient no-op each
// run (FR-7) -- there is no upper bound here that forces a terminal classification;
// unmeasurable/reverted/shipped_clean are only ever produced by observeOutcome's own
// real-state read, never by aging alone.
const DEFAULT_ROW_LIMIT = 200;

export function parseArgs(argv) {
  const args = { once: false, dryRun: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') args.once = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function buildSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

/** Ensure ARMED registration exists WITHOUT wiping last_fired_at on re-run. */
export async function ensureArmedRegistration(supabase, logger) {
  const processKey = armedProcessKey(SD_KEY);
  try {
    const { data } = await supabase
      .from('periodic_process_registry')
      .select('process_key')
      .eq('process_key', processKey)
      .maybeSingle();
    if (!data) {
      const reg = await registerArmedMachinery(supabase, { sd_key: SD_KEY }, {
        activationTrigger: ACTIVATION_TRIGGER,
        expectedIntervalSeconds: 30 * 60, // 30m cadence -- outcomes should surface reasonably promptly
        owner: 'publish-outcome-observer',
      });
      if (!reg.ok) logger.warn?.(`[publish-outcome-observer] ARMED registration failed (non-fatal): ${reg.error}`);
    }
  } catch (err) {
    logger.warn?.(`[publish-outcome-observer] ARMED registration check failed (non-fatal): ${err.message}`);
  }
  return processKey;
}

/**
 * One sweep cycle: select candidate ledger rows (outcome='unknown'), classify each via
 * observeOutcome(), and record the result via recordPublishOutcome() -- the only
 * production call site for both functions.
 */
export async function sweepOnce(supabase, { limit = DEFAULT_ROW_LIMIT, observeOutcomeFn = observeOutcome, recordPublishOutcomeFn = recordPublishOutcome } = {}) {
  // TESTING finding (EXEC phase, HIGH): rows_joined did not exist anywhere, and rows
  // classifying 'unknown' were counted nowhere -- a sweep where every lookup failed
  // transiently was indistinguishable from a healthy "nothing to do" run. rows_joined
  // tracks observeOutcome's own `joined` flag (the ledger-to-campaign_content join
  // succeeded, regardless of what happened after); rows_left_unknown tracks every row
  // that hit the 'unknown' continue path (transient lookup, unresolvable credential, or a
  // read error) so a stuck/never-progressing backlog is visible, not silent.
  const counters = { rows_selected: 0, rows_joined: 0, rows_left_unknown: 0, rows_unmeasurable: 0, rows_written: 0, rows_write_failed: 0, rows_write_failed_expected_pre_migration: 0 };

  // count-truncation-diff-lint requires a literal numeric bound directly on the select
  // chain (its chainWindow() scan looks for `.limit(N<1000)` as text on the chain itself
  // -- a downstream wrapper like warnIfCapTruncated() is invisible to it, confirmed the
  // hard way in scripts/one-off/insert-retro-sd-leo-infra-protocol-ssot-dedup-001.mjs's
  // own retro). 999 is this codebase's established convention for "safely under
  // PostgREST's 1000-row cap" (see e.g. lib/chairman/ratification-capture-detector.mjs,
  // scripts/cron/batch-mint-sweep.mjs). The caller-configurable READ-BUDGET throttle
  // (`limit`, default 200) is a rate-limit policy, not an anti-truncation bound, so it is
  // enforced below via slice() once the literal DB-level bound has already been read.
  const { data: rows, error } = await supabase
    .from('venture_channel_publish_ledger')
    .select('correlation_id')
    .eq('outcome', 'unknown')
    .eq('decision', 'accepted')
    // MEDIUM finding: oldest-first, so a backlog above `limit` doesn't starve the
    // longest-waiting rows behind a constant stream of newer ones.
    .order('created_at', { ascending: true })
    .limit(999);

  if (error) {
    throw new Error(`row selection failed: ${error.message}`);
  }

  // Defensive clamp: `limit` can be overridden by a caller (deps.sweepOptions.limit) with
  // no upstream validation -- a bad override (NaN, negative, zero, non-numeric) must never
  // silently process zero rows or otherwise misbehave; fall back to DEFAULT_ROW_LIMIT.
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : DEFAULT_ROW_LIMIT;
  const boundedRows = (rows || []).slice(0, safeLimit);

  counters.rows_selected = boundedRows.length;

  for (const row of boundedRows) {
    const classification = await observeOutcomeFn({ supabase, correlationId: row.correlation_id });

    if (classification.joined) {
      counters.rows_joined += 1;
    }

    if (classification.outcome === 'unknown') {
      // FR-7: transient or genuinely unresolved -- leave the row alone, re-attempted
      // next run. Never a write, never counted as failed, but now visibly tallied.
      counters.rows_left_unknown += 1;
      continue;
    }
    if (classification.outcome === 'unmeasurable') {
      counters.rows_unmeasurable += 1;
    }

    const recorded = await recordPublishOutcomeFn({
      supabase,
      correlationId: row.correlation_id,
      outcome: classification.outcome,
      outcomeRef: classification.outcomeRef,
    });

    if (recorded.success) {
      counters.rows_written += 1;
    } else if (recorded.reason === 'expected-pre-migration') {
      // TR-9: a 23514 on an 'unmeasurable' write means the SQL migration hasn't landed
      // yet -- EXPECTED, reported SEPARATELY from a genuine failure per FR-4, never
      // conflated with rows_unmeasurable (a classification-only count) as if it wrote.
      counters.rows_write_failed_expected_pre_migration += 1;
    } else {
      counters.rows_write_failed += 1;
    }
  }

  return counters;
}

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('publish-outcome-observer --once [--dry-run]');
    return { exitCode: 0, action: 'help' };
  }

  const logger = deps.logger || console;
  let supabase;
  try { supabase = deps.supabase || buildSupabase(); }
  catch (err) {
    logger.error?.(`[publish-outcome-observer] supabase client unavailable: ${err.message}`);
    return { exitCode: 2, action: 'no_supabase' };
  }

  if (args.dryRun) {
    logger.log?.('[publish-outcome-observer] dry-run -- skipping registration, sweep, and liveness stamp');
    return { exitCode: 0, action: 'dry_run' };
  }

  const processKey = await (deps.ensureArmedRegistration || ensureArmedRegistration)(supabase, logger);

  let summary;
  try {
    summary = await (deps.sweepOnce || sweepOnce)(supabase, deps.sweepOptions);
  } catch (err) {
    logger.error?.(`[publish-outcome-observer] sweep failed: ${err.message}`);
    // Liveness is only stamped on a genuinely successful cycle.
    return { exitCode: 1, action: 'sweep_error', error: err.message };
  }

  try {
    await (deps.stampLastFired || stampLastFired)(supabase, processKey);
  } catch (err) {
    logger.warn?.(`[publish-outcome-observer] liveness stamp failed (non-fatal): ${err.message}`);
  }

  const result = { ts: new Date().toISOString(), ...summary };
  logger.log?.(`[publish-outcome-observer] ${JSON.stringify(result)}`);
  return { exitCode: 0, action: 'swept', summary: result };
}

/** Windows-safe termination (mirrors scripts/cron/venture-ops-actuals-sweep.mjs). */
export async function gracefulExit(exitCode, { backstopMs = 4000 } = {}) {
  process.exitCode = exitCode;
  try {
    const undici = await import('undici');
    await undici.getGlobalDispatcher?.()?.close?.();
  } catch { /* undici absent -- natural drain still applies */ }
  setTimeout(() => process.exit(exitCode), backstopMs).unref();
}

if (isMainModule(import.meta.url)) {
  main().then(({ exitCode }) => gracefulExit(exitCode))
        .catch((err) => { console.error('publish-outcome-observer fatal:', err.message); return gracefulExit(2); });
}
