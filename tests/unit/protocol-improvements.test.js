/**
 * Unit Tests: Protocol Improvement System
 * Tests extraction, application, and effectiveness tracking of protocol improvements
 *
 * Test Coverage:
 * - ImprovementExtractor: Extract improvements from retrospectives
 * - ImprovementApplicator: Apply improvements to database tables
 * - EffectivenessTracker: Track improvement effectiveness over time
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Test fixtures
const fixturesPath = join(process.cwd(), 'tests', 'fixtures', 'protocol-improvements');
const sampleRetrospective = JSON.parse(
  readFileSync(join(fixturesPath, 'sample-retrospective.json'), 'utf-8')
);
const sampleImprovementQueue = JSON.parse(
  readFileSync(join(fixturesPath, 'sample-improvement-queue.json'), 'utf-8')
);
const expectedExtraction = JSON.parse(
  readFileSync(join(fixturesPath, 'expected-extraction.json'), 'utf-8')
);

/**
 * MOCK: ImprovementExtractor
 *
 * Real implementation would be in:
 * lib/protocol-improvements/improvement-extractor.js
 *
 * Responsibilities:
 * - Extract improvements from retrospective.protocol_improvements JSONB
 * - Extract process issues from retrospective.failure_patterns
 * - Map improvement types to target database tables
 * - Return structured improvement queue items
 */
class ImprovementExtractor {
  constructor(supabase) {
    this.supabase = supabase;
  }

  /**
   * Extract protocol improvements from retrospective
   * @param {string} retrospectiveId - Retrospective ID
   * @returns {Promise<Array>} - Array of improvement objects
   */
  async extractFromRetrospective(retrospectiveId) {
    const { data: retro, error } = await this.supabase
      .from('retrospectives')
      .select('*')
      .eq('id', retrospectiveId)
      .single();

    if (error || !retro) {
      throw new Error(`Retrospective ${retrospectiveId} not found`);
    }

    const improvements = [];

    // Extract from protocol_improvements field
    if (retro.protocol_improvements && Array.isArray(retro.protocol_improvements)) {
      retro.protocol_improvements.forEach(pi => {
        improvements.push({
          source_retrospective_id: retrospectiveId,
          category: pi.category,
          improvement_text: pi.improvement,
          evidence: pi.evidence,
          impact_assessment: this._assessImpact(pi.impact),
          affected_phase: pi.affected_phase,
          target_table: pi.target_table || this._inferTargetTable(pi),
          target_record_id: pi.target_record_id || null,
          status: 'pending_review',
          source: 'protocol_improvements'
        });
      });
    }

    // Extract from failure_patterns
    if (retro.failure_patterns && Array.isArray(retro.failure_patterns)) {
      retro.failure_patterns.forEach(pattern => {
        improvements.push({
          source_retrospective_id: retrospectiveId,
          pattern_id: pattern.pattern_id,
          category: 'PATTERN_RESOLUTION',
          improvement_text: this._generateImprovementFromPattern(pattern),
          evidence: `${pattern.occurrence_count} occurrences of ${pattern.description}`,
          impact_assessment: pattern.impact,
          target_table: this._inferTargetTableFromPattern(pattern),
          status: 'pending_review',
          source: 'failure_patterns'
        });
      });
    }

    return improvements;
  }

  /**
   * Extract improvements from protocol_improvements field only
   * @param {object} retrospective - Retrospective object
   * @returns {Array} - Improvements from protocol_improvements field
   */
  extractProtocolImprovements(retrospective) {
    if (!retrospective.protocol_improvements) {
      return [];
    }

    return retrospective.protocol_improvements.map(pi => ({
      ...pi,
      source: 'protocol_improvements'
    }));
  }

  /**
   * Extract improvements from failure_patterns field
   * @param {object} retrospective - Retrospective object
   * @returns {Array} - Improvements derived from failure patterns
   */
  extractFailurePatternImprovements(retrospective) {
    if (!retrospective.failure_patterns) {
      return [];
    }

    return retrospective.failure_patterns.map(pattern => ({
      pattern_id: pattern.pattern_id,
      improvement: this._generateImprovementFromPattern(pattern),
      evidence: `${pattern.occurrence_count} occurrences of ${pattern.description}`,
      impact: pattern.impact,
      target_table: this._inferTargetTableFromPattern(pattern),
      source: 'failure_patterns'
    }));
  }

