/**
 * SD-LEO-INFRA-HARDEN-S19-S20-001 (FR-5): the reconciliation invariant. Flags a leo_bridge venture
 * past S19 with an incomplete tree; excludes chairman_override and completed trees. TS-11.
 */
import { describe, it, expect } from 'vitest';
import { findS19AdvanceViolations } from '../../../../lib/eva/bridge/s19-reconciliation.js';

/**
 * Mock supabase routing by table. `ventures` returns the configured leo_bridge ventures past S19;
 * `venture_stage_work` and `strategic_directives_v2` resolve per-venture via the ventureId in .eq.
 */
function makeSupabase({ ventures = [], stageWorkByVenture = {}, sdsByVenture = {} }) {
  const from = (table) => {
    let ventureId = null;
    const chain = {
      select: () => chain,
      eq: (col, val) => { if (col === 'venture_id') ventureId = val; return chain; },
      gt: () => chain,
      async maybeSingle() {
        if (table === 'venture_stage_work') return { data: stageWorkByVenture[ventureId] || null, error: null };
        return { data: null, error: null };
      },
      then: (resolve) => {
        if (table === 'ventures') return resolve({ data: ventures, error: null });
        if (table === 'strategic_directives_v2') return resolve({ data: sdsByVenture[ventureId] || [], error: null });
        return resolve({ data: null, error: null });
      },
    };
    return chain;
  };
  return { from };
}

describe('findS19AdvanceViolations (TS-11)', () => {
  it('flags a leo_bridge venture past S19 with an all-draft (incomplete) tree', async () => {
    const supabase = makeSupabase({
      ventures: [{ id: 'dd', name: 'DataDistill', current_lifecycle_stage: 20, build_model: 'leo_bridge' }],
      stageWorkByVenture: { dd: { advisory_data: {} } },
      sdsByVenture: { dd: [{ status: 'draft' }, { status: 'draft' }] },
    });
    const v = await findS19AdvanceViolations(supabase);
    expect(v).toHaveLength(1);
    expect(v[0].venture_id).toBe('dd');
    expect(v[0].reason).toBe('tree_not_all_terminal');
  });

  it('flags a venture with NO build SDs (never built)', async () => {
    const supabase = makeSupabase({
      ventures: [{ id: 'e', name: 'Empty', current_lifecycle_stage: 22, build_model: 'leo_bridge' }],
      sdsByVenture: { e: [] },
    });
    const v = await findS19AdvanceViolations(supabase);
    expect(v).toHaveLength(1);
    expect(v[0].reason).toBe('no_build_sds');
  });

  it('EXCLUDES a chairman_override venture (sanctioned advance)', async () => {
    const supabase = makeSupabase({
      ventures: [{ id: 'o', name: 'Override', current_lifecycle_stage: 20, build_model: 'leo_bridge' }],
      stageWorkByVenture: { o: { advisory_data: { chairman_override: true } } },
      sdsByVenture: { o: [{ status: 'draft' }] },
    });
    const v = await findS19AdvanceViolations(supabase);
    expect(v).toHaveLength(0);
  });

  it('does NOT flag a completed tree (>=1 completed, all terminal)', async () => {
    const supabase = makeSupabase({
      ventures: [{ id: 'c', name: 'Complete', current_lifecycle_stage: 21, build_model: 'leo_bridge' }],
      stageWorkByVenture: { c: { advisory_data: {} } },
      sdsByVenture: { c: [{ status: 'completed' }, { status: 'cancelled' }] },
    });
    const v = await findS19AdvanceViolations(supabase);
    expect(v).toHaveLength(0);
  });

  it('flags an all-cancelled tree (terminal but nothing genuinely completed)', async () => {
    const supabase = makeSupabase({
      ventures: [{ id: 'x', name: 'AllCancelled', current_lifecycle_stage: 20, build_model: 'leo_bridge' }],
      stageWorkByVenture: { x: { advisory_data: {} } },
      sdsByVenture: { x: [{ status: 'cancelled' }, { status: 'cancelled' }] },
    });
    const v = await findS19AdvanceViolations(supabase);
    expect(v).toHaveLength(1);
    expect(v[0].reason).toBe('all_cancelled');
  });
});
