/**
 * FR-4 — SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001. The consumer for consecutive_refusals.
 *
 * WHAT WAS ACTUALLY BROKEN, because it is not what it looks like: the counter has existed since
 * QF-20260726-794 and worktree-reaper-tick.cjs RETURNS it (:360). Its only invoker
 * (stale-session-sweep.cjs) gated on `outcome.invoked`, which is FALSE on the refusal path, so
 * every refusal was discarded at the call site. lib/governance/gauge-registry.js records it as
 * undrained and drain-inventory pins it NO_CONSUMER. The data was never missing — nobody read it.
 *
 * WHY THE ALARM IS NOT WIRED TO drain-inventory, which was the obvious move and is wrong:
 * MEASURED — that CLI's FAILING_VERDICTS are all STRUCTURAL (NO_CONSUMER / NO_CLOSING_PATH /
 * UNDECLARED), isFailing(UNAVAILABLE) and isFailing(CLOSING_PATH_UNEXERCISED) are both false, and a
 * well-declared descriptor carrying a LIVE refusal streak classifies as PASS with exit code 0. So
 * "giving the descriptor a consumer + closingPath" would flip this gauge from NO_CONSUMER to PASS
 * *while the reaper is actively refusing* — fixing it into silence. The alarm therefore lives at
 * runtime, on the tick outcome, and the descriptor is deliberately left alone.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const {
  detectReaperStarvation, REAPER_STARVATION_THRESHOLD,
} = require_('../../../lib/coordinator/coordination-events.cjs');

const T = REAPER_STARVATION_THRESHOLD;
const pool = (used, cap = 28) => ({ used, cap, percent: Math.round((used / cap) * 100) });

describe('FR-4: a refusal streak alarms only when it is actually starving something', () => {
  it('MATCHES: streak at threshold with a non-empty pool', () => {
    const r = detectReaperStarvation({ consecutiveRefusals: T, pool: pool(22) });
    expect(r.matched).toBe(true);
    expect(r.evidence.consecutive_refusals).toBe(T);
    expect(r.evidence.pool_used).toBe(22);
  });

  it('TS-5 ANTI-VACUITY — EMPTY POOL DOES NOT ALARM, however long the streak', () => {
    // Without this control an always-alarming implementation would satisfy the positive case and
    // be useless. A stale tree on an idle machine starves nothing; paging for it teaches people to
    // ignore the alarm before the day it is right.
    const r = detectReaperStarvation({ consecutiveRefusals: T * 5, pool: pool(0) });
    expect(r.matched).toBe(false);
    expect(r.reason).toBe('pool_empty');
  });

  it('NEGATIVE ARM, DIFFERENT AXIS — a full pool with a SHORT streak does not alarm', () => {
    // Varies the streak, not the pool, so it cannot pass by inheriting the empty-pool case.
    const r = detectReaperStarvation({ consecutiveRefusals: T - 1, pool: pool(27) });
    expect(r.matched).toBe(false);
    expect(r.reason).toBe('streak_below_threshold');
  });

  it('an UNKNOWN pool DOES alarm, under a distinct kind — corrected after EXEC SECURITY S3', () => {
    // I originally suppressed this, reasoning the census failure "reports itself". That was WRONG
    // in this SD's own signature way: the census failure is a console.log, the SAME unmonitored
    // channel this alarm replaces. And the failure modes are CORRELATED — if git breaks host-wide,
    // the currency check and the census fail together, so refusals pile up forever and the old
    // logic would never alarm at any streak length. Suppressing the alarm exactly when the
    // instrument goes blind is the guard-that-cannot-fire pattern one layer up.
    const r = detectReaperStarvation({ consecutiveRefusals: T * 3, pool: { used: null, cap: 28 } });
    expect(r.matched).toBe(true);
    expect(r.reason).toBe('pool_unknown');
    // A DISTINCT kind: "the pool is starving" and "we cannot read the pool" have different first
    // moves, and they must also de-dupe separately or one silences the other.
    expect(r.alertKind).toBe('reaper_census_blind_alert');
  });

  it('the two alarm kinds are distinct, so neither can suppress the other', () => {
    const starving = detectReaperStarvation({ consecutiveRefusals: T, pool: pool(22) });
    const blind = detectReaperStarvation({ consecutiveRefusals: T, pool: { used: null, cap: 28 } });
    expect(starving.alertKind).toBe('reaper_starvation_alert');
    expect(blind.alertKind).toBe('reaper_census_blind_alert');
    expect(starving.alertKind).not.toBe(blind.alertKind);
  });

  it('BOTH conditions are load-bearing — neither alone is sufficient', () => {
    // The pair, asserted as a pair. Each half alone has already been shown insufficient above;
    // this pins that the conjunction is what decides, so a future edit cannot drop one quietly.
    expect(detectReaperStarvation({ consecutiveRefusals: T, pool: pool(0) }).matched).toBe(false);
    expect(detectReaperStarvation({ consecutiveRefusals: 0, pool: pool(27) }).matched).toBe(false);
    expect(detectReaperStarvation({ consecutiveRefusals: T, pool: pool(27) }).matched).toBe(true);
  });

  it('missing/garbage input degrades to no-alarm rather than throwing', () => {
    expect(detectReaperStarvation().matched).toBe(false);
    expect(detectReaperStarvation({}).matched).toBe(false);
    expect(detectReaperStarvation({ consecutiveRefusals: 'lots', pool: pool(27) }).matched).toBe(false);
  });
});
