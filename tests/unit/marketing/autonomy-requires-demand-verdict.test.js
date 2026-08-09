/**
 * SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 FR-5 — graduation requires a PASS demand verdict.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE SETUP IS THE LOAD-BEARING PART OF THIS SUITE, not boilerplate.
 *
 * DEFAULT_GRADUATION_STREAK is 5, and venture_channel_publish_ledger has ZERO clean-streak-
 * eligible rows fleet-wide. So "no autonomous write occurred" is TRUE TODAY AGAINST A COMPLETELY
 * ABSENT GATE — a test that simply calls evaluateGraduation and asserts the channel did not go
 * autonomous would pass with this entire feature deleted. It would be measuring the streak, not
 * the gate.
 *
 * Every refusal test below therefore DRIVES cleanStreak TO 5 with real accepted/shipped_clean
 * ledger rows first, so that the ONLY remaining thing preventing graduation is the missing demand
 * verdict. `streakOnlyControl` proves the setup itself works.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from 'vitest';
import { evaluateGraduation } from '../../../lib/marketing/autonomy-gate.js';

const VENTURE = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';
const CHANNEL = 'email';

/** Five consecutive accepted + shipped_clean outcomes — a fully earned streak. */
const EARNED_STREAK = Array.from({ length: 5 }, (_, i) => ({
  decision: 'accepted',
  outcome: 'shipped_clean',
  created_at: new Date(Date.now() - i * 86400000).toISOString(),
}));

/**
 * Captures what was actually WRITTEN. The assertion target is the upsert payload, never a log
 * line: a system that logs a refusal and then writes anyway would satisfy a log-based assertion.
 */
