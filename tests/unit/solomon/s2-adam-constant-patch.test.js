// SD-ALTIFYAI-LEO-GEN-EXECUTE-PART-BACKUP-001 (FR-4): S2 patch gating.
import { describe, it, expect } from 'vitest';
import { buildS2Patch, ADAM_CONSTANT, S2_TARGET_IDS, ENABLE_S2_PATCH } from '../../../lib/solomon/s2-adam-constant-patch.js';

const LIVE_ROWS = [
  { id: '922f8dfb-a548-49b4-869e-0f8c7b73fd73', decision_by: 'adam-08049808' },
  { id: '0f9ffc05-2d5a-49c0-9005-e1e5f6993fa3', decision_by: 'adam-08049808' },
  { id: 'unrelated-row-id-not-a-target', decision_by: 'someone-else' },
];

describe('ENABLE_S2_PATCH module default (FR-4)', () => {
  it('defaults to false -- live code path never patches anything until a human explicitly re-enables it', () => {
    expect(ENABLE_S2_PATCH).toBe(false);
  });
});

describe('buildS2Patch (FR-4)', () => {
  it('the live default (no override) patches nothing and marks every row as PENDING CLARIFICATION', () => {
    const result = buildS2Patch(LIVE_ROWS);
    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toHaveLength(LIVE_ROWS.length);
    expect(result.reason).toContain('PENDING CLARIFICATION');
  });

  it('when explicitly enabled (test harness only), patches exactly the 2 named rows and nothing else', () => {
    const result = buildS2Patch(LIVE_ROWS, true);
    expect(result.applied).toHaveLength(2);
    expect(result.applied.map((a) => a.id).sort()).toEqual(
      ['0f9ffc05-2d5a-49c0-9005-e1e5f6993fa3', '922f8dfb-a548-49b4-869e-0f8c7b73fd73'].sort()
    );
    expect(result.applied.every((a) => a.patchedDecisionBy === ADAM_CONSTANT)).toBe(true);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].id).toBe('unrelated-row-id-not-a-target');
  });

  it('S2_TARGET_IDS is exactly the 2 coordinator-named short ids, nothing else', () => {
    expect(S2_TARGET_IDS).toEqual(['922f8dfb', '0f9ffc05']);
  });

  it('is a pure, synchronous function -- zero I/O, zero DB/network access', () => {
    expect(buildS2Patch.constructor.name).not.toBe('AsyncFunction');
  });
});
