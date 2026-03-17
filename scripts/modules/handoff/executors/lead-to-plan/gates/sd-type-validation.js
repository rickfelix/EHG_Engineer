/**
 * SD Type Validation Gate for LEAD-TO-PLAN
 * Part of SD-LEO-REFACTOR-LEADTOPLAN-001
 *
 * SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-001: Validate SD type during LEAD-TO-PLAN
 * SD-LEO-INFRA-RENAME-COLUMNS-SELF-001: Use GPT 5.2 classifier, respect type_locked
 *
 * Ensures SD type is explicitly set and matches the work scope.
 * Uses intelligent GPT 5.2 classifier instead of primitive keyword matching.
 * Respects type_locked flag to prevent unwanted auto-correction.
 */

import { sdTypeClassifier } from '../../../../../../lib/sd/type-classifier.js';
import { autoDetectSdType } from '../../../../../../lib/utils/sd-type-validation.js';

// Valid SD types (from LEO Protocol)
const VALID_SD_TYPES = [
  'feature', 'infrastructure', 'bugfix', 'database', 'security',
  'refactor', 'documentation', 'orchestrator', 'performance', 'enhancement',
  'uat',  // Renamed from qa: UAT campaign/test work
  'library', 'fix' // Added from type-classifier profiles
];

/**
 * Check if SD type is locked (should not be auto-corrected)
 * @param {Object} sd - Strategic Directive
 * @returns {boolean} True if type is locked
 */
function isTypeLocked(sd) {
  const govMeta = sd.governance_metadata;
  if (!govMeta) return false;

  // Check type_locked flag
  if (govMeta.type_locked === true) return true;

  // Also respect automation_context bypass flags
  if (govMeta.automation_context?.bypass_governance === true) return true;

  return false;
}

/**
 * Analyze PRD structural signals to cross-check SD type classification.
 * Advisory only — emits warnings but never blocks.
 *
 * SD-MAN-FIX-STAGE-KILL-GATE-001: Preventative measure for type misclassification
 *
 * @param {Object} sd - Strategic Directive
 * @param {Object} supabase - Supabase client
 * @returns {Object|null} { suggestedType, confidence, signals } or null
 */
async function analyzePrdSignals(sd, supabase) {
  try {
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('functional_requirements, executive_summary, category, implementation_approach, system_architecture')
      .eq('sd_id', sd.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!prd) return null;

    const signals = [];
    let enhancementScore = 0;
    let bugfixScore = 0;

    // Signal 1: Functional requirements count (>5 FRs suggest enhancement/feature, not bugfix)
    const frCount = Array.isArray(prd.functional_requirements) ? prd.functional_requirements.length : 0;
    if (frCount >= 5) {
      enhancementScore += 2;
      signals.push(`${frCount} functional requirements (enhancement signal)`);
    } else if (frCount <= 2) {
      bugfixScore += 1;
      signals.push(`${frCount} functional requirements (bugfix signal)`);
    }

    // Signal 2: Estimated LOC (>100 LOC suggests enhancement, not bugfix)
    const estimatedLoc = prd.implementation_approach?.estimated_loc;
    if (estimatedLoc > 100) {
      enhancementScore += 2;
      signals.push(`${estimatedLoc} estimated LOC (enhancement signal)`);
    } else if (estimatedLoc && estimatedLoc <= 30) {
      bugfixScore += 1;
      signals.push(`${estimatedLoc} estimated LOC (bugfix signal)`);
    }

    // Signal 3: Action verbs in executive summary
    const summary = (prd.executive_summary || '').toLowerCase();
    const enhancementVerbs = ['enrich', 'implement', 'add', 'surface', 'render', 'display', 'create'];
    const bugfixVerbs = ['fix', 'resolve', 'repair', 'correct', 'patch'];
    const matchedEnhancement = enhancementVerbs.filter(v => summary.includes(v));
    const matchedBugfix = bugfixVerbs.filter(v => summary.includes(v));
    if (matchedEnhancement.length > matchedBugfix.length) {
      enhancementScore += matchedEnhancement.length;
      signals.push(`Enhancement verbs in summary: ${matchedEnhancement.join(', ')}`);
    } else if (matchedBugfix.length > matchedEnhancement.length) {
      bugfixScore += matchedBugfix.length;
      signals.push(`Bugfix verbs in summary: ${matchedBugfix.join(', ')}`);
    }

    // Signal 4: PRD category cross-check
    const category = (prd.category || '').toLowerCase();
    if (category === 'enhancement' || category === 'feature') {
      enhancementScore += 2;
      signals.push(`PRD category: ${prd.category}`);
    } else if (category === 'bugfix' || category === 'bug fix') {
      bugfixScore += 2;
      signals.push(`PRD category: ${prd.category}`);
    }

    // Signal 5: Architecture/wireframe references
    const arch = prd.system_architecture;
    if (arch?.overview && (arch.overview.toLowerCase().includes('wireframe') || arch.overview.toLowerCase().includes('enrichment'))) {
      enhancementScore += 1;
      signals.push('Architecture references wireframe/enrichment');
    }

    if (signals.length === 0) return null;

    const suggestedType = enhancementScore > bugfixScore ? 'enhancement' : 'bugfix';
    const totalScore = Math.max(enhancementScore, bugfixScore);
    const confidence = Math.min(totalScore / 6, 1);

    return { suggestedType, confidence, signals };
  } catch (e) {
    console.debug('[SDTypeValidation] type inference suppressed:', e?.message || e);
    return null;
  }
}

