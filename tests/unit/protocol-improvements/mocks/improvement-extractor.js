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
export class ImprovementExtractor {
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
