/**
 * SD-FDBK-FIX-ORCHESTRATOR-GHOST-COMPLETE-001 — FR-6 source-shape regression.
 *
 * Orchestrator auto-complete paths may not write strategic_directives_v2
 * status='completed' directly; the LEAD-FINAL-APPROVAL executor is the only
 * completion writer. This test fails if a direct completed-write reappears in
 * any of the guarded files (the ghost-complete class regressed twice via
 * per-site patches before this fix — see SD provenance).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const GUARDED_FILES = [
  'scripts/modules/handoff/executors/plan-to-lead/state-transitions.js',
  'scripts/modules/handoff/orchestrator-completion-guardian.js',
  'scripts/modules/handoff/lib/orchestrator-terminal-guard.js'
];

/**
 * Split the source at each .from('<table>') call; a chunk beginning with the
 * strategic_directives_v2 table must not contain a status: 'completed' payload
 * (PRD/user-story/deliverable chunks may — those are different tables).
 */
function sdChunksWithCompletedWrite(src) {
  const chunks = src.split(/\.from\(/).slice(1);
  return chunks
    .map((chunk, i) => ({ chunk, i }))
    .filter(({ chunk }) => chunk.startsWith("'strategic_directives_v2'"))
    .filter(({ chunk }) => {
      // Only inspect up to the next .from( boundary (already split) and only
      // update payloads: a completed STRING COMPARISON (status === 'completed')
      // is legitimate; a payload key is not.
      return /status:\s*'completed'/.test(chunk);
    });
}

describe('ghost-complete guard: no direct SD completed writes', () => {
  for (const rel of GUARDED_FILES) {
    it(`${rel} does not write strategic_directives_v2 status='completed'`, () => {
      const src = readFileSync(join(repoRoot, rel), 'utf8');
      const offenders = sdChunksWithCompletedWrite(src);
      expect(offenders, `direct completed-write found in ${rel}`).toHaveLength(0);
    });
  }

  it('the guarded paths route through the terminal guard', () => {
    const stateTransitions = readFileSync(join(repoRoot, GUARDED_FILES[0]), 'utf8');
    const guardian = readFileSync(join(repoRoot, GUARDED_FILES[1]), 'utf8');
    expect(stateTransitions).toMatch(/routeOrchestratorToLeadFinal/);
    expect(guardian).toMatch(/routeOrchestratorToLeadFinal/);
    // guardian retro check uses the canonical filter, not a bare table query
    expect(guardian).toMatch(/getFilteredRetrospective/);
  });
});
