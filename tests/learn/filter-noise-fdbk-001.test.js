import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  filterPatternsForLearning,
  checkEmptyProvenSolutions,
  extractFingerprintStem,
  emitSuppressionLog,
  REJECT_REASONS,
} from '../../scripts/modules/learning/filter.mjs';

// SD-FDBK-ENH-LEARN-AUTO-APPROVE-001 (FR-2..FR-6) — extends the noise filter
// chain with checkEmptyProvenSolutions (FR-2), handoff_failure category
// requirement (FR-3), fingerprint-stem dedup pre-pass (FR-4), structured
// suppression log (FR-5), and the LEARN-139 fixture replay golden test (FR-6).

const SD_X = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
const SD_Y = 'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy';
const SD_Z = 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz';

const baseline = (overrides = {}) => ({
  pattern_id: 'PAT-FDBK-001',
  source: 'retrospective',
  assigned_sd_id: null,
  dedup_fingerprint: '11223344aabbccdd00112233aabbccdd',
  metadata: {},
  category: 'auto_rca',
  occurrence_count: 5,
  proven_solutions: [{ title: 'Some proven solution', source_sd: 'SD-X' }],
  related_sub_agents: ['VALIDATION'],
  first_seen_sd_id: SD_X,
  last_seen_sd_id: SD_Y,
  updated_at: '2026-05-01T00:00:00Z',
  ...overrides,
});

const captureWriter = () => {
  const lines = [];
  return { lines, write: (s) => { lines.push(s); return true; } };
};

describe('FR-2: checkEmptyProvenSolutions', () => {
  it('rejects pattern with empty proven_solutions + null related_sub_agents + occurrence_count below default threshold (3)', () => {
    const writer = captureWriter();
    const p = baseline({ proven_solutions: [], related_sub_agents: null, occurrence_count: 2 });
    const result = filterPatternsForLearning([p], { suppressionWriter: writer });
    expect(result.kept).toHaveLength(0);
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.EMPTY_PROVEN_LOW_OCCURRENCE);
  });

  it('rejects pattern with empty proven_solutions + empty array related_sub_agents + occurrence_count=1', () => {
    const result = filterPatternsForLearning(
      [baseline({ proven_solutions: [], related_sub_agents: [], occurrence_count: 1 })],
      { suppressionWriter: null },
    );
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.EMPTY_PROVEN_LOW_OCCURRENCE);
  });

  it('admits pattern with proven_solutions.length>=1 even at occurrence_count=1', () => {
    const result = filterPatternsForLearning(
      [baseline({ proven_solutions: [{ title: 'X' }], related_sub_agents: null, occurrence_count: 1 })],
      { suppressionWriter: null },
    );
    expect(result.kept).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it('admits pattern with empty proven_solutions but related_sub_agents present', () => {
    const result = filterPatternsForLearning(
      [baseline({ proven_solutions: [], related_sub_agents: ['DESIGN'], occurrence_count: 1 })],
      { suppressionWriter: null },
    );
    expect(result.kept).toHaveLength(1);
  });

  it('admits pattern with empty proven_solutions/related_sub_agents but occurrence_count >= threshold', () => {
    const result = filterPatternsForLearning(
      [baseline({ proven_solutions: [], related_sub_agents: null, occurrence_count: 3 })],
      { suppressionWriter: null },
    );
    expect(result.kept).toHaveLength(1);
  });

  it('honors options.minOccurrenceForUnproven override (raises bar)', () => {
    const result = filterPatternsForLearning(
      [baseline({ proven_solutions: [], related_sub_agents: null, occurrence_count: 8 })],
      { suppressionWriter: null, minOccurrenceForUnproven: 10 },
    );
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.EMPTY_PROVEN_LOW_OCCURRENCE);
  });

  it('honors LEO_LEARN_NOISE_MIN_OCCURRENCE env override when option absent', () => {
    const original = process.env.LEO_LEARN_NOISE_MIN_OCCURRENCE;
    process.env.LEO_LEARN_NOISE_MIN_OCCURRENCE = '10';
    try {
      const result = filterPatternsForLearning(
        [baseline({ proven_solutions: [], related_sub_agents: null, occurrence_count: 5 })],
        { suppressionWriter: null },
      );
      expect(result.rejected[0].reason).toBe(REJECT_REASONS.EMPTY_PROVEN_LOW_OCCURRENCE);
    } finally {
      if (original === undefined) delete process.env.LEO_LEARN_NOISE_MIN_OCCURRENCE;
      else process.env.LEO_LEARN_NOISE_MIN_OCCURRENCE = original;
    }
  });
});

