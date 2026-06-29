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
      if (ctx.filters.status === 'active') return config.activeL2 || null;
      if (ctx.filters.status === 'draft_seed') return config.draftSeed || null;
    }
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

  it('REAL venture (seeded_from_venture_id NULL) -> NO update, NO repair', async () => {
    const sb = makeSb({ venture: { id: 'venture-1', seeded_from_venture_id: null }, draftSeed: enrichedSeed() });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-1');
    expect(r.reason).toBe('real_venture');
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
