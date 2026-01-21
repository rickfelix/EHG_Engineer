/**
 * Unit Tests: ImprovementExtractor
 *
 * Tests extraction of improvements from retrospectives including:
 * - Extracting from protocol_improvements JSONB field
 * - Extracting from failure_patterns field
 * - Mapping improvements to target database tables
 * - Handling empty/null inputs
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ImprovementExtractor,
  createExtractorMockSupabase,
  sampleRetrospective
} from './setup.js';

describe('ImprovementExtractor', () => {
  let extractor;
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = createExtractorMockSupabase();
    extractor = new ImprovementExtractor(mockSupabase);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('extractFromRetrospective', () => {
    test('should extract improvements from protocol_improvements JSONB', async () => {
      mockSupabase.single.mockResolvedValue({
        data: sampleRetrospective,
        error: null
      });

      const improvements = await extractor.extractFromRetrospective('retro-test-001');

      expect(improvements.length).toBeGreaterThan(0);

      const protocolImprovement = improvements.find(
        i => i.category === 'VALIDATION'
      );

      expect(protocolImprovement).toBeDefined();
      expect(protocolImprovement.improvement_text).toContain('pre-flight PRD validation');
      expect(protocolImprovement.target_table).toBe('leo_handoff_templates');
      expect(protocolImprovement.source).toBe('protocol_improvements');
    });

    test('should extract process issues from failure_patterns', async () => {
      mockSupabase.single.mockResolvedValue({
        data: sampleRetrospective,
        error: null
      });

      const improvements = await extractor.extractFromRetrospective('retro-test-001');

      const patternImprovement = improvements.find(
        i => i.source === 'failure_patterns'
      );

      expect(patternImprovement).toBeDefined();
      expect(patternImprovement.pattern_id).toBe('PAT-PRD-VALIDATION-001');
      expect(patternImprovement.evidence).toContain('3 occurrences');
    });

    test('should map improvement types to correct target tables', async () => {
      mockSupabase.single.mockResolvedValue({
        data: sampleRetrospective,
        error: null
      });

      const improvements = await extractor.extractFromRetrospective('retro-test-001');

      const validationImprovement = improvements.find(
        i => i.category === 'VALIDATION'
      );
      expect(validationImprovement.target_table).toBe('leo_handoff_templates');

      const docImprovement = improvements.find(
        i => i.category === 'DOCUMENTATION'
      );
      expect(docImprovement.target_table).toBe('leo_protocol_sections');
    });

    test('should handle empty/null inputs gracefully', () => {
      const emptyResult = extractor.extractFromEmptyInput(null);
      expect(emptyResult).toEqual([]);

      const noImprovements = extractor.extractFromEmptyInput({
        id: 'test',
        title: 'Test'
      });
      expect(noImprovements).toEqual([]);
    });

    test('should throw error if retrospective not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' }
      });

      await expect(
        extractor.extractFromRetrospective('nonexistent')
      ).rejects.toThrow('Retrospective nonexistent not found');
    });
  });

  describe('extractProtocolImprovements', () => {
    test('should extract only from protocol_improvements field', () => {
      const improvements = extractor.extractProtocolImprovements(sampleRetrospective);

      expect(improvements.length).toBe(2);
      improvements.forEach(imp => {
        expect(imp.source).toBe('protocol_improvements');
      });
    });

    test('should return empty array if no protocol_improvements', () => {
      const improvements = extractor.extractProtocolImprovements({
        id: 'test',
        failure_patterns: [{ pattern_id: 'PAT-001' }]
      });

      expect(improvements).toEqual([]);
    });
  });

  describe('mapImprovementsByTargetTable', () => {
    test('should group improvements by target table', () => {
      const improvements = extractor.extractProtocolImprovements(sampleRetrospective)
        .concat(extractor.extractFailurePatternImprovements(sampleRetrospective));

      const mapping = extractor.mapImprovementsByTargetTable(improvements);

      expect(mapping['leo_handoff_templates']).toBeDefined();
      expect(mapping['leo_handoff_templates'].length).toBeGreaterThan(0);

      expect(mapping['leo_protocol_sections']).toBeDefined();
      expect(mapping['leo_protocol_sections'].length).toBe(1);
    });
  });
});
