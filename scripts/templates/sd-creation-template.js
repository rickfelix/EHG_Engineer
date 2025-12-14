#!/usr/bin/env node

/**
 * Strategic Directive Creation Template
 *
 * This template includes ALL required and recommended fields based on the
 * strategic_directives_v2 schema as of 2025-10-19.
 *
 * REQUIRED FIELDS (database constraints - must have values):
 * - id, title, description, rationale, scope, category, priority, status
 *
 * STRONGLY RECOMMENDED FIELDS (LEO Protocol compliance):
 * - sd_key, target_application, current_phase, strategic_intent,
 *   strategic_objectives, success_criteria, key_changes, key_principles,
 *   created_by, created_at, updated_at
 *
 * Usage:
 * 1. Copy this template
 * 2. Fill in all [PLACEHOLDER] values
 * 3. Remove optional fields if not needed
 * 4. Run the script to create the SD
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { validateTargetApplication } from '../validators/semantic-target-application-validator.js';

dotenv.config();

// Configuration: Set to true to enable semantic target_application validation
const ENABLE_SEMANTIC_VALIDATION = process.env.ENABLE_SEMANTIC_TARGET_VALIDATION !== 'false';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createStrategicDirective() {
  console.log('Creating Strategic Directive...\n');

  const strategicDirective = {
    // ========================================================================
    // REQUIRED FIELDS (database NOT NULL constraints)
    // ========================================================================

    /**
     * id: Unique identifier in format SD-XXX-YYY-ZZZ
     * Example: 'SD-FEATURE-001', 'SD-BUG-FIX-042'
     */
    id: '[SD-YOUR-ID-HERE]',

    /**
     * title: Short descriptive title (max 500 chars)
     * Example: 'Enhanced User Authentication with OAuth2'
     */
    title: '[YOUR TITLE HERE]',

    /**
     * description: Detailed description of what this SD accomplishes
     * Should be 2-5 sentences explaining the feature/fix
     */
    description: '[DETAILED DESCRIPTION HERE - What does this SD accomplish? What problem does it solve?]',

    /**
     * rationale: Why is this SD necessary?
     * Should explain the business/technical reason
     */
    rationale: '[WHY IS THIS NEEDED? What problem exists that this SD will solve?]',

    /**
     * scope: What is included and excluded from this SD?
     * Can be a string or object
     */
    scope: '[SCOPE HERE - What is included? What is excluded? What are the boundaries?]',

    /**
     * category: Classification of the SD
     * Common values: 'product_feature', 'infrastructure', 'bug_fix', 'performance',
     * 'security', 'documentation', 'testing', 'LEO Protocol Infrastructure'
     */
    category: '[CATEGORY]',

    /**
     * priority: Importance level
     * Values: 'critical', 'high', 'medium', 'low'
     */
    priority: '[PRIORITY]',

    /**
     * status: Current state of the SD
     * Values: 'draft', 'active', 'superseded', 'archived'
     */
    status: 'draft',

    // ========================================================================
    // STRONGLY RECOMMENDED FIELDS (LEO Protocol compliance)
    // ========================================================================

    /**
     * sd_key: Human-readable unique key
     * Example: 'SD-OAUTH-ENHANCE-001'
     */
    sd_key: '[SD-KEY]',

    /**
     * target_application: Which application this SD targets
     * Values: 'EHG' (customer app) or 'EHG_engineer' (management dashboard)
     */
    target_application: '[EHG or EHG_engineer]',

    /**
     * current_phase: Current LEO Protocol phase
     * Values: 'IDEATION', 'LEAD', 'PLAN', 'EXEC', 'VERIFICATION', 'COMPLETE'
     */
    current_phase: 'IDEATION',

    /**
     * strategic_intent: High-level strategic goal
     * Should be 1-2 sentences explaining the strategic purpose
     */
    strategic_intent: '[STRATEGIC INTENT - What is the high-level strategic goal?]',

    /**
     * strategic_objectives: Array of specific objectives
     * Should be measurable goals that this SD will achieve
     */
    strategic_objectives: [
      '[Objective 1 - Specific, measurable goal]',
      '[Objective 2 - Another specific goal]',
      '[Objective 3 - etc.]'
    ],

    /**
     * success_criteria: Array of criteria that define success
     * Should be testable/verifiable criteria
     */
    success_criteria: [
      '[Criterion 1 - How will we know this SD succeeded?]',
      '[Criterion 2 - Another verification criterion]',
      '[Criterion 3 - etc.]'
    ],

    /**
     * key_changes: Array of major changes this SD introduces
     * Should list technical changes, new components, database changes, etc.
     */
    key_changes: [
      '[Change 1 - What will be modified/created?]',
      '[Change 2 - Database schema changes?]',
      '[Change 3 - New components/services?]'
    ],

    /**
     * key_principles: Array of guiding principles for implementation
     * Should list principles like "Database-first", "Testing-mandatory", etc.
     */
    key_principles: [
      '[Principle 1 - e.g., Database-first approach]',
      '[Principle 2 - e.g., Comprehensive testing required]',
      '[Principle 3 - e.g., User privacy paramount]'
    ],

    /**
     * created_by: Who/what created this SD
     * Example: 'LEAD', 'Chairman', 'System', 'LEO Protocol'
     */
    created_by: '[CREATOR]',

    /**
     * created_at: When this SD was created
     */
    created_at: new Date().toISOString(),

    /**
     * updated_at: When this SD was last updated
     */
    updated_at: new Date().toISOString(),

    // ========================================================================
    // OPTIONAL FIELDS (add as needed)
    // ========================================================================

    /**
     * uuid_id: Optional UUID identifier (in addition to id)
     */
    uuid_id: randomUUID(),

    /**
     * version: Version number
     */
    version: '1.0',

    /**
     * phase_progress: Progress within current phase (0-100)
     */
    phase_progress: 0,

    /**
     * progress: Overall progress (0-100)
     */
    progress: 0,

    /**
     * is_active: Whether this SD is currently active
     */
    is_active: true,

    /**
     * dependencies: Array of dependencies
     */
    dependencies: [
      '[Dependency 1 - What must exist/complete before this SD?]',
      '[Dependency 2 - Another dependency]'
    ],

    /**
     * risks: Array of risks and mitigation strategies
     */
    risks: [
      {
        description: '[Risk description]',
        mitigation: '[How to mitigate this risk]',
        severity: 'medium' // 'critical', 'high', 'medium', 'low'
      }
    ],

    /**
     * success_metrics: Array of measurable metrics
     */
    success_metrics: [
      '[Metric 1 - How will success be measured quantitatively?]',
      '[Metric 2 - Another metric]'
    ],

    /**
     * implementation_guidelines: Array of implementation guidelines
     */
    implementation_guidelines: [
      '[Guideline 1 - How should this be implemented?]',
      '[Guideline 2 - Best practices to follow]'
    ],

    /**
     * metadata: Flexible JSON object for additional data
     */
    metadata: {
      estimated_effort: '[e.g., 8-12 hours]',
      technical_requirements: [
        '[Requirement 1]',
        '[Requirement 2]'
      ],
      acceptance_testing_required: true,
      database_changes: false
    }
  };

  try {
    // ══════════════════════════════════════════════════════════════════════════
    // STEP 1: SEMANTIC TARGET APPLICATION VALIDATION (HARD GATE)
    // ══════════════════════════════════════════════════════════════════════════
    if (ENABLE_SEMANTIC_VALIDATION) {
      console.log('\n🎯 Running semantic target_application validation...\n');

      const validationResult = await validateTargetApplication(strategicDirective);

      if (!validationResult.pass) {
        console.error('');
        console.error('╔═══════════════════════════════════════════════════════════════════════╗');
        console.error('║  ⛔ SD CREATION BLOCKED: target_application validation failed         ║');
        console.error('╠═══════════════════════════════════════════════════════════════════════╣');
        console.error(`║  Confidence: ${String(validationResult.confidence + '%').padEnd(58)}║`);
        console.error(`║  Reasoning: ${validationResult.reasoning.substring(0, 57).padEnd(58)}║`);
        console.error('╠═══════════════════════════════════════════════════════════════════════╣');
        console.error('║  To proceed, either:                                                  ║');
        console.error('║  1. Set target_application explicitly in the SD definition           ║');
        console.error('║  2. Clarify the SD scope/description and retry                        ║');
        console.error('║  3. Set ENABLE_SEMANTIC_TARGET_VALIDATION=false to skip (not advised)║');
        console.error('╚═══════════════════════════════════════════════════════════════════════╝');
        console.error('');
        throw new Error(`target_application validation failed (confidence: ${validationResult.confidence}%)`);
      }

      // Auto-set target_application if not already set
      if (!strategicDirective.target_application || strategicDirective.target_application.includes('[')) {
        console.log(`   ✅ Auto-setting target_application = "${validationResult.target_application}"`);
        strategicDirective.target_application = validationResult.target_application;
      } else if (validationResult.mismatch) {
        console.warn(`   ⚠️  Warning: Set value "${strategicDirective.target_application}" differs from LLM recommendation "${validationResult.target_application}"`);
        console.warn('   Proceeding with explicit value. Review if issues arise.');
      }

      console.log('');
    } else {
      console.log('   ⚠️  Semantic target_application validation DISABLED');
      console.log('   Set ENABLE_SEMANTIC_TARGET_VALIDATION=true to enable\n');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 2: CHECK IF SD EXISTS
    // ══════════════════════════════════════════════════════════════════════════
    // Check if SD already exists
    const { data: existing, error: _checkError } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', strategicDirective.id)
      .single();

    if (existing) {
      console.log(`⚠️  SD ${strategicDirective.id} already exists. Updating...`);

      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(strategicDirective)
        .eq('id', strategicDirective.id)
        .select()
        .single();

      if (error) throw error;
      console.log(`✅ SD ${strategicDirective.id} updated successfully!`);
      return data;
    }

    // Create new SD
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(strategicDirective)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ SD ${strategicDirective.id} created successfully!`);
    console.log('\n📊 Strategic Directive Details:');
    console.log('================================');
    console.log(`ID: ${data.id}`);
    console.log(`SD Key: ${data.sd_key}`);
    console.log(`Title: ${data.title}`);
    console.log(`Priority: ${data.priority}`);
    console.log(`Status: ${data.status}`);
    console.log(`Target Application: ${data.target_application}`);
    console.log(`Current Phase: ${data.current_phase}`);

    return data;

  } catch (error) {
    console.error('❌ Error creating SD:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createStrategicDirective()
    .then(() => {
      console.log('\n🚀 Next steps:');
      console.log('1. Verify SD in database');
      console.log('2. Create PRD if needed');
      console.log('3. Begin LEAD phase validation');
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { createStrategicDirective };
