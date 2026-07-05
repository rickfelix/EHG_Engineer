/**
 * SD-LEO-INFRA-ADOPTED-RESUME-FINAL-001 (FR-3, TS-5/TS-6)
 *
 * lib/commands/claim-command.js's releaseClaim() — soft, fail-open warning when
 * releasing a claim on an SD stranded at pending_approval/LEAD_FINAL with no
 * LEAD-FINAL-APPROVAL handoff attempt yet. Must NEVER block the release, and must
 * NOT false-positive on the legitimate post-completion release path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let supabaseInstance;
vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => supabaseInstance,
}));
vi.mock('../../lib/claim/stale-threshold.js', () => ({
  getStaleThresholdSeconds: () => 300,
}));

function makeSupabase({ session, sd = null, finalHandoffs = [] }) {
  return {
    from: (table) => {
      if (table === 'claude_sessions') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: session, error: session ? null : { message: 'not found' } }),
            }),
          }),
        };
      }
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: sd, error: null }),
            }),
          }),
        };
      }
      if (table === 'sd_phase_handoffs') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: async () => ({ data: finalHandoffs, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: async () => ({ error: null }),
  };
}

async function importReleaseClaim() {
  vi.resetModules();
  return await import('../../lib/commands/claim-command.js');
}

let logLines;
beforeEach(() => {
  logLines = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => { logLines.push(args.join(' ')); });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('releaseClaim — FR-3 soft strand warning', () => {
  it('TS-5 (PREVENT direction): warns AND still releases when the SD is pending_approval/LEAD_FINAL with no final handoff yet', async () => {
    supabaseInstance = makeSupabase({
      session: { session_id: 'sess-1', sd_key: 'SD-STRAND-001', heartbeat_at: null, status: 'active' },
      sd: { id: 'sd-uuid-1', status: 'pending_approval', current_phase: 'LEAD_FINAL' },
      finalHandoffs: [],
    });

    const { releaseClaim } = await importReleaseClaim();
    await releaseClaim('sess-1');

    const output = logLines.join('\n');
    expect(output).toMatch(/one handoff from shipped/);
    expect(output).toMatch(/Released claim on SD-STRAND-001/);
  });

  it('TS-6 (legitimate release direction): does NOT warn when a LEAD-FINAL-APPROVAL handoff already exists', async () => {
    supabaseInstance = makeSupabase({
      session: { session_id: 'sess-2', sd_key: 'SD-DONE-001', heartbeat_at: null, status: 'active' },
      sd: { id: 'sd-uuid-2', status: 'pending_approval', current_phase: 'LEAD_FINAL' },
      finalHandoffs: [{ id: 'handoff-1' }],
    });

    const { releaseClaim } = await importReleaseClaim();
    await releaseClaim('sess-2');

    const output = logLines.join('\n');
    expect(output).not.toMatch(/one handoff from shipped/);
    expect(output).toMatch(/Released claim on SD-DONE-001/);
  });

  it('does NOT warn for an SD in any other phase/status (no false positive outside LEAD_FINAL)', async () => {
    supabaseInstance = makeSupabase({
      session: { session_id: 'sess-3', sd_key: 'SD-INPROGRESS-001', heartbeat_at: null, status: 'active' },
      sd: { id: 'sd-uuid-3', status: 'in_progress', current_phase: 'EXEC' },
      finalHandoffs: [],
    });

    const { releaseClaim } = await importReleaseClaim();
    await releaseClaim('sess-3');

    const output = logLines.join('\n');
    expect(output).not.toMatch(/one handoff from shipped/);
    expect(output).toMatch(/Released claim on SD-INPROGRESS-001/);
  });

  it('fails open: an error looking up the SD/handoff never blocks the release', async () => {
    const session = { session_id: 'sess-4', sd_key: 'SD-ERR-001', heartbeat_at: null, status: 'active' };
    supabaseInstance = {
      from: (table) => {
        if (table === 'claude_sessions') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: session, error: null }) }) }) };
        }
        if (table === 'strategic_directives_v2') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => { throw new Error('boom'); } }) }) };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
      rpc: async () => ({ error: null }),
    };

    const { releaseClaim } = await importReleaseClaim();
    await releaseClaim('sess-4');

    const output = logLines.join('\n');
    expect(output).toMatch(/Released claim on SD-ERR-001/);
  });
});
