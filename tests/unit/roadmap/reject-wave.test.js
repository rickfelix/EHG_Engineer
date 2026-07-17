/**
 * Unit tests — SD-LEO-INFRA-DISTILL-ROADMAP-SINGLE-001 (FR-2)
 * lib/integrations/roadmap-manager.js rejectWave()
 */
import { describe, it, expect } from 'vitest';
import { rejectWave } from '../../../lib/integrations/roadmap-manager.js';

// Models the real supabase-js update-builder chain: eq() is chainable (returns the
// same builder), select() is the terminal thenable. currentStatus is the row's live
// state at write time -- separate from the snapshot returned by the initial select,
// so a compare-and-swap guard (.eq('status','proposed')) can be exercised.
function makeSupabase(wave, { raceStatus } = {}) {
  const updates = [];
  let currentStatus = wave ? wave.status : null;
  return {
    _updates: updates,
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                single: () => {
                  if (!wave) return Promise.resolve({ data: null, error: { message: 'not found' } });
                  const snapshot = { ...wave, status: currentStatus };
                  // Simulate a concurrent transition landing between this read and the write below.
                  if (raceStatus) currentStatus = raceStatus;
                  return Promise.resolve({ data: snapshot, error: null });
                },
              };
            },
          };
        },
        update(payload) {
          updates.push(payload);
          const filters = {};
          const builder = {
            eq(col, val) {
              filters[col] = val;
              return builder;
            },
            select() {
              const matches = wave && filters.id === wave.id && (filters.status === undefined || filters.status === currentStatus);
              if (matches) {
                currentStatus = payload.status;
                return Promise.resolve({ data: [{ id: wave.id }], error: null });
              }
              return Promise.resolve({ data: [], error: null });
            },
          };
          return builder;
        },
      };
    },
  };
}

describe('rejectWave', () => {
  it('transitions a status=proposed wave to archived, merging (not overwriting) existing metadata', async () => {
    const wave = { id: 'wave-1', status: 'proposed', metadata: { ai_confidence: 0.8 } };
    const supabase = makeSupabase(wave);
    const result = await rejectWave(supabase, 'wave-1', 'Duplicate of an already-approved wave');
    expect(result).toEqual({ waveId: 'wave-1', previousStatus: 'proposed' });
    expect(supabase._updates).toHaveLength(1);
    expect(supabase._updates[0].status).toBe('archived');
    expect(supabase._updates[0].metadata.ai_confidence).toBe(0.8); // preserved
    expect(supabase._updates[0].metadata.rejection_rationale).toBe('Duplicate of an already-approved wave');
    expect(supabase._updates[0].metadata.rejected_at).toBeTruthy();
  });

  // The must-fix finding from TESTING sub-agent review: WAVE_TRANSITIONS also permits
  // approved/active -> archived (a DIFFERENT operation — retiring an already-ratified
  // wave), so rejectWave must refuse a non-proposed source status EXPLICITLY, not just
  // rely on validateTransition()'s broader table.
  it('refuses to reject a wave that is status=approved (not proposed), even though validateTransition would allow approved->archived', async () => {
    const wave = { id: 'wave-2', status: 'approved', metadata: {} };
    const supabase = makeSupabase(wave);
    await expect(rejectWave(supabase, 'wave-2', 'oops')).rejects.toThrow(/not 'proposed'/);
    expect(supabase._updates).toHaveLength(0);
  });

  it('refuses to reject a wave that is status=active', async () => {
    const wave = { id: 'wave-3', status: 'active', metadata: {} };
    const supabase = makeSupabase(wave);
    await expect(rejectWave(supabase, 'wave-3', 'oops')).rejects.toThrow(/not 'proposed'/);
    expect(supabase._updates).toHaveLength(0);
  });

  it('throws when the wave does not exist', async () => {
    const supabase = makeSupabase(null);
    await expect(rejectWave(supabase, 'missing-wave', 'oops')).rejects.toThrow(/not found/);
  });

  it('handles a wave with no prior metadata (defaults to empty object)', async () => {
    const wave = { id: 'wave-4', status: 'proposed', metadata: null };
    const supabase = makeSupabase(wave);
    await rejectWave(supabase, 'wave-4', 'reason');
    expect(supabase._updates[0].metadata.rejection_rationale).toBe('reason');
  });

  // Adversarial review finding (PR #6202): check-then-act between the read and the
  // write is not atomic. If the wave transitions away from 'proposed' (e.g. a
  // concurrent approveSequence() bulk-approve) in that gap, the blind UPDATE must not
  // silently stomp it back to 'archived' -- the compare-and-swap .eq('status','proposed')
  // on the write should cause zero rows to match, and rejectWave must surface that as
  // an explicit error rather than reporting success.
  it('aborts (does not silently apply) when the wave transitions away from proposed between read and write', async () => {
    const wave = { id: 'wave-5', status: 'proposed', metadata: {} };
    const supabase = makeSupabase(wave, { raceStatus: 'approved' });
    await expect(rejectWave(supabase, 'wave-5', 'oops')).rejects.toThrow(/transitioned concurrently/);
  });
});
