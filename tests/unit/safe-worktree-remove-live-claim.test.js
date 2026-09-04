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
