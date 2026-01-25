#!/usr/bin/env node
/**
 * Decomposition Gate Module
 * Layer 2 of Layered Defense (Preflight Validation)
 *
 * Validates decomposition requirements during PLAN phase:
 * 1. Checks if parent SD meets decomposition criteria
 * 2. If criteria met, ensures children exist or warns
 * 3. Blocks PLAN-TO-EXEC transition if children should exist but don't
 *
 * LEO Protocol Rule: PLAN proposes decomposition when:
 * - Parent SD has ≥8 user stories
 * - Work spans 3+ distinct phases
 * - Duration estimate exceeds 1-2 weeks
 *
 * Usage:
 *   import { validateDecompositionGate } from './modules/decomposition-gate.js';
 *   const result = await validateDecompositionGate(sdId, transitionType);
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * INTELLIGENT Decomposition Assessment
 *
 * DESIGN PRINCIPLES:
 * 1. Do NOT use duration estimates - LLMs are bad at time estimation
 * 2. Do NOT use user story count as primary signal - parents have FEW stories
 * 3. DO check for explicit child definitions in metadata
 * 4. DO check for structural signals (phases, dependency graphs)
 * 5. When uncertain, ASK rather than auto-decide
 */

/**
 * Check if SD has children already defined (MANDATORY creation)
 * @param {Object} sd - The strategic directive object
 * @returns {Object} - Assessment with childrenDefined flag
 */
function checkExplicitChildDefinitions(sd) {
  const result = {
    childrenDefined: false,
    definedChildren: [],
    dependencyGraph: null,
    executionOrder: null,
    phases: [],
    source: null
  };

  // Check metadata.child_sds - explicit child definitions
  if (Array.isArray(sd.metadata?.child_sds) && sd.metadata.child_sds.length > 0) {
    result.childrenDefined = true;
    result.definedChildren = sd.metadata.child_sds;
    result.source = 'metadata.child_sds';
  }

  // Check metadata.child_count
  if ((sd.metadata?.child_count || 0) > 0 && !result.childrenDefined) {
    result.childrenDefined = true;
    result.source = 'metadata.child_count';
  }

  // Capture dependency graph if exists
  if (sd.metadata?.dependency_graph && Object.keys(sd.metadata.dependency_graph).length > 0) {
    result.dependencyGraph = sd.metadata.dependency_graph;
  }

  // Capture execution order if exists
  if (Array.isArray(sd.metadata?.execution_order) && sd.metadata.execution_order.length > 0) {
    result.executionOrder = sd.metadata.execution_order;
  }

  // Capture phases if defined
  if (Array.isArray(sd.metadata?.phases) && sd.metadata.phases.length > 0) {
    result.phases = sd.metadata.phases;
  }

  return result;
}

/**
 * Check for structural signals that SUGGEST decomposition (not mandatory)
 * These are advisory, not decisive
 * @param {Object} sd - The strategic directive object
 * @returns {Object} - Structural signals found
 */
function checkStructuralSignals(sd) {
  const signals = {
    hasMultiplePhases: false,
    hasMultipleDomains: false,
    scopeMentionsDecomposition: false,
    hasExplicitParentFlag: false,
    details: []
  };

  // Check for multiple phases in metadata
  if (Array.isArray(sd.metadata?.phases) && sd.metadata.phases.length > 1) {
    signals.hasMultiplePhases = true;
    signals.details.push(`${sd.metadata.phases.length} phases defined: ${sd.metadata.phases.join(', ')}`);
  }

  // Check for explicit parent flag
  if (sd.metadata?.is_parent === true || sd.metadata?.requires_children === true) {
    signals.hasExplicitParentFlag = true;
    signals.details.push('Explicitly flagged as parent/requires children');
  }

  // Check scope for decomposition keywords (semantic analysis)
  const scope = (sd.scope || '').toLowerCase();
  const decompositionKeywords = [
    'multiple phases', 'multiple sprints', 'phased approach',
    'broken into', 'decomposed into', 'split into',
    'child sds', 'sub-directives', 'orchestrator'
  ];

  const foundKeywords = decompositionKeywords.filter(kw => scope.includes(kw));
  if (foundKeywords.length > 0) {
    signals.scopeMentionsDecomposition = true;
    signals.details.push(`Scope mentions: ${foundKeywords.join(', ')}`);
  }

  // Check if objectives span multiple distinct domains
  const objectives = sd.strategic_objectives || [];
  const domains = new Set();
  const domainKeywords = {
    'research': ['research', 'analysis', 'investigation', 'study'],
    'database': ['schema', 'database', 'migration', 'data model'],
    'ui': ['ui', 'interface', 'component', 'frontend', 'display'],
    'api': ['api', 'endpoint', 'integration', 'backend'],
    'testing': ['test', 'e2e', 'validation', 'qa']
  };

  objectives.forEach(obj => {
    const objLower = (typeof obj === 'string' ? obj : obj.description || '').toLowerCase();
    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some(kw => objLower.includes(kw))) {
        domains.add(domain);
      }
    }
  });

  if (domains.size >= 3) {
    signals.hasMultipleDomains = true;
    signals.details.push(`Objectives span ${domains.size} domains: ${Array.from(domains).join(', ')}`);
  }

  return signals;
}

