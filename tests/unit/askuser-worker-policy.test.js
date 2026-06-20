/**
 * SD-FDBK-ENH-ENFORCEMENT-IDEA-OPERATOR-001 — AskUserQuestion is blocked for autonomous
 * fleet workers (it pauses the /loop), but EXEMPT for coordinator / Adam / operator-chairman
 * and on any unresolved metadata (fail-open). These tests pin isBlockableWorker, the pure
 * predicate the PreToolUse guard (pre-tool-enforce.cjs) uses to decide.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { isBlockableWorker, decideAskUserBlock, ASKUSER_DENY_MESSAGE } = require('../../scripts/hooks/askuser-worker-policy.cjs');

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

  // --- loop_state hardening (operator 2026-06-10): a /loop worker with no assigned callsign
  //     is STILL an autonomous worker and must be blocked; coordinator/Adam stay exempt. ---
  it('BLOCKS a callsign-LESS worker that is in an active /loop (loop_state=active)', () => {
    expect(isBlockableWorker({ source: 'startup' }, 'active')).toBe(true);
  });

  it('BLOCKS a callsign-less worker parked on a wakeup (loop_state=awaiting_tick)', () => {
    expect(isBlockableWorker({}, 'awaiting_tick')).toBe(true);
  });

  it('EXEMPTS the coordinator even when in a loop (privilege wins over loop_state)', () => {
    expect(isBlockableWorker({ is_coordinator: true }, 'active')).toBe(false);
  });

  it('EXEMPTS Adam even when in a loop', () => {
    expect(isBlockableWorker({ role: 'adam' }, 'active')).toBe(false);
  });

  it('does NOT block a plain interactive session (no callsign, loop_state exited/unknown/null)', () => {
    expect(isBlockableWorker({ source: 'startup' }, 'exited')).toBe(false);
    expect(isBlockableWorker({ source: 'startup' }, 'unknown')).toBe(false);
    expect(isBlockableWorker({ source: 'startup' }, null)).toBe(false);
    expect(isBlockableWorker({ source: 'startup' })).toBe(false); // loopState omitted
  });

  it('FAILS OPEN when metadata is null even if loop_state says active (cannot verify exemptions)', () => {
    expect(isBlockableWorker(null, 'active')).toBe(false);
  });

  it('deny message names the /signal escalation path with the options+recommendation+default contract', () => {
    expect(ASKUSER_DENY_MESSAGE).toMatch(/\/signal/);
    expect(ASKUSER_DENY_MESSAGE).toMatch(/options/);
    expect(ASKUSER_DENY_MESSAGE).toMatch(/recommendation/);
    expect(ASKUSER_DENY_MESSAGE).toMatch(/default/);
    expect(ASKUSER_DENY_MESSAGE).toMatch(/exempt/i);
  });
});

// SD-LEO-INFRA-ASKUSER-GUARD-FAILOPEN-HARDEN-001 (FR-2/FR-5): the positive-worker FLOOR closes the
// fail-open residual that still hung a worker on 2026-06-20 (no ENF block row was written ⇒ the
// guard reached 'allow'). decideAskUserBlock blocks a session with POSITIVE worker evidence even
// when metadata is momentarily unresolvable — while NEVER blocking operator/chairman/Adam/coordinator.
describe('decideAskUserBlock — positive-worker floor (FR-2)', () => {
  it('blocks a metadata-confirmed worker (callsign)', () => {
    expect(decideAskUserBlock({ meta: { callsign: 'Delta' }, loopState: null, hasClaim: false }).block).toBe(true);
  });

  it('blocks a callsign-less /loop worker (loop_state)', () => {
    expect(decideAskUserBlock({ meta: {}, loopState: 'active', hasClaim: false }).block).toBe(true);
  });

  // THE 2026-06-20 RESIDUAL: metadata unresolvable (timeout) but the session provably holds an SD
  // claim → it is a worker → BLOCK (previously fell through to allow and hung).
  it('FLOOR: blocks when metadata is unresolved (null) but the session holds an sd_key claim', () => {
    const d = decideAskUserBlock({ meta: null, loopState: null, hasClaim: true });
    expect(d.block).toBe(true);
    expect(d.reason).toBe('holds-sd-claim-floor');
  });

  // Post-completion window: callsign dropped, loop exited, but still holds the claim → BLOCK.
  it('FLOOR: blocks a post-completion worker (no callsign, loop_state=exited) that still holds a claim', () => {
    expect(decideAskUserBlock({ meta: { source: 'startup' }, loopState: 'exited', hasClaim: true }).block).toBe(true);
  });

  // HARD LINE: operator/chairman/Adam/coordinator must NEVER be blocked.
  it('NEVER blocks a genuine operator (no positive evidence at all)', () => {
    expect(decideAskUserBlock({ meta: { auto_proceed: true }, loopState: null, hasClaim: false }).block).toBe(false);
  });

  it('NEVER blocks when metadata unresolved AND no claim (genuine interactive session)', () => {
    const d = decideAskUserBlock({ meta: null, loopState: null, hasClaim: false });
    expect(d.block).toBe(false);
    expect(d.reason).toBe('no-positive-evidence');
  });

  it('NEVER blocks the coordinator even if (impossibly) it held a claim — exemption wins over the floor', () => {
    expect(decideAskUserBlock({ meta: { is_coordinator: true }, loopState: 'active', hasClaim: true }).block).toBe(false);
  });

  it('NEVER blocks Adam even with a claim', () => {
    expect(decideAskUserBlock({ meta: { role: 'adam' }, loopState: null, hasClaim: true }).block).toBe(false);
  });

  it('NEVER blocks a non_fleet helper even with a claim', () => {
    expect(decideAskUserBlock({ meta: { non_fleet: true }, loopState: null, hasClaim: true }).block).toBe(false);
  });

  it('tolerates an empty/garbage ctx without throwing (fail-open allow)', () => {
    expect(decideAskUserBlock(undefined).block).toBe(false);
    expect(decideAskUserBlock({}).block).toBe(false);
  });
});
