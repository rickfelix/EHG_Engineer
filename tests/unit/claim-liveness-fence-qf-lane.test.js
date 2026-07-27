/**
 * SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001 FR-3 — the QF lane.
 *
 * This gets its own file, separate from the FR-2 wiring tests, because the QF lane is where the
 * defect was ACTUALLY OBSERVED: QF-20260726-529, -030 and -607 were all claimed by seats whose
 * claude process was gone. The SD lane has a shared fence upstream of its RPC; this lane does not,
 * so lib/quick-fix-claim.mjs writes claiming_session_id directly and had no liveness check at all.
 *
 * The refusal must not look like a lost CAS race. `claimed:false` alone is ambiguous — it is also
 * the legitimate "someone else holds it" answer — so a refusal carries `refused` and the liveness
 * detail, and the tests assert that distinction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { claimQuickFix } from '../../lib/quick-fix-claim.mjs';

const DEAD_SESSION = 'dead-session-aaaa';
const LIVE_SESSION = 'live-session-bbbb';
const DEAD_PID = 31337;
const LIVE_PID = 7440;
const STALE_PID = 21864;
const QF = 'QF-20260726-607';

/** Records whether the CAS was reached — the point is that a dead claimant never gets that far. */
function makeSb(pidBySession) {
  const seen = { casAttempts: 0 };
  return {
    seen,
    from(table) {
      const b = {
        select: () => b,
        eq(col, val) { b._col = col; b._val = val; return b; },
        or: () => b,
        update(payload) { seen.casAttempts += 1; seen.lastPayload = payload; return b; },
        maybeSingle: async () => {
          if (table === 'claude_sessions') {
            expect(b._col).toBe('session_id'); // `id` is a different key and silently returns null
            const pid = pidBySession[b._val];
            return { data: pid === undefined ? null : { pid }, error: null };
          }
          return { data: { id: QF, claiming_session_id: b._val }, error: null };
        },
      };
      return b;
    },
  };
}

function seams() {
  return {
    liveness: {
      execCmd: vi.fn((cmd) => {
        const m = /PID eq (\d+)/.exec(cmd);
        return m && Number(m[1]) === LIVE_PID
          ? `"claude.exe","${LIVE_PID}","Console","1","1 K"\n`
          : 'INFO: No tasks are running which match the specified criteria.\n';
      }),
      readPidfile: vi.fn((sessionId) => {
        if (sessionId === DEAD_SESSION) return { session_id: sessionId, cc_parent_pid: DEAD_PID };
        if (sessionId === LIVE_SESSION) return { session_id: sessionId, cc_parent_pid: LIVE_PID };
        return null;
      }),
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('FR-3 — the QF claim lane refuses a dead claimant', () => {
  it('REFUSES before the CAS runs, so no claiming_session_id is ever written', async () => {
    const sb = makeSb({ [DEAD_SESSION]: DEAD_PID });
    const res = await claimQuickFix(sb, QF, DEAD_SESSION, seams());

    expect(res.claimed).toBe(false);
    expect(res.refused).toBe('claimant_not_live');
    // The whole point: the write never happens. A refusal AFTER the CAS would still pin the row.
    expect(sb.seen.casAttempts).toBe(0);
  });

  it('distinguishes a liveness refusal from a lost CAS race', async () => {
    const sb = makeSb({ [DEAD_SESSION]: DEAD_PID });
    const res = await claimQuickFix(sb, QF, DEAD_SESSION, seams());
    // claimed:false alone is ambiguous — it is also the legitimate "another holder owns it" answer.
    expect(res.refused).toBeTruthy();
    expect(res.livenessDetail).toMatchObject({ session_id: DEAD_SESSION, verdict: 'DEAD' });
  });

  it('LETS THROUGH a live claimant whose RECORDED pid is stale (the false-fence guard)', async () => {
    // The measured shape: claude_sessions.pid is long dead, the tick pidfile names a live process.
    const sb = makeSb({ [LIVE_SESSION]: STALE_PID });
    const res = await claimQuickFix(sb, QF, LIVE_SESSION, seams());

    expect(res.refused).toBeUndefined();
    expect(sb.seen.casAttempts).toBe(1); // it reached the CAS, i.e. was NOT fenced
    expect(sb.seen.lastPayload).toMatchObject({ claiming_session_id: LIVE_SESSION, status: 'in_progress' });
  });

  it('LETS THROUGH a session with no tick pidfile — absence is not death (AC-N2)', async () => {
    const sb = makeSb({ 'unknown-session': 999 });
    const res = await claimQuickFix(sb, QF, 'unknown-session', seams());
    expect(res.refused).toBeUndefined();
    expect(sb.seen.casAttempts).toBe(1);
  });

  it('still rejects the malformed-argument cases it always did', async () => {
    await expect(claimQuickFix(null, QF, LIVE_SESSION)).rejects.toThrow(/requires a supabase client/);
    await expect(claimQuickFix(makeSb({}), QF, '')).rejects.toThrow(/requires both/);
  });
});
