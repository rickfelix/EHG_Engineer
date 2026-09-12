#!/usr/bin/env node
/**
 * EVA logging instrumentation census.
 *
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-145 FR-6. Reuses eva-logger-required-lint.mjs's
 * --all sweep (candidateFilesAll + classifyFile) rather than re-implementing file
 * discovery/classification -- one classifier, so the census and the enforcement lint can
 * never silently disagree on what counts as instrumented.
 *
 * Not a gate: informational only, for tracking the SD's success_metrics baseline over time
 * (this SD's scope is new/modified files going forward, never a backfill).
 *
 * KNOWN LIMITATION: this census counts files classifyFile() considers uninstrumented; it
 * inherits classifyFile()'s own blind spots verbatim (an aliased createLogger import, or a
 * logger threaded in via cross-file dependency injection, both read as zero-instrumentation
 * here too). It also does not distinguish a genuine escape-hatch exemption from a file that
 * is simply exempt for having no executable logic at all -- both count as "not flagged",
 * neither is broken out separately in the aggregate total.
 *
 * Usage: node scripts/audit/eva-logging-census.mjs [--json] [--root <dir>]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { candidateFilesAll, classifyFile } from '../lint/eva-logger-required-lint.mjs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

export function runCensus(repoRoot = REPO_ROOT) {
  const files = candidateFilesAll(repoRoot);
  let zeroInstrumentation = 0;
  for (const f of files) {
    let source;
    try { source = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const relPath = path.relative(repoRoot, f).split(path.sep).join('/');
    if (classifyFile(source, relPath)) zeroInstrumentation++;
  }
  const total = files.length;
  const pct = total > 0 ? (zeroInstrumentation / total) * 100 : 0;
  return { total, zeroInstrumentation, percentZero: Math.round(pct * 10) / 10, censusDate: new Date().toISOString() };
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const rootIdx = args.indexOf('--root');
  const repoRoot = rootIdx >= 0 ? path.resolve(args[rootIdx + 1]) : REPO_ROOT;
  const result = runCensus(repoRoot);
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[EVA-LOGGING-CENSUS] ${result.total} lib/eva/**/*.{js,mjs} files scanned`);
    console.log(`  ${result.zeroInstrumentation} (${result.percentZero}%) have no createLogger/OrchestratorTracer instrumentation and no documented escape hatch`);
    console.log(`  Census date: ${result.censusDate}`);
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
