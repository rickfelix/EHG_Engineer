/**
 * Tests for SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-E-001.
 *
 * Covers:
 *   - FR-1: FINDING_CATEGORIES enum extension (length + new values)
 *   - FR-2: TIER_MAP rows for the two new categories
 *   - FR-3: VENDOR_SIGNATURES registry shape invariant
 *   - FR-4: detectFeedbackWidgetPresent / detectErrorCaptureWired positive,
 *           negative, and absence-severity cases
 *   - FR-5: existing finding-shape.test.js + sd-generator.test.js are unaffected
 *           (verified by running them — not asserted here)
 */

import { describe, test, expect } from 'vitest';
import {
  FINDING_CATEGORIES,
  validateFindingShape,
} from '../../../../lib/eva/quality-findings/finding-shape.js';
import {
  resolveTier,
  TIER_MAP,
} from '../../../../lib/eva/quality-findings/sd-generator.js';
import {
  VENDOR_SIGNATURES,
  detectFeedbackWidgetPresent,
  detectErrorCaptureWired,
} from '../../../../lib/eva/quality-findings/vision-detectors.js';

// ─────────────────────────────────────────────────────────────────────────
// FR-1: Enum extension
// ─────────────────────────────────────────────────────────────────────────

describe('FR-E FR-1 — FINDING_CATEGORIES enum extension', () => {
  test('FINDING_CATEGORIES has 12 entries (was 10 prior to FR-E)', () => {
    expect(FINDING_CATEGORIES.length).toBe(12);
  });

  test('FINDING_CATEGORIES includes feedback_widget_present and error_capture_wired', () => {
    expect(FINDING_CATEGORIES).toContain('feedback_widget_present');
    expect(FINDING_CATEGORIES).toContain('error_capture_wired');
  });

  test('all 10 prior categories remain present (additive change)', () => {
    const prior = ['npm_audit', 'secrets', 'lint', 'test_suite', 'unit_test', 'e2e_test', 'uat_test', 'bug_report', 'uat_signoff', 'capability'];
    for (const cat of prior) expect(FINDING_CATEGORIES).toContain(cat);
  });

  test('validateFindingShape accepts the two new categories', () => {
    const base = {
      venture_id: '00000000-0000-0000-0000-000000000001',
      stage_number: 20,
      severity: 'critical',
      finding_hash: '0123456789abcdef',
      evidence_pointer: {},
    };
    const r1 = validateFindingShape({ ...base, finding_category: 'feedback_widget_present' });
    const r2 = validateFindingShape({ ...base, finding_category: 'error_capture_wired' });
    expect(r1.valid).toBe(true);
    expect(r2.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// FR-2: Tier mapping
// ─────────────────────────────────────────────────────────────────────────

describe('FR-E FR-2 — TIER_MAP for the two new categories', () => {
  test("feedback_widget_present routes critical → Tier 3 and medium → Tier 2", () => {
    expect(resolveTier('feedback_widget_present', 'critical')).toBe(3);
    expect(resolveTier('feedback_widget_present', 'medium')).toBe(2);
  });

  test("error_capture_wired routes critical → Tier 3 and medium → Tier 2", () => {
    expect(resolveTier('error_capture_wired', 'critical')).toBe(3);
    expect(resolveTier('error_capture_wired', 'medium')).toBe(2);
  });

  test('TIER_MAP rows for both new categories follow the chairman-visible policy', () => {
    expect(TIER_MAP.feedback_widget_present).toEqual({ critical: 3, high: 3, medium: 2, low: 1 });
    expect(TIER_MAP.error_capture_wired).toEqual({ critical: 3, high: 3, medium: 2, low: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// FR-3: Registry shape invariants
// ─────────────────────────────────────────────────────────────────────────

describe('FR-E FR-3 — VENDOR_SIGNATURES registry shape invariants', () => {
  test('VENDOR_SIGNATURES is a non-empty frozen array', () => {
    expect(Array.isArray(VENDOR_SIGNATURES)).toBe(true);
    expect(VENDOR_SIGNATURES.length).toBeGreaterThan(0);
    expect(Object.isFrozen(VENDOR_SIGNATURES)).toBe(true);
  });

  test('every entry has all six required fields non-null', () => {
    for (const entry of VENDOR_SIGNATURES) {
      expect(entry.id).toBeTruthy();
      expect(entry.vendor).toBeTruthy();
      expect(entry.category).toBeTruthy();
      expect(entry.detection_kind).toBeTruthy();
      expect(entry.signal).toBeDefined();
      expect(entry.evidence_hint).toBeTruthy();
    }
  });

  test('every entry.category is in FINDING_CATEGORIES', () => {
    for (const entry of VENDOR_SIGNATURES) {
      expect(FINDING_CATEGORIES).toContain(entry.category);
    }
  });

  test('every entry.detection_kind is one of {package, env, file_pattern}', () => {
    const allowed = new Set(['package', 'env', 'file_pattern']);
    for (const entry of VENDOR_SIGNATURES) {
      expect(allowed.has(entry.detection_kind)).toBe(true);
    }
  });

  test('coverage: ≥4 vendors per category', () => {
    const fb = VENDOR_SIGNATURES.filter((s) => s.category === 'feedback_widget_present');
    const ec = VENDOR_SIGNATURES.filter((s) => s.category === 'error_capture_wired');
    const fbVendors = new Set(fb.map((s) => s.vendor));
    const ecVendors = new Set(ec.map((s) => s.vendor));
    expect(fbVendors.size).toBeGreaterThanOrEqual(4);
    expect(ecVendors.size).toBeGreaterThanOrEqual(4);
  });

  test('all entry IDs are unique', () => {
    const ids = VENDOR_SIGNATURES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// FR-4: Detector functions
// ─────────────────────────────────────────────────────────────────────────

describe('FR-E FR-4 — detectFeedbackWidgetPresent', () => {
  test('positive: LogRocket package match', () => {
    const ctx = { packageJson: { dependencies: { logrocket: '^1.0.0' } } };
    const r = detectFeedbackWidgetPresent(ctx);
    expect(r.found).toBe(true);
    expect(r.vendor).toBe('LogRocket');
    expect(r.evidence_pointer.kind).toBe('package');
  });

  test('positive: Sentry feedback widget match in devDependencies', () => {
    const ctx = { packageJson: { devDependencies: { '@sentry/feedback': '^7.0.0' } } };
    const r = detectFeedbackWidgetPresent(ctx);
    expect(r.found).toBe(true);
    expect(r.vendor).toBe('Sentry');
  });

  test('positive: file_pattern signal — LogRocket.init( in source', () => {
    const ctx = {
      packageJson: {},
      fileSamples: [{ path: 'src/index.js', content: 'LogRocket.init("appId/proj");' }],
    };
    const r = detectFeedbackWidgetPresent(ctx);
    expect(r.found).toBe(true);
  });

  test('negative absence: empty ctx → critical-severity FAIL', () => {
    const r = detectFeedbackWidgetPresent({});
    expect(r.found).toBe(false);
    expect(r.severity).toBe('critical');
    expect(r.evidence_pointer.reason).toBe('no_vendor_signature_matched');
    expect(r.evidence_pointer.categories_checked).toContain('feedback_widget_present');
  });

  test('negative: unrelated package does not trigger', () => {
    const ctx = { packageJson: { dependencies: { lodash: '^4.0.0', react: '^18.0.0' } } };
    const r = detectFeedbackWidgetPresent(ctx);
    expect(r.found).toBe(false);
    expect(r.severity).toBe('critical');
  });
});

describe('FR-E FR-4 — detectErrorCaptureWired', () => {
  test('positive: @sentry/react package match', () => {
    const ctx = { packageJson: { dependencies: { '@sentry/react': '^7.0.0' } } };
    const r = detectErrorCaptureWired(ctx);
    expect(r.found).toBe(true);
    expect(r.vendor).toBe('Sentry');
    expect(r.signature_id).toBe('sentry-react-pkg');
  });

  test('positive: Sentry.init file_pattern match', () => {
    const ctx = {
      packageJson: {},
      fileSamples: [{ path: 'src/sentry.js', content: 'Sentry.init({ dsn: "https://example" });' }],
    };
    const r = detectErrorCaptureWired(ctx);
    expect(r.found).toBe(true);
    expect(r.vendor).toBe('Sentry');
  });

  test('positive: Datadog browser RUM package match', () => {
    const ctx = { packageJson: { dependencies: { '@datadog/browser-rum': '^4.0.0' } } };
    const r = detectErrorCaptureWired(ctx);
    expect(r.found).toBe(true);
    expect(r.vendor).toBe('Datadog');
  });

  test('negative absence: empty ctx → critical-severity FAIL', () => {
    const r = detectErrorCaptureWired({});
    expect(r.found).toBe(false);
    expect(r.severity).toBe('critical');
    expect(r.evidence_pointer.reason).toBe('no_vendor_signature_matched');
    expect(r.evidence_pointer.categories_checked).toContain('error_capture_wired');
  });

  test('negative: unrelated package does not trigger', () => {
    const ctx = { packageJson: { dependencies: { axios: '^1.0.0' } } };
    const r = detectErrorCaptureWired(ctx);
    expect(r.found).toBe(false);
  });
});

describe('FR-E FR-4 — purity', () => {
  test('detectors do not mutate ctx', () => {
    const ctx = { packageJson: { dependencies: { logrocket: '^1.0.0' } }, fileSamples: [] };
    const before = JSON.stringify(ctx);
    detectFeedbackWidgetPresent(ctx);
    detectErrorCaptureWired(ctx);
    expect(JSON.stringify(ctx)).toBe(before);
  });
});
