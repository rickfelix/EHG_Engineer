/**
 * SD-LEO-INFRA-CLONE-SEED-L2-VISION-PROMOTE-001 (FR-4) + SD-LEO-INFRA-CLONE-VISION-AUTOPROMOTE-QUALITY-REPAIR-001 (FR-4)
 *
 * _autoApproveCloneVision promotes a CLONE's enriched L2 vision to active+chairman_approved (testing agent)
 * so the clone passes the S19 vision_approval gate. A status='active' UPDATE is blocked by
 * trg_enforce_vision_quality_advancement when quality_checked=false, so a draft_seed with <8 standard
 * sections is first repaired (existing bounded loop) to quality_checked=true, then promoted. REAL ventures
 * are never auto-approved; the promotion is a TARGETED UPDATE that never writes extracted_dimensions/content;
 * idempotent; repair-exhaustion falls through to the gate (no bad 'active' row).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the existing repair loop so the repair path is deterministic (vi.hoisted — factory-safe).
const repairMocks = vi.hoisted(() => ({
  isRepairLoopEnabled: vi.fn(),
  repairVision: vi.fn(),
}));
vi.mock('../../../lib/eva/vision-repair-loop.js', () => ({
  isRepairLoopEnabled: repairMocks.isRepairLoopEnabled,
  repairVision: repairMocks.repairVision,
}));

const { StageExecutionWorker } = await import('../../../lib/eva/stage-execution-worker.js');
const autoApprove = StageExecutionWorker.prototype._autoApproveCloneVision;

// Chainable mock supabase: SELECTs resolve from `config`; UPDATEs are recorded in `updates`.
function makeSb(config) {
  const updates = [];
  const resolveSelect = (ctx) => {
    if (ctx.table === 'ventures') return config.venture || null;
    if (ctx.table === 'eva_vision_documents') {
      const st = ctx.filters.status;
      if (st === 'active') return config.activeL2 || null;
      // SD-LEO-INFRA-NONCLONE-VISION-S19-DRAFT-DOC-SHAPE-001: Case B now queries .in('status',
      // ['draft_seed','draft']); return the configured pre-active doc (draftSeed = the clone seed shape,
      // draftDoc = a non-clone convergence subject's 'draft' eager-synthesis shape).
      if (Array.isArray(st) && (st.includes('draft_seed') || st.includes('draft'))) return config.draftSeed || config.draftDoc || null;
      if (st === 'draft_seed') return config.draftSeed || null; // back-compat
    }
    // the convergence-subject marker read (isConvergenceSubject) — a non-clone with the marker is eligible.
    if (ctx.table === 'eva_venture_config') return config.convergenceMarker ? { value: true } : null;
    return null;
  };
  const sb = {
    updates,
    from(table) {
      const ctx = { table, op: null, filters: {}, payload: null };
      const builder = {
        select() { ctx.op = 'select'; return builder; },
        update(payload) { ctx.op = 'update'; ctx.payload = payload; return builder; },
        eq(col, val) { ctx.filters[col] = val; return builder; },
        in(col, arr) { ctx.filters[col] = arr; return builder; },
        order() { return builder; },
        limit() { return builder; },
        async maybeSingle() { return { data: resolveSelect(ctx), error: null }; },
        then(resolve) {
          if (ctx.op === 'update') { updates.push({ table: ctx.table, payload: ctx.payload, filters: ctx.filters }); resolve({ error: null }); }
          else resolve({ data: resolveSelect(ctx), error: null });
        },
      };
      return builder;
    },
  };
  return sb;
}

const silentLogger = { log() {}, warn() {}, error() {} };
const clone = { id: 'venture-1', seeded_from_venture_id: 'src-1' };
const enrichedSeed = (extra = {}) => ({ vision_key: 'V-1', extracted_dimensions: { a: 1 }, content: 'x'.repeat(600), ...extra });

beforeEach(() => {
  repairMocks.isRepairLoopEnabled.mockReset();
  repairMocks.repairVision.mockReset();
});

describe('_autoApproveCloneVision (FR-1/FR-2)', () => {
  it('CLONE + active-unapproved enriched L2 -> FLIPS approval only (no status/dims/content, no repair)', async () => {
    const sb = makeSb({ venture: clone, activeL2: { vision_key: 'V-1', chairman_approved: false } });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-1');
    expect(r.promoted).toBe(true);
    expect(r.mode).toBe('approve_active');
    expect(sb.updates).toHaveLength(1);
    expect('status' in sb.updates[0].payload).toBe(false);
    expect('extracted_dimensions' in sb.updates[0].payload).toBe(false);
    expect(sb.updates[0].payload.created_by).toBe('testing-agent-clone-autoapprove');
    expect(repairMocks.repairVision).not.toHaveBeenCalled();
  });

  it('CLONE + draft_seed already quality_checked -> PROMOTES directly (no repair)', async () => {
    const sb = makeSb({ venture: clone, activeL2: null, draftSeed: enrichedSeed({ quality_checked: true }) });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-1');
    expect(r.promoted).toBe(true);
    expect(r.mode).toBe('promote_draft');
    expect(sb.updates[0].payload.status).toBe('active');
    expect('extracted_dimensions' in sb.updates[0].payload).toBe(false);
    expect(repairMocks.repairVision).not.toHaveBeenCalled();
  });

  it('REAL venture (seeded_from_venture_id NULL), seed already quality_checked -> NO update, NO repair, NOT promoted (SD-...-S19-001-B)', async () => {
    const sb = makeSb({ venture: { id: 'venture-1', seeded_from_venture_id: null }, draftSeed: enrichedSeed({ quality_checked: true }) });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-1');
    expect(r.promoted).toBe(false);
    expect(r.reason).toBe('repaired_not_promoted');
    expect(sb.updates).toHaveLength(0);
    expect(repairMocks.repairVision).not.toHaveBeenCalled();
  });
});

describe('_autoApproveCloneVision (QUALITY-REPAIR FR-1): repair-then-promote', () => {
  it('quality_checked=false + repair flag ON + repair succeeds -> repairs then PROMOTES', async () => {
    repairMocks.isRepairLoopEnabled.mockResolvedValue(true);
    repairMocks.repairVision.mockResolvedValue({ finalQualityChecked: true, attempts: 1, exitReason: 'quality_ok' });
    const sb = makeSb({ venture: clone, activeL2: null, draftSeed: enrichedSeed({ quality_checked: false, quality_issues: [{ check: 'section_coverage', message: '0/10' }], sections: {} }) });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-1');
    expect(repairMocks.repairVision).toHaveBeenCalledTimes(1);
    expect(repairMocks.repairVision.mock.calls[0][0].createdBy).toBe('testing-agent-clone-autoapprove');
    expect(r.promoted).toBe(true);
    expect(r.mode).toBe('promote_draft');
    expect(sb.updates[0].payload.status).toBe('active');
  });

  it('quality_checked=false + repair EXHAUSTS (finalQualityChecked=false) -> NO promote, falls through', async () => {
    repairMocks.isRepairLoopEnabled.mockResolvedValue(true);
    repairMocks.repairVision.mockResolvedValue({ finalQualityChecked: false, attempts: 2, exitReason: 'attempt_cap' });
    const sb = makeSb({ venture: clone, activeL2: null, draftSeed: enrichedSeed({ quality_checked: false, quality_issues: [{ check: 'section_coverage' }], sections: {} }) });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-1');
    expect(r.promoted).toBe(false);
    expect(r.reason).toBe('repair_exhausted_quality');
    expect(sb.updates).toHaveLength(0); // no bad 'active' row
  });

  it('quality_checked=false + repair flag OFF -> NO promote, NO repair (quality_not_checked)', async () => {
    repairMocks.isRepairLoopEnabled.mockResolvedValue(false);
    const sb = makeSb({ venture: clone, activeL2: null, draftSeed: enrichedSeed({ quality_checked: false, quality_issues: [{ check: 'section_coverage' }], sections: {} }) });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-1');
    expect(r.promoted).toBe(false);
    expect(r.reason).toBe('quality_not_checked');
    expect(repairMocks.repairVision).not.toHaveBeenCalled();
    expect(sb.updates).toHaveLength(0);
  });
});

describe('SD-LEO-INFRA-REAL-VENTURE-VISION-ENRICH-UNDERPRODUCTION-S19-001-B (FR-1/FR-2/FR-3): real ventures reach repair, never promotion', () => {
  const realVenture = { id: 'venture-real', seeded_from_venture_id: null };

  it('REAL venture, quality_checked=false + repair flag ON + repair succeeds -> repairVision called once, NO writes, reason=repaired_not_promoted', async () => {
    repairMocks.isRepairLoopEnabled.mockResolvedValue(true);
    repairMocks.repairVision.mockResolvedValue({ finalQualityChecked: true, attempts: 1, exitReason: 'quality_ok' });
    const sb = makeSb({ venture: realVenture, activeL2: null, draftSeed: enrichedSeed({ quality_checked: false, quality_issues: [{ check: 'section_coverage', message: '3/10' }], sections: {} }) });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-real');
    expect(repairMocks.repairVision).toHaveBeenCalledTimes(1);
    expect(r.promoted).toBe(false);
    expect(r.reason).toBe('repaired_not_promoted');
    expect(sb.updates).toHaveLength(0); // repair writes via upsertVision inside repairVision, not this function's own .update()
  });

  it('REAL venture, quality_checked=false + repair EXHAUSTS -> reason=repair_exhausted_quality (unchanged)', async () => {
    repairMocks.isRepairLoopEnabled.mockResolvedValue(true);
    repairMocks.repairVision.mockResolvedValue({ finalQualityChecked: false, attempts: 2, exitReason: 'attempt_cap' });
    const sb = makeSb({ venture: realVenture, activeL2: null, draftSeed: enrichedSeed({ quality_checked: false, quality_issues: [{ check: 'section_coverage' }], sections: {} }) });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-real');
    expect(r.promoted).toBe(false);
    expect(r.reason).toBe('repair_exhausted_quality');
    expect(sb.updates).toHaveLength(0);
  });

  it('REAL venture, repair flag OFF -> reason=quality_not_checked (unchanged)', async () => {
    repairMocks.isRepairLoopEnabled.mockResolvedValue(false);
    const sb = makeSb({ venture: realVenture, activeL2: null, draftSeed: enrichedSeed({ quality_checked: false, quality_issues: [{ check: 'section_coverage' }], sections: {} }) });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-real');
    expect(r.promoted).toBe(false);
    expect(r.reason).toBe('quality_not_checked');
    expect(repairMocks.repairVision).not.toHaveBeenCalled();
    expect(sb.updates).toHaveLength(0);
  });

  it('REAL venture with an EXISTING active L2 -> NO writes, reason=real_venture_active_present (Case A short-circuit)', async () => {
    const sb = makeSb({ venture: realVenture, activeL2: { vision_key: 'V-real', chairman_approved: false } });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-real');
    expect(r.promoted).toBe(false);
    expect(r.reason).toBe('real_venture_active_present');
    expect(sb.updates).toHaveLength(0);
    expect(repairMocks.repairVision).not.toHaveBeenCalled();
  });
});

describe('SD-LEO-INFRA-NONCLONE-VISION-S19-DRAFT-DOC-SHAPE-001: the non-clone convergence subject draft doc-shape', () => {
  // The from-scratch pipeline produces a NON-CLONE convergence subject's L2 as status='draft' (not
  // draft_seed). Before this fix, Case B queried only draft_seed -> the draft doc fell through to
  // no_l2_vision -> repair never fired -> S19 stalled (eligibility fixed in #5284, reachability not).
  const convergenceVenture = { id: 'venture-conv', seeded_from_venture_id: null }; // NON-clone
  const draftDoc = (extra = {}) => ({ vision_key: 'V-conv', status: 'draft', extracted_dimensions: { a: 1 }, content: 'x'.repeat(600), ...extra });

  it("a convergence subject's status='draft' L2 is FOUND (not no_l2_vision) and promoted", async () => {
    const sb = makeSb({ venture: convergenceVenture, convergenceMarker: true, activeL2: null, draftDoc: draftDoc({ quality_checked: true }) });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-conv');
    expect(r.reason).not.toBe('no_l2_vision');   // the doc-shape is now matched
    expect(r.reason).not.toBe('real_venture');   // eligibility carve-out (#5284) admits it
    expect(r.promoted).toBe(true);
    expect(r.mode).toBe('promote_draft');
    expect(sb.updates[0].payload.status).toBe('active');
    expect(sb.updates[0].payload.chairman_approved).toBe(true);
  });

  it("a convergence subject's under-quality 'draft' L2 REPAIRS (flag on) then promotes", async () => {
    repairMocks.isRepairLoopEnabled.mockResolvedValue(true);
    repairMocks.repairVision.mockResolvedValue({ finalQualityChecked: true, attempts: 1 });
    const sb = makeSb({ venture: convergenceVenture, convergenceMarker: true, activeL2: null, draftDoc: draftDoc({ quality_checked: false, quality_issues: [{ check: 'section_coverage' }], sections: {} }) });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-conv');
    expect(repairMocks.repairVision).toHaveBeenCalledTimes(1); // repair NOW fires for the draft shape
    expect(r.promoted).toBe(true);
  });

  it("a REAL venture's status='draft' L2, already quality_checked -> repaired_not_promoted (chairman-manual promotion preserved; no marker) (SD-...-S19-001-B)", async () => {
    const sb = makeSb({ venture: { id: 'venture-real', seeded_from_venture_id: null }, convergenceMarker: false, activeL2: null, draftDoc: draftDoc({ quality_checked: true }) });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-real');
    expect(r.promoted).toBe(false);
    expect(r.reason).toBe('repaired_not_promoted'); // Case B IS reached (the doc-shape match + repair path), but promotion is still withheld
    expect(sb.updates).toHaveLength(0);
    expect(repairMocks.repairVision).not.toHaveBeenCalled(); // already quality_checked -> no repair call needed
  });

  it("repair EXHAUSTS on a 'draft' doc -> NO promote, falls through (no force-approve backdoor)", async () => {
    repairMocks.isRepairLoopEnabled.mockResolvedValue(true);
    repairMocks.repairVision.mockResolvedValue({ finalQualityChecked: false, attempts: 2, exitReason: 'attempt_cap' });
    const sb = makeSb({ venture: convergenceVenture, convergenceMarker: true, activeL2: null, draftDoc: draftDoc({ quality_checked: false, quality_issues: [{ check: 'section_coverage' }], sections: {} }) });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-conv');
    expect(r.promoted).toBe(false);
    expect(r.reason).toBe('repair_exhausted_quality');
    expect(sb.updates).toHaveLength(0); // no bad 'active' row
  });
});

describe('_autoApproveCloneVision — idempotent + constraint-safe no-ops', () => {
  it('idempotent: an already-approved active L2 -> no update', async () => {
    const sb = makeSb({ venture: clone, activeL2: { vision_key: 'V-1', chairman_approved: true } });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-1');
    expect(r.reason).toBe('already_approved');
    expect(sb.updates).toHaveLength(0);
  });

  it('not-enriched draft_seed (dims null) -> no update, no repair', async () => {
    const sb = makeSb({ venture: clone, activeL2: null, draftSeed: { vision_key: 'V-1', extracted_dimensions: null, content: 'short' } });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-1');
    expect(r.reason).toBe('not_enriched');
    expect(sb.updates).toHaveLength(0);
    expect(repairMocks.repairVision).not.toHaveBeenCalled();
  });

  it('clone with NO L2 row -> no update', async () => {
    const sb = makeSb({ venture: clone, activeL2: null, draftSeed: null });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-1');
    expect(r.reason).toBe('no_l2_vision');
    expect(sb.updates).toHaveLength(0);
  });

  it('missing deps / venture not found -> safe no-op', async () => {
    expect((await autoApprove.call({ _supabase: null, _logger: silentLogger }, 'v')).promoted).toBe(false);
    const sb = makeSb({ venture: null });
    expect((await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-1')).reason).toBe('venture_not_found');
  });
});
