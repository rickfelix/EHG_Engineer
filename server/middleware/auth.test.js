/**
 * Unit tests for Express Authentication Middleware
 * SD-LEO-INFRA-AUTH-MIDDLEWARE-SECURITY-001
 *
 * Tests: requireAuth, optionalAuth, requireAdminAuth, verifyWebSocketToken
 * Covers: JWT validation, timing-safe API key comparison, error responses
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase
const mockGetUser = vi.fn();
const mockSupabaseClient = {
  auth: { getUser: mockGetUser }
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient)
}));

// Mock crypto.timingSafeEqual
const mockTimingSafeEqual = vi.fn();
vi.mock('crypto', () => ({
  timingSafeEqual: (...args) => mockTimingSafeEqual(...args)
}));

// Set env vars before importing module
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.INTERNAL_API_KEY = 'test-internal-key-1234';

const { requireAuth, optionalAuth, requireAdminAuth, verifyWebSocketToken } = await import('./auth.js');

function mockReq(headers = {}) {
  return { headers };
}

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 with NO_AUTH_HEADER when no Authorization header', () => {
    const req = mockReq({});
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NO_AUTH_HEADER' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header does not start with Bearer', () => {
    const req = mockReq({ authorization: 'Basic abc123' });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NO_AUTH_HEADER' })
    );
  });

  it('calls next with user when valid JWT token', async () => {
    const mockUser = { id: 'user-123', email: 'test@test.com' };
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

    const req = mockReq({ authorization: 'Bearer valid-token-123' });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    // Wait for async verifyToken
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(req.user).toEqual(mockUser);
    expect(req.supabase).toBeDefined();
  });

  it('returns 401 with INVALID_TOKEN when token verification fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } });

    const req = mockReq({ authorization: 'Bearer expired-token' });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    await vi.waitFor(() => expect(res.status).toHaveBeenCalled());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_TOKEN' })
    );
  });

  it('returns 401 with TOKEN_ERROR when verifyToken throws', async () => {
    mockGetUser.mockRejectedValue(new Error('network error'));

    const req = mockReq({ authorization: 'Bearer bad-token' });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    await vi.waitFor(() => expect(res.status).toHaveBeenCalled());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TOKEN_ERROR' })
    );
  });

  it('allows internal API key as alternative auth', () => {
    mockTimingSafeEqual.mockReturnValue(true);

    const req = mockReq({ 'x-internal-api-key': 'test-internal-key-1234' });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(req.isAdmin).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  it('rejects invalid internal API key and requires JWT', () => {
    mockTimingSafeEqual.mockReturnValue(false);

    const req = mockReq({ 'x-internal-api-key': 'wrong-key' });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    // Should fall through to JWT check and fail (no auth header)
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NO_AUTH_HEADER' })
    );
  });
});

describe('optionalAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next without user when no Authorization header', () => {
    const req = mockReq({});
    const res = mockRes();
    const next = vi.fn();

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('enriches request with user when valid token', async () => {
    const mockUser = { id: 'user-456', email: 'user@test.com' };
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

    const req = mockReq({ authorization: 'Bearer valid-token' });
    const res = mockRes();
    const next = vi.fn();

    optionalAuth(req, res, next);

    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(req.user).toEqual(mockUser);
    expect(req.supabase).toBeDefined();
  });

  it('calls next without user when token is invalid (no 401)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } });

    const req = mockReq({ authorization: 'Bearer expired-token' });
    const res = mockRes();
    const next = vi.fn();

    optionalAuth(req, res, next);

    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(req.user).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next without user when verifyToken throws (no 401)', async () => {
    mockGetUser.mockRejectedValue(new Error('network'));

    const req = mockReq({ authorization: 'Bearer bad' });
    const res = mockRes();
    const next = vi.fn();

    optionalAuth(req, res, next);

    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(req.user).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows internal API key', () => {
    mockTimingSafeEqual.mockReturnValue(true);

    const req = mockReq({ 'x-internal-api-key': 'test-internal-key-1234' });
    const res = mockRes();
    const next = vi.fn();

    optionalAuth(req, res, next);

    expect(req.isAdmin).toBe(true);
    expect(next).toHaveBeenCalled();
  });
});

describe('requireAdminAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 500 CONFIG_ERROR when INTERNAL_API_KEY not configured', () => {
    const origKey = process.env.INTERNAL_API_KEY;
    delete process.env.INTERNAL_API_KEY;

    const req = mockReq({ 'x-internal-api-key': 'some-key' });
    const res = mockRes();
    const next = vi.fn();

    requireAdminAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CONFIG_ERROR' })
    );
    expect(next).not.toHaveBeenCalled();

    process.env.INTERNAL_API_KEY = origKey;
  });

  it('returns 401 INVALID_API_KEY when no key provided', () => {
    const req = mockReq({});
    const res = mockRes();
    const next = vi.fn();

    requireAdminAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_API_KEY' })
    );
  });

  it('returns 401 INVALID_API_KEY when wrong key provided', () => {
    mockTimingSafeEqual.mockReturnValue(false);

    const req = mockReq({ 'x-internal-api-key': 'wrong-key' });
    const res = mockRes();
    const next = vi.fn();

    requireAdminAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_API_KEY' })
    );
  });

  it('sets isAdmin and calls next with valid key', () => {
    mockTimingSafeEqual.mockReturnValue(true);

    const req = mockReq({ 'x-internal-api-key': 'test-internal-key-1234' });
    const res = mockRes();
    const next = vi.fn();

    requireAdminAuth(req, res, next);

    expect(req.isAdmin).toBe(true);
    expect(next).toHaveBeenCalled();
  });
});

describe('verifyWebSocketToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no token in query or header', async () => {
    const request = {
      url: '/ws',
      headers: { host: 'localhost:3000' }
    };

    const result = await verifyWebSocketToken(request);
    expect(result).toBeNull();
  });

  it('extracts token from query parameter', async () => {
    const mockUser = { id: 'ws-user' };
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

    const request = {
      url: '/ws?token=ws-token-123',
      headers: { host: 'localhost:3000' }
    };

    const result = await verifyWebSocketToken(request);
    expect(result).toBeDefined();
    expect(result.user).toEqual(mockUser);
  });

  it('extracts token from Authorization header', async () => {
    const mockUser = { id: 'ws-user-2' };
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

    const request = {
      url: '/ws',
      headers: {
        host: 'localhost:3000',
        authorization: 'Bearer header-token-456'
      }
    };

    const result = await verifyWebSocketToken(request);
    expect(result).toBeDefined();
    expect(result.user).toEqual(mockUser);
  });

  it('returns null when token verification fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });

    const request = {
      url: '/ws?token=bad-token',
      headers: { host: 'localhost:3000' }
    };

    const result = await verifyWebSocketToken(request);
    expect(result).toBeNull();
  });
});
