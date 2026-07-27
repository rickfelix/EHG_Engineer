/**
 * SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001 FR-2 — liveness wired into the claim-WRITE choke point.
 *
 * TWO PROPERTIES MATTER MOST HERE, and neither shows up on the happy path:
 *
 * 1. The liveness check must run BEFORE the SD row lookup. liveClaimWriteFenceReason returns null
 *    early for a non-SD id, which is how QF keys pass through — and all three measured incidents
 *    (QF-20260726-529 / -030 / -607) were QF claims. A check placed after that early return would
 *    leave the exact lane the defect was observed on unfenced. So this asserts ORDERING, not just
 *    the outcome.
 *
 * 2. Omitting the claimant id must be byte-identical to the pre-change behaviour, because four
 *    existing call sites still use the two-argument form.
 *
 * SEAMS, NOT MOCKS: the process probe and pidfile reader are injected through livenessOpts. An
 * earlier draft tried vi.mock('node:fs'), which does not reliably intercept a require()d .cjs
 * module — the classifier silently used the REAL tasklist and returned its fail-open verdict, so
 * the test went green-ish for the wrong reason. Injection makes the probe scripted and explicit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { liveClaimWriteFenceReason } = require('../../lib/fleet/claim-eligibility.cjs');
const { CLAIMANT_NOT_LIVE } = require('../../lib/fleet/claimant-liveness.cjs');

const LIVE_SESSION = 'live-session-0001';
const DEAD_SESSION = 'dead-session-0002';
const DEAD_PID = 31337;
const LIVE_PID = 7440;
const STALE_PID = 21864;

/**
 * Minimal Supabase stub. `sdRow: null` models a QF id — the case that used to slip through.
 * Counts SD-table lookups so ordering can be proven rather than inferred.
 */
function makeSb(sdRow, pidBySession) {
  const seen = { sdLookups: 0 };
  return {
    seen,
    from(table) {
      const builder = {
        select: () => builder,
        eq(col, val) { builder._col = col; builder._val = val; return builder; },
        maybeSingle: async () => {
          if (table === 'claude_sessions') {
            // Guards a real trap: this table has BOTH `id` and `session_id`, and querying the
            // wrong one silently returns no row, making every claimant look unclassifiable.
            expect(builder._col).toBe('session_id');
            const pid = pidBySession[builder._val];
            return { data: pid === undefined ? null : { pid }, error: null };
          }
          seen.sdLookups += 1;
          return { data: sdRow, error: null };
        },
      };
      return builder;
    },
  };
}

/** Scripted probes: only LIVE_PID is a live claude.exe; pidfiles exist only for the two sessions. */
function seams() {
  return {
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
  };
}

beforeEach(() => vi.clearAllMocks());

describe('FR-2 — claimant liveness at the claim-write choke point', () => {
  it('REFUSES a dead claimant on a QF id — the lane every measured incident used', async () => {
    const sb = makeSb(null, { [DEAD_SESSION]: DEAD_PID });
    const reason = await liveClaimWriteFenceReason(sb, 'QF-20260726-607', DEAD_SESSION, seams());
    expect(reason).toBe(CLAIMANT_NOT_LIVE);
  });

  it('does NOT refuse a live claimant whose recorded pid is stale (false-fence guard)', async () => {
    // Recorded pid is long dead; the tick pidfile points at a live claude.exe. Must pass.
    const sb = makeSb(null, { [LIVE_SESSION]: STALE_PID });
    const reason = await liveClaimWriteFenceReason(sb, 'QF-20260726-607', LIVE_SESSION, seams());
    expect(reason).toBeNull();
  });

  it('is byte-identical when no claimant id is supplied (existing 2-arg call sites)', async () => {
    const sb = makeSb(null, {});
    expect(await liveClaimWriteFenceReason(sb, 'QF-20260726-607')).toBeNull();
  });

  it('refuses BEFORE consulting the SD row — ordering, not just outcome', async () => {
    const sb = makeSb(null, { [DEAD_SESSION]: DEAD_PID });
    await liveClaimWriteFenceReason(sb, 'QF-20260726-607', DEAD_SESSION, seams());
    // Had liveness run after the row lookup, the QF early-return would have answered first.
    expect(sb.seen.sdLookups).toBe(0);
  });

  it('a LIVE claimant does not short-circuit the existing SD-axis fence — the row is still read', async () => {
    const sb = makeSb(
      { sd_key: 'SD-X-001', sd_type: 'infrastructure', status: 'draft', metadata: {} },
      { [LIVE_SESSION]: LIVE_PID },
    );
    await liveClaimWriteFenceReason(sb, 'SD-X-001', LIVE_SESSION, seams());
    // The property that matters is that liveness passing lets control REACH the pre-existing axis
    // logic. Deliberately not asserting a specific axis verdict here: that would mean hand-faking
    // a metadata shape classifyAllDispatchIneligibility consumes, and an assertion built on a
    // guessed shape proves nothing. The axis logic has its own tests.
    expect(sb.seen.sdLookups).toBe(1);
  });

  it('fails OPEN when the SESSION lookup errors — a broken probe must not wedge claiming', async () => {
    // Only claude_sessions errors. The SD lookup must still behave normally, because
    // liveClaimWriteFenceReason fails CLOSED on an SD-row error by design (that is the
    // pre-existing contract) and erroring both tables would test that instead of this.
    const sb = {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => (table === 'claude_sessions'
              ? { data: null, error: new Error('boom') }
              : { data: null, error: null }),
          }),
        }),
      }),
    };
    expect(await liveClaimWriteFenceReason(sb, 'QF-20260726-607', DEAD_SESSION, seams())).toBeNull();
  });
});
