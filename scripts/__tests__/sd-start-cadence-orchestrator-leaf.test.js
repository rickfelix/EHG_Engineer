/**
 * Structural invariants for the orchestrator-leaf cadence gate fix
 * (QF-CADENCE-ORCH-LEAF). Two latent defects in scripts/sd-start.js:
 *
 *   D1: getSDDetails SELECT excluded `governance_metadata` and `metadata`,
 *       so the cadence gate at sd-start.js read undefined and never fired.
 *   D2: When orchestrator routing reassigned `sd` to a leaf child, the
 *       cadence gate had already run on the parent. The leaf's
 *       governance_metadata.next_workable_after was never re-checked, so a
 *       cadence-blocked leaf was silently claimed via the parent.
 *
 * Pattern: source-text invariant tests (per feedback_sd_next_rendering_pipeline_has_5_sd_selects.md
 * — guarding bug-fix wiring with grep-style regression checks is preferable
 * to spawning sd-start.js as a subprocess for every CI run).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SD_START_PATH = path.resolve(__dirname, '..', 'sd-start.js');
const SOURCE = fs.readFileSync(SD_START_PATH, 'utf8');

describe('sd-start.js cadence gate wiring', () => {
  it('D1: getSDDetails SELECT must include governance_metadata and metadata', () => {
    // The cadence helper reads sd.governance_metadata + sd.metadata. If the
    // SELECT omits them, every gate evaluation runs on undefined and the gate
    // is dead code regardless of how many call sites we add.
    // Anchor to the getSDDetails function body; multiple .from('strategic_directives_v2')
    // calls exist in this file.
    const fnMatch = SOURCE.match(/async function getSDDetails\([\s\S]*?\n}/);
    expect(fnMatch, 'getSDDetails function must be present').not.toBeNull();
    const selectMatch = fnMatch[0].match(/\.select\('([^']+)'\)/);
    expect(selectMatch, 'getSDDetails .select(...) must be present').not.toBeNull();
    const cols = selectMatch[1].split(',').map(c => c.trim());
    expect(cols).toContain('governance_metadata');
    expect(cols).toContain('metadata');
  });

  it('D2: enforceCadenceGate must be defined and called at least twice in main()', () => {
    expect(SOURCE).toMatch(/async function enforceCadenceGate\s*\(/);
    const callCount = (SOURCE.match(/await enforceCadenceGate\s*\(/g) || []).length;
    expect(callCount, 'gate must be invoked once on the parent SD and again after orchestrator leaf routing').toBeGreaterThanOrEqual(2);
  });

  it('D2: post-leaf-routing cadence re-check must follow the leaf reassignment', () => {
    // The second call site must be positioned AFTER `effectiveId = childId`
    // (the leaf reassignment) and INSIDE the orchestrator-detection branch.
    // Otherwise the gate runs on the parent's metadata twice, not the leaf's.
    const reassignIdx = SOURCE.indexOf('effectiveId = childId');
    expect(reassignIdx, 'leaf reassignment site not found').toBeGreaterThan(-1);
    const afterReassign = SOURCE.slice(reassignIdx);
    expect(afterReassign).toMatch(/await enforceCadenceGate\s*\(\s*sd\s*,\s*effectiveId\s*\)/);
  });

  it('helper imports the canonical pre-claim-gate module', () => {
    // Drift guard: helper must read computeGateState from
    // lib/cadence/pre-claim-gate.mjs, not a local re-implementation.
    expect(SOURCE).toMatch(/import\(['"]\.\.\/lib\/cadence\/pre-claim-gate\.mjs['"]\)/);
  });
});
