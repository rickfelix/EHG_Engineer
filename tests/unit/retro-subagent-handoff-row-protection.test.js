// The RETRO sub-agent's OWN writer must never retype a HANDOFF row into a completion retro.
//
// MEASURED DEFECT (2026-09-03, second corruption path). PR 8125 fixed the LLM generator; it did not
// reach lib/sub-agents/retro/db-operations.js, which carries its own UPDATE. Two rows were destroyed
// with the clobber guard installed AND consulted: Bravo 9f856b63 (created 10:26:43, updated 17:33:44)
// and Charlie 892ee89b (created 11:17:29, updated 17:42:19, exit code 0). Both SDs stranded.
//
// WHY THE GUARD DID NOT STOP IT — the call site passed `targetRowId` but NOT `intendedType`, and the
// completion-onto-handoff rule is keyed on intendedType. The rule was structurally unable to fire, so
// the guard ran, evaluated only its other rules, and permitted the write. The guard was never wrong;
// it was never told what the caller intended to write.
//
// WHY THIS IS NOT THE SAME BUG AS 8125, which matters because the fix differs: 8125 was a PROMPT
// defect where a model chose the row at runtime. This path has no model in it. It is deterministic:
// checkExistingRetrospective orders by created_at DESC with no type filter and hands back retros[0],
// and enhanceRetrospective hardcodes retro_type:'SD_COMPLETION' (a documented promotion, QF-20260604-797).
// At PLAN-TO-LEAD VERIFY the only retrospective an SD has is its LEAD-TO-PLAN HANDOFF row, so this
// path corrupts EVERY time at that phase, not occasionally.
//
// WHY REFUSING IS NOT ENOUGH, and the reason a minimal fix would have been worse: the pre-existing
// refusal branch returns {success:true, skipped:true}. Threading intendedType alone would leave the SD
// with NO completion retrospective while reporting success — still stranded at LEAD-FINAL, but now
// invisibly. The refusal must fall through to an INSERT.
import { describe, it, expect } from 'vitest';
import { checkExistingRetrospective, enhanceRetrospective } from '../../lib/sub-agents/retro/db-operations.js';

const SD_UUID = '11111111-2222-3333-4444-555555555555';

const row = (over = {}) => ({
  id: 'retro-handoff', sd_id: SD_UUID, retro_type: 'HANDOFF', status: 'PUBLISHED',
  quality_score: 100, generated_by: 'SUB_AGENT', key_learnings: [], what_went_well: [],
  what_needs_improvement: [], action_items: [], success_patterns: [], failure_patterns: [],
  protocol_improvements: [], created_at: '2026-09-03T11:17:29.418Z',
  updated_at: '2026-09-03T11:17:29.418Z', ...over,
});

// Mock resolving per table. Terminal calls resolve from the supplied rows rather than a blanket
// no-op, so a filter the code FAILS to apply cannot be papered over by the stub.
function makeSupabase({ retros = [], execHandoffAt = null } = {}) {
  const calls = { insertPayload: null, updatePayload: null, updatedId: null };
  function retroBuilder() {
    let byId = null;
    const b = {
      select: () => b,
      eq: (col, val) => { if (col === 'id') byId = val; return b; },
      or: () => b,
      limit: () => b,
      order: () => Object.assign(Promise.resolve({ data: retros, error: null }), b),
      maybeSingle: async () => ({ data: byId ? retros.find((r) => r.id === byId) || null : retros[0] || null, error: null }),
      single: async () => ({ data: retros[0] || null, error: null }),
      update(payload) { calls.updatePayload = payload; return { eq: (_c, id) => { calls.updatedId = id; return { select: () => ({ single: async () => ({ data: { id, ...payload }, error: null }) }) }; } }; },
      insert(payload) { calls.insertPayload = payload; return { select: () => ({ single: async () => ({ data: { id: 'retro-new-insert', ...payload }, error: null }) }) }; },
    };
    return b;
  }
  const handoffBuilder = () => {
    const h = { select: () => h, or: () => h, eq: () => h, order: () => h, limit: () => h,
      maybeSingle: async () => ({ data: execHandoffAt ? { created_at: execHandoffAt } : null, error: null }) };
    return h;
  };
  return { supabase: { from: (t) => (t === 'sd_phase_handoffs' ? handoffBuilder() : retroBuilder()) }, calls };
}

