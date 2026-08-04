// SD-LEO-INFRA-TIER-GATE-FLAG-001 (FR-7). Tests the HARM, not the boolean.
//
// Every scenario in the original PRD asserted only what tierGateEnabled() RETURNED.
// All of them passed with the `if (gateOn)` branch deleted — a suite that certifies a
// gate which no longer gates. What must actually hold is that a destructive migration
// never reaches the auto-apply path, so that is what these cases assert, using the real
// classifier over real SQL files rather than a hand-written tier fixture.
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  classifyPendingTiers,
  partitionByTierGate
} from '../../scripts/modules/handoff/pre-checks/pending-migrations-check.js';

const tmp = mkdtempSync(path.join(tmpdir(), 'tier-gate-harm-'));
const sql = (name, body) => {
  const p = path.join(tmp, name);
  writeFileSync(p, body, 'utf8');
  return p;
};
afterAll(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ } });

const DESTRUCTIVE = sql('drop.sql', 'DROP TABLE public.ventures;');
const ADDITIVE = sql('add.sql', 'ALTER TABLE public.ventures ADD COLUMN note text;');

describe('FR-7 — a destructive migration never reaches the auto-apply path', () => {
  it('DROP TABLE classifies TIER-2 and is DEFERRED, not eligible', () => {
    const classified = classifyPendingTiers([{ file: DESTRUCTIVE, status: 'PENDING' }]);
    expect(classified[0].tier).toBe(2); // fixture sanity: if this were TIER-1 the test below would be vacuous

    const { tier1Pending, tier2Deferred } = partitionByTierGate(classified, []);
    expect(tier2Deferred.map(m => m.file)).toContain(DESTRUCTIVE);
    expect(tier1Pending.map(m => m.file)).not.toContain(DESTRUCTIVE);
  });

  // The discriminating half. Without it, a partition that simply deferred EVERYTHING
  // would satisfy the case above while breaking all legitimate auto-apply.
  it('DISCRIMINATES: an additive migration IS eligible', () => {
    const classified = classifyPendingTiers([{ file: ADDITIVE, status: 'PENDING' }]);
    expect(classified[0].tier).toBe(1);

    const { tier1Pending, tier2Deferred } = partitionByTierGate(classified, []);
    expect(tier1Pending.map(m => m.file)).toContain(ADDITIVE);
    expect(tier2Deferred).toHaveLength(0);
  });

  it('BOTH auto-apply vectors are gated — uncommitted manual updates too, not just SD-declared', () => {
    const classifiedUnc = classifyPendingTiers([
      { file: DESTRUCTIVE, status: 'UNCOMMITTED' },
      { file: ADDITIVE, status: 'UNCOMMITTED' }
    ]);
    const { uncommittedEligible, uncommittedDeferred } = partitionByTierGate([], classifiedUnc);
    expect(uncommittedDeferred).toContain(DESTRUCTIVE);
    expect(uncommittedEligible).toContain(ADDITIVE);
    expect(uncommittedEligible).not.toContain(DESTRUCTIVE);
  });

  it('an UNREADABLE migration defers (default-deny at the gate edge)', () => {
    const classified = classifyPendingTiers([{ file: path.join(tmp, 'does-not-exist.sql'), status: 'PENDING' }]);
    expect(classified[0].tier).toBe(2);
    const { tier1Pending } = partitionByTierGate(classified, []);
    expect(tier1Pending).toHaveLength(0);
  });

  it('an UNEXPECTED tier value defers rather than auto-applying', () => {
    // Partitioning on `tier !== 1` rather than `tier === 2` means a null/undefined/novel
    // tier — a classifier bug, or a third tier added later — fails safe instead of
    // silently landing in the eligible list.
    const weird = [
      { file: 'a.sql', tier: null },
      { file: 'b.sql', tier: undefined },
      { file: 'c.sql', tier: 3 }
    ];
    const { tier1Pending, tier2Deferred } = partitionByTierGate(weird, []);
    expect(tier1Pending).toHaveLength(0);
    expect(tier2Deferred).toHaveLength(3);
  });
});
