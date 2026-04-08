/**
 * Tests for brainstorm tally module.
 * SD-BRAINSTORM-TALLY-SCORING-ORCHESTRATOR-ORCH-001-A
 */

import { describe, it, expect } from 'vitest';
import { collectVotes, scoreBorda, paretoSignal, formatTallyDisplay } from '../../lib/brainstorm/tally-module.js';

describe('Brainstorm Tally Module', () => {
  const sampleVotes = [
    { seat: 'CFO', rankings: [3, 1, 2] },
    { seat: 'CMO', rankings: [1, 3, 2] },
    { seat: 'CTO', rankings: [1, 2, 3] },
    { seat: 'COO', rankings: [3, 1, 2] },
    { seat: 'CSO', rankings: [1, 3, 2] },
    { seat: 'CLO', rankings: [1, 2, 3] },
  ];

  describe('collectVotes', () => {
    it('filters invalid votes', () => {
      const raw = [
        { seat: 'CFO', rankings: [1, 2] },
        null,
        { seat: '', rankings: [1] },
        { seat: 'CMO', rankings: [] },
        { seat: 'CTO', rankings: [2, 1] },
      ];
      const result = collectVotes(raw, 3);
      expect(result.voterCount).toBe(2);
    });

    it('truncates rankings to candidateCount', () => {
      const raw = [{ seat: 'CFO', rankings: [1, 2, 3, 4, 5] }];
      const result = collectVotes(raw, 3);
      expect(result.votes[0].rankings).toHaveLength(3);
    });
  });

  describe('scoreBorda', () => {
    it('applies Borda count correctly', () => {
      const matrix = collectVotes(sampleVotes, 3);
      const scores = scoreBorda(matrix);
      expect(scores).toHaveLength(3);
      expect(scores[0].score).toBeGreaterThan(scores[1].score);
    });

    it('sorts by score descending', () => {
      const matrix = collectVotes(sampleVotes, 3);
      const scores = scoreBorda(matrix);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i - 1].score).toBeGreaterThanOrEqual(scores[i].score);
      }
    });

    it('percentages sum to ~100', () => {
      const matrix = collectVotes(sampleVotes, 3);
      const scores = scoreBorda(matrix);
      const total = scores.reduce((sum, s) => sum + s.percentage, 0);
      expect(total).toBeGreaterThanOrEqual(98);
      expect(total).toBeLessThanOrEqual(102);
    });
  });

  describe('paretoSignal', () => {
    it('detects concentrated consensus', () => {
      const scores = [
        { candidate: 1, score: 10, percentage: 60 },
        { candidate: 2, score: 5, percentage: 30 },
        { candidate: 3, score: 2, percentage: 10 },
      ];
      const result = paretoSignal(scores);
      expect(result.concentrated).toBe(true);
      expect(result.signal).toBe('concentrated');
    });

    it('detects dispersed votes', () => {
      const scores = [
        { candidate: 1, score: 5, percentage: 35 },
        { candidate: 2, score: 5, percentage: 35 },
        { candidate: 3, score: 4, percentage: 30 },
      ];
      const result = paretoSignal(scores);
      expect(result.concentrated).toBe(false);
      expect(result.signal).toBe('dispersed');
    });
  });

  describe('formatTallyDisplay', () => {
    it('produces readable output', () => {
      const matrix = collectVotes(sampleVotes, 3);
      const scores = scoreBorda(matrix);
      const pareto = paretoSignal(scores);
      const display = formatTallyDisplay(scores, pareto, ['Alpha', 'Beta', 'Gamma']);
      expect(display).toContain('BRAINSTORM TALLY RESULTS');
      expect(display).toContain('Alpha');
      expect(display).toContain('Pareto:');
    });
  });
});
