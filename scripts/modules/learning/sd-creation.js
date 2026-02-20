/**
 * SD Creation module for /learn command
 *
 * Handles creating Strategic Directives from learning items.
 * Extracted from executor.js for maintainability.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { runTriageGate } from '../triage-gate.js';

import {
  buildSDDescription,
  buildSDTitle,
  buildSuccessMetrics,
  buildSuccessCriteria,
  buildSmokeTestSteps,
  buildStrategicObjectives,
  buildKeyPrinciples,
  buildRisks,
  buildKeyChanges
} from './sd-builders.js';

import {
  classifyComplexity,
  generateSDId,
  checkExistingAssignments
} from './classification.js';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Create SD in strategic_directives_v2 from learning items
 * @param {Array} items - Selected patterns and improvements
 * @param {'quick-fix' | 'full-sd'} type
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.skipLeadValidation] - Skip protocol file read check (for CLI/auto-approve)
 * @returns {Promise<{id: string, success: boolean, error?: string}>}
 */
export async function createSDFromLearning(items, type, options = {}) {
  const title = buildSDTitle(items);
  const sdKey = await generateSDId(type, title, { skipLeadValidation: options.skipLeadValidation });
  const description = buildSDDescription(items);
  const successMetrics = buildSuccessMetrics(items);
  const successCriteria = buildSuccessCriteria(items);
  const smokeTestSteps = buildSmokeTestSteps(items);
  const strategicObjectives = buildStrategicObjectives(items);
  const keyPrinciples = buildKeyPrinciples(items);
  const risks = buildRisks(items);
  const keyChanges = buildKeyChanges(items);

  const sdData = {
    id: sdKey,
    sd_key: sdKey,
    title: title,
    description: description,
    rationale: `Accumulated ${items.length} item(s) from retrospectives and pattern analysis via /learn command.`,
    scope: 'Address identified patterns and implement suggested improvements.',
    status: 'draft',
    priority: type === 'quick-fix' ? 'medium' : 'high',
    category: type === 'quick-fix' ? 'bug_fix' : 'infrastructure',
    sd_type: type === 'quick-fix' ? 'feature' : 'infrastructure',
    current_phase: 'LEAD',
    target_application: 'EHG_Engineer',
    created_by: 'LEARN-Agent',
    created_at: new Date().toISOString(),
    success_metrics: successMetrics,
    success_criteria: successCriteria,
    smoke_test_steps: smokeTestSteps,
    strategic_objectives: strategicObjectives,
    key_principles: keyPrinciples,
    key_changes: keyChanges,
    risks: risks,
    metadata: {
      source: 'learn_command',
      source_items: items.map(i => i.id || i.pattern_id),
      classification: type,
      created_via: '/learn apply'
    }
  };

  // Informational triage gate: log tier recommendation (non-blocking — /learn has
  // already classified this as an SD through its approval flow).
  try {
    const triage = await runTriageGate(
      { title, description: description.substring(0, 300), type: sdData.sd_type, source: 'learn' },
      supabase
    );
    if (triage?.tier <= 2) {
      console.log(`   ℹ️  Triage suggests Quick-Fix (Tier ${triage.tier}, ~${triage.estimatedLoc} LOC) — proceeding as SD per /learn approval`);
    }
  } catch {
    // Triage gate is informational — never block SD creation
  }

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select('id, sd_key, title, status')
    .single();

  if (error) {
    console.error('Error creating SD:', error.message);
    return { sd_key: sdKey, success: false, error: error.message };
  }

  console.log(`✅ Created ${type === 'quick-fix' ? 'Quick-Fix' : 'SD'}: ${data.sd_key}`);

  // SD-MAN-INFRA-VISION-SCORING-COVERAGE-001: score at conception so GATE_VISION_SCORE doesn't block LEAD-TO-PLAN
  // Non-blocking — failure logs a warning but never fails SD creation
  import('../../leo-create-sd.js')
    .then(({ scoreSDAtConception }) => {
      if (typeof scoreSDAtConception === 'function') {
        return scoreSDAtConception(data.sd_key, data.title, sdData.description || '', supabase);
      }
    })
    .catch(err => console.warn(`⚠️  Vision scoring skipped for ${data.sd_key}: ${err.message}`));

  return { id: data.id, sd_key: data.sd_key, success: true };
}

/**
 * Tag source items (patterns/improvements) with the assigned SD
 * @param {Array} items - Selected patterns and improvements
 * @param {string} sdKey - The SD ID that will address these items
 * @returns {Promise<{success: boolean, tagged: number, errors: Array}>}
 */