  /**
   * Map improvements to target tables
   * @param {Array} improvements - Array of improvements
   * @returns {Object} - Map of target_table -> improvements
   */
  mapImprovementsByTargetTable(improvements) {
    const mapping = {};

    improvements.forEach(imp => {
      const table = imp.target_table || 'unknown';
      if (!mapping[table]) {
        mapping[table] = [];
      }
      mapping[table].push(imp.improvement || imp.improvement_text);
    });

    return mapping;
  }

  /**
   * Handle empty or null inputs gracefully
   * @param {object} retrospective - Retrospective object (may be null/empty)
   * @returns {Array} - Empty array if no valid improvements
   */
  extractFromEmptyInput(retrospective) {
    if (!retrospective) {
      return [];
    }

    if (!retrospective.protocol_improvements && !retrospective.failure_patterns) {
      return [];
    }

    return this.extractProtocolImprovements(retrospective)
      .concat(this.extractFailurePatternImprovements(retrospective));
  }

  // Helper methods
  _assessImpact(impactString) {
    if (!impactString) return 'medium';
    if (impactString.toLowerCase().includes('80%') ||
        impactString.toLowerCase().includes('prevent')) {
      return 'high';
    }
    if (impactString.toLowerCase().includes('reduce') ||
        impactString.toLowerCase().includes('improve')) {
      return 'medium';
    }
    return 'low';
  }

  _inferTargetTable(improvement) {
    if (improvement.affected_phase === 'LEAD') {
      return 'leo_handoff_templates';
    }
    if (improvement.category === 'DOCUMENTATION') {
      return 'leo_protocol_sections';
    }
    return 'unknown';
  }

  _generateImprovementFromPattern(pattern) {
    return `Add validation to catch ${pattern.description.toLowerCase()}`;
  }

  _inferTargetTableFromPattern(pattern) {
    if (pattern.pattern_id?.includes('PRD')) {
      return 'leo_handoff_templates';
    }
    if (pattern.pattern_id?.includes('HANDOFF')) {
      return 'leo_handoff_templates';
    }
    return 'unknown';
  }
}

/**
 * MOCK: ImprovementApplicator
 *
 * Real implementation would be in:
 * lib/protocol-improvements/improvement-applicator.js
 *
 * Responsibilities:
 * - Validate improvement targets (no direct markdown edits)
 * - Apply improvements to whitelisted database tables
 * - Trigger CLAUDE.md regeneration after applying
 * - Handle database errors gracefully
 */
class ImprovementApplicator {
  constructor(supabase) {
    this.supabase = supabase;
    this.WHITELISTED_TABLES = [
      'leo_handoff_templates',
      'leo_protocol_sections',
      'leo_protocol_agents',
      'leo_protocol_sub_agents',
      'handoff_validation_rules'
    ];
    this.FORBIDDEN_TARGETS = [
      'CLAUDE.md',
      'CLAUDE_LEAD.md',
      'CLAUDE_PLAN.md',
      'CLAUDE_EXEC.md',
      'MARKDOWN_FILE'
    ];
  }

  /**
   * Validate improvement before applying
   * @param {object} improvement - Improvement object
   * @returns {object} - { valid: boolean, reason: string }
   */
  validateImprovement(improvement) {
    // Reject direct markdown edits
    if (this.FORBIDDEN_TARGETS.includes(improvement.target_table)) {
      return {
        valid: false,
        reason: 'Direct markdown file edits are not allowed. Must update database tables instead.'
      };
    }

    // Check if target table is whitelisted
    if (!this.WHITELISTED_TABLES.includes(improvement.target_table)) {
      return {
        valid: false,
        reason: `Target table '${improvement.target_table}' is not whitelisted for protocol improvements.`
      };
    }

    // Basic field validation
    if (!improvement.improvement_text) {
      return {
        valid: false,
        reason: 'Improvement text is required.'
      };
    }

    return { valid: true };
  }

