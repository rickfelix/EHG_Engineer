/**
 * LEAD-aging detector tests — SD-LEO-INFRA-ADAM-VISION-SD-FLOW-001 (FR-4).
 * PURE unit cases with an INJECTED clock (no DB / IO / Date.now). Covers core detection, the
 * DISJOINTNESS guards (unscored / claimed / non-LEAD / non-proposal are NOT flagged — so this never
 * double-reports with findStalledDrafts or the progress-stall DUTY), the conception-age basis,
 * the authoritative scored-signal via scoredKeys, and fail-open / injection.
 */
import { describe, it, expect } from 'vitest';
import { findLeadAgingDrafts } from '../../lib/coordinator/lead-aging-detector.mjs';

const DAY = 86400000;
const NOW = Date.parse('2026-06-15T00:00:00.000Z');
const daysAgo = (d) => new Date(NOW - d * DAY).toISOString();

// A scored, unclaimed, Adam-sourced vision-loop DRAFT at LEAD, conceived `d` days ago (the candidate).
const agingDraft = (sd_key, d, extra = {}) => ({
  sd_key, status: 'draft', current_phase: 'LEAD', vision_score: 70,
  metadata: { source: 'proposal' }, claiming_session_id: null,
  created_at: daysAgo(d), updated_at: daysAgo(d), ...extra,
});

describe('findLeadAgingDrafts — core detection', () => {
  it('flags scored/unclaimed/LEAD/proposal drafts older than the default 7d threshold, oldest-first', () => {
    const rows = [agingDraft('SD-A', 10), agingDraft('SD-B', 30), agingDraft('SD-C', 8)];
    const r = findLeadAgingDrafts(rows, NOW);
    expect(r.violation).toBe(true);
    expect(r.staleCount).toBe(3);
    expect(r.samples.map((s) => s.sd_key)).toEqual(['SD-B', 'SD-A', 'SD-C']); // oldest-first
    expect(r.samples[0].ageDays).toBe(30);
    expect(r.remediation).toMatch(/dispatch|LEAD-TO-PLAN/i);
  });

  it('does NOT flag a freshly-conceived draft (threshold protects new drafts)', () => {
    expect(findLeadAgingDrafts([agingDraft('SD-NEW', 2)], NOW).violation).toBe(false);
  });

  it('uses the conception-age basis (robust to updated_at noise)', () => {
    const row = agingDraft('SD-NOISY', 40, { updated_at: new Date(NOW - 3600000).toISOString() });
    const r = findLeadAgingDrafts([row], NOW);
    expect(r.violation).toBe(true);
    expect(r.samples[0].ageDays).toBe(40); // measured from conception, not last touch
  });
});

describe('findLeadAgingDrafts — DISJOINTNESS (never double-reports with the sibling detectors)', () => {
  it('does NOT flag an UNSCORED draft@LEAD (disjoint from findStalledDrafts — that detector owns unscored)', () => {
    const unscored = agingDraft('SD-UNSCORED', 30, { vision_score: null }); // no column score, no scoredKeys
    expect(findLeadAgingDrafts([unscored], NOW).violation).toBe(false);
  });

  it('does NOT flag a CLAIMED scored draft@LEAD (disjoint from the claimed progress-stall DUTY)', () => {
    const claimed = agingDraft('SD-CLAIMED', 30, { claiming_session_id: 'sess-123' });
    expect(findLeadAgingDrafts([claimed], NOW).violation).toBe(false);
  });

  it('does NOT flag a scored draft NOT at current_phase=LEAD (e.g. already advanced to PLAN)', () => {
    const advanced = agingDraft('SD-PLAN', 30, { current_phase: 'PLAN_PRD' });
    expect(findLeadAgingDrafts([advanced], NOW).violation).toBe(false);
  });

  it('does NOT flag a non-proposal-sourced draft (only Adam-sourced vision-loop drafts)', () => {
    const manual = agingDraft('SD-MANUAL', 30, { metadata: { source: 'uat' } });
    expect(findLeadAgingDrafts([manual], NOW).violation).toBe(false);
    // missing metadata entirely is also excluded (never throws)
    expect(findLeadAgingDrafts([agingDraft('SD-NOMETA', 30, { metadata: null })], NOW).violation).toBe(false);
  });

  it('does NOT flag non-draft rows (in_progress / completed / deferred) even if scored + LEAD-ish', () => {
    const rows = [
      agingDraft('SD-INPROG', 30, { status: 'in_progress' }),
      agingDraft('SD-DEFERRED', 30, { status: 'deferred' }),
    ];
    expect(findLeadAgingDrafts(rows, NOW).violation).toBe(false);
  });

  it('does NOT flag a durably-deferred draft (metadata.requires_human_action=true — e.g. chairman-parked)', () => {
    const parked = agingDraft('SD-PARKED', 30, {
      metadata: { source: 'proposal', requires_human_action: true },
    });
    expect(findLeadAgingDrafts([parked], NOW).violation).toBe(false);
  });

  it('does NOT flag a durably-deferred draft (metadata.not_worker_claimable_reason set)', () => {
    const deferred = agingDraft('SD-NOT-CLAIMABLE', 30, {
      metadata: { source: 'proposal', not_worker_claimable_reason: 'dependency-hold' },
    });
    expect(findLeadAgingDrafts([deferred], NOW).violation).toBe(false);
  });
});

