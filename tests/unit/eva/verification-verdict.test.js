/**
 * Unit tests for the Verify layer — adversarial verification + conflict resolution.
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 3 (FR-005)
 */
import { describe, it, expect } from 'vitest';
import { aggregateRefutations, verifySection, resolveConflict } from '../../../lib/eva/bridge/verification-verdict.js';

const confirm = { refuted: false };
const refute = (reason = 'flaw') => ({ refuted: true, reason });

describe('aggregateRefutations', () => {
  it('survives when fewer than the threshold refute', () => {
    const r = aggregateRefutations([confirm, confirm, refute()]); // 1/3 < 0.5
    expect(r.survives).toBe(true);
    expect(r.refutedCount).toBe(1);
    expect(r.reason).toBe('survived');
  });

  it('fails when a majority refute (and collects their reasons)', () => {
    const r = aggregateRefutations([refute('a'), refute('b'), confirm]); // 2/3 >= 0.5
    expect(r.survives).toBe(false);
    expect(r.reasons).toEqual(expect.arrayContaining(['a', 'b']));
    expect(r.reason).toBe('refuted_by_majority');
  });

  it('counts null/missing verdicts as refutations (fail-closed)', () => {
    const r = aggregateRefutations([null, undefined, confirm]); // 2 treated as refuted
    expect(r.refutedCount).toBe(2);
    expect(r.survives).toBe(false);
  });

  it('does NOT survive with zero verifiers (nothing defended it)', () => {
    const r = aggregateRefutations([]);
    expect(r.survives).toBe(false);
    expect(r.reason).toBe('no_verifiers');
  });

  it('honors a custom threshold', () => {
    expect(aggregateRefutations([confirm, refute(), refute()], { threshold: 0.75 }).survives).toBe(true); // 2/3 < 0.75
    expect(aggregateRefutations([confirm, refute(), refute()], { threshold: 0.5 }).survives).toBe(false); // 2/3 >= 0.5
  });
});

describe('verifySection', () => {
  it('survives when refuters confirm the section', async () => {
    const refuteDriver = { refute: async () => confirm };
    const r = await verifySection({ section: 'a real schema', refuteDriver, refuterCount: 3 });
    expect(r.survives).toBe(true);
    expect(r.total).toBe(3);
  });

  it('fails when a majority of refuters find flaws', async () => {
    let n = 0;
    const refuteDriver = { refute: async () => (++n <= 2 ? refute(`flaw ${n}`) : confirm) };
    const r = await verifySection({ section: 'weak section', refuteDriver, refuterCount: 3 });
    expect(r.survives).toBe(false);
  });

  it('treats a thrown refuter as a refutation (fail-closed)', async () => {
    const refuteDriver = { refute: async () => { throw new Error('boom'); } };
    const r = await verifySection({ section: 's', refuteDriver, refuterCount: 3 });
    expect(r.survives).toBe(false);
    expect(r.refutedCount).toBe(3);
  });

  it('throws without a section or a refute driver', async () => {
    await expect(verifySection({ refuteDriver: { refute: async () => confirm } })).rejects.toThrow(/section/);
    await expect(verifySection({ section: 's' })).rejects.toThrow(/refuteDriver/);
  });
});

describe('resolveConflict', () => {
  it('routes a disagreement to the injected JUDGE and returns its verdict', async () => {
    const judgeDriver = { adjudicate: async ({ a, b }) => ({ winner: 'a', rationale: `${a} beats ${b}` }) };
    const v = await resolveConflict({ a: 'no full copies', b: 'copy everything', judgeDriver });
    expect(v.winner).toBe('a');
    expect(v.rationale).toContain('beats');
  });

  it('throws without a judge driver', async () => {
    await expect(resolveConflict({ a: 'x', b: 'y' })).rejects.toThrow(/judgeDriver/);
  });
});
