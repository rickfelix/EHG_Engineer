/**
 * rank-items tests — Phase 1 (SDs only; QF ranking added in Phase 3).
 * SD: SD-LEO-INFRA-UNIFY-QUICK-FIX-001
 *
 * SD-LEO-INFRA-SINGLE-ESCALATION-WRITER-001 (FR-6, PLAN-testing BLOCKER 2): converted from
 * node:test to vitest. This file WAS written against node:test (`node --test` passed 28/28)
 * and WAS quarantined from vitest ("No test suite found" -- node:test suites are invisible to
 * vitest's runner) with no other npm script or CI workflow running it under node --test, so
 * all 28 pre-existing assertions -- including the escalated-exclusion regression test this SD
 * depends on for TS-7 -- were CI-invisible. Converted to vitest (this repo's dominant test
 * runner) to close that gap as a documented side effect of this SD (tracked separately as
 * SD-REFILL-00CO4E8Q); its quarantine-manifest entry was removed in the same change. Every
 * assertion below is a mechanical node:assert/strict -> vitest expect() translation with no
 * behavior change, plus one new fixture case for the needs_sd shape (FR-5/TS-7).
 * NOTE: tests/unit/quarantine-classify-node-test.test.js used to cite THIS file as its live
 * node:test fixture; repointed to tests/review-gate.test.js (a still-genuine node:test file)
 * in the same commit as this conversion.
 */