describe('FR-3: handoff_failure category extension', () => {
  it('rejects category=handoff_failure single-SD pattern with reason HANDOFF_FAILURE_NEEDS_MULTI_SD', () => {
    const result = filterPatternsForLearning(
      [baseline({ category: 'handoff_failure', first_seen_sd_id: SD_X, last_seen_sd_id: SD_X, proven_solutions: [{ title: 'P' }], occurrence_count: 5 })],
      { suppressionWriter: null },
    );
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.HANDOFF_FAILURE_NEEDS_MULTI_SD);
  });

  it('admits category=handoff_failure when first_seen_sd_id != last_seen_sd_id', () => {
    const result = filterPatternsForLearning(
      [baseline({ category: 'handoff_failure', first_seen_sd_id: SD_X, last_seen_sd_id: SD_Y, proven_solutions: [{ title: 'P' }], occurrence_count: 5 })],
      { suppressionWriter: null },
    );
    expect(result.kept).toHaveLength(1);
  });

  it('preserves existing FR-8 behaviour: session_retrospective single-SD still rejected with SESSION_RETRO_NEEDS_MULTI_SD', () => {
    const result = filterPatternsForLearning(
      [baseline({ category: 'session_retrospective', first_seen_sd_id: SD_X, last_seen_sd_id: SD_X, proven_solutions: [{ title: 'P' }], occurrence_count: 5 })],
      { suppressionWriter: null },
    );
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.SESSION_RETRO_NEEDS_MULTI_SD);
  });

  it('honors options.retroLikeCategories override (adds new category to multi-SD requirement)', () => {
    const result = filterPatternsForLearning(
      [baseline({ category: 'custom_retry_loop', first_seen_sd_id: SD_X, last_seen_sd_id: SD_X, proven_solutions: [{ title: 'P' }], occurrence_count: 5 })],
      { suppressionWriter: null, retroLikeCategories: ['session_retrospective', 'handoff_failure', 'custom_retry_loop'] },
    );
    // custom_retry_loop falls through suppressionReasonCode default to fr8 (session retro), but the underlying enum returns SESSION_RETRO_NEEDS_MULTI_SD by default for non-handoff_failure cats.
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.SESSION_RETRO_NEEDS_MULTI_SD);
  });
});

