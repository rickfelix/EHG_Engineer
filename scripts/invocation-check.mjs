#!/usr/bin/env node
/**
 * CLI for the invocation-path detector (SD-LEO-INFRA-INVOCATION-PATH-PROOF-001-A, FR-1).
 *
 * Usage: node scripts/invocation-check.mjs <script-path> [--json] [--no-parent-shell]
 *
 * Prints whether a LIVE production trigger references the given script entry-point. This is also
 * the foundation SSOT's own wiring: it makes lib/invocation-detector reachable+INVOKED (the very
 * thing the detector checks for) instead of merely reachable-once -B/-C consume it. Exit code 0
 * when invoked, 1 when NOT invoked (so CI/gates can `node scripts/invocation-check.mjs x || ...`).
 */
import { detectInvocationPathFromRepo } from '../lib/invocation-detector/index.js';

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const includeParentShell = !args.includes('--no-parent-shell');
  const scriptPath = args.find((a) => !a.startsWith('--'));

  if (!scriptPath) {
    console.error('Usage: node scripts/invocation-check.mjs <script-path> [--json] [--no-parent-shell]');
    process.exit(2);
  }

  const result = await detectInvocationPathFromRepo(scriptPath, process.cwd(), { includeParentShell });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.invoked ? '✅ INVOKED' : '❌ NOT INVOKED'}: ${scriptPath}${result.excluded ? ' (excluded by convention)' : ''}`);
    for (const t of result.triggers) {
      const sched = t.evidence?.scheduled === false ? ' [not-scheduled]' : '';
      console.log(`   • ${t.type} ← ${t.source_file}${sched}`);
    }
    if (!result.triggers.length) console.log('   (no production trigger references this entry-point)');
  }

  process.exit(result.invoked ? 0 : 1);
}

main().catch((e) => { console.error('invocation-check error:', e.message); process.exit(2); });
