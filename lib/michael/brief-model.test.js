// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-E FR-1 / TS-1.
import { describe, it, expect } from 'vitest';
import { buildBriefData, validateBriefData, templateLede, computeDayClass, SCHEMA_VERSION, ENRICHMENT_V1_NULL_KEYS } from './brief-model.mjs';

const CAL = [
  { et_date: '2026-09-07', event_id: 'e1', coded_marker: true, optional: false, overlap_group: null },
  { et_date: '2026-09-07', event_id: 'e2', coded_marker: false, optional: true, overlap_group: 'g1' },
];
const TRIAGE = [
  { et_date: '2026-09-07', thread_id: 't1', class: 'archive', action_taken_at: '2026-09-07T08:00:00Z', needs_you: false },
  { et_date: '2026-09-07', thread_id: 't2', class: null, action_taken_at: null, needs_you: true, needs_you_reason: 'ambiguous' },
];
const SNAP = [
  { et_date: '2026-09-07', task_id: 'x1', effort_grade: 'S' },
  { et_date: '2026-09-07', task_id: 'x2', effort_grade: null },
];
const RUNS = [
  { feeder: 'tasks-classifier', attempt: 1, status: 'ok', id: 'r1', counts: {} },
  { feeder: 'calendar-read', attempt: 1, status: 'ok', id: 'r2', counts: {} },
  { feeder: 'gmail-triage', attempt: 1, status: 'degraded', id: 'r3', counts: {} },
  { feeder: 'todoist-brief', attempt: 1, status: 'ok', id: 'r4', counts: { ehg_pointer: 2 } },
];

describe('buildBriefData', () => {
  it('yields every named key with schema 2 and the four v1-null enrichment keys present', () => {
    const data = buildBriefData({ etDate: '2026-09-07', calendarRows: CAL, triageRows: TRIAGE, snapshotRows: SNAP, feederRuns: RUNS });
    expect(data.schema).toBe(SCHEMA_VERSION);
    expect(data.date).toBe('2026-09-07');
    expect(typeof data.lede).toBe('string');
    expect(Array.isArray(data.headsUp)).toBe(true);
    expect(Object.keys(data.frontPage).sort()).toEqual(['claudeCode', 'ehg', 'gmail', 'today', 'todoist'].sort());
    for (const k of ENRICHMENT_V1_NULL_KEYS) expect(data.enrichment[k]).toBeNull();
    expect(data.enrichment.signals).toEqual([]);
    expect(validateBriefData(data)).toEqual({ valid: true });
  });

  it('gmail block: handled counts action_taken_at rows, unclassifiedCount counts null class, needsYou lists reasons', () => {
    const data = buildBriefData({ etDate: '2026-09-07', triageRows: TRIAGE });
    expect(data.frontPage.gmail.handled).toBe(1);
    expect(data.frontPage.gmail.unclassifiedCount).toBe(1);
    expect(data.frontPage.gmail.needsYou).toEqual([{ thread_id: 't2', reason: 'ambiguous' }]);
  });

  it('ehg block: handedCount comes from todoist-brief counts.ehg_pointer, not a hardcoded value', () => {
    const data = buildBriefData({ etDate: '2026-09-07', feederRuns: RUNS });
    expect(data.frontPage.ehg.handedCount).toBe(2);
    expect(data.frontPage.ehg.shown).toBe(true);
    const noRuns = buildBriefData({ etDate: '2026-09-07' });
    expect(noRuns.frontPage.ehg.handedCount).toBe(0);
    expect(noRuns.frontPage.ehg.shown).toBe(false);
  });

  it('claudeCode block: reports ok/degraded/missing against the four readiness feeders', () => {
    const data = buildBriefData({ etDate: '2026-09-07', feederRuns: RUNS });
    expect(data.frontPage.claudeCode).toEqual({ feeders_ok: 3, feeders_degraded: 1, feeders_missing: [] });
  });

  it('logs: one run_id per feeder, taking the highest attempt', () => {
    const runsWithRetry = [...RUNS, { feeder: 'tasks-classifier', attempt: 2, status: 'ok', id: 'r1b', counts: {} }];
    const data = buildBriefData({ etDate: '2026-09-07', feederRuns: runsWithRetry });
    expect(data.logs['tasks-classifier']).toBe('r1b');
    expect(data.logs['todoist-brief']).toBe('r4');
  });
});

describe('validateBriefData', () => {
  const GOOD = buildBriefData({ etDate: '2026-09-07' });

  it('refuses a missing frontPage key', () => {
    const bad = { ...GOOD, frontPage: { ...GOOD.frontPage } };
    delete bad.frontPage.ehg;
    expect(validateBriefData(bad)).toMatchObject({ valid: false, refusal: 'FRONTPAGE_KEY_MISSING' });
  });

  it('refuses a wrong schema number', () => {
    expect(validateBriefData({ ...GOOD, schema: 1 })).toMatchObject({ valid: false, refusal: 'SCHEMA_MISMATCH' });
    expect(validateBriefData({ ...GOOD, schema: 3 })).toMatchObject({ valid: false, refusal: 'SCHEMA_MISMATCH' });
  });

  it('refuses an unknown top-level key', () => {
    expect(validateBriefData({ ...GOOD, extra_field: 'nope' })).toMatchObject({ valid: false, refusal: 'UNKNOWN_TOP_LEVEL_KEY' });
  });

  it('refuses a non-object payload without throwing', () => {
    expect(validateBriefData(null)).toMatchObject({ valid: false, refusal: 'SHAPE_INVALID' });
    expect(validateBriefData('x')).toMatchObject({ valid: false, refusal: 'SHAPE_INVALID' });
    expect(validateBriefData([])).toMatchObject({ valid: false, refusal: 'SHAPE_INVALID' });
  });

  it('accepts the well-formed output of buildBriefData', () => {
    expect(validateBriefData(GOOD)).toEqual({ valid: true });
  });
});

describe('templateLede / computeDayClass', () => {
  it('computeDayClass: Recovery on zero events, Deep on a coded event, Interpersonal on 3+ uncoded, else Shallow', () => {
    expect(computeDayClass([])).toBe('Recovery');
    expect(computeDayClass([{ coded_marker: true }])).toBe('Deep');
    expect(computeDayClass([{ coded_marker: false }, { coded_marker: false }, { coded_marker: false }])).toBe('Interpersonal');
    expect(computeDayClass([{ coded_marker: false }])).toBe('Shallow');
  });

  it('templateLede names the day class and the three counts in one sentence', () => {
    const lede = templateLede({ dayClass: 'Deep', counts: { eventCount: 2, unclassifiedCount: 1, todoistDue: 3 } });
    expect(lede).toContain('Deep day');
    expect(lede).toContain('2 calendar events');
    expect(lede).toContain('1 unclassified gmail thread');
    expect(lede).toContain('3 todoist items due');
  });
});
