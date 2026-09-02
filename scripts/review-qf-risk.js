#!/usr/bin/env node
/**
 * SD-LEO-FIX-SELF-CLAIM-PREDICATE-001: CLI for the risk-review stamp writer.
 * Run this AFTER a SECURITY sub-agent review of a risk-noun-hit quick_fixes row to record the
 * verdict and (on PASS) unblock worker self-claim. See lib/fleet/review-qf-risk.mjs.
 *
 * Usage:
 *   node scripts/review-qf-risk.js --qf-id <id> --verdict PASS --confidence 95 \
 *     --reasoning "title contains 'credentials' but the change is a login-form selector fix, no auth logic touched"
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { reviewQfRisk } from '../lib/fleet/review-qf-risk.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--qf-id') out.qfId = argv[++i];
    else if (a === '--verdict') out.verdict = argv[++i];
    else if (a === '--confidence') out.confidence = Number(argv[++i]);
    else if (a === '--reasoning') out.reasoning = argv[++i];
  }
  return out;
}

async function main() {
  const { qfId, verdict, confidence, reasoning } = parseArgs(process.argv.slice(2));
  if (!qfId || !verdict || !reasoning) {
    console.error('Usage: node scripts/review-qf-risk.js --qf-id <id> --verdict PASS|FAIL --confidence <0-100> --reasoning "<text>"');
    process.exit(1);
  }
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const result = await reviewQfRisk(supabase, {
    qfId, verdict, confidence: Number.isFinite(confidence) ? confidence : 80, reasoning,
    repoPath: process.cwd(), executedFromCwd: process.cwd(),
  });
  if (!result.ok) {
    console.error(`❌ review-qf-risk failed: ${result.error}`);
    process.exit(1);
  }
  console.log(`✅ SECURITY review recorded (row ${result.subAgentRowId})`);
  console.log(result.stamped
    ? `   ✅ risk_reviewed stamp written — QF ${qfId} is now self-claimable if it was only excluded on a risk-noun hit`
    : `   ℹ️  verdict "${verdict}" did not clear the stamp — QF ${qfId} remains excluded from self-claim`);
}

main();
