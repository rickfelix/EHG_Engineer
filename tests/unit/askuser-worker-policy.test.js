/**
 * SD-FDBK-ENH-ENFORCEMENT-IDEA-OPERATOR-001 — AskUserQuestion is blocked for autonomous
 * fleet workers (it pauses the /loop), but EXEMPT for coordinator / Adam / operator-chairman
 * and on any unresolved metadata (fail-open). These tests pin isBlockableWorker, the pure
 * predicate the PreToolUse guard (pre-tool-enforce.cjs) uses to decide.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { isBlockableWorker, ASKUSER_DENY_MESSAGE } = require('../../scripts/hooks/askuser-worker-policy.cjs');

describe('isBlockableWorker — AskUserQuestion block policy (SD-FDBK-ENH-ENFORCEMENT-IDEA-OPERATOR-001)', () => {
  it('BLOCKS a fleet worker (fleet_identity.callsign present, not privileged)', () => {
    expect(isBlockableWorker({ fleet_identity: { callsign: 'Echo' }, auto_proceed: true })).toBe(true);
  });

  it('BLOCKS a fleet worker that carries a top-level callsign', () => {
    expect(isBlockableWorker({ callsign: 'Foxtrot' })).toBe(true);
  });

  it('EXEMPTS the coordinator (metadata.is_coordinator)', () => {
    expect(isBlockableWorker({ is_coordinator: true })).toBe(false);
  });

  it('EXEMPTS the coordinator even if it also has a callsign (privilege wins)', () => {
    expect(isBlockableWorker({ is_coordinator: true, fleet_identity: { callsign: 'X' } })).toBe(false);
  });

  it('EXEMPTS Adam (metadata.role === "adam")', () => {
    expect(isBlockableWorker({ role: 'adam', non_fleet: true })).toBe(false);
  });

  it('EXEMPTS a non_fleet session (chairman/adam helper)', () => {
    expect(isBlockableWorker({ non_fleet: true, fleet_identity: { callsign: 'Y' } })).toBe(false);
  });

  it('EXEMPTS an operator / chairman interactive session (no fleet identity)', () => {
    expect(isBlockableWorker({ auto_proceed: true, chain_orchestrators: true })).toBe(false);
  });

  it('FAILS OPEN (exempt) when metadata is null / undefined / garbage', () => {
    expect(isBlockableWorker(null)).toBe(false);
    expect(isBlockableWorker(undefined)).toBe(false);
    expect(isBlockableWorker('not-an-object')).toBe(false);
    expect(isBlockableWorker({})).toBe(false);
  });

  it('deny message names the /signal escalation path with the options+recommendation+default contract', () => {
    expect(ASKUSER_DENY_MESSAGE).toMatch(/\/signal/);
    expect(ASKUSER_DENY_MESSAGE).toMatch(/options/);
    expect(ASKUSER_DENY_MESSAGE).toMatch(/recommendation/);
    expect(ASKUSER_DENY_MESSAGE).toMatch(/default/);
    expect(ASKUSER_DENY_MESSAGE).toMatch(/exempt/i);
  });
});
