// SD-LEO-INFRA-ESTATE-DISPOSITION-001 (FR-6) — unit tests for the pure estate-disposition logic:
// idempotent mark-off (no double-disposition), the 0-3 compounding score (persists + varies), the
// per-table mark-off payload (claude_code has no processed_at), and the trace-reader shipped-idea
// suppression. Hermetic: pure helpers, no DB.
import { describe, it, expect } from 'vitest';
import { computeCompoundingScore } from '../../../lib/intake/compounding-score.js';
import {
  estateAlreadyDrained,
  todoistPriorityToText,
  classifyEstateItem,
  buildEstateMarkOff,
  isEstateIdeaShipped,
  isToolChangelogIntakeRow,
} from '../../../lib/intake/estate-disposition-helpers.js';

describe('computeCompoundingScore — 0-3, deterministic, varies by signal (FR-2)', () => {
  const lowNoise = { title: 'x', description: '', normalized_priority: 'low' };
  const midSubstance = { title: 'A useful note', description: 'A reasonably detailed description of an idea that exceeds the substance threshold.', normalized_priority: 'low' };
  const highAligned = { title: 'Revenue venture launch', description: 'A substantive, value-aligned, high-priority idea about customer payment and the income gauge.', normalized_priority: 'critical' };

  it('clamps to 0..3 and varies: noise<substance<aligned-high', () => {
    const a = computeCompoundingScore(lowNoise);
    const b = computeCompoundingScore(midSubstance);
    const c = computeCompoundingScore(highAligned);
    for (const s of [a, b, c]) { expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(3); }
    expect(a).toBe(0);
    expect(c).toBe(3);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b); // the score genuinely varies across items
  });
  it('is deterministic (same input → same score) and never throws on junk', () => {
    expect(computeCompoundingScore(highAligned)).toBe(computeCompoundingScore(highAligned));
    expect(() => computeCompoundingScore(null)).not.toThrow();
    expect(computeCompoundingScore(undefined)).toBe(0);
  });
  it('a promote/convert verdict is the strongest value signal', () => {
    const item = { title: 'plain', description: 'a plain description long enough to be substantive xxxxxxxxxx', normalized_priority: 'low' };
    expect(computeCompoundingScore(item, { verdict: { promote: true } })).toBeGreaterThan(computeCompoundingScore(item, { verdict: {} }));
  });
});

describe('estateAlreadyDrained — the idempotency marker (FR-3: no double-disposition)', () => {
  it('is TRUE only when raw_data carries the ledger back-pointer', () => {
    expect(estateAlreadyDrained({ raw_data: { conversion_ledger_id: 'abc' } })).toBe(true);
    expect(estateAlreadyDrained({ raw_data: { other: 1 } })).toBe(false);
    expect(estateAlreadyDrained({ raw_data: null })).toBe(false);
    expect(estateAlreadyDrained({})).toBe(false);
    expect(estateAlreadyDrained(null)).toBe(false);
  });
  it('does NOT treat the table-own status=processed as drained (that marker is the back-pointer)', () => {
    // a row processed by its enrichment pipeline but never drained into the ledger is NOT drained
    expect(estateAlreadyDrained({ status: 'processed', raw_data: {} })).toBe(false);
  });
});

describe('classifyEstateItem — FR-2 vocabulary from the reused verdict', () => {
  it('maps promote→improvement-candidate, declined→drop, dup/covered→already-covered, else→needs-human', () => {
    expect(classifyEstateItem({ promote: true })).toBe('improvement-candidate');
    expect(classifyEstateItem({ disposition: 'declined' })).toBe('drop');
    expect(classifyEstateItem({ disposition: 'duplicate' })).toBe('already-covered');
    expect(classifyEstateItem({ disposition: 'already_covered' })).toBe('already-covered');
    expect(classifyEstateItem({})).toBe('needs-human');
  });
});

describe('buildEstateMarkOff — raw_data-only back-pointer (does NOT touch the status column)', () => {
  const base = { _rawData: { keep: 1 } };
  it('writes ONLY raw_data — never status/processed_at (those columns are owned by the enrichment pipelines)', () => {
    // the source-table status='pending'→'processed' transition gates the claude_code/youtube/todoist
    // enrichment pipelines; the drain must NOT write it or it would starve those pipelines.
    const u = buildEstateMarkOff(base, 'L1', 2, 'improvement-candidate');
    expect(Object.keys(u)).toEqual(['raw_data']);
    expect(u).not.toHaveProperty('status');
    expect(u).not.toHaveProperty('processed_at');
  });
  it('writes the back-pointer + score + classification into raw_data and preserves existing keys', () => {
    const u = buildEstateMarkOff(base, 'LEDGER-9', 3, 'improvement-candidate');
    expect(u.raw_data).toMatchObject({ keep: 1, conversion_ledger_id: 'LEDGER-9', compounding_score: 3, disposition_classification: 'improvement-candidate' });
  });
  it('defaults a missing classification to null (never undefined)', () => {
    const u = buildEstateMarkOff(base, 'L1', 0);
    expect(u.raw_data.disposition_classification).toBe(null);
  });
  it('is idempotent: re-building with the same args yields the same payload', () => {
    const a = buildEstateMarkOff(base, 'L', 1, 'drop');
    const b = buildEstateMarkOff(base, 'L', 1, 'drop');
    expect(a).toEqual(b);
  });
});

describe('isEstateIdeaShipped — trace-reader suppression (FR-5)', () => {
  it('flags an idea whose linked SD is completed (suppress re-proposal); not otherwise', () => {
    expect(isEstateIdeaShipped({ linked_sd_key: 'SD-X', linked_sd_status: 'completed' })).toBe(true);
    expect(isEstateIdeaShipped({ linked_sd_key: 'SD-X', linked_sd_status: 'in_progress' })).toBe(false);
    expect(isEstateIdeaShipped({ linked_sd_key: null, linked_sd_status: null })).toBe(false); // unlinked candidate is proposable
    expect(isEstateIdeaShipped(null)).toBe(false);
  });
});

describe('todoistPriorityToText', () => {
  it('maps Todoist 4..1 (urgent..normal) to critical/high/medium/low', () => {
    expect(todoistPriorityToText(4)).toBe('critical');
    expect(todoistPriorityToText(3)).toBe('high');
    expect(todoistPriorityToText(2)).toBe('medium');
    expect(todoistPriorityToText(1)).toBe('low');
    expect(todoistPriorityToText(null)).toBe('low');
  });
});

describe('isToolChangelogIntakeRow — exclude tool changelogs from the idea estate (SD-REFILL-00SLQCLH)', () => {
  it('flags an eva_claude_code_intake row that carries a github_release_id (a release changelog)', () => {
    expect(isToolChangelogIntakeRow({ title: 'v2.1.123', github_release_id: 188044299 })).toBe(true);
    expect(isToolChangelogIntakeRow({ github_release_id: '188044299' })).toBe(true);
  });

  it('does NOT flag a genuine idea row (no github_release_id)', () => {
    expect(isToolChangelogIntakeRow({ title: 'Add a fleet dashboard', github_release_id: null })).toBe(false);
    expect(isToolChangelogIntakeRow({ title: 'Improve sourcing dedup' })).toBe(false);
  });

  it('is total on odd input', () => {
    expect(isToolChangelogIntakeRow(null)).toBe(false);
    expect(isToolChangelogIntakeRow(undefined)).toBe(false);
    expect(isToolChangelogIntakeRow({})).toBe(false);
  });
});
