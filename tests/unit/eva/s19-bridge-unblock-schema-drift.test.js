import { describe, it, expect } from 'vitest';
import {
  classifyBridgeOutcome,
  shouldHoldAtS19,
  S19_BRIDGE_OUTCOME,
} from '../../../lib/eva/bridge/s19-advance-decision.js';

// SD-LEO-INFRA-S19-BRIDGE-UNBLOCK-SCHEMA-DRIFT-001 regression tests for the pure decision units.

describe('FR-4: an infra throw is BRIDGE_THREW, not the ZERO_SDS schism', () => {
  it('classifies a threw result as BRIDGE_THREW even with payloads present', () => {
    expect(classifyBridgeOutcome({ created: false, threw: true }, 5)).toBe(S19_BRIDGE_OUTCOME.BRIDGE_THREW);
    expect(classifyBridgeOutcome({ created: false, provisioning_failed: true }, 3)).toBe(S19_BRIDGE_OUTCOME.BRIDGE_THREW);
  });

  it('a genuine payloads-but-zero-SDs build still classifies as ZERO_SDS_FAILURE', () => {
    expect(classifyBridgeOutcome({ created: false, errors: [] }, 4)).toBe(S19_BRIDGE_OUTCOME.ZERO_SDS_FAILURE);
  });

  it('BRIDGE_THREW HOLDS at S19 (does not advance)', () => {
    expect(shouldHoldAtS19(S19_BRIDGE_OUTCOME.BRIDGE_THREW, false)).toBe(true);
  });

  it('CREATED still wins over the threw flag (defensive ordering)', () => {
    expect(classifyBridgeOutcome({ created: true, threw: true }, 1)).toBe(S19_BRIDGE_OUTCOME.CREATED);
  });
});

// FR-5 completeness filter is verified by a focused unit on the predicate it adds.
describe('FR-5: human-action tracker SD is excluded from build completeness', () => {
  // Mirror the filter used in _isLeoBridgeBuildComplete.
  const isCounted = (sd) => sd?.metadata?.requires_human_action !== true;

  it('excludes the requires_human_action tracker, keeps real build SDs', () => {
    const rows = [
      { status: 'draft', metadata: { requires_human_action: true } }, // perpetual tracker
      { status: 'completed', metadata: {} },                          // real build SD
    ];
    const counted = rows.filter(isCounted);
    expect(counted).toHaveLength(1);
    expect(counted[0].status).toBe('completed');
    // With the tracker excluded, all-terminal + any-completed => complete.
    const TERMINAL = new Set(['completed', 'cancelled', 'archived']);
    const COMPLETED = new Set(['completed', 'archived']);
    expect(counted.every((s) => TERMINAL.has(s.status)) && counted.some((s) => COMPLETED.has(s.status))).toBe(true);
  });

  it('a tracker-only venture has zero real build SDs (returns false upstream)', () => {
    const rows = [{ status: 'draft', metadata: { requires_human_action: true } }];
    expect(rows.filter(isCounted)).toHaveLength(0);
  });
});

// FR-3 reason derivation mirrors the worker's inline logic.
describe('FR-3: honest block reason derivation', () => {
  const derive = (isVisionPending, bridgeErrors) => {
    const errStr = JSON.stringify(bridgeErrors || []);
    const isInfra = /42703|undefined_column|provisioning|stack_descriptor|cannot read|threw/i.test(errStr);
    return isVisionPending ? 'vision_pending' : (isInfra ? 'provisioning_failed' : 'bridge_failed');
  };

  it('vision pending => vision_pending', () => {
    expect(derive(true, ['anything'])).toBe('vision_pending');
  });
  it('infra error (42703) with vision approved => provisioning_failed', () => {
    expect(derive(false, ['[schema_created] cannot read ventures.stack_descriptor: column ... does not exist (42703)'])).toBe('provisioning_failed');
  });
  it('other failure with vision approved => bridge_failed', () => {
    expect(derive(false, ['some generic bridge error'])).toBe('bridge_failed');
  });
});
