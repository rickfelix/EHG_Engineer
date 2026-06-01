/**
 * SD-LEO-INFRA-HARDEN-S19-S20-001 (FR-1) — the pure bridge-outcome classifier + the single S19
 * hold/advance decision. These truth tables are the keystone: every gate consumer shares this
 * logic, so a regression here is a regression everywhere. TS-1 (classifyBridgeOutcome) and
 * TS-2 (shouldHoldAtS19) from the PRD test_scenarios.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyBridgeOutcome,
  shouldHoldAtS19,
  S19_BRIDGE_OUTCOME,
} from '../../../../lib/eva/bridge/s19-advance-decision.js';

const O = S19_BRIDGE_OUTCOME;

describe('classifyBridgeOutcome (TS-1)', () => {
  it('created:true → CREATED (regardless of payload count)', () => {
    expect(classifyBridgeOutcome({ created: true, errors: [] }, 0)).toBe(O.CREATED);
    expect(classifyBridgeOutcome({ created: true, errors: [] }, 5)).toBe(O.CREATED);
  });

  it('vision-missing error text → VISION_MISSING (derived from errStr, not a throw)', () => {
    expect(classifyBridgeOutcome({ created: false, errors: ['Venture X: no L2 vision document found.'] }, 1)).toBe(O.VISION_MISSING);
    expect(classifyBridgeOutcome({ created: false, errors: ['VENTURE_L2_VISION_MISSING'] }, 1)).toBe(O.VISION_MISSING);
    expect(classifyBridgeOutcome({ created: false, errors: ['needs draft_seed vision'] }, 1)).toBe(O.VISION_MISSING);
  });

  it('"already exists" error → NOOP_EXISTS', () => {
    expect(classifyBridgeOutcome({ created: false, errors: ['Orchestrator already exists for venture'] }, 1)).toBe(O.NOOP_EXISTS);
  });

  it('existing orchestratorKey + empty errors → NOOP_EXISTS (idempotency contract)', () => {
    expect(classifyBridgeOutcome({ created: false, errors: [], orchestratorKey: 'SD-LEO-ORCH-EXISTING' }, 1)).toBe(O.NOOP_EXISTS);
  });

  it('created:false + empty errors + 0 payloads → NOOP_EMPTY (nothing to build)', () => {
    expect(classifyBridgeOutcome({ created: false, errors: [], orchestratorKey: null }, 0)).toBe(O.NOOP_EMPTY);
    expect(classifyBridgeOutcome({ created: false, errors: [] }, undefined)).toBe(O.NOOP_EMPTY);
  });

  it('created:false + empty errors + payloads present → ZERO_SDS_FAILURE (THE SCHISM)', () => {
    // This is exactly the case the old `!created && errors.length===0` rule mis-read as idempotent.
    expect(classifyBridgeOutcome({ created: false, errors: [], orchestratorKey: null }, 3)).toBe(O.ZERO_SDS_FAILURE);
  });

  it('created:false + non-idempotent failure errors + payloads → ZERO_SDS_FAILURE', () => {
    expect(classifyBridgeOutcome({ created: false, errors: ['SD_TYPE_CHANGE rollback'], orchestratorKey: null }, 2)).toBe(O.ZERO_SDS_FAILURE);
  });
});

describe('shouldHoldAtS19 (TS-2)', () => {
  const ALL = [O.CREATED, O.NOOP_EXISTS, O.NOOP_EMPTY, O.ZERO_SDS_FAILURE, O.VISION_MISSING];

  it('buildComplete===true → ADVANCE for every outcome (complete tree OR chairman_override)', () => {
    for (const o of ALL) expect(shouldHoldAtS19(o, true)).toBe(false);
  });

  it('buildComplete===null → ADVANCE for every outcome (non-leo_bridge falls through)', () => {
    for (const o of ALL) expect(shouldHoldAtS19(o, null)).toBe(false);
  });

  it('buildComplete===false + NOOP_EMPTY → ADVANCE (the infinite-hold guard)', () => {
    expect(shouldHoldAtS19(O.NOOP_EMPTY, false)).toBe(false);
  });

  it('buildComplete===false + every other outcome → HOLD', () => {
    expect(shouldHoldAtS19(O.CREATED, false)).toBe(true);
    expect(shouldHoldAtS19(O.NOOP_EXISTS, false)).toBe(true);
    expect(shouldHoldAtS19(O.ZERO_SDS_FAILURE, false)).toBe(true);
    expect(shouldHoldAtS19(O.VISION_MISSING, false)).toBe(true);
  });

  it('the ONLY signal that distinguishes 0-SD advance from 0-SD hold is the outcome enum', () => {
    // Both NOOP_EMPTY and ZERO_SDS_FAILURE yield _isLeoBridgeBuildComplete===false (0 SDs);
    // only the enum tells them apart.
    expect(shouldHoldAtS19(O.NOOP_EMPTY, false)).toBe(false);     // advance
    expect(shouldHoldAtS19(O.ZERO_SDS_FAILURE, false)).toBe(true); // hold
  });
});
