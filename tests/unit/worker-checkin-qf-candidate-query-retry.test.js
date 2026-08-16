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

// missingColumns lets each test simulate exactly which staged column(s) are actually absent live
// -- 42703 fires independently per column, mirroring real PostgREST behavior where the error is
// per-referenced-column, not "any staged column at all". This is what makes the layered-retry
// scenario (verified_at missing, factory_lane present) distinguishable from the combined case.
function makeFakeSb({ onSelect, finalAttemptRows = [], missingColumns = ['factory_lane', 'verified_at'] } = {}) {
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
          const stillReferencesAMissingColumn = missingColumns.some((c) => selectedCols.includes(c));
          if (stillReferencesAMissingColumn) {
            const hitCol = missingColumns.find((c) => selectedCols.includes(c));
            return Promise.resolve({ data: null, error: { code: '42703', message: `column quick_fixes.${hitCol} does not exist` } });
          }
          return Promise.resolve({ data: finalAttemptRows, error: null });
        },
      };
      return builder;
    },
  };
}

describe('selfClaimQuickFix — retries the candidate query without factory_lane on 42703', () => {
  it('retries without the missing column instead of silently treating it as zero candidates', async () => {
    const selects = [];
    // Both staged columns genuinely missing -- today's actual live state.
    const sb = makeFakeSb({ onSelect: (cols) => selects.push(cols) });
    const result = await selfClaimQuickFix(sb, 'sess-1', {}, 'sonnet');
    expect(selects[0]).toContain('factory_lane');
    expect(selects.at(-1)).not.toContain('factory_lane');
    expect(selects.at(-1)).not.toContain('verified_at');
    // Empty candidate fixture on the successful attempt -> no claim to make; proves the retry
    // path ran to completion, not that a claim happened.
    expect(result).toBeNull();
  });

  // REGRESSION sub-agent finding, VERIFY phase: this is THE scenario the prior combined-strip
  // design got wrong. The two staged migrations land INDEPENDENTLY; factory_lane's has been
  // staged a month longer and is the MORE likely of the two to be applied first. If a 42703 on
  // verified_at alone caused factory_lane to ALSO be stripped, qf.factory_lane would read
  // undefined (falsy) and isAutoStartableQF's dispatch-only guard would go blind -- re-arming
  // the QF-20260712-481 incident class. The retry must be LAYERED: strip verified_at first and
  // retry BEFORE giving up on factory_lane too.
  it('SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001 FR-6 (REGRESSION finding): verified_at missing but factory_lane PRESENT -- retries ONCE, factory_lane is preserved, never stripped', async () => {
    const selects = [];
    const sb = makeFakeSb({ onSelect: (cols) => selects.push(cols), missingColumns: ['verified_at'] });
    await selfClaimQuickFix(sb, 'sess-1', {}, 'sonnet');
    expect(selects).toHaveLength(2);
    expect(selects[0]).toContain('verified_at');
    expect(selects[0]).toContain('factory_lane');
    expect(selects[1]).not.toContain('verified_at');
    expect(selects[1]).toContain('factory_lane'); // <-- the critical assertion: NOT stripped
  });

  it('factory_lane missing but verified_at present -- the older-migration-first ordering still resolves correctly (verified_at is needlessly dropped on the final retry, which is safe, never wrong)', async () => {
    const selects = [];
    const sb = makeFakeSb({ onSelect: (cols) => selects.push(cols), missingColumns: ['factory_lane'] });
    await selfClaimQuickFix(sb, 'sess-1', {}, 'sonnet');
    expect(selects).toHaveLength(3);
    expect(selects[0]).toContain('factory_lane');
    expect(selects[1]).toContain('factory_lane'); // still referenced -- genuinely missing, 42703s again
    expect(selects[2]).not.toContain('factory_lane');
    expect(selects[2]).not.toContain('verified_at');
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
