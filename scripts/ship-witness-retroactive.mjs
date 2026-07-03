#!/usr/bin/env node
/**
 * Retroactive mergeWork() P1-P5 witness evaluation for a PR that merged
 * through a lane outside ship-auto-merge (no telemetry row was ever written).
 *
 * QF-20260703-401 (Adam disposition 487dde59). Runs the SAME canonical
 * evaluator (evaluateMergeWorkLadder) and canonical writer
 * (writeMergeWitnessTelemetry) that every live lane uses — never a
 * hand-rolled insert. The row is explicitly marked retroactive via a
 * distinct `lane` value plus a synthetic META rung carrying the reason, so
 * it stays honest about being a late, after-the-fact evaluation rather than
 * a same-day merge-time observation.
 *
 * No existing readiness/adoption gauge (scripts/ship-witness-enforce-readiness.mjs,
 * scripts/gauge-runner.mjs) currently spans venture repos — both are scoped to
 * PLATFORM_REPOS (rickfelix/ehg, rickfelix/ehg_engineer) only, so a retroactive
 * venture-repo row is invisible to them today. If a venture-scoped readiness
 * gauge is built later, it should exclude lane='ship-witness-retroactive-cli'
 * from same-day-as-merge coverage counts (conservative default).
 *
 * Usage: node scripts/ship-witness-retroactive.mjs --repo owner/name --pr N --work-key KEY [--tier standard] [--reason "why"]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { evaluateMergeWorkLadder } from '../lib/ship/merge-witness-ladder.mjs';
import { writeMergeWitnessTelemetry } from '../lib/ship/merge-witness-telemetry.mjs';
import { verifyMerged, fetchStatusCheckRollup } from '../lib/ship/auto-merge.mjs';
import { defaultLookupWorkKeyReal, defaultFetchReviewFinding } from '../lib/ship/venture-trust-gate.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') out.repo = argv[++i];
    else if (a === '--pr') out.pr = argv[++i];
    else if (a === '--work-key') out.workKey = argv[++i];
    else if (a === '--tier') out.tier = argv[++i];
    else if (a === '--reason') out.reason = argv[++i];
  }
  return out;
}

export async function runRetroactiveEvaluation({ repo, pr, workKey, tier, reason, supabase }) {
  const [repoOwner, repoName] = repo.split('/');
  const prNumber = Number(pr);

  const merged = verifyMerged(prNumber, repoOwner, repoName);
  const verifyResult = { ok: merged };
  const statusCheckRollup = fetchStatusCheckRollup(prNumber, repoOwner, repoName);

  const verdict = await evaluateMergeWorkLadder({
    prNumber,
    workKey: workKey ?? null,
    tier: tier || 'standard',
    lookupWorkKeyReal: (wk) => defaultLookupWorkKeyReal(wk, supabase),
    fetchReviewFinding: (n) => defaultFetchReviewFinding(n, supabase),
    statusCheckRollup,
    merged,
    verifyResult,
  });

  verdict.rungs = [
    ...verdict.rungs,
    { id: 'META', status: 'retroactive', reason: reason || 'retroactive evaluation via ship-witness-retroactive.mjs CLI (merged outside ship-auto-merge)' },
  ];

  const written = await writeMergeWitnessTelemetry(supabase, verdict, {
    repo,
    lane: 'ship-witness-retroactive-cli',
  });

  const byId = Object.fromEntries(verdict.rungs.map((r) => [r.id, r.status]));
  const witnessPass = byId.P1 === 'pass' && byId.P2 === 'pass' && byId.P3 === 'pass';

  return { prNumber, repo, workKey: workKey ?? null, merged, witnessPass, rungs: verdict.rungs, telemetryWritten: written.ok };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.repo || !args.pr) {
    console.error('Usage: node scripts/ship-witness-retroactive.mjs --repo owner/name --pr N --work-key KEY [--tier standard] [--reason "why"]');
    process.exit(2);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const result = await runRetroactiveEvaluation({ ...args, supabase });
  console.log(JSON.stringify(result, null, 2));

  if (!result.witnessPass) {
    console.error('VERDICT: witness FAIL — escalate (the merge may be bad on merits).');
    process.exit(1);
  }
  console.log('VERDICT: witness PASS — record healed with an honest retroactive row.');
}

main();
