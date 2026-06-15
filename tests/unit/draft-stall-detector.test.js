/**
 * Draft-stall detector tests — SD-LEO-INFRA-SILENT-STALL-PREVENTION-001.
 * PURE unit cases with an INJECTED clock (no DB / IO / Date.now). Covers: all-null, some-null, the
 * GREATEST(created_at,updated_at) fresh-vs-stale grace, non-draft / scored exclusion, fail-open on bad input,
 * and threshold/sampleLimit injection.
 */
import { describe, it, expect } from 'vitest';
import { findStalledDrafts } from '../../lib/coordinator/draft-stall-detector.mjs';

const DAY = 86400000;
// Fixed injected "now" — every timestamp below is expressed relative to it (deterministic, no real clock).
const NOW = Date.parse('2026-06-15T00:00:00.000Z');
const daysAgo = (d) => new Date(NOW - d * DAY).toISOString();

// A draft stranded with a null vision_score, created `d` days ago (and not since touched).
const staleDraft = (sd_key, d) => ({ sd_key, status: 'draft', vision_score: null, created_at: daysAgo(d), updated_at: daysAgo(d) });

describe('findStalledDrafts — core detection', () => {
  it('flags multiple null-score drafts older than the default 7d threshold, oldest-first', () => {
    const rows = [staleDraft('SD-A', 10), staleDraft('SD-B', 30), staleDraft('SD-C', 8)];
    const r = findStalledDrafts(rows, NOW);
    expect(r.violation).toBe(true);
    expect(r.staleCount).toBe(3);
    // oldest-first: B(30) > A(10) > C(8)
    expect(r.samples.map((s) => s.sd_key)).toEqual(['SD-B', 'SD-A', 'SD-C']);
    expect(r.samples[0].ageDays).toBe(30);
    expect(r.remediation).toMatch(/re-score/i);
  });

  it('flags only the stranded subset when some drafts are scored or fresh (some-null)', () => {
    const rows = [
      staleDraft('SD-STALE', 20),
      { sd_key: 'SD-SCORED', status: 'draft', vision_score: 72, created_at: daysAgo(40), updated_at: daysAgo(40) },
      { sd_key: 'SD-FRESH', status: 'draft', vision_score: null, created_at: daysAgo(2), updated_at: daysAgo(2) },
    ];
    const r = findStalledDrafts(rows, NOW);
    expect(r.staleCount).toBe(1);
    expect(r.samples.map((s) => s.sd_key)).toEqual(['SD-STALE']);
  });
});

describe('findStalledDrafts — conception-age (created_at) basis, robust to updated_at noise', () => {
  it('FLAGS an old-conceived draft even when updated_at was bumped recently (the live finding)', () => {
    // created 40d ago, but unrelated writes (cascade/sweep/metadata) bumped updated_at to 1h ago.
    // A GREATEST(created,updated) grace would MASK this real stall; the conception-age basis correctly flags it.
    const row = { sd_key: 'SD-NOISY-UPDATE', status: 'draft', vision_score: null, created_at: daysAgo(40), updated_at: new Date(NOW - 3600000).toISOString() };
    const r = findStalledDrafts([row], NOW);
    expect(r.violation).toBe(true);
    expect(r.staleCount).toBe(1);
    expect(r.samples[0].ageDays).toBe(40); // age is measured from conception, not last touch
  });

  it('does NOT flag a freshly-conceived draft (threshold protects new drafts — no updated_at grace needed)', () => {
    const row = { sd_key: 'SD-NEW', status: 'draft', vision_score: null, created_at: daysAgo(2), updated_at: daysAgo(1) };
    expect(findStalledDrafts([row], NOW).violation).toBe(false);
  });

  it('falls back to updated_at as the age basis only when created_at is absent (legacy rows)', () => {
    const legacy = { sd_key: 'SD-LEGACY', status: 'draft', vision_score: null, created_at: null, updated_at: daysAgo(20) };
    const r = findStalledDrafts([legacy], NOW);
    expect(r.violation).toBe(true);
    expect(r.samples[0].ageDays).toBe(20);
  });
});

