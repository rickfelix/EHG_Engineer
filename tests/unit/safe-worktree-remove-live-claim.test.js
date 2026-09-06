/**
 * QF-20260903-419: git status/log examine CONTENT only — neither can see that a
 * released SD/QF was RE-CLAIMED by another seat. Two live-claimed trees were
 * destroyed because the hand-removal entrypoint never checked the DB claim row
 * before deleting. resolveLiveClaim closes that gap; these tests pin its contract.
 */
import { describe, it, expect } from 'vitest';
import { keyFromBranch, resolveLiveClaim } from '../../scripts/safe-worktree-remove.mjs';

function stubClient(row) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
    }),
  };
}

function erroringClient() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { message: 'boom' } }),
        }),
      }),
    }),
  };
}

describe('keyFromBranch', () => {
  it('extracts the SD/QF key from a feat/qf-prefixed branch', () => {
    expect(keyFromBranch('feat/SD-LEO-FIX-EXAMPLE-001')).toBe('SD-LEO-FIX-EXAMPLE-001');
    expect(keyFromBranch('qf/QF-20260903-419')).toBe('QF-20260903-419');
  });
  it('returns null for an unrecognized branch shape', () => {
    expect(keyFromBranch('scribe/idle')).toBeNull();
    expect(keyFromBranch(undefined)).toBeNull();
  });
});

describe('resolveLiveClaim — the scenario this QF exists to close', () => {
  it('a seat releases, another seat re-claims the same key: reports LIVE, refusing removal', async () => {
    // Simulates exactly the incident: the removing seat's own release is stale —
    // a different session now holds claiming_session_id on this row.
    const client = stubClient({ claiming_session_id: 'a-different-seat-session-id' });
    await expect(resolveLiveClaim('SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-C', { supabaseClient: client }))
      .resolves.toBe(true);
  });

  it('genuinely unclaimed row: reports NOT live, removal may proceed', async () => {
    const client = stubClient({ claiming_session_id: null });
    await expect(resolveLiveClaim('SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-C', { supabaseClient: client }))
      .resolves.toBe(false);
  });

  it('routes a QF-shaped key to quick_fixes, not strategic_directives_v2', async () => {
    let queriedTable = null;
    const client = {
      from: (table) => {
        queriedTable = table;
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { claiming_session_id: null }, error: null }) }) }) };
      },
    };
    await resolveLiveClaim('QF-20260903-419', { supabaseClient: client });
    expect(queriedTable).toBe('quick_fixes');
  });

  it('fails CLOSED (treated as live) when the DB query errors — unverifiable is never safe', async () => {
    await expect(resolveLiveClaim('SD-LEO-FIX-EXAMPLE-001', { supabaseClient: erroringClient() }))
      .resolves.toBe(true);
  });

  it('no resolvable key: nothing to protect, does not block removal', async () => {
    await expect(resolveLiveClaim(null, {})).resolves.toBe(false);
  });
});

describe('resolveLiveClaim — FR-1b additive narrowing (claim-row presence is not proof of liveness)', () => {
  const NOW = Date.parse('2026-09-04T12:00:00.000Z');

  function twoTableClient({ claimingSessionId, sessionRow }) {
    return {
      from: (table) => {
        if (table === 'claude_sessions') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: sessionRow, error: null }) }) }) };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { claiming_session_id: claimingSessionId }, error: null }) }) }) };
      },
    };
  }

  it('claim row present + released_at + no resident PID: newly resolves NOT live', async () => {
    const client = twoTableClient({
      claimingSessionId: 'dead-seat',
      sessionRow: { session_id: 'dead-seat', released_at: '2026-09-04T11:00:00.000Z', last_tool_at: null, loop_state: null },
    });
    await expect(resolveLiveClaim('SD-EXAMPLE-001', {
      supabaseClient: client, nowMs: NOW, markerDirsFn: () => ['dir1'], getMarkerSessionIdsFn: () => ({}),
    })).resolves.toBe(false);
  });

  it('claim row present + released_at but a resident PID exists: still LIVE (PID always wins)', async () => {
    const client = twoTableClient({
      claimingSessionId: 'dead-seat',
      sessionRow: { session_id: 'dead-seat', released_at: '2026-09-04T11:00:00.000Z', last_tool_at: null, loop_state: null },
    });
    await expect(resolveLiveClaim('SD-EXAMPLE-001', {
      supabaseClient: client, nowMs: NOW,
      markerDirsFn: () => ['dir1'],
      getMarkerSessionIdsFn: () => ({ 'dead-seat': { alive: true } }),
    })).resolves.toBe(true);
  });

  it('claim row present + frozen tool clock past the freeze-cut + no resident PID: newly resolves NOT live', async () => {
    const client = twoTableClient({
      claimingSessionId: 'wedged-seat',
      sessionRow: {
        session_id: 'wedged-seat', released_at: null, loop_state: 'active',
        last_tool_at: new Date(NOW - 999 * 60000).toISOString(),
      },
    });
    await expect(resolveLiveClaim('SD-EXAMPLE-001', {
      supabaseClient: client, nowMs: NOW, markerDirsFn: () => ['dir1'], getMarkerSessionIdsFn: () => ({}),
    })).resolves.toBe(false);
  });

  it('claim row present, session has recent tool activity: still LIVE (not proven dead)', async () => {
    const client = twoTableClient({
      claimingSessionId: 'live-seat',
      sessionRow: {
        session_id: 'live-seat', released_at: null, loop_state: 'active',
        last_tool_at: new Date(NOW - 2 * 60000).toISOString(),
      },
    });
    await expect(resolveLiveClaim('SD-EXAMPLE-001', {
      supabaseClient: client, nowMs: NOW, markerDirsFn: () => ['dir1'], getMarkerSessionIdsFn: () => ({}),
    })).resolves.toBe(true);
  });

  it('claim row present, the claiming session row cannot be found: fails closed (still live)', async () => {
    const client = twoTableClient({ claimingSessionId: 'ghost-seat', sessionRow: null });
    await expect(resolveLiveClaim('SD-EXAMPLE-001', {
      supabaseClient: client, nowMs: NOW, markerDirsFn: () => ['dir1'], getMarkerSessionIdsFn: () => ({}),
    })).resolves.toBe(true);
  });

  it('checks the marker-dir UNION, not just the first directory', async () => {
    const client = twoTableClient({
      claimingSessionId: 'dead-seat',
      sessionRow: { session_id: 'dead-seat', released_at: '2026-09-04T11:00:00.000Z' },
    });
    const seen = [];
    const result = await resolveLiveClaim('SD-EXAMPLE-001', {
      supabaseClient: client, nowMs: NOW,
      markerDirsFn: () => ['local-dir', 'main-worktree-dir'],
      getMarkerSessionIdsFn: (dir) => { seen.push(dir); return dir === 'main-worktree-dir' ? { 'dead-seat': { alive: true } } : {}; },
    });
    expect(seen).toEqual(['local-dir', 'main-worktree-dir']);
    // a PID found ONLY in the second (main-worktree) dir must still count as live --
    // checking only the local dir would have missed it and wrongly reclaimed a live tree.
    expect(result).toBe(true);
  });
});
