/**
 * Evidence System Module
 * Phase 4: SD-LEO-SELF-IMPROVE-EVIDENCE-001
 *
 * Implements evidence accumulation and persistence for the self-improvement
 * pipeline. Tracks improvement sources, scores, and recurrence patterns.
 *
 * Key features:
 * - Evidence accumulation from retrospectives and issue patterns
 * - Database persistence for eligibility decisions
 * - Recurrence tracking for repeated issue patterns
 * - Evidence quality scoring
 */

/**
 * Evidence source types
 */
export const EVIDENCE_SOURCE = {
  RETROSPECTIVE: 'retrospective',
  ISSUE_PATTERN: 'issue_pattern',
  MANUAL: 'manual',
  AI_GENERATED: 'ai_generated'
};

/**
 * Evidence quality levels
 */
export const EVIDENCE_QUALITY = {
  HIGH: { min: 80, label: 'HIGH', weight: 1.0 },
  MEDIUM: { min: 50, label: 'MEDIUM', weight: 0.7 },
  LOW: { min: 0, label: 'LOW', weight: 0.4 }
};

/**
 * EvidenceSystem class
 * Manages evidence accumulation and persistence
 */
export class EvidenceSystem {
  constructor(options = {}) {
    this.supabase = options.supabase || null;
    this.logger = options.logger || console;
    this.cache = new Map();
    this.recurrenceThreshold = options.recurrenceThreshold || 3; // 3+ occurrences = recurring
  }

