/**
 * SD-FDBK-INFRA-SESSION-NAMED-ACCOUNT-001 FR-4 -- unit tests for
 * lib/fleet/handoff-account-attribution.cjs. A fake Supabase client scripts both tables'
 * responses; no real DB.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { computeHandoffsByAccount, summarizeByAccount } = require('../../../lib/fleet/handoff-account-attribution.cjs');

function fakeSupabase({ handoffs, handoffError = null, sessions, sessionError = null }) {
  return {
    from(table) {
      if (table === 'leo_handoff_executions') {
        // A real Supabase query builder is thenable and chainable; await on the chain itself
        // (not a terminal .then() call) resolves via this same object's .then().
        const chain = {
          eq: () => chain,
          gte: () => chain,
          then: (resolve) => resolve({ data: handoffs, error: handoffError }),
        };
        return { select: () => chain };
      }
      if (table === 'claude_sessions') {
        return { select: () => ({ in: () => ({ then: (resolve) => resolve({ data: sessions, error: sessionError }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe('computeHandoffsByAccount', () => {
  it('TS-5: attributes each handoff to its session\'s stamped account, no cross-account leakage', async () => {
    const supabase = fakeSupabase({
      handoffs: [
        { id: 'h1', sd_id: 'sd-A', handoff_type: 'LEAD-TO-PLAN', created_by: 'session-A', created_at: '2026-09-01T00:00:00Z' },
        { id: 'h2', sd_id: 'sd-B', handoff_type: 'PLAN-TO-EXEC', created_by: 'session-B', created_at: '2026-09-01T00:00:00Z' },
      ],
      sessions: [
        { session_id: 'session-A', metadata: { account_uuid8: 'aaaaaaaa', account_org_name: 'OrgA', account_email: 'a@example.com', account_auth_method: 'config_dir' } },
        { session_id: 'session-B', metadata: { account_uuid8: 'bbbbbbbb', account_org_name: 'OrgB', account_email: 'b@example.com', account_auth_method: 'claude.ai' } },
      ],
    });

    const { rows, error } = await computeHandoffsByAccount(supabase);
    expect(error).toBeNull();
    expect(rows).toHaveLength(2);
    const h1 = rows.find((r) => r.handoff_id === 'h1');
    const h2 = rows.find((r) => r.handoff_id === 'h2');
    expect(h1).toMatchObject({ account_uuid8: 'aaaaaaaa', source: 'measured' });
    expect(h2).toMatchObject({ account_uuid8: 'bbbbbbbb', source: 'measured' });
  });

  it('labels a host-default-sourced account distinctly from a measured one', async () => {
    const supabase = fakeSupabase({
      handoffs: [{ id: 'h1', sd_id: 'sd-A', handoff_type: 'LEAD-TO-PLAN', created_by: 'session-A', created_at: '2026-09-01T00:00:00Z' }],
      sessions: [{ session_id: 'session-A', metadata: { account_uuid8: 'aaaaaaaa', account_org_name: 'OrgA', account_auth_method: 'host_default' } }],
    });
    const { rows } = await computeHandoffsByAccount(supabase);
    expect(rows[0].source).toBe('host_default');
  });

  it('a session with no resolved account attributes as unattributed, never a fabricated account', async () => {
    const supabase = fakeSupabase({
      handoffs: [{ id: 'h1', sd_id: 'sd-A', handoff_type: 'LEAD-TO-PLAN', created_by: 'session-A', created_at: '2026-09-01T00:00:00Z' }],
      sessions: [{ session_id: 'session-A', metadata: { account_unresolved_at: '2026-09-01T00:00:00Z' } }],
    });
    const { rows } = await computeHandoffsByAccount(supabase);
    expect(rows[0]).toMatchObject({ account_uuid8: null, source: 'unattributed' });
  });

  it('a handoff whose session row is missing entirely still attributes as unattributed, not thrown', async () => {
    const supabase = fakeSupabase({
      handoffs: [{ id: 'h1', sd_id: 'sd-A', handoff_type: 'LEAD-TO-PLAN', created_by: 'session-gone', created_at: '2026-09-01T00:00:00Z' }],
      sessions: [], // session row absent (e.g. purged)
    });
    const { rows, error } = await computeHandoffsByAccount(supabase);
    expect(error).toBeNull();
    expect(rows[0]).toMatchObject({ account_uuid8: null, source: 'unattributed' });
  });

  it('error condition: a query error returns rows:[] and a non-null error, never throws', async () => {
    const supabase = fakeSupabase({ handoffs: null, handoffError: { message: 'db unavailable' } });
    const { rows, error } = await computeHandoffsByAccount(supabase);
    expect(rows).toEqual([]);
    expect(error).toBe('db unavailable');
  });

  it('no handoffs at all returns an empty result, not an error', async () => {
    const supabase = fakeSupabase({ handoffs: [] });
    const { rows, error } = await computeHandoffsByAccount(supabase);
    expect(rows).toEqual([]);
    expect(error).toBeNull();
  });
});

describe('summarizeByAccount', () => {
  it('groups rows into a per-account completed-handoff count, keeping source distinct', () => {
    const rows = [
      { account_uuid8: 'aaaaaaaa', account_org_name: 'OrgA', source: 'measured' },
      { account_uuid8: 'aaaaaaaa', account_org_name: 'OrgA', source: 'measured' },
      { account_uuid8: 'aaaaaaaa', account_org_name: 'OrgA', source: 'host_default' },
      { account_uuid8: null, account_org_name: null, source: 'unattributed' },
    ];
    const summary = summarizeByAccount(rows);
    expect(summary).toHaveLength(3);
    expect(summary.find((s) => s.source === 'measured').completed_handoffs).toBe(2);
    expect(summary.find((s) => s.source === 'host_default').completed_handoffs).toBe(1);
    expect(summary.find((s) => s.source === 'unattributed').completed_handoffs).toBe(1);
  });
});
