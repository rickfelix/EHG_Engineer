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
 *
 * SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-D (Option C): this is the GENUINE consumer of the verifier's
 * `excluded[]` field (basename-colliding files invisible to apply-state checking), deliberately
 * NOT a cosmetic pass-through. `excludedSource` distinguishes "the producer emitted the field
 * with zero entries" from "the field was silently dropped" -- the same distinction
 * `undispositionedSet` already makes for `dispositions.undispositioned_files`, and the one
 * `dispositions.contradictory_files` (this file's sibling field) does NOT make, which is why that
 * field has no reader anywhere outside the verifier's own text-mode branch. `excludedDivergent`
 * names the dangerous class explicitly (DIVERGENT CONTENT verdicts) rather than folding it into a
 * bare count, since a divergent collision is a materially different finding from a byte-identical
 * one.
 * @param {Object} state - parsed verify-migration-apply-state.mjs --json output
 * @returns {{recentTotal:number, recentUndispositioned:number, recentDispositioned:number, legacyTotal:number, undispositionedFiles:string[], excludedSource:('present'|'absent'), excludedTotal:number, excludedDivergent:Array}}
 */
export function summarizeGapConformance(state) {
  const recentGaps = state.recentGaps || [];
  const undispositionedSet = new Set(state.dispositions?.undispositioned_files || []);
  const recentFiles = recentGaps.map((g) => gapFileBasename(g.file));
  const undispositionedFiles = recentFiles.filter((f) => undispositionedSet.has(f));
  const excludedPresent = Array.isArray(state.excluded);
  const excluded = excludedPresent ? state.excluded : [];
  const excludedDivergent = excluded.filter((e) => e && e.verdict === 'DIVERGENT CONTENT');
  return {
    recentTotal: recentFiles.length,
    recentUndispositioned: undispositionedFiles.length,
    recentDispositioned: recentFiles.length - undispositionedFiles.length,
    legacyTotal: (state.legacyGaps || []).length,
    undispositionedFiles,
    excludedSource: excludedPresent ? 'present' : 'absent',
    excludedTotal: excluded.length,
    excludedDivergent,
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
  console.log(`  Excluded (basename-collision) files: ${summary.excludedTotal} [source: ${summary.excludedSource}]`);
  if (summary.excludedDivergent.length) {
    console.log('  DIVERGENT CONTENT collisions (distinct migrations sharing one basename -- needs a human decision, not a duplicate):');
    for (const e of summary.excludedDivergent) console.log(`    - ${e.id} (twin: ${e.twin})`);
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main();
}
