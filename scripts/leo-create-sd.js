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
import {
  checkGate,
  getArtifacts,
  getStatus as getPhase0Status
} from './modules/phase-0/leo-integration.js';

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

  // Inherit strategic fields from parent (SD-LEO-FIX-METADATA-001)
  const inheritedFields = inheritStrategicFields(parent);

  // Create child SD with inherited fields
  const sd = await createSD({
    sdKey,
    title: `Child of ${parent.title}`,
    description: `Child SD of ${parent.sd_key}. Implement specific component.`,
    type: parent.sd_type || 'feature',
    priority: parent.priority || 'medium',
    rationale: `Child of ${parent.sd_key}`,
    parentId: parent.id,
    // Pass inherited category to maintain alignment (RCA from SD-LEO-ENH-AUTO-PROCEED-001-12)
    category: inheritedFields.category || null,
    // Pass inherited fields to createSD (SD-LEO-FIX-METADATA-001)
    success_metrics: inheritedFields.success_metrics || null,
    strategic_objectives: inheritedFields.strategic_objectives || null,
    key_principles: inheritedFields.key_principles || null,
    metadata: {
      source: 'leo',
      parent_sd_key: parent.sd_key,
      child_index: childIndex,
      inherited_from_parent: Object.keys(inheritedFields)
    }
  });

  return sd;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Inherit strategic fields from parent SD
 * Part of SD-LEO-FIX-METADATA-001 fix
 *
 * @param {Object} parent - Parent SD data
 * @returns {Object} Inherited fields object
 */
function inheritStrategicFields(parent) {
  const inherited = {};

  // CRITICAL: Inherit category from parent to maintain alignment (RCA from SD-LEO-ENH-AUTO-PROCEED-001-12)
  // This prevents the sd_type/category mismatch that causes progress calculation issues
  if (parent.category) {
    inherited.category = parent.category;
  }

  // Inherit strategic_objectives if parent has them
  if (parent.strategic_objectives && Array.isArray(parent.strategic_objectives) && parent.strategic_objectives.length > 0) {
    inherited.strategic_objectives = parent.strategic_objectives;
  }

  // DO NOT inherit success_metrics from parent
  // Reason: Each child SD has unique deliverables and should have its own success metrics
  // Parent metrics like "all children complete" don't apply to individual children
  // Child success_metrics will be generated by buildDefaultSuccessMetrics() based on child's title/type

  // Inherit key_principles if parent has them
  if (parent.key_principles && Array.isArray(parent.key_principles) && parent.key_principles.length > 0) {
    inherited.key_principles = parent.key_principles;
  }

  return inherited;
}

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
 * Build default success_metrics based on SD type and title
 * Ensures validator requirements (3+ items with {metric, target}) are met
 */
function buildDefaultSuccessMetrics(type, title) {
  const baseMetrics = [
    {
      metric: 'Implementation completeness',
      target: '100% of scope items implemented'
    },
    {
      metric: 'Test coverage',
      target: '≥80% code coverage for new code'
    },
    {
      metric: 'Zero regressions',
      target: '0 existing tests broken'
    }
  ];

  // Add type-specific metrics
  if (type === 'fix' || type === 'bugfix') {
    baseMetrics.push({
      metric: 'Issue recurrence',
      target: '0 recurrences after fix deployed'
    });
  } else if (type === 'feature' || type === 'feat') {
    baseMetrics.push({
      metric: 'User story completion',
      target: '100% acceptance criteria met'
    });
  }

  return baseMetrics;
}

/**
 * Build default success_criteria based on SD type
 * Returns array of strings (qualitative acceptance criteria)
 */
