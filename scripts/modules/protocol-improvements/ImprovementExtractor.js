#!/usr/bin/env node
/**
 * ImprovementExtractor - Extract actionable protocol improvements from retrospectives
 *
 * Purpose:
 * - Parse retrospectives for protocol improvement suggestions
 * - Categorize improvements by type (validation rule, checklist, skill, etc.)
 * - Map improvements to target database tables
 * - Track evidence count for auto-application eligibility
 *
 * Usage:
 * ```js
 * const extractor = new ImprovementExtractor(client);
 * const improvements = await extractor.extractFromRetrospective(retroId);
 * const queuedCount = await extractor.queueImprovements(improvements);
 * ```
 */

import { createDatabaseClient } from '../../lib/supabase-connection.js';

export class ImprovementExtractor {
  constructor(client) {
    this.client = client;
  }

  /**
   * Extract improvements from a single retrospective
   * @param {string} retroId - UUID of retrospective
   * @returns {Promise<Object[]>} Array of improvement objects
   */
  async extractFromRetrospective(retroId) {
    const result = await this.client.query(
      `SELECT
        id,
        sd_id,
        title,
        learning_category,
        protocol_improvements,
        failure_patterns,
        what_needs_improvement,
        action_items,
        conducted_date,
        quality_score
      FROM retrospectives
      WHERE id = $1`,
      [retroId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Retrospective ${retroId} not found`);
    }

    const retro = result.rows[0];
    const improvements = [];

    // Extract from protocol_improvements JSONB field
    if (retro.protocol_improvements && Array.isArray(retro.protocol_improvements)) {
      const extracted = this.extractFromProtocolImprovements(retro.protocol_improvements);
      improvements.push(...extracted.map(imp => ({
        ...imp,
        retro_id: retro.id,
        sd_id: retro.sd_id,
        conducted_date: retro.conducted_date,
        quality_score: retro.quality_score,
        source: 'protocol_improvements'
      })));
    }

    // Extract from failure_patterns
    if (retro.failure_patterns && retro.failure_patterns.length > 0) {
      const extracted = this.extractFromFailurePatterns(retro.failure_patterns);
      improvements.push(...extracted.map(imp => ({
        ...imp,
        retro_id: retro.id,
        sd_id: retro.sd_id,
        conducted_date: retro.conducted_date,
        quality_score: retro.quality_score,
        source: 'failure_patterns'
      })));
    }

    // Extract from what_needs_improvement and action_items for PROCESS_IMPROVEMENT category
    if (retro.learning_category === 'PROCESS_IMPROVEMENT') {
      const extracted = this._extractFromGenericFields(
        retro.what_needs_improvement,
        retro.action_items
      );
      improvements.push(...extracted.map(imp => ({
        ...imp,
        retro_id: retro.id,
        sd_id: retro.sd_id,
        conducted_date: retro.conducted_date,
        quality_score: retro.quality_score,
        source: 'what_needs_improvement'
      })));
    }

    return improvements;
  }

  /**
   * Parse protocol_improvements JSONB array
   * @param {Array} jsonbArray - protocol_improvements field value
   * @returns {Object[]} Extracted improvements
   */
  extractFromProtocolImprovements(jsonbArray) {
    return jsonbArray.map(item => {
      const improvementType = this._classifyImprovementType(item);
      const targetTable = this.mapToTargetTable(improvementType);

      return {
        improvement_type: improvementType,
        target_table: targetTable,
        category: item.category || 'general',
        improvement_text: item.improvement || '',
        evidence: item.evidence || '',
        impact: item.impact || '',
        affected_phase: item.affected_phase || null,
        auto_applicable: this._isAutoApplicable(item, improvementType),
        priority: this._calculatePriority(item)
      };
    });
  }

  /**
   * Extract improvements from failure patterns
   * @param {Array} patterns - failure_patterns array from retrospective
   * @returns {Object[]} Extracted improvements
   */
  extractFromFailurePatterns(patterns) {
    const improvements = [];

    for (const pattern of patterns) {
      // Only process patterns related to process/protocol issues
      if (!this._isProcessRelated(pattern)) {
        continue;
      }

      const improvementType = this._classifyFailurePattern(pattern);
      const targetTable = this.mapToTargetTable(improvementType);

      improvements.push({
        improvement_type: improvementType,
        target_table: targetTable,
        category: 'failure_prevention',
        improvement_text: this._deriveImprovementFromFailure(pattern),
        evidence: pattern,
        impact: 'Prevent recurring failure',
        affected_phase: this._extractPhaseFromPattern(pattern),
        auto_applicable: false, // Failures need manual review
        priority: this._calculateFailurePriority(pattern)
      });
    }

    return improvements;
  }

  /**
   * Map improvement type to database table
   * @param {string} improvementType - Type of improvement
   * @returns {string} Target database table name
   */
  mapToTargetTable(improvementType) {
    const mapping = {
      'VALIDATION_RULE': 'handoff_validation_rules',
      'CHECKLIST_ITEM': 'leo_protocol_sections',
      'SKILL_UPDATE': 'leo_skills',
      'PROTOCOL_SECTION': 'leo_protocol_sections',
      'SUB_AGENT_CONFIG': 'leo_sub_agents',
      'TRIGGER_PATTERN': 'leo_sub_agent_triggers',
      'WORKFLOW_PHASE': 'leo_workflow_phases',
      'AGENT_CAPABILITY': 'leo_agents',
      'HANDOFF_TEMPLATE': 'leo_handoff_templates'
    };

    return mapping[improvementType] || 'leo_protocol_sections';
  }

  /**
   * Queue improvements for review/application
   * @param {Object[]} improvements - Extracted improvements
   * @returns {Promise<number>} Number of improvements queued
   */
  async queueImprovements(improvements) {
    if (improvements.length === 0) {
      return 0;
    }

    // Check if improvement_queue table exists, create if not
    await this._ensureImprovementQueueTable();

    let queuedCount = 0;

    for (const improvement of improvements) {
      // Check if similar improvement already exists
      const existing = await this._findSimilarImprovement(improvement);

      if (existing) {
        // Increment evidence count
        await this.client.query(
          `UPDATE protocol_improvement_queue
           SET evidence_count = evidence_count + 1,
               last_seen_at = NOW(),
               related_retro_ids = array_append(related_retro_ids, $1)
           WHERE id = $2`,
          [improvement.retro_id, existing.id]
        );
      } else {
        // Insert new improvement
        await this.client.query(
          `INSERT INTO protocol_improvement_queue (
            improvement_type,
            target_table,
            category,
            improvement_text,
            evidence,
            impact,
            affected_phase,
            auto_applicable,
            priority,
            evidence_count,
            related_retro_ids,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, 'pending')`,
          [
            improvement.improvement_type,
            improvement.target_table,
            improvement.category,
            improvement.improvement_text,
            improvement.evidence,
            improvement.impact,
            improvement.affected_phase,
            improvement.auto_applicable,
            improvement.priority,
            [improvement.retro_id]
          ]
        );
        queuedCount++;
      }
    }

    return queuedCount;
  }

  /**
   * Extract improvements from all retrospectives since a date
   * @param {Date|null} sinceDate - Start date (null for all)
   * @returns {Promise<Object[]>} All extracted improvements
   */
  async extractFromAllRetrospectives(sinceDate = null) {
    const query = sinceDate
      ? 'SELECT id FROM retrospectives WHERE conducted_date >= $1 ORDER BY conducted_date DESC'
      : 'SELECT id FROM retrospectives ORDER BY conducted_date DESC';

    const params = sinceDate ? [sinceDate] : [];
    const result = await this.client.query(query, params);

    const allImprovements = [];

    for (const row of result.rows) {
      try {
        const improvements = await this.extractFromRetrospective(row.id);
        allImprovements.push(...improvements);
      } catch (error) {
        console.error(`Error extracting from retro ${row.id}:`, error.message);
      }
    }

    return allImprovements;
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  _classifyImprovementType(item) {
    const text = (item.improvement || '').toLowerCase();
    const category = (item.category || '').toLowerCase();

    if (text.includes('validation') || text.includes('validate') || category.includes('validation')) {
      return 'VALIDATION_RULE';
    }
    if (text.includes('checklist') || text.includes('check that') || category.includes('checklist')) {
      return 'CHECKLIST_ITEM';
    }
    if (text.includes('skill') || text.includes('guidance') || category.includes('skill')) {
      return 'SKILL_UPDATE';
    }
    if (text.includes('trigger') || text.includes('activation') || category.includes('trigger')) {
      return 'TRIGGER_PATTERN';
    }
    if (text.includes('sub-agent') || text.includes('subagent') || category.includes('sub-agent')) {
      return 'SUB_AGENT_CONFIG';
    }
    if (text.includes('workflow') || text.includes('phase') || category.includes('workflow')) {
      return 'WORKFLOW_PHASE';
    }
    if (text.includes('handoff') || category.includes('handoff')) {
      return 'HANDOFF_TEMPLATE';
    }

    return 'PROTOCOL_SECTION';
  }

  _classifyFailurePattern(pattern) {
    const text = pattern.toLowerCase();

    if (text.includes('missing validation') || text.includes('not validated')) {
      return 'VALIDATION_RULE';
    }
    if (text.includes('forgot to') || text.includes('missed step')) {
      return 'CHECKLIST_ITEM';
    }
    if (text.includes('unclear') || text.includes('ambiguous')) {
      return 'PROTOCOL_SECTION';
    }

    return 'PROTOCOL_SECTION';
  }

  _isProcessRelated(pattern) {
    const processKeywords = [
      'protocol', 'workflow', 'process', 'handoff', 'validation',
      'checklist', 'phase', 'gate', 'approval', 'review'
    ];

    const text = pattern.toLowerCase();
    return processKeywords.some(keyword => text.includes(keyword));
  }

  _deriveImprovementFromFailure(pattern) {
    // Convert failure pattern to actionable improvement
    if (pattern.toLowerCase().includes('missing')) {
      return `Add validation to prevent: ${pattern}`;
    }
    if (pattern.toLowerCase().includes('unclear')) {
      return `Clarify protocol section regarding: ${pattern}`;
    }
    return `Prevent recurrence of: ${pattern}`;
  }

  _extractPhaseFromPattern(pattern) {
    const text = pattern.toLowerCase();
    if (text.includes('lead') || text.includes('approval')) return 'LEAD';
    if (text.includes('plan') || text.includes('prd')) return 'PLAN';
    if (text.includes('exec') || text.includes('implementation')) return 'EXEC';
    return null;
  }

  _isAutoApplicable(item, improvementType) {
    // Only simple, non-invasive improvements can be auto-applied
    const safeTypes = ['CHECKLIST_ITEM', 'PROTOCOL_SECTION'];
    const hasLowImpact = (item.impact || '').toLowerCase().includes('low');

    return safeTypes.includes(improvementType) && hasLowImpact;
  }

  _calculatePriority(item) {
    const impact = (item.impact || '').toLowerCase();
    const evidence = (item.evidence || '').toLowerCase();

    if (impact.includes('critical') || impact.includes('blocking')) return 90;
    if (impact.includes('high') || evidence.includes('multiple')) return 70;
    if (impact.includes('medium')) return 50;
    return 30;
  }

  _calculateFailurePriority(pattern) {
    const text = pattern.toLowerCase();
    if (text.includes('critical') || text.includes('blocker')) return 95;
    if (text.includes('high') || text.includes('severe')) return 80;
    return 60;
  }

  _extractFromGenericFields(whatNeedsImprovement, _actionItems) {
    const improvements = [];

    // Parse what_needs_improvement JSONB
    if (whatNeedsImprovement && Array.isArray(whatNeedsImprovement)) {
      for (const item of whatNeedsImprovement) {
        if (this._isProcessRelated(item.issue || item.text || '')) {
          improvements.push({
            improvement_type: 'PROTOCOL_SECTION',
            target_table: 'leo_protocol_sections',
            category: 'continuous_improvement',
            improvement_text: item.improvement || item.solution || 'Review and improve process',
            evidence: item.issue || item.text || '',
            impact: item.priority || 'medium',
            affected_phase: null,
            auto_applicable: false,
            priority: 40
          });
        }
      }
    }

    return improvements;
  }

  async _findSimilarImprovement(improvement) {
    // Use text similarity to find duplicates
    const result = await this.client.query(
      `SELECT id, improvement_text, evidence_count
       FROM protocol_improvement_queue
       WHERE improvement_type = $1
         AND target_table = $2
         AND status IN ('pending', 'approved')
         AND similarity(improvement_text, $3) > 0.6
       ORDER BY similarity(improvement_text, $3) DESC
       LIMIT 1`,
      [improvement.improvement_type, improvement.target_table, improvement.improvement_text]
    );

    return result.rows[0] || null;
  }

  async _ensureImprovementQueueTable() {
    // Create table if it doesn't exist
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS protocol_improvement_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        improvement_type TEXT NOT NULL,
        target_table TEXT NOT NULL,
        category TEXT NOT NULL,
        improvement_text TEXT NOT NULL,
        evidence TEXT,
        impact TEXT,
        affected_phase TEXT CHECK (affected_phase IN ('LEAD', 'PLAN', 'EXEC', NULL)),
        auto_applicable BOOLEAN DEFAULT FALSE,
        priority INTEGER DEFAULT 50,
        evidence_count INTEGER DEFAULT 1,
        related_retro_ids UUID[] DEFAULT '{}',
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'applied', 'rejected', 'ineffective')),
        applied_at TIMESTAMPTZ,
        applied_by TEXT,
        effectiveness_score INTEGER,
        reoccurrence_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_improvement_queue_status ON protocol_improvement_queue(status);
      CREATE INDEX IF NOT EXISTS idx_improvement_queue_type ON protocol_improvement_queue(improvement_type);
      CREATE INDEX IF NOT EXISTS idx_improvement_queue_priority ON protocol_improvement_queue(priority DESC, evidence_count DESC);
      CREATE INDEX IF NOT EXISTS idx_improvement_queue_auto_applicable ON protocol_improvement_queue(auto_applicable, evidence_count) WHERE status = 'pending';
    `);

    // Enable pg_trgm extension for similarity matching if not already enabled
    await this.client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
  }
}

/**
 * Standalone function to extract from a single retrospective
 * @param {string} retroId - Retrospective UUID
 * @returns {Promise<Object[]>} Extracted improvements
 */
export async function extractFromRetrospective(retroId) {
  const client = await createDatabaseClient('engineer', { verbose: false });

  try {
    const extractor = new ImprovementExtractor(client);
    return await extractor.extractFromRetrospective(retroId);
  } finally {
    await client.end();
  }
}

/**
 * Standalone function to extract and queue improvements from all retrospectives
 * @param {Date|null} sinceDate - Optional start date
 * @returns {Promise<number>} Number of improvements queued
 */
export async function extractAndQueueAll(sinceDate = null) {
  const client = await createDatabaseClient('engineer', { verbose: false });

  try {
    const extractor = new ImprovementExtractor(client);
    const improvements = await extractor.extractFromAllRetrospectives(sinceDate);
    const queuedCount = await extractor.queueImprovements(improvements);

    console.log(`✅ Extracted ${improvements.length} improvements from retrospectives`);
    console.log(`✅ Queued ${queuedCount} new improvements (duplicates updated)`);

    return queuedCount;
  } finally {
    await client.end();
  }
}
