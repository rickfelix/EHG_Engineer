#!/usr/bin/env node
/**
 * Migrations-dir-vs-live conformance gauge, auto (non-chairman-gated) path
 * (SD-FDBK-ENH-AUTO-APPLY-MIGRATION-001 FR-4).
 *
 * Reports the current RECENT-undispositioned gap count on demand, so the backlog
 * migration-deploy-drift-guard.yml has been accumulating (14 RECENT / 145 of 149 total
 * undispositioned at authoring time) is visible outside raw CI logs -- same visibility class
 * as the existing chairman-gated CEREMONY_PENDING status, but for the auto path.
 *
 * Informational only: always exits 0 regardless of count. It does not duplicate
 * migration-deploy-drift-guard.yml's existing blocking `--strict --recent-only` gate.
 *
 * Usage: node scripts/migration-gap-summary.mjs [--json]
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

function gapFileBasename(file) {
  return String(file || '').replace(/^.*[\\/]/, '');
}

function runVerifier() {
  const out = execFileSync(
    process.execPath,
    [path.join(PROJECT_ROOT, 'scripts', 'verify-migration-apply-state.mjs'), '--json'],
    { cwd: PROJECT_ROOT, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 }
  );
  // The verifier prepends a dotenvx banner (and other diagnostic lines) to stdout before its
  // JSON (pre-existing on origin/main, same quirk seed-migration-dispositions.mjs works around):
  // slice from the first line that is exactly '{' rather than parsing raw.
  const lines = out.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === '{');
  return JSON.parse(lines.slice(start).join('\n'));
}

/**
 * Pure computation over the verifier's --json output.
 * @param {Object} state - parsed verify-migration-apply-state.mjs --json output
 * @returns {{recentTotal:number, recentUndispositioned:number, recentDispositioned:number, legacyTotal:number, undispositionedFiles:string[]}}
 */
export function summarizeGapConformance(state) {
  const recentGaps = state.recentGaps || [];
  const undispositionedSet = new Set(state.dispositions?.undispositioned_files || []);
  const recentFiles = recentGaps.map((g) => gapFileBasename(g.file));
  const undispositionedFiles = recentFiles.filter((f) => undispositionedSet.has(f));
  return {
    recentTotal: recentFiles.length,
    recentUndispositioned: undispositionedFiles.length,
    recentDispositioned: recentFiles.length - undispositionedFiles.length,
    legacyTotal: (state.legacyGaps || []).length,
    undispositionedFiles,
  };
}

function main() {
  const asJson = process.argv.includes('--json');
  const state = runVerifier();
  const summary = summarizeGapConformance(state);

  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log('MIGRATION GAP CONFORMANCE (auto path, informational — not blocking)');
  console.log(`  RECENT gaps: ${summary.recentTotal} total (${summary.recentDispositioned} dispositioned, ${summary.recentUndispositioned} undispositioned/actionable)`);
  console.log(`  LEGACY gaps: ${summary.legacyTotal} (advisory only, never blocking)`);
  if (summary.undispositionedFiles.length) {
    console.log('  Undispositioned RECENT gap files:');
    for (const f of summary.undispositionedFiles) console.log(`    - ${f}`);
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main();
}
