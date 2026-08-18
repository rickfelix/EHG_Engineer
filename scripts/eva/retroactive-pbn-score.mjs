#!/usr/bin/env node
/**
 * Retroactive PBN scorer — SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-6.
 *
 * Scores a venture that predates the PBN gate (nursery -> Stage-0 only) and writes the
 * resulting verdict into ventures.metadata.stage_zero.pbn_verdict via a nested jsonb_set,
 * never a shallow spread of the top-level metadata object — a real deployed venture's
 * metadata carries other load-bearing content (chairman_approval, pause_provenance,
 * awaiting_chairman_decision, ...) that a shallow write would destroy.
 *
 * UUID-ONLY BY DESIGN: this repo's live data has two ventures literally named "MarketLens",
 * so there is deliberately no name-based lookup path — --venture-id is required and is
 * matched against ventures.id, never ventures.name.
 *
 * Operational note: originally shipped manual-only (a human decides which venture to score).
 * SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-1 now ALSO calls retroactivelyScoreVenture()
 * automatically, once per venture per cron cycle, from scripts/cron/venture-ops-actuals-sweep.mjs
 * Job 5 -- the CLI below remains available for a one-off targeted run.
 *
 * Usage:
 *   node scripts/eva/retroactive-pbn-score.mjs --venture-id <uuid> [--dry-run]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { scorePbnBuckets } from '../../lib/eva/stage-zero/pbn-scoring.js';
import { buildPbnVerdict } from '../../lib/eva/stage-zero/pbn-gate.js';
import { sanitizePbnVerdictForPersistence } from '../../lib/eva/stage-zero/pbn-integration.js';
import { parseFlags } from '../../lib/eva/lifecycle/cli-flag-parser.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

// ADVERSARIAL REVIEW FIX (PR2 deep-tier review): the original version hand-rolled
// `argv[++i]` here — the exact "a flag value can itself be another flag" bug class
// lib/eva/lifecycle/cli-flag-parser.js (this same SD, PR1) exists specifically to eliminate,
// reintroduced unused-but-untested in this script. Reuse the shared parser instead.
export function parseArgs(argv) {
  const args = { ventureId: null, dryRun: false, help: false };
  const { values, error } = parseFlags(argv, ['--venture-id']);
  if (error) { args.help = true; args.parseError = error; return args; }
  args.ventureId = values['--venture-id'] || null;
  args.dryRun = argv.includes('--dry-run');
  args.help = argv.includes('--help') || argv.includes('-h');
  return args;
}

/** Builds a pbn-scoring.js-shaped brief from a live venture row's existing fields/metadata. */
export function buildBriefFromVenture(venture) {
  return {
    name: venture.name,
    problem_statement: venture.description || null,
    solution: venture.metadata?.stage_zero?.solution || null,
    target_market: venture.metadata?.stage_zero?.target_market || null,
    thesis: venture.metadata?.thesis || null,
  };
}

/**
 * Fetches the venture (by UUID, never by name), scores it, and writes the verdict via a
 * nested jsonb_set RPC so pre-existing metadata.stage_zero keys are never touched.
 * @param {object} supabase
 * @param {string} ventureId
 * @param {object} [deps] - deps.scorePbnBuckets / deps.buildPbnVerdict for test injection
 */