export async function tagSourceItems(items, sdKey) {
  const results = { success: true, tagged: 0, errors: [], migrationPending: false };
  const now = new Date().toISOString();

  for (const item of items) {
    if (item.pattern_id) {
      const { error } = await supabase
        .from('issue_patterns')
        .update({
          assigned_sd_id: sdKey,
          assignment_date: now,
          status: 'assigned'
        })
        .eq('pattern_id', item.pattern_id);

      if (error) {
        if (error.message.includes('column') || error.message.includes('constraint')) {
          results.migrationPending = true;
          console.log(`   ⏳ Pattern ${item.pattern_id}: Tagging requires migration`);
          results.tagged++;
        } else {
          results.errors.push({ id: item.pattern_id, error: error.message });
          results.success = false;
        }
      } else {
        results.tagged++;
      }
    } else if (item.source_type === 'sub_agent_recommendation' || item.source_type === 'sub_agent_issue' || item.source_type === 'sub_agent_performance') {
      // SD-LEARN-FIX-011: SAL items come from sub_agent_execution_results (read-only aggregation)
      // They don't have their own taggable record, so log the association
      console.log(`   ✅ SAL ${item.id || item.pattern_id}: Linked to SD (execution-derived, no table update needed)`);
      results.tagged++;
    } else if (item.source_type === 'feedback') {
      // SD-LEARN-FIX-011: Feedback items - tag via resolution_sd_id
      const feedbackId = item.source_id || item.id?.replace('FB-', '');
      if (feedbackId && feedbackId.length > 8) {
        // Try to find the full UUID from the truncated ID
        const { error } = await supabase
          .from('feedback')
          .update({ resolution_sd_id: sdKey, updated_at: now })
          .ilike('id', `${feedbackId}%`);

        if (error) {
          console.log(`   ⚠️  Feedback ${feedbackId}: Could not tag (${error.message})`);
        } else {
          results.tagged++;
        }
      } else {
        console.log(`   ✅ Feedback ${item.id}: Linked to SD`);
        results.tagged++;
      }
    } else if (item.id) {
      const { error } = await supabase
        .from('protocol_improvement_queue')
        .update({
          assigned_sd_id: sdKey,
          assignment_date: now,
          status: 'SD_CREATED'
        })
        .eq('id', item.id);

      if (error) {
        if (error.message.includes('column') || error.message.includes('constraint')) {
          results.migrationPending = true;
          console.log(`   ⏳ Improvement ${item.id.substring(0, 8)}...: Tagging requires migration`);
          results.tagged++;
        } else {
          results.errors.push({ id: item.id, error: error.message });
          results.success = false;
        }
      } else {
        results.tagged++;
      }
    }
  }

  if (results.migrationPending) {
    console.log('   📋 Run migration: database/migrations/20260110_learn_sd_integration.sql');
  }

  return results;
}

/**
 * Execute the SD creation workflow for /learn
 * @param {Object} reviewedContext - The reviewed learning context
 * @param {Object} decisions - User decisions: { itemId: { status, reason } }
 * @param {Function} createDecisionRecord - Function to create decision records
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.skipLeadValidation] - Skip protocol file read check (for CLI/auto-approve)
 * @returns {Promise<{sd_id: string, success: boolean, ...}>}
 */
