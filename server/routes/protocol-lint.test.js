/**
 * Unit tests for Protocol Linter Dashboard API Routes
 * SD-PROTOCOL-LINTER-DASHBOARD-001
 *
 * Covers: requireAdminRole middleware, /violations, /rules, /runs, /trend
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase BEFORE importing the route module
const mockSupabaseFromBuilder = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (...args) => mockSupabaseFromBuilder(...args),
    auth: { persistSession: false }
  }))
}));

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const { default: protocolLintRouter, requireAdminRole } = await import('./protocol-lint.js');

function mockReq(overrides = {}) {
  return { query: {}, headers: {}, user: null, isAdmin: false, ...overrides };
}
function mockRes() {
  const res = { headers: {} };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn((k, v) => { res.headers[k] = v; });
  return res;
}

describe('requireAdminRole', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('allows when req.isAdmin=true (internal API key path)', () => {
    const req = mockReq({ isAdmin: true });
    const res = mockRes();
    const next = vi.fn();
    requireAdminRole(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows user with user_metadata.role=chairman', () => {
    const req = mockReq({ user: { user_metadata: { role: 'chairman' } } });
    const res = mockRes();
    const next = vi.fn();
    requireAdminRole(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows user with top-level role=system_admin_ops', () => {
    const req = mockReq({ user: { role: 'system_admin_ops' } });
    const res = mockRes();
    const next = vi.fn();
    requireAdminRole(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects user with role=viewer with 403 NOT_ADMIN', () => {
    const req = mockReq({ user: { user_metadata: { role: 'viewer' } } });
    const res = mockRes();
    const next = vi.fn();
    requireAdminRole(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'NOT_ADMIN' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects user with no role field', () => {
    const req = mockReq({ user: {} });
    const res = mockRes();
    const next = vi.fn();
    requireAdminRole(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects null user (requireAuth should catch first, defensive)', () => {
    const req = mockReq({ user: null });
    const res = mockRes();
    const next = vi.fn();
    requireAdminRole(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('Router behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseFromBuilder.mockReset();
  });

  /**
   * Invoke a router handler directly via its stack, without spinning up Express.
   * The router mounts a no-store middleware first, then 4 handlers.
   */
  async function invokeRoute(method, path, query = {}) {
    const layer = protocolLintRouter.stack.find(
      l => l.route && l.route.path === path && l.route.methods[method.toLowerCase()]
    );
    if (!layer) throw new Error(`Route ${method} ${path} not found`);
    const handler = layer.route.stack[0].handle;
    const req = mockReq({ query });
    const res = mockRes();
    await handler(req, res);
    return { req, res };
  }

  // ── /violations ───────────────────────────────────────────────
  it('GET /violations returns empty data when table is empty', async () => {
    mockSupabaseFromBuilder.mockImplementation(() => ({
      select: () => ({
        order: () => ({
          range: () => Promise.resolve({ data: [], error: null, count: 0 })
        })
      })
    }));

    const { res } = await invokeRoute('GET', '/violations');
    expect(res.status).not.toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload.data).toEqual([]);
    expect(payload.total).toBe(0);
    expect(payload.page).toBe(1);
    expect(payload.pageSize).toBe(25);
    expect(payload.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('GET /violations with page=-1 returns 400 BAD_PAGE', async () => {
    const { res } = await invokeRoute('GET', '/violations', { page: '-1' });
    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe('BAD_PAGE');
  });

  it('GET /violations caps pageSize at 100', async () => {
    const captured = { from: null, to: null };
    mockSupabaseFromBuilder.mockImplementation(() => ({
      select: () => ({
        order: () => ({
          range: (from, to) => {
            captured.from = from;
            captured.to = to;
            return Promise.resolve({ data: [], error: null, count: 0 });
          }
        })
      })
    }));

    const { res } = await invokeRoute('GET', '/violations', { pageSize: '9999' });
    const payload = res.json.mock.calls[0][0];
    expect(payload.pageSize).toBe(100);
    expect(captured.from).toBe(0);
    expect(captured.to).toBe(99); // pageSize*1 - 1
  });

  it('GET /violations propagates Supabase errors as 500 QUERY_FAILED', async () => {
    mockSupabaseFromBuilder.mockImplementation(() => ({
      select: () => ({
        order: () => ({
          range: () => Promise.resolve({ data: null, error: { message: 'pg error' }, count: null })
        })
      })
    }));

    const { res } = await invokeRoute('GET', '/violations');
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].code).toBe('QUERY_FAILED');
  });

  // ── /rules ──────────────────────────────────────────────────
  it('GET /rules flags warn-severity rule with zero recent violations as promotion_eligible', async () => {
    const recentRuns = [
      { run_id: 'r1', started_at: '2026-04-22T10:00:00Z', trigger: 'regen', passed: true },
      { run_id: 'r2', started_at: '2026-04-21T10:00:00Z', trigger: 'regen', passed: true }
    ];
    const rules = [
      { rule_id: 'R-WARN-CLEAN', severity: 'warn', description: '', source_path: '', enabled: true, promoted_from_warn_at: null, created_at: '', updated_at: '' },
      { rule_id: 'R-WARN-DIRTY', severity: 'warn', description: '', source_path: '', enabled: true, promoted_from_warn_at: null, created_at: '', updated_at: '' },
      { rule_id: 'R-BLOCK', severity: 'block', description: '', source_path: '', enabled: true, promoted_from_warn_at: null, created_at: '', updated_at: '' }
    ];

    mockSupabaseFromBuilder.mockImplementation((table) => {
      if (table === 'leo_lint_rules') {
        return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: rules, error: null }) }) }) };
      }
      if (table === 'leo_lint_run_history') {
        return { select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: recentRuns, error: null }) }) }) }) };
      }
      if (table === 'leo_lint_violations') {
        // Two calls: one for .in('run_id', recentRunIds), one for .gte('detected_at', 7d)
        const builder = {
          select: () => ({
            in: () => Promise.resolve({ data: [{ rule_id: 'R-WARN-DIRTY', run_id: 'r1' }], error: null }),
            gte: () => Promise.resolve({ data: [{ rule_id: 'R-WARN-DIRTY' }, { rule_id: 'R-WARN-DIRTY' }], error: null })
          })
        };
        return builder;
      }
    });

    const { res } = await invokeRoute('GET', '/rules');
    const payload = res.json.mock.calls[0][0];
    const clean = payload.data.find(r => r.rule_id === 'R-WARN-CLEAN');
    const dirty = payload.data.find(r => r.rule_id === 'R-WARN-DIRTY');
    const block = payload.data.find(r => r.rule_id === 'R-BLOCK');
    expect(clean.promotion_eligible).toBe(true);
    expect(dirty.promotion_eligible).toBe(false);
    expect(block.promotion_eligible).toBe(false);
    expect(dirty.occurrence_count_last_7d).toBe(2);
    expect(clean.occurrence_count_last_7d).toBe(0);
    // Sort order: promotion_eligible DESC then rule_id ASC
    expect(payload.data[0].rule_id).toBe('R-WARN-CLEAN');
  });

  it('GET /rules sets promotion_eligible=false when fewer than 2 regen runs exist', async () => {
    mockSupabaseFromBuilder.mockImplementation((table) => {
      if (table === 'leo_lint_rules') {
        return { select: () => ({ eq: () => ({ order: () => Promise.resolve({
          data: [{ rule_id: 'R1', severity: 'warn', description: '', source_path: '', enabled: true, promoted_from_warn_at: null, created_at: '', updated_at: '' }],
          error: null
        }) }) }) };
      }
      if (table === 'leo_lint_run_history') {
        return { select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [{ run_id: 'r1', started_at: '', trigger: 'regen', passed: true }], error: null }) }) }) }) };
      }
      if (table === 'leo_lint_violations') {
        return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }), gte: () => Promise.resolve({ data: [], error: null }) }) };
      }
    });

    const { res } = await invokeRoute('GET', '/rules');
    const payload = res.json.mock.calls[0][0];
    expect(payload.data[0].promotion_eligible).toBe(false);
    expect(payload.regen_runs_considered).toBe(1);
  });

  // ── /runs ───────────────────────────────────────────────────
  it('GET /runs filters to 30-day window via gte(started_at, since)', async () => {
    const captured = { sinceIso: null };
    mockSupabaseFromBuilder.mockImplementation(() => ({
      select: () => ({
        gte: (col, iso) => {
          captured.sinceIso = iso;
          return { order: () => Promise.resolve({ data: [], error: null, count: 0 }) };
        }
      })
    }));

    const { res } = await invokeRoute('GET', '/runs');
    const payload = res.json.mock.calls[0][0];
    expect(payload.window_days).toBe(30);
    // since should be ~30 days ago
    const sinceMs = new Date(captured.sinceIso).getTime();
    const expected = Date.now() - 30 * 86400_000;
    expect(Math.abs(sinceMs - expected)).toBeLessThan(5_000); // 5s tolerance
  });

  // ── /trend ──────────────────────────────────────────────────
  it('GET /trend returns 7 daily buckets even when no violations exist', async () => {
    mockSupabaseFromBuilder.mockImplementation(() => ({
      select: () => ({
        gte: () => ({
          order: () => Promise.resolve({ data: [], error: null })
        })
      })
    }));

    const { res } = await invokeRoute('GET', '/trend');
    const payload = res.json.mock.calls[0][0];
    expect(payload.data).toHaveLength(7);
    expect(payload.data.every(b => b.total === 0 && b.block === 0 && b.warn === 0)).toBe(true);
    expect(payload.window_days).toBe(7);
  });

  it('GET /trend buckets violations by severity and day', async () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    mockSupabaseFromBuilder.mockImplementation(() => ({
      select: () => ({
        gte: () => ({
          order: () => Promise.resolve({ data: [
            { detected_at: today.toISOString(), severity: 'block' },
            { detected_at: today.toISOString(), severity: 'warn' },
            { detected_at: yesterday.toISOString(), severity: 'block' }
          ], error: null })
        })
      })
    }));

    const { res } = await invokeRoute('GET', '/trend');
    const payload = res.json.mock.calls[0][0];
    const todayKey = today.toISOString().slice(0, 10);
    const yKey = yesterday.toISOString().slice(0, 10);
    const todayBucket = payload.data.find(b => b.date === todayKey);
    const yBucket = payload.data.find(b => b.date === yKey);
    expect(todayBucket.total).toBe(2);
    expect(todayBucket.block).toBe(1);
    expect(todayBucket.warn).toBe(1);
    expect(yBucket.total).toBe(1);
    expect(yBucket.block).toBe(1);
  });
});
