/**
 * SD-LEO-INFRA-RETRO-PUBLISHED-GUARD-001 FR-3(b): a broader source-scan census of every
 * retrospectives-table WRITE call site under lib/ and scripts/ (excluding one-off/, tests/,
 * archive/, and _deprecated/), asserted equal to a maintained allowlist.
 *
 * This is a DRIFT DETECTOR, not a guard-coverage check -- lib/eva/__tests__/retro-clobber-guard.test.js
 * already pins the (narrower) set of sites that must consult isSafeToWriteRetro. This census exists
 * because Solomon's own earlier grep of the literal from('retrospectives') string undercounted --
 * it searched a narrower scope and missed real writers. A `.from('retrospectives')` call alone is
 * NOT a write (most of the 130+ files that reference the table are read-only reporting/analysis
 * consumers) -- a write is `.from('retrospectives')` followed within a few lines by `.update(` or
 * `.insert(`. Growth beyond this allowlist (a new writer added without updating this file) fails
 * CI; shrinkage (an allowlisted writer removed or converted to read-only) also fails, so the list
 * never silently drifts stale in either direction.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SCAN_ROOTS = ['lib', 'scripts'];
const EXCLUDED_SEGMENTS = ['one-off', 'tests', '__tests__', 'archive', '_deprecated', 'node_modules'];
const FILE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

/** Known writers as of SD-LEO-INFRA-RETRO-PUBLISHED-GUARD-001 (2026-09-06). Update this list, with
 * a reason, whenever the census below reports a drift -- never widen the scan to make it pass. */
const KNOWN_WRITERS = [
  'lib/sub-agents/retro/audit-retro.js',
  'lib/sub-agents/retro/db-operations.js',
  'lib/sub-agents/retro/lesson-capture.js',
  'lib/utils/quickfix-rca-integration.js',
  'scripts/auto-extract-patterns-from-retro.js',
  'scripts/create-handoff-retrospective.js',
  'scripts/eva/heal-command.mjs',
  'scripts/generate-comprehensive-retrospective.js',
  'scripts/generate-retrospective-embeddings.js',
  'scripts/generate-retrospective.js',
  'scripts/modules/handoff/executors/exec-to-plan/retrospective.js',
  'scripts/modules/handoff/executors/lead-to-plan/retrospective.js',
  'scripts/modules/handoff/executors/plan-to-exec/retrospective.js',
  'scripts/modules/handoff/executors/plan-to-lead/state-transitions.js',
  'scripts/modules/handoff/orchestrator-completion-guardian.js',
  'scripts/modules/handoff/retro-filters.js',
  'scripts/modules/handoff/retrospective-enricher.js',
  'scripts/programmatic/retrospective-generator.js',
  'scripts/promote-retro-action-items.mjs',
  'scripts/rca-learning-ingestion.js',
].sort();

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_SEGMENTS.includes(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listFiles(full));
    else if (FILE_EXTENSIONS.has(path.extname(entry))) out.push(full);
  }
  return out;
}

function referencesRetrospectivesWrite(filePath) {
  const src = readFileSync(filePath, 'utf8');
  const lines = src.split('\n');
  const fromPattern = /\.from\(['"]retrospectives['"]\)/;
  for (let i = 0; i < lines.length; i++) {
    if (!fromPattern.test(lines[i])) continue;
    const window = lines.slice(i, i + 4).join('\n');
    if (/\.(update|insert)\(/.test(window)) return true;
  }
  return false;
}

describe('retrospectives table writer census (source-scan, not literal-match-only)', () => {
  it('discovered write call sites equal the maintained KNOWN_WRITERS allowlist', () => {
    const discovered = [];
    for (const root of SCAN_ROOTS) {
      for (const file of listFiles(path.join(REPO_ROOT, root))) {
        if (referencesRetrospectivesWrite(file)) {
          discovered.push(path.relative(REPO_ROOT, file).split(path.sep).join('/'));
        }
      }
    }
    discovered.sort();

    const missingFromAllowlist = discovered.filter((f) => !KNOWN_WRITERS.includes(f));
    const staleInAllowlist = KNOWN_WRITERS.filter((f) => !discovered.includes(f));

    expect(missingFromAllowlist, 'new retrospectives writer(s) not yet in KNOWN_WRITERS').toEqual([]);
    expect(staleInAllowlist, 'KNOWN_WRITERS entries no longer performing a write (remove or re-verify)').toEqual([]);
  });

  it('the 7 isSafeToWriteRetro wire-in FILES (8 call sites -- orchestrator-completion-guardian.js wires both INSERT and UPDATE) are a subset of KNOWN_WRITERS (drift alarm, not the guard test itself)', () => {
    const guardSites = [
      'scripts/modules/handoff/retrospective-enricher.js',
      'scripts/modules/handoff/executors/exec-to-plan/retrospective.js',
      'scripts/modules/handoff/executors/lead-to-plan/retrospective.js',
      'scripts/modules/handoff/executors/plan-to-exec/retrospective.js',
      'scripts/modules/handoff/executors/plan-to-lead/state-transitions.js',
      'scripts/modules/handoff/orchestrator-completion-guardian.js',
      'lib/sub-agents/retro/db-operations.js',
    ];
    for (const site of guardSites) {
      expect(KNOWN_WRITERS, `${site} should appear in KNOWN_WRITERS`).toContain(site);
    }
  });
});
