/**
 * SD-LEO-INFRA-CLONE-SEED-L2-VISION-PROMOTE-001 (FR-4)
 *
 * _autoApproveCloneVision promotes a CLONE's enriched L2 vision to active+chairman_approved (attributed
 * to the testing agent) so the clone passes the S19 vision_approval gate. REAL ventures are never
 * auto-approved; the promotion is a TARGETED UPDATE that never writes extracted_dimensions/content
 * (which would NULL-clobber the dims and violate eva_vision_documents_active_rich_check); idempotent.
 */
import { describe, it, expect } from 'vitest';
import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';

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
const run = (config) => autoApprove.call({ _supabase: makeSb(config), _logger: silentLogger }, 'venture-1');
const enriched = { vision_key: 'V-1', extracted_dimensions: { a: 1 }, content: 'x'.repeat(600) };

describe('_autoApproveCloneVision (FR-1/FR-2)', () => {
  it('CLONE + active-unapproved enriched L2 -> FLIPS approval only (no status churn, no dims/content)', async () => {
    const sb = makeSb({
      venture: { id: 'venture-1', seeded_from_venture_id: 'src-1' },
      activeL2: { vision_key: 'V-1', chairman_approved: false },
    });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-1');
    expect(r.promoted).toBe(true);
    expect(r.mode).toBe('approve_active');
    expect(sb.updates).toHaveLength(1);
    const u = sb.updates[0];
    expect(u.table).toBe('eva_vision_documents');
    expect(u.payload.chairman_approved).toBe(true);
    expect(u.payload.created_by).toBe('testing-agent-clone-autoapprove');
    expect('status' in u.payload).toBe(false);                 // no status churn for an already-active row
    expect('extracted_dimensions' in u.payload).toBe(false);   // never NULL-clobber dims
    expect('content' in u.payload).toBe(false);
    expect(u.filters.vision_key).toBe('V-1');
    expect(u.filters.level).toBe('L2');
  });

  it('CLONE + draft_seed enriched L2 (no active) -> PROMOTES draft_seed -> active+approved', async () => {
    const sb = makeSb({
      venture: { id: 'venture-1', seeded_from_venture_id: 'src-1' },
      activeL2: null,
      draftSeed: enriched,
    });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-1');
    expect(r.promoted).toBe(true);
    expect(r.mode).toBe('promote_draft');
    expect(sb.updates).toHaveLength(1);
    const u = sb.updates[0];
    expect(u.payload.status).toBe('active');
    expect(u.payload.chairman_approved).toBe(true);
    expect(u.payload.created_by).toBe('testing-agent-clone-autoapprove');
    expect('extracted_dimensions' in u.payload).toBe(false);   // never NULL-clobber dims
    expect('content' in u.payload).toBe(false);
  });

  it('REAL venture (seeded_from_venture_id NULL) -> NO update (chairman-manual preserved)', async () => {
    const sb = makeSb({ venture: { id: 'venture-1', seeded_from_venture_id: null }, draftSeed: enriched });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-1');
    expect(r.promoted).toBe(false);
    expect(r.reason).toBe('real_venture');
    expect(sb.updates).toHaveLength(0);
  });
});

describe('_autoApproveCloneVision — idempotent + constraint-safe no-ops', () => {
  it('idempotent: an already-approved active L2 -> no update', async () => {
    const sb = makeSb({
      venture: { id: 'venture-1', seeded_from_venture_id: 'src-1' },
      activeL2: { vision_key: 'V-1', chairman_approved: true },
    });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-1');
    expect(r.promoted).toBe(false);
    expect(r.reason).toBe('already_approved');
    expect(sb.updates).toHaveLength(0);
  });

  it('not-enriched draft_seed (dims null / short content) -> no update (would violate active_rich_check)', async () => {
    const sb = makeSb({
      venture: { id: 'venture-1', seeded_from_venture_id: 'src-1' },
      activeL2: null,
      draftSeed: { vision_key: 'V-1', extracted_dimensions: null, content: 'short' },
    });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-1');
    expect(r.promoted).toBe(false);
    expect(r.reason).toBe('not_enriched');
    expect(sb.updates).toHaveLength(0);
  });

  it('clone with NO L2 row -> no update (still hard-holds; enrichment gap out of scope)', async () => {
    const sb = makeSb({ venture: { id: 'venture-1', seeded_from_venture_id: 'src-1' }, activeL2: null, draftSeed: null });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-1');
    expect(r.promoted).toBe(false);
    expect(r.reason).toBe('no_l2_vision');
    expect(sb.updates).toHaveLength(0);
  });

  it('missing deps / venture not found -> safe no-op', async () => {
    expect((await autoApprove.call({ _supabase: null, _logger: silentLogger }, 'v')).promoted).toBe(false);
    const sb = makeSb({ venture: null });
    const r = await autoApprove.call({ _supabase: sb, _logger: silentLogger }, 'venture-1');
    expect(r.reason).toBe('venture_not_found');
  });
});
