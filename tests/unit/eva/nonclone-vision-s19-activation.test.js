/**
 * SD-LEO-INFRA-NONCLONE-VISION-S19-ACTIVATION-BLOCK-001 — make a non-clone CONVERGENCE SUBJECT's L2
 * vision ACTIVATABLE on the normal path. Two coupled halves, both pinned here (no live daemon needed):
 *   (A) launchNonCloneDummy sets the repair-eligibility flag + the convergence-subject marker at creation;
 *   (B) the S19 auto-approve carve-out (_autoApproveCloneVision) ADMITS a convergence-subject non-clone
 *       (a real venture, lacking both clone-origin AND the marker, stays chairman-manual).
 * The repair/quality half is the SHARED clone path already covered by clone-vision-autoapprove.test.js;
 * the convergence subject is simply admitted into it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repairMocks = vi.hoisted(() => ({ isRepairLoopEnabled: vi.fn(), repairVision: vi.fn() }));
vi.mock('../../../lib/eva/vision-repair-loop.js', () => ({
  isRepairLoopEnabled: repairMocks.isRepairLoopEnabled,
  repairVision: repairMocks.repairVision,
}));

const { StageExecutionWorker } = await import('../../../lib/eva/stage-execution-worker.js');
const { launchNonCloneDummy, isConvergenceSubject, setConvergenceSubjectMarker, CONVERGENCE_SUBJECT_CONFIG_KEY } =
  await import('../../../lib/eva/clean-clone/launch.js');
const autoApprove = StageExecutionWorker.prototype._autoApproveCloneVision;
const silent = { log() {}, warn() {}, error() {} };

// A supabase mock that records eva_venture_config upserts and resolves selects from `config`.
// config: { venture, activeL2, draftSeed, convergenceMarker(bool) }
function makeSb(config = {}) {
  const upserts = [];
  const resolveSelect = (ctx) => {
    if (ctx.table === 'ventures') return config.venture || null;
    if (ctx.table === 'eva_vision_documents') {
      const st = ctx.filters.status;
      if (st === 'active') return config.activeL2 || null;
      // SD-LEO-INFRA-NONCLONE-VISION-S19-DRAFT-DOC-SHAPE-001: Case B now .in('status',['draft_seed','draft']).
      if (Array.isArray(st) && (st.includes('draft_seed') || st.includes('draft'))) return config.draftSeed || config.draftDoc || null;
      if (st === 'draft_seed') return config.draftSeed || null; // back-compat
    }
    if (ctx.table === 'eva_venture_config') {
      // the convergence-subject marker read
      return config.convergenceMarker ? { value: true } : null;
    }
    return null;
  };
  const sb = {
    upserts,
    from(table) {
      const ctx = { table, op: null, filters: {}, payload: null };
      const b = {
        select() { ctx.op = 'select'; return b; },
        update(p) { ctx.op = 'update'; ctx.payload = p; return b; },
        upsert(p) { ctx.op = 'upsert'; upserts.push({ table, payload: p }); return b; },
        eq(c, v) { ctx.filters[c] = v; return b; },
        in(c, arr) { ctx.filters[c] = arr; return b; },
        order() { return b; },
        limit() { return b; },
        async maybeSingle() { return { data: resolveSelect(ctx), error: null }; },
        then(resolve) {
          if (ctx.op === 'upsert') resolve({ error: null });
          else if (ctx.op === 'update') resolve({ error: null });
          else resolve({ data: resolveSelect(ctx), error: null });
        },
      };
      return b;
    },
  };
  return sb;
}

beforeEach(() => { repairMocks.isRepairLoopEnabled.mockReset(); repairMocks.repairVision.mockReset(); });

describe('(A) launchNonCloneDummy sets repair-eligibility + the convergence-subject marker at LIVE create', () => {
  it('writes BOTH eva_venture_config flags for the new subject', async () => {
    const sb = makeSb({ venture: { seeded_from_venture_id: null, is_demo: false, is_scaffolding: false } });
    const executeStageZero = vi.fn(async () => ({ success: true, venture_id: 'v-sub' }));
    const r = await launchNonCloneDummy({ dryRun: false }, { supabase: sb, logger: silent, executeStageZero });
    expect(r.ok).toBe(true);
    const keys = sb.upserts.filter((u) => u.table === 'eva_venture_config').map((u) => u.payload.key);
    expect(keys).toContain('venture:v-sub:vision_repair_loop_enabled'); // repair-eligible
    expect(keys).toContain(CONVERGENCE_SUBJECT_CONFIG_KEY('v-sub'));     // convergence-subject marker
  });

  it('dry-run sets NO flags (no persist)', async () => {
    const sb = makeSb();
    const executeStageZero = vi.fn(async () => ({ success: true, venture_id: 'v-dry' }));
    await launchNonCloneDummy({ dryRun: true }, { supabase: sb, logger: silent, executeStageZero });
    expect(sb.upserts.filter((u) => u.table === 'eva_venture_config')).toHaveLength(0);
  });
});

describe('isConvergenceSubject reads the marker (fail-closed)', () => {
  it('true only on an explicit value===true; false when absent', async () => {
    expect(await isConvergenceSubject(makeSb({ convergenceMarker: true }), 'v')).toBe(true);
    expect(await isConvergenceSubject(makeSb({ convergenceMarker: false }), 'v')).toBe(false);
    expect(await isConvergenceSubject(null, 'v')).toBe(false);
  });
});

describe('(B) S19 auto-approve carve-out ADMITS a convergence-subject non-clone', () => {
  it('non-clone WITH the convergence-subject marker -> NOT real_venture (proceeds into the promote path)', async () => {
    repairMocks.isRepairLoopEnabled.mockResolvedValue(true);
    repairMocks.repairVision.mockResolvedValue({ finalQualityChecked: true, attempts: 1 });
    const sb = makeSb({
      venture: { id: 'v-sub', seeded_from_venture_id: null }, // NON-clone
      convergenceMarker: true,                                // but a convergence subject
      activeL2: null,
      draftSeed: { vision_key: 'V', extracted_dimensions: { a: 1 }, content: 'x'.repeat(600), quality_checked: false, quality_issues: [{ check: 'section_coverage' }], sections: {} },
    });
    const r = await autoApprove.call({ _supabase: sb, _logger: silent }, 'v-sub');
    expect(r.reason).not.toBe('real_venture');   // the carve-out admitted it
    expect(r.promoted).toBe(true);               // repaired (quality) then promoted (activation)
  });

  it('non-clone WITHOUT the marker (a REAL venture) -> real_venture, chairman-manual preserved', async () => {
    const sb = makeSb({ venture: { id: 'v-real', seeded_from_venture_id: null }, convergenceMarker: false });
    const r = await autoApprove.call({ _supabase: sb, _logger: silent }, 'v-real');
    expect(r.reason).toBe('real_venture');
    expect(repairMocks.repairVision).not.toHaveBeenCalled();
  });

  it('a CLONE still works unchanged (no convergence read needed on the clone fast-path)', async () => {
    const sb = makeSb({ venture: { id: 'v-clone', seeded_from_venture_id: 'src-1' }, activeL2: { vision_key: 'V', chairman_approved: true } });
    const r = await autoApprove.call({ _supabase: sb, _logger: silent }, 'v-clone');
    expect(r.reason).toBe('already_approved'); // clone path intact
  });
});