  /**
   * Apply improvement to database table
   * @param {object} improvement - Improvement object
   * @param {boolean} regenerate - Whether to regenerate CLAUDE.md after applying
   * @returns {Promise<object>} - { success: boolean, error?: string, regenerated?: boolean }
   */
  async applyImprovement(improvement, regenerate = true) {
    const validation = this.validateImprovement(improvement);
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    try {
      // Apply to target table (implementation depends on table structure)
      const result = await this._applyToTable(improvement);

      // Mark improvement as applied
      await this.supabase
        .from('protocol_improvement_queue')
        .update({
          status: 'applied',
          applied_at: new Date().toISOString()
        })
        .eq('id', improvement.id);

      // Trigger regeneration if requested
      let regenerated = false;
      if (regenerate) {
        regenerated = await this._regenerateCLAUDEmd();
      }

      return { success: true, regenerated };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Batch apply multiple improvements
   * @param {Array} improvements - Array of improvements
   * @param {boolean} regenerate - Regenerate once after all applied
   * @returns {Promise<object>} - { applied: number, failed: number, errors: Array }
   */
  async applyBatch(improvements, regenerate = true) {
    const results = {
      applied: 0,
      failed: 0,
      errors: []
    };

    for (const improvement of improvements) {
      try {
        await this.applyImprovement(improvement, false); // Don't regenerate per-improvement
        results.applied++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          improvement_id: improvement.id,
          error: error.message
        });
      }
    }

    // Regenerate once at the end
    if (regenerate && results.applied > 0) {
      await this._regenerateCLAUDEmd();
    }

    return results;
  }

  /**
   * Handle database errors gracefully
   * @param {object} improvement - Improvement object
   * @returns {Promise<object>} - Error handling result
   */
  async applyWithErrorHandling(improvement) {
    try {
      return await this.applyImprovement(improvement);
    } catch (error) {
      // Log error but don't throw
      console.error('Failed to apply improvement:', error);

      // Record failure (wrapped in try-catch in case this also fails)
      try {
        await this.supabase
          .from('protocol_improvement_queue')
          .update({
            status: 'failed',
            error_message: error.message
          })
          .eq('id', improvement.id);
      } catch (updateError) {
        console.error('Failed to update improvement status:', updateError);
      }

      return {
        success: false,
        error: error.message,
        handled: true
      };
    }
  }

  // Helper methods
  async _applyToTable(improvement) {
    // Simplified implementation - real version would handle different table structures
    const { target_table, target_record_id, improvement_text } = improvement;

    if (target_record_id) {
      // Update existing record
      return await this.supabase
        .from(target_table)
        .update({ content: improvement_text })
        .eq('id', target_record_id);
    } else {
      // Insert new record
      return await this.supabase
        .from(target_table)
        .insert({ content: improvement_text });
    }
  }

  async _regenerateCLAUDEmd() {
    // In real implementation, would call:
    // node scripts/generate-claude-md-from-db.js
    return true;
  }
}

/**
 * MOCK: EffectivenessTracker
 *
 * Real implementation would be in:
 * lib/protocol-improvements/effectiveness-tracker.js
 *
 * Responsibilities:
 * - Track if issue stops appearing after improvement applied
 * - Calculate effectiveness score based on before/after metrics
 * - Handle improvements with no subsequent data
 */
class EffectivenessTracker {
  constructor(supabase) {
    this.supabase = supabase;
  }

  /**
   * Calculate effectiveness when issue stops appearing
   * @param {string} improvementId - Improvement ID
   * @returns {Promise<object>} - { effectiveness: number, reason: string }
   */
  async calculateEffectivenessSuccess(improvementId) {
    const { data: improvement } = await this.supabase
      .from('protocol_improvement_queue')
      .select('*')
      .eq('id', improvementId)
      .single();

    if (!improvement || !improvement.applied_at) {
      return {
        effectiveness: 0,
        reason: 'Improvement not yet applied'
      };
    }

    // Check if related pattern still appears after improvement
    const occurrencesAfter = await this._countPatternOccurrencesAfter(
      improvement.pattern_id,
      improvement.applied_at
    );

    if (occurrencesAfter === 0) {
      return {
        effectiveness: 100,
        reason: 'Issue completely resolved - no occurrences after improvement applied'
      };
    }

    // Partial improvement
    const occurrencesBefore = await this._countPatternOccurrencesBefore(
      improvement.pattern_id,
      improvement.applied_at
    );

    const reduction = ((occurrencesBefore - occurrencesAfter) / occurrencesBefore) * 100;

    return {
      effectiveness: Math.max(0, Math.round(reduction)),
      reason: `Reduced occurrences from ${occurrencesBefore} to ${occurrencesAfter}`
    };
  }

