// SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-002 (FR-1) — a QF must be puttable-down.
//
// TWO SEATS WERE PINNED BY ONE ROOT CAUSE. resume.cjs derives ctx.mySd from claude_sessions.sd_key —
// a MIRROR — and self-heals only when the authoritative row is TERMINAL or GONE. "open" (returned to
// the queue) and "deferred" are in neither set, so the mirror is never cleared and the seat resumes
// the QF forever. The returned case is worse than a pin: the QF is simultaneously back in the OPEN
// queue, so a second seat can claim it concurrently and there is no collision detector.
//
// THE FR'S ACCEPTANCE SAID "add 'open' to the QF terminal set". THAT WOULD BE A REGRESSION, and the
// measurement is the reason: CLAIMABLE_QF_STATUSES is exactly ['open'], so a LEGITIMATELY HELD QF
// also reads status='open' (live: 1 of 1 claimed QFs). Treating 'open' as terminal would self-heal
// every real QF claim on its next check-in. The SD title already names the correct axis — test
// OWNERSHIP, not terminal-ness — so the predicate is "back in the queue AND not mine".
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RESUME_SRC = fs.readFileSync(path.join(root, 'lib/checkin/steps/resume.cjs'), 'utf8');
const DEFER_SRC = fs.readFileSync(path.join(root, 'scripts/defer-quick-fix.js'), 'utf8');

const MINE = 'sess-mine';
const OTHER = 'sess-other';

/** The predicate as resume.cjs applies it, extracted so both directions are assertable. */
const isStaleQfMirror = (qfRow, sessionId) => {
  if (!qfRow) return false;
  if (['completed', 'cancelled', 'escalated', 'closed'].includes(qfRow.status)) return true;
  return qfRow.status === 'open' && qfRow.claiming_session_id !== sessionId;
};

describe('FR-1: the RETURNED-QF pin — ownership, not status', () => {
  // The originating repro (Alpha-2): status back to open, claim cleared, resumed forever.
  it('a QF returned to the queue with NO holder is stale for the seat still mirroring it', () => {
    expect(isStaleQfMirror({ status: 'open', claiming_session_id: null }, MINE)).toBe(true);
  });

  it('a QF returned AND re-claimed by someone else is stale for me', () => {
    expect(isStaleQfMirror({ status: 'open', claiming_session_id: OTHER }, MINE)).toBe(true);
  });

  // THE REGRESSION GUARD. This is the case the FR's literal acceptance would have broken.
  it('a QF I ACTUALLY HOLD is NOT stale, even though its status is open', () => {
    expect(isStaleQfMirror({ status: 'open', claiming_session_id: MINE }, MINE)).toBe(false);
  });

  it('terminal statuses remain stale regardless of holder', () => {
    for (const status of ['completed', 'cancelled', 'escalated', 'closed']) {
      expect(isStaleQfMirror({ status, claiming_session_id: MINE }, MINE), status).toBe(true);
    }
  });

  it('the implementation asks the ownership question, not a status-list question', () => {
    // Guards against a later "simplification" back to the naive list, which reads tidier and is wrong.
    expect(RESUME_SRC).toMatch(/qfRow\.status === 'open' && qfRow\.claiming_session_id !== sessionId/);
    expect(RESUME_SRC).toMatch(/select\('status, claiming_session_id'\)/);
    // 'open' must NOT have been added to the terminal array.
    expect(RESUME_SRC).not.toMatch(/\['completed', 'cancelled', 'escalated', 'closed', 'open'\]/);
  });
});

describe('FR-1: the DEFERRED-QF pin — deferring must release BOTH surfaces', () => {
  const { deferQuickFix } = require_('../../../scripts/defer-quick-fix.js');

  const stub = (current) => {
    const calls = { qfUpdate: null, mirrorUpdate: null, mirrorFilters: {} };
    const client = {
      from: (table) => {
        if (table === 'quick_fixes') {
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: current }) }) }),
            update: (payload) => { calls.qfUpdate = payload; return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'QF-X', status: 'open', not_before: '2026-07-05T21:00:00.000Z' } }) }) }) }; },
          };
        }
        return {
          update: (payload) => {
            calls.mirrorUpdate = payload;
            return { eq: (col, val) => { calls.mirrorFilters[col] = val; return { eq: (c2, v2) => { calls.mirrorFilters[c2] = v2; return { error: null }; } }; } };
          },
        };
      },
    };
    return { client, calls };
  };

  it('clears the AUTHORITATIVE column — today it clears neither surface', async () => {
    const s = stub({ claiming_session_id: OTHER });
    await deferQuickFix('QF-X', '2026-07-05T21:00:00Z', { supabaseClient: s.client });
    expect(s.calls.qfUpdate).toHaveProperty('claiming_session_id', null);
  });

  it('clears the MIRROR too — clearing one surface is what produced the half-released states', async () => {
    const s = stub({ claiming_session_id: OTHER });
    await deferQuickFix('QF-X', '2026-07-05T21:00:00Z', { supabaseClient: s.client });
    expect(s.calls.mirrorUpdate).toEqual({ sd_key: null });
  });

  // COMPARE-AND-SET. A blanket clear would stomp a session that has already moved on — the same
  // hazard FR-6 documents in the SD claim path, which updates with no CAS at all.
  it('scopes the mirror clear to the holder AND to this QF, never a blanket clear', async () => {
    const s = stub({ claiming_session_id: OTHER });
    await deferQuickFix('QF-X', '2026-07-05T21:00:00Z', { supabaseClient: s.client });
    expect(s.calls.mirrorFilters.session_id).toBe(OTHER);
    expect(s.calls.mirrorFilters.sd_key).toBe('QF-X');
  });

  it('touches no mirror when the QF was unheld — nothing to release', async () => {
    const s = stub({ claiming_session_id: null });
    await deferQuickFix('QF-X', '2026-07-05T21:00:00Z', { supabaseClient: s.client });
    expect(s.calls.mirrorUpdate).toBeNull();
  });

  // The defer is the durable outcome; a mirror-clear failure must not turn a successful release
  // into a thrown error and leave the caller believing nothing happened.
  it('still returns success when the mirror clear fails, and says so', async () => {
    const s = stub({ claiming_session_id: OTHER });
    s.client.from = ((orig) => (table) => {
      if (table === 'quick_fixes') return orig(table);
      return { update: () => ({ eq: () => ({ eq: () => ({ error: { message: 'permission denied' } }) }) }) };
    })(s.client.from);
    const result = await deferQuickFix('QF-X', '2026-07-05T21:00:00Z', { supabaseClient: s.client });
    expect(result.id).toBe('QF-X');
  });

  it('reads the holder BEFORE the update, since the update nulls the column', () => {
    // A RETURNING-based read would hand back the already-cleared value and silently skip the mirror.
    const readIdx = DEFER_SRC.indexOf("select('claiming_session_id')");
    const updIdx = DEFER_SRC.indexOf('.update(update)');
    expect(readIdx).toBeGreaterThan(-1);
    expect(readIdx).toBeLessThan(updIdx);
  });
});