/**
 * INTELLIGENT decomposition assessment
 * @param {Object} sd - The strategic directive object
 * @param {Array} userStories - User stories (NOT used as primary signal)
 * @returns {Object} - Decomposition assessment
 */
function assessDecompositionNeed(sd, userStories) {
  const assessment = {
    // Mandatory: Children are explicitly defined and MUST be created
    mustDecompose: false,

    // Advisory: Signals suggest decomposition but require confirmation
    shouldConsiderDecomposition: false,

    // Details
    explicitChildren: null,
    structuralSignals: null,
    recommendation: null,
    action: null
  };

  // STEP 1: Check for explicit child definitions (MANDATORY)
  assessment.explicitChildren = checkExplicitChildDefinitions(sd);

  if (assessment.explicitChildren.childrenDefined) {
    assessment.mustDecompose = true;
    assessment.recommendation =
      `MANDATORY: ${assessment.explicitChildren.definedChildren.length} children are explicitly defined in ${assessment.explicitChildren.source}. ` +
      'PLAN phase MUST create these child SDs in the database.';
    assessment.action = 'CREATE_CHILDREN';
    return assessment;
  }

  // STEP 2: Check structural signals (ADVISORY)
  assessment.structuralSignals = checkStructuralSignals(sd);

  const signalCount = [
    assessment.structuralSignals.hasMultiplePhases,
    assessment.structuralSignals.hasMultipleDomains,
    assessment.structuralSignals.scopeMentionsDecomposition,
    assessment.structuralSignals.hasExplicitParentFlag
  ].filter(Boolean).length;

  // AUTO-DECIDE based on signal strength (no user bottleneck)
  if (signalCount >= 2) {
    // Strong signals: Auto-generate child structure from available info
    assessment.shouldConsiderDecomposition = true;

    // If phases are defined, use them to suggest children
    if (assessment.structuralSignals.hasMultiplePhases) {
      const phases = sd.metadata?.phases || [];
      assessment.suggestedChildren = phases.map((phase, idx) => ({
        // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
        sd_id: `${sd.sd_key || sd.id}-PHASE-${idx + 1}`,
        title: `${sd.title} - ${phase}`,
        phase: phase,
        order: idx + 1
      }));
      assessment.recommendation =
        `AUTO-DECOMPOSE: ${signalCount} strong signals detected. ` +
        `Generating ${phases.length} child SDs based on defined phases: ${phases.join(', ')}`;
      assessment.action = 'AUTO_GENERATE_CHILDREN';
    } else {
      // No phases, but strong signals - proceed as single but flag
      assessment.recommendation =
        `PROCEED WITH FLAG: ${signalCount} signals suggest complexity, but no phase structure defined. ` +
        'Proceeding as single SD. If implementation proves unwieldy, decompose later.';
      assessment.action = 'PROCEED_SINGLE_FLAGGED';
    }
  } else if (signalCount === 1) {
    assessment.recommendation =
      `PROCEED: 1 signal found (${assessment.structuralSignals.details[0]}). ` +
      'Manageable as single SD.';
    assessment.action = 'PROCEED_SINGLE';
  } else {
    assessment.recommendation =
      'PROCEED: No decomposition signals. Single SD workflow.';
    assessment.action = 'PROCEED_SINGLE';
  }

  // NOTE: We intentionally do NOT use:
  // - Duration estimates (LLMs are bad at time estimation)
  // - User story count alone (parents have few stories by design)

  return assessment;
}