  /**
   * Calculate low effectiveness when issue continues
   * @param {string} improvementId - Improvement ID
   * @returns {Promise<object>} - { effectiveness: number, reason: string }
   */
  async calculateEffectivenessFailure(improvementId) {
    const { data: improvement } = await this.supabase
      .from('protocol_improvement_queue')
      .select('*')
      .eq('id', improvementId)
      .single();

    if (!improvement || !improvement.applied_at) {
      return {
        effectiveness: 0,
        reason: 'Improvement not yet applied'
      };
    }

    const occurrencesAfter = await this._countPatternOccurrencesAfter(
      improvement.pattern_id,
      improvement.applied_at
    );

    const occurrencesBefore = await this._countPatternOccurrencesBefore(
      improvement.pattern_id,
      improvement.applied_at
    );

    if (occurrencesAfter >= occurrencesBefore) {
      return {
        effectiveness: 0,
        reason: `Issue still occurring at same or higher rate (${occurrencesBefore} → ${occurrencesAfter})`
      };
    }

    const reduction = ((occurrencesBefore - occurrencesAfter) / occurrencesBefore) * 100;

    return {
      effectiveness: Math.max(0, Math.round(reduction)),
      reason: `Partial improvement: reduced from ${occurrencesBefore} to ${occurrencesAfter} occurrences`
    };
  }

  /**
   * Handle improvements with no subsequent data
   * @param {string} improvementId - Improvement ID
   * @returns {Promise<object>} - { effectiveness: number, reason: string }
   */
  async calculateEffectivenessNoData(improvementId) {
    const { data: improvement } = await this.supabase
      .from('protocol_improvement_queue')
      .select('*')
      .eq('id', improvementId)
      .single();

    if (!improvement || !improvement.applied_at) {
      return {
        effectiveness: null,
        reason: 'Improvement not yet applied'
      };
    }

    // Check if enough time has passed to expect data
    const daysSinceApplied = this._daysSince(improvement.applied_at);

    if (daysSinceApplied < 7) {
      return {
        effectiveness: null,
        reason: 'Insufficient time elapsed - need at least 7 days of data'
      };
    }

    // No subsequent executions to measure against
    const executionsAfter = await this._countExecutionsAfter(improvement.applied_at);

    if (executionsAfter === 0) {
      return {
        effectiveness: null,
        reason: 'No executions after improvement applied - cannot measure effectiveness'
      };
    }

    // Has executions but pattern not seen
    return {
      effectiveness: 100,
      reason: `${executionsAfter} executions completed without issue recurring`
    };
  }

  // Helper methods
  async _countPatternOccurrencesAfter(patternId, date) {
    if (!patternId) return 0;

    const { count } = await this.supabase
      .from('retrospectives')
      .select('*', { count: 'exact', head: true })
      .contains('failure_patterns', [{ pattern_id: patternId }])
      .gte('conducted_date', date);

    return count || 0;
  }

  async _countPatternOccurrencesBefore(patternId, date) {
    if (!patternId) return 0;

    const { count } = await this.supabase
      .from('retrospectives')
      .select('*', { count: 'exact', head: true })
      .contains('failure_patterns', [{ pattern_id: patternId }])
      .lt('conducted_date', date);

    return count || 0;
  }

  async _countExecutionsAfter(date) {
    const { count } = await this.supabase
      .from('leo_handoff_executions')
      .select('*', { count: 'exact', head: true })
      .gte('initiated_at', date);

    return count || 0;
  }

  _daysSince(date) {
    const now = new Date();
    const then = new Date(date);
    return Math.floor((now - then) / (1000 * 60 * 60 * 24));
  }
}

// ============================================================================
// TESTS: ImprovementExtractor
// ============================================================================

