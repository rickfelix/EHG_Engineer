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
  const counters = { rows_selected: 0, rows_unmeasurable: 0, rows_written: 0, rows_write_failed: 0 };

  const { data: rows, error } = await supabase
    .from('venture_channel_publish_ledger')
    .select('correlation_id')
    .eq('outcome', 'unknown')
    .eq('decision', 'accepted')
    .limit(limit);

  if (error) {
    throw new Error(`row selection failed: ${error.message}`);
  }

  counters.rows_selected = (rows || []).length;

  for (const row of rows || []) {
    const classification = await observeOutcomeFn({ supabase, correlationId: row.correlation_id });

    if (classification.outcome === 'unknown') {
      // FR-7: transient or genuinely unresolved -- leave the row alone, re-attempted
      // next run. Never a write, never counted as failed.
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
    } else {
      // TR-9: a 23514 on an 'unmeasurable' write means the SQL migration hasn't landed
      // yet -- EXPECTED, never conflated with a genuine failure, and never silently
      // absorbed into rows_unmeasurable (a classification-only count) as if it wrote.
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
