#!/usr/bin/env node
// @wire-check-exempt: invoked exclusively from .github/workflows/unit-tier-clock-skew.yml
// (GHA `run:` step) — never via a package.json script or a static JS import. Same architectural
// shape as scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs (harness/workflow-invoked,
// no static reachability from any in-scope entry point).
//
// SD-LEO-INFRA-CLOCK-SKEW-CI-SWEEP-001 (FR-2). Parses a captured `vitest run --project unit`
// log for FAIL lines, extracts distinct failing test file paths, and calls log-harness-bug.js
// ONCE PER FILE (not one aggregated string) so findPossiblePriorFix's {symptom, file} lookup and
// emit-feedback's dedup_key (== --file) both key correctly per test, not per run.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isMainModule } from '../lib/utils/is-main-module.js';

// vitest's own FAIL line shape: " FAIL  |unit| <filepath> > <test name...>"
const FAIL_LINE = /^\s*FAIL\s+\|unit\|\s+(\S+)/gm;

export function extractFailingFiles(log) {
  const files = new Set();
  let m;
  const re = new RegExp(FAIL_LINE.source, FAIL_LINE.flags);
  while ((m = re.exec(log)) !== null) {
    files.add(m[1]);
  }
  return [...files];
}

export function reportFailures(files, { run = execFileSync } = {}) {
  const reported = [];
  for (const file of files) {
    try {
      run('node', [
        'scripts/log-harness-bug.js',
        `Unit test fails under +45d clock skew (potential date-window time-bomb): ${file}`,
        '--file', file,
        '--severity', 'high',
      ], { stdio: 'inherit' });
      reported.push(file);
    } catch (err) {
      // Non-fatal: one failed report must not stop the remaining files from being reported.
      console.error(`  ⚠ failed to log harness bug for ${file}: ${err.message}`);
    }
  }
  return reported;
}

async function main() {
  const logPath = process.argv[2];
  if (!logPath) {
    console.error('Usage: node scripts/clock-skew-report-failures.mjs <vitest-log-path>');
    process.exit(1);
  }
  const log = readFileSync(logPath, 'utf8');
  const files = extractFailingFiles(log);
  if (files.length === 0) {
    console.log('No FAIL lines matched in the log -- nothing to report.');
    return;
  }
  console.log(`Reporting ${files.length} time-bomb candidate(s) to the harness backlog:`);
  files.forEach((f) => console.log(`  - ${f}`));
  reportFailures(files);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