describe('FR-4: extractFingerprintStem + intra-batch dedup', () => {
  it('extractFingerprintStem returns first 8 chars from dedup_fingerprint', () => {
    expect(extractFingerprintStem({ dedup_fingerprint: '211b3c47abcdef0123456789' })).toBe('211b3c47');
  });

  it('extractFingerprintStem returns first 8 chars from fallback fingerprint column', () => {
    expect(extractFingerprintStem({ fingerprint: '211b3c47000000' })).toBe('211b3c47');
  });

  it('extractFingerprintStem returns null when fingerprint is missing or too short', () => {
    expect(extractFingerprintStem({})).toBeNull();
    expect(extractFingerprintStem({ dedup_fingerprint: '1234' })).toBeNull();
  });

  it('collapses two patterns with same stem + same first_seen_sd_id (winner = highest occurrence_count)', () => {
    const lower = baseline({ pattern_id: 'PAT-A', dedup_fingerprint: '211b3c47ffff', occurrence_count: 3, first_seen_sd_id: SD_X, last_seen_sd_id: SD_X, proven_solutions: [{ title: 'P' }], category: 'auto_rca' });
    const higher = baseline({ pattern_id: 'PAT-B', dedup_fingerprint: '211b3c47aaaa', occurrence_count: 7, first_seen_sd_id: SD_X, last_seen_sd_id: SD_X, proven_solutions: [{ title: 'P' }], category: 'auto_rca' });
    const result = filterPatternsForLearning(
      [lower, higher],
      { suppressionWriter: null, sourceSdStatusMap: new Map([[SD_X, 'in_progress']]) },
    );
    // PAT-B wins on count; PAT-A is dropped via FINGERPRINT_STEM_DUP. PAT-B may then be rejected by FR-7 (single-SD stale-open) IF the timestamp is old; in this fixture updated_at is 2026-05-01 — within the window depending on nowMs, so we just assert the dedup outcome here.
    const dropped = result.rejected.find(r => r.reason === REJECT_REASONS.FINGERPRINT_STEM_DUP);
    expect(dropped).toBeDefined();
    expect(dropped.pattern.pattern_id).toBe('PAT-A');
    expect(dropped.details.kept_pattern_id).toBe('PAT-B');
  });

  it('keeps both when same stem + DIFFERENT first_seen_sd_id', () => {
    const a = baseline({ pattern_id: 'PAT-X', dedup_fingerprint: '211b3c47ffff', first_seen_sd_id: SD_X, last_seen_sd_id: SD_Y, occurrence_count: 5 });
    const b = baseline({ pattern_id: 'PAT-Y', dedup_fingerprint: '211b3c47aaaa', first_seen_sd_id: SD_Z, last_seen_sd_id: SD_Y, occurrence_count: 5 });
    const result = filterPatternsForLearning([a, b], { suppressionWriter: null });
    const dedupRejections = result.rejected.filter(r => r.reason === REJECT_REASONS.FINGERPRINT_STEM_DUP);
    expect(dedupRejections).toHaveLength(0);
    expect(result.kept).toHaveLength(2);
  });

  it('tiebreaker: pattern_id ascending when occurrence_count equal', () => {
    const a = baseline({ pattern_id: 'PAT-AAA', dedup_fingerprint: '211b3c47ffff', first_seen_sd_id: SD_X, last_seen_sd_id: SD_X, occurrence_count: 5, proven_solutions: [{ title: 'P' }] });
    const b = baseline({ pattern_id: 'PAT-ZZZ', dedup_fingerprint: '211b3c47aaaa', first_seen_sd_id: SD_X, last_seen_sd_id: SD_X, occurrence_count: 5, proven_solutions: [{ title: 'P' }] });
    const result = filterPatternsForLearning([b, a], {
      suppressionWriter: null,
      sourceSdStatusMap: new Map([[SD_X, 'in_progress']]),
      // disable FR-7 by setting age threshold high so we just test dedup tiebreaker
      staleOpenAgeDays: 365,
    });
    const dropped = result.rejected.find(r => r.reason === REJECT_REASONS.FINGERPRINT_STEM_DUP);
    expect(dropped.pattern.pattern_id).toBe('PAT-ZZZ');
    expect(dropped.details.kept_pattern_id).toBe('PAT-AAA');
  });

  it('passes patterns through unchanged when fingerprint is null (no stem)', () => {
    const result = filterPatternsForLearning(
      [baseline({ pattern_id: 'PAT-NS-1', dedup_fingerprint: null, first_seen_sd_id: SD_X, last_seen_sd_id: SD_Y })],
      { suppressionWriter: null },
    );
    expect(result.kept).toHaveLength(1);
  });
});

