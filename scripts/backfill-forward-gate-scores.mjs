#!/usr/bin/env node
/**
 * Backfill forward-gate advisory coverage.
 *
 * SD-LEO-INFRA-DFE-CHAIRMAN-FORWARD-GATE-001 (FR-4)
 *
 * Advisory-scores EXISTING chairman_decisions through the genuine pure
 * evaluateDecision() engine and records the verdict to audit_log (via
 * recordForwardGateScore), establishing an advisory forward-gate audit baseline over
 * the existing decision history — the engine truly evaluates each real decision;
 * nothing is fabricated. (This is telemetry/foundation; the vision ord-13 gauge stays
 * honestly 'partial' until a future enforce-mode SD makes the gate actually gate.)
 *
 * ADVISORY / LOG-ONLY: writes ONLY to audit_log, never to chairman_decisions.
 * Idempotent: decisions that already carry a coverage row are skipped.
 *
 * Usage:
 *   node scripts/backfill-forward-gate-scores.mjs [--limit N] [--dry-run]
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { recordForwardGateScore, hasForwardGateScore } from '../lib/eva/forward-gate.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — when called without --limit this
// scores EVERY chairman_decisions row (iterated/acted-on below), so a capped read would silently
// skip scoring decisions past the PostgREST 1000-row boundary. `limit`, when given, is honored as
// a declared sampling cap via fetchAllPaginated's maxRows (same first-N-in-order semantics as the
// prior .limit(limit)).
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

export async function backfillForwardGateScores({ supabase, limit = null, dryRun = false, logger = console } = {}) {
  if (!supabase) throw new Error('supabase client required');
  let decisions;
  try {
    decisions = await fetchAllPaginated(() => supabase
      .from('chairman_decisions')
      .select('id, lifecycle_stage, health_score, brief_data, summary, decision_type')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }), { maxRows: Number.isFinite(limit) ? limit : Infinity });
  } catch (e) {
    throw new Error(`failed to load chairman_decisions: ${e.message}`);
  }

  let scored = 0;
  let skipped = 0;
  for (const d of decisions) {
    if (dryRun) {
      const exists = await hasForwardGateScore(d.id, supabase);
      if (exists) skipped++; else scored++;
      continue;
    }
    const res = await recordForwardGateScore(d, { supabase, logger });
    if (res.logged) scored++;
    else skipped++;
  }
  return { total: (decisions || []).length, scored, skipped, dryRun };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limIdx = args.indexOf('--limit');
  const limit = limIdx >= 0 ? Number(args[limIdx + 1]) : null;
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  backfillForwardGateScores({ supabase, limit, dryRun })
    .then((r) => {
      console.log(`[ForwardGate backfill] total=${r.total} scored=${r.scored} skipped=${r.skipped}${r.dryRun ? ' (dry-run)' : ''}`);
      process.exit(0);
    })
    .catch((e) => {
      console.error(`[ForwardGate backfill] FAILED: ${e.message}`);
      process.exit(1);
    });
}
