/**
 * Unit tests for lib/middleware/api-auth.js privilege derivation.
 * SD-LEO-FIX-CHAIRMAN-PRIVILEGE-FROM-WRITABLE-METADATA-001
 *
 * Chairman privilege must never be derived from user_metadata. That half is
 * written by the account holder itself (auth.updateUser({ data })), so trusting
 * it lets any authenticated principal self-promote. app_metadata is
 * service-role-writable only.
 *
 * The isChairman() suite below is deliberately targeted: that derivation sits 57
 * lines below the other two and inside a differently-named export, which is
 * exactly what survives a patch aimed at the reported symptom. It is the
 * regression most likely to be reintroduced, so it gets its own coverage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mockGetUser } }))
}));

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

const { createAuthMiddleware, requireChairman, isChairman } = await import('./api-auth.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

/** Minimal stand-in for a service-role client's admin.getUserById. */
function adminClientReturning(user) {
  return { auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user }, error: null }) } } };
}

describe('isChairman() helper — the derivation a line-scoped fix would miss', () => {
  it('returns FALSE when chairman appears only in user_metadata (self-promotion)', async () => {
    const supabase = adminClientReturning({ user_metadata: { role: 'chairman' }, app_metadata: {} });
    await expect(isChairman(supabase, 'user-1')).resolves.toBe(false);
  });

  it('returns TRUE when chairman is in app_metadata', async () => {
    const supabase = adminClientReturning({ app_metadata: { role: 'chairman' }, user_metadata: {} });
    await expect(isChairman(supabase, 'user-1')).resolves.toBe(true);
  });

  it('ignores user_metadata even when app_metadata holds a lesser role', async () => {
    const supabase = adminClientReturning({
      app_metadata: { role: 'viewer' },
      user_metadata: { role: 'chairman' }
    });
    await expect(isChairman(supabase, 'user-1')).resolves.toBe(false);
  });

  it('does NOT call the removed zero-arg fn_is_chairman RPC', async () => {
    // The old code called rpc('fn_is_chairman', { user_uuid }) against a function
    // whose only live signature is zero-arg, so it returned PGRST202 on every
    // invocation. A client with no .rpc at all must therefore still work.
    const supabase = adminClientReturning({ app_metadata: { role: 'chairman' } });
    expect(supabase.rpc).toBeUndefined();
    await expect(isChairman(supabase, 'user-1')).resolves.toBe(true);
  });

  it('returns false for a missing userId without touching the client', async () => {
    const supabase = adminClientReturning({ app_metadata: { role: 'chairman' } });
    await expect(isChairman(supabase, undefined)).resolves.toBe(false);
    expect(supabase.auth.admin.getUserById).not.toHaveBeenCalled();
  });

  it('returns false when the admin lookup errors', async () => {
    const supabase = { auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) } } };
    await expect(isChairman(supabase, 'user-1')).resolves.toBe(false);
  });
});

describe('createAuthMiddleware — req.user role derivation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  async function runWithUser(user) {
    mockGetUser.mockResolvedValue({ data: { user }, error: null });
    const req = { path: '/api/thing', headers: { authorization: 'Bearer token' } };
    const res = mockRes();
    const next = vi.fn();
    await createAuthMiddleware({ allowServiceRole: false })(req, res, next);
    return { req, res, next };
  }

  it('does NOT set isChairman from user_metadata', async () => {
    const { req, next } = await runWithUser({
      id: 'u1', email: 'a@b.c', user_metadata: { role: 'chairman' }, app_metadata: {}
    });
    expect(next).toHaveBeenCalledOnce();
    expect(req.user.isChairman).toBe(false);
    expect(req.user.role).toBe('user');
  });

  it('sets isChairman from app_metadata', async () => {
    const { req } = await runWithUser({
      id: 'u1', email: 'a@b.c', app_metadata: { role: 'chairman' }, user_metadata: {}
    });
    expect(req.user.isChairman).toBe(true);
    expect(req.user.role).toBe('chairman');
  });
});

describe('requireChairman enforcement', () => {
  it('refuses a principal that only self-asserted chairman', () => {
    const req = { user: { isChairman: false, isServiceRole: false } };
    const res = mockRes();
    const next = vi.fn();
    requireChairman(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'FORBIDDEN_NOT_CHAIRMAN' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('still admits the service role', () => {
    const req = { user: { isChairman: false, isServiceRole: true } };
    const res = mockRes();
    const next = vi.fn();
    requireChairman(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
