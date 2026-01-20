#!/usr/bin/env node

/**
 * LEO Create SD - Helper script for /leo create command
 *
 * Handles flag-based SD creation from various sources:
 * - --from-uat <test-id>: Create from UAT finding
 * - --from-learn <pattern-id>: Create from /learn pattern
 * - --from-feedback <id>: Create from /inbox feedback item
 * - --child <parent-key> <index>: Create child SD
 *
 * Part of SD-LEO-SDKEY-001: Centralize SD Creation Through /leo
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import {
  generateSDKey,
  generateChildKey,
  SD_SOURCES,
  SD_TYPES
} from './modules/sd-key-generator.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================================
// Source Handlers
// ============================================================================

/**
 * Create SD from UAT finding
 */
async function createFromUAT(testId) {
  console.log(`\n📋 Creating SD from UAT finding: ${testId}`);

  // Fetch UAT test result
  const { data: uatResult, error } = await supabase
    .from('uat_test_results')
    .select('*')
    .eq('id', testId)
    .single();

  if (error || !uatResult) {
    console.error('UAT result not found:', testId);
    process.exit(1);
  }

  // Determine type from UAT result
  const type = uatResult.status === 'failed' ? 'fix' : 'feature';

  // Generate key
  const sdKey = await generateSDKey({
    source: 'UAT',
    type,
    title: uatResult.test_name || uatResult.title || 'UAT Finding'
  });

  // Create SD
  const sd = await createSD({
    sdKey,
    title: uatResult.test_name || uatResult.title,
    description: uatResult.notes || uatResult.description || 'Created from UAT finding',
    type,
    rationale: `Created from UAT test result ${testId}`,
    metadata: {
      source: 'uat',
      source_id: testId,
      uat_status: uatResult.status
    }
  });

  return sd;
}

/**
 * Create SD from /learn pattern
 */
async function createFromLearn(patternId) {
  console.log(`\n📋 Creating SD from /learn pattern: ${patternId}`);

  // Fetch pattern from retrospectives or learning table
  const { data: pattern, error } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('id', patternId)
    .single();

  if (error || !pattern) {
    console.error('Pattern not found:', patternId);
    process.exit(1);
  }

  // Determine type
  const type = pattern.lesson_type === 'bug' ? 'fix' : 'enhancement';

  // Generate key
  const sdKey = await generateSDKey({
    source: 'LEARN',
    type,
    title: pattern.key_lesson || pattern.title || 'Learning Pattern'
  });

  // Create SD
  const sd = await createSD({
    sdKey,
    title: pattern.key_lesson || pattern.title,
    description: pattern.actionable_improvements?.join('\n') || pattern.description || 'Created from learning pattern',
    type,
    rationale: `Created from retrospective pattern ${patternId}`,
    metadata: {
      source: 'learn',
      source_id: patternId,
      lesson_type: pattern.lesson_type
    }
  });

  return sd;
}

/**
 * Create SD from /inbox feedback item
 */
async function createFromFeedback(feedbackId) {
  console.log(`\n📋 Creating SD from feedback: ${feedbackId}`);

  // Fetch feedback item (support partial ID)
  const { data: feedback, error } = await supabase
    .from('feedback')
    .select('*')
    .or(`id.eq.${feedbackId},id.ilike.${feedbackId}%`)
    .single();

  if (error || !feedback) {
    console.error('Feedback not found:', feedbackId);
    process.exit(1);
  }

  // Map feedback type to SD type
  const type = feedback.type === 'issue' ? 'fix' : 'feature';

  // Generate key
  const sdKey = await generateSDKey({
    source: 'FEEDBACK',
    type,
    title: feedback.title
  });

  // Create SD
  const sd = await createSD({
    sdKey,
    title: feedback.title,
    description: feedback.description || feedback.title,
    type,
    priority: mapPriority(feedback.priority),
    rationale: `Created from feedback item. Source: ${feedback.source_type || 'manual'}`,
    metadata: {
      source: 'feedback',
      source_id: feedback.id,
      feedback_type: feedback.type,
      feedback_priority: feedback.priority
    }
  });

  // Update feedback status
  await supabase
    .from('feedback')
    .update({ status: 'in_progress' })
    .eq('id', feedback.id);

  return sd;
}

/**
 * Create child SD
 */
