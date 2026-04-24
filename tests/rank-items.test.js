/**
 * rank-items tests — Phase 1 (SDs only; QF ranking added in Phase 3).
 * SD: SD-LEO-INFRA-UNIFY-QUICK-FIX-001
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  rankItems,
  SEVERITY_TO_RANK,
  qfUrgencyBand,
  qfTrack,
} from '../scripts/modules/sd-next/rank-items.js';

/** Minimal SD factory so each test only spells out what it cares about. */
function sd(overrides = {}) {
  return {
    id: 'uuid-default',
    sd_key: 'SD-DEFAULT-001',
    status: 'draft',
    metadata: {},
    dependencies: [],
    ...overrides,
  };
}

describe('rankItems — Phase 1 baseline parity', () => {
  it('excludes completed and cancelled SDs', () => {
    const result = rankItems([
      sd({ id: 'u1', sd_key: 'SD-A-001', status: 'completed' }),
      sd({ id: 'u2', sd_key: 'SD-A-002', status: 'cancelled' }),
      sd({ id: 'u3', sd_key: 'SD-A-003', status: 'draft', category: 'infrastructure' }),
    ]);
    assert.equal(result.tracks.A.length, 1);
    assert.equal(result.tracks.A[0].sd_key, 'SD-A-003');
  });

  it('derives track from baseline, then metadata.execution_track, then category, then STANDALONE', () => {
    const baselineMap = new Map([
      ['SD-BL-001', { sd_id: 'SD-BL-001', track: 'C', sequence_rank: 10 }],
    ]);
    const result = rankItems([
      sd({ sd_key: 'SD-BL-001', status: 'draft' }),
      sd({ sd_key: 'SD-META-001', metadata: { execution_track: 'Feature' } }),
      sd({ sd_key: 'SD-CAT-001', category: 'quality' }),
      sd({ sd_key: 'SD-NONE-001' }),
    ], { baselineItemsMap: baselineMap });

    assert.equal(result.tracks.C.find(x => x.sd_key === 'SD-BL-001')?.sd_key, 'SD-BL-001', 'baseline wins');
    assert.equal(result.tracks.B[0].sd_key, 'SD-META-001', 'metadata wins over category');
    assert.equal(result.tracks.C.find(x => x.sd_key === 'SD-CAT-001')?.sd_key, 'SD-CAT-001', 'category-based');
    assert.equal(result.tracks.STANDALONE[0].sd_key, 'SD-NONE-001', 'no signal → STANDALONE');
  });

  it('applies vision gap weight to composite_rank', () => {
    const baselineMap = new Map([
      ['SD-HIGH-VISION', { sd_id: 'SD-HIGH-VISION', sequence_rank: 100 }],
      ['SD-LOW-VISION',  { sd_id: 'SD-LOW-VISION',  sequence_rank: 100 }],
    ]);
    const result = rankItems([
      sd({ sd_key: 'SD-HIGH-VISION', category: 'infrastructure', vision_origin_score_id: 'v1', vision_score: 90 }),
      sd({ sd_key: 'SD-LOW-VISION',  category: 'infrastructure', vision_origin_score_id: 'v2', vision_score: 10 }),
    ], { baselineItemsMap: baselineMap });

    const [first, second] = result.tracks.A;
    // LOW vision → larger gap_weight → smaller composite_rank → higher priority
    assert.ok(first.composite_rank < second.composite_rank,
      'low-vision SD ranks first (smaller composite_rank because gap_weight grows the denominator)');
    assert.equal(first.sd_key, 'SD-LOW-VISION', 'low-vision gap closes first');
    assert.equal(second.sd_key, 'SD-HIGH-VISION');
  });

  it('blends OKR score — higher OKR pulls composite_rank lower (higher priority)', () => {
    const baselineMap = new Map([
      ['SD-OKR-HIGH', { sd_id: 'SD-OKR-HIGH', sequence_rank: 500 }],
      ['SD-OKR-NONE', { sd_id: 'SD-OKR-NONE', sequence_rank: 500 }],
    ]);
    const okrScoreMap = new Map([['uuid-high', 90]]);
    const result = rankItems([
      sd({ id: 'uuid-high', sd_key: 'SD-OKR-HIGH', category: 'infrastructure' }),
      sd({ id: 'uuid-none', sd_key: 'SD-OKR-NONE', category: 'infrastructure' }),
    ], { baselineItemsMap: baselineMap, okrScoreMap });

    const [first] = result.tracks.A;
    assert.equal(first.sd_key, 'SD-OKR-HIGH', 'OKR-aligned SD ranks first');
    // With default 0.30 blend: 500 - (90 * 0.30) = 473
    assert.equal(first.composite_rank, 500 - (90 * 0.30));
    assert.equal(first.okr_score, 90);
  });

  it('applies policy boost multiplier when venture_id has a policy weight', () => {
    const baselineMap = new Map([
      ['SD-CASH', { sd_id: 'SD-CASH', sequence_rank: 300 }],
      ['SD-MOON', { sd_id: 'SD-MOON', sequence_rank: 300 }],
    ]);
    const policyBoostMap = new Map([
      ['venture-cash', 0.4], // heavy boost
      ['venture-moon', 0.9], // small boost
    ]);
    const result = rankItems([
      sd({ sd_key: 'SD-CASH', category: 'infrastructure', venture_id: 'venture-cash' }),
      sd({ sd_key: 'SD-MOON', category: 'infrastructure', venture_id: 'venture-moon' }),
    ], { baselineItemsMap: baselineMap, policyBoostMap });

    const [first, second] = result.tracks.A;
    assert.equal(first.sd_key, 'SD-CASH', 'more-boosted venture ranks first');
    assert.equal(first.composite_rank, 300 * 0.4);
    assert.equal(second.composite_rank, 300 * 0.9);
  });

  it('urgency band dominates composite_rank (P0 before everything else)', () => {
    const baselineMap = new Map([
      ['SD-P0-BIG-RANK', { sd_id: 'SD-P0-BIG-RANK', sequence_rank: 9000 }],
      ['SD-P3-LOW-RANK', { sd_id: 'SD-P3-LOW-RANK', sequence_rank: 10 }],
    ]);
    const result = rankItems([
      sd({ sd_key: 'SD-P0-BIG-RANK', category: 'infrastructure', metadata: { urgency_band: 'P0' } }),
      sd({ sd_key: 'SD-P3-LOW-RANK', category: 'infrastructure', metadata: { urgency_band: 'P3' } }),
    ], { baselineItemsMap: baselineMap });

    assert.equal(result.tracks.A[0].sd_key, 'SD-P0-BIG-RANK');
    assert.equal(result.tracks.A[1].sd_key, 'SD-P3-LOW-RANK');
  });

  it('sequence_rank defaults to 9999 when SD has no baseline entry', () => {
    const result = rankItems([
      sd({ sd_key: 'SD-ORPHAN-001', category: 'infrastructure', status: 'in_progress' }),
    ]);
    assert.equal(result.tracks.A[0].sequence_rank, 9999);
    assert.equal(result.orphanBaseline.length, 1, 'orphan warning emitted for non-draft missing baseline');
    assert.equal(result.orphanBaseline[0].sd_key, 'SD-ORPHAN-001');
  });

  it('does not emit orphan warning for draft SDs missing from baseline', () => {
    const result = rankItems([
      sd({ sd_key: 'SD-DRAFT-001', category: 'infrastructure', status: 'draft' }),
    ]);
    assert.equal(result.orphanBaseline.length, 0);
  });

  it('collects misplacedDeps when dependency info lives in metadata but column is empty', () => {
    const result = rankItems([
      sd({
        sd_key: 'SD-MISPLACED-001',
        category: 'infrastructure',
        dependencies: [],
        metadata: { depends_on: ['SD-UPSTREAM-001'] },
      }),
    ]);
    assert.equal(result.misplacedDeps.length, 1);
    assert.equal(result.misplacedDeps[0].sd_key, 'SD-MISPLACED-001');
  });

  it('preserves baseline fields on the output item (spread before sd fields)', () => {
    const baselineMap = new Map([
      ['SD-BL-002', { sd_id: 'SD-BL-002', track: 'B', sequence_rank: 42, sprint: 'S1' }],
    ]);
    const result = rankItems([
      sd({ sd_key: 'SD-BL-002', title: 'Feature work', category: 'feature' }),
    ], { baselineItemsMap: baselineMap });

    const ranked = result.tracks.B[0];
    assert.equal(ranked.sprint, 'S1', 'baseline field carried through');
    assert.equal(ranked.title, 'Feature work', 'sd field wins on conflict');
    assert.equal(ranked.sequence_rank, 42);
  });

  it('attaches actuals from context by sd_key or id', () => {
    const actuals = { 'SD-ACT-001': { effort: 5 } };
    const result = rankItems([
      sd({ sd_key: 'SD-ACT-001', category: 'infrastructure' }),
    ], { actuals });
    assert.deepEqual(result.tracks.A[0].actual, { effort: 5 });
  });

  it('sorts within track: band → score (desc) → composite_rank (asc)', () => {
    const baselineMap = new Map([
      ['SD-P1-A', { sd_id: 'SD-P1-A', sequence_rank: 200 }],
      ['SD-P1-B', { sd_id: 'SD-P1-B', sequence_rank: 100 }],
      ['SD-P1-C', { sd_id: 'SD-P1-C', sequence_rank: 100 }],
    ]);
    const result = rankItems([
      sd({ sd_key: 'SD-P1-A', category: 'infrastructure', metadata: { urgency_band: 'P1', urgency_score: 50 } }),
      sd({ sd_key: 'SD-P1-B', category: 'infrastructure', metadata: { urgency_band: 'P1', urgency_score: 70 } }),
      sd({ sd_key: 'SD-P1-C', category: 'infrastructure', metadata: { urgency_band: 'P1', urgency_score: 70 } }),
    ], { baselineItemsMap: baselineMap });

    // P1-B and P1-C share higher urgency_score than P1-A; within that, composite_rank breaks the tie.
    assert.equal(result.tracks.A[0].sd_key, 'SD-P1-B', 'first: highest urgency_score, tied composite_rank');
    assert.equal(result.tracks.A[1].sd_key, 'SD-P1-C');
    assert.equal(result.tracks.A[2].sd_key, 'SD-P1-A', 'last: lower urgency_score');
  });
});

