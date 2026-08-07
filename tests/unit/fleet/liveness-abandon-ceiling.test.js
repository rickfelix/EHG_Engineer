/**
 * SD-LEO-INFRA-STALE-SESSION-SWEEP-001 FR-1b — the hard-abandonment ceiling.
 *
 * ⚠️ READ BEFORE "FIXING" A TEST HERE THAT CANNOT FAIL AGAINST OLD CODE. ⚠️
 *
 * This file deliberately contains BOTH kinds of test, and they are labelled:
 *
 *   [REGRESSION] — falsifiable against the pre-FR-1b guard. Revert the guard and it goes RED.
 *   [MUTATION]   — CANNOT fail against the pre-FR-1b guard, BY DESIGN. The ceiling only ever
 *                  REMOVES a hold the new abstention branch would have granted, so pre-change and
 *                  post-change agree on every over-ceiling input. These guard the NEW risk
 *                  direction — a claim stranded forever — which no prior behaviour can witness.
 *
 * The project rule "every new regression test must be observed to FAIL against unpatched code" is
 * correct and is satisfied by the [REGRESSION] cases. Applying it to the [MUTATION] cases would
 * delete the only thing standing between this SD and a permanently held claim on a PID-blind venue.
 * That carve-out is recorded in the PRD; it is repeated here because the PRD is not what someone
 * reads when a test looks redundant.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../..');

const { shouldHoldClaim, LIVENESS_ABANDON_SEC } = require(path.join(REPO, 'lib/fleet/claim-release-guard.cjs'));
const { heartbeatAgeSec, hasFreshHeartbeat, LIVENESS_HEARTBEAT_SEC } = require(path.join(REPO, 'lib/fleet/session-liveness.cjs'));
const { SILENCE_HARD_CAP_MS } = require(path.join(REPO, 'lib/fleet/silence-cap.cjs'));

const NO_PIDS = { aliveCcPids: new Set() };

/**
 * The two row shapes that actually reach this guard in production. Neither carries the other's age
 * column, which is why the ceiling must accept both — a single-form ceiling is silently inert at
 * whichever sites use the other shape.
 */
const SHAPES = [
  {
    name: 'sweep / v_active_sessions shape (heartbeat_age_seconds, no heartbeat_at)',
    age: (sec) => ({ heartbeat_age_seconds: sec }),
    sites: 'stale-session-sweep.cjs :1353, :1447, :2802',
  },
  {
    name: 'hook / claude_sessions shape (heartbeat_at, no heartbeat_age_seconds)',
    age: (sec) => ({ heartbeat_at: new Date(Date.now() - sec * 1000).toISOString() }),
    sites: 'reclaim-sd-after-compaction.cjs :144, session-state-sync.cjs :240',
  },
];

/** A session with every liveness rung blind — the shape the sweep handed the guard on 2026-07-27. */
const blind = (ageFields, extra = {}) => ({
  session_id: 'ceiling-probe-0000',
  terminal_id: null,
  pid: null,
  is_alive: false,
  process_alive_at: null,
  expected_silence_until: null,
  ...ageFields,
  ...extra,
});