describe('findStalledDrafts — exclusions', () => {
  it('excludes non-draft rows even with a null vision_score', () => {
    const rows = [
      { sd_key: 'SD-ACTIVE', status: 'in_progress', vision_score: null, created_at: daysAgo(30), updated_at: daysAgo(30) },
      { sd_key: 'SD-DONE', status: 'completed', vision_score: null, created_at: daysAgo(30), updated_at: daysAgo(30) },
    ];
    const r = findStalledDrafts(rows, NOW);
    expect(r.violation).toBe(false);
    expect(r.staleCount).toBe(0);
  });

  it('excludes a scored draft (vision_score = 0 is a real score, not a stall)', () => {
    const row = { sd_key: 'SD-ZERO', status: 'draft', vision_score: 0, created_at: daysAgo(30), updated_at: daysAgo(30) };
    const r = findStalledDrafts([row], NOW);
    expect(r.violation).toBe(false);
  });
});

describe('findStalledDrafts — authoritative scored-signal (eva-row, DSD-1)', () => {
  it('EXCLUDES an old null-column draft whose sd_key has an eva_vision_scores row (scored via eva, not a stall)', () => {
    // The vision_score column is null even for a SUCCESSFULLY-scored draft (scoreSD writes only eva_vision_scores).
    // A scoredKeys set membership is the authoritative scored-signal — the same fallback the hard gate uses.
    const row = staleDraft('SD-SCORED-VIA-EVA', 30);
    const scoredKeys = new Set(['SD-SCORED-VIA-EVA']);
    expect(findStalledDrafts([row], NOW, { scoredKeys }).violation).toBe(false);
  });

  it('FLAGS an old null-column draft NOT present in scoredKeys (genuine silent stall)', () => {
    const row = staleDraft('SD-NO-EVA', 30);
    const scoredKeys = new Set(['SD-SOMETHING-ELSE']);
    const r = findStalledDrafts([row], NOW, { scoredKeys });
    expect(r.violation).toBe(true);
    expect(r.samples[0].sd_key).toBe('SD-NO-EVA');
  });

  it('degrades to the column-only check when scoredKeys is absent (conservative, never throws)', () => {
    expect(findStalledDrafts([staleDraft('SD-X', 30)], NOW).violation).toBe(true);
  });
});

describe('findStalledDrafts — fail-open & injection', () => {
  it('returns no-violation (never throws) on a non-array, null, or empty input', () => {
    for (const bad of [undefined, null, 'nope', 42, {}]) {
      const r = findStalledDrafts(bad, NOW);
      expect(r.violation).toBe(false);
      expect(r.staleCount).toBe(0);
    }
    expect(findStalledDrafts([], NOW).violation).toBe(false);
  });

  it('does NOT throw on an explicitly-null opts (DSD-2 — degrades to defaults)', () => {
    expect(() => findStalledDrafts([staleDraft('SD-A', 30)], NOW, null)).not.toThrow();
    expect(findStalledDrafts([staleDraft('SD-A', 30)], NOW, null).violation).toBe(true); // default 7d threshold
    // a non-object opts is likewise tolerated
    expect(() => findStalledDrafts([], NOW, 'garbage')).not.toThrow();
  });

  it('returns no-violation when the injected clock is not a finite number (fail-open)', () => {
    const r = findStalledDrafts([staleDraft('SD-A', 30)], NaN);
    expect(r.violation).toBe(false);
  });

  it('does not flag a row that has no parseable timestamp (cannot prove staleness)', () => {
    const row = { sd_key: 'SD-NOTS', status: 'draft', vision_score: null, created_at: null, updated_at: null };
    expect(findStalledDrafts([row], NOW).violation).toBe(false);
  });

  it('honours an injected thresholdMs (1d makes a 2-day draft stale)', () => {
    const row = { sd_key: 'SD-2D', status: 'draft', vision_score: null, created_at: daysAgo(2), updated_at: daysAgo(2) };
    expect(findStalledDrafts([row], NOW).violation).toBe(false);            // default 7d → fresh
    expect(findStalledDrafts([row], NOW, { thresholdMs: DAY }).violation).toBe(true); // 1d → stale
  });

  it('honours an injected sampleLimit (caps samples but not staleCount)', () => {
    const rows = Array.from({ length: 12 }, (_, i) => staleDraft(`SD-${i}`, 10 + i));
    const r = findStalledDrafts(rows, NOW, { sampleLimit: 3 });
    expect(r.staleCount).toBe(12);
    expect(r.samples).toHaveLength(3);
  });
});
