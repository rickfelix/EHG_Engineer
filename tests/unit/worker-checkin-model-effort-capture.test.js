/**
 * SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-B (FR-3, FR-7): --model/--effort capture at
 * worker check-in. Pure-function coverage of parseCheckinArgs and mergeCheckinModelEffort
 * (no DB, no network).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseCheckinArgs, mergeCheckinModelEffort } = require('../../scripts/worker-checkin.cjs');

describe('FR-3: parseCheckinArgs', () => {
  it('parses --model and --effort from argv', () => {
    expect(parseCheckinArgs(['--model', 'sonnet', '--effort', 'xhigh'])).toEqual({ model: 'sonnet', effort: 'xhigh' });
  });

  it('returns null for absent flags', () => {
    expect(parseCheckinArgs([])).toEqual({ model: null, effort: null });
    expect(parseCheckinArgs(['--json'])).toEqual({ model: null, effort: null });
  });

  it('does not treat the next flag as a value', () => {
    expect(parseCheckinArgs(['--model', '--effort', 'xhigh'])).toEqual({ model: null, effort: 'xhigh' });
  });

  it('supports either flag alone', () => {
    expect(parseCheckinArgs(['--model', 'opus'])).toEqual({ model: 'opus', effort: null });
    expect(parseCheckinArgs(['--effort', 'high'])).toEqual({ model: null, effort: 'high' });
  });
});

describe('TS-4/TR-2: mergeCheckinModelEffort — no-op when both flags absent', () => {
  it('returns the SAME metadata object reference, changed=false, when neither flag is passed', () => {
    const original = { foo: 'bar', tier_rank: 2 };
    const result = mergeCheckinModelEffort(original, {});
    expect(result.changed).toBe(false);
    expect(result.metadata).toBe(original); // byte-identical -- same reference, not a copy
  });

  it('is a no-op for a null starting metadata too', () => {
    const result = mergeCheckinModelEffort(null, { model: null, effort: null });
    expect(result.changed).toBe(false);
    expect(result.metadata).toBeNull();
  });
});

describe('FR-3: mergeCheckinModelEffort — fresh capture sets model/effort/tier_rank', () => {
  it('sets metadata.model, metadata.effort, effort_source, and a numeric tier_rank from unset state', () => {
    const result = mergeCheckinModelEffort(null, { model: 'sonnet', effort: 'xhigh' });
    expect(result.changed).toBe(true);
    expect(result.metadata.model).toBe('sonnet');
    expect(result.metadata.effort).toBe('xhigh');
    expect(result.metadata.effort_source).toBe('worker_self_report');
    expect(typeof result.metadata.tier_rank).toBe('number');
  });

  it('normalizes model/effort through the tier-ladder normalizer (e.g. legacy "max" -> "xhigh")', () => {
    const result = mergeCheckinModelEffort(null, { model: 'opus', effort: 'max' });
    expect(result.metadata.effort).toBe('xhigh');
  });

  it('preserves unrelated pre-existing metadata fields', () => {
    const result = mergeCheckinModelEffort({ role: 'worker', callsign: 'Delta' }, { model: 'sonnet', effort: 'high' });
    expect(result.metadata.role).toBe('worker');
    expect(result.metadata.callsign).toBe('Delta');
  });
});

describe('TS-5: mergeCheckinModelEffort — idempotent repeated calls', () => {
  it('a second identical call produces changed=false and the SAME metadata reference (no drift, no duplicate work)', () => {
    const first = mergeCheckinModelEffort(null, { model: 'sonnet', effort: 'xhigh' });
    expect(first.changed).toBe(true);
    const second = mergeCheckinModelEffort(first.metadata, { model: 'sonnet', effort: 'xhigh' });
    expect(second.changed).toBe(false);
    expect(second.metadata).toBe(first.metadata);
    expect(second.metadata).toEqual(first.metadata);
  });
});

describe('TS-6/FR-7: mergeCheckinModelEffort — chairman-set effort_source wins over self-report', () => {
  it('given effort_source=chairman with effort already set, --effort self-report does NOT overwrite it', () => {
    const chairmanStamped = { effort: 'high', effort_source: 'chairman' };
    const result = mergeCheckinModelEffort(chairmanStamped, { model: null, effort: 'xhigh' });
    expect(result.metadata.effort).toBe('high'); // unchanged -- chairman wins
    expect(result.metadata.effort_source).toBe('chairman');
  });

  it('a --model self-report is NOT blocked by a chairman-set effort_source (only effort is protected)', () => {
    const chairmanStamped = { effort: 'high', effort_source: 'chairman' };
    const result = mergeCheckinModelEffort(chairmanStamped, { model: 'opus', effort: null });
    expect(result.changed).toBe(true);
    expect(result.metadata.model).toBe('opus');
    expect(result.metadata.effort).toBe('high'); // still untouched
  });

  it('self-report DOES fill effort when effort_source is unset (no prior chairman stamp)', () => {
    const result = mergeCheckinModelEffort({}, { model: null, effort: 'xhigh' });
    expect(result.metadata.effort).toBe('xhigh');
    expect(result.metadata.effort_source).toBe('worker_self_report');
  });

  it('self-report CAN update effort when the prior source was itself a worker self-report', () => {
    const priorSelfReport = { effort: 'high', effort_source: 'worker_self_report' };
    const result = mergeCheckinModelEffort(priorSelfReport, { model: null, effort: 'xhigh' });
    expect(result.metadata.effort).toBe('xhigh');
  });
});