describe('FR-5: emitSuppressionLog + structured suppression', () => {
  it('emits a single-line JSON record per suppression with required fields', () => {
    const writer = captureWriter();
    const p = baseline({ proven_solutions: [], related_sub_agents: null, occurrence_count: 1 });
    filterPatternsForLearning([p], { suppressionWriter: writer });
    expect(writer.lines).toHaveLength(1);
    const obj = JSON.parse(writer.lines[0]);
    expect(obj.event).toBe('learn.filter.suppressed');
    expect(obj.pattern_id).toBe('PAT-FDBK-001');
    expect(obj.reason).toBe('empty_proven');
    expect(typeof obj.ts).toBe('string');
  });

  it('emits closed-enum reason codes for every vector', () => {
    const writer = captureWriter();
    emitSuppressionLog({ pattern_id: 'P1' }, REJECT_REASONS.SINGLE_SD_CLOSED_SOURCE, {}, writer);
    emitSuppressionLog({ pattern_id: 'P2' }, REJECT_REASONS.SINGLE_SD_STALE_OPEN_SOURCE, {}, writer);
    emitSuppressionLog({ pattern_id: 'P3' }, REJECT_REASONS.SESSION_RETRO_NEEDS_MULTI_SD, {}, writer);
    emitSuppressionLog({ pattern_id: 'P4' }, REJECT_REASONS.HANDOFF_FAILURE_NEEDS_MULTI_SD, {}, writer);
    emitSuppressionLog({ pattern_id: 'P5' }, REJECT_REASONS.EMPTY_PROVEN_LOW_OCCURRENCE, {}, writer);
    emitSuppressionLog({ pattern_id: 'P6' }, REJECT_REASONS.FINGERPRINT_STEM_DUP, {}, writer);
    const codes = writer.lines.map(l => JSON.parse(l).reason);
    expect(codes).toEqual([
      'fr6',
      'fr7',
      'fr8',
      'handoff_failure_single_sd',
      'empty_proven',
      'fingerprint_stem_dup',
    ]);
  });

  it('does not emit when suppressionWriter=null', () => {
    const result = filterPatternsForLearning(
      [baseline({ proven_solutions: [], related_sub_agents: null, occurrence_count: 1 })],
      { suppressionWriter: null },
    );
    expect(result.rejected).toHaveLength(1); // suppression still happens
    // (No writer to assert against — coverage is that the test doesn't crash and the run produces no stdout side effects.)
  });

  it('survives writer.write throwing (never breaks pipeline)', () => {
    const throwingWriter = { write: () => { throw new Error('boom'); } };
    expect(() => emitSuppressionLog({ pattern_id: 'P' }, REJECT_REASONS.LOW_SIGNAL_SOURCE, {}, throwingWriter)).not.toThrow();
  });
});

describe('FR-6: LEARN-139 fixture replay (golden test)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const fixturePath = join(here, '..', 'fixtures', 'learn-139-bundle.json');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

  it('admits 0 patterns (full suppression of the LEARN-139 cancellation bundle)', () => {
    const writer = captureWriter();
    const sourceSdStatusMap = new Map(Object.entries(fixture.source_sd_status_map));
    const result = filterPatternsForLearning(fixture.patterns, {
      suppressionWriter: writer,
      sourceSdStatusMap,
    });
    expect(result.kept).toHaveLength(0);
    expect(result.rejected).toHaveLength(fixture._meta.expected_suppressed);
  });

  it('produces suppression lines covering at least fr6, empty_proven, and fingerprint_stem_dup', () => {
    const writer = captureWriter();
    const sourceSdStatusMap = new Map(Object.entries(fixture.source_sd_status_map));
    filterPatternsForLearning(fixture.patterns, { suppressionWriter: writer, sourceSdStatusMap });
    const reasons = new Set(writer.lines.map(l => JSON.parse(l).reason));
    for (const expected of fixture._meta.expected_reason_codes_at_least_once) {
      expect(reasons.has(expected)).toBe(true);
    }
  });

  it('every suppression line has a non-null pattern_id', () => {
    const writer = captureWriter();
    const sourceSdStatusMap = new Map(Object.entries(fixture.source_sd_status_map));
    filterPatternsForLearning(fixture.patterns, { suppressionWriter: writer, sourceSdStatusMap });
    for (const line of writer.lines) {
      const obj = JSON.parse(line);
      expect(obj.pattern_id).toBeTruthy();
    }
  });
});
