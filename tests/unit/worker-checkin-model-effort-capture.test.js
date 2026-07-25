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

// ── SD-LEO-INFRA-FLEET-MODEL-REGISTRY-001: FR-1 exact-id capture + FR-2 provenance ──
// Measured 2026-07-25 across 13 live seats, metadata.model held {opus:9,
// "claude-opus-5[1m]":1, unset:3} — every fleet worker had been flattened to a bare
// family because this writer ran the self-reported id through normalizeModel (which
// returns a MODEL_STRENGTH key) before storing it. Registration stored the raw id and
// this writer then overwrote it, so the fleet could not distinguish Opus 5 from
// Opus 4.8 anywhere. These pin the exact id, the separately-derived family, and the
// provenance stamp.
describe('FR-1/FR-2: exact model id, derived family, and provenance', () => {
  it('TS-1: persists the EXACT versioned id and derives model_family from it', () => {
    const r = mergeCheckinModelEffort(null, { model: 'claude-opus-5[1m]', effort: 'high' });
    expect(r.metadata.model).toBe('claude-opus-5[1m]');
    expect(r.metadata.model_family).toBe('opus');
    // tier_rank must be UNCHANGED from what the bare family produced before this SD.
    expect(r.metadata.tier_rank).toBe(mergeCheckinModelEffort(null, { model: 'opus', effort: 'high' }).metadata.tier_rank);
  });

  it('TS-1: a bare-family self-report stays idempotent (raw === family)', () => {
    const r = mergeCheckinModelEffort(null, { model: 'opus', effort: 'high' });
    expect(r.metadata.model).toBe('opus');
    expect(r.metadata.model_family).toBe('opus');
  });

  it('TS-2: a check-in does NOT downgrade a versioned id stamped at registration', () => {
    // The observed 074ec1e1 regression: that seat carried capture-session-id's
    // exclusive cc_pid/source signature yet read model='opus'. Registration preserved
    // the version and the check-in destroyed it.
    const afterRegistration = { cc_pid: '58408', source: 'startup', model: 'claude-opus-5[1m]', effort: 'high' };
    const r = mergeCheckinModelEffort(afterRegistration, { model: 'claude-opus-5[1m]', effort: 'high' });
    const finalMeta = r.changed ? r.metadata : afterRegistration;
    expect(finalMeta.model).toBe('claude-opus-5[1m]');
  });

  it('TS-4: an unrecognized model is retained RAW and never resolves to a family', () => {
    const r = mergeCheckinModelEffort(null, { model: 'gemini-3-5-pro', effort: 'high' });
    expect(r.metadata.model).toBe('gemini-3-5-pro');
    expect(r.metadata.model_family).toBeUndefined();
    // The literal 'fable' is what normalizeModel used to persist here, which sailed
    // through the Fable-exclusive one-way-door gate. It must never appear.
    expect(r.metadata.model_family).not.toBe('fable');
  });

  it('an unrecognized model CLEARS a stale model_family rather than letting it stand', () => {
    // Otherwise a family would outlive the model it described and launder an
    // unrecognized seat through the family-keyed door gate.
    const prior = { model: 'claude-opus-5[1m]', model_family: 'opus', effort: 'high' };
    const r = mergeCheckinModelEffort(prior, { model: 'gemini-3-5-pro' });
    expect(r.changed).toBe(true);
    expect('model_family' in r.metadata).toBe(false);
  });

  it('TS-6: model_source is stamped worker_self_report, and an external stamp WINS', () => {
    const fresh = mergeCheckinModelEffort(null, { model: 'opus' });
    expect(fresh.metadata.model_source).toBe('worker_self_report');

    const chairman = { model: 'opus', model_source: 'chairman' };
    const r = mergeCheckinModelEffort(chairman, { model: 'sonnet' });
    expect(r.metadata.model_source).toBe('chairman');
  });

  it('TS-6: the pre-existing free-text model_source value is protected, not a crash', () => {
    // One live row carries a coordinator-authored free-text provenance string. It is
    // not one of the enum values, so it must be treated as an external stamp.
    const legacy = { model: 'opus', model_source: 'live_self_report_confirmed_2026-07-25T02:52Z_by_coordinator_a59441f4' };
    const r = mergeCheckinModelEffort(legacy, { model: 'sonnet' });
    expect(r.metadata.model_source).toBe(legacy.model_source);
  });
});
