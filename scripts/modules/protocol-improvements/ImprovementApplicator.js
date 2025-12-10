#!/usr/bin/env node
/**
 * ImprovementApplicator - Apply approved protocol improvements to database
 *
 * Purpose:
 * - Apply queued improvements to target database tables
 * - Handle different improvement types (validation rules, checklists, skills, etc.)
 * - Regenerate markdown files from database after applying changes
 * - Track application history for rollback capability
 *
 * CRITICAL: This module ONLY writes to database, NEVER directly to markdown files
 *
 * Usage:
 * ```js
 * const applicator = new ImprovementApplicator(client);
 * await applicator.applyImprovement(queueId);
 * await applicator.applyAllAutoApplicable();
 * await applicator.regenerateMarkdown();
 * ```
 */

import { createDatabaseClient } from '../../lib/supabase-connection.js';
import { execSync } from 'child_process';
import path from 'path';

export class ImprovementApplicator {
  constructor(client) {
    this.client = client;
    this.appliedCount = 0;
    this.errorCount = 0;
  }

  /**
   * Apply a single improvement from the queue
   * @param {string} queueId - UUID of queued improvement
   * @returns {Promise<Object>} Application result
   */
  async applyImprovement(queueId) {
    // Fetch improvement from queue
    const result = await this.client.query(
      'SELECT * FROM protocol_improvement_queue WHERE id = $1',
      [queueId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Improvement ${queueId} not found in queue`);
    }

    const improvement = result.rows[0];

    // Validate status
    if (improvement.status === 'applied') {
      throw new Error(`Improvement ${queueId} has already been applied`);
    }

    if (improvement.status === 'rejected') {
      throw new Error(`Improvement ${queueId} has been rejected`);
    }

    // Apply based on improvement type
    let applicationResult;
    try {
      applicationResult = await this._applyByType(improvement);
    } catch (error) {
      // Mark as failed
      await this.client.query(
        `UPDATE protocol_improvement_queue
         SET status = 'rejected',
             metadata = metadata || $1::jsonb
         WHERE id = $2`,
        [JSON.stringify({ error: error.message, failed_at: new Date().toISOString() }), queueId]
      );
      throw error;
    }

    // Mark as applied
    await this.client.query(
      `UPDATE protocol_improvement_queue
       SET status = 'applied',
           applied_at = NOW(),
           applied_by = $1,
           metadata = metadata || $2::jsonb
       WHERE id = $3`,
      ['ImprovementApplicator', JSON.stringify(applicationResult), queueId]
    );

    this.appliedCount++;

    return {
      success: true,
      improvement_id: queueId,
      improvement_type: improvement.improvement_type,
      target_table: improvement.target_table,
      ...applicationResult
    };
  }

  /**
   * Apply all auto-applicable improvements that meet evidence threshold
   * @param {number} evidenceThreshold - Minimum evidence count (default: 3)
   * @returns {Promise<Object[]>} Array of application results
   */
  async applyAllAutoApplicable(evidenceThreshold = 3) {
    const result = await this.client.query(
      `SELECT id, improvement_text, improvement_type
       FROM protocol_improvement_queue
       WHERE status = 'pending'
         AND auto_applicable = TRUE
         AND evidence_count >= $1
       ORDER BY priority DESC, evidence_count DESC`,
      [evidenceThreshold]
    );

    console.log(`Found ${result.rows.length} auto-applicable improvements (evidence >= ${evidenceThreshold})`);

    const results = [];

    for (const row of result.rows) {
      try {
        console.log(`Applying: ${row.improvement_text.substring(0, 60)}...`);
        const applicationResult = await this.applyImprovement(row.id);
        results.push(applicationResult);
      } catch (error) {
        console.error(`Failed to apply ${row.id}:`, error.message);
        this.errorCount++;
        results.push({
          success: false,
          improvement_id: row.id,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Regenerate CLAUDE.md and other markdown files from database
   * @returns {Promise<Object>} Regeneration result
   */
  async regenerateMarkdown() {
    console.log('Regenerating CLAUDE.md from database...');

    try {
      const scriptPath = path.join(process.cwd(), 'scripts', 'generate-claude-md-from-db.js');
      const output = execSync(`node ${scriptPath}`, {
        encoding: 'utf-8',
        cwd: process.cwd()
      });

      console.log(output);

      return {
        success: true,
        message: 'CLAUDE.md regenerated successfully',
        output
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to regenerate CLAUDE.md',
        error: error.message
      };
    }
  }

  /**
   * Get summary of application session
   * @returns {Object} Summary statistics
   */
  getSummary() {
    return {
      applied: this.appliedCount,
      errors: this.errorCount,
      success_rate: this.appliedCount + this.errorCount > 0
        ? (this.appliedCount / (this.appliedCount + this.errorCount) * 100).toFixed(1)
        : 0
    };
  }

  // ============================================================================
  // PRIVATE APPLICATION METHODS BY TYPE
  // ============================================================================

  async _applyByType(improvement) {
    const handlers = {
      'VALIDATION_RULE': this._applyValidationRule.bind(this),
      'CHECKLIST_ITEM': this._applyChecklistItem.bind(this),
      'SKILL_UPDATE': this._applySkillUpdate.bind(this),
      'PROTOCOL_SECTION': this._applyProtocolSection.bind(this),
      'SUB_AGENT_CONFIG': this._applySubAgentConfig.bind(this),
      'TRIGGER_PATTERN': this._applyTriggerPattern.bind(this),
      'WORKFLOW_PHASE': this._applyWorkflowPhase.bind(this),
      'HANDOFF_TEMPLATE': this._applyHandoffTemplate.bind(this)
    };

    const handler = handlers[improvement.improvement_type];
    if (!handler) {
      throw new Error(`Unknown improvement type: ${improvement.improvement_type}`);
    }

    return await handler(improvement);
  }

  async _applyValidationRule(improvement) {
    // Insert into handoff_validation_rules or similar table
    // Note: Table structure may vary, this is a template
    const result = await this.client.query(
      `INSERT INTO handoff_validation_rules (
        rule_name,
        rule_type,
        rule_definition,
        severity,
        affected_phase,
        enabled,
        created_by,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7)
      RETURNING id`,
      [
        this._extractRuleName(improvement.improvement_text),
        'protocol_improvement',
        improvement.improvement_text,
        this._mapImpactToSeverity(improvement.impact),
        improvement.affected_phase,
        'ImprovementApplicator',
        JSON.stringify({
          source: 'protocol_improvement_queue',
          queue_id: improvement.id,
          evidence_count: improvement.evidence_count
        })
      ]
    );

    return {
      inserted_id: result.rows[0].id,
      table: 'handoff_validation_rules'
    };
  }

  async _applyChecklistItem(improvement) {
    // Get active protocol
    const protocolResult = await this.client.query(
      'SELECT id FROM leo_protocols WHERE status = \'active\' LIMIT 1'
    );

    if (protocolResult.rows.length === 0) {
      throw new Error('No active protocol found');
    }

    const protocolId = protocolResult.rows[0].id;

    // Determine section type and order
    const sectionType = this._determineSectionType(improvement);
    const orderIndex = await this._getNextOrderIndex(protocolId, sectionType);

    // Insert checklist item into leo_protocol_sections
    const result = await this.client.query(
      `INSERT INTO leo_protocol_sections (
        protocol_id,
        section_type,
        title,
        content,
        order_index,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id`,
      [
        protocolId,
        sectionType,
        this._extractTitle(improvement.improvement_text),
        improvement.improvement_text,
        orderIndex,
        JSON.stringify({
          source: 'protocol_improvement_queue',
          queue_id: improvement.id,
          category: improvement.category,
          affected_phase: improvement.affected_phase
        })
      ]
    );

    return {
      inserted_id: result.rows[0].id,
      table: 'leo_protocol_sections',
      section_type: sectionType
    };
  }

  async _applySkillUpdate(improvement) {
    // Check if this is an update to existing skill or new skill
    const skillName = this._extractSkillName(improvement.improvement_text);

    // Try to find existing skill
    const existing = await this.client.query(
      'SELECT id FROM leo_skills WHERE skill_name ILIKE $1 LIMIT 1',
      [`%${skillName}%`]
    );

    if (existing.rows.length > 0) {
      // Update existing skill
      const result = await this.client.query(
        `UPDATE leo_skills
         SET skill_content = skill_content || E'\n\n--- Protocol Improvement ---\n' || $1,
             updated_at = NOW(),
             metadata = metadata || $2::jsonb
         WHERE id = $3
         RETURNING id`,
        [
          improvement.improvement_text,
          JSON.stringify({ improved_from_queue: improvement.id }),
          existing.rows[0].id
        ]
      );

      return {
        updated_id: result.rows[0].id,
        table: 'leo_skills',
        action: 'updated'
      };
    } else {
      // Create new skill
      const result = await this.client.query(
        `INSERT INTO leo_skills (
          skill_name,
          skill_category,
          skill_content,
          metadata
        ) VALUES ($1, $2, $3, $4)
        RETURNING id`,
        [
          skillName,
          improvement.category,
          improvement.improvement_text,
          JSON.stringify({
            source: 'protocol_improvement_queue',
            queue_id: improvement.id
          })
        ]
      );

      return {
        inserted_id: result.rows[0].id,
        table: 'leo_skills',
        action: 'created'
      };
    }
  }

  async _applyProtocolSection(improvement) {
    // Similar to checklist item but for general protocol sections
    const protocolResult = await this.client.query(
      'SELECT id FROM leo_protocols WHERE status = \'active\' LIMIT 1'
    );

    if (protocolResult.rows.length === 0) {
      throw new Error('No active protocol found');
    }

    const protocolId = protocolResult.rows[0].id;
    const sectionType = this._determineSectionType(improvement);
    const orderIndex = await this._getNextOrderIndex(protocolId, sectionType);

    const result = await this.client.query(
      `INSERT INTO leo_protocol_sections (
        protocol_id,
        section_type,
        title,
        content,
        order_index,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id`,
      [
        protocolId,
        sectionType,
        this._extractTitle(improvement.improvement_text),
        improvement.improvement_text,
        orderIndex,
        JSON.stringify({
          source: 'protocol_improvement_queue',
          queue_id: improvement.id,
          category: improvement.category
        })
      ]
    );

    return {
      inserted_id: result.rows[0].id,
      table: 'leo_protocol_sections',
      section_type: sectionType
    };
  }

  async _applySubAgentConfig(improvement) {
    // Update sub-agent configuration
    const agentCode = this._extractAgentCode(improvement.improvement_text);

    const result = await this.client.query(
      `UPDATE leo_sub_agents
       SET metadata = metadata || $1::jsonb,
           description = CASE
             WHEN $2 THEN description || E'\n\nImprovement: ' || $3
             ELSE description
           END
       WHERE code = $4
       RETURNING id`,
      [
        JSON.stringify({ improvement_applied: improvement.id }),
        improvement.improvement_text.length < 500,
        improvement.improvement_text,
        agentCode
      ]
    );

    if (result.rows.length === 0) {
      throw new Error(`Sub-agent ${agentCode} not found`);
    }

    return {
      updated_id: result.rows[0].id,
      table: 'leo_sub_agents',
      agent_code: agentCode
    };
  }

  async _applyTriggerPattern(improvement) {
    // Extract trigger phrase and agent
    const { agentCode, triggerPhrase } = this._extractTriggerInfo(improvement.improvement_text);

    // Find sub-agent
    const agentResult = await this.client.query(
      'SELECT id FROM leo_sub_agents WHERE code = $1',
      [agentCode]
    );

    if (agentResult.rows.length === 0) {
      throw new Error(`Sub-agent ${agentCode} not found`);
    }

    // Insert trigger
    const result = await this.client.query(
      `INSERT INTO leo_sub_agent_triggers (
        sub_agent_id,
        trigger_phrase,
        trigger_type,
        trigger_context,
        priority,
        active,
        metadata
      ) VALUES ($1, $2, 'keyword', 'PRD', $3, TRUE, $4)
      ON CONFLICT (sub_agent_id, trigger_phrase, trigger_context) DO UPDATE
      SET priority = EXCLUDED.priority,
          metadata = leo_sub_agent_triggers.metadata || EXCLUDED.metadata
      RETURNING id`,
      [
        agentResult.rows[0].id,
        triggerPhrase,
        improvement.priority,
        JSON.stringify({
          source: 'protocol_improvement_queue',
          queue_id: improvement.id
        })
      ]
    );

    return {
      inserted_id: result.rows[0].id,
      table: 'leo_sub_agent_triggers',
      agent_code: agentCode,
      trigger_phrase: triggerPhrase
    };
  }

  async _applyWorkflowPhase(improvement) {
    // Update workflow phase configuration
    throw new Error('Workflow phase improvements require manual application (too risky for auto-apply)');
  }

  async _applyHandoffTemplate(improvement) {
    // Update handoff template
    throw new Error('Handoff template improvements require manual application (structural changes)');
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  _extractRuleName(text) {
    // Extract a concise rule name from improvement text
    const words = text.split(' ').slice(0, 5);
    return words.join(' ').replace(/[^a-zA-Z0-9\s]/g, '');
  }

  _extractTitle(text) {
    // Extract title (first sentence or first 60 chars)
    const firstSentence = text.split('.')[0];
    return firstSentence.substring(0, 60);
  }

  _extractSkillName(text) {
    // Extract skill name from improvement text
    const match = text.match(/skill[:\s]+([a-zA-Z0-9-_]+)/i);
    if (match) return match[1];

    // Fallback: use first few words
    return text.split(' ').slice(0, 3).join('-').toLowerCase();
  }

  _extractAgentCode(text) {
    // Extract agent code from text
    const match = text.match(/\b(SECURITY|PERFORMANCE|DESIGN|TESTING|DATABASE|COST|DOCS|API)\b/i);
    return match ? match[1].toUpperCase() : 'SECURITY'; // Default fallback
  }

  _extractTriggerInfo(text) {
    // Extract agent and trigger phrase
    const agentMatch = text.match(/\b(SECURITY|PERFORMANCE|DESIGN|TESTING|DATABASE|COST|DOCS|API)\b/i);
    const agentCode = agentMatch ? agentMatch[1].toUpperCase() : 'SECURITY';

    const triggerMatch = text.match(/trigger[:\s]+"([^"]+)"/i) || text.match(/keyword[:\s]+"([^"]+)"/i);
    const triggerPhrase = triggerMatch ? triggerMatch[1] : text.split(' ').slice(0, 3).join(' ');

    return { agentCode, triggerPhrase };
  }

  _determineSectionType(improvement) {
    const phase = improvement.affected_phase;
    if (phase === 'LEAD') return 'lead_checklist';
    if (phase === 'PLAN') return 'plan_checklist';
    if (phase === 'EXEC') return 'exec_checklist';

    const category = improvement.category.toLowerCase();
    if (category.includes('validation')) return 'validation_rules';
    if (category.includes('best_practice')) return 'best_practices';
    if (category.includes('workflow')) return 'workflow_guide';

    return 'protocol_improvement';
  }

  async _getNextOrderIndex(protocolId, sectionType) {
    const result = await this.client.query(
      `SELECT COALESCE(MAX(order_index), 0) + 1 as next_index
       FROM leo_protocol_sections
       WHERE protocol_id = $1 AND section_type = $2`,
      [protocolId, sectionType]
    );

    return result.rows[0].next_index;
  }

  _mapImpactToSeverity(impact) {
    const impactLower = (impact || '').toLowerCase();
    if (impactLower.includes('critical') || impactLower.includes('blocking')) return 'error';
    if (impactLower.includes('high')) return 'error';
    if (impactLower.includes('medium')) return 'warning';
    return 'info';
  }
}

/**
 * Standalone function to apply a single improvement
 * @param {string} queueId - Improvement queue ID
 * @returns {Promise<Object>} Application result
 */
export async function applyImprovement(queueId) {
  const client = await createDatabaseClient('engineer', { verbose: false });

  try {
    const applicator = new ImprovementApplicator(client);
    const result = await applicator.applyImprovement(queueId);
    await applicator.regenerateMarkdown();
    return result;
  } finally {
    await client.end();
  }
}

/**
 * Standalone function to apply all auto-applicable improvements
 * @param {number} evidenceThreshold - Minimum evidence count
 * @returns {Promise<Object>} Application summary
 */
export async function applyAllAutoApplicable(evidenceThreshold = 3) {
  const client = await createDatabaseClient('engineer', { verbose: false });

  try {
    const applicator = new ImprovementApplicator(client);
    const results = await applicator.applyAllAutoApplicable(evidenceThreshold);

    console.log('\nApplying protocol improvements to database...');
    const summary = applicator.getSummary();
    console.log(`\n✅ Applied: ${summary.applied}`);
    console.log(`❌ Errors: ${summary.errors}`);
    console.log(`📊 Success Rate: ${summary.success_rate}%`);

    // Regenerate markdown after all applications
    if (summary.applied > 0) {
      await applicator.regenerateMarkdown();
    }

    return { results, summary };
  } finally {
    await client.end();
  }
}
