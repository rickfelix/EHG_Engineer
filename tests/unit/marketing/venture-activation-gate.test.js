/**
 * SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 FR-2/FR-3 — the demand verdict.
 *
 * Every refusal here is PAIRED with an accept case. A control that only asserts "the verdict is
 * not PASS" passes just as happily against a gate that can never return PASS at all — which would
 * be a gate that is broken in the safe direction, indistinguishable from a working one.
 */
import { describe, it, expect } from 'vitest';
import {
  ACTIVATION_VERDICT,
  RUNG_STATE,
  ACTIVATION_RUNGS,
  DECLARED_UNFILTERED_RUNGS,
  RATIFIED_FLOORS,
  resolveTelemetryRungs,
  resolvePaidRung,
  resolveCpaRung,
  decideActivationVerdict,
  buildPathToPass,
  computeActivationVerdict,
} from '../../../lib/marketing/venture-activation-gate.js';

const VENTURE = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';
const FLOORS = { activated: { minimum: 10, ratified_by: 'TEST-DECISION 2026-08-09' } };

/**
 * Supabase test double. Chainable AND thenable, because the real client is both: some call sites
 * await the builder directly (`.select(...).eq(...)`), computePaidGaugeState awaits `.limit()`,
 * and fetchAllPaginated drives `.range()`. A double that only supports the shape MY code happens
 * to call would make this suite blind to the gauge it delegates into.
 */
