/**
 * QF-20260726-425 ITEM A — the pre-claim evidence probe must not block a PROVEN self-owner.
 *
 * THE DEFECT (raised by Echo, verified here): with no session claim, triangulate classifies the SD
 * as 'orphaned' and computes reclaimSafe = !hasEvidenceOfLife, where evidence-of-life is
 * branch_present / plan_file_present / recent_sub_agent_activity (triangulate.js:365-371, :423).
 * Those signals are attributed to NO SESSION. So an EXEC-phase SD whose feature branch exists, or
 * whose long sub-agent run just wrote a row — WHICH IS THE VERY CONDITION THAT CREATES THIS BUG —
 * makes the probe return allowReclaim:false, and the re-acquire aborts as 'live_foreign_holder'
 * against evidence that is the caller's OWN.
 *
 * Why this mattered more than a normal miss: it would have PASSED on the specimen that motivated
 * the original fix (no branch, no plan file) and silently failed on the general case — shipping
 * something that looks correct and is inert exactly when it is needed.
 *
 * Steal-safety does NOT rest on this gate: the CAS writes only where claiming_session_id IS NULL or
 * equals self. These tests pin both halves — the override fires for self-owned orphans, and a
 * genuinely live foreign holder still blocks.
 */
import { describe, it, expect, vi } from 'vitest';
import { reacquireSelfLiveClaim } from '../../lib/claim/reacquire-self-live.mjs';

const SD_KEY = 'SD-TEST-EVIDENCE-001';
const SELF = 'sess-self';
const WT = '/repo/.worktrees/SD-TEST-EVIDENCE-001';

function buildSupabase({ freshRow, updateReturns = [{ sd_key: SD_KEY, is_working_on: true, claiming_session_id: SELF }] }) {
  const updateCalls = [];
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: freshRow, error: null })) })),
      })),
      update: vi.fn((payload) => ({
        eq: vi.fn((col, val) => ({
          or: vi.fn((orFilter) => ({
            select: vi.fn(() => {
              updateCalls.push({ payload, where: [col, val], orFilter });
              return Promise.resolve({ data: updateReturns, error: null });
            }),
          })),
        })),
      })),
    })),
    _updateCalls: updateCalls,
  };
}

/** The probe as it behaves for an orphan carrying evidence-of-life owned by nobody. */
const orphanWithEvidence = () =>
  vi.fn(() => Promise.resolve({
    allowReclaim: false,
    evidence: ['branch_present', 'recent_sub_agent_activity'],
    classification: 'orphaned',
  }));

const liveForeign = (classification) =>
  vi.fn(() => Promise.resolve({ allowReclaim: false, evidence: [], classification }));

const releasedRow = {
  sd_key: SD_KEY, is_working_on: false, claiming_session_id: null, active_session_id: null, worktree_path: WT,
};

const selfOwnedArgs = (sb, probe) => ({
  sd: { sd_key: SD_KEY, is_working_on: false, worktree_path: WT },
  resolveSession: vi.fn(() => Promise.resolve({ data: { session_id: SELF, sd_key: SD_KEY }, source: 'env_var' })),
  checkPreClaimEvidence: probe,
  cwd: WT,
  platform: 'linux',
  log: () => {},
});

describe('evidence override for a proven self-owner (QF-20260726-425 item A)', () => {
  it('THE FIX: re-acquires an ORPHANED SD despite evidence-of-life, when the worktree proves self-ownership', async () => {
    const sb = buildSupabase({ freshRow: releasedRow });
    const result = await reacquireSelfLiveClaim(sb, selfOwnedArgs(sb, orphanWithEvidence()));

    // Before the fix this returned { reacquired: false, reason: 'live_foreign_holder' }.
    expect(result.reacquired).toBe(true);
    expect(result.via).toBe('worktree_path');
    expect(sb._updateCalls).toHaveLength(1);
  });

  it('reproduces the exact trigger condition: a feature branch alone was enough to block', async () => {
    const sb = buildSupabase({ freshRow: releasedRow });
    const probe = vi.fn(() => Promise.resolve({
      allowReclaim: false, evidence: ['branch_present'], classification: 'orphaned',
    }));
    const result = await reacquireSelfLiveClaim(sb, selfOwnedArgs(sb, probe));
    expect(result.reacquired).toBe(true);
  });

  it('STEAL-SAFETY: a genuinely live foreign holder (healthy) still blocks', async () => {
    const sb = buildSupabase({ freshRow: releasedRow });
    const result = await reacquireSelfLiveClaim(sb, selfOwnedArgs(sb, liveForeign('healthy')));
    expect(result.reacquired).toBe(false);
    expect(result.reason).toBe('live_foreign_holder');
    expect(sb._updateCalls).toHaveLength(0); // never even attempted
  });

  it('STEAL-SAFETY: stale-but-alive foreign holder still blocks (busy, not dead)', async () => {
    const sb = buildSupabase({ freshRow: releasedRow });
    const result = await reacquireSelfLiveClaim(sb, selfOwnedArgs(sb, liveForeign('stale_alive')));
    expect(result.reacquired).toBe(false);
    expect(result.reason).toBe('live_foreign_holder');
    expect(sb._updateCalls).toHaveLength(0);
  });

  it('the CAS still refuses a FOREIGN claim even when the evidence gate was overridden', async () => {
    // Override fires, CAS runs, and the DB matches 0 rows because a peer holds it.
    const sb = buildSupabase({ freshRow: releasedRow, updateReturns: [] });
    const result = await reacquireSelfLiveClaim(sb, selfOwnedArgs(sb, orphanWithEvidence()));
    expect(result.reacquired).toBe(false);
    expect(result.reason).toBe('cas_noop_foreign_or_changed');
    // The guarantee that actually protects a peer: the write is scoped to null-or-self.
    expect(sb._updateCalls[0].orFilter).toContain('claiming_session_id.is.null');
    expect(sb._updateCalls[0].orFilter).toContain(SELF);
  });

  it('does NOT override when self-ownership was never proven', async () => {
    const sb = buildSupabase({ freshRow: { ...releasedRow, worktree_path: null } });
    const result = await reacquireSelfLiveClaim(sb, {
      sd: { sd_key: SD_KEY, is_working_on: false, worktree_path: null },
      // Deterministic session, but its sd_key does NOT match — no witness.
      resolveSession: vi.fn(() => Promise.resolve({ data: { session_id: SELF, sd_key: 'SD-OTHER-999' }, source: 'env_var' })),
      checkPreClaimEvidence: orphanWithEvidence(),
      cwd: '/somewhere/else',
      platform: 'linux',
      log: () => {},
    });
    expect(result.reacquired).toBe(false);
    expect(result.reason).toBe('not_self_owned');
    expect(sb._updateCalls).toHaveLength(0);
  });
});
