#!/usr/bin/env node

/**
 * Child SD Completeness Validation Script
 * LEO Protocol v4.3.3 - Parent-Child SD Governance
 *
 * PURPOSE: Validates that child SDs have all required fields for proper LEAD evaluation
 * PREVENTS: "Hollow" LEAD evaluations where children pass with minimal data
 * ENFORCES: Full field requirements per CLAUDE_PLAN.md Section: Child SD Pattern
 *
 * Usage:
 *   node scripts/validate-child-sd-completeness.js <parent_sd_id>
 *   node scripts/validate-child-sd-completeness.js --all-children
 *   node scripts/validate-child-sd-completeness.js --fix <child_sd_id>
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

class ChildSDValidator {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Required fields for LEAD evaluation (per CLAUDE_PLAN.md)
    this.requiredFields = {
      // Identity fields
      id: { required: true, minLength: null, type: 'string' },
      sd_key: { required: true, minLength: null, type: 'string' },
      title: { required: true, minLength: 10, type: 'string' },

      // Critical LEAD scoring fields (used by autoScore())
      description: { required: true, minLength: 100, type: 'string' },
      scope: { required: true, minLength: 50, type: 'string' },
      rationale: { required: true, minLength: 30, type: 'string' },

      // Classification
      category: { required: true, minLength: null, type: 'string' },
      priority: { required: true, minLength: null, type: 'string' },

      // Parent-child relationship
      parent_sd_id: { required: true, minLength: null, type: 'string' },
      relationship_type: { required: true, value: 'child', type: 'string' },

      // Arrays for evaluation
      strategic_objectives: { required: true, minItems: 1, type: 'array' },
      success_criteria: { required: true, minItems: 1, type: 'array' },

      // Recommended fields
      key_changes: { required: false, minItems: 1, type: 'array' },
      risks: { required: false, minItems: 1, type: 'array' },
      dependencies: { required: false, minItems: 0, type: 'array' }
    };

    // Minimum content requirements for quality
    this.qualityThresholds = {
      description: {
        minLength: 100,
        mustContain: [], // Could add keywords like 'scope', 'objective'
        warningLength: 200
      },
      scope: {
        minLength: 50,
        shouldContain: ['IN SCOPE', 'OUT OF SCOPE'],
        warningLength: 100
      },
      rationale: {
        minLength: 30,
        warningLength: 50
      }
    };
  }

  /**
   * Validate a single child SD for LEAD readiness
   */
  validateChildSD(sd) {
    const errors = [];
    const warnings = [];
    const score = { total: 0, max: 0 };

    // Check required fields
    for (const [field, rules] of Object.entries(this.requiredFields)) {
      score.max += rules.required ? 10 : 5;

      const value = sd[field];

      // Check presence
      if (rules.required && (value === null || value === undefined)) {
        errors.push({
          field,
          issue: 'missing',
          message: `Required field '${field}' is missing`
        });
        continue;
      }

      // Check specific value match
      if (rules.value && value !== rules.value) {
        errors.push({
          field,
          issue: 'invalid_value',
          message: `Field '${field}' must be '${rules.value}', got '${value}'`
        });
        continue;
      }

      // Check string length
      if (rules.type === 'string' && rules.minLength) {
        if (!value || value.length < rules.minLength) {
          errors.push({
            field,
            issue: 'too_short',
            message: `Field '${field}' must be >= ${rules.minLength} chars (got ${value?.length || 0})`
          });
          continue;
        }
      }

      // Check array items
      if (rules.type === 'array' && rules.minItems !== undefined) {
        const arr = Array.isArray(value) ? value : [];
        if (arr.length < rules.minItems) {
          // Required fields = errors, recommended fields = warnings
          if (rules.required) {
            errors.push({
              field,
              issue: 'insufficient_items',
              message: `Field '${field}' needs >= ${rules.minItems} items (got ${arr.length})`
            });
          } else {
            warnings.push({
              field,
              issue: 'recommended_missing',
              message: `Recommended: '${field}' should have >= ${rules.minItems} items (got ${arr.length})`
            });
            score.total += 2; // Partial credit for presence even if empty
          }
          continue;
        }
      }

      // Field passed validation
      score.total += rules.required ? 10 : 5;
    }

    // Quality checks (warnings only)
    for (const [field, thresholds] of Object.entries(this.qualityThresholds)) {
      const value = sd[field];
      if (!value) continue;

      // Check warning length
      if (thresholds.warningLength && value.length < thresholds.warningLength) {
        warnings.push({
          field,
          issue: 'sparse_content',
          message: `Field '${field}' is short (${value.length} chars). Consider expanding for better LEAD evaluation.`
        });
      }

      // Check recommended content
      if (thresholds.shouldContain) {
        const missing = thresholds.shouldContain.filter(
          keyword => !value.toUpperCase().includes(keyword.toUpperCase())
        );
        if (missing.length > 0) {
          warnings.push({
            field,
            issue: 'missing_sections',
            message: `Field '${field}' should contain: ${missing.join(', ')}`
          });
        }
      }
    }

    const percentage = score.max > 0 ? Math.round((score.total / score.max) * 100) : 0;

    return {
      sdId: sd.id,
      title: sd.title,
      parentId: sd.parent_sd_id,
      valid: errors.length === 0,
      score: percentage,
      errors,
      warnings,
      canProceedToLEAD: errors.length === 0 && percentage >= 70
    };
  }

  /**
   * Validate all children of a parent SD
   */
  async validateParentChildren(parentId) {
    console.log(`\n=== Validating Children of ${parentId} ===\n`);

    // Get parent SD
    const { data: parent, error: parentError } = await this.supabase
      .from('strategic_directives_v2')
      .select('id, title, relationship_type, dependency_chain')
      .eq('id', parentId)
      .single();

    if (parentError || !parent) {
      console.error(`Parent SD ${parentId} not found`);
      return null;
    }

    if (parent.relationship_type !== 'parent') {
      console.error(`SD ${parentId} is not a parent (relationship_type: ${parent.relationship_type})`);
      return null;
    }

    console.log(`Parent: ${parent.title}`);
    console.log(`Dependency Chain: ${JSON.stringify(parent.dependency_chain, null, 2)}\n`);

    // Get all children
    const { data: children, error: childError } = await this.supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('parent_sd_id', parentId);

    if (childError) {
      console.error('Error fetching children:', childError.message);
      return null;
    }

    if (!children || children.length === 0) {
      console.log('No children found for this parent SD.');
      return { parentId, children: [], allValid: true };
    }

    // Validate each child
    const results = children.map(child => this.validateChildSD(child));

    // Display results
    console.log('=== Validation Results ===\n');

    for (const result of results) {
      const status = result.valid ? '✅' : '❌';
      console.log(`${status} ${result.sdId}: ${result.title}`);
      console.log(`   Score: ${result.score}% | Can proceed to LEAD: ${result.canProceedToLEAD ? 'YES' : 'NO'}`);

      if (result.errors.length > 0) {
        console.log('   ERRORS:');
        result.errors.forEach(e => console.log(`     - ${e.message}`));
      }

      if (result.warnings.length > 0) {
        console.log('   WARNINGS:');
        result.warnings.forEach(w => console.log(`     - ${w.message}`));
      }
      console.log('');
    }

    // Summary
    const validCount = results.filter(r => r.valid).length;
    const allValid = validCount === results.length;

    console.log('=== Summary ===');
    console.log(`Children validated: ${results.length}`);
    console.log(`Valid for LEAD: ${validCount}/${results.length}`);
    console.log(`Status: ${allValid ? '✅ All children ready for LEAD' : '❌ Some children need remediation'}`);

    return {
      parentId,
      parentTitle: parent.title,
      children: results,
      validCount,
      totalCount: results.length,
      allValid
    };
  }

  /**
   * Validate all child SDs in the system
   */
  async validateAllChildren() {
    console.log('\n=== Validating ALL Child SDs ===\n');

    const { data: children, error } = await this.supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('relationship_type', 'child')
      .order('parent_sd_id');

    if (error) {
      console.error('Error fetching children:', error.message);
      return null;
    }

    if (!children || children.length === 0) {
      console.log('No child SDs found in the system.');
      return { children: [], allValid: true };
    }

    console.log(`Found ${children.length} child SDs\n`);

    // Group by parent
    const byParent = {};
    for (const child of children) {
      const pid = child.parent_sd_id || 'ORPHANED';
      if (!byParent[pid]) byParent[pid] = [];
      byParent[pid].push(child);
    }

    // Validate all
    const allResults = [];
    for (const [parentId, parentChildren] of Object.entries(byParent)) {
      console.log(`\n--- Parent: ${parentId} ---`);

      for (const child of parentChildren) {
        const result = this.validateChildSD(child);
        allResults.push(result);

        const status = result.valid ? '✅' : '❌';
        console.log(`${status} ${result.sdId} (${result.score}%)`);

        if (!result.valid) {
          result.errors.slice(0, 3).forEach(e => console.log(`   - ${e.message}`));
          if (result.errors.length > 3) {
            console.log(`   ... and ${result.errors.length - 3} more errors`);
          }
        }
      }
    }

    // Summary
    const validCount = allResults.filter(r => r.valid).length;

    console.log('\n=== Global Summary ===');
    console.log(`Total child SDs: ${allResults.length}`);
    console.log(`Valid for LEAD: ${validCount}/${allResults.length}`);
    console.log(`Parents with children: ${Object.keys(byParent).length}`);

    return {
      children: allResults,
      validCount,
      totalCount: allResults.length,
      allValid: validCount === allResults.length
    };
  }

  /**
   * Generate fix suggestions for an invalid child SD
   */
  async generateFixSuggestions(sdId) {
    console.log(`\n=== Fix Suggestions for ${sdId} ===\n`);

    const { data: sd, error } = await this.supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (error || !sd) {
      console.error(`SD ${sdId} not found`);
      return null;
    }

    const validation = this.validateChildSD(sd);

    if (validation.valid) {
      console.log('✅ This child SD is already valid for LEAD evaluation.');
      return validation;
    }

    console.log(`Current Status: ${validation.score}% complete\n`);
    console.log('Required Fixes:\n');

    for (const error of validation.errors) {
      console.log(`❌ ${error.field}: ${error.message}`);

      // Provide specific fix guidance
      switch (error.field) {
        case 'description':
          console.log('   FIX: Add a detailed description (100+ chars) explaining:');
          console.log('        - What this child SD accomplishes');
          console.log('        - How it relates to the parent SD');
          console.log('        - What deliverables it produces');
          break;
        case 'scope':
          console.log('   FIX: Define clear scope with IN SCOPE and OUT OF SCOPE sections:');
          console.log('        IN SCOPE: [list what this SD includes]');
          console.log('        OUT OF SCOPE: [list what is NOT in this SD]');
          break;
        case 'rationale':
          console.log('   FIX: Explain WHY this child SD exists separately from its siblings');
          break;
        case 'strategic_objectives':
          console.log('   FIX: Add at least one strategic objective:');
          console.log('        [{ objective: "Goal description", metric: "How to measure" }]');
          break;
        case 'success_criteria':
          console.log('   FIX: Add at least one success criterion:');
          console.log('        [{ criterion: "What success looks like", measure: "How to verify" }]');
          break;
        default:
          console.log(`   FIX: Populate the ${error.field} field with valid data`);
      }
      console.log('');
    }

    // Generate SQL update template
    console.log('--- SQL Fix Template ---\n');
    console.log('UPDATE strategic_directives_v2 SET');

    const fixes = [];
    for (const error of validation.errors) {
      switch (error.field) {
        case 'description':
          fixes.push('  description = \'FILL IN: Detailed description of this child SD (100+ chars)\'');
          break;
        case 'scope':
          fixes.push('  scope = \'IN SCOPE:\\n- Item 1\\n- Item 2\\n\\nOUT OF SCOPE:\\n- Item 1\'');
          break;
        case 'rationale':
          fixes.push('  rationale = \'FILL IN: Why this child SD exists\'');
          break;
        case 'strategic_objectives':
          fixes.push('  strategic_objectives = \'[{"objective": "FILL IN", "metric": "FILL IN"}]\'::jsonb');
          break;
        case 'success_criteria':
          fixes.push('  success_criteria = \'[{"criterion": "FILL IN", "measure": "FILL IN"}]\'::jsonb');
          break;
      }
    }

    console.log(fixes.join(',\n'));
    console.log(`WHERE id = '${sdId}';`);

    return validation;
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const validator = new ChildSDValidator();

  if (args.length === 0) {
    console.log(`
Child SD Completeness Validator
===============================

Usage:
  node scripts/validate-child-sd-completeness.js <parent_sd_id>
    Validate all children of a specific parent SD

  node scripts/validate-child-sd-completeness.js --all-children
    Validate ALL child SDs in the system

  node scripts/validate-child-sd-completeness.js --fix <child_sd_id>
    Generate fix suggestions for a specific child SD

Examples:
  node scripts/validate-child-sd-completeness.js SD-VISION-V2-000
  node scripts/validate-child-sd-completeness.js --all-children
  node scripts/validate-child-sd-completeness.js --fix SD-VISION-V2-001
`);
    process.exit(0);
  }

  if (args[0] === '--all-children') {
    await validator.validateAllChildren();
  } else if (args[0] === '--fix' && args[1]) {
    await validator.generateFixSuggestions(args[1]);
  } else {
    await validator.validateParentChildren(args[0]);
  }
}

main().catch(console.error);
