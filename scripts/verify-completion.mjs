#!/usr/bin/env node
/**
 * SD-LEO-INFRA-STRENGTHEN-COMPLETION-DELIVERABLE-001 — FR-4 wiring CLI.
 *
 * The invocation path for the PCVP completion verifier (lib/eva/post-completion-verifier.js)
 * and, transitively, the live-end-state deliverable canary (lib/eva/deliverable-canary.js).
 * Without this entry point the verifier subsystem was statically orphaned (no package.json
 * script reached it), so the canary it now hosts had no way to run. This CLI is the
 * fleet completion-integrity reporting consumer the PRD declared (runBatchVerification),
 * and it makes the CLI -> verifier -> canary chain reachable from a real entry point.
 *
 * The canary runs ADVISORY by default; set LEO_DELIVERABLE_CANARY_ENFORCE=block to escalate
 * a confirmed canary failure to a hard verdict (the verifier honours the env flag itself).
 *
 * Usage:
 *   node scripts/verify-completion.mjs <SD-ID|SD-KEY>      # verify one SD
 *   node scripts/verify-completion.mjs --results <SD-ID>   # show stored verification results
 *   node scripts/verify-completion.mjs --batch [--status completed] [--limit 50] [--type infrastructure]
 */

import { verifyCompletion, getVerificationResults, runBatchVerification } from '../lib/eva/post-completion-verifier.js';

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--batch')) {
    const options = {
      status: argValue('--status', 'completed'),
      limit: parseInt(argValue('--limit', '50'), 10),
    };
    const type = argValue('--type', null);
    if (type) options.sdType = type;
    const summary = await runBatchVerification(options);
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (args.includes('--results')) {
    const sdId = argValue('--results', null);
    if (!sdId) { console.error('Error: --results requires an SD id/key'); process.exit(1); }
    const results = await getVerificationResults(sdId);
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const sdId = args.find((a) => !a.startsWith('--'));
  if (!sdId) {
    console.error('Usage: node scripts/verify-completion.mjs <SD-ID|SD-KEY> | --results <SD-ID> | --batch [--status s] [--limit n] [--type t]');
    process.exit(1);
  }

  const result = await verifyCompletion(sdId);
  console.log(JSON.stringify(result, null, 2));
  if (result && result.pass === false) process.exit(2);
}

main().catch((err) => {
  console.error('verify-completion failed:', err?.message || err);
  process.exit(1);
});