describe('findLeadAgingDrafts — authoritative scored signal (scoredKeys / eva-row)', () => {
  it('FLAGS a null-column draft whose sd_key is in scoredKeys (scored via eva_vision_scores)', () => {
    const row = agingDraft('SD-EVA-SCORED', 30, { vision_score: null });
    const scoredKeys = new Set(['SD-EVA-SCORED']);
    const r = findLeadAgingDrafts([row], NOW, { scoredKeys });
    expect(r.violation).toBe(true);
    expect(r.samples[0].sd_key).toBe('SD-EVA-SCORED');
  });

  it('does NOT flag a null-column draft absent from scoredKeys (unscored → owned by findStalledDrafts)', () => {
    const row = agingDraft('SD-NO-EVA', 30, { vision_score: null });
    expect(findLeadAgingDrafts([row], NOW, { scoredKeys: new Set(['SD-OTHER']) }).violation).toBe(false);
  });

  it('treats vision_score = 0 as a real score (flags it if aging)', () => {
    expect(findLeadAgingDrafts([agingDraft('SD-ZERO', 30, { vision_score: 0 })], NOW).violation).toBe(true);
  });
});

describe('findLeadAgingDrafts — fail-open & injection', () => {
  it('returns no-violation (never throws) on non-array / null / empty input', () => {
    for (const bad of [undefined, null, 'nope', 42, {}]) {
      const r = findLeadAgingDrafts(bad, NOW);
      expect(r.violation).toBe(false);
      expect(r.staleCount).toBe(0);
    }
    expect(findLeadAgingDrafts([], NOW).violation).toBe(false);
  });

  it('does NOT throw on explicitly-null / garbage opts (degrades to defaults)', () => {
    expect(() => findLeadAgingDrafts([agingDraft('SD-A', 30)], NOW, null)).not.toThrow();
    expect(findLeadAgingDrafts([agingDraft('SD-A', 30)], NOW, null).violation).toBe(true);
    expect(() => findLeadAgingDrafts([], NOW, 'garbage')).not.toThrow();
  });

  it('returns no-violation when the injected clock is not finite (fail-open)', () => {
    expect(findLeadAgingDrafts([agingDraft('SD-A', 30)], NaN).violation).toBe(false);
  });

  it('does not flag a row with no parseable timestamp (cannot prove aging)', () => {
    const row = agingDraft('SD-NOTS', 30, { created_at: null, updated_at: null });
    expect(findLeadAgingDrafts([row], NOW).violation).toBe(false);
  });

  it('honours injected thresholdMs and sampleLimit', () => {
    const row = agingDraft('SD-2D', 2);
    expect(findLeadAgingDrafts([row], NOW).violation).toBe(false);                  // default 7d → fresh
    expect(findLeadAgingDrafts([row], NOW, { thresholdMs: DAY }).violation).toBe(true); // 1d → aging
    const many = Array.from({ length: 12 }, (_, i) => agingDraft(`SD-${i}`, 10 + i));
    const r = findLeadAgingDrafts(many, NOW, { sampleLimit: 3 });
    expect(r.staleCount).toBe(12);
    expect(r.samples).toHaveLength(3);
  });
});
