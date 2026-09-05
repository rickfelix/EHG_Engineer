/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D4.
 *
 * Measured live before this fix: bypass_ledger.handoff_id was 0/33 populated for
 * LEAD-FINAL-APPROVAL rows specifically, even though child B (SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B,
 * FR-B1) already shipped a working join-back mechanism in HandoffRecorder.js's
 * recordFailure()/createArtifact(). The reason: LEAD-FINAL-APPROVAL's canonical accepted-row write
 * is its own dedicated insert (lead-final-approval/index.js, SD-FDBK-FIX-LFA-ACCEPT-ORDERING-001)
 * that never routes through HandoffRecorder.recordSuccess() -- so child B's join-back never fires
 * for this phase. This pins the NEW join-back, extracted as its own directly-testable function
 * (joinBypassLedgerToCanonicalHandoff) rather than requiring a full executeSpecific() run (which
 * cascades into retro/learning/notification side effects far outside this fix's scope).
 */
import { describe, it, expect, vi } from 'vitest';
import { joinBypassLedgerToCanonicalHandoff } from '../../../scripts/modules/handoff/executors/lead-final-approval/index.js';

function makeBypassLedgerSupabase(rows) {
  const state = rows.map((r) => ({ ...r }));
  return {
    _state: state,
    from(table) {
      if (table !== 'bypass_ledger') throw new Error(`unexpected table: ${table}`);
      const ctx = { filters: {}, isNullFilters: [], payload: null };
      const builder = {
        update(payload) { ctx.payload = payload; return builder; },
        eq(col, val) { ctx.filters[col] = val; return builder; },
        is(col, val) {
          if (val === null) ctx.isNullFilters.push(col);
          return Promise.resolve((() => {
            let matched = state.filter((r) => Object.entries(ctx.filters).every(([k, v]) => r[k] === v));
            for (const nullField of ctx.isNullFilters) matched = matched.filter((r) => r[nullField] == null);
            for (const r of matched) Object.assign(r, ctx.payload);
            return { data: matched, error: null };
          })());
        },
      };
      return builder;
    },
  };
}

describe('joinBypassLedgerToCanonicalHandoff (FR-D4)', () => {
  it('populates handoff_id on the matching, not-yet-joined bypass_ledger row', async () => {
    const supabase = makeBypassLedgerSupabase([{ id: 'ledger-1', sd_id: 'sd-1', handoff_id: null }]);
    await joinBypassLedgerToCanonicalHandoff(supabase, 'ledger-1', 'sph-canonical-1');
    expect(supabase._state.find((r) => r.id === 'ledger-1').handoff_id).toBe('sph-canonical-1');
  });

  it('is write-once: does not overwrite an already-joined row', async () => {
    const supabase = makeBypassLedgerSupabase([{ id: 'ledger-2', sd_id: 'sd-1', handoff_id: 'already-set' }]);
    await joinBypassLedgerToCanonicalHandoff(supabase, 'ledger-2', 'sph-canonical-2');
    expect(supabase._state.find((r) => r.id === 'ledger-2').handoff_id).toBe('already-set');
  });

  it('is a no-op when bypassLedgerId is absent (the common, non-bypass path) -- never touches the table', async () => {
    const supabase = { from: vi.fn() };
    await joinBypassLedgerToCanonicalHandoff(supabase, null, 'sph-canonical-3');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('is a no-op when the canonical handoff id is absent (nothing to join to)', async () => {
    const supabase = { from: vi.fn() };
    await joinBypassLedgerToCanonicalHandoff(supabase, 'ledger-4', undefined);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('is a no-op when supabase itself is absent (defensive)', async () => {
    await expect(joinBypassLedgerToCanonicalHandoff(null, 'ledger-5', 'sph-5')).resolves.toBeUndefined();
  });

  it('logs a warning but does not throw when the update itself errors', async () => {
    const throwingSupabase = {
      from() {
        return {
          update() { return this; },
          eq() { return this; },
          is: async () => ({ data: null, error: { message: 'connection reset' } }),
        };
      },
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(joinBypassLedgerToCanonicalHandoff(throwingSupabase, 'ledger-6', 'sph-6')).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bypass_ledger.handoff_id join-back failed'));
    warnSpy.mockRestore();
  });
});