/**
 * Validate decomposition gate for a phase transition (INTELLIGENT)
 *
 * BEHAVIOR:
 * - PLAN-ENTRY: If children defined → MUST create them
 * - PLAN-TO-EXEC: If children defined but not created → BLOCK
 * - Otherwise: Advisory only, proceed with single SD
 *
 * @param {string} sdId - The SD identifier
 * @param {string} transitionType - The transition being attempted
 * @returns {Object} - Gate result with pass/fail and details
 */
export async function validateDecompositionGate(sdId, transitionType) {
  console.log('\n📊 DECOMPOSITION GATE (Intelligent): Evaluating child SD requirements');
  console.log('='.repeat(60));

  const result = {
    passed: true,
    blocking: false,
    sdId,
    transitionType,
    childrenInDatabase: 0,
    childrenDefined: 0,
    decompositionAssessment: null,
    message: '',
    requiredAction: null
  };

  try {
    // Get SD details
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
      .or(`id.eq.${sdId},sd_key.eq.${sdId}`)
      .single();

    if (sdError || !sd) {
      result.message = `SD not found: ${sdId}`;
      console.log(`   ❌ ${result.message}`);
      return result;
    }

    // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
    console.log(`   📋 SD: ${sd.sd_key || sd.id}`);
    console.log(`   📄 Title: ${sd.title}`);
    console.log(`   📊 Phase: ${sd.current_phase} | Status: ${sd.status}`);

    // Check for existing children IN DATABASE
    const { data: children } = await supabase
      .from('strategic_directives_v2')
      // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
    .select('id, sd_key, title, status, current_phase')
      .eq('parent_sd_id', sd.id);

    result.childrenInDatabase = children?.length || 0;

    // Assess decomposition need using INTELLIGENT logic
    result.decompositionAssessment = assessDecompositionNeed(sd, []);

    // Count children defined in metadata
    result.childrenDefined = result.decompositionAssessment.explicitChildren?.definedChildren?.length || 0;

    console.log('\n   👶 CHILDREN STATUS:');
    console.log(`      Defined in metadata: ${result.childrenDefined}`);
    console.log(`      Created in database: ${result.childrenInDatabase}`);

    // GATE LOGIC based on transition type
    if (transitionType === 'PLAN-ENTRY' || transitionType === 'PLAN') {
      // Entering PLAN phase - inform about requirements
      if (result.decompositionAssessment.mustDecompose) {
        console.log('\n   🎯 MANDATORY DECOMPOSITION:');
        console.log(`      ${result.decompositionAssessment.recommendation}`);

        if (result.childrenInDatabase === 0) {
          result.message =
            `ACTION REQUIRED: ${result.childrenDefined} children are defined but not yet in database. ` +
            'PLAN phase MUST create these child SDs before transitioning to EXEC.';
          result.requiredAction = 'CREATE_CHILDREN_IN_DATABASE';
        } else if (result.childrenInDatabase < result.childrenDefined) {
          result.message =
            `INCOMPLETE: ${result.childrenInDatabase}/${result.childrenDefined} children created. ` +
            `Create remaining ${result.childrenDefined - result.childrenInDatabase} children.`;
          result.requiredAction = 'CREATE_REMAINING_CHILDREN';
        } else {
          result.message = `✅ All ${result.childrenDefined} children already created.`;
        }
        console.log(`\n   📋 ${result.message}`);
      } else if (result.decompositionAssessment.action === 'AUTO_GENERATE_CHILDREN') {
        // Strong signals + phases defined = auto-generate children
        console.log('\n   🔄 AUTO-DECOMPOSITION:');
        console.log(`      ${result.decompositionAssessment.recommendation}`);
        const suggested = result.decompositionAssessment.suggestedChildren || [];
        if (suggested.length > 0) {
          console.log('\n   📋 SUGGESTED CHILDREN:');
          suggested.forEach((child, i) => {
            console.log(`      ${i + 1}. ${child.sd_id}: ${child.phase}`);
          });
        }
        result.message = `Auto-decomposition suggested: ${suggested.length} children from phases.`;
        result.requiredAction = 'CREATE_SUGGESTED_CHILDREN';
        result.suggestedChildren = suggested;
      } else if (result.decompositionAssessment.action === 'PROCEED_SINGLE_FLAGGED') {
        // Strong signals but no structure - proceed but flag
        console.log('\n   ⚠️  FLAGGED:');
        console.log(`      ${result.decompositionAssessment.recommendation}`);
        result.message = 'Proceeding as single SD with complexity flag.';
        result.requiredAction = 'PROCEED_MONITOR_COMPLEXITY';
      } else {
        result.message = 'No decomposition required. Proceed as single SD.';
        console.log(`\n   ✅ ${result.message}`);
      }
    }

    if (transitionType === 'PLAN-TO-EXEC') {
      // Transitioning to EXEC - BLOCK if children defined but not created
      if (result.decompositionAssessment.mustDecompose && result.childrenInDatabase === 0) {
        result.passed = false;
        result.blocking = true; // HARD BLOCK
        result.message =
          `❌ BLOCKED: ${result.childrenDefined} children are defined in metadata but NONE exist in database. ` +
          'Cannot proceed to EXEC until all children are created.';
        result.requiredAction =
          `Create child SDs first. Run: node scripts/create-child-sds.js ${sdId}`;

        console.log(`\n   ${result.message}`);
        console.log(`   Required Action: ${result.requiredAction}`);
      } else if (result.decompositionAssessment.mustDecompose && result.childrenInDatabase < result.childrenDefined) {
        result.passed = false;
        result.blocking = true; // HARD BLOCK
        result.message =
          `❌ BLOCKED: Only ${result.childrenInDatabase}/${result.childrenDefined} children created. ` +
          'All defined children must exist before EXEC.';
        result.requiredAction = 'Create remaining children.';

        console.log(`\n   ${result.message}`);
      } else if (result.childrenInDatabase > 0) {
        result.message = `✅ Parent SD has ${result.childrenInDatabase} child SDs created. Ready for EXEC.`;
        console.log(`\n   ${result.message}`);
      } else {
        result.message = '✅ Single SD workflow. Ready for EXEC.';
        console.log(`\n   ${result.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    return result;

  } catch (error) {
    result.passed = false;
    result.message = `Error validating decomposition gate: ${error.message}`;
    console.error(`   ❌ ${result.message}`);
    return result;
  }
}

/**
 * Check if parent is ready for child creation
 * Used before attempting to create a child SD
 * @param {string} parentSdId - The parent SD identifier
 * @returns {Object} - Readiness check result
 */
export async function checkParentReadyForChildren(parentSdId) {
  const result = {
    ready: false,
    parentPhase: null,
    parentStatus: null,
    message: '',
    correctWorkflow: 'Parent must be in PLAN or EXEC phase to create children.'
  };

  try {
    const { data: parent } = await supabase
      .from('strategic_directives_v2')
      // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
    .select('id, sd_key, title, phase, status')
      // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
      .or(`id.eq.${parentSdId},sd_key.eq.${parentSdId}`)
      .single();

    if (!parent) {
      result.message = `Parent SD not found: ${parentSdId}`;
      return result;
    }

    result.parentPhase = parent.phase;
    result.parentStatus = parent.status;

    // Parent must be in PLAN or EXEC phase
    if (['PLAN', 'EXEC'].includes(parent.phase)) {
      result.ready = true;
      result.message = `✅ Parent "${parent.title}" is in ${parent.phase} phase. Children can be created.`;
    } else {
      result.ready = false;
      result.message =
        `❌ Parent "${parent.title}" is in ${parent.phase || 'NULL'} phase. ` +
        'Children can only be created when parent is in PLAN or EXEC phase.';
    }

    return result;

  } catch (error) {
    result.message = `Error checking parent readiness: ${error.message}`;
    return result;
  }
}

// CLI execution
if (process.argv[1].includes('decomposition-gate')) {
  const sdId = process.argv[2];
  const transition = process.argv[3] || 'PLAN-TO-EXEC';

  if (!sdId) {
    console.error('Usage: node decomposition-gate.js <SD-ID> [transition-type]');
    console.error('Example: node decomposition-gate.js SD-GENESIS-001 PLAN-TO-EXEC');
    process.exit(1);
  }

  validateDecompositionGate(sdId, transition)
    .then(result => {
      console.log('\n📊 Gate Result:', JSON.stringify(result, null, 2));
      process.exit(result.passed ? 0 : 1);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}
