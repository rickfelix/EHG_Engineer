/**
 * Regression for the "Canvas AI" Stage-19 content-less phantom gate (2026-05-23):
 * the worker opened a chairman gate behind a FAILED stage, creating a pending
 * decision with no artifact/advisory → the venture parked at a content-less gate
 * and the panel spun "Loading…" forever. shouldOpenChairmanGate must refuse to
 * open a gate behind a failed/empty stage, while preserving the build-loop
 * governance-override path and the normal (successful-stage) review flow.
 */
import { describe, test, expect } from 'vitest';
import { shouldOpenChairmanGate } from '../should-open-chairman-gate.js';

describe('shouldOpenChairmanGate — no content-less gate behind a FAILED stage', () => {
  test('non-gate stage never opens a gate', () => {
    expect(shouldOpenChairmanGate({ isHardGate: false, stageFailed: false, canGovernanceOverrideFailed: false })).toBe(false);
    expect(shouldOpenChairmanGate({ isHardGate: false, stageFailed: true, canGovernanceOverrideFailed: false })).toBe(false);
  });

  test('hard gate + successful stage opens the gate (normal review flow)', () => {
    expect(shouldOpenChairmanGate({ isHardGate: true, stageFailed: false, canGovernanceOverrideFailed: false })).toBe(true);
  });

  test('REGRESSION: hard gate + FAILED + not governance-overridable does NOT open a gate', () => {
    // The exact Canvas AI S19 case: a failed stage must surface as FAILED, never as
    // a content-less "awaiting decision" gate.
    expect(shouldOpenChairmanGate({ isHardGate: true, stageFailed: true, canGovernanceOverrideFailed: false })).toBe(false);
  });

  test('hard gate + FAILED + build-loop governance override still opens the gate (unchanged)', () => {
    expect(shouldOpenChairmanGate({ isHardGate: true, stageFailed: true, canGovernanceOverrideFailed: true })).toBe(true);
  });
});
