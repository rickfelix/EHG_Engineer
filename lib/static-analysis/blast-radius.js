/**
 * Blast Radius — Blast-Radius Consumer Analysis (Phase 1)
 * SD-LEO-INFRA-FIRST-PARTY-CODEBASE-STRUCTURAL-ANALYSIS-001
 *
 * Given a diff, finds every cross-file consumer of modified/removed exported
 * symbols and flags any consumer not touched in the same diff. Recomputes the
 * consumer index fresh on every call (no persistent cache) -- matching
 * wire-check-gate.js's proven freshness pattern -- since a stale cache would
 * reintroduce the exact "wrong blast-radius" defect class this tool exists to
 * prevent.
 */

import { execFileSync } from 'child_process';
import path from 'path';
import { buildConsumerIndex, findConsumers } from './consumer-index.js';
import { detectModifiedExports } from './symbol-diff.js';

const TRACKED_EXTENSIONS_RE = /\.(js|mjs|cjs|ts|tsx)$/;
/** Scope matches wire-check-gate.js's convention for this repo's backend/harness source tree. */
const TRACKED_SCOPE = ['lib/', 'scripts/', 'server/'];

function getChangedFiles(mainRef, rootDir) {
  const out = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', `${mainRef}...HEAD`, '--'],
    { cwd: rootDir, encoding: 'utf-8', timeout: 10000, maxBuffer: 10 * 1024 * 1024 }
  );
  return out.split('\n').map((f) => f.trim()).filter(Boolean).map((f) => f.replace(/\\/g, '/'));
}

/**
 * Discover all git-tracked source files in scope, fresh, every invocation.
 * @param {string} rootDir - Project root
 * @returns {string[]} Absolute paths (forward slashes)
 */
export function discoverTrackedSourceFiles(rootDir) {
  const out = execFileSync('git', ['ls-files', '--', ...TRACKED_SCOPE], {
    cwd: rootDir,
    encoding: 'utf-8',
    timeout: 15000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return out
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => TRACKED_EXTENSIONS_RE.test(f))
    .map((f) => path.resolve(rootDir, f).replace(/\\/g, '/'));
}

/**
 * Compute the blast radius of a diff: every modified/removed export's
 * consumers, with untouched (same-diff) consumers flagged.
 *
 * @param {string} mainRef - Base git ref (e.g. 'origin/main')
 * @param {string} rootDir - Project root
 * @returns {{
 *   report: Array<{file: string, exportName: string, changeType: string, consumers: object[], untouchedConsumers: object[]}>,
 *   warnings: string[],
 *   changedFiles: string[],
 * }}
 */
export function computeBlastRadius(mainRef, rootDir) {
  const warnings = [];
  const changedFiles = getChangedFiles(mainRef, rootDir);

  const { modifiedExports, warnings: diffWarnings } = detectModifiedExports(mainRef, changedFiles, rootDir);
  warnings.push(...diffWarnings);

  const relevant = modifiedExports.filter((e) => e.changeType !== 'added');
  if (relevant.length === 0) {
    return { report: [], warnings, changedFiles };
  }

  const allFiles = discoverTrackedSourceFiles(rootDir);
  const { index, warnings: indexWarnings } = buildConsumerIndex(allFiles, rootDir);
  warnings.push(...indexWarnings);

  const changedFilesSet = new Set(changedFiles);

  const report = relevant.map(({ file, exportName, changeType }) => {
    const definingFileAbs = path.resolve(rootDir, file).replace(/\\/g, '/');
    const consumers = findConsumers(index, definingFileAbs, exportName).map((c) => ({
      ...c,
      touchedInDiff: changedFilesSet.has(c.file),
    }));

    return {
      file,
      exportName,
      changeType,
      consumers,
      untouchedConsumers: consumers.filter((c) => !c.touchedInDiff),
    };
  });

  return { report, warnings, changedFiles };
}

/**
 * Render a human-readable report for CLI output.
 * @param {Array} report - `report` array from computeBlastRadius
 * @param {string} mainRef
 * @param {string[]} changedFiles
 * @returns {string}
 */
export function formatReport(report, mainRef, changedFiles) {
  const lines = [];
  lines.push(`Blast-radius analysis vs ${mainRef} (${changedFiles.length} file(s) changed)`);
  lines.push('');

  if (report.length === 0) {
    lines.push('No modified or removed exported symbols detected. Nothing to review.');
    return lines.join('\n');
  }

  for (const entry of report) {
    lines.push(`${entry.file} :: ${entry.exportName} (${entry.changeType})`);
    if (entry.consumers.length === 0) {
      lines.push('  No consumers found in tracked source tree.');
    } else {
      lines.push(`  Consumed by ${entry.consumers.length} site(s):`);
      for (const c of entry.consumers) {
        const flag = c.touchedInDiff ? '' : '  <-- NOT touched in this diff, verify intended';
        lines.push(`    - ${c.file}:${c.line} [${c.kind}]${flag}`);
      }
    }
    lines.push('');
  }

  const totalUntouched = report.reduce((sum, e) => sum + e.untouchedConsumers.length, 0);
  lines.push(totalUntouched > 0
    ? `${totalUntouched} consumer(s) across ${report.length} changed symbol(s) were NOT touched in this diff — review before merging.`
    : 'All consumers of modified/removed symbols were touched in this diff.');

  return lines.join('\n');
}
