/**
 * SD-FDBK-INFRA-HARDEN-ORCHESTRATOR-CHILD-001 — FR-3 / AC-5.
 * Unit-tests the sanctioned parent-rollup-claim helper against a mock supabase client.
 */
import { describe, it, expect } from 'vitest';
import { claimOrchestratorForRollup } from '../../../scripts/claim-orchestrator-for-rollup.mjs';

/**
 * Build a mock supabase whose responses are configured per (table, eq-column).
 * Captures any .update() payload.
 */
function makeMock({ sd = null, children = [], session = null } = {}) {
  const captured = { updates: [] };
  const client = {
    from(table) {
      return {
        // SD-LEO-FIX-CLAIM-RELEASE-DESYNC-001: the --release branch now co-clears BOTH
        // surfaces via releaseClaimBothSurfaces, whose holder-pinned CAS + readback chain
        // TWO .eq() calls. select/update builders must therefore accept chained .eq().
        select() {
          const chain = {
            _col: null,
            eq(col) { chain._col = chain._col ?? col; return chain; },
            async maybeSingle() {
              if (table === 'strategic_directives_v2') return { data: sd, error: null };
              if (table === 'claude_sessions') return { data: session, error: null };
              return { data: null, error: null };
            },
            async limit() {
              if (table === 'strategic_directives_v2' && chain._col === 'parent_sd_id') return { data: children, error: null };
              return { data: [], error: null };
            },
          };
          return chain;
        },
        update(payload) {
          const filters = {};
          const chain = {
            eq(col, val) { filters[col] = val; return chain; },
            then(res) { captured.updates.push({ table, payload, filters }); res({ error: null }); },
          };
          return chain;
        },
      };
    },
  };
  return { client, captured };
}

const ORCH = { id: 'uuid-parent', sd_key: 'SD-ORCH-001', sd_type: 'orchestrator', is_working_on: false, claiming_session_id: null };

describe('claimOrchestratorForRollup (FR-3 / AC-5)', () => {
  it('claims an unclaimed orchestrator parent (is_working_on=true + claiming_session_id)', async () => {
    const { client, captured } = makeMock({ sd: ORCH });
    const r = await claimOrchestratorForRollup(client, { sdKey: 'SD-ORCH-001', sessionId: 'sess-me' });
    expect(r).toMatchObject({ ok: true, action: 'claimed', sdKey: 'SD-ORCH-001' });
    expect(captured.updates).toHaveLength(1);
    expect(captured.updates[0].payload).toEqual({ is_working_on: true, claiming_session_id: 'sess-me' });
  });

  it('releases the parent (--release clears BOTH surfaces)', async () => {
    const { client, captured } = makeMock({
      sd: { ...ORCH, is_working_on: true, claiming_session_id: 'sess-me' },
      session: { session_id: 'sess-me', sd_key: 'SD-ORCH-001', worktree_path: '/w', worktree_branch: 'b' },
    });
    const r = await claimOrchestratorForRollup(client, { sdKey: 'SD-ORCH-001', sessionId: 'sess-me', release: true });
    expect(r).toMatchObject({ ok: true, action: 'released' });
    // Dual-surface: SD-side claim fields cleared AND the holder's session-side surface co-cleared.
    const sdU = captured.updates.find((u) => u.table === 'strategic_directives_v2');
    const sessU = captured.updates.find((u) => u.table === 'claude_sessions');
    expect(sdU.payload).toEqual({ claiming_session_id: null, active_session_id: null, is_working_on: false });
    expect(sessU.payload).toMatchObject({ sd_key: null, worktree_path: null, worktree_branch: null });
  });

  it('refuses when the parent is claimed by a DIFFERENT live session (recent heartbeat)', async () => {
    const now = Date.parse('2026-05-25T12:00:00Z');
    const sd = { ...ORCH, is_working_on: true, claiming_session_id: 'sess-other' };
    const session = { session_id: 'sess-other', status: 'active', heartbeat_at: new Date(now - 60_000).toISOString() };
    const { client, captured } = makeMock({ sd, session });
    const r = await claimOrchestratorForRollup(client, { sdKey: 'SD-ORCH-001', sessionId: 'sess-me', now });
    expect(r).toMatchObject({ ok: false, action: 'refused' });
    expect(captured.updates).toHaveLength(0); // no mutation on refusal
  });

  it('takes over a STALE foreign claim (old heartbeat) and claims it', async () => {
    const now = Date.parse('2026-05-25T12:00:00Z');
    const sd = { ...ORCH, is_working_on: true, claiming_session_id: 'sess-stale' };
    const session = { session_id: 'sess-stale', status: 'active', heartbeat_at: new Date(now - 30 * 60_000).toISOString() }; // 30 min ago > 15 min TTL
    const { client, captured } = makeMock({ sd, session });
    const r = await claimOrchestratorForRollup(client, { sdKey: 'SD-ORCH-001', sessionId: 'sess-me', now });
    expect(r).toMatchObject({ ok: true, action: 'claimed' });
    expect(captured.updates).toHaveLength(1);
  });

  it('errors when the SD is NOT an orchestrator (no sd_type and no children)', async () => {
    const leaf = { id: 'uuid-leaf', sd_key: 'SD-LEAF-001', sd_type: 'feature', is_working_on: false, claiming_session_id: null };
    const { client, captured } = makeMock({ sd: leaf, children: [] });
    const r = await claimOrchestratorForRollup(client, { sdKey: 'SD-LEAF-001', sessionId: 'sess-me' });
    expect(r.ok).toBe(false);
    expect(r.action).toBe('error');
    expect(captured.updates).toHaveLength(0);
  });

  it('treats a non-orchestrator-typed SD WITH children as an orchestrator (claims it)', async () => {
    const parentByChildren = { id: 'uuid-p2', sd_key: 'SD-P2-001', sd_type: 'infrastructure', is_working_on: false, claiming_session_id: null };
    const { client } = makeMock({ sd: parentByChildren, children: [{ id: 'kid-1' }] });
    const r = await claimOrchestratorForRollup(client, { sdKey: 'SD-P2-001', sessionId: 'sess-me' });
    expect(r).toMatchObject({ ok: true, action: 'claimed' });
  });

  it('errors on missing session id', async () => {
    const { client } = makeMock({ sd: ORCH });
    const r = await claimOrchestratorForRollup(client, { sdKey: 'SD-ORCH-001', sessionId: '' });
    expect(r.ok).toBe(false);
  });
});
