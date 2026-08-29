/**
 * SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001 (FR-2) — sd-start.js claim-primitive tier gate.
 *
 * scripts/sd-start.js is a CLI (process.exit / console.log throughout, no module exports), so this
 * suite is a source-pin, matching the existing WIRING PINS pattern in
 * tests/unit/claim-eligibility-all-match.test.js: cheap, deterministic proof the wiring exists and
 * reuses the shared predicate rather than hand-rolling a comparison. Moving/removing the wiring
 * requires updating this pin in the same commit.
 *
 * Confirmed via census (scripts/tier-floor-census.mjs) that sd-start.js had ZERO tier enforcement
 * before this SD — the claim primitive itself was the gap, distinct from the self-claim/stranded/
 * orphan lanes fixed by SD-LEO-INFRA-SELF-CLAIM-TIER-ENFORCEMENT-001.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(resolve(repoRoot, 'scripts/sd-start.js'), 'utf8');

describe('sd-start.js tier gate wiring (FR-2)', () => {
  it('imports resolveWorkerTierRank/isTieringActive and tierBlocks (reuse, not re-derive)', () => {
    expect(src).toMatch(/cjsRequire\('\.\.\/lib\/fleet\/tier-ladder\.cjs'\)/);
    expect(src).toMatch(/cjsRequire\('\.\.\/lib\/fleet\/tier-claimable\.cjs'\)/);
    expect(src).toMatch(/tierBlocks\(sd, workerTierRank, tieringActive\)/);
  });

  it('defines enforceTierGate and calls it at BOTH claim sites (direct claim + leaf-routed claim)', () => {
    expect(src).toMatch(/async function enforceTierGate\(sd, effectiveId\)/);
    const callSites = src.match(/await enforceTierGate\(sd, effectiveId\);/g) || [];
    expect(callSites.length).toBe(2);
  });

  it('fails open on a resolution error and fails closed only on a genuine tierBlocks() true', () => {
    expect(src).toMatch(/tier gate skipped — resolution error, fail-open/);
    expect(src).toMatch(/if \(!tierBlocks\(sd, workerTierRank, tieringActive\)\) return;/);
  });
});
