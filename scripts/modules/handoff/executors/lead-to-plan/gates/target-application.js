/**
 * Target Application Validation Gate for LEAD-TO-PLAN
 * Part of SD-LEO-REFACTOR-LEADTOPLAN-001
 *
 * SD-LEO-GEMINI-001: Validate target_application at LEAD-TO-PLAN to prevent
 * late-stage failures when commits are searched in wrong repository
 */

/**
 * Validate and potentially auto-correct target_application
 * SD-LEO-GEMINI-001: Prevents wrong repository being searched during final handoff
 *
 * @param {Object} sd - Strategic Directive
 * @param {Object} supabase - Supabase client
 * @returns {Object} Validation result
 */
export async function validateTargetApplication(sd, supabase) {
  const scope = (sd.scope || sd.description || '').toLowerCase();
  const title = (sd.title || '').toLowerCase();
  const combinedText = `${scope} ${title}`;

  // Patterns that indicate EHG_Engineer (LEO Protocol infrastructure)
  const engineerPatterns = [
    'claude.md', 'claude_', 'leo protocol', 'handoff.js', 'phase-preflight',
    'sub-agent', 'subagent', 'leo_protocol', 'retrospective', 'verification gate',
    'handoff system', 'bmad', 'scripts/modules', 'lib/sub-agents'
  ];

  // Patterns that indicate EHG (main application)
  const ehgPatterns = [
    'stage', 'venture', 'ui component', 'react', 'frontend', 'backend',
    'api endpoint', 'database table', 'rls policy', 'user interface',
    'supabase function', 'edge function'
  ];

  // Count pattern matches
  const engineerMatches = engineerPatterns.filter(p => combinedText.includes(p));
  const ehgMatches = ehgPatterns.filter(p => combinedText.includes(p));

  // Determine inferred target
  let inferredTarget = null;
  let confidence = 'low';

  if (engineerMatches.length > ehgMatches.length) {
    inferredTarget = 'EHG_Engineer';
    confidence = engineerMatches.length >= 2 ? 'high' : 'medium';
  } else if (ehgMatches.length > engineerMatches.length) {
    inferredTarget = 'EHG';
    confidence = ehgMatches.length >= 2 ? 'high' : 'medium';
  } else if (engineerMatches.length > 0) {
    inferredTarget = 'EHG_Engineer';
    confidence = 'medium';
  }

  const currentTarget = sd.target_application;

  console.log(`   Current target_application: ${currentTarget || '(not set)'}`);
  console.log(`   Inferred from scope: ${inferredTarget || '(could not determine)'} (${confidence} confidence)`);

  if (engineerMatches.length > 0) {
    console.log(`   Engineer patterns found: ${engineerMatches.slice(0, 3).join(', ')}${engineerMatches.length > 3 ? '...' : ''}`);
  }
  if (ehgMatches.length > 0) {
    console.log(`   EHG patterns found: ${ehgMatches.slice(0, 3).join(', ')}${ehgMatches.length > 3 ? '...' : ''}`);
  }

  // Validation scenarios
  if (!currentTarget && inferredTarget) {
    // No target set, but we can infer one - auto-set it
    console.log(`\n   ⚠️  target_application not set, auto-setting to: ${inferredTarget}`);

    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({ target_application: inferredTarget })
      .eq('id', sd.id);

    if (error) {
      console.log(`   ❌ Failed to update: ${error.message}`);
      return {
        pass: false,
        score: 0,
        issues: [`Could not set target_application: ${error.message}`]
      };
    }

    console.log(`   ✅ Auto-set target_application to: ${inferredTarget}`);
    return {
      pass: true,
      score: 90,
      issues: [],
      warnings: [`target_application was auto-set to ${inferredTarget} based on scope analysis`]
    };
  }

  if (currentTarget && inferredTarget && currentTarget !== inferredTarget && confidence === 'high') {
    // Target set but doesn't match inferred with high confidence - warn and offer correction
    console.log('\n   ⚠️  MISMATCH DETECTED');
    console.log(`   Current: ${currentTarget}`);
    console.log(`   Inferred: ${inferredTarget} (high confidence)`);
    console.log(`   Auto-correcting to: ${inferredTarget}`);

    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({ target_application: inferredTarget })
      .eq('id', sd.id);

    if (error) {
      console.log(`   ❌ Failed to update: ${error.message}`);
      return {
        pass: false,
        score: 0,
        issues: [`target_application mismatch: set to ${currentTarget}, but scope suggests ${inferredTarget}`]
      };
    }

    console.log(`   ✅ Corrected target_application to: ${inferredTarget}`);
    return {
      pass: true,
      score: 80,
      issues: [],
      warnings: [`target_application corrected from ${currentTarget} to ${inferredTarget}`]
    };
  }

  if (!currentTarget && !inferredTarget) {
    // No target and couldn't infer - default to EHG with warning
    console.log('\n   ⚠️  Could not determine target_application, defaulting to EHG');

    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({ target_application: 'EHG' })
      .eq('id', sd.id);

    if (!error) {
      console.log('   ✅ Default target_application set to: EHG');
    }

    return {
      pass: true,
      score: 70,
      issues: [],
      warnings: ['target_application defaulted to EHG - verify this is correct']
    };
  }

  // Target is set and matches or no inference conflict
  console.log(`   ✅ target_application validated: ${currentTarget}`);
  return {
    pass: true,
    score: 100,
    issues: []
  };
}

/**
 * Create the target application validation gate
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createTargetApplicationGate(supabase) {
  return {
    name: 'TARGET_APPLICATION_VALIDATION',
    validator: async (ctx) => {
      console.log('\n🎯 GATE: Target Application Validation');
      console.log('-'.repeat(50));
      return validateTargetApplication(ctx.sd, supabase);
    },
    required: true,
    remediation: 'Set target_application to match the files in scope (EHG or EHG_Engineer)'
  };
}
