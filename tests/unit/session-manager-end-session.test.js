/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E FR-1: endSession()'s release_session-RPC-failure fallback
 * writes claude_sessions.status='released' directly -- it must route through the shared
 * terminalSessionUpdate() chokepoint so is_alive:false lands in the same statement.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  sessionFile: null,
  rpcError: null,
  updateCalls: [],
}));

vi.mock('fs', () => ({
  default: {
    existsSync: () => true,
    mkdirSync: () => {},
    readdirSync: () => (h.sessionFile ? ['session.json'] : []),
    readFileSync: () => JSON.stringify(h.sessionFile.data),
    statSync: () => ({ mtimeMs: Date.now() }),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

vi.mock('../../lib/terminal-identity.js', () => ({
  getTerminalId: () => 'fixed-test-terminal-id',
}));

vi.mock('../../lib/claim/release-claim-both-surfaces.mjs', () => ({
  releaseClaimBothSurfaces: vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({
    rpc: vi.fn(() => Promise.resolve({ data: null, error: h.rpcError })),
    from: vi.fn((table) => {
      const chain = {
        update: vi.fn((payload) => {
          h.updateCalls.push({ table, payload });
          return chain;
        }),
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      };
      return chain;
    }),
  }),
}));

const { endSession } = await import('../../lib/session-manager.mjs');

describe('endSession — release_session RPC failure fallback (FR-1)', () => {
  beforeEach(() => {
    h.updateCalls.length = 0;
    h.rpcError = { message: 'RPC not available' };
    h.sessionFile = {
      data: {
        terminal_id: 'fixed-test-terminal-id',
        session_id: '22222222-2222-4222-8222-222222222222',
        sd_key: null,
      },
    };
  });

  it('writes is_alive:false alongside status:released via terminalSessionUpdate when the RPC fails', async () => {
    await endSession('graceful_exit');

    const sessUpdate = h.updateCalls.find((u) => u.table === 'claude_sessions');
    expect(sessUpdate).toBeTruthy();
    expect(sessUpdate.payload).toMatchObject({ status: 'released', is_alive: false, released_reason: 'graceful_exit' });
  });

  it('returns no_session when there is no matching session file, without writing anything', async () => {
    h.sessionFile = null;
    const result = await endSession('graceful_exit');
    expect(result.success).toBe(false);
    expect(result.error).toBe('no_session');
    expect(h.updateCalls).toHaveLength(0);
  });
});
