#!/usr/bin/env node
/**
 * CLI for the invocation-path detector (SD-LEO-INFRA-INVOCATION-PATH-PROOF-001-A FR-1 + -B FR-2).
 *
 * Usage: node scripts/invocation-check.mjs <script-path> [--json] [--no-parent-shell] [--violation]
 *
 * Prints whether a LIVE production trigger references the given script entry-point (FR-1), and —
 * with --violation — whether the script REQUIRES one and is missing it (FR-2, the WIRED-TO-FIRE
 * violation). This is also the SSOTs' own wiring: it makes lib/invocation-detector (both modules)
 * reachable+INVOKED instead of merely reachable-once -C consumes them. Exit 0 when invoked / no
 * violation, 1 when NOT invoked (or --violation and it IS a violation).
 */
import { detectInvocationPathFromRepo } from '../lib/invocation-detector/index.js';
import { isMissingInvocationViolation } from '../lib/invocation-detector/requires-invocation.js';

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const includeParentShell = !args.includes('--no-parent-shell');
  const scriptPath = args.find((a) => !a.startsWith('--'));

  if (!scriptPath) {
    console.error('Usage: node scripts/invocation-check.mjs <script-path> [--json] [--no-parent-shell]');
    process.exit(2);
  }

  const violationMode = args.includes('--violation');
  const result = await detectInvocationPathFromRepo(scriptPath, process.cwd(), { includeParentShell });
  const verdict = violationMode ? isMissingInvocationViolation(scriptPath, result) : null;

  if (json) {
    console.log(JSON.stringify(violationMode ? { ...verdict, invoked: result.invoked, triggers: result.triggers } : result, null, 2));
  } else {
    console.log(`${result.invoked ? '✅ INVOKED' : '❌ NOT INVOKED'}: ${scriptPath}${result.excluded ? ' (excluded by convention)' : ''}`);
    for (const t of result.triggers) {
      const sched = t.evidence?.scheduled === false ? ' [not-scheduled]' : '';
      console.log(`   • ${t.type} ← ${t.source_file}${sched}`);
    }
    if (!result.triggers.length) console.log('   (no production trigger references this entry-point)');
    if (violationMode) {
      console.log(verdict.violation
        ? `   🚩 VIOLATION: requires a live trigger (${verdict.requires.reason}) but none found`
        : `   ✓ no violation: ${verdict.reason}`);
    }
  }

  // Exit non-zero on a missing-invocation violation (--violation) or a plain not-invoked check.
  process.exit((violationMode ? verdict.violation : !result.invoked) ? 1 : 0);
}

main().catch((e) => { console.error('invocation-check error:', e.message); process.exit(2); });