function fakeSupabase({ telemetry = null, telemetryError = null, paymentRows = [], paymentError = null, dailyRollupRows = [], dailyRollupError = null }) {
  const payload = { data: paymentRows, error: paymentError, count: (paymentRows || []).length };
  function paymentBuilder() {
    const b = {
      then: (resolve, reject) => Promise.resolve(payload).then(resolve, reject),
      maybeSingle: async () => payload,
      // range() is how fetchAllPaginated walks pages. Returning the full set on the first page
      // and an empty set thereafter terminates its loop.
      range: async (from) => (from === 0 ? payload : { data: [], error: paymentError, count: 0 }),
      limit: async () => payload,
    };
    for (const m of ['select', 'eq', 'not', 'order', 'is', 'gte', 'lte', 'in']) b[m] = () => b;
    return b;
  }
  // SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001 TR-6: resolveCpaRung()'s daily_rollups query is
  // .select().eq().gte() then awaited directly (no .limit()/.maybeSingle()), so this builder only
  // needs to be thenable, matching resolveCpaRung's real call shape.
  function dailyRollupsBuilder() {
    const dailyRollupsPayload = { data: dailyRollupRows, error: dailyRollupError };
    const b = { then: (resolve, reject) => Promise.resolve(dailyRollupsPayload).then(resolve, reject) };
    for (const m of ['select', 'eq', 'gte', 'lte', 'order']) b[m] = () => b;
    return b;
  }
  return {
    from(table) {
      if (table === 'venture_telemetry') {
        const b = { maybeSingle: async () => ({ data: telemetry, error: telemetryError }) };
        for (const m of ['select', 'eq', 'order', 'limit']) b[m] = () => b;
        return b;
      }
      if (table === 'ops_payment_events') return paymentBuilder();
      if (table === 'daily_rollups') return dailyRollupsBuilder();
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const liveTelemetry = (kpis) => ({
  venture_id: VENTURE,
  ingest_status: 'ok',
  pulled_at: new Date().toISOString(),
  kpis,
});

describe('FR-2: rungs resolve MEASURED or UNMEASURABLE, never a third thing', () => {
  it('MEASURES a telemetry rung when the gauge is live and the KPI is a valid integer', () => {
    const rungs = resolveTelemetryRungs({ telemetryRow: liveTelemetry({ visitors: 900, signups: 40, active_users: 12 }) });
    const activated = rungs.find((r) => r.rung === 'activated');
    expect(activated.state).toBe(RUNG_STATE.MEASURED);
    expect(activated.value).toBe(12);
  });

  it('marks every telemetry rung UNMEASURABLE when no venture_telemetry row exists, quoting the gauge reason', () => {
    const rungs = resolveTelemetryRungs({ telemetryRow: null });
    expect(rungs).toHaveLength(3);
    for (const r of rungs) {
      expect(r.state).toBe(RUNG_STATE.UNMEASURABLE);
      expect(r.value).toBeNull();
      expect(r.reason).toMatch(/no_writer_yet/);
      // the gauge's own words, not a substitute message that could quietly go stale
      expect(r.reason).toMatch(/no venture_telemetry row exists/);
    }
  });

  it('marks a rung UNMEASURABLE when the gauge is live but the KPI is missing — never coerces to 0', () => {
    const rungs = resolveTelemetryRungs({ telemetryRow: liveTelemetry({ signups: 5 }) });
    const visitors = rungs.find((r) => r.rung === 'visitors');
    expect(visitors.state).toBe(RUNG_STATE.UNMEASURABLE);
    expect(visitors.value).toBeNull();
  });

  it('marks a rung UNMEASURABLE when the writer is STALE, so a stale number is never presented as current', () => {
    const stale = { ...liveTelemetry({ visitors: 900 }), ingest_status: 'error' };
    const visitors = resolveTelemetryRungs({ telemetryRow: stale }).find((r) => r.rung === 'visitors');
    expect(visitors.state).toBe(RUNG_STATE.UNMEASURABLE);
    expect(visitors.reason).toMatch(/stale/);
  });
});

describe('FR-2: the paid rung distinguishes a MEASURED ZERO from UNMEASURABLE', () => {
  // THE REGRESSION THIS PINS: computePaidGaugeState returns state='live', paid_amount_cents=0 for
  // a venture with no payments, because its readiness probe is FLEET-WIDE. Folding that into
  // MEASURED would report a measured zero for every venture on the strength of one test-mode row.
  it('is UNMEASURABLE when the venture has no resolved livemode payment, even though the fleet gauge reads live', async () => {
    const paid = await resolvePaidRung({ supabase: fakeSupabase({ paymentRows: [] }), ventureId: VENTURE });
    expect(paid.state).toBe(RUNG_STATE.UNMEASURABLE);
    expect(paid.value).toBeNull();
    expect(paid.reason).toMatch(/fleet-wide/);
  });

  it('is MEASURED when the venture itself has a resolved livemode payment — the accept half', async () => {
    // readiness probe (.limit) returns a row for both the per-venture check and the gauge's own
    // fleet check; the gauge then sums the resolved rows it is given.
    const paid = await resolvePaidRung({
      supabase: fakeSupabase({ paymentRows: [{ id: 'pe-1', amount_cents: 2500, currency: 'usd', event_type: 'charge.succeeded', payment_intent_id: 'pi_1', stripe_charge_id: 'ch_1' }] }),
      ventureId: VENTURE,
    });
    expect(paid.state).toBe(RUNG_STATE.MEASURED);
    expect(typeof paid.value).toBe('number');
  });

  it('fails CLOSED on a query error — could not look is not nothing is there', async () => {
    const paid = await resolvePaidRung({
      supabase: fakeSupabase({ paymentRows: null, paymentError: { message: 'connection reset' } }),
      ventureId: VENTURE,
    });
    expect(paid.state).toBe(RUNG_STATE.UNMEASURABLE);
    expect(paid.reason).toMatch(/connection reset/);
  });
});

describe('FR-3: the declared-unfiltered floor and the un-ratified floor both fail closed', () => {
  const measured = (rung, value) => ({ rung, state: RUNG_STATE.MEASURED, value, reason: null, citation: 'test', declared_unfiltered: DECLARED_UNFILTERED_RUNGS.includes(rung) });

  it('does NOT return PASS when only DECLARED_UNFILTERED rungs are measured, however large', () => {
    const { verdict } = decideActivationVerdict(
      [measured('visitors', 1_000_000), measured('signups', 50_000)],
      { visitors: { minimum: 300, ratified_by: 'x' }, signups: { minimum: 30, ratified_by: 'x' } }
    );
    expect(verdict).toBe(ACTIVATION_VERDICT.NO_DATA);
    expect(verdict).not.toBe(ACTIVATION_VERDICT.PASS);
  });

  it('returns PASS when a FILTERED rung meets a ratified floor — proving the gate is not stuck at refuse', () => {
    const { verdict, why } = decideActivationVerdict([measured('activated', 25)], FLOORS);
    expect(verdict).toBe(ACTIVATION_VERDICT.PASS);
    expect(why).toMatch(/ratified floor 10/);
  });

  it('returns BLOCKED — not NO_DATA — when a filtered rung is measured and falls short', () => {
    const { verdict } = decideActivationVerdict([measured('activated', 3)], FLOORS);
    expect(verdict).toBe(ACTIVATION_VERDICT.BLOCKED);
  });

  it('returns NO_DATA when a rung is measured but has NO ratified floor — never a default number', () => {
    const { verdict, why } = decideActivationVerdict([measured('activated', 25)], {});
    expect(verdict).toBe(ACTIVATION_VERDICT.NO_DATA);
    expect(why).toMatch(/no ratified floor/);
  });

  it('ships with an EMPTY ratified-floor table, so no threshold is inherited by accident', () => {
    expect(Object.keys(RATIFIED_FLOORS)).toHaveLength(0);
  });

  it('never encodes the uncodified 300-visitor figure', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../../lib/marketing/venture-activation-gate.js', import.meta.url), 'utf8')
    );
    // it may be DISCUSSED in prose; it must not be a live threshold value.
    expect(src).not.toMatch(/minimum:\s*300/);
  });
});

describe('FR-6: Image Alt Text Generator blocks honestly with a named path', () => {
  it('returns NO_DATA with a path_to_pass that names the missing writer AND the missing floor', async () => {
    const out = await computeActivationVerdict({
      supabase: fakeSupabase({ telemetry: null, paymentRows: [] }),
      ventureId: VENTURE,
    });
    expect(out.verdict).toBe(ACTIVATION_VERDICT.NO_DATA);
    expect(out.path_to_pass).toMatch(/no venture_telemetry row exists/);
    expect(out.path_to_pass).toMatch(/fleet-wide/);
    // SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001 TR-5: scoped to ACTIVATION_RUNGS-named keys only.
    // rungs.cpa uses its own (no_writer_yet/live) vocabulary, not RUNG_STATE, and is asserted
    // separately below -- a blind Object.values(out.rungs) loop would fail once cpa is added.
    for (const rungName of ACTIVATION_RUNGS) {
      const r = out.rungs[rungName];
      expect(r.state).toBe(RUNG_STATE.UNMEASURABLE);
      expect(r.value).toBeNull();
    }
    expect(out.citation.length).toBeGreaterThan(0);
  });

  it('names the MISSING RATIFIED FLOOR even when every rung is unmeasurable', async () => {
    // Found by running FR-6 for real: the path named the absent telemetry writer and said nothing
    // about the absent floor, because the floor branch was only reachable for MEASURED rungs. That
    // is an incomplete path — instrument telemetry, re-run, and the gate is STILL inert. A path to
    // pass must name every blocker, not just the first one you would hit.
    const out = await computeActivationVerdict({
      supabase: fakeSupabase({ telemetry: null, paymentRows: [] }),
      ventureId: VENTURE,
    });
    expect(out.path_to_pass).toMatch(/RATIFIED FLOOR MISSING/);
    expect(out.path_to_pass).toMatch(/no venture_telemetry row exists/);
  });

  it('fails CLOSED to NO_DATA when venture_telemetry cannot be READ at all', async () => {
    const out = await computeActivationVerdict({
      supabase: fakeSupabase({ telemetryError: { message: 'permission denied' }, paymentRows: [] }),
      ventureId: VENTURE,
    });
    expect(out.verdict).toBe(ACTIVATION_VERDICT.NO_DATA);
    expect(out.citation).toMatch(/could not observe/);
  });
});

describe('FR-2/TR-3/TR-4: resolveCpaRung is non-gating and fails closed', () => {
  it('is no_writer_yet when no daily_rollups rows exist for the venture', async () => {
    const cpa = await resolveCpaRung({ supabase: fakeSupabase({ dailyRollupRows: [] }), ventureId: VENTURE });
    expect(cpa.rung).toBe('cpa');
    expect(cpa.state).toBe('no_writer_yet');
    expect(cpa.value_cents_per_conversion).toBeNull();
  });

  it('is live with a real number when daily_rollups rows carry spend and conversions', async () => {
    const cpa = await resolveCpaRung({
      supabase: fakeSupabase({ dailyRollupRows: [{ spend_cents: 10000, conversions: 20 }] }),
      ventureId: VENTURE,
    });
    expect(cpa.state).toBe('live');
    expect(cpa.value_cents_per_conversion).toBe(500);
  });

  it('fails CLOSED (no_writer_yet, never a throw) on a daily_rollups query error', async () => {
    const cpa = await resolveCpaRung({
      supabase: fakeSupabase({ dailyRollupRows: null, dailyRollupError: { message: 'connection reset' } }),
      ventureId: VENTURE,
    });
    expect(cpa.state).toBe('no_writer_yet');
    expect(cpa.reason).toMatch(/connection reset/);
  });

  it('TS-4: does not change decideActivationVerdict/buildPathToPass output for an existing fixture, and rungs.cpa uses its own vocabulary, not RUNG_STATE', async () => {
    const out = await computeActivationVerdict({
      supabase: fakeSupabase({ telemetry: null, paymentRows: [], dailyRollupRows: [{ spend_cents: 10000, conversions: 20 }] }),
      ventureId: VENTURE,
    });
    // Byte-identical to the pre-CPA NO_DATA fixture above: same verdict, same path_to_pass shape.
    expect(out.verdict).toBe(ACTIVATION_VERDICT.NO_DATA);
    expect(out.path_to_pass).toMatch(/no venture_telemetry row exists/);
    expect(out.path_to_pass).toMatch(/fleet-wide/);
    // cpa is present, additive, and does NOT use the RUNG_STATE vocabulary the funnel rungs use.
    expect(out.rungs.cpa).toBeDefined();
    expect(out.rungs.cpa.state).toBe('live');
    expect(out.rungs.cpa.value_cents_per_conversion).toBe(500);
    expect(out.rungs.cpa.state).not.toBe(RUNG_STATE.MEASURED);
    expect(out.rungs.cpa.state).not.toBe(RUNG_STATE.UNMEASURABLE);
  });

  it('TS-5: a daily_rollups query error surfaces as rungs.cpa=no_writer_yet without crashing the rest of the verdict', async () => {
    const out = await computeActivationVerdict({
      supabase: fakeSupabase({ telemetry: null, paymentRows: [], dailyRollupRows: null, dailyRollupError: { message: 'transient DB error' } }),
      ventureId: VENTURE,
    });
    expect(out.verdict).toBe(ACTIVATION_VERDICT.NO_DATA);
    expect(out.rungs.cpa.state).toBe('no_writer_yet');
    expect(out.rungs.cpa.reason).toMatch(/transient DB error/);
  });

  it('is attached even on the venture_telemetry-read-error early-return path', async () => {
    const out = await computeActivationVerdict({
      supabase: fakeSupabase({ telemetryError: { message: 'permission denied' }, paymentRows: [], dailyRollupRows: [{ spend_cents: 5000, conversions: 10 }] }),
      ventureId: VENTURE,
    });
    expect(out.verdict).toBe(ACTIVATION_VERDICT.NO_DATA);
    expect(out.rungs.cpa.state).toBe('live');
    expect(out.rungs.cpa.value_cents_per_conversion).toBe(500);
  });

  it('never adds cpa to ACTIVATION_RUNGS or RATIFIED_FLOORS (TR-3)', () => {
    expect(ACTIVATION_RUNGS).not.toContain('cpa');
    expect(RATIFIED_FLOORS.cpa).toBeUndefined();
  });

  it('TR-3: decideActivationVerdict and buildPathToPass source never reference cpa', async () => {
    // Pins that CPA logic lives entirely in resolveCpaRung/computeActivationVerdict's post-hoc
    // attachment, not inside the gating functions themselves -- a textual guard against a future
    // edit accidentally threading cpa into the judged-rung computation.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../../lib/marketing/venture-activation-gate.js', import.meta.url), 'utf8')
    );
    const decideBody = src.slice(src.indexOf('export function decideActivationVerdict'), src.indexOf('export function buildPathToPass'));
    const buildPathBody = src.slice(src.indexOf('export function buildPathToPass'), src.indexOf('export async function computeActivationVerdict'));
    expect(decideBody).not.toMatch(/cpa/);
    expect(buildPathBody).not.toMatch(/cpa/);
  });
});

describe('collision guards', () => {
  it('does not reuse any export name from lib/governance/demand-gate.js', async () => {
    const mine = await import('../../../lib/marketing/venture-activation-gate.js');
    for (const clashing of ['decideDemand', 'measureDemand', 'resolveDemandFloor', 'mayProduce']) {
      expect(mine).not.toHaveProperty(clashing);
    }
  });

  it('CONSUMES funnel-gauge.mjs rather than re-deriving the ladder', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../../lib/marketing/venture-activation-gate.js', import.meta.url), 'utf8')
    );
    expect(src).toMatch(/from '\.\.\/telemetry\/funnel-gauge\.mjs'/);
    expect(src).toMatch(/computeGaugeState/);
    expect(src).toMatch(/computePaidGaugeState/);
  });
});
