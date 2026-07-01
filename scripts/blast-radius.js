#!/usr/bin/env node
/**
 * Blast-Radius CLI — first-party PR-review consumer-impact tool (Phase 1)
 * SD-LEO-INFRA-FIRST-PARTY-CODEBASE-STRUCTURAL-ANALYSIS-001
 *
 * Given a diff, finds every cross-file consumer of modified/removed exported
 * symbols and flags any consumer not touched in the same diff.
 *
 * Usage:
 *   node scripts/blast-radius.js [--ref <gitRef>] [--json]
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { computeBlastRadius, formatReport } from '../lib/static-analysis/blast-radius.js';
import { getMainRef } from './modules/handoff/shared-git-context.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { json: false, ref: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--ref') args.ref = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mainRef = args.ref || getMainRef({ cwd: ROOT_DIR }).ref;

  const { report, warnings, changedFiles } = computeBlastRadius(mainRef, ROOT_DIR);

  if (args.json) {
    console.log(JSON.stringify({ report, warnings, changedFiles, mainRef }, null, 2));
  } else {
    console.log(formatReport(report, mainRef, changedFiles));
    if (warnings.length > 0) {
      console.log('\nWarnings:');
      for (const w of warnings) console.log(`  - ${w}`);
    }
  }

  const hasUntouched = report.some((e) => e.untouchedConsumers.length > 0);
  process.exitCode = hasUntouched ? 1 : 0;
}

main();
