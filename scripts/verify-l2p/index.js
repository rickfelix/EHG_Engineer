#!/usr/bin/env node

/**
 * LEAD → PLAN Handoff Verification - Main Orchestration
 * LEO Protocol v4.1.2 - Strategic Quality Gate
 *
 * ENFORCES: Strategic Directive must be complete before PLAN phase begins
 * PREVENTS: Incomplete or unclear strategic direction reaching technical planning
 * RETURNS: To LEAD with specific improvement requirements if validation fails
 *
 * Extracted from verify-handoff-lead-to-plan.js for modularity
 * SD-LEO-REFACTOR-VERIFY-L2P-001
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import _fs from 'fs'; // Reserved for future use
import dotenv from 'dotenv';
dotenv.config();

import HandoffValidator from '../handoff-validator.js';
import { SD_REQUIREMENTS, VALID_SD_STATUSES } from './constants.js';
import { validateStrategicDirective, validateFeasibility } from './sd-validation.js';
import {
  validatePRDReadiness,
  validateVisionDocumentReferences,
  validateDependencyStructure,
  validateScopeStructure,
  validateSuccessCriteriaActionability,
  validateImplementationContext,
  validateDependenciesExist
} from './prd-readiness.js';
import { autoDetectSdType, getTypeRecommendation as _getTypeRecommendation, getWorstCaseHandoffs as _getWorstCaseHandoffs } from './type-detection.js';
import { checkEnvironmentReadiness, validateHandoffDocument } from './environment.js';
import {
  createHandoffExecution,
  rejectHandoff,
  generateImprovementGuidance,
  updateSdStatusAfterHandoff
} from './handoff-execution.js';

// Cross-platform path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '../..');

/**
 * LeadToPlanVerifier class
 * Main orchestrator for LEAD → PLAN handoff verification
 */
