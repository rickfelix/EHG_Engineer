/**
 * SD-MAN-INFRA-SAME-TURN-NEXT-001 — same-turn next-claim rule + boundary instrumentation.
 *
 * TS-1: rule-text parity pin — the [ROLE] WORKER line and the fleet directive step 6
 *       must both carry the same-turn-claim rule (empty-belt-only parking), the
 *       WIP-push clause must be preserved, and they must cross-reference each other.
 * TS-2: stampClaim appends {session_id, claimed_at} to metadata.claim_history,
 *       preserves existing metadata keys, FIFO-caps at 20.
 * TS-3: stamp helpers are fail-soft — DB errors / throws never propagate.
 * TS-4: completion flip captures the session id BEFORE active_session_id is nulled
 *       (static source pin on the executor).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stampClaim, stampCompletion, CLAIM_HISTORY_CAP } from '../../lib/fleet/claim-stamp.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const read = (p) => readFileSync(path.join(repoRoot, p), 'utf8');

// ---------- mock supabase ----------
function mockSupabase(row, { readError = null, writeError = null } = {}) {
  const calls = { updates: [] };
  const client = {
    from(table) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: readError ? null : row, error: readError })
              };
            }
          };
        },
        update(payload) {
          calls.updates.push({ table, payload });
          return { eq: async () => ({ error: writeError }) };
        }
      };
    }
  };
  return { client, calls };
}

// ---------- TS-1: rule-text parity pin ----------
describe('TS-1 rule-text parity: [ROLE] line vs directive step 6', () => {
  const roleSrc = read('scripts/hooks/session-role-orient.cjs');
  const directive = read('docs/protocol/fleet-worker-loop-directive.md');

  it('[ROLE] WORKER block carries the same-turn next-claim rule', () => {
    expect(roleSrc).toMatch(/SAME-TURN NEXT-CLAIM/);
    expect(roleSrc).toMatch(/SAME turn/);
    expect(roleSrc).toMatch(/genuinely EMPTY/);
    // the old unconditional rule must be gone
    expect(roleSrc).not.toMatch(/ALWAYS ScheduleWakeup at the END of every pass/);
  });

  it('[ROLE] line preserves the WIP-push clause verbatim', () => {
    expect(roleSrc).toContain(
      'Before parking with unpushed work, COMMIT + PUSH your WIP on the claim-bound branch first'
    );
    expect(roleSrc).toContain('scripts/prepark-wip.cjs');
  });

  it('directive step 6 carries the matching same-turn rule + empty-belt-only park', () => {
    expect(directive).toMatch(/claim the next workable SD IN THIS SAME TURN/);
    expect(directive).toMatch(/Park ONLY when the belt is genuinely EMPTY/);
  });

  it('the two sites cross-reference each other', () => {
    expect(roleSrc).toContain('docs/protocol/fleet-worker-loop-directive.md');
    expect(directive).toContain('scripts/hooks/session-role-orient.cjs');
  });

  it('both sites state the KPI', () => {
    expect(roleSrc).toMatch(/≤3min, p90 ≤8min/);
    expect(directive).toMatch(/≤3 min, p90 ≤8 min/);
  });
});

// ---------- TS-2: claim stamp append ----------
describe('TS-2 stampClaim', () => {
  const SD_ID = 'aa4692db-732b-4719-ad79-595a5aa45f8e';

  it('appends {session_id, claimed_at} and preserves existing metadata keys', async () => {
    const { client, calls } = mockSupabase({
      id: SD_ID,
      metadata: { existing_key: 'kept', claim_history: [{ session_id: 'old', claimed_at: '2026-06-01T00:00:00Z' }] }
    });
    const entry = await stampClaim(client, 'SD-TEST-KEY-001', 'sess-new');
    expect(entry).toMatchObject({ session_id: 'sess-new' });
    expect(entry.claimed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const md = calls.updates[0].payload.metadata;
    expect(md.existing_key).toBe('kept');
    expect(md.claim_history).toHaveLength(2);
    expect(md.claim_history[1].session_id).toBe('sess-new');
  });

  it('FIFO-caps claim_history at CLAIM_HISTORY_CAP', async () => {
    const full = Array.from({ length: CLAIM_HISTORY_CAP }, (_, i) => ({
      session_id: `s${i}`, claimed_at: '2026-06-01T00:00:00Z'
    }));
    const { client, calls } = mockSupabase({ id: SD_ID, metadata: { claim_history: full } });
    await stampClaim(client, SD_ID, 'sess-21');
    const md = calls.updates[0].payload.metadata;
    expect(md.claim_history).toHaveLength(CLAIM_HISTORY_CAP);
    expect(md.claim_history[CLAIM_HISTORY_CAP - 1].session_id).toBe('sess-21');
    expect(md.claim_history[0].session_id).toBe('s1'); // oldest (s0) evicted
  });

  it('handles null metadata (greenfield row)', async () => {
    const { client, calls } = mockSupabase({ id: SD_ID, metadata: null });
    const entry = await stampClaim(client, SD_ID, 'sess-a');
    expect(entry).not.toBeNull();
    expect(calls.updates[0].payload.metadata.claim_history).toHaveLength(1);
  });
});

// ---------- TS-3: fail-soft ----------
describe('TS-3 fail-soft', () => {
  it('returns null (not throw) on read error', async () => {
    const { client } = mockSupabase(null, { readError: { message: 'boom' } });
    await expect(stampClaim(client, 'SD-X', 's')).resolves.toBeNull();
    await expect(stampCompletion(client, 'SD-X', 's')).resolves.toBeNull();
  });

  it('returns null (not throw) on write error', async () => {
    const { client } = mockSupabase({ id: 'x', metadata: {} }, { writeError: { message: 'boom' } });
    await expect(stampClaim(client, 'SD-X', 's')).resolves.toBeNull();
    await expect(stampCompletion(client, 'SD-X', 's')).resolves.toBeNull();
  });

  it('returns null on missing args / throwing client', async () => {
    await expect(stampClaim(null, 'SD-X', 's')).resolves.toBeNull();
    await expect(stampClaim({ from() { throw new Error('boom'); } }, 'SD-X', 's')).resolves.toBeNull();
    await expect(stampCompletion({ from() { throw new Error('boom'); } }, 'SD-X', 's')).resolves.toBeNull();
    await expect(stampClaim({}, 'SD-X', null)).resolves.toBeNull();
  });
});

// ---------- TS-4: completion stamp + ordering pin ----------
describe('TS-4 stampCompletion + executor ordering', () => {
  it('stamps completed_by_session + completed_stamp_at, preserving metadata', async () => {
    const { client, calls } = mockSupabase({ id: 'x', metadata: { keep: 1 } });
    const res = await stampCompletion(client, 'x', 'sess-done');
    expect(res.completed_by_session).toBe('sess-done');
    const md = calls.updates[0].payload.metadata;
    expect(md.keep).toBe(1);
    expect(md.completed_by_session).toBe('sess-done');
    expect(md.completed_stamp_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('executor captures the session id BEFORE the update nulls active_session_id (source pin)', () => {
    const src = read('scripts/modules/handoff/executors/lead-final-approval/index.js');
    const captureIdx = src.indexOf('const completedBySession =');
    const nullIdx = src.indexOf('active_session_id: null');
    const stampIdx = src.indexOf('stampCompletion(this.supabase');
    expect(captureIdx).toBeGreaterThan(-1);
    expect(nullIdx).toBeGreaterThan(-1);
    expect(stampIdx).toBeGreaterThan(-1);
    expect(captureIdx).toBeLessThan(nullIdx);
    expect(stampIdx).toBeGreaterThan(nullIdx);
  });

  it('all three claim_sd callers invoke stampClaim (source pin)', () => {
    for (const f of ['scripts/worker-checkin.cjs', 'lib/claim-guard.mjs', 'lib/session-conflict-checker.mjs']) {
      const src = read(f);
      expect(src, `${f} missing stampClaim wiring`).toMatch(/stampClaim\(/);
      expect(src, `${f} missing claim-stamp import`).toMatch(/claim-stamp\.cjs/);
    }
  });
});
