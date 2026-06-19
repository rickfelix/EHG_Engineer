#!/usr/bin/env node
/**
 * Backfill forward-gate advisory coverage.
 *
 * SD-LEO-INFRA-DFE-CHAIRMAN-FORWARD-GATE-001 (FR-4)
 *
 * Advisory-scores EXISTING chairman_decisions through the genuine pure
 * evaluateDecision() engine and records the verdict to audit_log (via
 * recordForwardGateScore). This seeds HONEST forward-gate coverage — the engine
 * truly evaluates each real decision; nothing is fabricated.
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

export async function backfillForwardGateScores({ supabase, limit = null, dryRun = false, logger = console } = {}) {
  if (!supabase) throw new Error('supabase client required');
  let q = supabase
    .from('chairman_decisions')
    .select('id, lifecycle_stage, health_score, brief_data, summary, decision_type')
    .order('created_at', { ascending: true });
  if (Number.isFinite(limit)) q = q.limit(limit);
  const { data: decisions, error } = await q;
  if (error) throw new Error(`failed to load chairman_decisions: ${error.message}`);

  let scored = 0;
  let skipped = 0;
  for (const d of decisions || []) {
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
