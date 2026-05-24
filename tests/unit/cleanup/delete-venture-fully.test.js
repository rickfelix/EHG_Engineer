/**
 * Unit tests for lib/deleteVentureFully.js
 *
 * SD: SD-SINGLEVENTURE-AND-BULK-DELETE-ORCH-001-A (Phase 1)
 *
 * Covers: happy path, PROTECTED_REPOS short-circuit, injection-safe slug
 * rejection, non-blocking phase failure, and blocking DB-delete failure.
 * All shell/DB/fs side effects are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock the lifted dependencies (each creates its own client internally) ---
vi.mock('../../../lib/cleanup/index.js', () => ({
  runTeardown: vi.fn(() => Promise.resolve({ success: true, providers: {} })),
}));
vi.mock('../../../lib/venture-resources.js', () => ({
  markResourcesCleaned: vi.fn(() => Promise.resolve(1)),
}));
vi.mock('../../../lib/cleanup/credentials.js', () => ({
  cleanup: vi.fn(() => Promise.resolve({ revoked: [{ id: 'c1' }], failed: [], skipped: [] })),
}));
// Client factory is unused when we inject options.supabase, but mock it so the
// import never reaches real env/network.
vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: vi.fn(() => makeSupabase({})),
}));

// --- Mock shell + filesystem ---
const execSyncMock = vi.fn(() => Buffer.from(''));
vi.mock('child_process', () => ({ execSync: (...a) => execSyncMock(...a) }));

const writeFileSyncMock = vi.fn();
let registryJson;
vi.mock('fs', () => ({
  readFileSync: vi.fn(() => JSON.stringify(registryJson)),
  writeFileSync: (...a) => writeFileSyncMock(...a),
}));

/**
 * Build a configurable supabase mock.
 * @param {Object} cfg
 * @param {Object} [cfg.prov] - venture_provisioning_state row
 * @param {Object} [cfg.rpc]  - { data, error } returned by .rpc('delete_venture')
 */
function makeSupabase({ prov = null, rpc = { data: { success: true, venture_name: 'TestVenture' }, error: null } }) {
  const rpcMock = vi.fn(() => Promise.resolve(rpc));
  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: prov, error: null })),
        })),
      })),
    })),
    rpc: rpcMock,
  };
  client.__rpc = rpcMock;
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  execSyncMock.mockReturnValue(Buffer.from(''));
  registryJson = {
    applications: {
      APP001: { id: 'APP001', name: 'ehg', status: 'active' },
      APP050: { id: 'APP050', name: 'TestVenture', status: 'active' },
    },
    metadata: { total_apps: 2, active_apps: 2, last_updated: '2026-01-01' },
  };
});

describe('deleteVentureFully', () => {
  it('TS-1: happy path runs all phases and uses the single-venture RPC', async () => {
    const { deleteVentureFully } = await import('../../../lib/deleteVentureFully.js');
    const supabase = makeSupabase({
      prov: { venture_id: 'v1', venture_name: 'TestVenture', github_repo_url: 'https://github.com/rickfelix/test-venture.git' },
    });

    const result = await deleteVentureFully('v1', { supabase });

    expect(result.success).toBe(true);
    // Single-venture RPC, never the portfolio RPC
    expect(supabase.__rpc).toHaveBeenCalledWith('delete_venture', { p_venture_id: 'v1' });
    expect(supabase.__rpc).not.toHaveBeenCalledWith('master_reset_portfolio', expect.anything());
    // Repo deleted via gh
    expect(execSyncMock).toHaveBeenCalledTimes(1);
    expect(execSyncMock.mock.calls[0][0]).toContain('gh repo delete rickfelix/test-venture --yes');
    expect(result.phases.github_repo.status).toBe('deleted');
    // Registry cleaned + written
    expect(result.phases.registry.cleaned).toBe(true);
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    // Per-phase breakdown present
    expect(result.phases.db.success).toBe(true);
    expect(result.phases.credentials.revoked.length).toBe(1);
  });

  it('TS-2: PROTECTED_REPOS slug is never shelled out', async () => {
    const { deleteVentureFully } = await import('../../../lib/deleteVentureFully.js');
    const supabase = makeSupabase({
      prov: { venture_id: 'v1', venture_name: 'Core', github_repo_url: 'https://github.com/rickfelix/ehg.git' },
    });

    const result = await deleteVentureFully('v1', { supabase });

    expect(result.phases.github_repo.status).toBe('skipped');
    expect(result.phases.github_repo.reason).toContain('PROTECTED');
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it('TS-3: malformed/injection slug is rejected before any shell call', async () => {
    const { deleteVentureFully } = await import('../../../lib/deleteVentureFully.js');
    const supabase = makeSupabase({
      prov: { venture_id: 'v1', venture_name: 'Evil', github_repo_url: 'https://github.com/rickfelix/test;rm -rf ~' },
    });

    const result = await deleteVentureFully('v1', { supabase });

    expect(result.phases.github_repo.status).toBe('failed');
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it('TS-4: a non-blocking credential failure does not abort teardown', async () => {
    const credentials = await import('../../../lib/cleanup/credentials.js');
    credentials.cleanup.mockRejectedValueOnce(new Error('provider down'));
    const { deleteVentureFully } = await import('../../../lib/deleteVentureFully.js');
    const supabase = makeSupabase({
      prov: { venture_id: 'v1', venture_name: 'TestVenture', github_repo_url: 'https://github.com/rickfelix/test-venture.git' },
    });

    const result = await deleteVentureFully('v1', { supabase });

    expect(result.success).toBe(true);
    expect(result.phases.credentials.failed.length).toBeGreaterThan(0);
    expect(supabase.__rpc).toHaveBeenCalledWith('delete_venture', { p_venture_id: 'v1' });
  });

  it('TS-5: a DB-delete failure is blocking and skips repo/registry', async () => {
    const { deleteVentureFully } = await import('../../../lib/deleteVentureFully.js');
    const supabase = makeSupabase({
      prov: { venture_id: 'v1', venture_name: 'TestVenture', github_repo_url: 'https://github.com/rickfelix/test-venture.git' },
      rpc: { data: { success: false, error: 'cascade blocked' }, error: null },
    });

    const result = await deleteVentureFully('v1', { supabase });

    expect(result.success).toBe(false);
    expect(result.phases.db.success).toBe(false);
    expect(result.phases.github_repo.status).toBe('none');
    expect(execSyncMock).not.toHaveBeenCalled();
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it('requires a ventureId', async () => {
    const { deleteVentureFully } = await import('../../../lib/deleteVentureFully.js');
    const result = await deleteVentureFully(undefined, { supabase: makeSupabase({}) });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ventureId/);
  });
});
