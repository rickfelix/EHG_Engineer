/**
 * SD-LEO-INFRA-BREAKAGE-DETECTOR-SURFACE-001-C — child-C detector->writer call sites.
 * Pins: the shared fail-soft boundary routes to recordSystemAlert with the FROZEN break_class +
 * legal alert_type (FR-C1/2/3); fail-soft (a writer throw never propagates); row-growth emit no-ops on
 * empty anomalies; break_class round-trips via metadata.break_class; alert_type stays in the legal set.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { emitBreakageAlert } = require('../../lib/breakage/emit-breakage-alert.cjs');
const { emitRowGrowthAnomalyAlert } = require('../../lib/coordinator/row-growth.cjs');
const { buildAlertRow } = require('../../lib/breakage/alert-writer.cjs');
const { toAlertType, BREAK_CLASS_SPEC, LEGAL_SEVERITIES } = require('../../lib/coordinator/break-class-taxonomy.cjs');

const LEGAL_ALERT_TYPES = ['circuit_breaker', 'threshold_breach', 'system_health', 'eva_error'];

// Injected fake supabase mirroring child B's recordSystemAlert IO shape (dedup select + insert),
// no live writes. opts.existing seeds the dedup hit; opts.insertError makes the writer fail-loud.
function fakeSb(opts = {}) {
  const recorded = [];
  return {
    recorded,
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        limit() { return Promise.resolve({ data: opts.existing || [], error: opts.selectError || null }); },
        insert(row) {
          recorded.push(row);
          return { select: () => ({ single: () => Promise.resolve({ data: opts.insertError ? null : { id: 'alert-1' }, error: opts.insertError || null }) }) };
        },
      };
    },
  };
}

describe('emitBreakageAlert — shared fail-soft boundary (FR-C1/2/3)', () => {
  it('routes a schema-drift alert to recordSystemAlert with the frozen break_class + legal alert_type', async () => {
    const sb = fakeSb();
    const r = await emitBreakageAlert('schema-drift', 'schema-reference-lint', { metadata: { mode: 'diff' } }, { supabase: sb });
    expect(r.ok).toBe(true);
    expect(sb.recorded).toHaveLength(1);
    const row = sb.recorded[0];
    expect(row.metadata.break_class).toBe('schema-drift');     // round-trip key
    expect(row.metadata.mode).toBe('diff');                    // forwarded context preserved
    expect(row.alert_type).toBe('system_health');              // frozen, legal
    expect(LEGAL_ALERT_TYPES).toContain(row.alert_type);
    expect(row.source_service).toBe('schema-reference-lint');
  });

  it('FAIL-SOFT: a fail-loud writer error is swallowed (ok:false, never throws)', async () => {
    const sb = fakeSb({ insertError: { message: 'system_alerts insert boom' } });
    const r = await emitBreakageAlert('migration-fail', 'migration-apply-state', {}, { supabase: sb });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/insert/i);
  });

  it('an unknown break class is rejected fail-soft (loud writer reject -> ok:false, no throw)', async () => {
    const sb = fakeSb();
    const r = await emitBreakageAlert('not-a-real-class', 'x', {}, { supabase: sb });
    expect(r.ok).toBe(false);
    expect(sb.recorded).toHaveLength(0); // buildAlertRow rejected before any IO
  });

  it('surfaces dedup (existing OPEN alert -> deduped:true, no new insert)', async () => {
    const sb = fakeSb({ existing: [{ id: 'open-1' }] });
    const r = await emitBreakageAlert('migration-fail', 'migration-apply-state', {}, { supabase: sb });
    expect(r.ok).toBe(true);
    expect(r.deduped).toBe(true);
    expect(sb.recorded).toHaveLength(0);
  });
});

describe('emitRowGrowthAnomalyAlert (FR-C3)', () => {
  const anomalies = [
    { table: 'management_reviews', prev: 1000, curr: 9000, delta: 8000, factor: 9, trigger: 'abs_spike' },
    { table: 'feedback', prev: 500, curr: 900, delta: 400, factor: 1.8, trigger: 'growth_factor' },
  ];
  it('emits ONE row-growth-anomaly alert keyed to the worst offender (frozen taxonomy)', async () => {
    const sb = fakeSb();
    const r = await emitRowGrowthAnomalyAlert(sb, anomalies);
    expect(r.ok).toBe(true);
    const row = sb.recorded[0];
    expect(row.metadata.break_class).toBe('row-growth-anomaly');
    expect(row.alert_type).toBe('threshold_breach');          // frozen, legal
    expect(row.metadata.top_table).toBe('management_reviews'); // [0] is delta-desc worst
    expect(row.severity).toBe('warning');                      // spec defaultSeverity
  });
  it('no-ops (no alert) when there are no anomalies', async () => {
    const sb = fakeSb();
    const r = await emitRowGrowthAnomalyAlert(sb, []);
    expect(r.ok).toBe(false);
    expect(r.skipped).toBe('no-anomalies');
    expect(sb.recorded).toHaveLength(0);
  });
});

describe('frozen taxonomy round-trip (TR-1) — child C never widens alert_type', () => {
  for (const breakClass of ['schema-drift', 'migration-fail', 'row-growth-anomaly']) {
    it(`${breakClass}: alert_type via toAlertType() is in the legal CHECK set + metadata.break_class round-trips`, () => {
      const row = buildAlertRow({ breakClass, sourceService: 'test' });
      expect(row.metadata.break_class).toBe(breakClass);
      expect(row.alert_type).toBe(toAlertType(breakClass));
      expect(LEGAL_ALERT_TYPES).toContain(row.alert_type);
      expect(LEGAL_SEVERITIES).toContain(row.severity);
      expect(row.alert_type).toBe(BREAK_CLASS_SPEC[breakClass].alertType);
    });
  }
});
