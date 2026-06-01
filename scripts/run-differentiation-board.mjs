#!/usr/bin/env node
/**
 * Headless Differentiation Board runner (CLI)
 * SD-COMPETITIVE-INTELLIGENCE-ACROSS-THE-ORCH-001-E
 *
 * Runs the automated differentiation board on a competitor_intelligence record:
 *   node scripts/run-differentiation-board.mjs --ci-record <uuid> [--threshold 0.5]
 *
 * Persists differentiation_strategy + differentiation_delta + sanitization_status
 * into the canonical record (Child A slots) and prints the gate verdict.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { runDifferentiationBoard, DEFAULT_DELTA_THRESHOLD } from '../lib/competitive-intelligence/differentiation-board.js';

dotenv.config();

function parseArgs(argv) {
  const out = { threshold: DEFAULT_DELTA_THRESHOLD };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ci-record') out.ciRecord = argv[++i];
    else if (argv[i] === '--threshold') out.threshold = Number(argv[++i]);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ciRecord) {
    console.error('Usage: node scripts/run-differentiation-board.mjs --ci-record <uuid> [--threshold 0.5]');
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log(`[differentiation-board] running on competitor_intelligence ${args.ciRecord} (threshold ${args.threshold})`);
  const result = await runDifferentiationBoard(args.ciRecord, {
    supabase,
    threshold: args.threshold,
    nowIso: new Date().toISOString(),
  });

  console.log(`[differentiation-board] debate_session=${result.debateSessionId} quorum=${result.quorumMet}`);
  console.log(`[differentiation-board] differentiation_delta=${result.delta}`);
  console.log(`[differentiation-board] gate: ${result.gate.reason}`);
  console.log(`[differentiation-board] sanitization_status=${result.sanitization_status}${result.residuals.length ? ' residuals=' + result.residuals.join(',') : ''}`);
  console.log(`[differentiation-board] seedable=${result.gate.seedable}`);
}

main().catch((err) => {
  console.error('[differentiation-board] FAILED:', err.message);
  process.exit(1);
});
