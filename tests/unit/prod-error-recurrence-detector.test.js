/**
 * SD-LEO-INFRA-PROD-ERROR-SWEEP-LOOP-001
 * Pure tests for the production-error recurrence detector: it flags only chronic,
 * NOT-yet-covered (break_class, source) classes within the FROZEN break-class taxonomy
 * for DRAFT corrective sourcing — excluding covered classes (status-aware via stripDeadLinks),
 * respecting the anti-spam caps, and exposing NO resolve/fix capability (the no-auto-fix boundary).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import {
  detectRecurringClasses,
  applyCaps,
  coveredClassKeys,
  handledClassKeys,
  classKey,
  alertBreakClass,
  alertSource,
  DEFAULT_THRESHOLD,
  DEFAULT_PER_RUN_CAP,
  DEFAULT_PER_DAY_CAP,
} from '../../scripts/lib/prod-error-recurrence-detector.mjs';
import { isCovered } from '../../scripts/lib/ci-recurrence-detector.mjs';

const require = createRequire(import.meta.url);
const { BREAK_CLASSES } = require('../../lib/coordinator/break-class-taxonomy.cjs');

const alert = (over = {}) => ({
  id: over.id || 'al-' + Math.round((over._n || 1) * 1000),
  severity: over.severity || 'warning',
  title: over.title || 'Alert title',
  message: over.message || 'Alert message',
  source_service: 'source_type' in over ? over.source_type : 'svc-a',
  resolved_at: null,
  created_at: over.created_at || '2026-06-19T00:00:00Z',
  metadata: { break_class: 'break_class' in over ? over.break_class : 'schema-drift' },
});

describe('prod-error-recurrence-detector — recurrence detection (FR-1)', () => {
  it('flags a (break_class, source) class only when occurrences meet the threshold', () => {
    const alerts = [
      alert({ id: 'a1' }), alert({ id: 'a2' }), alert({ id: 'a3' }), // 3x schema-drift::svc-a
    ];
    const out = detectRecurringClasses(alerts, { threshold: 3, legalClasses: BREAK_CLASSES });
    expect(out).toHaveLength(1);
    expect(out[0].classKey).toBe('schema-drift::svc-a');
    expect(out[0].occurrenceTotal).toBe(3);
    expect(out[0].breakClass).toBe('schema-drift');
    expect(out[0].source).toBe('svc-a');
  });

  it('does not flag a class below the threshold', () => {
    const alerts = [alert({ id: 'a1' }), alert({ id: 'a2' })]; // only 2x
    expect(detectRecurringClasses(alerts, { threshold: 3, legalClasses: BREAK_CLASSES })).toHaveLength(0);
  });

  it('groups by the (break_class, source) tuple — same class, different source = separate classes', () => {
    const alerts = [
      alert({ id: 'a1', source_type: 'svc-a' }), alert({ id: 'a2', source_type: 'svc-a' }),
      alert({ id: 'a3', source_type: 'svc-b' }), alert({ id: 'a4', source_type: 'svc-b' }),
    ];
    // threshold 2 -> two distinct classes
    const out = detectRecurringClasses(alerts, { threshold: 2, legalClasses: BREAK_CLASSES });
    expect(out.map((c) => c.classKey).sort()).toEqual(['schema-drift::svc-a', 'schema-drift::svc-b']);
  });

  it('ignores alerts outside the frozen break-class taxonomy', () => {
    const alerts = [
      alert({ id: 'a1', break_class: 'not-a-real-class' }),
      alert({ id: 'a2', break_class: 'not-a-real-class' }),
      alert({ id: 'a3', break_class: 'not-a-real-class' }),
    ];
    expect(detectRecurringClasses(alerts, { threshold: 3, legalClasses: BREAK_CLASSES })).toHaveLength(0);
  });

  it('ignores alerts with no break_class encoding', () => {
    const noClass = alert({ id: 'a1' }); noClass.metadata = {};
    expect(detectRecurringClasses([noClass, noClass, noClass], { threshold: 3, legalClasses: BREAK_CLASSES })).toHaveLength(0);
  });

  it('sorts deterministically: most-recurring class first', () => {
    const alerts = [
      alert({ id: 'a1', break_class: 'migration-fail', source_type: 'm' }),
      alert({ id: 'a2', break_class: 'migration-fail', source_type: 'm' }),
      alert({ id: 'a3', break_class: 'schema-drift', source_type: 's' }),
      alert({ id: 'a4', break_class: 'schema-drift', source_type: 's' }),
      alert({ id: 'a5', break_class: 'schema-drift', source_type: 's' }),
    ];
    const out = detectRecurringClasses(alerts, { threshold: 2, legalClasses: BREAK_CLASSES });
    expect(out[0].classKey).toBe('schema-drift::s'); // 3 beats 2
    expect(out[0].occurrenceTotal).toBe(3);
  });

  it('picks the oldest alert as the representative', () => {
    const alerts = [
      alert({ id: 'newer', created_at: '2026-06-19T05:00:00Z' }),
      alert({ id: 'older', created_at: '2026-06-19T01:00:00Z' }),
      alert({ id: 'mid', created_at: '2026-06-19T03:00:00Z' }),
    ];
    const out = detectRecurringClasses(alerts, { threshold: 3, legalClasses: BREAK_CLASSES });
    expect(out[0].representativeId).toBe('older');
  });
});

describe('prod-error-recurrence-detector — status-aware idempotency (FR-3)', () => {
  const chronic = () => [alert({ id: 'a1' }), alert({ id: 'a2' }), alert({ id: 'a3' })];

  it('excludes a class covered by an open, non-terminal corrective SD', () => {
    const bridge = [{ id: 'b1', status: 'in_progress', strategic_directive_id: 'SD-X', resolution_sd_id: null, metadata: { break_class: 'schema-drift', alert_source: 'svc-a' } }];
    const coveredKeys = coveredClassKeys(bridge, isCovered);
    expect([...coveredKeys]).toContain('schema-drift::svc-a');
    const out = detectRecurringClasses(chronic(), { threshold: 3, legalClasses: BREAK_CLASSES, coveredKeys });
    expect(out).toHaveLength(0);
  });

  it('re-sources a class whose bridge link was stripped (terminal SD) — stripDeadLinks analog', () => {
    // Caller stripped the dead link in place (terminal SD) => bridge row now has null links.
    const strippedBridge = [{ id: 'b1', status: 'in_progress', strategic_directive_id: null, resolution_sd_id: null, metadata: { break_class: 'schema-drift', alert_source: 'svc-a' } }];
    const coveredKeys = coveredClassKeys(strippedBridge, isCovered);
    expect(coveredKeys.size).toBe(0); // not covered: link was stripped
    const out = detectRecurringClasses(chronic(), { threshold: 3, legalClasses: BREAK_CLASSES, coveredKeys });
    expect(out).toHaveLength(1); // treated as uncovered again
  });

  it('coveredClassKeys ignores bridge rows with no break_class', () => {
    const bridge = [{ id: 'b1', status: 'new', strategic_directive_id: 'SD-X', resolution_sd_id: null, metadata: {} }];
    expect(coveredClassKeys(bridge, isCovered).size).toBe(0);
  });

  it('handledClassKeys also skips a surfaced (status=new, unlinked) guardrail-blocked bridge row', () => {
    // A guardrail-blocked class: bridge row exists, never linked, status stayed new.
    const bridge = [{ id: 'b1', status: 'new', strategic_directive_id: null, resolution_sd_id: null, metadata: { break_class: 'RLS-regression', alert_source: 'svc-a' } }];
    // coveredClassKeys (linked-only) would NOT count it -> would spam a duplicate each run.
    expect(coveredClassKeys(bridge, isCovered).size).toBe(0);
    // handledClassKeys treats it as already surfaced -> the class is skipped (no inbox spam).
    const handled = handledClassKeys(bridge, isCovered);
    expect([...handled]).toContain('RLS-regression::svc-a');
    const alerts = [alert({ id: 'a1', break_class: 'RLS-regression' }), alert({ id: 'a2', break_class: 'RLS-regression' }), alert({ id: 'a3', break_class: 'RLS-regression' })];
    expect(detectRecurringClasses(alerts, { threshold: 3, legalClasses: BREAK_CLASSES, coveredKeys: handled })).toHaveLength(0);
  });

  it('handledClassKeys keeps a dead-linked (status=in_progress, stripped) bridge row re-sourceable', () => {
    // WAS linked, SD went terminal -> caller stripped the link; status stayed in_progress.
    const bridge = [{ id: 'b1', status: 'in_progress', strategic_directive_id: null, resolution_sd_id: null, metadata: { break_class: 'schema-drift', alert_source: 'svc-a' } }];
    expect(handledClassKeys(bridge, isCovered).size).toBe(0); // not handled -> re-sourceable
  });

  it('handledClassKeys counts a still-linked (non-terminal) bridge row as handled', () => {
    const bridge = [{ id: 'b1', status: 'in_progress', strategic_directive_id: 'SD-X', resolution_sd_id: null, metadata: { break_class: 'schema-drift', alert_source: 'svc-a' } }];
    expect([...handledClassKeys(bridge, isCovered)]).toContain('schema-drift::svc-a');
  });
});

describe('prod-error-recurrence-detector — anti-spam caps (FR-4)', () => {
  it('caps per-run', () => {
    const cands = Array.from({ length: 5 }, (_, i) => ({ classKey: 'k' + i }));
    expect(applyCaps(cands, { perRunCap: 2, sourcedToday: 0, perDayCap: 10 })).toHaveLength(2);
  });
  it('respects the remaining per-day budget', () => {
    const cands = Array.from({ length: 5 }, (_, i) => ({ classKey: 'k' + i }));
    expect(applyCaps(cands, { perRunCap: 3, sourcedToday: 9, perDayCap: 10 })).toHaveLength(1);
  });
  it('returns nothing when the per-day budget is exhausted', () => {
    const cands = [{ classKey: 'k0' }];
    expect(applyCaps(cands, { perRunCap: 3, sourcedToday: 10, perDayCap: 10 })).toHaveLength(0);
  });
});

describe('prod-error-recurrence-detector — no-auto-fix / no-auto-resolve boundary (FR-2)', () => {
  it('exposes ONLY pure read/classify functions — no resolve/fix/update capability', async () => {
    const mod = await import('../../scripts/lib/prod-error-recurrence-detector.mjs');
    const fnNames = Object.keys(mod).filter((k) => typeof mod[k] === 'function');
    // every exported function name is a read/classify verb — none mutate, resolve, or fix.
    const forbidden = /resolve|fix|update|delete|insert|write|merge|close/i;
    for (const name of fnNames) expect(name).not.toMatch(forbidden);
    // the canonical detect/cap/cover surface is present.
    expect(fnNames.sort()).toEqual(
      ['alertBreakClass', 'alertSource', 'applyCaps', 'classKey', 'coveredClassKeys', 'detectRecurringClasses', 'handledClassKeys'].sort()
    );
  });

  it('detection is pure: it never mutates the input alerts', () => {
    const alerts = [alert({ id: 'a1' }), alert({ id: 'a2' }), alert({ id: 'a3' })];
    const snapshot = JSON.parse(JSON.stringify(alerts));
    detectRecurringClasses(alerts, { threshold: 3, legalClasses: BREAK_CLASSES });
    expect(alerts).toEqual(snapshot);
  });

  it('helpers read the canonical encoding (break_class in metadata, source_service column)', () => {
    expect(classKey('schema-drift', 'svc-a')).toBe('schema-drift::svc-a');
    expect(alertBreakClass(alert({ break_class: 'RLS-regression' }))).toBe('RLS-regression');
    expect(alertSource(alert({ source_type: 'svc-z' }))).toBe('svc-z');
  });

  it('exposes sane defaults', () => {
    expect(DEFAULT_THRESHOLD).toBe(3);
    expect(DEFAULT_PER_RUN_CAP).toBe(3);
    expect(DEFAULT_PER_DAY_CAP).toBe(10);
  });
});