export async function executeSDCreationWorkflow(reviewedContext, decisions, createDecisionRecord, options = {}) {
  console.log('\n============================================================');
  console.log('  /learn → SD Creation Workflow');
  console.log('============================================================\n');

  // 1. Collect approved items from all learning sources
  const approvedItems = [];
  for (const [itemId, decision] of Object.entries(decisions)) {
    if (decision.status !== 'APPROVED') continue;

    const pattern = reviewedContext.patterns.find(p => p.pattern_id === itemId || p.id === itemId);
    if (pattern) {
      // RCA-LEARN-EMPTY-IMPROVEMENTS: Normalize pattern field names
      // context-builder.js uses 'id' field, but sd-builders.js expects 'pattern_id'
      approvedItems.push({
        ...pattern,
        pattern_id: pattern.id || pattern.pattern_id  // Ensure pattern_id is set
      });
      continue;
    }

    const improvement = reviewedContext.improvements.find(i => i.id === itemId);
    if (improvement) {
      approvedItems.push(improvement);
      continue;
    }

    // SD-LEARN-FIX-011: Search sub-agent learnings (SAL-* items)
    // These are surfaced by context-builder from sub_agent_execution_results
    // but were previously silently dropped during SD creation
    const salItem = (reviewedContext.sub_agent_learnings || []).find(s => s.id === itemId);
    if (salItem) {
      // Normalize SAL item to have pattern-like shape for SD creation
      approvedItems.push({
        ...salItem,
        pattern_id: salItem.id,
        issue_summary: salItem.content,
        category: salItem.sub_agent_code || 'sub_agent',
        severity: salItem.source_type === 'sub_agent_performance' ? 'high' : 'medium'
      });
      continue;
    }

    // SD-LEARN-FIX-011: Search feedback learnings (FB-* items)
    const fbItem = (reviewedContext.feedback_learnings || []).find(f => f.id === itemId);
    if (fbItem) {
      approvedItems.push({
        ...fbItem,
        pattern_id: fbItem.id,
        issue_summary: fbItem.content,
        category: fbItem.category || 'feedback',
        severity: fbItem.priority === 'P0' ? 'critical' : fbItem.priority === 'P1' ? 'high' : 'medium'
      });
      continue;
    }

    // SD-LEARN-FIX-011: Search feedback patterns (FBP-* items)
    const fbpItem = (reviewedContext.feedback_patterns || []).find(fp => fp.id === itemId);
    if (fbpItem) {
      approvedItems.push({
        ...fbpItem,
        pattern_id: fbpItem.id,
        issue_summary: fbpItem.content,
        category: fbpItem.category || 'feedback_pattern',
        severity: 'medium'
      });
    }
  }

  if (approvedItems.length === 0) {
    console.log('No items approved. Nothing to create.');
    return { sd_id: null, success: false, message: 'No items approved' };
  }

  console.log(`Approved items: ${approvedItems.length}`);

  // 2. Check for existing assignments (conflicts)
  const conflicts = await checkExistingAssignments(approvedItems);
  if (conflicts.length > 0) {
    console.log('\n⚠️  Some items are already assigned to SDs:');
    for (const c of conflicts) {
      console.log(`   - ${c.item_id} → ${c.assigned_sd_id} (${c.sd_status})`);
    }
    const nonConflicting = approvedItems.filter(
      item => !conflicts.find(c => c.item_id === (item.pattern_id || item.id))
    );
    if (nonConflicting.length === 0) {
      return {
        sd_id: null,
        success: false,
        message: 'All selected items already assigned to SDs',
        conflicts
      };
    }
    console.log(`Proceeding with ${nonConflicting.length} non-conflicting item(s).`);
    approvedItems.length = 0;
    approvedItems.push(...nonConflicting);
  }

  // 3. Classify complexity
  const classification = classifyComplexity(approvedItems);
  console.log(`\nClassification: ${classification.toUpperCase()}`);

  // 4. Create the SD
  const sdResult = await createSDFromLearning(approvedItems, classification, { skipLeadValidation: options.skipLeadValidation });
  if (!sdResult.success) {
    return {
      sd_id: null,
      sd_key: null,
      success: false,
      message: 'Failed to create SD',
      error: sdResult.error
    };
  }

  const sdKey = sdResult.sd_key;
  const sdUuid = sdResult.id;

  // 5. Tag source items with the SD
  const tagResult = await tagSourceItems(approvedItems, sdUuid);
  if (!tagResult.success) {
    console.warn('Warning: Some items could not be tagged:', tagResult.errors);
  }

  // 6. Create decision record
  const decisionRecord = await createDecisionRecord(
    reviewedContext,
    decisions,
    sdUuid
  );

  // 7. Update decision record with SD creation info
  if (decisionRecord.id && !decisionRecord.id.startsWith('LOCAL-')) {
    await supabase
      .from('learning_decisions')
      .update({
        sd_created_id: sdKey,
        status: 'SD_CREATED',
        execution_log: [{
          action: 'SD_CREATED',
          sd_key: sdKey,
          sd_uuid: sdUuid,
          classification,
          items_tagged: tagResult.tagged,
          timestamp: new Date().toISOString()
        }],
        updated_at: new Date().toISOString()
      })
      .eq('id', decisionRecord.id);
  }

  // 8. Display summary
  console.log('\n============================================================');
  console.log('  Summary');
  console.log('============================================================');
  console.log(`✅ Created: ${sdKey}`);
  console.log(`   Type: ${classification === 'quick-fix' ? 'Quick-Fix' : 'Strategic Directive'}`);
  console.log(`   Items: ${approvedItems.length} tagged`);
  console.log('   Status: draft (awaiting LEAD approval)');
  console.log('');
  console.log('📋 Next Steps:');
  console.log('   1. Run: npm run sd:next');
  console.log('   2. The SD will appear in the queue for LEAD review');
  console.log('   3. Follow LEO Protocol: LEAD → PLAN → EXEC');
  console.log('============================================================\n');

  return {
    sd_id: sdUuid,
    sd_key: sdKey,
    success: true,
    classification,
    items_count: approvedItems.length,
    tagged_count: tagResult.tagged,
    decision_id: decisionRecord.id,
    conflicts: conflicts.length > 0 ? conflicts : null
  };
}
