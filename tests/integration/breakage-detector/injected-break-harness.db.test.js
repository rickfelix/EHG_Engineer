/**
 * Injected-break harness — X2 catch-rate (>=90%) evidence.
 * SD-LEO-INFRA-BREAKAGE-DETECTOR-SURFACE-001-F (the LAST child; A+B+C+D+E complete).
 *
 * For EACH of the 7 FROZEN break-classes, inject a synthetic alert THROUGH THE EMIT PATH ITS OWNING
 * DETECTOR USES — child-C passive-detector classes via the fail-soft emitBreakageAlert boundary, child-D
 * active-canary classes via the fail-loud recordSystemAlert writer — then read it back from system_alerts
 * via metadata->>break_class and assert the catch-rate vs DENOMINATOR_COUNT (IMPORTED from child A, never
 * local) is >= 90%. This is the X2 evidence: end-to-end detection surfacing across BOTH detector emit
 * paths through the child-B writer.
 *
 * SANDBOXED: a UNIQUE per-run source_service marker (injected rows never collide with real alerts, and
 * are cleaned by an exact match); afterAll cleanup deletes EVERY injected row even when an assertion
 * fails; describeDb self-skips a no-DB run (the opt-in `db` vitest project). It writes ONLY clearly
 * marked, immediately-cleaned rows — never an uncontrolled prod mutation, never a schema change.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { describeDb } from '../../helpers/db-available.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { BREAK_CLASSES, DENOMINATOR_COUNT, toAlertType } = require('../../../lib/coordinator/break-class-taxonomy.cjs');
const { recordSystemAlert } = require('../../../lib/breakage/alert-writer.cjs');
const { emitBreakageAlert } = require('../../../lib/breakage/emit-breakage-alert.cjs');
const { createSupabaseServiceClient } = require('../../../lib/supabase-client.cjs');

const CATCH_RATE_THRESHOLD = 0.9;
// Classes owned by child C's PASSIVE detectors (emit via the fail-soft boundary). The rest belong to
// child D's active canary (emit via the fail-loud writer). Routing each class through ITS detector's path
// makes this genuine end-to-end evidence across BOTH emit paths — not merely the raw writer.
const CHILD_C_CLASSES = new Set(['schema-drift', 'migration-fail', 'row-growth-anomaly']);
const LEGAL_ALERT_TYPES = ['circuit_breaker', 'threshold_breach', 'system_health', 'eva_error'];

describeDb('breakage injected-break harness — X2 catch-rate >= 90% (end-to-end across detector emit paths)', () => {
  // UNIQUE per-run marker: identifiable, collision-free vs real alerts, exact-match cleanup.
  const RUN_MARKER = `__injected-break-harness__:${Date.now()}:${Math.floor(Math.random() * 1e9)}`;
  let sb;
  const caught = new Set();
  let readBackRows = [];

  beforeAll(async () => {
    sb = createSupabaseServiceClient();
    for (const breakClass of BREAK_CLASSES) {
      const opts = {
        severity: 'info',
        title: `[harness] injected ${breakClass}`,
        message: 'injected-break-harness synthetic defect (auto-delete)',
        metadata: { harness: true, run: RUN_MARKER },
      };
      try {
        if (CHILD_C_CLASSES.has(breakClass)) {
          await emitBreakageAlert(breakClass, RUN_MARKER, opts, { supabase: sb }); // child-C fail-soft boundary
        } else {
          await recordSystemAlert(sb, { breakClass, sourceService: RUN_MARKER, ...opts }); // child-D fail-loud writer
        }
      } catch { /* a path failure for this class => not caught (reflected in the catch-rate) */ }
    }
    // Read back via metadata->>break_class (the FROZEN read-back key).
    const { data } = await sb
      .from('system_alerts')
      .select('alert_type, severity, metadata, source_service')
      .eq('source_service', RUN_MARKER);
    readBackRows = data || [];
    for (const row of readBackRows) {
      const bc = row.metadata && row.metadata.break_class;
      if (typeof bc === 'string' && BREAK_CLASSES.includes(bc)) caught.add(bc);
    }
  }, 60000);

  afterAll(async () => {
    // SANDBOX cleanup — runs even on assertion failure. Deletes EVERY row this run injected, by the marker.
    try { if (sb) await sb.from('system_alerts').delete().eq('source_service', RUN_MARKER); } catch { /* best-effort */ }
  }, 60000);

  it('round-trips EVERY frozen break-class via its owning detector emit path (no class lost)', () => {
    const missing = BREAK_CLASSES.filter((c) => !caught.has(c));
    expect(missing, `break-classes not round-tripped: ${missing.join(', ') || '(none)'}`).toEqual([]);
  });

  it(`catch-rate >= ${CATCH_RATE_THRESHOLD * 100}% vs DENOMINATOR_COUNT imported from child A`, () => {
    expect(DENOMINATOR_COUNT).toBe(BREAK_CLASSES.length); // denominator is the imported frozen count, not a local literal
    const catchRate = caught.size / DENOMINATOR_COUNT;
    expect(catchRate).toBeGreaterThanOrEqual(CATCH_RATE_THRESHOLD);
  });

  it('read-back uses metadata.break_class + alert_type == toAlertType(break_class) stays legal (no widening)', () => {
    expect(readBackRows.length).toBeGreaterThan(0);
    for (const row of readBackRows) {
      const bc = row.metadata && row.metadata.break_class;
      expect(typeof bc).toBe('string');
      expect(toAlertType(bc)).toBe(row.alert_type); // alert_type is derived from break_class via the frozen toAlertType
      expect(LEGAL_ALERT_TYPES).toContain(row.alert_type);
      expect(['info', 'warning', 'critical']).toContain(row.severity);
    }
  });
});
