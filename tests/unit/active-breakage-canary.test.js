/**
 * SD-LEO-INFRA-BREAKAGE-DETECTOR-SURFACE-001-D — active breakage canary.
 * Pins each pure probe classifier across its states (esp. the no-false-positive cases: RLS inconclusive,
 * gate idle, payment absent, llm NORMAL), the frozen break_class -> legal alert_type round-trip, and a
 * dry-run (no writes) + a fail-loud write path via injected fakes (no live DB).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { run } from '../../scripts/breakage/active-breakage-canary.mjs';
const require = createRequire(import.meta.url);
const {
  classifyRlsProbe, classifyGatePipelineProbe, classifyPaymentWebhookProbe, classifyModelAvailabilityProbe,
} = require('../../lib/breakage/active-canary-probes.cjs');
const { buildAlertRow } = require('../../lib/breakage/alert-writer.cjs');
const { toAlertType } = require('../../lib/coordinator/break-class-taxonomy.cjs');

const LEGAL_ALERT_TYPES = ['circuit_breaker', 'threshold_breach', 'system_health', 'eva_error'];
const NOW = 1_900_000_000_000;
const isoAgo = (ms) => new Date(NOW - ms).toISOString();

// SD-LEO-INFRA-SURVEY-EVERY-PERMISSION-001 — REWRITTEN onto the three-leg method.
// The previous suite PINNED THE DEFECT AS THE CONTRACT: it asserted that a bare 42501 means
// "RLS enforced, no breakage", which is exactly the reading that let a landed-but-unreadable
// write report healthy. Fixing the classifier alone would have turned this file red and invited
// a revert of the fix, so the pin is inverted here in the same change.
describe('classifyRlsProbe (FR-D1) — three-leg method', () => {
  const marker = [{ id: 'r1' }];

  it('REGRESSED when the row is PRESENT on readback after the RETURNING attempt', () => {
    const v = classifyRlsProbe({ withReturning: { data: marker, error: null }, readbackAfterReturning: { rows: marker } });
    expect(v.breakage).toBe(true);
    expect(v.breakClass).toBe('RLS-regression');
    expect(v.detail.inserted_ids).toEqual(['r1']);
  });

  // THE CASE THE OLD CONTRACT COULD NOT SEE. 42501 with the row absent looks like refusal, but the
  // identical row via a bare insert LANDS. The old branch keyed on data.length > 0, which is always
  // false for a bare insert, so the landed row was invisible even in principle.
  it('REGRESSED when 42501 + absent-after-RETURNING but the BARE re-attempt LANDS', () => {
    const v = classifyRlsProbe({
      withReturning: { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } },
      readbackAfterReturning: { rows: [] },
      bareInsert: { error: null },
      readbackAfterBare: { rows: marker },
    });
    expect(v.breakage).toBe(true);
    expect(v.breakClass).toBe('RLS-regression');
    expect(v.detail.landed_via).toBe('bare-insert');
  });

  it('ENFORCED (no breakage, not inconclusive) only when BOTH readbacks are empty — three legs', () => {
    const v = classifyRlsProbe({
      withReturning: { data: null, error: { code: '42501', message: 'permission denied' } },
      readbackAfterReturning: { rows: [] },
      bareInsert: { error: { code: '42501' } },
      readbackAfterBare: { rows: [] },
    });
    expect(v.breakage).toBe(false);
    expect(v.inconclusive).toBeFalsy();
    expect(v.detail.legs).toBe(3);
  });

  // NO FALSE POSITIVE. The alert path is fail-loud (recordSystemAlert + process.exit(1)), and a
  // genuinely-enforced table also returns 42501 — so a bare code must never alert, in either direction.
  it('INCONCLUSIVE (never an alert) when 42501 arrives without leg-3 evidence', () => {
    const one = classifyRlsProbe({ withReturning: { data: null, error: { code: '42501' } } });
    expect(one.breakage).toBe(false);
    expect(one.inconclusive).toBe(true);
    const two = classifyRlsProbe({ withReturning: { data: null, error: { code: '42501' } }, readbackAfterReturning: { rows: [] } });
    expect(two.breakage).toBe(false);
    expect(two.inconclusive).toBe(true);
    expect(two.detail.legs).toBe(2);
  });

  it('INCONCLUSIVE (no false alert) on a constraint/other error or empty', () => {
    expect(classifyRlsProbe({ withReturning: { error: { code: '23505' } } }).inconclusive).toBe(true);
    expect(classifyRlsProbe({ withReturning: { data: [], error: null } }).inconclusive).toBe(true);
    expect(classifyRlsProbe({}).breakage).toBe(false);
  });
});

describe('classifyGatePipelineProbe (FR-D2) — no idle false-positive', () => {
  it('IDLE (no fire) when too few recent attempts', () => {
    const v = classifyGatePipelineProbe([{ created_at: isoAgo(1000), status: 'accepted' }], NOW, { minAttempts: 3 });
    expect(v.breakage).toBe(false);
    expect(v.idle).toBe(true);
  });
  it('HEALTHY (no fire) when recent attempts include acceptances', () => {
    const recent = Array.from({ length: 5 }, (_, i) => ({ created_at: isoAgo(i * 1000), status: i < 2 ? 'accepted' : 'rejected' }));
    expect(classifyGatePipelineProbe(recent, NOW).breakage).toBe(false);
  });
  it('DOWN when recent activity across >=2 distinct SDs has ZERO acceptances (fleet-wide)', () => {
    const recent = Array.from({ length: 4 }, (_, i) => ({ created_at: isoAgo(i * 1000), status: 'rejected', sd_id: `SD-${i % 3}` }));
    const v = classifyGatePipelineProbe(recent, NOW);
    expect(v.breakage).toBe(true);
    expect(v.breakClass).toBe('gate-pipeline-down');
    expect(v.detail.distinctSds).toBeGreaterThanOrEqual(2);
  });
  it('NO fire when zero acceptances come from a SINGLE stuck SD (stuck worker, not down pipeline) — adversarial-review guard', () => {
    const recent = Array.from({ length: 6 }, (_, i) => ({ created_at: isoAgo(i * 1000), status: 'rejected', sd_id: 'SD-STUCK' }));
    const v = classifyGatePipelineProbe(recent, NOW);
    expect(v.breakage).toBe(false); // 6 rejections, ZERO accepted, but only 1 distinct SD -> not a down pipeline
  });
  it('out-of-window rows do not count toward activity (stays idle)', () => {
    const old = Array.from({ length: 5 }, () => ({ created_at: isoAgo(7 * 60 * 60 * 1000), status: 'rejected', sd_id: 'SD-X' }));
    expect(classifyGatePipelineProbe(old, NOW).idle).toBe(true);
  });
});

describe('classifyPaymentWebhookProbe (FR-D3) — substrate-absence-aware', () => {
  it('SKIPS (no alert) when the substrate is absent', () => {
    const v = classifyPaymentWebhookProbe({ tablePresent: false }, NOW);
    expect(v.breakage).toBe(false);
    expect(v.skipped).toBe(true);
  });
  it('flags stale processing when present', () => {
    const v = classifyPaymentWebhookProbe({ tablePresent: true, lastProcessedAtMs: NOW - 60 * 60 * 1000 }, NOW);
    expect(v.breakage).toBe(true);
    expect(v.breakClass).toBe('payment-webhook-fail');
  });
  it('healthy when present + recent + low errors', () => {
    expect(classifyPaymentWebhookProbe({ tablePresent: true, lastProcessedAtMs: NOW - 1000, errorCount: 0 }, NOW).breakage).toBe(false);
  });
});

describe('classifyModelAvailabilityProbe (FR-D4) — reuse detectFromDb rung', () => {
  it('NORMAL -> no breakage', () => {
    expect(classifyModelAvailabilityProbe({ rung: 'NORMAL' }).breakage).toBe(false);
  });
  it('PAUSE_AND_SURFACE -> critical', () => {
    const v = classifyModelAvailabilityProbe({ rung: 'PAUSE_AND_SURFACE', reason: 'x' });
    expect(v.breakage).toBe(true);
    expect(v.severity).toBe('critical');
    expect(v.breakClass).toBe('model-availability-cap');
  });
  it('SINGLE_SESSION / MODEL_FALLBACK -> warning', () => {
    expect(classifyModelAvailabilityProbe({ rung: 'SINGLE_SESSION' }).severity).toBe('warning');
    expect(classifyModelAvailabilityProbe({ rung: 'MODEL_FALLBACK' }).severity).toBe('warning');
  });
  it('unknown/garbage rung -> no breakage (fail-open)', () => {
    expect(classifyModelAvailabilityProbe({ rung: 'WAT' }).breakage).toBe(false);
    expect(classifyModelAvailabilityProbe(null).breakage).toBe(false);
  });
});

describe('frozen taxonomy round-trip (TR-1) — the 4 child-D classes stay in the legal alert_type set', () => {
  for (const breakClass of ['RLS-regression', 'gate-pipeline-down', 'payment-webhook-fail', 'model-availability-cap']) {
    it(`${breakClass}: alert_type legal + break_class round-trips`, () => {
      const row = buildAlertRow({ breakClass, sourceService: 'active-breakage-canary' });
      expect(row.metadata.break_class).toBe(breakClass);
      expect(row.alert_type).toBe(toAlertType(breakClass));
      expect(LEGAL_ALERT_TYPES).toContain(row.alert_type);
    });
  }
});

// --- injected-fake integration: dry-run writes nothing; live path is fail-loud + passes the break_class ---
// Both fakes gained capability for the three-leg method: fakeService needs a marker READBACK path
// (.select().eq()) it never had, and fakeAnon needs a BARE .insert() — previously it only implemented
// .insert().select(), which is precisely the shape that cannot observe a landed row.
function fakeService({ handoffs = [], webhookPresent = false, markerRows = [] } = {}) {
  const state = { rows: markerRows.slice() };
  return {
    __state: state,
    from(table) {
      return {
        select(_cols, _opts) {
          if (table === 'sd_phase_handoffs') { const api = { order: () => api, limit: () => Promise.resolve({ data: handoffs, error: null }) }; return api; }
          if (table === 'webhook_events' || table === 'payment_webhook_events') {
            return { limit: () => Promise.resolve({ data: webhookPresent ? [] : null, error: webhookPresent ? null : { code: 'PGRST205', message: 'Could not find the table' } }) };
          }
          // Marker readback used by probeRls legs 2 and 3, and by the cleanup confirmation.
          return { eq: () => Promise.resolve({ data: state.rows, error: null }), limit: () => Promise.resolve({ data: [], error: null }) };
        },
        delete() { return { eq: () => { state.rows = []; return Promise.resolve({ error: null }); } }; },
      };
    },
  };
}
// rlsRegressed        — the RETURNING attempt itself succeeds (classic leak)
// landsOnBareInsert   — RETURNING 42501s, but the bare re-attempt lands: the case the old fake could not express
// LAZY like the real supabase-js builder: the request fires when the builder is AWAITED, not when
// insert() is called. An eager fake set its landed-row side effect during .insert(), so the
// leg-2 readback saw the bare-insert row and the verdict reported landed_via 'with-returning' —
// a fake-fidelity bug that produced a plausible wrong answer. The builder is a THENABLE.
function fakeAnon({ rlsRegressed = false, landsOnBareInsert = false, service = null } = {}) {
  return {
    from: () => ({
      insert: () => ({
        // awaited directly (no .select()) => the BARE insert path
        then(resolve) {
          if (landsOnBareInsert && service) service.__state.rows = [{ id: 'leak-bare' }];
          return Promise.resolve(landsOnBareInsert ? { error: null } : { error: { code: '42501' } }).then(resolve);
        },
        // .select() => the RETURNING path
        select() {
          if (rlsRegressed && service) service.__state.rows = [{ id: 'leak-1' }];
          return Promise.resolve(rlsRegressed
            ? { data: [{ id: 'leak-1' }], error: null }
            : { data: null, error: { code: '42501' } });
        },
      }),
    }),
  };
}

// The CALLER's leg-3 gathering, which the classifier unit tests cannot cover: probeRls must, on an
// apparent refusal, RE-ATTEMPT the identical write WITHOUT .select() and read back again. Without
// this the open door stays invisible no matter how correct the classifier is.
describe('probeRls gathers leg 3 — the bare re-attempt (SD-LEO-INFRA-SURVEY-EVERY-PERMISSION-001)', () => {
  it('REGRESSES when RETURNING 42501s with the row absent but the BARE insert lands', async () => {
    const svc = fakeService({ handoffs: [] });
    const summary = await run({
      service: svc,
      anon: fakeAnon({ rlsRegressed: false, landsOnBareInsert: true, service: svc }),
      detectFromDb: async () => ({ rung: 'NORMAL', reason: 'healthy' }),
      record: async () => ({ id: 'x', deduped: false }),
      dryRun: true,
      nowMs: NOW,
    });
    const rls = (summary || []).find((v) => v && (v.breakClass === 'RLS-regression'));
    expect(rls, 'leg 3 never ran — an open door read as enforced').toBeTruthy();
    expect(rls.detail.landed_via).toBe('bare-insert');
  });

  it('stays SILENT (no breakage) when both legs are genuinely empty — no false positive on an enforced table', async () => {
    const svc = fakeService({ handoffs: [] });
    const summary = await run({
      service: svc,
      anon: fakeAnon({ rlsRegressed: false, landsOnBareInsert: false, service: svc }),
      detectFromDb: async () => ({ rung: 'NORMAL', reason: 'healthy' }),
      record: async () => ({ id: 'x', deduped: false }),
      dryRun: true,
      nowMs: NOW,
    });
    const rls = (summary || []).find((v) => v && v.breakClass === 'RLS-regression');
    expect(rls, 'alerted on a genuinely enforced table — the fail-loud false positive').toBeFalsy();
  });
});

describe('run() — dry-run performs NO writes; live path is fail-loud (TS-4 / FR-D5)', () => {
  it('dry-run classifies breakages but never calls recordSystemAlert', async () => {
    const calls = [];
    const summary = await run({
      service: fakeService({ handoffs: [{ created_at: isoAgo(1000), status: 'rejected', sd_id: 'SD-A' }, { created_at: isoAgo(2000), status: 'rejected', sd_id: 'SD-B' }, { created_at: isoAgo(3000), status: 'rejected', sd_id: 'SD-C' }] }),
      anon: fakeAnon({ rlsRegressed: true }),
      detectFromDb: async () => ({ rung: 'PAUSE_AND_SURFACE', reason: 'seeded' }),
      record: async (...a) => { calls.push(a); return { id: 'x', deduped: false }; },
      dryRun: true,
      nowMs: NOW,
    });
    expect(calls).toHaveLength(0); // NO writes in dry-run
    const fired = summary.filter((s) => s.breakage).map((s) => s.breakClass).sort();
    expect(fired).toEqual(['RLS-regression', 'gate-pipeline-down', 'model-availability-cap'].sort()); // payment absent -> skipped
  });

  it('non-dry-run writes via recordSystemAlert with the correct break_class (fail-loud path)', async () => {
    const calls = [];
    await run({
      service: fakeService({ handoffs: [], webhookPresent: false }),
      anon: fakeAnon({ rlsRegressed: false }),                 // RLS enforced -> no fire
      detectFromDb: async () => ({ rung: 'MODEL_FALLBACK', reason: 'seeded' }), // only model fires
      record: async (sb, opts) => { calls.push(opts); return { id: 'a1', deduped: false }; },
      dryRun: false,
      nowMs: NOW,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].breakClass).toBe('model-availability-cap');
    expect(calls[0].severity).toBe('warning');
    expect(calls[0].sourceService).toBe('active-breakage-canary/model-availability-cap');
  });
});
