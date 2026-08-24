import { describe, it, expect } from 'vitest';

/**
 * SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 — RCA guard test (CAPA #3).
 *
 * A literal mock-hoisting trigger token (a "vi"+".mock(" pair) sitting in an unrelated COMMENT
 * inside lead-final-approval/gates.js routed this entire production module through
 * @vitest/mocker's hoistMocks transform (its `regexpHoistable` scan is comment-blind — raw file
 * text, not parsed source). That transform's rewrite does not correctly handle `export { X };` of
 * a plain locally-imported binding: Vite's generated export getter throws on the (hoisted-away)
 * local reference, and a wrapping try/catch silently converts the throw into `undefined`. One
 * mistaken comment silently broke 11 of 12 such re-exports in gates.js — invisible because no test
 * imported those 11 factories via the gates.js namespace before this SD's own wiring-proof test
 * (tests/unit/invocation-detector/invocation-path-gate.test.js) happened to exercise one of them.
 *
 * This is a namespace-level smoke test, not a per-gate functional test — it exists purely to catch
 * a re-export silently going missing under vitest, a class of failure that reads as a working
 * export to every other check (lint, TypeScript-less JS, a plain `node` import) and is only
 * observable through vitest's own transform.
 */
describe('gates.js namespace — every re-exported gate factory resolves as a function', () => {
  it('all `export { X };`-style re-exports are live under vitest (not silently undefined)', async () => {
    const mod = await import('../../scripts/modules/handoff/executors/lead-final-approval/gates.js');
    const expectedFactories = [
      'createSmokeTestGate',
      'createAutomatedUatGate',
      'createWiringValidationGate',
      'createWireCheckGate',
      'createInvocationPathGate',
      'createPhantomTestAuditGate',
      'createAcceptanceTierDowngradeGate',
      'createLearningOrBypassResolvedGate',
      'createAdkarAdoptionGate',
      'createDeferredFollowupsGate',
      'createCrossSdFileOverlapTemporalShipGate',
      'createActivationInvariantGate',
      // Locally-declared exports (not import-then-export re-exports) — included as a control
      // group: these were never susceptible to the specific defect above, so they should always
      // pass. If one of these ever fails, it's a different, genuinely new problem.
      'computeReposForSD',
      'isNeverPushedSpecimen',
      'getRequiredGates',
      'createPRMergeVerificationGate',
      'createPRPrecheckGate',
    ];
    const broken = expectedFactories.filter((name) => typeof mod[name] !== 'function');
    expect(broken).toEqual([]);
  });

  it('gates.js source contains no vi/vitest mock-hoisting trigger token, comments included', async () => {
    // Reads the ACTUAL SOURCE TEXT (not the transformed module) to catch the root cause directly,
    // not just its symptom — mirrors @vitest/mocker's own comment-blind regexpHoistable scan.
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const gatesPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../scripts/modules/handoff/executors/lead-final-approval/gates.js',
    );
    const source = fs.readFileSync(gatesPath, 'utf8');
    const regexpHoistable = /\b(?:vi|vitest)\s*\.\s*(?:mock|unmock|hoisted|doMock|doUnmock)\s*\(/;
    expect(regexpHoistable.test(source)).toBe(false);
  });
});