function buildDefaultSuccessCriteria(type, title) {
  const baseCriteria = [
    'All implementation items from scope are complete',
    'Code passes lint and type checks',
    'PR reviewed and approved'
  ];

  if (type === 'fix' || type === 'bugfix') {
    baseCriteria.push('Root cause addressed, not just symptoms');
  } else if (type === 'feature' || type === 'feat') {
    baseCriteria.push('Feature accessible to target users');
  }

  return baseCriteria;
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
    metadata = {},
    // Allow passing explicit category (for child SDs inheriting from parent)
    category: explicitCategory = null,
    // Allow passing explicit success fields (for sources like UAT, learn, or inherited from parent)
    success_metrics = null,
    success_criteria = null,
    strategic_objectives = null,
    key_principles = null
  } = options;

  // Map user-friendly type to valid database sd_type
  const dbType = mapToDbType(type);

  // PREVENTIVE CONTROL: Validate sd_type/category alignment (RCA from SD-LEO-ENH-AUTO-PROCEED-001-12)
  // sd_type controls validation profiles, category controls gate overrides - misalignment causes issues
  // Use explicit category if provided (e.g., inherited from parent), otherwise derive from type
  const categoryValue = explicitCategory || (type.charAt(0).toUpperCase() + type.slice(1));
  const normalizedCategory = categoryValue.toLowerCase();
  const normalizedDbType = dbType.toLowerCase();

  // Check for common misalignments that cause progress calculation issues
  if (normalizedDbType !== normalizedCategory) {
    // Some misalignments are acceptable (documentation vs docs, bugfix vs bug)
    const acceptableMappings = {
      'documentation': ['docs', 'documentation'],
      'bugfix': ['bug', 'bugfix'],
      'infrastructure': ['infrastructure', 'infra'],
      'feature': ['feature', 'enhancement']
    };

    const isAcceptable = acceptableMappings[normalizedDbType]?.includes(normalizedCategory) ||
                         acceptableMappings[normalizedCategory]?.includes(normalizedDbType);

    if (!isAcceptable && !explicitCategory) {
      // Only warn if category wasn't explicitly provided (inherited categories are intentional)
      console.log('\n⚠️  SD TYPE/CATEGORY ALIGNMENT WARNING');
      console.log(`   sd_type: '${dbType}' (controls validation profile)`);
      console.log(`   category: '${categoryValue}' (controls gate overrides)`);
      console.log('   These fields should generally align to avoid progress calculation issues.');
      console.log('   Consider using consistent values or update after creation.\n');
    }
  }

  // Build success fields - use provided values or generate defaults
  // IMPORTANT: Do NOT use JSON.stringify() - Supabase handles JSONB natively
  // FIX: Check for empty arrays, not just falsy values (empty arrays are truthy in JS)
  const finalSuccessMetrics = (Array.isArray(success_metrics) && success_metrics.length > 0)
    ? success_metrics
    : buildDefaultSuccessMetrics(type, title);
  const finalSuccessCriteria = (Array.isArray(success_criteria) && success_criteria.length > 0)
    ? success_criteria
    : buildDefaultSuccessCriteria(type, title);

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
    category: categoryValue,  // Use calculated value (may be inherited from parent)
    current_phase: 'LEAD',
    target_application: 'EHG_Engineer',
    created_by: 'Claude',
    parent_sd_id: parentId,
    success_criteria: finalSuccessCriteria,  // Array, NOT JSON.stringify()
    success_metrics: finalSuccessMetrics,    // Array with {metric, target}, NOT JSON.stringify()
    strategic_objectives: strategic_objectives || [],  // Use inherited or empty (SD-LEO-FIX-METADATA-001)
    key_principles: key_principles || [
      'Follow LEO Protocol for all changes',
      'Ensure backward compatibility'
    ],
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

      // SD-LEO-FIX-PHASE0-INTEGRATION-001: Phase 0 Intent Discovery Gate
      // Check if Phase 0 is required for this SD type before proceeding
      const gateResult = checkGate(type);

      if (gateResult.action === 'start') {
        // Phase 0 required but not started
        console.log('\n' + '═'.repeat(60));
        console.log('🔮 PHASE 0 INTENT DISCOVERY REQUIRED');
        console.log('═'.repeat(60));
        console.log(`   SD Type: ${type}`);
        console.log(`   Title: ${title}`);
        console.log('');
        console.log('   Feature and enhancement SDs require Phase 0 Intent Discovery');
        console.log('   to ensure proper scoping and crystallized requirements.');
        console.log('');
        console.log('📋 To start Phase 0:');
        console.log('   Use /leo create interactively to begin the discovery process.');
        console.log('   The discovery will ask clarifying questions one at a time.');
        console.log('');
        console.log('   After Phase 0 completes, run this command again.');
        console.log('═'.repeat(60));
        process.exit(0);
      }

      if (gateResult.action === 'resume') {
        // Phase 0 in progress but not complete
        const status = getPhase0Status();
        console.log('\n' + '═'.repeat(60));
        console.log('🔮 PHASE 0 IN PROGRESS');
        console.log('═'.repeat(60));
        console.log(`   Questions answered: ${status.questionsAnswered}/${status.minQuestions} minimum`);
        console.log(`   Has intent summary: ${status.hasIntentSummary ? '✓' : '✗'}`);
        console.log(`   Out of scope items: ${status.outOfScopeCount}/${status.minOutOfScope} minimum`);
        console.log(`   Crystallization: ${(status.crystallizationScore * 100).toFixed(0)}% (need ${(status.threshold * 100).toFixed(0)}%)`);
        console.log('');
        console.log('📋 To continue Phase 0:');
        console.log('   Use /leo create interactively to continue the discovery process.');
        console.log('');
        console.log('   To reset and start over: node scripts/phase-0-cli.js reset');
        console.log('═'.repeat(60));
        process.exit(0);
      }

      // Phase 0 not required or complete - proceed with SD creation
      // Check if Phase 0 artifacts are available to enrich metadata
      let phase0Metadata = {};
      if (gateResult.action === 'proceed' && gateResult.session) {
        // Session exists and is complete - extract artifacts
        const artifacts = getArtifacts(gateResult.session);
        phase0Metadata = {
          phase_0: {
            intent_summary: artifacts.intentSummary,
            out_of_scope: artifacts.outOfScope,
            crystallization_score: artifacts.crystallizationScore,
            questions_answered: artifacts.questionsAnswered,
            ehg_stage: artifacts.ehgStage,
            completed_at: new Date().toISOString()
          }
        };
        console.log('\n✓ Phase 0 artifacts loaded into SD metadata');
      }

      const sdKey = await generateSDKey({ source, type, title });
      await createSD({
        sdKey,
        title,
        description: title,
        type,
        rationale: 'Created via /leo create',
        metadata: {
          source: source.toLowerCase(),
          ...phase0Metadata
        }
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