export async function retroactivelyScoreVenture(supabase, ventureId, deps = {}) {
  if (typeof ventureId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ventureId)) {
    throw new Error('retroactivelyScoreVenture requires a UUID --venture-id; name-based lookup is deliberately not supported (two live ventures share the name "MarketLens")');
  }

  const { data: venture, error: fetchError } = await supabase
    .from('ventures')
    .select('id, name, description, metadata')
    .eq('id', ventureId)
    .maybeSingle();
  if (fetchError) throw new Error(`ventures fetch failed: ${fetchError.message}`);
  if (!venture) throw new Error(`no venture found for id ${ventureId}`);

  const existingVerdict = venture.metadata?.stage_zero?.pbn_verdict;
  if (existingVerdict) {
    return { skipped: true, reason: 'pbn_verdict_already_present', ventureId, existingVerdict };
  }

  const brief = buildBriefFromVenture(venture);
  const buckets = await (deps.scorePbnBuckets || scorePbnBuckets)(brief);
  const rawVerdict = (deps.buildPbnVerdict || buildPbnVerdict)(buckets, { sourceRef: { retroactive: true, scored_at: new Date().toISOString() } });
  // SECURITY finding (SD-MAN-INFRA-VENTURE-CRACK-GATE-001 EXEC-TO-PLAN review): the canonical
  // sanctioned write path (runPbnGate, lib/eva/stage-zero/pbn-integration.js) always sanitizes
  // before persisting -- this script built the verdict directly from buildPbnVerdict and skipped
  // that step, reopening the exact canary-content-leak class (chairman-identity-shaped strings,
  // internal identifiers) SD-LEO-FEAT-PROVEN-BETTER-NEW-001's own SECURITY F1 already fixed once
  // for the primary write path. Applied here too, not just referenced.
  const pbnVerdict = (deps.sanitizePbnVerdictForPersistence || sanitizePbnVerdictForPersistence)(rawVerdict);

  // SECURITY finding: a transient scoring failure (LLM timeout/error) previously still wrote a
  // real, permanent REJECT verdict (all-uncoverable buckets) -- and set_venture_pbn_verdict_stage_zero's
  // own already-scored guard means that verdict could NEVER be corrected by a later, successful
  // re-score. Manually, a human saw scoring_error in the printed JSON and could investigate;
  // automated across the whole portfolio (FR-1's Job 5), this would silently and permanently
  // REJECT every venture scored during an outage window with no operator visibility and no
  // correction path. Skip the write entirely on a genuine scoring failure -- NO_DATA (unscored)
  // is honest; a fabricated REJECT is not, and a future retry can still succeed.
  if (pbnVerdict.scoring_error) {
    return { skipped: true, reason: 'scoring_error', ventureId, detail: pbnVerdict.scoring_error };
  }

  // Narrow, single-purpose RPC (database/migrations/20260817_set_venture_pbn_verdict_stage_zero.sql),
  // not a JS spread: a two-level JS spread of `metadata` is a read-modify-write that is also
  // lost-update racy against any concurrent writer; jsonb_set inside the function is atomic and
  // touches only metadata->stage_zero->pbn_verdict, never a sibling key.
  const { error: writeError } = await supabase.rpc('set_venture_pbn_verdict_stage_zero', {
    p_venture_id: ventureId,
    p_pbn_verdict: pbnVerdict,
  });
  if (writeError) throw new Error(`retroactive pbn_verdict write failed: ${writeError.message}`);

  return { skipped: false, ventureId, verdict: pbnVerdict.verdict, buckets };
}

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  if (args.parseError) {
    console.error(`FLAG ERROR: ${args.parseError}`);
    return { exitCode: 1 };
  }
  if (args.help || !args.ventureId) {
    console.log('retroactive-pbn-score --venture-id <uuid> [--dry-run]');
    return { exitCode: args.help ? 0 : 1 };
  }

  const supabase = deps.supabase || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  if (args.dryRun) {
    const { data: venture, error } = await supabase.from('ventures').select('id, name, description, metadata').eq('id', args.ventureId).maybeSingle();
    if (error || !venture) { console.error('dry-run fetch failed:', error?.message || 'not found'); return { exitCode: 1 }; }
    console.log('DRY RUN — would score:', JSON.stringify(buildBriefFromVenture(venture), null, 2));
    return { exitCode: 0 };
  }

  try {
    const result = await retroactivelyScoreVenture(supabase, args.ventureId, deps);
    console.log(JSON.stringify(result, null, 2));
    return { exitCode: 0, result };
  } catch (err) {
    console.error('ERROR:', err.message);
    return { exitCode: 1 };
  }
}

if (isMainModule(import.meta.url)) {
  main().then(({ exitCode }) => process.exit(exitCode));
}
