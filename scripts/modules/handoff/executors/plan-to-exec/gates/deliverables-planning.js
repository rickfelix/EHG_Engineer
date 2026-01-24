/**
 * Deliverables Planning Gate
 * Part of SD-LEO-REFACTOR-PLANTOEXEC-001
 *
 * SD-LEO-PROTOCOL-V435-001 US-003: Validates that deliverables are defined before EXEC phase
 */

import { isLightweightSDType } from '../../../validation/sd-type-applicability-policy.js';

/**
 * Create the GATE_DELIVERABLES_PLANNING gate validator
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} Gate configuration
 */
export function createDeliverablesPlanningGate(supabase, sd) {
  return {
    name: 'GATE_DELIVERABLES_PLANNING',
    validator: async () => {
      console.log('\n📦 GATE: Deliverables Planning Check');
      console.log('-'.repeat(50));
      return validateDeliverablesPlanning(supabase, sd);
    },
    required: false // Non-blocking for now (auto-populates in executeSpecific)
  };
}

/**
 * Validate deliverables planning for a Strategic Directive
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} Gate validation result
 */
export async function validateDeliverablesPlanning(supabase, sd) {
  try {
    const sdType = (sd.sd_type || 'feature').toLowerCase();

    // Check if this SD type requires deliverables from sd_type_validation_profiles
    const { data: profile } = await supabase
      .from('sd_type_validation_profiles')
      .select('requires_deliverables, requires_deliverables_gate')
      .eq('sd_type', sdType)
      .single();

    // Determine if deliverables are required
    // Priority: requires_deliverables_gate > requires_deliverables > centralized policy
    // SD-LEO-FIX-COMPLETION-WORKFLOW-001: Use centralized SD type policy
    const requiresDeliverables = profile?.requires_deliverables_gate ??
                                 profile?.requires_deliverables ??
                                 !isLightweightSDType(sdType);

    console.log(`   SD Type: ${sdType}`);
    console.log(`   Requires Deliverables: ${requiresDeliverables ? 'Yes' : 'No'}`);

    if (!requiresDeliverables) {
      console.log(`   ✅ Deliverables gate skipped for ${sdType} type`);
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        details: { skipped: true, reason: `${sdType} type does not require deliverables` }
      };
    }

    // Check for existing deliverables
    const { data: deliverables } = await supabase
      .from('sd_scope_deliverables')
      .select('id, name, completion_status')
      .eq('sd_id', sd.id);

    const deliverableCount = deliverables?.length || 0;

    console.log(`   Deliverables Defined: ${deliverableCount}`);

    if (deliverableCount === 0) {
      console.log('   ⚠️  No deliverables defined yet');
      console.log('      Deliverables will be auto-populated from PRD');
      return {
        passed: true, // Non-blocking - auto-populate will handle
        score: 70,
        max_score: 100,
        issues: [],
        warnings: ['No deliverables defined. Will attempt auto-population from PRD.'],
        details: {
          deliverableCount: 0,
          message: 'Deliverables will be extracted from PRD exec_checklist'
        }
      };
    }

    // Count completed vs pending
    const completed = deliverables.filter(d => d.completion_status === 'completed').length;
    const pending = deliverableCount - completed;

    console.log(`   📊 Status: ${completed} completed, ${pending} pending`);
    console.log('\n   📦 Deliverables:');
    deliverables.slice(0, 5).forEach((d, i) => {
      const status = d.completion_status === 'completed' ? '✓' : '○';
      console.log(`      ${i + 1}. ${status} ${d.name || 'Unnamed'}`);
    });
    if (deliverableCount > 5) {
      console.log(`      ... and ${deliverableCount - 5} more`);
    }

    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: pending > 0 ? [`${pending} deliverables pending completion`] : [],
      details: {
        deliverableCount,
        completed,
        pending,
        deliverables: deliverables.map(d => ({ name: d.name, status: d.completion_status }))
      }
    };

  } catch (error) {
    console.log(`   ⚠️  Deliverables gate error: ${error.message}`);
    return {
      passed: true,
      score: 50,
      max_score: 100,
      issues: [],
      warnings: [`Deliverables gate error: ${error.message}`],
      details: { error: error.message }
    };
  }
}