async function createChild(parentKey, index = 0) {
  console.log(`\n📋 Creating child SD for: ${parentKey}`);

  // Fetch parent SD
  const { data: parent, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .or(`sd_key.eq.${parentKey},id.eq.${parentKey}`)
    .single();

  if (error || !parent) {
    console.error('Parent SD not found:', parentKey);
    process.exit(1);
  }

  // Count existing children to determine index
  const { data: existingChildren } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('parent_sd_id', parent.id);

  const childIndex = index || (existingChildren?.length || 0);

  // Generate child key
  const sdKey = generateChildKey(parent.sd_key || parentKey, childIndex);

  // Create child SD
  const sd = await createSD({
    sdKey,
    title: `Child of ${parent.title}`,
    description: `Child SD of ${parent.sd_key}. Implement specific component.`,
    type: parent.sd_type || 'feature',
    priority: parent.priority || 'medium',
    rationale: `Child of ${parent.sd_key}`,
    parentId: parent.id,
    metadata: {
      source: 'leo',
      parent_sd_key: parent.sd_key,
      child_index: childIndex
    }
  });

  return sd;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map feedback priority to SD priority
 */
function mapPriority(feedbackPriority) {
  const map = {
    P0: 'critical',
    P1: 'high',
    P2: 'medium',
    P3: 'low'
  };
  return map[feedbackPriority] || 'medium';
}

/**
 * Map user-friendly type to valid database sd_type
 * Valid sd_types: bugfix, database, docs, documentation, feature, infrastructure,
 * orchestrator, qa, refactor, security, implementation, strategic_observation,
 * architectural_review, discovery_spike, ux_debt, product_decision
 */
function mapToDbType(userType) {
  const map = {
    // User-friendly -> Database type
    fix: 'bugfix',
    bugfix: 'bugfix',
    feature: 'feature',
    feat: 'feature',
    infrastructure: 'infrastructure',
    infra: 'infrastructure',
    refactor: 'refactor',
    documentation: 'documentation',
    doc: 'documentation',
    docs: 'docs',
    database: 'database',
    db: 'database',
    security: 'security',
    orchestrator: 'orchestrator',
    orch: 'orchestrator',
    qa: 'qa',
    testing: 'qa',
    implementation: 'implementation',
    enhancement: 'feature'  // Map enhancement to feature
  };
  return map[userType?.toLowerCase()] || 'feature';
}

/**
 * Create SD in database
 */
async function createSD(options) {
  const {
    sdKey,
    title,
    description,
    type,
    priority = 'medium',
    rationale,
    parentId = null,
    metadata = {}
  } = options;

  // Map user-friendly type to valid database sd_type
  const dbType = mapToDbType(type);

  const sdData = {
    id: randomUUID(),
    sd_key: sdKey,
    title,
    description,
    scope: description,  // Required field - defaults to description
    rationale,
    sd_type: dbType,
    status: 'draft',
    priority,
    category: type.charAt(0).toUpperCase() + type.slice(1),
    current_phase: 'LEAD',
    target_application: 'EHG_Engineer',
    created_by: 'Claude',
    parent_sd_id: parentId,
    success_criteria: [],
    success_metrics: [],
    key_principles: [],
    risks: [],
    metadata: {
      ...metadata,
      created_via: 'leo-create-sd',
      created_at: new Date().toISOString()
    }
  };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select('id, sd_key, title, sd_type, status, priority, current_phase')
    .single();

  if (error) {
    console.error('Failed to create SD:', error.message);
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('✅ SD CREATED');
  console.log('═'.repeat(60));
  console.log(`   SD Key:   ${data.sd_key}`);
  console.log(`   Title:    ${data.title}`);
  console.log(`   Type:     ${data.sd_type}`);
  console.log(`   Priority: ${data.priority}`);
  console.log(`   Status:   ${data.status}`);
  console.log(`   Phase:    ${data.current_phase}`);
  console.log('═'.repeat(60));
  console.log('\n📋 Next Steps:');
  console.log('   1. Review SD details');
  console.log('   2. Run LEAD-TO-PLAN handoff when ready:');
  console.log(`      node scripts/handoff.js execute LEAD-TO-PLAN ${data.sd_key}`);

  return data;
}

// ============================================================================
// CLI Handler
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
LEO Create SD - Centralized SD Creation

Usage:
  node scripts/leo-create-sd.js --from-uat <test-id>
  node scripts/leo-create-sd.js --from-learn <pattern-id>
  node scripts/leo-create-sd.js --from-feedback <feedback-id>
  node scripts/leo-create-sd.js --child <parent-key> [index]
  node scripts/leo-create-sd.js <source> <type> "<title>"

Sources: ${Object.keys(SD_SOURCES).join(', ')}
Types: ${Object.keys(SD_TYPES).join(', ')}

Examples:
  node scripts/leo-create-sd.js --from-uat abc123
  node scripts/leo-create-sd.js --from-feedback def456
  node scripts/leo-create-sd.js --child SD-LEO-FEAT-001 0
  node scripts/leo-create-sd.js LEO fix "Login button not working"
`);
    process.exit(0);
  }

  try {
    if (args[0] === '--from-uat') {
      await createFromUAT(args[1]);
    } else if (args[0] === '--from-learn') {
      await createFromLearn(args[1]);
    } else if (args[0] === '--from-feedback') {
      await createFromFeedback(args[1]);
    } else if (args[0] === '--child') {
      await createChild(args[1], parseInt(args[2] || '0', 10));
    } else {
      // Direct creation: <source> <type> "<title>"
      const [source, type, ...titleParts] = args;
      const title = titleParts.join(' ');

      if (!source || !type || !title) {
        console.error('Usage: leo-create-sd.js <source> <type> "<title>"');
        process.exit(1);
      }

      const sdKey = await generateSDKey({ source, type, title });
      await createSD({
        sdKey,
        title,
        description: title,
        type,
        rationale: 'Created via /leo create',
        metadata: { source: source.toLowerCase() }
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