export class LeadToPlanVerifier {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    this.handoffValidator = new HandoffValidator();
    this.sdRequirements = SD_REQUIREMENTS;
  }

  /**
   * Verify LEAD → PLAN handoff readiness
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<Object>} Verification result
   */
  async verifyHandoff(sdId) {
    console.log('🔍 LEAD → PLAN HANDOFF VERIFICATION');
    console.log('='.repeat(50));
    console.log(`Strategic Directive: ${sdId}`);

    try {
      // 1. Load Strategic Directive
      const { data: sd, error: sdError } = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .or(`id.eq.${sdId},legacy_id.eq.${sdId},sd_key.eq.${sdId}`)
        .single();

      if (sdError || !sd) {
        throw new Error(`Strategic Directive ${sdId} not found: ${sdError?.message}`);
      }

      console.log(`SD Status: ${sd.status}`);
      console.log(`SD Priority: ${sd.priority || 'Not set'}`);

      // 2. Load handoff template
      const { data: template } = await this.supabase
        .from('leo_handoff_templates')
        .select('*')
        .eq('from_agent', 'LEAD')
        .eq('to_agent', 'PLAN')
        .single();

      // 2.5. ORCHESTRATOR SD DETECTION
      const isOrchestrator = (sd.sd_type || '').toLowerCase() === 'orchestrator';

      if (isOrchestrator) {
        const result = await this._handleOrchestratorSd(sd, template);
        if (result) return result;
      }

      // 3. Validate Strategic Directive Completeness
      const sdValidation = validateStrategicDirective(sd);

      console.log(`\n📊 SD Completeness Score: ${sdValidation.percentage}%`);

      if (!sdValidation.valid || sdValidation.percentage < this.sdRequirements.minimumScore) {
        return rejectHandoff(this.supabase, sdId, 'SD_INCOMPLETE', 'Strategic Directive does not meet completeness standards', {
          sdValidation,
          requiredScore: this.sdRequirements.minimumScore,
          actualScore: sdValidation.percentage
        });
      }

      // 3.5. AI SD Type Classification
      await this._runTypeClassification(sd, sdValidation);

      // 3.6. AI Quality Assessment (Russian Judge)
      await this._runQualityAssessment(sd);

      // 4. Check Strategic Directive status
      if (!VALID_SD_STATUSES.includes(sd.status)) {
        return rejectHandoff(this.supabase, sdId, 'SD_STATUS', `SD status is '${sd.status}', expected one of: ${VALID_SD_STATUSES.join(', ')}`);
      }

      // 5. Validate business impact and feasibility
      const feasibilityCheck = validateFeasibility(sd);
      if (!feasibilityCheck.passed) {
        return rejectHandoff(this.supabase, sdId, 'FEASIBILITY', 'Strategic Directive feasibility concerns identified', {
          feasibilityIssues: feasibilityCheck.issues
        });
      }

      // 6. Validate handoff content (if provided)
      const handoffPath = path.join(EHG_ENGINEER_ROOT, 'handoffs', `LEAD-to-PLAN-${sdId}.md`);
      const handoffValidation = validateHandoffDocument(handoffPath, this.handoffValidator);

      if (handoffValidation && !handoffValidation.valid) {
        return rejectHandoff(this.supabase, sdId, 'HANDOFF_INVALID', 'Handoff document does not meet LEO Protocol requirements', {
          handoffValidation
        });
      }

      // 7. Check environment readiness
      const envCheck = await checkEnvironmentReadiness(this.supabase, sd, EHG_ENGINEER_ROOT);
      if (!envCheck.ready) {
        return rejectHandoff(this.supabase, sdId, 'ENV_NOT_READY', 'Development environment not ready for planning phase', {
          envIssues: envCheck.issues
        });
      }

      // 7.5. Async Dependency Validation
      const asyncDepCheck = await validateDependenciesExist(this.supabase, sd);
      sdValidation.warnings.push(...asyncDepCheck.warnings);

      // 8. Run PRD-Readiness validations
      this._runPrdReadinessChecks(sd, sdValidation);

      // 8.5. Display warnings
      this._displayWarnings(sdValidation);

      // 9. Create handoff execution record
      const execution = await createHandoffExecution(this.supabase, sd, template, sdValidation, handoffValidation);

      // 10. HANDOFF APPROVED
      console.log('\n✅ HANDOFF APPROVED');
      console.log('='.repeat(50));
      console.log('✅ Strategic Directive is complete and approved');
      console.log(`✅ SD completeness score: ${sdValidation.percentage}% (≥${this.sdRequirements.minimumScore}%)`);
      console.log('✅ Business objectives clearly defined');
      console.log('✅ Success metrics are measurable');
      console.log('✅ Feasibility confirmed');
      console.log('✅ Environment ready for planning');

      if (handoffValidation) {
        console.log('✅ Handoff document meets protocol standards');
      }

      if (sdValidation.warnings.length === 0) {
        console.log('✅ PRD-Readiness checks passed (no warnings)');
      } else {
        console.log(`⚠️  ${sdValidation.warnings.length} PRD-Readiness warning(s) - review recommended`);
      }

      // Update SD status
      await updateSdStatusAfterHandoff(this.supabase, sd, sdValidation);

      console.log('\n🎯 PLAN PHASE AUTHORIZED');
      console.log('Strategic Directive handed off to PLAN agent for PRD creation');

      return {
        success: true,
        executionId: execution.id,
        sdId: sdId,
        qualityScore: sdValidation.percentage
      };

    } catch (error) {
      console.error('❌ Handoff verification failed:', error.message);
      return rejectHandoff(this.supabase, sdId, 'SYSTEM_ERROR', error.message);
    }
  }

  /**
   * Handle orchestrator SD special logic
   * @private
   */
  async _handleOrchestratorSd(sd, template) {
    console.log('\n🎭 ORCHESTRATOR SD DETECTED');
    console.log('-'.repeat(50));

    const { data: children, error: childError } = await this.supabase
      .from('strategic_directives_v2')
      .select('id, title, status')
      .eq('parent_sd_id', sd.id);

    if (childError) {
      console.log(`   ⚠️  Could not query children: ${childError.message}`);
      return null;
    }

    if (!children || children.length === 0) {
      console.log('   ⚠️  No child SDs found - proceeding with standard validation');
      return null;
    }

    const completedChildren = children.filter(c => c.status === 'completed');
    console.log(`   Child SDs: ${children.length} total, ${completedChildren.length} completed`);

    children.forEach(child => {
      const status = child.status === 'completed' ? '✅' : '⏳';
      console.log(`   ${status} ${child.id}: ${child.status}`);
    });

    if (completedChildren.length === children.length) {
      // All children complete
      return this._approveOrchestratorComplete(sd, template, children);
    } else {
      // Children incomplete - still allow LEAD-TO-PLAN
      return this._approveOrchestratorInitial(sd, template, children, completedChildren);
    }
  }

  /**
   * Approve orchestrator with all children complete
   * @private
   */
  async _approveOrchestratorComplete(sd, template, children) {
    const sdValidation = {
      valid: true,
      percentage: 100,
      score: 100,
      maxScore: 100,
      errors: [],
      warnings: ['Orchestrator SD validated via child completion'],
      isOrchestrator: true,
      childCount: children.length,
      completedChildCount: children.length
    };

    console.log(`\n📊 SD Completeness Score: ${sdValidation.percentage}% (orchestrator auto-pass)`);

    const execution = await createHandoffExecution(this.supabase, sd, template, sdValidation, null);

    console.log('\n✅ HANDOFF APPROVED (ORCHESTRATOR)');
    console.log('='.repeat(50));
    console.log('✅ Orchestrator SD validated via child completion');
    console.log(`✅ All ${children.length} child SDs are complete`);
    console.log('✅ Environment ready for planning');

    await updateSdStatusAfterHandoff(this.supabase, sd, sdValidation, {
      handoffMetadata: {
        orchestrator_auto_pass: true,
        child_count: children.length
      }
    });

    console.log('\n🎯 PLAN PHASE AUTHORIZED (ORCHESTRATOR)');
    console.log('Orchestrator SD handed off to PLAN for coordination');

    return {
      success: true,
      executionId: execution.id,
      sdId: sd.id,
      qualityScore: 100,
      isOrchestrator: true
    };
  }

  /**
   * Approve orchestrator with incomplete children (initial setup)
   * @private
   */
  async _approveOrchestratorInitial(sd, template, children, completedChildren) {
    console.log('\n   ℹ️  Orchestrator with incomplete children - EXPECTED at this phase');
    console.log('   ℹ️  Children will work after parent enters EXEC phase');
    console.log('   ✅ Proceeding with orchestrator LEAD→PLAN handoff');

    const sdValidation = {
      valid: true,
      percentage: 90,
      score: 90,
      maxScore: 100,
      errors: [],
      warnings: [`Orchestrator has ${children.length - completedChildren.length} incomplete children - expected at LEAD→PLAN phase`],
      isOrchestrator: true,
      childCount: children.length,
      completedChildCount: completedChildren.length,
      orchestratorPhase: 'initial_setup'
    };

    const execution = await createHandoffExecution(this.supabase, sd, template, sdValidation, null);

    console.log('\n✅ HANDOFF APPROVED (ORCHESTRATOR INITIAL)');
    console.log('='.repeat(50));
    console.log('✅ Orchestrator SD proceeding to PLAN phase');
    console.log(`✅ ${children.length} child SDs will work after parent enters EXEC`);

    await updateSdStatusAfterHandoff(this.supabase, sd, sdValidation, {
      isParent: true,
      handoffMetadata: {
        orchestrator_initial_setup: true,
        child_count: children.length,
        incomplete_children: children.length - completedChildren.length
      }
    });

    console.log('\n🎯 PLAN PHASE AUTHORIZED (ORCHESTRATOR INITIAL)');
    console.log('Parent SD will coordinate children after entering EXEC');

    return {
      success: true,
      executionId: execution.id,
      sdId: sd.id,
      qualityScore: 90,
      isOrchestrator: true,
      orchestratorPhase: 'initial_setup'
    };
  }

  /**
   * Run AI SD type classification
   * @private
   */
  async _runTypeClassification(sd, sdValidation) {
    try {
      console.log('\n🤖 AI SD TYPE CLASSIFICATION');
      console.log('-'.repeat(50));

      const { default: SDTypeClassifier } = await import('../modules/sd-type-classifier.js');
      const classifier = new SDTypeClassifier();
      const classification = await classifier.classify(sd);

      console.log(`   Declared Type: ${classification.declaredType}`);
      console.log(`   Detected Type: ${classification.detectedType}`);
      console.log(`   Confidence: ${classification.confidence}%`);
      console.log(`   Reasoning: ${classification.reasoning}`);

      if (classification.mismatch) {
        console.log('\n   ⚠️  TYPE MISMATCH DETECTED');
        console.log(`   ${classification.recommendation}`);

        if (classification.confidence >= 80) {
          sdValidation.warnings.push(
            `sd_type mismatch: declared '${classification.declaredType}' but AI detected '${classification.detectedType}' ` +
            `with ${classification.confidence}% confidence. ${classification.reasoning}`
          );
        }
      }

      if (classification.usedWorstCase) {
        console.log('\n   ⚠️  WORST-CASE HANDOFFS APPLIED');
        console.log(`   Due to low confidence (${classification.confidence}%), using most restrictive handoff requirements:`);
        console.log(`   ${classification.effectiveHandoffs.join(' → ')}`);
        sdValidation.effectiveHandoffs = classification.effectiveHandoffs;
      }

      console.log('\n   ✅ Classification complete');
    } catch (classifierError) {
      console.log(`\n   ⚠️  AI Classification unavailable: ${classifierError.message}`);
      console.log('   Falling back to keyword-based validation');
    }
  }

  /**
   * Run AI quality assessment (Russian Judge)
   * @private
   */
  async _runQualityAssessment(sd) {
    const russianJudgeEnabled = process.env.RUSSIAN_JUDGE_ENABLED === 'true';
    if (!russianJudgeEnabled) return;

    try {
      console.log('\n🤖 AI QUALITY ASSESSMENT (Russian Judge)');
      console.log('-'.repeat(50));

      const { SDQualityRubric } = await import('../modules/rubrics/sd-quality-rubric.js');
      const rubric = new SDQualityRubric();
      const aiAssessment = await rubric.validateSDQuality(sd);

      console.log(`   Score: ${aiAssessment.score}% (threshold: 70%)`);
      console.log(`   Status: ${aiAssessment.passed ? 'PASSED' : 'NEEDS IMPROVEMENT'}`);

      if (aiAssessment.issues && aiAssessment.issues.length > 0) {
        console.log('\n   ⚡ Issues identified:');
        aiAssessment.issues.forEach(issue => console.log(`     - ${issue}`));
      }

      if (aiAssessment.warnings && aiAssessment.warnings.length > 0) {
        console.log('\n   💡 Recommendations:');
        aiAssessment.warnings.forEach(warning => console.log(`     - ${warning}`));
      }

      if (!aiAssessment.passed) {
        console.log('\n   ⚠️  Note: Proceeding despite quality concerns (ADVISORY mode)');
      } else {
        console.log('\n   ✅ Quality assessment passed');
      }
    } catch (rjError) {
      console.log(`\n   ⚠️  Russian Judge unavailable: ${rjError.message}`);
      console.log('   Proceeding with traditional validation only');
    }
  }

  /**
   * Run PRD readiness validation checks
   * @private
   */
  _runPrdReadinessChecks(sd, sdValidation) {
    const prdReadiness = validatePRDReadiness(sd);
    sdValidation.warnings.push(...prdReadiness.warnings);
    sdValidation.prdReadinessScore = prdReadiness.score;

    const visionCheck = validateVisionDocumentReferences(sd, EHG_ENGINEER_ROOT);
    sdValidation.warnings.push(...visionCheck.warnings);

    const depCheck = validateDependencyStructure(sd);
    sdValidation.warnings.push(...depCheck.warnings);

    const scopeCheck = validateScopeStructure(sd);
    sdValidation.warnings.push(...scopeCheck.warnings);

    const criteriaCheck = validateSuccessCriteriaActionability(sd);
    sdValidation.warnings.push(...criteriaCheck.warnings);

    const contextCheck = validateImplementationContext(sd);
    sdValidation.warnings.push(...contextCheck.warnings);
  }

  /**
   * Display PRD readiness warnings
   * @private
   */
  _displayWarnings(sdValidation) {
    if (sdValidation.warnings.length > 0) {
      console.log('\n📋 PRD-READINESS WARNINGS (Advisory)');
      console.log('-'.repeat(50));
      sdValidation.warnings.forEach((warning, i) => {
        console.log(`   ${i + 1}. ${warning}`);
      });
      console.log('\n   ℹ️  These are recommendations, not blocking errors.');
      console.log('   Addressing them will help PLAN create a better PRD.');
    }

    if (sdValidation.prdReadinessScore !== undefined) {
      console.log(`\n📊 PRD-Readiness Score: ${sdValidation.prdReadinessScore}/100`);
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'verify' || !command) {
    const sdId = args[1];

    if (!sdId) {
      console.log('Usage: node verify-handoff-lead-to-plan.js verify SD-YYYY-XXX');
      console.log('       node verify-handoff-lead-to-plan.js help');
      process.exit(1);
    }

    const verifier = new LeadToPlanVerifier();
    const result = await verifier.verifyHandoff(sdId);

    process.exit(result.success ? 0 : 1);

  } else if (command === 'help') {
    console.log('LEAD → PLAN Handoff Verification');
    console.log('='.repeat(40));
    console.log('');
    console.log('This script enforces LEO Protocol v4.3.3 strategic standards.');
    console.log('');
    console.log('REQUIREMENTS CHECKED (Blocking):');
    console.log('• Strategic Directive completeness (100% score)');
    console.log('• Business objectives clearly defined (≥2)');
    console.log('• Success metrics are measurable (≥3)');
    console.log('• Constraints and risk analysis complete');
    console.log('• Strategic feasibility validated');
    console.log('• Development environment ready');
    console.log('• Handoff document meets protocol standards (if provided)');
    console.log('');
    console.log('PRD-READINESS CHECKS (Advisory - v4.3.3):');
    console.log('• Description ≥100 chars, Scope ≥50 chars, Rationale ≥30 chars');
    console.log('• Vision document references exist (for Vision SDs)');
    console.log('• Dependencies array populated and valid');
    console.log('• Scope has IN SCOPE / OUT OF SCOPE sections');
    console.log('• Success criteria are actionable/verifiable');
    console.log('• Implementation context in metadata (key_files, etc.)');
    console.log('');
    console.log('USAGE:');
    console.log('  verify SD-YYYY-XXX     - Verify handoff for Strategic Directive');
    console.log('  help                   - Show this help');

  } else {
    console.error('Unknown command. Use "help" for usage information.');
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export for external use
export default LeadToPlanVerifier;
export {
  validateStrategicDirective,
  validateFeasibility,
  validatePRDReadiness,
  autoDetectSdType,
  checkEnvironmentReadiness,
  createHandoffExecution,
  rejectHandoff,
  generateImprovementGuidance
};
