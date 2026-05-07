/**
 * SD-LEO-INFRA-CORRECTIVE-FINDING-REDIRECT-001 — PR4 of 5
 * Unit tests for scripts/corrective-triage.mjs
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));
vi.mock('../../../scripts/leo-create-sd.js', () => ({
  createSD: vi.fn(async () => ({ id: 'sd-uuid-1', sd_key: 'SD-PROMOTED-001' })),
}));
vi.mock('../../../lib/eva/event-bus/vision-events.js', () => ({
  publishVisionEvent: vi.fn(),
  VISION_EVENTS: { CORRECTIVE_PROMOTED_TO_SD: 'vision.corrective_promoted_to_sd' },
}));

let listFindings, promoteFinding, dismissFinding, bulkDismiss;

beforeAll(async () => {
  const mod = await import('../../../scripts/corrective-triage.mjs');
  listFindings = mod.listFindings;
  promoteFinding = mod.promoteFinding;
  dismissFinding = mod.dismissFinding;
  bulkDismiss = mod.bulkDismiss;
});

// Builder that supports BOTH terminal modes:
//   - .single() / .maybeSingle() resolve to {data, error}
//   - implicit await (then) resolves to {data: rows, error}
// All chainable methods return the same builder so order doesn't matter.
function makeBuilder({ single, rows = [], error = null }) {
  const result = single !== undefined
    ? { data: single, error }
    : { data: rows, error };
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    lt() { return chain; },
    order() { return chain; },
    limit() { return chain; },
    single() { return Promise.resolve(result); },
    maybeSingle() { return Promise.resolve(result); },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return chain;
}

function mockSupabase({ rows = [], single, lookupErr = null, updateOk = true } = {}) {
  return {
    from(table) {
      return {
        select: () => makeBuilder({ single, rows, error: lookupErr }),
        update() {
          return {
            eq: () => Promise.resolve({ data: null, error: updateOk ? null : { message: 'fail' } }),
          };
        },
      };
    },
  };
}

describe('listFindings', () => {
  it('queries feedback table with correct filter chain', async () => {
    const rows = [
      { id: 'f1', title: 't1', status: 'new', corrective_class: 'vision_gap', source_gate: 'eva_vision_score', metadata: { dimensions: ['V01'], tier: 'gap-closure' }, created_at: new Date().toISOString() },
    ];
    const sb = mockSupabase({ rows });
    const out = await listFindings(sb);
    expect(out).toEqual(rows);
  });

  it('returns empty array when nothing matches', async () => {
    const sb = mockSupabase({ rows: [] });
    expect(await listFindings(sb, { class: 'arch_gap' })).toEqual([]);
  });
});

describe('promoteFinding', () => {
  const baseRow = {
    id: 'fb-1',
    title: 'Vision V03 gap',
    description: 'desc',
    status: 'new',
    promoted_to_sd_id: null,
    corrective_class: 'vision_gap',
    source_gate: 'eva_vision_score',
    gate_run_id: '11111111-1111-1111-1111-111111111111',
    metadata: {
      source_sd_id: 'SD-SRC-001',
      dimensions: ['V03'],
      tier: 'gap-closure',
      promote_payload: {
        sdType: 'corrective',
        category: 'corrective',
        parentId: 'orch-1',
        priority: 'high',
        rationale: 'rationale text',
        strategic_objectives: [{ objective: 'o1', metric: 'm1' }],
        success_criteria: [{ criterion: 'c1', measure: 'meas1' }],
        success_metrics: [{ metric: 'em', target: '93', actual: '70' }],
        key_principles: [{ principle: 'p1', description: 'd1' }],
      },
    },
  };

  it('creates an SD and updates feedback row when row is promotable', async () => {
    const sb = mockSupabase({ single: baseRow });
    const r = await promoteFinding(sb, 'fb-1', { promotedBy: 'tester' });
    expect(r.promoted).toBe(true);
    expect(r.sdKey).toBe('SD-PROMOTED-001');
    expect(r.feedbackId).toBe('fb-1');
  });

  it('returns already_promoted when feedback.promoted_to_sd_id is set', async () => {
    const sb = mockSupabase({ single: { ...baseRow, promoted_to_sd_id: 'SD-EXISTING-001' } });
    const r = await promoteFinding(sb, 'fb-1');
    expect(r.promoted).toBe(false);
    expect(r.reason).toBe('already_promoted');
    expect(r.sdKey).toBe('SD-EXISTING-001');
  });

  it('refuses to promote a wont_fix finding', async () => {
    const sb = mockSupabase({ single: { ...baseRow, status: 'wont_fix' } });
    const r = await promoteFinding(sb, 'fb-1');
    expect(r.promoted).toBe(false);
    expect(r.reason).toMatch(/wont_fix/);
  });

  it('throws when promote_payload is absent', async () => {
    const sb = mockSupabase({ single: { ...baseRow, metadata: { source_sd_id: 'X' } } });
    await expect(promoteFinding(sb, 'fb-1')).rejects.toThrow(/no metadata.promote_payload/);
  });
});

describe('dismissFinding', () => {
  it('marks status=wont_fix when row exists', async () => {
    const sb = mockSupabase({ single: { id: 'fb-1', status: 'new' } });
    const r = await dismissFinding(sb, 'fb-1', { reason: 'duplicate of SD-X' });
    expect(r.dismissed).toBe(true);
    expect(r.feedbackId).toBe('fb-1');
  });

  it('returns dismissed=false when already wont_fix', async () => {
    const sb = mockSupabase({ single: { id: 'fb-1', status: 'wont_fix' } });
    const r = await dismissFinding(sb, 'fb-1');
    expect(r.dismissed).toBe(false);
  });

  it('throws when feedback row missing', async () => {
    const sb = mockSupabase({ single: null });
    await expect(dismissFinding(sb, 'fb-missing')).rejects.toThrow(/not found/);
  });
});

describe('bulkDismiss', () => {
  it('rejects when class flag missing', async () => {
    const sb = mockSupabase({});
    await expect(bulkDismiss(sb, {})).rejects.toThrow(/requires --class/);
  });

  it('returns 0 dismissed for empty result set', async () => {
    const sb = mockSupabase({ rows: [] });
    const r = await bulkDismiss(sb, { class: 'arch_gap' });
    expect(r.dismissed).toBe(0);
  });
});