function fakeSupabase({ ledgerRows = [], passRow = null, verdictError = null }) {
  const writes = [];
  return {
    writes,
    from(table) {
      if (table === 'venture_channel_publish_ledger') {
        const b = { then: (res, rej) => Promise.resolve({ data: ledgerRows, error: null }).then(res, rej) };
        for (const m of ['select', 'eq', 'neq', 'order', 'limit']) b[m] = () => b;
        return b;
      }
      if (table === 'venture_demand_verdicts') {
        const b = { maybeSingle: async () => ({ data: passRow, error: verdictError }) };
        for (const m of ['select', 'eq', 'order', 'limit']) b[m] = () => b;
        return b;
      }
      if (table === 'venture_channel_autonomy') {
        return {
          upsert: async (payload) => {
            writes.push(payload);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const PASS_ROW = { verdict: 'PASS', citation: 'activated=25 >= ratified floor 10', computed_at: '2026-08-09T00:00:00Z' };

describe('FR-5: the setup control — prove the streak is genuinely earned', () => {
  // If THIS fails, every refusal test below is measuring the streak instead of the gate.
  it('streakOnlyControl: five accepted+shipped_clean rows DO earn the streak', async () => {
    const sb = fakeSupabase({ ledgerRows: EARNED_STREAK, passRow: PASS_ROW });
    const res = await evaluateGraduation({ supabase: sb, ventureId: VENTURE, channelType: CHANNEL });
    expect(res.cleanStreak).toBe(5);
  });
});

describe('FR-5: refusal, asserted where the clean streak no longer masks it', () => {
  it('REFUSES graduation with a fully earned streak but NO PASS verdict — asserted on the WRITE', async () => {
    const sb = fakeSupabase({ ledgerRows: EARNED_STREAK, passRow: null });
    const res = await evaluateGraduation({ supabase: sb, ventureId: VENTURE, channelType: CHANNEL });

    expect(res.cleanStreak).toBe(5);                       // the streak WAS earned
    expect(res.autonomyState).toBe('propose_and_approve'); // and graduation still did not happen
    expect(res.graduationRefused?.reason).toBe('DEMAND_VALIDATION_REQUIRED');

    // THE ASSERTION THAT MATTERS: no autonomous value was ever written.
    expect(sb.writes).toHaveLength(1);
    expect(sb.writes[0].autonomy_state).toBe('propose_and_approve');
    expect(JSON.stringify(sb.writes)).not.toContain('autonomous');
  });

  it('does NOT accept a NO_DATA or BLOCKED verdict as authorization', async () => {
    for (const verdict of ['NO_DATA', 'BLOCKED']) {
      // the query filters .eq('verdict','PASS'), so a non-PASS verdict yields no row at all
      const sb = fakeSupabase({ ledgerRows: EARNED_STREAK, passRow: null });
      const res = await evaluateGraduation({ supabase: sb, ventureId: VENTURE, channelType: CHANNEL });
      expect(res.autonomyState, `${verdict} must not authorize`).toBe('propose_and_approve');
    }
  });

  it('FAILS CLOSED when the verdict store cannot be read at all', async () => {
    // e.g. the migration is merged but not yet applied — PGRST205, table absent from the cache.
    const sb = fakeSupabase({
      ledgerRows: EARNED_STREAK,
      verdictError: { message: 'Could not find the table public.venture_demand_verdicts' },
    });
    const res = await evaluateGraduation({ supabase: sb, ventureId: VENTURE, channelType: CHANNEL });
    expect(res.autonomyState).toBe('propose_and_approve');
    expect(res.graduationRefused.detail).toMatch(/unreadable/);
  });
});

describe('FR-5: the accept half — the gate is not simply stuck at refuse', () => {
  it('GRADUATES when the streak is earned AND a PASS verdict exists', async () => {
    const sb = fakeSupabase({ ledgerRows: EARNED_STREAK, passRow: PASS_ROW });
    const res = await evaluateGraduation({ supabase: sb, ventureId: VENTURE, channelType: CHANNEL });

    expect(res.autonomyState).toBe('autonomous');
    expect(res.graduationRefused).toBeUndefined();
    expect(sb.writes[0].autonomy_state).toBe('autonomous');
    // provenance records BOTH conditions, so the reason for autonomy is legible after the fact
    expect(sb.writes[0].graduated_by).toContain('demand-validated');
  });

  it('still refuses on an unearned streak even WITH a PASS verdict — demand does not replace quality', async () => {
    const sb = fakeSupabase({ ledgerRows: EARNED_STREAK.slice(0, 2), passRow: PASS_ROW });
    const res = await evaluateGraduation({ supabase: sb, ventureId: VENTURE, channelType: CHANNEL });
    expect(res.cleanStreak).toBe(2);
    expect(res.autonomyState).toBe('propose_and_approve');
    // NOT a demand refusal — this one genuinely is the streak, and the two must stay distinguishable
    expect(res.graduationRefused).toBeUndefined();
  });
});

describe('FR-5: polarity, proven behaviourally rather than by reading the source', () => {
  // A regex over the source pins a STATEMENT FORM; only an executed test pins the DATA FLOW.
  // These two cases distinguish `passRow?.verdict === 'PASS'` from the two cheaper spellings
  // that look equivalent and are not.

  it('a NON-PASS row does not authorize — so the permit is an equality, not a truthy row check', async () => {
    // If the code said `if (passRow)`, this NO_DATA row would graduate the channel. That is not a
    // hypothetical: the row only reaches here if the .eq('verdict','PASS') filter is ever dropped
    // or mis-typed, and the read site must not be the thing that makes that a security bug.
    const sb = fakeSupabase({ ledgerRows: EARNED_STREAK, passRow: { verdict: 'NO_DATA', citation: 'no writer', computed_at: '2026-08-09T00:00:00Z' } });
    const res = await evaluateGraduation({ supabase: sb, ventureId: VENTURE, channelType: CHANNEL });
    expect(res.autonomyState).toBe('propose_and_approve');
    expect(res.graduationRefused?.reason).toBe('DEMAND_VALIDATION_REQUIRED');
  });

  it('absence blocks — the null a maybeSingle() returns is not permission', async () => {
    // If the permit were negatively phrased (`!row?.blocked`), null would be falsy and this would
    // GRADUATE. Fail-open, and invisible.
    const sb = fakeSupabase({ ledgerRows: EARNED_STREAK, passRow: null });
    const res = await evaluateGraduation({ supabase: sb, ventureId: VENTURE, channelType: CHANNEL });
    expect(res.autonomyState).toBe('propose_and_approve');
    expect(sb.writes[0].autonomy_state).not.toBe('autonomous');
  });
});
