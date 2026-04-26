/**
 * Target Application Validation Gate for LEAD-TO-PLAN
 * Part of SD-LEO-REFACTOR-LEADTOPLAN-001
 *
 * SD-LEO-GEMINI-001: Validate target_application at LEAD-TO-PLAN to prevent
 * late-stage failures when commits are searched in wrong repository
 *
 * SD-LEO-INFRA-SD-AUTHORING-TARGET-AUTODETECT-001: Path-based detector
 * `detectFromKeyChanges` complements the prose detector below; consumed by
 * leo-create-sd.js BEFORE the venture-resolver fallback so all-frontend SDs
 * route to EHG without manual --venture intervention.
 */

// Path-prefix substrings that vote toward each application. Matches are
// case-sensitive substring checks against `key_changes[].change` strings.
// Update review date in the comment block below when patterns change.
// Last reviewed: 2026-04-26 (SD-LEO-INFRA-SD-AUTHORING-TARGET-AUTODETECT-001)
export const PATH_PATTERN_DICTIONARY = {
  EHG: [
    '/ehg/',
    'src/components/',
    'src/pages/',
    'src/stages/',
    'src/ventures/',
    'src/hooks/',
    'src/lib/',
  ],
  EHG_Engineer: [
    'scripts/',
    'lib/eva/',
    'lib/sub-agents/',
    'lib/llm/',
    'lib/genesis/',
    'lib/utils/',
    'lib/telemetry/',
    'lib/team/',
    '.claude/',
    'CLAUDE.md',
    'CLAUDE_CORE.md',
    'CLAUDE_LEAD.md',
    'CLAUDE_PLAN.md',
    'CLAUDE_EXEC.md',
    'handoff.js',
  ],
};

/**
 * Path-based target_application detector for SD authoring.
 *
 * Scans `key_changes[].change` strings against PATH_PATTERN_DICTIONARY,
 * tallies matches per application, and returns the majority winner.
 * Returns null on tie, empty input, non-array input, or zero matches —
 * the caller's existing fallback chain (getCurrentVenture / explicitTargetApp /
 * 'EHG_Engineer') handles those cases.
 *
 * @param {Array<{type?: string, change?: string}>|*} keyChanges
 * @returns {'EHG'|'EHG_Engineer'|null}
 */
export function detectFromKeyChanges(keyChanges) {
  if (!Array.isArray(keyChanges) || keyChanges.length === 0) return null;

  let ehgVotes = 0;
  let engineerVotes = 0;

  for (const entry of keyChanges) {
    const change = (entry && typeof entry === 'object' && typeof entry.change === 'string') ? entry.change : '';
    if (!change) continue;
    if (PATH_PATTERN_DICTIONARY.EHG.some(p => change.includes(p))) ehgVotes += 1;
    if (PATH_PATTERN_DICTIONARY.EHG_Engineer.some(p => change.includes(p))) engineerVotes += 1;
  }

  if (ehgVotes === 0 && engineerVotes === 0) return null;
  if (ehgVotes === engineerVotes) return null;
  return ehgVotes > engineerVotes ? 'EHG' : 'EHG_Engineer';
}

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
  // SD-LEO-INFRA-GATE-WORKTREE-FIXES-001: Added EVA template/library paths
  const engineerPatterns = [
    'claude.md', 'claude_', 'leo protocol', 'handoff.js', 'phase-preflight',
    'sub-agent', 'subagent', 'leo_protocol', 'retrospective', 'verification gate',
    'handoff system', 'bmad', 'scripts/modules', 'lib/sub-agents',
    'lib/eva', 'eva/stage-template', 'stage-template', 'eva template',
    'eva analysis', 'lib/llm', 'lib/team', 'lib/utils', 'lib/telemetry'
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
    // SD-LEO-REFAC-ELIMINATE-HARD-CODED-001: Use venture-resolver for default
    const { getCurrentVenture } = await import('../../../../../../lib/venture-resolver.js');
    const defaultTarget = getCurrentVenture();
    console.log(`\n   ⚠️  Could not determine target_application, defaulting to ${defaultTarget}`);

    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({ target_application: defaultTarget })
      .eq('id', sd.id);

    if (!error) {
      console.log(`   ✅ Default target_application set to: ${defaultTarget}`);
    }

    return {
      pass: true,
      score: 70,
      issues: [],
      warnings: [`target_application defaulted to ${defaultTarget} - verify this is correct`]
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
