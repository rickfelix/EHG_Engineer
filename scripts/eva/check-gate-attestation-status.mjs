#!/usr/bin/env node
/**
 * Report crack-gate status — SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-8.
 *
 * node scripts/eva/check-gate-attestation-status.mjs <venture-id> [--json]
 * node scripts/eva/check-gate-attestation-status.mjs --fleet-summary [--json]
 *
 * Exit codes: 0 = MEETS_CRITERION (single-venture) / promotion criteria met (fleet-summary),
 * 1 = NOT_MET / criteria not yet met, 2 = could not determine (e.g. attestations table not yet
 * applied). This repo's existing check-bind-criteria.mjs CLI has the known flaw of exiting 0 on
 * a FAIL verdict (only exiting 1 on script error) — this CLI does not repeat that.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { evaluateCrackGateStatus } from '../../lib/eva/lifecycle/crack-gate-evaluator.js';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

// FR-9's documented promotion criterion (mirrors bind-criterion-checker.js's MIN_ROWS/
// MIN_SPAN_HOURS shape) — see docs/reference/venture-gate-attestations-guide.md for the
// full rationale. Kept here as the single source of truth the CLI measures against.
export const PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES = 5;

function isMissingRelationError(error) {
  const code = error?.code || '';
  const message = String(error?.message || '');
  return code === 'PGRST205' || code === '42P01' || /schema cache/i.test(message);
}

async function reportSingleVenture(supabase, ventureId, asJson) {
  const verdict = await evaluateCrackGateStatus(supabase, ventureId);
  const sourceUnavailable = [verdict.pbn.status, verdict.stage17_judgment.verdict, verdict.chairman_site_review.verdict]
    .some((v) => v === 'PBN_SOURCE_UNAVAILABLE' || v === 'ATTESTATION_SOURCE_UNAVAILABLE');

  if (asJson) {
    console.log(JSON.stringify(verdict, null, 2));
  } else {
    console.log(`Venture: ${ventureId}`);
    console.log(`  PBN:                  ${verdict.pbn.status} / ${verdict.pbn.verdict ?? 'n/a'} (${verdict.pbn.reason})`);
    console.log(`  Stage-17 judgment:    ${verdict.stage17_judgment.verdict} (${verdict.stage17_judgment.reason})`);
    console.log(`  Chairman site review: ${verdict.chairman_site_review.verdict} (${verdict.chairman_site_review.reason})`);
    console.log(`  Overall: ${verdict.overall}`);
  }

  if (sourceUnavailable && verdict.overall !== 'MEETS_CRITERION') return 2;
  return verdict.overall === 'MEETS_CRITERION' ? 0 : 1;
}

/** Fetches all observe-only rows this SD's two enforcement layers have written. */
async function fetchObserveOnlyRows(supabase) {
  try {
    const rows = await fetchAllPaginated(() => supabase.from('system_events').select('payload, created_at').eq('event_type', 'VENTURE_CRACK_GATE_OBSERVE_ONLY').order('created_at', { ascending: false }));
    return { rows, sourceUnavailable: false };
  } catch (err) {
    if (isMissingRelationError(err)) return { rows: null, sourceUnavailable: true };
    throw new Error(`system_events read failed: ${err.message}`);
  }
}

async function reportFleetSummary(supabase, asJson) {
  const { rows, sourceUnavailable } = await fetchObserveOnlyRows(supabase);
  if (sourceUnavailable) {
    if (asJson) console.log(JSON.stringify({ status: 'SOURCE_UNAVAILABLE' }, null, 2));
    else console.log('Cannot determine: system_events is unreadable.');
    return 2;
  }

  const wouldBlockRows = rows.filter((r) => r.payload?.would_block === true);
  const cleanRun = wouldBlockRows.length === 0 && rows.length >= PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES;

  const summary = {
    total_observations: rows.length,
    would_block_count: wouldBlockRows.length,
    promotion_criterion: `${PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES}+ observations, zero would_block`,
    promotion_ready: cleanRun,
  };

  if (asJson) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(`Total observe-only rows: ${summary.total_observations}`);
    console.log(`Would-block rows: ${summary.would_block_count}`);
    console.log(`Promotion criterion: ${summary.promotion_criterion}`);
    console.log(`Promotion ready: ${summary.promotion_ready}`);
  }

  return cleanRun ? 0 : 1;
}

export async function main(argv = process.argv, deps = {}) {
  const asJson = argv.includes('--json');
  const fleetSummary = argv.includes('--fleet-summary');
  const ventureId = argv.slice(2).find((a) => !a.startsWith('--'));

  if (!fleetSummary && !ventureId) {
    console.error('Usage: check-gate-attestation-status.mjs <venture-id> [--json] | --fleet-summary [--json]');
    return { exitCode: 1 };
  }

  const supabase = deps.supabase || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  try {
    const exitCode = fleetSummary ? await reportFleetSummary(supabase, asJson) : await reportSingleVenture(supabase, ventureId, asJson);
    return { exitCode };
  } catch (err) {
    console.error('ERROR:', err.message);
    return { exitCode: 2 };
  }
}

const isMain = !!process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  main().then(({ exitCode }) => process.exit(exitCode));
}
