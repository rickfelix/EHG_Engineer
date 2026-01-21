/**
 * Unit Tests: EffectivenessTracker
 *
 * Tests tracking of improvement effectiveness including:
 * - Calculating 100% effectiveness when issues stop appearing
 * - Calculating partial effectiveness for reduced occurrences
 * - Handling 0% effectiveness when issues continue
 * - Handling cases with no subsequent data
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EffectivenessTracker,
  createTrackerMockSupabase
} from './setup.js';

describe('EffectivenessTracker', () => {
  let tracker;
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = createTrackerMockSupabase();
    tracker = new EffectivenessTracker(mockSupabase);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateEffectivenessSuccess', () => {
    test('should calculate 100% effectiveness when issue stops appearing', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'imp-001',
          pattern_id: 'PAT-PRD-001',
          applied_at: '2025-12-01T00:00:00Z'
        },
        error: null
      });

      // Mock no occurrences after
      vi.spyOn(tracker, '_countPatternOccurrencesAfter').mockResolvedValue(0);
      vi.spyOn(tracker, '_countPatternOccurrencesBefore').mockResolvedValue(5);

      const result = await tracker.calculateEffectivenessSuccess('imp-001');

      expect(result.effectiveness).toBe(100);
      expect(result.reason).toContain('completely resolved');
    });

    test('should calculate partial effectiveness for reduced occurrences', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'imp-001',
          pattern_id: 'PAT-PRD-001',
          applied_at: '2025-12-01T00:00:00Z'
        },
        error: null
      });

      vi.spyOn(tracker, '_countPatternOccurrencesAfter').mockResolvedValue(2);
      vi.spyOn(tracker, '_countPatternOccurrencesBefore').mockResolvedValue(10);

      const result = await tracker.calculateEffectivenessSuccess('imp-001');

      expect(result.effectiveness).toBe(80); // (10-2)/10 = 80%
      expect(result.reason).toContain('Reduced occurrences from 10 to 2');
    });
  });

  describe('calculateEffectivenessFailure', () => {
    test('should calculate 0% effectiveness when issue continues at same rate', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'imp-001',
          pattern_id: 'PAT-PRD-001',
          applied_at: '2025-12-01T00:00:00Z'
        },
        error: null
      });

      vi.spyOn(tracker, '_countPatternOccurrencesAfter').mockResolvedValue(5);
      vi.spyOn(tracker, '_countPatternOccurrencesBefore').mockResolvedValue(5);

      const result = await tracker.calculateEffectivenessFailure('imp-001');

      expect(result.effectiveness).toBe(0);
      expect(result.reason).toContain('same or higher rate');
    });

    test('should calculate low effectiveness for minimal improvement', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'imp-001',
          pattern_id: 'PAT-PRD-001',
          applied_at: '2025-12-01T00:00:00Z'
        },
        error: null
      });

      vi.spyOn(tracker, '_countPatternOccurrencesAfter').mockResolvedValue(8);
      vi.spyOn(tracker, '_countPatternOccurrencesBefore').mockResolvedValue(10);

      const result = await tracker.calculateEffectivenessFailure('imp-001');

      expect(result.effectiveness).toBe(20); // (10-8)/10 = 20%
      expect(result.reason).toContain('Partial improvement');
    });
  });

  describe('calculateEffectivenessNoData', () => {
    test('should return null for improvements with insufficient time', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 3); // 3 days ago

      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'imp-001',
          applied_at: recentDate.toISOString()
        },
        error: null
      });

      const result = await tracker.calculateEffectivenessNoData('imp-001');

      expect(result.effectiveness).toBeNull();
      expect(result.reason).toContain('Insufficient time elapsed');
    });

    test('should return null when no executions after improvement', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30); // 30 days ago

      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'imp-001',
          applied_at: oldDate.toISOString()
        },
        error: null
      });

      vi.spyOn(tracker, '_countExecutionsAfter').mockResolvedValue(0);

      const result = await tracker.calculateEffectivenessNoData('imp-001');

      expect(result.effectiveness).toBeNull();
      expect(result.reason).toContain('No executions after improvement');
    });

    test('should return 100% when executions exist but pattern not seen', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30);

      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'imp-001',
          applied_at: oldDate.toISOString()
        },
        error: null
      });

      vi.spyOn(tracker, '_countExecutionsAfter').mockResolvedValue(10);

      const result = await tracker.calculateEffectivenessNoData('imp-001');

      expect(result.effectiveness).toBe(100);
      expect(result.reason).toContain('10 executions completed without issue recurring');
    });
  });
});
