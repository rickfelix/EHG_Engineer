/**
 * Unit tests for the create-and-seed route handler (server/routes/github-repo.js).
 * SD-LEO-FEAT-S19-BUILDS-INTO-001 follow-on (QF-20260523-562): covers the FR-5
 * slug-collision 409 guard the testing-agent flagged, plus the build-into branch
 * and the UUID guard. Deps are mocked so no shell/DB/network is touched.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { execSyncMock, resolveMock, seedRepoMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
  resolveMock: vi.fn(),
  seedRepoMock: vi.fn(),
}));

vi.mock('child_process', () => ({ execSync: execSyncMock }));
vi.mock('../../lib/eva/bridge/resolve-venture-repo.js', () => ({ resolveVentureRepoUrl: resolveMock }));
vi.mock('../../lib/eva/bridge/replit-repo-seeder.js', () => ({ seedRepo: seedRepoMock }));

import { createAndSeedHandler } from '../../server/routes/github-repo.js';

const VALID_UUID = '4f71b3bd-8a1e-462e-a8b2-76efb8607206';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

// Chainable no-op supabase mock (the route persists venture_resources + advisory_data
// after a successful build-into seed).
function mockSupabase() {
  const chain = {
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    select: () => chain,
    eq: () => chain,
    update: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return { from: () => chain };
}

function mockReq(body) {
  return { body, app: { locals: { supabase: mockSupabase() } } };
}

describe('createAndSeedHandler', () => {
  beforeEach(() => { execSyncMock.mockReset(); resolveMock.mockReset(); seedRepoMock.mockReset(); });

  it('FR-5: returns 409 GITHUB_SLUG_COLLISION when create-new hits a pre-existing repo', async () => {
    resolveMock.mockResolvedValue(null); // no existing repo -> create-new mode
    execSyncMock.mockImplementation(() => { throw new Error('GraphQL: Name already exists on this account'); });
    const res = mockRes();
    await createAndSeedHandler(mockReq({ ventureId: VALID_UUID, ventureName: 'Test Venture' }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('GITHUB_SLUG_COLLISION');
    expect(seedRepoMock).not.toHaveBeenCalled(); // must NOT seed into an unrelated repo
  });

  it('build-into: skips gh repo create when a repo resolves, returns mode build-into', async () => {
    resolveMock.mockResolvedValue('https://github.com/rickfelix/contribution-hub');
    seedRepoMock.mockResolvedValue({ mode: 'build-into', docsCommitted: ['docs/spec.md'], errors: [] });
    const res = mockRes();
    await createAndSeedHandler(mockReq({ ventureId: VALID_UUID, ventureName: 'Canvas AI' }), res);
    expect(execSyncMock).not.toHaveBeenCalled(); // gh repo create NOT invoked in build-into
    expect(res.statusCode).toBe(200);
    expect(res.body.mode).toBe('build-into');
    expect(seedRepoMock).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for an invalid ventureId without any shell or resolver call', async () => {
    const res = mockRes();
    await createAndSeedHandler(mockReq({ ventureId: 'not-a-uuid' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_VENTURE_ID');
    expect(execSyncMock).not.toHaveBeenCalled();
    expect(resolveMock).not.toHaveBeenCalled();
  });
});