describe('rankItems — Phase 3 Quick Fix interleaving', () => {
  const NOW = Date.parse('2026-04-24T12:00:00Z');
  const FRESH = '2026-04-24T11:00:00Z'; // 1 hour before NOW
  const OLD   = '2026-04-15T00:00:00Z'; // 9 days before NOW

  /**
   * Mirrors how callers should shape a QF row: the DB `type` column
   * (bug/polish/documentation) remains untouched; we set kind='qf' as the
   * rankItems discriminator alongside it.
   */
  function qf({ id = 'QF-X', severity = 'medium', type = 'bug', created_at = FRESH, branch_name = null, status = 'open', title = 'Some QF' } = {}) {
    return {
      kind: 'qf',
      id,
      title,
      severity,
      status,
      type,                // DB column — bug/polish/documentation
      created_at,
      branch_name,
    };
  }

  // --- severity / urgency helpers ---

  it('SEVERITY_TO_RANK exports match PRD-specified values', () => {
    assert.equal(SEVERITY_TO_RANK.critical, 100);
    assert.equal(SEVERITY_TO_RANK.high,     200);
    assert.equal(SEVERITY_TO_RANK.medium,   500);
    assert.equal(SEVERITY_TO_RANK.low,      1000);
  });

  it('qfUrgencyBand — critical always P0', () => {
    assert.equal(qfUrgencyBand('critical', FRESH, NOW), 'P0');
    assert.equal(qfUrgencyBand('critical', OLD,   NOW), 'P0');
  });

  it('qfUrgencyBand — medium/high aged > 7 days escalates to P0; low does not', () => {
    assert.equal(qfUrgencyBand('medium', OLD, NOW), 'P0');
    assert.equal(qfUrgencyBand('high',   OLD, NOW), 'P0');
    assert.equal(qfUrgencyBand('low',    OLD, NOW), 'P3');
  });

  it('qfUrgencyBand — fresh QFs map severity → band directly', () => {
    assert.equal(qfUrgencyBand('high',   FRESH, NOW), 'P1');
    assert.equal(qfUrgencyBand('medium', FRESH, NOW), 'P2');
    assert.equal(qfUrgencyBand('low',    FRESH, NOW), 'P3');
  });

  // --- track inference (qfTrack helper) ---

  it('qfTrack — bug/polish default to C, documentation to STANDALONE', () => {
    assert.equal(qfTrack({ type: 'bug' }),           'C');
    assert.equal(qfTrack({ type: 'polish' }),        'C');
    assert.equal(qfTrack({ type: 'documentation' }), 'STANDALONE');
    assert.equal(qfTrack({ type: 'something-new' }), 'STANDALONE');
  });

  it('qfTrack — bug/polish promoted to A when branch_name contains infra keyword', () => {
    assert.equal(qfTrack({ type: 'bug',    branch_name: 'quick-fix/QF-INFRA-REAPER' }), 'A');
    assert.equal(qfTrack({ type: 'polish', branch_name: 'quick-fix/QF-HOOK-FIX' }),    'A');
    assert.equal(qfTrack({ type: 'bug',    branch_name: 'quick-fix/QF-RANDOM' }),       'C', 'no keyword → stays C');
  });

  // --- TS-3: P0 bug QF outranks medium-priority SDs in Track C ---

  it('TS-3: P0 bug QF ranks above medium-priority SDs in Track C', () => {
    const items = [
      sd({ sd_key: 'SD-C-1', category: 'quality', metadata: { urgency_band: 'P2' } }),
      sd({ sd_key: 'SD-C-2', category: 'quality', metadata: { urgency_band: 'P2' } }),
      qf({ id: 'QF-001', severity: 'critical', type: 'bug' }),
    ];
    const { tracks } = rankItems(items, { now: NOW });
    assert.equal(tracks.C.length, 3);
    assert.equal(tracks.C[0].id, 'QF-001', 'P0 QF tops Track C');
    assert.equal(tracks.C[0].urgency_band, 'P0');
  });

  // --- TS-4: Type distribution mapping ---

  it('TS-4: bug=89 / polish=8 / documentation=6 distribution routes correctly', () => {
    const items = [
      qf({ id: 'QF-BUG',   type: 'bug' }),
      qf({ id: 'QF-POL',   type: 'polish' }),
      qf({ id: 'QF-DOC',   type: 'documentation' }),
      qf({ id: 'QF-OTHER', type: 'something-new' }),
    ];
    const { tracks } = rankItems(items, { now: NOW });
    assert.deepEqual(tracks.C.map(x => x.id).sort(), ['QF-BUG', 'QF-POL']);
    assert.deepEqual(tracks.STANDALONE.map(x => x.id).sort(), ['QF-DOC', 'QF-OTHER']);
    assert.equal(tracks.A.length, 0);
    assert.equal(tracks.B.length, 0);
  });

  // --- TS-5: Track A inference via branch heuristic ---

  it('TS-5: branch-name heuristic promotes infra QF to Track A', () => {
    const items = [
      qf({ id: 'QF-INFRA', type: 'bug', branch_name: 'quick-fix/QF-INFRA-FIX' }),
      qf({ id: 'QF-NORMAL', type: 'bug', branch_name: 'quick-fix/QF-NORMAL' }),
    ];
    const { tracks } = rankItems(items, { now: NOW });
    assert.equal(tracks.A.length, 1);
    assert.equal(tracks.A[0].id, 'QF-INFRA');
    assert.equal(tracks.C.length, 1);
    assert.equal(tracks.C[0].id, 'QF-NORMAL');
  });

  // --- Ranking semantics for mixed SD+QF fleets ---

  it('Mixed fleet: sort within track treats SDs and QFs uniformly', () => {
    const items = [
      sd({ sd_key: 'SD-P2', category: 'quality', metadata: { urgency_band: 'P2' } }),
      qf({ id: 'QF-HI',    severity: 'high', type: 'bug' }),   // P1 urgency
      qf({ id: 'QF-LO',    severity: 'low',  type: 'bug' }),   // P3 urgency
    ];
    const { tracks } = rankItems(items, { now: NOW });
    assert.deepEqual(
      tracks.C.map(x => x.sd_key || x.id),
      ['QF-HI', 'SD-P2', 'QF-LO'],
      'P1 QF < P2 SD < P3 QF by urgency_numeric'
    );
  });

  it('rankQF discriminator: kind="qf" routes into QF path, not SD path', () => {
    const items = [
      { kind: 'qf', id: 'QF-A', type: 'bug', severity: 'high', status: 'open', created_at: FRESH },
      // An SD with id that looks like a QF shouldn't be mistaken
      sd({ id: 'QF-LOOKALIKE', sd_key: 'SD-LOOKALIKE', category: 'quality' }),
    ];
    const { tracks } = rankItems(items, { now: NOW });
    assert.equal(tracks.C.length, 2);
    const qfRanked = tracks.C.find(x => x.id === 'QF-A');
    assert.equal(qfRanked.kind, 'qf');
    const sdRanked = tracks.C.find(x => x.sd_key === 'SD-LOOKALIKE');
    assert.equal(sdRanked.kind, 'sd');
  });

  it('QF with non-open status is filtered out', () => {
    const items = [
      qf({ id: 'QF-COMPLETED', status: 'completed' }),
      qf({ id: 'QF-OPEN',      status: 'open' }),
    ];
    const { tracks } = rankItems(items, { now: NOW });
    const allIds = [...tracks.A, ...tracks.B, ...tracks.C, ...tracks.STANDALONE].map(x => x.id);
    assert.deepEqual(allIds, ['QF-OPEN']);
  });
});
