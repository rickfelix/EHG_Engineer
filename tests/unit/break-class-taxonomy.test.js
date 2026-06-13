/**
 * SD-LEO-INFRA-BREAKAGE-DETECTOR-SURFACE-001-A — THE FREEZE.
 * Pins lib/coordinator/break-class-taxonomy.cjs as the X2 catch-rate DENOMINATOR so it cannot be
 * silently redefined post-hoc. Any add/remove/reorder of a break class, an illegal severity, an
 * illegal alert_type, or a version bump turns this test red — that is the point (G14: a falsifiable
 * denominator). Loaded via createRequire, mirroring tests/unit/row-growth-detector.test.js.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const tax = require('../../lib/coordinator/break-class-taxonomy.cjs');

// Hard-coded expected literals — the freeze. Changing the taxonomy REQUIRES changing these.
const EXPECTED_CLASSES = [
  'schema-drift',
  'migration-fail',
  'row-growth-anomaly',
  'RLS-regression',
  'model-availability-cap',
  'gate-pipeline-down',
  'payment-webhook-fail',
];
const LEGAL_ALERT_TYPES = ['circuit_breaker', 'threshold_breach', 'system_health', 'eva_error'];
const LEGAL_SEVERITIES = ['info', 'warning', 'critical'];

describe('break-class taxonomy — frozen X2 denominator (the freeze)', () => {
  it('BREAK_CLASSES deep-equals the exact 7-element array in exact order', () => {
    expect(tax.BREAK_CLASSES).toEqual(EXPECTED_CLASSES);
  });

  it('DENOMINATOR_COUNT === BREAK_CLASSES.length === 7', () => {
    expect(tax.DENOMINATOR_COUNT).toBe(7);
    expect(tax.BREAK_CLASSES.length).toBe(7);
    expect(tax.DENOMINATOR_COUNT).toBe(tax.BREAK_CLASSES.length);
  });

  it('BREAK_CLASSES, BREAK_CLASS_SPEC, and the module export are frozen', () => {
    expect(Object.isFrozen(tax.BREAK_CLASSES)).toBe(true);
    expect(Object.isFrozen(tax.BREAK_CLASS_SPEC)).toBe(true);
    expect(Object.isFrozen(tax)).toBe(true);
    for (const c of EXPECTED_CLASSES) expect(Object.isFrozen(tax.BREAK_CLASS_SPEC[c])).toBe(true);
  });

  it('BREAK_CLASS_SPEC keys exactly match BREAK_CLASSES (no orphans either direction)', () => {
    expect(Object.keys(tax.BREAK_CLASS_SPEC).sort()).toEqual([...EXPECTED_CLASSES].sort());
  });

  it('every defaultSeverity is a legal system_alerts severity {info,warning,critical}', () => {
    for (const c of EXPECTED_CLASSES) {
      expect(LEGAL_SEVERITIES).toContain(tax.BREAK_CLASS_SPEC[c].defaultSeverity);
    }
  });

  it('toAlertType() returns a LEGAL system_alerts.alert_type for every class (no CHECK-violation)', () => {
    for (const c of EXPECTED_CLASSES) {
      expect(LEGAL_ALERT_TYPES).toContain(tax.toAlertType(c));
    }
    // fail-safe: even an unknown id maps to a legal alert_type (never a CHECK violation)
    expect(LEGAL_ALERT_TYPES).toContain(tax.toAlertType('not-a-real-class'));
  });

  it('every spec entry has a non-empty label + a detector mapping', () => {
    for (const c of EXPECTED_CLASSES) {
      expect(typeof tax.BREAK_CLASS_SPEC[c].label).toBe('string');
      expect(tax.BREAK_CLASS_SPEC[c].label.length).toBeGreaterThan(0);
      expect(typeof tax.BREAK_CLASS_SPEC[c].detector).toBe('string');
    }
  });

  it('TAXONOMY_VERSION is pinned (a bump must be a deliberate, reviewed change)', () => {
    expect(tax.TAXONOMY_VERSION).toBe('v1');
  });
});