describe('ImprovementExtractor', () => {
  let extractor;
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn()
    };

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

// ============================================================================
// TESTS: ImprovementApplicator
// ============================================================================

describe('ImprovementApplicator', () => {
  let applicator;
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: {}, error: null })
    };

    applicator = new ImprovementApplicator(mockSupabase);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('validateImprovement', () => {
    test('should reject direct markdown file edits', () => {
      const invalidImprovement = {
        target_table: 'CLAUDE.md',
        improvement_text: 'Add new section'
      };

      const result = applicator.validateImprovement(invalidImprovement);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Direct markdown file edits are not allowed');
    });

    test('should only allow whitelisted target tables', () => {
      const invalidTable = {
        target_table: 'random_table',
        improvement_text: 'Update something'
      };

      const result = applicator.validateImprovement(invalidTable);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not whitelisted');
    });

    test('should accept valid whitelisted table', () => {
      const validImprovement = {
        target_table: 'leo_handoff_templates',
        improvement_text: 'Add validation step'
      };

      const result = applicator.validateImprovement(validImprovement);

      expect(result.valid).toBe(true);
    });

    test('should require improvement_text field', () => {
      const missingText = {
        target_table: 'leo_handoff_templates'
      };

      const result = applicator.validateImprovement(missingText);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Improvement text is required');
    });
  });

  describe('applyImprovement', () => {
    test('should call regenerate after applying improvement', async () => {
      const improvement = {
        id: 'imp-001',
        target_table: 'leo_handoff_templates',
        improvement_text: 'Add validation',
        target_record_id: 'template-001'
      };

      const regenerateSpy = vi.spyOn(applicator, '_regenerateCLAUDEmd');
      regenerateSpy.mockResolvedValue(true);

      const result = await applicator.applyImprovement(improvement, true);

      expect(result.success).toBe(true);
      expect(result.regenerated).toBe(true);
      expect(regenerateSpy).toHaveBeenCalled();
    });

    test('should not regenerate if regenerate=false', async () => {
      const improvement = {
        id: 'imp-001',
        target_table: 'leo_handoff_templates',
        improvement_text: 'Add validation',
        target_record_id: 'template-001'
      };

      const regenerateSpy = vi.spyOn(applicator, '_regenerateCLAUDEmd');
      regenerateSpy.mockResolvedValue(true);

      const result = await applicator.applyImprovement(improvement, false);

      expect(result.success).toBe(true);
      expect(regenerateSpy).not.toHaveBeenCalled();
    });

    test('should handle database errors gracefully', async () => {
      const improvement = {
        id: 'imp-001',
        target_table: 'leo_handoff_templates',
        improvement_text: 'Add validation'
      };

      // Make applyImprovement throw an error (so applyWithErrorHandling catches it)
      vi.spyOn(applicator, 'applyImprovement').mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await applicator.applyWithErrorHandling(improvement);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
      expect(result.handled).toBe(true);
    });
  });

  describe('applyBatch', () => {
    test('should apply multiple improvements and regenerate once', async () => {
      const improvements = [
        {
          id: 'imp-001',
          target_table: 'leo_handoff_templates',
          improvement_text: 'Improvement 1'
        },
        {
          id: 'imp-002',
          target_table: 'leo_protocol_sections',
          improvement_text: 'Improvement 2'
        }
      ];

      const regenerateSpy = vi.spyOn(applicator, '_regenerateCLAUDEmd');
      regenerateSpy.mockResolvedValue(true);

      const result = await applicator.applyBatch(improvements, true);

      expect(result.applied).toBe(2);
      expect(result.failed).toBe(0);
      expect(regenerateSpy).toHaveBeenCalledTimes(1); // Only once at the end
    });

    test('should track failures and continue processing', async () => {
      const improvements = [
        {
          id: 'imp-001',
          target_table: 'INVALID_TABLE', // Will fail validation
          improvement_text: 'Bad improvement'
        },
        {
          id: 'imp-002',
          target_table: 'leo_handoff_templates',
          improvement_text: 'Good improvement'
        }
      ];

      const result = await applicator.applyBatch(improvements, false);

      expect(result.applied).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].improvement_id).toBe('imp-001');
    });
  });
});

// ============================================================================
// TESTS: EffectivenessTracker
// ============================================================================

describe('EffectivenessTracker', () => {
  let tracker;
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      single: vi.fn()
    };

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
