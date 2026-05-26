/**
 * SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 — FR-1 / TS-5: no-bypass venture-SD creation.
 *
 * The lifecycle bridge must create the venture build tree (orchestrator -> children
 * -> grandchildren -> expansion) with NO governance bypass, so each SD is held to
 * full LEO rigor and reaches the REAL SD_TYPE_VALIDATION gate (not the
 * `isTypeLocked` short-circuit). This pins the de-bypassed governance metadata.
 */
import { describe, it, expect } from 'vitest';
import { ventureGovernanceMetadata } from '../../lib/eva/bridge/venture-governance-metadata.js';

// Mirror of the gate predicate (scripts/.../sd-type-validation.js::isTypeLocked and
// scripts/prd/index.js::isTypeLocked) — the only two readers of bypass_governance.
function isTypeLocked(govMeta) {
  if (!govMeta) return false;
  if (govMeta.type_locked === true) return true;
  if (govMeta.automation_context?.bypass_governance === true) return true;
  return false;
}

const TIERS = ['orchestrator', 'child', 'grandchild', 'expansion'];

describe('FR-1 / TS-5: venture governance metadata carries no bypass', () => {
  for (const tier of TIERS) {
    const gm = ventureGovernanceMetadata(tier);

    it(`${tier}: no automation_context.bypass_governance`, () => {
      expect(gm.automation_context).toBeDefined();
      expect(gm.automation_context.bypass_governance).toBeUndefined();
    });

    it(`${tier}: no bypass_reason / type_locked anywhere`, () => {
      expect(gm.bypass_reason).toBeUndefined();
      expect(gm.automation_context.bypass_reason).toBeUndefined();
      expect(gm.type_locked).toBeUndefined();
    });

    it(`${tier}: the gate sees it as NOT type-locked → real validation runs`, () => {
      expect(isTypeLocked(gm)).toBe(false);
    });

    it(`${tier}: preserves headless automation provenance for audit`, () => {
      expect(gm.automation_context).toMatchObject({
        actor_role: 'LEO_ORCHESTRATOR',
        created_via: 'lifecycle-sd-bridge',
        headless: true,
        tier,
      });
    });
  }
});