import { describe, it, expect } from 'vitest';
import {
  rankItems,
  SEVERITY_TO_RANK,
  qfUrgencyBand,
  qfTrack,
  isVentureBuildSD,
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
    expect(result.tracks.A.length).toBe(1);
    expect(result.tracks.A[0].sd_key).toBe('SD-A-003');
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

    expect(result.tracks.C.find(x => x.sd_key === 'SD-BL-001')?.sd_key).toBe('SD-BL-001'); // baseline wins
    expect(result.tracks.B[0].sd_key).toBe('SD-META-001'); // metadata wins over category
    expect(result.tracks.C.find(x => x.sd_key === 'SD-CAT-001')?.sd_key).toBe('SD-CAT-001'); // category-based
    expect(result.tracks.STANDALONE[0].sd_key).toBe('SD-NONE-001'); // no signal → STANDALONE
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
    expect(first.composite_rank < second.composite_rank).toBe(true);
    expect(first.sd_key).toBe('SD-LOW-VISION'); // low-vision gap closes first
    expect(second.sd_key).toBe('SD-HIGH-VISION');
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
    expect(first.sd_key).toBe('SD-OKR-HIGH'); // OKR-aligned SD ranks first
    // With default 0.30 blend: 500 - (90 * 0.30) = 473
    expect(first.composite_rank).toBe(500 - (90 * 0.30));
    expect(first.okr_score).toBe(90);
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
    expect(first.sd_key).toBe('SD-CASH'); // more-boosted venture ranks first
    expect(first.composite_rank).toBe(300 * 0.4);
    expect(second.composite_rank).toBe(300 * 0.9);
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

    expect(result.tracks.A[0].sd_key).toBe('SD-P0-BIG-RANK');
    expect(result.tracks.A[1].sd_key).toBe('SD-P3-LOW-RANK');
  });

  it('sequence_rank defaults to 9999 when SD has no baseline entry', () => {
    const result = rankItems([
      sd({ sd_key: 'SD-ORPHAN-001', category: 'infrastructure', status: 'in_progress' }),
    ]);
    expect(result.tracks.A[0].sequence_rank).toBe(9999);
    expect(result.orphanBaseline.length).toBe(1); // orphan warning emitted for non-draft missing baseline
    expect(result.orphanBaseline[0].sd_key).toBe('SD-ORPHAN-001');
  });

  it('does not emit orphan warning for draft SDs missing from baseline', () => {
    const result = rankItems([
      sd({ sd_key: 'SD-DRAFT-001', category: 'infrastructure', status: 'draft' }),
    ]);
    expect(result.orphanBaseline.length).toBe(0);
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
    expect(result.misplacedDeps.length).toBe(1);
    expect(result.misplacedDeps[0].sd_key).toBe('SD-MISPLACED-001');
  });

  it('preserves baseline fields on the output item (spread before sd fields)', () => {
    const baselineMap = new Map([
      ['SD-BL-002', { sd_id: 'SD-BL-002', track: 'B', sequence_rank: 42, sprint: 'S1' }],
    ]);
    const result = rankItems([
      sd({ sd_key: 'SD-BL-002', title: 'Feature work', category: 'feature' }),
    ], { baselineItemsMap: baselineMap });

    const ranked = result.tracks.B[0];
    expect(ranked.sprint).toBe('S1'); // baseline field carried through
    expect(ranked.title).toBe('Feature work'); // sd field wins on conflict
    expect(ranked.sequence_rank).toBe(42);
  });

  it('attaches actuals from context by sd_key or id', () => {
    const actuals = { 'SD-ACT-001': { effort: 5 } };
    const result = rankItems([
      sd({ sd_key: 'SD-ACT-001', category: 'infrastructure' }),
    ], { actuals });
    expect(result.tracks.A[0].actual).toEqual({ effort: 5 });
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
    expect(result.tracks.A[0].sd_key).toBe('SD-P1-B'); // first: highest urgency_score, tied composite_rank
    expect(result.tracks.A[1].sd_key).toBe('SD-P1-C');
    expect(result.tracks.A[2].sd_key).toBe('SD-P1-A'); // last: lower urgency_score
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
  function qf({ id = 'QF-X', severity = 'medium', type = 'bug', created_at = FRESH, branch_name = null, status = 'open', title = 'Some QF', routing_tier = null, escalated_to_sd_id = null } = {}) {
    return {
      kind: 'qf',
      id,
      title,
      severity,
      status,
      type,                // DB column — bug/polish/documentation
      created_at,
      branch_name,
      routing_tier,
      escalated_to_sd_id,
    };
  }

  // --- severity / urgency helpers ---

  it('SEVERITY_TO_RANK exports match PRD-specified values', () => {
    expect(SEVERITY_TO_RANK.critical).toBe(100);
    expect(SEVERITY_TO_RANK.high).toBe(200);
    expect(SEVERITY_TO_RANK.medium).toBe(500);
    expect(SEVERITY_TO_RANK.low).toBe(1000);
  });

  it('qfUrgencyBand — critical always P0', () => {
    expect(qfUrgencyBand('critical', FRESH, NOW)).toBe('P0');
    expect(qfUrgencyBand('critical', OLD, NOW)).toBe('P0');
  });

  it('qfUrgencyBand — medium/high aged > 7 days escalates to P0; low does not', () => {
    expect(qfUrgencyBand('medium', OLD, NOW)).toBe('P0');
    expect(qfUrgencyBand('high', OLD, NOW)).toBe('P0');
    expect(qfUrgencyBand('low', OLD, NOW)).toBe('P3');
  });

  it('qfUrgencyBand — fresh QFs map severity → band directly', () => {
    expect(qfUrgencyBand('high', FRESH, NOW)).toBe('P1');
    expect(qfUrgencyBand('medium', FRESH, NOW)).toBe('P2');
    expect(qfUrgencyBand('low', FRESH, NOW)).toBe('P3');
  });

  // --- track inference (qfTrack helper) ---

  it('qfTrack — bug/polish default to C, documentation to STANDALONE', () => {
    expect(qfTrack({ type: 'bug' })).toBe('C');
    expect(qfTrack({ type: 'polish' })).toBe('C');
    expect(qfTrack({ type: 'documentation' })).toBe('STANDALONE');
    expect(qfTrack({ type: 'something-new' })).toBe('STANDALONE');
  });

  it('qfTrack — bug/polish promoted to A when branch_name contains infra keyword', () => {
    expect(qfTrack({ type: 'bug', branch_name: 'quick-fix/QF-INFRA-REAPER' })).toBe('A');
    expect(qfTrack({ type: 'polish', branch_name: 'quick-fix/QF-HOOK-FIX' })).toBe('A');
    expect(qfTrack({ type: 'bug', branch_name: 'quick-fix/QF-RANDOM' })).toBe('C'); // no keyword → stays C
  });

  // --- TS-3: P0 bug QF outranks medium-priority SDs in Track C ---

  it('TS-3: P0 bug QF ranks above medium-priority SDs in Track C', () => {
    const items = [
      sd({ sd_key: 'SD-C-1', category: 'quality', metadata: { urgency_band: 'P2' } }),
      sd({ sd_key: 'SD-C-2', category: 'quality', metadata: { urgency_band: 'P2' } }),
      qf({ id: 'QF-001', severity: 'critical', type: 'bug' }),
    ];
    const { tracks } = rankItems(items, { now: NOW });
    expect(tracks.C.length).toBe(3);
    expect(tracks.C[0].id).toBe('QF-001'); // P0 QF tops Track C
    expect(tracks.C[0].urgency_band).toBe('P0');
  });

  // --- TS-4: Type distribution mapping ---

  it('TS-4: bug=89 / polish=8 / documentation=6 distribution routes correctly', () => {
    const items = [
      qf({ id: 'QF-BUG', type: 'bug' }),
      qf({ id: 'QF-POL', type: 'polish' }),
      qf({ id: 'QF-DOC', type: 'documentation' }),
      qf({ id: 'QF-OTHER', type: 'something-new' }),
    ];
    const { tracks } = rankItems(items, { now: NOW });
    expect(tracks.C.map(x => x.id).sort()).toEqual(['QF-BUG', 'QF-POL']);
    expect(tracks.STANDALONE.map(x => x.id).sort()).toEqual(['QF-DOC', 'QF-OTHER']);
    expect(tracks.A.length).toBe(0);
    expect(tracks.B.length).toBe(0);
  });

  // --- TS-5: Track A inference via branch heuristic ---

  it('TS-5: branch-name heuristic promotes infra QF to Track A', () => {
    const items = [
      qf({ id: 'QF-INFRA', type: 'bug', branch_name: 'quick-fix/QF-INFRA-FIX' }),
      qf({ id: 'QF-NORMAL', type: 'bug', branch_name: 'quick-fix/QF-NORMAL' }),
    ];
    const { tracks } = rankItems(items, { now: NOW });
    expect(tracks.A.length).toBe(1);
    expect(tracks.A[0].id).toBe('QF-INFRA');
    expect(tracks.C.length).toBe(1);
    expect(tracks.C[0].id).toBe('QF-NORMAL');
  });

  // --- Ranking semantics for mixed SD+QF fleets ---

  it('Mixed fleet: sort within track treats SDs and QFs uniformly', () => {
    const items = [
      sd({ sd_key: 'SD-P2', category: 'quality', metadata: { urgency_band: 'P2' } }),
      qf({ id: 'QF-HI', severity: 'high', type: 'bug' }),   // P1 urgency
      qf({ id: 'QF-LO', severity: 'low', type: 'bug' }),    // P3 urgency
    ];
    const { tracks } = rankItems(items, { now: NOW });
    expect(tracks.C.map(x => x.sd_key || x.id)).toEqual(
      ['QF-HI', 'SD-P2', 'QF-LO'] // P1 QF < P2 SD < P3 QF by urgency_numeric
    );
  });

  it('rankQF discriminator: kind="qf" routes into QF path, not SD path', () => {
    const items = [
      { kind: 'qf', id: 'QF-A', type: 'bug', severity: 'high', status: 'open', created_at: FRESH },
      // An SD with id that looks like a QF shouldn't be mistaken
      sd({ id: 'QF-LOOKALIKE', sd_key: 'SD-LOOKALIKE', category: 'quality' }),
    ];
    const { tracks } = rankItems(items, { now: NOW });
    expect(tracks.C.length).toBe(2);
    const qfRanked = tracks.C.find(x => x.id === 'QF-A');
    expect(qfRanked.kind).toBe('qf');
    const sdRanked = tracks.C.find(x => x.sd_key === 'SD-LOOKALIKE');
    expect(sdRanked.kind).toBe('sd');
  });

  it('QF with non-open status is filtered out', () => {
    const items = [
      qf({ id: 'QF-COMPLETED', status: 'completed' }),
      qf({ id: 'QF-OPEN', status: 'open' }),
    ];
    const { tracks } = rankItems(items, { now: NOW });
    const allIds = [...tracks.A, ...tracks.B, ...tracks.C, ...tracks.STANDALONE].map(x => x.id);
    expect(allIds).toEqual(['QF-OPEN']);
  });

  // SD-LEO-INFRA-QF-SD-ESCALATION-LINK-CANONICAL-TRACK-001 FR-3: named regression case —
  // a QF escalated to a companion SD (status='escalated') must never be ranked alongside
  // that SD, so the same fix can't end up on two independently-claimable belt tracks.
  it('QF escalated to a companion SD (status=escalated) is filtered out; only the SD remains ranked', () => {
    const items = [
      qf({ id: 'QF-ESCALATED', status: 'escalated' }),
      qf({ id: 'QF-IN-PROGRESS', status: 'in_progress' }),
      sd({ id: 'SD-CANONICAL', status: 'draft' }),
    ];
    const { tracks } = rankItems(items, { now: NOW });
    const allIds = [...tracks.A, ...tracks.B, ...tracks.C, ...tracks.STANDALONE].map(x => x.id);
    expect(allIds.includes('QF-ESCALATED')).toBe(false); // escalated QF must not appear on any track
    expect(allIds.includes('QF-IN-PROGRESS')).toBe(true); // in_progress QF should still be ranked
    expect(allIds.includes('SD-CANONICAL')).toBe(true); // the canonical SD should still be ranked
  });

  // SD-LEO-INFRA-SINGLE-ESCALATION-WRITER-001 FR-5/TS-7: a needs_sd row (status='open',
  // routing_tier=3, escalated_to_sd_id NULL) is excluded from self-claim even though its
  // status alone (open) would otherwise pass the existing filter above -- it already failed
  // the Tier-3 (>=75 LOC) quick-fix cap and is awaiting an SD, not claimable as an ordinary
  // quick-fix. Discriminates the full isNeedsSdRow conjunction, not routing_tier alone: an
  // otherwise-identical routing_tier=NULL row (ordinary QF) and a routing_tier=3 row that
  // HAS escalated_to_sd_id set (already linked) are both still ranked normally.
  it('TS-7: needs_sd-shaped QF (open, routing_tier=3, escalated_to_sd_id=NULL) is excluded from self-claim', () => {
    const items = [
      qf({ id: 'QF-NEEDS-SD', status: 'open', routing_tier: 3, escalated_to_sd_id: null }),
      qf({ id: 'QF-ORDINARY', status: 'open', routing_tier: null, escalated_to_sd_id: null }),
      qf({ id: 'QF-TIER3-LINKED', status: 'open', routing_tier: 3, escalated_to_sd_id: 'SD-LEO-EXAMPLE-001' }),
    ];
    const { tracks } = rankItems(items, { now: NOW });
    const allIds = [...tracks.A, ...tracks.B, ...tracks.C, ...tracks.STANDALONE].map(x => x.id);
    expect(allIds.includes('QF-NEEDS-SD')).toBe(false); // needs_sd row excluded from self-claim
    expect(allIds.includes('QF-ORDINARY')).toBe(true); // ordinary open QF unaffected (no regression)
    expect(allIds.includes('QF-TIER3-LINKED')).toBe(true); // tier=3 but linked -> no longer needs_sd
  });
});

// SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 FR-5: venture-build queue isolation.
describe('isVentureBuildSD + venture queue isolation (FR-5)', () => {
  it('isVentureBuildSD: only non-platform target_application is a venture', () => {
    expect(isVentureBuildSD({ target_application: null })).toBe(false);
    expect(isVentureBuildSD({ target_application: '' })).toBe(false);
    expect(isVentureBuildSD({ target_application: 'ehg' })).toBe(false);
    expect(isVentureBuildSD({ target_application: 'EHG' })).toBe(false);
    expect(isVentureBuildSD({ target_application: 'EHG_Engineer' })).toBe(false);
    expect(isVentureBuildSD({ target_application: 'CronLinter' })).toBe(true);
    expect(isVentureBuildSD({ target_application: 'Canvas AI' })).toBe(true);
  });

  it('routes venture-build SDs to ventureTrack, NOT the platform tracks', () => {
    const items = [
      sd({ id: 'SD-PLAT-1', sd_key: 'SD-PLAT-1', status: 'active', category: 'infrastructure', target_application: null }),
      sd({ id: 'SD-PLAT-2', sd_key: 'SD-PLAT-2', status: 'active', category: 'quality', target_application: 'EHG_Engineer' }),
      sd({ id: 'SD-VEN-1', sd_key: 'SD-VEN-1', status: 'active', category: 'feature', target_application: 'CronLinter' }),
      sd({ id: 'SD-VEN-2', sd_key: 'SD-VEN-2', status: 'active', category: 'infrastructure', target_application: 'Canvas AI' }),
    ];
    const result = rankItems(items, {});
    const platformIds = [...result.tracks.A, ...result.tracks.B, ...result.tracks.C, ...result.tracks.STANDALONE].map(x => x.sd_id);
    const ventureIds = result.ventureTrack.map(x => x.sd_id);

    expect(Array.isArray(result.ventureTrack)).toBe(true); // ventureTrack is an array
    expect(ventureIds.sort()).toEqual(['SD-VEN-1', 'SD-VEN-2']);
    expect(!platformIds.includes('SD-VEN-1') && !platformIds.includes('SD-VEN-2')).toBe(true); // venture SDs absent from platform tracks
    expect(platformIds.includes('SD-PLAT-1') && platformIds.includes('SD-PLAT-2')).toBe(true); // platform SDs present in platform tracks
    expect(result.ventureTrack.every(x => x.track === 'VENTURE')).toBe(true); // ventureTrack entries marked track=VENTURE
  });

  it('completed/cancelled venture SDs are excluded from both tracks and ventureTrack', () => {
    const items = [
      sd({ id: 'SD-VEN-DONE', sd_key: 'SD-VEN-DONE', status: 'completed', target_application: 'CronLinter' }),
      sd({ id: 'SD-VEN-CANCEL', sd_key: 'SD-VEN-CANCEL', status: 'cancelled', target_application: 'Canvas AI' }),
    ];
    const result = rankItems(items, {});
    expect(result.ventureTrack.length).toBe(0);
    const platformIds = [...result.tracks.A, ...result.tracks.B, ...result.tracks.C, ...result.tracks.STANDALONE];
    expect(platformIds.length).toBe(0);
  });
});
