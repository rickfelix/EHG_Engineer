/**
 * Tests for Finding Consolidator
 * SD-EVA-FRIDAY-MEETING-ENHANCEMENT-ORCH-001-C
 */

import { describe, it, expect, vi } from 'vitest';
import { consolidateFindings, getConsolidatedContext } from './finding-consolidator.js';

describe('consolidateFindings', () => {
  it('returns empty array for empty input', () => {
    expect(consolidateFindings([])).toEqual([]);
  });

  it('returns empty array for null input', () => {
    expect(consolidateFindings(null)).toEqual([]);
  });

  it('groups recs by application_domain into cards', () => {
    const recs = [
      { id: '1', title: 'A', application_domain: 'product', priority_score: 0.8 },
      { id: '2', title: 'B', application_domain: 'product', priority_score: 0.6 },
      { id: '3', title: 'C', application_domain: 'engineering', priority_score: 0.9 },
      { id: '4', title: 'D', application_domain: 'engineering', priority_score: 0.7 },
    ];
    const cards = consolidateFindings(recs);
    expect(cards).toHaveLength(2);
    const productCard = cards.find(c => c.domain === 'product');
    const engCard = cards.find(c => c.domain === 'engineering');
    expect(productCard.count).toBe(2);
    expect(productCard.items).toHaveLength(2);
    expect(engCard.count).toBe(2);
    expect(engCard.items).toHaveLength(2);
  });

  it('each card has domain, items, count, combined_priority, summary', () => {
    const recs = [
      { id: '1', title: 'Top rec', application_domain: 'product', priority_score: 0.9 },
    ];
    const [card] = consolidateFindings(recs);
    expect(card).toHaveProperty('domain');
    expect(card).toHaveProperty('items');
    expect(card).toHaveProperty('count');
    expect(card).toHaveProperty('combined_priority');
    expect(card).toHaveProperty('summary');
    expect(card.summary).toBe('Top rec');
  });

  it('combined_priority is average of priority_scores', () => {
    const recs = [
      { id: '1', title: 'A', application_domain: 'ops', priority_score: 0.4 },
      { id: '2', title: 'B', application_domain: 'ops', priority_score: 0.6 },
    ];
    const [card] = consolidateFindings(recs);
    expect(card.combined_priority).toBeCloseTo(0.5);
  });

  it('summary is highest-priority item title', () => {
    const recs = [
      { id: '1', title: 'Lower', application_domain: 'sales', priority_score: 0.3 },
      { id: '2', title: 'Highest', application_domain: 'sales', priority_score: 0.9 },
      { id: '3', title: 'Medium', application_domain: 'sales', priority_score: 0.5 },
    ];
    const [card] = consolidateFindings(recs);
    expect(card.summary).toBe('Highest');
  });

  it('groups unknown domain recs together', () => {
    const recs = [
      { id: '1', title: 'No domain A', priority_score: 0.5 },
      { id: '2', title: 'No domain B', priority_score: 0.3 },
    ];
    const cards = consolidateFindings(recs);
    expect(cards).toHaveLength(1);
    expect(cards[0].domain).toBe('unknown');
    expect(cards[0].count).toBe(2);
  });

  it('sorts cards by combined_priority descending', () => {
    const recs = [
      { id: '1', title: 'Low', application_domain: 'low', priority_score: 0.1 },
      { id: '2', title: 'High', application_domain: 'high', priority_score: 0.9 },
      { id: '3', title: 'Mid', application_domain: 'mid', priority_score: 0.5 },
    ];
    const cards = consolidateFindings(recs);
    expect(cards[0].domain).toBe('high');
    expect(cards[1].domain).toBe('mid');
    expect(cards[2].domain).toBe('low');
  });
});

describe('getConsolidatedContext', () => {
  it('returns correct shape', async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    };
    const result = await getConsolidatedContext(mockSupabase);
    expect(result).toHaveProperty('consolidatedFindings');
    expect(result).toHaveProperty('totalCount');
    expect(result).toHaveProperty('decayApplied');
    expect(Array.isArray(result.consolidatedFindings)).toBe(true);
  });

  it('returns { consolidatedFindings: [], totalCount: 0 } for empty recs', async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    };
    const result = await getConsolidatedContext(mockSupabase);
    expect(result.consolidatedFindings).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it('consolidates mock recommendations by domain', async () => {
    const mockRecs = [
      { id: '1', title: 'Rec A', application_domain: 'product', priority_score: 0.8, status: 'pending', feedback_weight: 1.0 },
      { id: '2', title: 'Rec B', application_domain: 'product', priority_score: 0.6, status: 'pending', feedback_weight: 1.0 },
      { id: '3', title: 'Rec C', application_domain: 'engineering', priority_score: 0.9, status: 'pending', feedback_weight: 1.0 },
    ];
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: mockRecs, error: null }),
          }),
        }),
      }),
    };
    const result = await getConsolidatedContext(mockSupabase);
    expect(result.totalCount).toBe(3);
    expect(result.consolidatedFindings).toHaveLength(2);
    expect(result.decayApplied).toBe(true);
  });
});