const dedup = (a, b) => [...(a || []), ...(b || [])];
const newRetro = { sd_id: SD_UUID, title: 'Completion retro', description: 'd', retro_type: 'SD_COMPLETION',
  quality_score: 90, key_learnings: ['l'], what_went_well: [], what_needs_improvement: [], action_items: [],
  success_patterns: [], failure_patterns: [], protocol_improvements: [] };

describe('checkExistingRetrospective never offers a HANDOFF row as an enhancement target', () => {
  it('reports no enhancement target when only HANDOFF rows exist — the VERIFY-phase shape that corrupted deterministically', async () => {
    // At PLAN-TO-LEAD VERIFY this is the real world: one handoff retro, created before EXEC-TO-PLAN.
    const { supabase } = makeSupabase({ retros: [row()], execHandoffAt: '2026-09-03T15:00:00.000Z' });
    const res = await checkExistingRetrospective(supabase, SD_UUID);
    expect(res.found).toBe(false);
    expect(res.needs_enhancement).toBe(false);
    expect(res.existing_retro_id).toBeUndefined(); // before the fix this was the handoff row's id
  });

  it('does NOT report a PUBLISHED, high-quality HANDOFF row as a valid completion retro', async () => {
    // The opposite false-positive: found:true here makes the caller skip generating, so the SD never
    // gets a real completion retro and LEAD-FINAL rejects it while the tools report "already exists".
    const { supabase } = makeSupabase({ retros: [row({ created_at: '2026-09-03T20:00:00.000Z' })], execHandoffAt: '2026-09-03T15:00:00.000Z' });
    const res = await checkExistingRetrospective(supabase, SD_UUID);
    expect(res.found).toBe(false);
  });

  it('still selects a NON-handoff row for enhancement — the promotion path stays open', async () => {
    // QF-20260604-797 promotion of a stale-typed completion row must keep working; this fix narrows
    // only the HANDOFF case, so a blanket "never enhance" rule would fail here.
    const stale = row({ id: 'retro-stale', retro_type: 'SD_COMPLETION', status: 'DRAFT', quality_score: 40 });
    const { supabase } = makeSupabase({ retros: [stale], execHandoffAt: null });
    const res = await checkExistingRetrospective(supabase, SD_UUID);
    expect(res.needs_enhancement).toBe(true);
    expect(res.existing_retro_id).toBe('retro-stale');
  });
});

describe('enhanceRetrospective refuses a HANDOFF target and INSERTS instead of skipping', () => {
  it('leaves the handoff row untouched and inserts a new completion retro', async () => {
    const handoff = row();
    const { supabase, calls } = makeSupabase({ retros: [handoff] });
    const res = await enhanceRetrospective(supabase, handoff.id, newRetro, handoff, dedup);

    expect(res.success).toBe(true);
    expect(res.inserted).toBe(true);
    expect(res.preserved_row_id).toBe(handoff.id);
    // The destructive UPDATE must not have happened at all.
    expect(calls.updatePayload).toBeNull();
    expect(calls.updatedId).toBeNull();
    // And a real completion row must exist, or the SD is stranded a different way.
    expect(calls.insertPayload).not.toBeNull();
    expect(calls.insertPayload.retro_type).toBe('SD_COMPLETION');
  });

  it('does NOT report skipped — a skip would strand the SD while reporting success', async () => {
    // This is the assertion that pins the trap: refusing without inserting satisfies "handoff row
    // protected" while producing an SD that can never pass LEAD-FINAL.
    const handoff = row();
    const { supabase } = makeSupabase({ retros: [handoff] });
    const res = await enhanceRetrospective(supabase, handoff.id, newRetro, handoff, dedup);
    expect(res.skipped).toBeUndefined();
  });

  it('a non-HANDOFF target is still enhanced in place, with retro_type promoted', async () => {
    const stale = row({ id: 'retro-stale', retro_type: 'SD_COMPLETION', quality_score: 40, generated_by: 'AUTO', status: 'DRAFT' });
    const { supabase, calls } = makeSupabase({ retros: [stale] });
    const res = await enhanceRetrospective(supabase, stale.id, newRetro, stale, dedup);
    expect(res.success).toBe(true);
    expect(res.inserted).toBeUndefined();
    expect(calls.updatedId).toBe('retro-stale');
    expect(calls.updatePayload.retro_type).toBe('SD_COMPLETION');
  });
});
