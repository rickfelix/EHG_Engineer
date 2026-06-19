/**
 * SD-LEO-INFRA-GOVERNANCE-ROLE-ADHERENCE-DBVALIDATION-001 — coordinator mirror detectors (FR-3).
 * Proves the SOURCE-TO-CAPACITY handshake + D3-lean detectors flag the right violations and
 * fail-loud on unresolved inputs.
 */
import { describe, it, expect } from 'vitest';
import {
  detectSourceToCapacity,
  detectCoordinatorWithoutAdam,
} from '../../../lib/coordinator/charter-audit-detectors.mjs';

describe('detectSourceToCapacity (FR-3 handshake)', () => {
  it('violates when belt-low + idle but no recent source request', () => {
    const r = detectSourceToCapacity({ claimableBelt: 0, idleWorkers: 2, sourceRequestedRecently: false });
    expect(r.violation).toBe(true);
    expect(r.remediation).toMatch(/ping Adam/i);
  });
  it('passes when the coordinator DID request work on a low belt', () => {
    expect(detectSourceToCapacity({ claimableBelt: 0, idleWorkers: 2, sourceRequestedRecently: true }).violation).toBe(false);
  });
  it('passes when the belt is healthy (no handshake needed)', () => {
    expect(detectSourceToCapacity({ claimableBelt: 5, idleWorkers: 2, sourceRequestedRecently: false }).violation).toBe(false);
  });
  it('passes when no workers are idle', () => {
    expect(detectSourceToCapacity({ claimableBelt: 0, idleWorkers: 0, sourceRequestedRecently: false }).violation).toBe(false);
  });
  it('fail-loud (violation) when any input is unresolved', () => {
    expect(detectSourceToCapacity({ claimableBelt: null, idleWorkers: 2, sourceRequestedRecently: false }).violation).toBe(true);
    expect(detectSourceToCapacity({}).violation).toBe(true);
  });
});

describe('detectCoordinatorWithoutAdam (FR-3 D3-lean)', () => {
  it('violates when a coordinator is live but no live Adam', () => {
    const r = detectCoordinatorWithoutAdam({ coordinatorAlive: true, adamAlive: false });
    expect(r.violation).toBe(true);
    expect(r.remediation).toMatch(/Adam/i);
  });
  it('passes when both coordinator and Adam are live', () => {
    expect(detectCoordinatorWithoutAdam({ coordinatorAlive: true, adamAlive: true }).violation).toBe(false);
  });
  it('passes when the coordinator is not live (nothing to pair)', () => {
    expect(detectCoordinatorWithoutAdam({ coordinatorAlive: false, adamAlive: false }).violation).toBe(false);
  });
  it('fail-loud (violation) on unresolved liveness', () => {
    expect(detectCoordinatorWithoutAdam({ coordinatorAlive: null, adamAlive: true }).violation).toBe(true);
    expect(detectCoordinatorWithoutAdam({}).violation).toBe(true);
  });
});
