/**
 * QF-20260720-763 — selfClaimQuickFix's candidate query requests quick_fixes.factory_lane, a
 * staged-not-yet-applied column (database/migrations/20260713_quick_fixes_factory_lane.sql).
 * A missing column fails the WHOLE multi-column select (Postgres error 42703, data:null), not
 * per-row — the code only read {data:qfs} and never checked error, so this was a total
 * self-claim outage fleet-wide (live-verified: every checkin returned action:idle despite open,
 * unfenced QFs sitting in the queue), not the graceful degradation the original comment assumed.
 * The fix retries the same query without factory_lane specifically on error.code===42703.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { selfClaimQuickFix } = require('../../scripts/worker-checkin.cjs');

function makeFakeSb({ onSelect, secondAttemptRows = [] } = {}) {
  return {
    rpc: () => Promise.resolve({ data: { success: true }, error: null }),
    from(table) {
      let selectedCols = '';
      const builder = {
        select(cols) {
          selectedCols = cols || '';
          onSelect?.(selectedCols);
          return builder;
        },
        eq() { return builder; },
        is() { return builder; },
        order() { return builder; },
        limit() {
          if (table !== 'quick_fixes') return Promise.resolve({ data: [], error: null });
          if (selectedCols.includes('factory_lane')) {
            return Promise.resolve({ data: null, error: { code: '42703', message: 'column quick_fixes.factory_lane does not exist' } });
          }
          return Promise.resolve({ data: secondAttemptRows, error: null });
        },
      };
      return builder;
    },
  };
}

describe('selfClaimQuickFix — retries the candidate query without factory_lane on 42703', () => {
  it('retries without the missing column instead of silently treating it as zero candidates', async () => {
    const selects = [];
    const sb = makeFakeSb({ onSelect: (cols) => selects.push(cols) });
    const result = await selfClaimQuickFix(sb, 'sess-1', {}, 'sonnet');
    expect(selects.length).toBe(2);
    expect(selects[0]).toContain('factory_lane');
    expect(selects[1]).not.toContain('factory_lane');
    // Empty candidate fixture on the successful retry -> no claim to make; proves the retry
    // path ran (2 selects), not that a claim happened.
    expect(result).toBeNull();
  });

  it('does not retry when the query succeeds on the first attempt (no unnecessary second query)', async () => {
    const selects = [];
    const sb = makeFakeSb({ onSelect: (cols) => selects.push(cols) });
    // Force the first attempt to "succeed" by never matching factory_lane in this variant's select.
    const sbNoError = {
      rpc: sb.rpc,
      from(table) {
        const builder = {
          select(cols) { selects.push(cols); return builder; },
          eq() { return builder; },
          is() { return builder; },
          order() { return builder; },
          limit() { return Promise.resolve({ data: [], error: null }); },
        };
        return builder;
      },
    };
    await selfClaimQuickFix(sbNoError, 'sess-1', {}, 'sonnet');
    expect(selects.length).toBe(1);
  });
});
