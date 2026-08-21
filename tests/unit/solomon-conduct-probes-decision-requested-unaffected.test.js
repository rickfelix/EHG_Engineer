/**
 * SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001 (TS-7) — lib/solomon/conduct-probes.js is a
 * SEPARATE, governance-purpose consumer of decision='pending' from the actionable-workload
 * resurfacer, holding its own explicit anti-aging design principle (see the comment at
 * lines 95-98 of that file: "the drain must not be able to retire the backlog signal by aging
 * it"). FR-3 must not fold the two predicates into a shared helper, which would silently narrow
 * this probe's visibility too.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveSolomonConductFacts } from '../../lib/solomon/conduct-probes.js';

const SRC = readFileSync(fileURLToPath(new URL('../../lib/solomon/conduct-probes.js', import.meta.url)), 'utf8');

describe('TS-7: conduct-probes.js does not gain a decision_requested filter', () => {
  it('the source contains no .eq(\'decision_requested\', ...) CALL', () => {
    // Scoped to an actual query-filter invocation, not a bare string match — so a defensive
    // comment referencing decision_requested (explaining why it's deliberately absent) remains
    // permitted here, per TESTING's PLAN-phase finding on the over-narrow grep.
    expect(/\.eq\(\s*['"]decision_requested['"]/.test(SRC)).toBe(false);
  });

  it('staleOpenAdviceCount still counts a stale pending row whose decision_requested is false', async () => {
    const cutoff = new Date('2026-07-01T00:00:00Z');
    const staleRow = { decision: 'pending', decision_requested: false, created_at: '2026-06-01T00:00:00Z' };
    const freshOrDecided = [
      { decision: 'accepted', decision_requested: true, created_at: '2026-06-01T00:00:00Z' }, // decided — excluded by decision filter
    ];
    const rows = [staleRow, ...freshOrDecided];
    const sb = {
      from: () => ({
        select: () => ({
          eq: (col, val) => ({
            lt: (col2, val2) => Promise.resolve({
              count: rows.filter((r) => r[col] === val && r[col2] < val2).length,
              error: null,
            }),
          }),
        }),
      }),
    };
    const facts = await resolveSolomonConductFacts(sb, { now: cutoff, staleDays: 0 });
    // The stale row (decision_requested:false) is counted — the probe's predicate is decision
    // alone, unaffected by FR-3's resurfacer-only change.
    expect(facts.staleOpenAdviceCount).toBe(1);
  });
});
