/**
 * Integration test: Urgency-based queue ordering in sd:next
 * SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-A
 *
 * Validates that the sort logic in SDNextSelector uses urgency bands
 * (P0 first) → urgency score (desc) → composite_rank (fallback).
 */
import { describe, it, expect } from 'vitest';
import { scoreToBand, bandToNumeric } from '../../../scripts/modules/auto-proceed/urgency-scorer.js';

// Replicate the sort comparator from SDNextSelector.js
function urgencySort(items) {
  return [...items].sort((a, b) => {
    const bandDiff = (a.urgency_numeric ?? 3) - (b.urgency_numeric ?? 3);
    if (bandDiff !== 0) return bandDiff;
    const scoreDiff = (b.urgency_score ?? 0) - (a.urgency_score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (a.composite_rank ?? a.sequence_rank ?? 9999) - (b.composite_rank ?? b.sequence_rank ?? 9999);
  });
}

// Helper: build a track entry like SDNextSelector does
function makeEntry(id, metadata, compositeRank = 9999) {
  const urgencyScore = metadata?.urgency_score ?? null;
  const urgencyBand = metadata?.urgency_band ?? (urgencyScore !== null ? scoreToBand(urgencyScore) : 'P3');
  const urgencyNumeric = bandToNumeric(urgencyBand);
  return { sd_id: id, urgency_score: urgencyScore, urgency_band: urgencyBand, urgency_numeric: urgencyNumeric, composite_rank: compositeRank };
}

describe('Urgency-based queue ordering', () => {
  it('sorts P0 before P1 before P2 before P3', () => {
    const items = [
      makeEntry('SD-P3', { urgency_score: 0.2, urgency_band: 'P3' }, 1),
      makeEntry('SD-P0', { urgency_score: 0.9, urgency_band: 'P0' }, 4),
      makeEntry('SD-P2', { urgency_score: 0.5, urgency_band: 'P2' }, 2),
      makeEntry('SD-P1', { urgency_score: 0.7, urgency_band: 'P1' }, 3),
    ];
    const sorted = urgencySort(items);
    expect(sorted.map(i => i.sd_id)).toEqual(['SD-P0', 'SD-P1', 'SD-P2', 'SD-P3']);
  });

  it('within same band, higher urgency score comes first', () => {
    const items = [
      makeEntry('SD-LOW', { urgency_score: 0.86, urgency_band: 'P0' }, 1),
      makeEntry('SD-HIGH', { urgency_score: 0.95, urgency_band: 'P0' }, 2),
      makeEntry('SD-MID', { urgency_score: 0.90, urgency_band: 'P0' }, 3),
    ];
    const sorted = urgencySort(items);
    expect(sorted.map(i => i.sd_id)).toEqual(['SD-HIGH', 'SD-MID', 'SD-LOW']);
  });

  it('within same band and score, falls back to composite_rank', () => {
    const items = [
      makeEntry('SD-RANK5', { urgency_score: 0.7, urgency_band: 'P1' }, 5),
      makeEntry('SD-RANK1', { urgency_score: 0.7, urgency_band: 'P1' }, 1),
      makeEntry('SD-RANK3', { urgency_score: 0.7, urgency_band: 'P1' }, 3),
    ];
    const sorted = urgencySort(items);
    expect(sorted.map(i => i.sd_id)).toEqual(['SD-RANK1', 'SD-RANK3', 'SD-RANK5']);
  });

  it('SDs without urgency metadata default to P3', () => {
    const items = [
      makeEntry('SD-NO-URGENCY', {}, 1),
      makeEntry('SD-P1', { urgency_score: 0.7, urgency_band: 'P1' }, 5),
    ];
    const sorted = urgencySort(items);
    expect(sorted[0].sd_id).toBe('SD-P1');
    expect(sorted[1].sd_id).toBe('SD-NO-URGENCY');
    expect(sorted[1].urgency_band).toBe('P3');
  });

  it('null urgency_score with explicit band still sorts correctly', () => {
    const items = [
      makeEntry('SD-EXPLICIT-P0', { urgency_band: 'P0' }, 10),
      makeEntry('SD-SCORED-P1', { urgency_score: 0.7, urgency_band: 'P1' }, 1),
    ];
    const sorted = urgencySort(items);
    expect(sorted[0].sd_id).toBe('SD-EXPLICIT-P0');
  });

  it('scoreToBand correctly maps scores to bands', () => {
    expect(scoreToBand(0.95)).toBe('P0');
    expect(scoreToBand(0.85)).toBe('P0');
    expect(scoreToBand(0.70)).toBe('P1');
    expect(scoreToBand(0.50)).toBe('P2');
    expect(scoreToBand(0.20)).toBe('P3');
    expect(scoreToBand(null)).toBe('P3');
    expect(scoreToBand(undefined)).toBe('P3');
  });

  it('bandToNumeric maps bands to sortable integers', () => {
    expect(bandToNumeric('P0')).toBe(0);
    expect(bandToNumeric('P1')).toBe(1);
    expect(bandToNumeric('P2')).toBe(2);
    expect(bandToNumeric('P3')).toBe(3);
    expect(bandToNumeric('INVALID')).toBe(3);
  });

  it('mixed scenario: real-world queue with varied urgency', () => {
    const items = [
      makeEntry('SD-INFRA-LOW', { urgency_score: 0.3, urgency_band: 'P3' }, 2),
      makeEntry('SD-HOTFIX', { urgency_score: 0.92, urgency_band: 'P0' }, 10),
      makeEntry('SD-FEATURE', {}, 1),
      makeEntry('SD-REGRESSION', { urgency_score: 0.75, urgency_band: 'P1' }, 5),
      makeEntry('SD-CLEANUP', { urgency_score: 0.45, urgency_band: 'P2' }, 3),
    ];
    const sorted = urgencySort(items);
    expect(sorted.map(i => i.sd_id)).toEqual([
      'SD-HOTFIX',      // P0
      'SD-REGRESSION',  // P1
      'SD-CLEANUP',     // P2
      'SD-INFRA-LOW',   // P3 (score 0.3, rank 2)
      'SD-FEATURE',     // P3 (no score, rank 1 but null score=0 < 0.3)
    ]);
  });
});
