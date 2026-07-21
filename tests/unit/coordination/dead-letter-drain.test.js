// QF-20260721-737 — dead-letter drain classifier (retarget role-orphans, stamp the rest).
import { describe, it, expect } from 'vitest';
import { classifyDeadLetterRow, resolveTargetRole, summarizeDrain, HIGH_VALUE_KINDS } from '../../../lib/coordination/dead-letter-drain.js';

const COORD = 'live-coordinator-uuid';
const ctx = { successors: { coordinator: COORD, solomon: 'live-solomon-uuid' } };

describe('resolveTargetRole', () => {
  it('adam_advisory is addressed to the coordinator', () => {
    expect(resolveTargetRole({ payload: { kind: 'adam_advisory' } })).toBe('coordinator');
  });
  it('solomon_consult is addressed to solomon', () => {
    expect(resolveTargetRole({ payload: { kind: 'solomon_consult' } })).toBe('solomon');
  });
  it('parses an explicit -> ROLE arrow in the subject', () => {
    expect(resolveTargetRole({ message_type: 'INFO', subject: '[CHAIRMAN -> COORD] go/no-go' })).toBe('coordinator');
  });
  it('a coordinator->worker reply resolves to no role', () => {
    expect(resolveTargetRole({ payload: { kind: 'coordinator_reply' }, subject: '[COORD->Charlie] noted' })).toBeNull();
  });
});

describe('classifyDeadLetterRow', () => {
  it('RETARGETS a high-value role-orphan (adam_advisory -> dead coordinator) to the live coordinator', () => {
    const r = classifyDeadLetterRow({ payload: { kind: 'adam_advisory' }, target_session: 'dead-coord', subject: '[ADAM -> COORD] catch' }, ctx);
    expect(r.action).toBe('retarget');
    expect(r.successor).toBe(COORD);
    expect(r.role).toBe('coordinator');
  });
  it('STAMPS a high-value message to a dead WORKER (no role-succession -> moot)', () => {
    const r = classifyDeadLetterRow({ payload: { kind: 'coordinator_reply' }, target_session: 'dead-worker', subject: '[COORD->Charlie] noted' }, ctx);
    expect(r.action).toBe('stamp');
    expect(r.reason).toMatch(/moot|worker/);
  });
  it('STAMPS pure noise (roll_call / CLAIM_RELEASED / INFO)', () => {
    for (const kind of ['roll_call', 'CLAIM_RELEASED', 'INFO', 'completion_nudge']) {
      expect(classifyDeadLetterRow({ payload: { kind }, target_session: 'dead' }, ctx).action).toBe('stamp');
    }
  });
  it('does NOT retarget if the successor equals the (not-actually-dead) target or is missing', () => {
    expect(classifyDeadLetterRow({ payload: { kind: 'adam_advisory' }, target_session: COORD }, ctx).action).toBe('stamp');
    expect(classifyDeadLetterRow({ payload: { kind: 'adam_advisory' }, target_session: 'x' }, { successors: {} }).action).toBe('stamp');
  });
  it('never leaves a high-value role-orphan un-retargeted when a successor exists', () => {
    for (const kind of HIGH_VALUE_KINDS) {
      const r = classifyDeadLetterRow({ payload: { kind }, target_session: 'dead-coord', subject: '-> COORD' }, ctx);
      // adam_advisory + subject-arrow both resolve to coordinator here -> retarget; solomon_consult -> solomon successor
      expect(['retarget', 'stamp']).toContain(r.action); // resolvable ones retarget; worker-role ones stamp
    }
  });
});

describe('summarizeDrain', () => {
  it('counts per-action and per-kind', () => {
    const s = summarizeDrain([
      { action: 'retarget', kind: 'adam_advisory' },
      { action: 'stamp', kind: 'roll_call' },
      { action: 'stamp', kind: 'roll_call' },
    ]);
    expect(s.retarget).toBe(1);
    expect(s.stamp).toBe(2);
    expect(s.byKind.roll_call.stamp).toBe(2);
  });
});