describe('FR-1b: the hard-abandonment ceiling', () => {
  it('is DERIVED from the shared silence cap, never a bare literal', () => {
    // Four independent 30-minute constants already exist in this codebase, and silence-cap.cjs
    // exists because two of them drifted apart and mis-reaped a parked worker. If someone lowers the
    // ceiling below an honourable silence window, armed_silence becomes the unbounded path.
    expect(LIVENESS_ABANDON_SEC).toBeGreaterThanOrEqual(SILENCE_HARD_CAP_MS / 1000);
    expect(LIVENESS_ABANDON_SEC).toBeGreaterThanOrEqual(6 * LIVENESS_HEARTBEAT_SEC);
    expect(LIVENESS_ABANDON_SEC).toBe(1800); // unchanged in value today — the derivation buys structure
  });

  describe.each(SHAPES)('$name', ({ age }) => {
    it('[REGRESSION] holds an abstaining claim UNDER the ceiling', () => {
      // Pre-FR-1b this returned hold=false: the guard never read pidUnverifiable, so "I cannot tell"
      // was rendered "not alive" at an irreversible write. This is the falsifiable half.
      const r = shouldHoldClaim(blind(age(344.4), { pidUnverifiable: true }), NO_PIDS);
      expect(r.hold).toBe(true);
      expect(r.reason).toBe('pid_unverifiable_within_ceiling');
    });

    it('[MUTATION] does NOT hold an abstaining claim OVER the ceiling', () => {
      // Cannot fail against old code (old code also returned false). Guards the stranding direction.
      expect(shouldHoldClaim(blind(age(LIVENESS_ABANDON_SEC + 1), { pidUnverifiable: true }), NO_PIDS).hold).toBe(false);
    });

    it('[MUTATION] an armed silence window is NOT ceiling-gated — it expires on its own', () => {
      // Deliberately exempt. armed_silence is an explicit, self-expiring, already-capped declaration;
      // gating it would put two independent bounds in competition over one window and evict a
      // legitimately parked worker at the moment its window expires. Self-expiring evidence is the
      // strongest signal in the predicate, not the weakest.
      const r = shouldHoldClaim(
        blind(age(LIVENESS_ABANDON_SEC + 1), { expected_silence_until: new Date(Date.now() + 10 * 60 * 1000).toISOString() }),
        NO_PIDS,
      );
      expect(r).toEqual({ hold: true, reason: 'armed_silence' });
    });
  });

  it('the boundary is pinned by test, not inferred from the implementation', () => {
    const at = (sec) => shouldHoldClaim(blind({ heartbeat_age_seconds: sec }, { pidUnverifiable: true }), NO_PIDS).hold;
    expect(at(LIVENESS_ABANDON_SEC - 1)).toBe(true);   // 1799 — inside
    expect(at(LIVENESS_ABANDON_SEC)).toBe(false);      // 1800 — the predicate is <, not <=
    expect(at(LIVENESS_ABANDON_SEC + 1)).toBe(false);  // 1801 — outside
  });

  it('an UNKNOWABLE age is neither 0 nor Infinity, and fails toward release', () => {
    // The explicit third answer. 0 would mean "brand new" and hold forever; Infinity would mean
    // "ancient" and evict unconditionally. Both are wrong answers wearing a number.
    expect(heartbeatAgeSec({ session_id: 'no-age' })).toBeNull();
    expect(shouldHoldClaim(blind({}, { pidUnverifiable: true }), NO_PIDS).hold).toBe(false);
  });

  it('heartbeatAgeSec and hasFreshHeartbeat cannot drift apart', () => {
    // They implement the same preference order in two places. This is the guard against exactly the
    // constant/logic drift that produced silence-cap.cjs.
    for (const { age } of SHAPES) {
      for (const sec of [LIVENESS_HEARTBEAT_SEC - 1, LIVENESS_HEARTBEAT_SEC + 1]) {
        const row = blind(age(sec));
        expect(hasFreshHeartbeat(row, Date.now())).toBe(heartbeatAgeSec(row) < LIVENESS_HEARTBEAT_SEC);
      }
    }
  });

  it('the [REGRESSION]/[MUTATION] labels above are MEASURED, not asserted by the author', () => {
    // The pre-FR-1b guard was a pure one-liner over isSessionAlive, so it can be reconstructed
    // exactly and every case classified by construction rather than by my say-so. A test file cannot
    // literally be run against the old module (it imports LIVENESS_ABANDON_SEC, which did not exist),
    // so this is how the falsifiability claim is honoured for this file.
    const { isSessionAlive } = require(path.join(REPO, 'lib/fleet/session-liveness.cjs'));
    const oldGuard = (sn) => { const v = isSessionAlive(sn, NO_PIDS); return v.alive === true; };
    const differs = (sn) => oldGuard(sn) !== shouldHoldClaim(sn, NO_PIDS).hold;

    const over = LIVENESS_ABANDON_SEC + 1;
    for (const { age } of SHAPES) {
      // REGRESSION: behaviour genuinely changed — old said release, new says hold.
      expect(differs(blind(age(344.4), { pidUnverifiable: true })), 'under-ceiling abstention must be a real change').toBe(true);
      // MUTATION: old and new agree; these can never go red on the old code, which is the point.
      expect(differs(blind(age(over), { pidUnverifiable: true })), 'over-ceiling abstention is a mutation detector').toBe(false);
      expect(differs(blind(age(over), { expected_silence_until: new Date(Date.now() + 6e5).toISOString() })), 'armed_silence is exempt and unchanged').toBe(false);
    }
  });

  it('an object with NO pidUnverifiable behaves exactly as before — the two hook sites are untouched', () => {
    // Backward compatibility for the five call sites: absent field => no new hold path.
    expect(shouldHoldClaim(blind({ heartbeat_age_seconds: 344.4 }), NO_PIDS).hold).toBe(false);
    expect(shouldHoldClaim(null).hold).toBe(false);
  });
});
