/**
 * Tests for Friday Pre-Flight Briefing Card
 * SD-EVA-FRIDAY-MEETING-ENHANCEMENT-ORCH-001-B
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateBriefingCard } from './friday-briefing-card.js';

// populateDecisionConsequences requires a live DB — tested via integration only

describe('generateBriefingCard', () => {
  describe('null / empty state', () => {
    it('returns valid empty card when fridayData is null', () => {
      const card = generateBriefingCard(null);
      expect(card.type).toBe('briefing_card');
      expect(card.version).toBe(1);
      expect(card.agenda_preview).toEqual([]);
      expect(card.pending_decisions_count).toBe(0);
      expect(card.risk_flags).toEqual([]);
      expect(card.stale_krs_count).toBe(0);
    });

    it('returns valid empty card when fridayData is empty object', () => {
      const card = generateBriefingCard({});
      expect(card.type).toBe('briefing_card');
      expect(card.version).toBe(1);
      expect(card.agenda_preview).toEqual([]);
      expect(card.pending_decisions_count).toBe(0);
      expect(card.risk_flags).toEqual([]);
      expect(card.stale_krs_count).toBe(0);
    });
  });

  describe('happy path', () => {
    it('extracts agenda_preview from sections', () => {
      const fridayData = {
        sections: [
          { title: 'Revenue Review' },
          { title: 'Product Roadmap' },
          { summary: 'Operations Update' },
        ],
      };
      const card = generateBriefingCard(fridayData);
      expect(card.agenda_preview).toEqual(['Revenue Review', 'Product Roadmap', 'Operations Update']);
    });

    it('counts pending decisions only (excludes resolved)', () => {
      const fridayData = {
        decisions: [
          { id: '1', status: 'pending' },
          { id: '2', status: 'resolved' },
          { id: '3', status: 'accepted' },
          { id: '4' }, // no status = pending
        ],
      };
      const card = generateBriefingCard(fridayData);
      expect(card.pending_decisions_count).toBe(2); // id 1 and 4
    });

    it('extracts risk_flags for high/elevated severity risks', () => {
      const fridayData = {
        risks: [
          { title: 'Revenue risk', severity: 'high' },
          { title: 'Low risk', severity: 'low' },
          { title: 'Elevated issue', severity: 'elevated' },
          { title: 'Medium risk', severity: 'medium' },
        ],
      };
      const card = generateBriefingCard(fridayData);
      expect(card.risk_flags).toHaveLength(2);
      expect(card.risk_flags).toContain('Revenue risk');
      expect(card.risk_flags).toContain('Elevated issue');
    });

    it('counts stale KRs', () => {
      const fridayData = {
        krs: [
          { title: 'KR 1', stale: true },
          { title: 'KR 2', stale: false },
          { title: 'KR 3', is_stale: true },
          { title: 'KR 4', status: 'stale' },
        ],
      };
      const card = generateBriefingCard(fridayData);
      expect(card.stale_krs_count).toBe(3);
    });

    it('returns all four required fields in output', () => {
      const card = generateBriefingCard({
        sections: [{ title: 'Q1 Review' }],
        decisions: [{ status: 'pending' }, { status: 'pending' }],
        risks: [{ title: 'Cash risk', severity: 'high' }],
        krs: [{ stale: true }],
      });
      expect(card).toMatchObject({
        type: 'briefing_card',
        version: 1,
        agenda_preview: ['Q1 Review'],
        pending_decisions_count: 2,
        risk_flags: ['Cash risk'],
        stale_krs_count: 1,
      });
    });

    it('completes in under 2 seconds with mock data', async () => {
      const fridayData = {
        sections: Array.from({ length: 10 }, (_, i) => ({ title: `Section ${i}` })),
        decisions: Array.from({ length: 20 }, (_, i) => ({ status: i % 2 === 0 ? 'pending' : 'resolved' })),
        risks: Array.from({ length: 5 }, (_, i) => ({ title: `Risk ${i}`, severity: 'high' })),
        krs: Array.from({ length: 8 }, (_, i) => ({ stale: i % 3 === 0 })),
      };
      const start = Date.now();
      generateBriefingCard(fridayData);
      expect(Date.now() - start).toBeLessThan(2000);
    });
  });

  describe('canvas schema', () => {
    it('output has type and version fields required for EVACanvasPanel', () => {
      const card = generateBriefingCard({});
      expect(card.type).toBe('briefing_card');
      expect(card.version).toBe(1);
    });
  });
});
