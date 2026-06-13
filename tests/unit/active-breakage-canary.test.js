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

describe('classifyRlsProbe (FR-D1)', () => {
  it('REGRESSED when an anon INSERT returns rows (RLS not enforced)', () => {
    const v = classifyRlsProbe({ data: [{ id: 'r1' }], error: null });
    expect(v.breakage).toBe(true);
    expect(v.breakClass).toBe('RLS-regression');
    expect(v.detail.inserted_ids).toEqual(['r1']);
  });
  it('ENFORCED (no breakage) when anon write is denied 42501', () => {
    const v = classifyRlsProbe({ data: null, error: { code: '42501', message: 'permission denied' } });
    expect(v.breakage).toBe(false);
    expect(v.inconclusive).toBeFalsy();
  });
  it('INCONCLUSIVE (no false alert) on a constraint/other error or empty', () => {
    expect(classifyRlsProbe({ error: { code: '23505' } }).inconclusive).toBe(true);
    expect(classifyRlsProbe({ data: [], error: null }).inconclusive).toBe(true);
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
  it('DOWN when recent activity has ZERO acceptances', () => {
    const recent = Array.from({ length: 4 }, (_, i) => ({ created_at: isoAgo(i * 1000), status: 'rejected' }));
    const v = classifyGatePipelineProbe(recent, NOW);
    expect(v.breakage).toBe(true);
    expect(v.breakClass).toBe('gate-pipeline-down');
  });
  it('out-of-window rows do not count toward activity (stays idle)', () => {
    const old = Array.from({ length: 5 }, () => ({ created_at: isoAgo(7 * 60 * 60 * 1000), status: 'rejected' }));
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
function fakeService({ handoffs = [], webhookPresent = false } = {}) {
  return {
    from(table) {
      return {
        select(_cols, _opts) {
          if (table === 'sd_phase_handoffs') { const api = { order: () => api, limit: () => Promise.resolve({ data: handoffs, error: null }) }; return api; }
          if (table === 'webhook_events' || table === 'payment_webhook_events') {
            return { limit: () => Promise.resolve({ data: webhookPresent ? [] : null, error: webhookPresent ? null : { code: 'PGRST205', message: 'Could not find the table' } }) };
          }
          return { limit: () => Promise.resolve({ data: [], error: null }) };
        },
        delete() { return { eq: () => Promise.resolve({ error: null }) }; },
      };
    },
  };
}
function fakeAnon({ rlsRegressed = false } = {}) {
  return { from: () => ({ insert: () => ({ select: () => Promise.resolve(rlsRegressed ? { data: [{ id: 'leak-1' }], error: null } : { data: null, error: { code: '42501' } }) }) }) };
}

describe('run() — dry-run performs NO writes; live path is fail-loud (TS-4 / FR-D5)', () => {
  it('dry-run classifies breakages but never calls recordSystemAlert', async () => {
    const calls = [];
    const summary = await run({
      service: fakeService({ handoffs: [{ created_at: isoAgo(1000), status: 'rejected' }, { created_at: isoAgo(2000), status: 'rejected' }, { created_at: isoAgo(3000), status: 'rejected' }] }),
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
