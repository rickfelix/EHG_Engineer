/**
 * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E
 * TS-3 / TS-5 / TS-6 — measurement provenance stamping.
 *
 * Covers: explicit-offset timestamp (AC-3 prevention), fail-soft git capture (TR-4),
 * and the anti-spoof stamp-last ordering (FR-1).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildMeasurementProvenance } from '../../../lib/governance/measurement-provenance.js';
import { emitFeedback } from '../../../lib/governance/emit-feedback.js';
import { normalizeToUTC } from '../../../scripts/hooks/stop-subagent-enforcement/time-utils.js';

const FIXED = new Date('2026-07-27T16:30:00.000Z');
const okGit = (args) => (args.includes('--abbrev-ref') ? 'main' : 'abc123def4567890');

function buildSupabase({ existing = null, insertResult = { id: 'fb-1' } } = {}) {
  const insert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({ data: insertResult, error: null }),
    })),
  }));
  const dedupSelect = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
      })),
    })),
  }));
  return { from: vi.fn(() => ({ select: dedupSelect, insert })), _insert: insert };
}

describe('buildMeasurementProvenance', () => {
  it('TS-3: measured_at always carries an explicit UTC offset (never a naive local string)', () => {
    const p = buildMeasurementProvenance({ git: okGit, now: () => FIXED });
    expect(p.measured_at).toBe('2026-07-27T16:30:00.000Z');
    // The whole point of AC-3: an explicit offset is present, so no reader can
    // mis-parse it as local time.
    expect(/Z$|[+-]\d{2}:\d{2}$/.test(p.measured_at)).toBe(true);
  });

  it('TS-3: age computed from measured_at is timezone-independent', () => {
    const p = buildMeasurementProvenance({ git: okGit, now: () => FIXED });
    // The repo idiom for this bug class (see tests/unit/handoff/wait-verdict.test.js)
    // is to assert naive-vs-explicit parse equivalence rather than hot-swapping
    // process.env.TZ, because V8/ICU timezone data is not reliably swappable
    // mid-process. An explicit-offset value must parse to the SAME instant whether
    // or not the normalizer has to repair it.
    const viaNormalizer = normalizeToUTC(p.measured_at).getTime();
    const viaDirect = Date.parse(p.measured_at);
    expect(viaNormalizer).toBe(viaDirect);

    // And a naive spelling of the same instant must resolve identically once
    // normalized — proving the four-hour shift cannot re-enter through this field.
    const naive = p.measured_at.replace('Z', '');
    expect(normalizeToUTC(naive).getTime()).toBe(viaDirect);
  });

  it('captures git ref and sha when git is available', () => {
    const p = buildMeasurementProvenance({ git: okGit, now: () => FIXED });
    expect(p.git_sha).toBe('abc123def4567890');
    expect(p.git_ref).toBe('main');
  });

  it('TS-5: a THROWING git dependency degrades to absent git fields, never a throw', () => {
    const throwingGit = () => { throw new Error('not a git repository'); };
    const p = buildMeasurementProvenance({ git: throwingGit, now: () => FIXED });
    expect(p.measured_at).toBe('2026-07-27T16:30:00.000Z');
    expect(p.git_sha).toBeUndefined();
    expect(p.git_ref).toBeUndefined();
  });

  it('TS-5: an EMPTY git result (detached head / no output) also degrades cleanly', () => {
    const p = buildMeasurementProvenance({ git: () => '', now: () => FIXED });
    expect(p.git_sha).toBeUndefined();
    expect(p.git_ref).toBeUndefined();
    expect(p.measured_at).toBeTruthy();
  });
});

describe('emitFeedback provenance stamping (FR-1)', () => {
  it('TS-6: stamps provenance into metadata on the inserted row', async () => {
    const supabase = buildSupabase();
    await emitFeedback({
      supabase,
      title: 'Provenance test',
      description: 'A claim measured at a specific instant against a specific ref',
      provenanceDeps: { git: okGit, now: () => FIXED },
    });
    const row = supabase._insert.mock.calls[0][0];
    expect(row.metadata.measured_at).toBe('2026-07-27T16:30:00.000Z');
    expect(row.metadata.git_sha).toBe('abc123def4567890');
    expect(row.metadata.git_ref).toBe('main');
    expect(row.metadata.timezone).toBeDefined();
  });

  it('TS-6: a caller CANNOT spoof its own provenance — the stamp is applied last and wins', async () => {
    const supabase = buildSupabase();
    await emitFeedback({
      supabase,
      title: 'Spoof attempt',
      description: 'Caller supplies a bogus measured_at in its own metadata',
      metadata: {
        measured_at: '1999-01-01T00:00:00.000Z',
        git_sha: 'deadbeefdeadbeef',
        git_ref: 'attacker-branch',
      },
      provenanceDeps: { git: okGit, now: () => FIXED },
    });
    const row = supabase._insert.mock.calls[0][0];
    expect(row.metadata.measured_at).toBe('2026-07-27T16:30:00.000Z');
    expect(row.metadata.git_sha).toBe('abc123def4567890');
    expect(row.metadata.git_ref).toBe('main');
  });

  it('TS-5: a failing git dep still writes the row (a feedback write never fails on git)', async () => {
    const supabase = buildSupabase();
    const result = await emitFeedback({
      supabase,
      title: 'Git unavailable',
      description: 'Recording a claim from a non-repo working directory',
      provenanceDeps: { git: () => { throw new Error('git missing'); }, now: () => FIXED },
    });
    expect(result.id).toBe('fb-1');
    expect(supabase._insert).toHaveBeenCalled();
    const row = supabase._insert.mock.calls[0][0];
    expect(row.metadata.measured_at).toBeTruthy();
    expect(row.metadata.git_sha).toBeUndefined();
  });

  it('preserves existing metadata behavior (dedup_hash + caller keys still present)', async () => {
    const supabase = buildSupabase();
    await emitFeedback({
      supabase,
      title: 'Regression guard',
      description: 'Existing metadata contract must be unchanged by provenance stamping',
      metadata: { layer_suppressed: 'api' },
      dedup_key: 'lib/example.js',
      provenanceDeps: { git: okGit, now: () => FIXED },
    });
    const row = supabase._insert.mock.calls[0][0];
    expect(row.metadata.dedup_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.metadata.layer_suppressed).toBe('api');
    expect(row.metadata.emitted_at).toBeDefined();
  });
});
