/**
 * SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-A: pure taxonomy helper tests (no DB).
 */

import { describe, it, expect } from 'vitest';
import {
  CLASSIFICATION,
  WITNESS_MECHANISM,
  ENFORCEMENT_STRENGTH,
  expectedEnforcementStrength,
  isValidClassification,
  isValidWitnessMechanism,
} from '../../../lib/eva/gate-witness-taxonomy.js';

describe('gate-witness-taxonomy.js', () => {
  it('freezes the 3 classifications', () => {
    expect(Object.values(CLASSIFICATION).sort()).toEqual(
      ['already_witnessed', 'not_consequential_exempt', 'self_evidence_only'].sort()
    );
  });

  it('freezes the 3 witness mechanisms', () => {
    expect(Object.values(WITNESS_MECHANISM).sort()).toEqual(
      ['cross_actor', 'external_system', 'replay'].sort()
    );
  });

  it('expectedEnforcementStrength maps external_system -> structural, others -> convention', () => {
    expect(expectedEnforcementStrength(WITNESS_MECHANISM.EXTERNAL_SYSTEM)).toBe(ENFORCEMENT_STRENGTH.STRUCTURAL);
    expect(expectedEnforcementStrength(WITNESS_MECHANISM.CROSS_ACTOR)).toBe(ENFORCEMENT_STRENGTH.CONVENTION);
    expect(expectedEnforcementStrength(WITNESS_MECHANISM.REPLAY)).toBe(ENFORCEMENT_STRENGTH.CONVENTION);
  });

  it('isValidClassification / isValidWitnessMechanism reject unknown values', () => {
    expect(isValidClassification('bogus')).toBe(false);
    expect(isValidClassification(CLASSIFICATION.SELF_EVIDENCE_ONLY)).toBe(true);
    expect(isValidWitnessMechanism('bogus')).toBe(false);
    expect(isValidWitnessMechanism(WITNESS_MECHANISM.REPLAY)).toBe(true);
  });
});
