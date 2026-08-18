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
import { isMainModule } from '../../lib/utils/is-main-module.js';
import {
  evaluateCrackGateCriterion,
  fetchAllCrackGateObserveRows,
  fetchCrackGateSubstrateSignals,
} from '../../lib/eva/lifecycle/crack-gate-criterion.js';

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

/**
 * Fetches the MOST RECENT N observe-only rows (a sliding window), not the entire unbounded
 * history. ADVERSARIAL REVIEW FIX (PR2 deep-tier review): the original version fetched every
 * row ever written and required zero would_block across all of it, which is a "clean forever"
 * bar, not "N consecutive recent clean cycles" — since 151/152 ventures legitimately start
 * PBN_NOT_SCORED, the very first sweep cycle writes many would_block=true rows, and those rows
 * would never age out under an unbounded read, so the criterion could never clear even after
 * every underlying gap is fixed and new cycles are genuinely clean.
 */
async function fetchRecentObserveOnlyRows(supabase, limit) {
  const { data, error } = await supabase
    .from('system_events')
    .select('payload, created_at')
    .eq('event_type', 'VENTURE_CRACK_GATE_OBSERVE_ONLY')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingRelationError(error)) return { rows: null, sourceUnavailable: true };
    throw new Error(`system_events read failed: ${error.message}`);
  }
  return { rows: data || [], sourceUnavailable: false };
}

async function reportFleetSummary(supabase, asJson) {
  const { rows, sourceUnavailable } = await fetchRecentObserveOnlyRows(supabase, PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES);
  if (sourceUnavailable) {
    if (asJson) console.log(JSON.stringify({ status: 'SOURCE_UNAVAILABLE' }, null, 2));
    else console.log('Cannot determine: system_events is unreadable.');
    return 2;
  }

  // rows is already limited to PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES by the query itself.
  const wouldBlockInWindow = rows.filter((r) => r.payload?.would_block === true);
  const cleanRun = wouldBlockInWindow.length === 0 && rows.length >= PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES;

  // SD-LEO-INFRA-ARM-BINDING-EXIT-001 FR-1/FR-2/FR-3/FR-4: additive evidence-sufficiency
  // check over the TRUE unbounded observation history. Never replaces observations_in_window/
  // promotion_ready above -- the exit code below remains governed exclusively by cleanRun.
  const allRows = await fetchAllCrackGateObserveRows(supabase);
  const substrateSignals = await fetchCrackGateSubstrateSignals(supabase);
  const criterion = evaluateCrackGateCriterion(allRows, substrateSignals);

  const summary = {
    observations_in_window: rows.length,
    would_block_in_window: wouldBlockInWindow.length,
    promotion_criterion: `most recent ${PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES} observation(s), zero would_block — a sliding window, not the all-time total (old failures age out as new clean observations arrive)`,
    promotion_ready: cleanRun,
    total_observations_all_time: criterion.row_count,
    evidence_span_hours: Number(criterion.span_hours.toFixed(2)),
    source_breakdown: criterion.source_breakdown,
    crack_gate_evidence_criterion: { verdict: criterion.verdict, reason: criterion.reason },
  };

  if (asJson) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(`Observations in window: ${summary.observations_in_window}`);
    console.log(`Would-block in window: ${summary.would_block_in_window}`);
    console.log(`Promotion criterion: ${summary.promotion_criterion}`);
    console.log(`Promotion ready: ${summary.promotion_ready}`);
    console.log(`Total observations (all-time): ${summary.total_observations_all_time}`);
    console.log(`Evidence span (hours): ${summary.evidence_span_hours}`);
    console.log(`Source breakdown: ${JSON.stringify(summary.source_breakdown)}`);
    console.log(`Crack-gate evidence criterion: ${summary.crack_gate_evidence_criterion.verdict}${summary.crack_gate_evidence_criterion.reason ? ' (' + summary.crack_gate_evidence_criterion.reason + ')' : ''}`);
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

if (isMainModule(import.meta.url)) {
  main().then(({ exitCode }) => process.exit(exitCode));
}