  /**
   * Accumulate evidence from a source
   *
   * @param {Object} source - Source of evidence
   * @param {string} source.type - Source type (EVIDENCE_SOURCE)
   * @param {string} source.id - Source ID (retro ID, pattern ID, etc.)
   * @param {Object} source.metadata - Additional metadata
   * @param {Object} improvement - Improvement being evaluated
   * @returns {Object} Evidence record
   */
  accumulateEvidence(source, improvement) {
    const evidence = {
      id: `ev-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      improvement_id: improvement?.id,
      source_type: source?.type || EVIDENCE_SOURCE.MANUAL,
      source_id: source?.id,
      source_metadata: source?.metadata || {},
      accumulated_at: new Date().toISOString(),
      quality_score: 0,
      recurrence_count: 0,
      related_patterns: [],
      citations: []
    };

    // Calculate initial quality score based on source
    evidence.quality_score = this._calculateSourceQuality(source);

    // Check for recurrence if source is a pattern
    if (source?.type === EVIDENCE_SOURCE.ISSUE_PATTERN) {
      evidence.recurrence_count = this._checkRecurrence(source.id);
      evidence.is_recurring = evidence.recurrence_count >= this.recurrenceThreshold;
    }

    // Cache the evidence
    this.cache.set(evidence.id, evidence);

    return evidence;
  }

  /**
   * Persist eligibility decision to database
   *
   * @param {Object} decision - Eligibility decision from AutoEligibilityChecker
   * @param {Object} improvement - The improvement being evaluated
   * @param {Object} scores - Quality scores
   * @returns {Promise<Object>} Persisted record
   */
  async persistEligibilityDecision(decision, improvement, scores = {}) {
    if (!this.supabase) {
      this.logger.warn('[EvidenceSystem] No Supabase client - decision not persisted');
      return { persisted: false, reason: 'no_database' };
    }

    const record = {
      improvement_id: improvement?.id,
      assessment_type: 'auto_eligibility',
      overall_score: scores.overall || 0,
      safety_score: scores.safety || scores.criteria?.safety || 0,
      criterion_scores: scores.criteria || {},
      recommendation: decision.recommendation?.action || 'UNKNOWN',
      confidence: decision.recommendation?.confidence || 'LOW',
      human_review_required: decision.recommendation?.human_review ?? true,
      eligibility_decision: decision.decision,
      eligibility_reasoning: decision.reason,
      classification_tier: decision.classification?.tier || 'GOVERNED',
      classification_rule: decision.classification?.rule,
      audit_checks: decision.checks || [],
      created_at: new Date().toISOString()
    };

    try {
      const { data, error } = await this.supabase
        .from('improvement_quality_assessments')
        .insert(record)
        .select()
        .single();

      if (error) {
        this.logger.error('[EvidenceSystem] Persist failed:', error.message);
        return { persisted: false, reason: error.message };
      }

      return { persisted: true, id: data.id, record: data };
    } catch (err) {
      this.logger.error('[EvidenceSystem] Persist error:', err.message);
      return { persisted: false, reason: err.message };
    }
  }

  /**
   * Get evidence for an improvement
   *
   * @param {string} improvementId - Improvement ID
   * @returns {Promise<Array>} Evidence records
   */
  async getEvidenceForImprovement(improvementId) {
    // Check cache first
    const cached = [];
    for (const [_, evidence] of this.cache) {
      if (evidence.improvement_id === improvementId) {
        cached.push(evidence);
      }
    }

    if (!this.supabase) {
      return cached;
    }

    try {
      const { data, error } = await this.supabase
        .from('improvement_quality_assessments')
        .select('*')
        .eq('improvement_id', improvementId)
        .order('created_at', { ascending: false });

      if (error) {
        this.logger.warn('[EvidenceSystem] Query failed:', error.message);
        return cached;
      }

      return [...cached, ...(data || [])];
    } catch (_err) {
      return cached;
    }
  }

  /**
   * Detect recurrence patterns
   *
   * @param {string} patternId - Issue pattern ID
   * @returns {Promise<Object>} Recurrence analysis
   */
  async detectRecurrence(patternId) {
    if (!this.supabase) {
      return {
        is_recurring: false,
        count: 0,
        history: [],
        reason: 'no_database'
      };
    }

    try {
      // Query retrospectives that reference this pattern
      const { data: retros, error: retroError } = await this.supabase
        .from('retrospectives')
        .select('id, created_at, quality_score')
        .contains('failure_patterns', [patternId])
        .order('created_at', { ascending: false })
        .limit(10);

      if (retroError) {
        return { is_recurring: false, count: 0, history: [], error: retroError.message };
      }

      const count = retros?.length || 0;
      const isRecurring = count >= this.recurrenceThreshold;

      return {
        is_recurring: isRecurring,
        count,
        threshold: this.recurrenceThreshold,
        history: retros || [],
        first_seen: retros?.[retros.length - 1]?.created_at,
        last_seen: retros?.[0]?.created_at,
        recommendation: isRecurring
          ? 'Pattern keeps recurring - consider higher priority improvement'
          : 'Not yet recurring - monitor for future occurrences'
      };
    } catch (err) {
      return { is_recurring: false, count: 0, history: [], error: err.message };
    }
  }

  /**
   * Calculate evidence quality score
   *
   * @param {Object} evidence - Evidence record
   * @returns {number} Quality score (0-100)
   */
  calculateEvidenceScore(evidence) {
    let score = 0;
    const weights = {
      source_quality: 30,
      recurrence: 25,
      freshness: 20,
      specificity: 15,
      citations: 10
    };

    // Source quality (based on type)
    const sourceScores = {
      [EVIDENCE_SOURCE.RETROSPECTIVE]: 90,
      [EVIDENCE_SOURCE.ISSUE_PATTERN]: 80,
      [EVIDENCE_SOURCE.AI_GENERATED]: 60,
      [EVIDENCE_SOURCE.MANUAL]: 50
    };
    score += (sourceScores[evidence.source_type] || 50) * (weights.source_quality / 100);

    // Recurrence bonus
    if (evidence.recurrence_count > 0) {
      const recurrenceScore = Math.min(evidence.recurrence_count * 20, 100);
      score += recurrenceScore * (weights.recurrence / 100);
    }

    // Freshness (decay over time)
    if (evidence.accumulated_at) {
      const ageMs = Date.now() - new Date(evidence.accumulated_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const freshnessScore = Math.max(100 - ageDays * 2, 20); // Min 20, decay 2 pts/day
      score += freshnessScore * (weights.freshness / 100);
    }

    // Specificity (based on metadata completeness)
    const hasSourceId = !!evidence.source_id;
    const hasMetadata = Object.keys(evidence.source_metadata || {}).length > 0;
    const specificityScore = (hasSourceId ? 50 : 0) + (hasMetadata ? 50 : 0);
    score += specificityScore * (weights.specificity / 100);

    // Citations bonus
    const citationScore = Math.min((evidence.citations?.length || 0) * 25, 100);
    score += citationScore * (weights.citations / 100);

    return Math.round(score);
  }

  /**
   * Get quality level for a score
   *
   * @param {number} score - Quality score
   * @returns {Object} Quality level
   */
  getQualityLevel(score) {
    if (score >= EVIDENCE_QUALITY.HIGH.min) return EVIDENCE_QUALITY.HIGH;
    if (score >= EVIDENCE_QUALITY.MEDIUM.min) return EVIDENCE_QUALITY.MEDIUM;
    return EVIDENCE_QUALITY.LOW;
  }

  /**
   * Build evidence summary for an improvement
   *
   * @param {Object} improvement - Improvement to summarize
   * @param {Array} evidenceRecords - Evidence records
   * @returns {Object} Summary
   */
  buildEvidenceSummary(improvement, evidenceRecords = []) {
    if (evidenceRecords.length === 0) {
      return {
        improvement_id: improvement?.id,
        total_evidence: 0,
        quality_score: 0,
        quality_level: EVIDENCE_QUALITY.LOW,
        is_recurring: false,
        sources: {},
        recommendation: 'No evidence found - requires manual review'
      };
    }

    // Calculate aggregate scores
    const scores = evidenceRecords.map(e => this.calculateEvidenceScore(e));
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    // Count by source type
    const sources = {};
    for (const e of evidenceRecords) {
      sources[e.source_type] = (sources[e.source_type] || 0) + 1;
    }

    // Check for recurrence
    const isRecurring = evidenceRecords.some(e => e.is_recurring);
    const maxRecurrence = Math.max(...evidenceRecords.map(e => e.recurrence_count || 0));

    return {
      improvement_id: improvement?.id,
      total_evidence: evidenceRecords.length,
      quality_score: avgScore,
      quality_level: this.getQualityLevel(avgScore),
      is_recurring: isRecurring,
      max_recurrence: maxRecurrence,
      sources,
      individual_scores: scores,
      recommendation: this._getRecommendation(avgScore, isRecurring)
    };
  }

  /**
   * Calculate source quality score
   * @private
   */
  _calculateSourceQuality(source) {
    if (!source) return 30;

    const baseScores = {
      [EVIDENCE_SOURCE.RETROSPECTIVE]: 85,
      [EVIDENCE_SOURCE.ISSUE_PATTERN]: 75,
      [EVIDENCE_SOURCE.AI_GENERATED]: 55,
      [EVIDENCE_SOURCE.MANUAL]: 45
    };

    let score = baseScores[source.type] || 40;

    // Boost for metadata richness
    if (source.metadata) {
      const metadataKeys = Object.keys(source.metadata).length;
      score += Math.min(metadataKeys * 3, 15);
    }

    return Math.min(score, 100);
  }

  /**
   * Check recurrence count from cache
   * @private
   */
  _checkRecurrence(patternId) {
    let count = 0;
    for (const [_, evidence] of this.cache) {
      if (evidence.source_id === patternId) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get recommendation based on score and recurrence
   * @private
   */
  _getRecommendation(score, isRecurring) {
    if (score >= 80 && isRecurring) {
      return 'High evidence with recurrence - prioritize this improvement';
    } else if (score >= 80) {
      return 'High evidence quality - good candidate for auto-application';
    } else if (score >= 50 && isRecurring) {
      return 'Moderate evidence but recurring - investigate root cause';
    } else if (score >= 50) {
      return 'Moderate evidence - human review recommended';
    } else {
      return 'Low evidence quality - requires manual verification';
    }
  }

  /**
   * Clear the evidence cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const bySource = {};
    for (const [_, evidence] of this.cache) {
      bySource[evidence.source_type] = (bySource[evidence.source_type] || 0) + 1;
    }

    return {
      total_cached: this.cache.size,
      by_source: bySource
    };
  }
}

/**
 * Create an EvidenceSystem instance
 *
 * @param {Object} options - Configuration options
 * @returns {EvidenceSystem} System instance
 */
export function createEvidenceSystem(options = {}) {
  return new EvidenceSystem(options);
}

export default EvidenceSystem;