/**
 * Validate SD type - ensures sd_type is explicitly set and matches scope
 *
 * IMPROVEMENTS (SD-LEO-INFRA-RENAME-COLUMNS-SELF-001):
 * 1. Uses GPT 5.2 classifier (sdTypeClassifier) instead of primitive keywords
 * 2. Respects type_locked flag - never auto-corrects locked types
 * 3. Falls back to keyword matching only when GPT fails
 * 4. PRD structural signal cross-check (SD-MAN-FIX-STAGE-KILL-GATE-001)
 *
 * @param {Object} sd - Strategic Directive
 * @param {Object} supabase - Supabase client
 * @returns {Object} Validation result
 */
export async function validateSdType(sd, supabase) {
  const issues = [];
  const warnings = [];

  const currentType = sd.sd_type;
  const typeLocked = isTypeLocked(sd);

  console.log(`   Current sd_type: ${currentType || '(not set)'}`);
  if (typeLocked) {
    console.log('   🔒 Type is LOCKED - auto-correction disabled');
  }

  // Check if sd_type is set
  if (!currentType) {
    console.log('   ⚠️  sd_type not explicitly set - classifying with GPT 5.2...');

    // Use GPT 5.2 classifier (preferred) with keyword fallback
    let classification;
    try {
      classification = await sdTypeClassifier.classify(
        sd.title || '',
        sd.description || sd.scope || ''
      );
      console.log(`   🤖 GPT 5.2 Classification: ${classification.recommendedType}`);
      console.log(`      Confidence: ${Math.round(classification.confidence * 100)}%`);
      console.log(`      Source: ${classification.source}`);
      console.log(`      Reasoning: ${classification.reasoning}`);
    } catch (error) {
      console.log(`   ⚠️  GPT classification failed: ${error.message}`);
      // Fall back to keyword detection
      const keywordDetection = autoDetectSdType(sd);
      classification = {
        recommendedType: keywordDetection.sd_type,
        confidence: keywordDetection.confidence / 100,
        source: 'keyword_fallback',
        reasoning: keywordDetection.reason
      };
    }

    if (classification.confidence >= 0.70) {
      // Auto-set with high confidence
      console.log(`\n   ⚙️  Auto-setting sd_type to: ${classification.recommendedType}`);

      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({ sd_type: classification.recommendedType })
        .eq('id', sd.id);

      if (error) {
        issues.push(`Could not set sd_type: ${error.message}`);
        return { pass: false, score: 0, issues };
      }

      console.log(`   ✅ sd_type set to: ${classification.recommendedType}`);
      return {
        pass: true,
        score: 90,
        issues: [],
        warnings: [`sd_type auto-set to ${classification.recommendedType} via ${classification.source}`]
      };
    } else {
      // Low confidence - warn but default to infrastructure (safer than feature)
      warnings.push(`sd_type not set and classification has low confidence (${Math.round(classification.confidence * 100)}%)`);
      warnings.push('Consider explicitly setting sd_type for accurate workflow selection');
      console.log('   ⚠️  Low confidence - defaulting to infrastructure');

      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({ sd_type: 'infrastructure' })
        .eq('id', sd.id);

      if (!error) {
        console.log('   ℹ️  Defaulted sd_type to: infrastructure');
      }

      return {
        pass: true,
        score: 70,
        issues: [],
        warnings
      };
    }
  }

  // Validate current type is in valid list
  if (!VALID_SD_TYPES.includes(currentType.toLowerCase())) {
    issues.push(`Invalid sd_type: '${currentType}'. Valid types: ${VALID_SD_TYPES.join(', ')}`);
    console.log(`   ❌ Invalid sd_type: ${currentType}`);
    return { pass: false, score: 0, issues };
  }

  // If type is locked, skip mismatch detection entirely
  if (typeLocked) {
    console.log(`   ✅ sd_type validated (locked): ${currentType}`);
    return {
      pass: true,
      score: 100,
      issues: [],
      warnings: ['Type is locked - auto-correction skipped']
    };
  }

  // Check for potential mismatch using GPT 5.2 classifier
  let classification;
  try {
    classification = await sdTypeClassifier.classify(
      sd.title || '',
      sd.description || sd.scope || ''
    );
  } catch (_error) {
    // Fall back to keyword detection
    const keywordDetection = autoDetectSdType(sd);
    classification = {
      recommendedType: keywordDetection.sd_type,
      confidence: keywordDetection.confidence / 100,
      source: 'keyword_fallback',
      reasoning: keywordDetection.reason
    };
  }

  // Separate thresholds: warn at 65%, auto-correct at 85%
  // Fix: Previously 85% gated BOTH warning and correction, causing silent misclassifications
  const WARN_THRESHOLD = 0.65;
  const AUTO_CORRECT_THRESHOLD = 0.85;

  if (classification.recommendedType !== currentType.toLowerCase() &&
      classification.confidence >= WARN_THRESHOLD) {
    console.log('\n   ⚠️  POTENTIAL MISMATCH DETECTED');
    console.log(`   Current: ${currentType}`);
    console.log(`   Detected: ${classification.recommendedType} (${Math.round(classification.confidence * 100)}% confidence)`);
    console.log(`   Source: ${classification.source}`);
    console.log(`   Reasoning: ${classification.reasoning}`);

    // Only auto-correct if confidence is very high (85%+) and from GPT
    if (classification.source === 'gpt' && classification.confidence >= AUTO_CORRECT_THRESHOLD) {
      console.log(`\n   ⚙️  Auto-correcting sd_type to: ${classification.recommendedType}`);

      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({ sd_type: classification.recommendedType })
        .eq('id', sd.id);

      if (error) {
        warnings.push(`Could not auto-correct sd_type: ${error.message}`);
        console.log(`   ⚠️  Failed to update: ${error.message}`);
      } else {
        console.log(`   ✅ sd_type corrected to: ${classification.recommendedType}`);
        return {
          pass: true,
          score: 85,
          issues: [],
          warnings: [`sd_type corrected from ${currentType} to ${classification.recommendedType} (GPT 5.2)`]
        };
      }
    } else {
      // Below auto-correct threshold - warn but don't auto-correct
      warnings.push(`Potential type mismatch: current '${currentType}', detected '${classification.recommendedType}' (${Math.round(classification.confidence * 100)}% via ${classification.source}). Review and correct if needed.`);
      console.log(`   ℹ️  Mismatch detected but not auto-correcting (confidence ${Math.round(classification.confidence * 100)}% < ${AUTO_CORRECT_THRESHOLD * 100}% threshold)`);
    }
  }

  // PRD structural signal cross-check (advisory only, never blocks)
  const prdSignals = await analyzePrdSignals(sd, supabase);
  if (prdSignals && prdSignals.suggestedType !== currentType.toLowerCase() && prdSignals.confidence >= 0.5) {
    const pctConf = Math.round(prdSignals.confidence * 100);
    console.log('\n   📊 PRD STRUCTURAL SIGNAL CROSS-CHECK');
    console.log(`   Current type: ${currentType}`);
    console.log(`   PRD signals suggest: ${prdSignals.suggestedType} (${pctConf}% confidence)`);
    prdSignals.signals.forEach(s => console.log(`      • ${s}`));
    warnings.push(`PRD structural signals suggest '${prdSignals.suggestedType}' (${pctConf}%), current type is '${currentType}'. Signals: ${prdSignals.signals.join('; ')}`);
  }

  console.log(`   ✅ sd_type validated: ${currentType}`);
  return {
    pass: true,
    score: 100,
    issues: [],
    warnings
  };
}

/**
 * Create the SD type validation gate
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createSdTypeValidationGate(supabase) {
  return {
    name: 'SD_TYPE_VALIDATION',
    validator: async (ctx) => {
      console.log('\n📋 GATE: SD Type Validation');
      console.log('-'.repeat(50));
      return validateSdType(ctx.sd, supabase);
    },
    required: true,
    weight: 0.9,
    remediation: 'Set sd_type to match the work scope (feature, infrastructure, bugfix, database, security, refactor, documentation, orchestrator, uat)'
  };
}
