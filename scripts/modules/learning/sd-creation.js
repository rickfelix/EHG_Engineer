/**
 * SD Creation module for /learn command
 *
 * Handles creating Strategic Directives from learning items.
 * Extracted from executor.js for maintainability.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import {
  buildSDDescription,
  buildSDTitle,
  buildSuccessMetrics,
  buildSuccessCriteria,
  buildSmokeTestSteps,
  buildStrategicObjectives,
  buildKeyPrinciples
} from './sd-builders.js';

import {
  classifyComplexity,
  generateSDId,
  checkExistingAssignments
} from './classification.js';

dotenv.config();

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
    metadata: {
      source: 'learn_command',
      source_items: items.map(i => i.id || i.pattern_id),
      classification: type,
      created_via: '/learn apply'
    }
  };

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

  // 1. Collect approved items
  const approvedItems = [];
  for (const [itemId, decision] of Object.entries(decisions)) {
    if (decision.status !== 'APPROVED') continue;

    const pattern = reviewedContext.patterns.find(p => p.pattern_id === itemId || p.id === itemId);
    if (pattern) {
      approvedItems.push(pattern);
      continue;
    }

    const improvement = reviewedContext.improvements.find(i => i.id === itemId);
    if (improvement) {
      approvedItems.push(improvement);
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
