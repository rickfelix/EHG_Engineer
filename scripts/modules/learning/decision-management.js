/**
 * Decision Management for /learn command
 *
 * Handles creating, executing, and rolling back learning decisions.
 * Extracted from executor.js for maintainability.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import path from 'path';
import { applyImprovement, resolvePatterns } from './improvement-appliers.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Calculate average confidence across all items
 */
function calculateAverageConfidence(context) {
  const allItems = [
    ...context.patterns,
    ...context.lessons,
    ...context.improvements
  ];

  if (allItems.length === 0) return 0;

  const sum = allItems.reduce((acc, item) => acc + (item.confidence || 50), 0);
  return Math.round(sum / allItems.length);
}

/**
 * Create a decision record in learning_decisions table
 */
export async function createDecisionRecord(context, decisions, sdId = null) {
  const record = {
    command_mode: 'learn',
    sd_id: sdId,
    surfaced_patterns: context.patterns,
    surfaced_lessons: context.lessons,
    surfaced_improvements: context.improvements,
    user_decisions: decisions,
    status: 'PENDING',
    confidence_score: calculateAverageConfidence(context),
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('learning_decisions')
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error('Error creating decision record:', error.message);
    return { id: `LOCAL-${Date.now()}`, ...record };
  }

  return data;
}

/**
 * Execute approved improvements
 * @param {Object} reviewedContext - The reviewed learning context
 * @param {Object} decisions - User decisions: { itemId: { status, reason, resolves_patterns?: [] } }
 * @param {string} sdId - Optional SD ID
 */
export async function executeApprovedImprovements(reviewedContext, decisions, sdId = null) {
  console.log('\nExecuting approved improvements...\n');

  const decisionRecord = await createDecisionRecord(reviewedContext, decisions, sdId);

  const executionLog = [];
  const appliedImprovements = [];
  const resolvedPatterns = [];
  const rollbackPayload = {};

  for (const [itemId, decision] of Object.entries(decisions)) {
    if (decision.status !== 'APPROVED') {
      executionLog.push({
        item_id: itemId,
        action: 'SKIPPED',
        reason: decision.reason || 'Not approved'
      });
      continue;
    }

    const improvement = reviewedContext.improvements.find(i => i.id === itemId);

    if (!improvement) {
      executionLog.push({
        item_id: itemId,
        action: 'ACKNOWLEDGED',
        note: 'Pattern/lesson acknowledged - no direct action required'
      });
      continue;
    }

    const result = await applyImprovement(improvement);
    executionLog.push({
      item_id: itemId,
      action: result.success ? 'APPLIED' : 'FAILED',
      details: result.action,
      error: result.error
    });

    if (result.success) {
      appliedImprovements.push(itemId);
      rollbackPayload[itemId] = result.rollback_data;

      if (decision.resolves_patterns && decision.resolves_patterns.length > 0) {
        const patternResults = await resolvePatterns(decision.resolves_patterns, itemId);
        resolvedPatterns.push(...patternResults.filter(r => r.success).map(r => r.pattern_id));
        executionLog.push({
          item_id: itemId,
          action: 'PATTERNS_RESOLVED',
          patterns: decision.resolves_patterns,
          results: patternResults
        });
      }
    }
  }

  const updatePayload = {
    improvements_applied: appliedImprovements,
    execution_log: executionLog,
    rollback_payload: rollbackPayload,
    status: 'COMPLETED',
    updated_at: new Date().toISOString()
  };

  if (decisionRecord.id && !decisionRecord.id.startsWith('LOCAL-')) {
    await supabase
      .from('learning_decisions')
      .update(updatePayload)
      .eq('id', decisionRecord.id);
  }

  if (appliedImprovements.length > 0) {
    try {
      console.log('\nRegenerating CLAUDE.md...');
      const scriptPath = path.join(process.cwd(), 'scripts/generate-claude-md-from-db.js');
      execSync(`node ${scriptPath}`, { stdio: 'inherit' });
      console.log('CLAUDE.md regenerated successfully.');
    } catch (error) {
      console.warn('Warning: Could not regenerate CLAUDE.md:', error.message);
    }
  }

  return {
    decision_id: decisionRecord.id,
    applied_count: appliedImprovements.length,
    applied_improvements: appliedImprovements,
    resolved_patterns: resolvedPatterns,
    execution_log: executionLog,
    rollback_available: Object.keys(rollbackPayload).length > 0
  };
}

/**
 * Rollback a previous decision
 */
export async function rollbackDecision(decisionId) {
  const { data: decision, error } = await supabase
    .from('learning_decisions')
    .select('*')
    .eq('id', decisionId)
    .single();

  if (error || !decision) {
    throw new Error(`Decision not found: ${decisionId}`);
  }

  if (decision.status !== 'COMPLETED') {
    throw new Error(`Cannot rollback decision with status: ${decision.status}`);
  }

  const rollbackLog = [];

  for (const [itemId, rollbackData] of Object.entries(decision.rollback_payload || {})) {
    try {
      console.log(`Rolling back: ${itemId}`);
      rollbackLog.push({
        item_id: itemId,
        action: 'ROLLED_BACK',
        details: `Restored to state before ${rollbackData.applied_at}`
      });

      await supabase
        .from('protocol_improvement_queue')
        .update({ status: 'PENDING' })
        .eq('id', itemId);

    } catch (err) {
      rollbackLog.push({
        item_id: itemId,
        action: 'ROLLBACK_FAILED',
        error: err.message
      });
    }
  }

  await supabase
    .from('learning_decisions')
    .update({
      status: 'ROLLED_BACK',
      execution_log: [...(decision.execution_log || []), ...rollbackLog],
      updated_at: new Date().toISOString()
    })
    .eq('id', decisionId);

  return {
    decision_id: decisionId,
    rollback_log: rollbackLog,
    success: rollbackLog.every(l => l.action === 'ROLLED_BACK')
  };
}
