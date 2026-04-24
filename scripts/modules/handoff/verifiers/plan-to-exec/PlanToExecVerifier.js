/**
 * PLAN → EXEC Handoff Verifier Class
 *
 * Main orchestration class for verifying PLAN→EXEC handoffs.
 * Uses modular helper functions for validation.
 *
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

import { createSupabaseServiceClient } from '../../../../../lib/supabase-client.js';
import HandoffValidator from '../../../../handoff-validator.js';
import { validateUserStoriesForHandoff, getUserStoryImprovementGuidance } from '../../../user-story-quality-validation.js';
import { validatePRDForHandoff, getPRDImprovementGuidance } from '../../../prd-quality-validation.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

import {
  PRD_REQUIREMENTS,
  basicPRDValidation,
  resolvePRDThreshold,
  validateParentOrchestratorPRD,
  validatePlanPresentation,
  getStoryMinimumScoreByCategory
} from './index.js';
import { validateWorkflowReview, createHandoffExecution } from './workflow-validation.js';
import { rejectHandoff } from './rejection.js';
import { updateExecutionContext } from '../../auto-proceed-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '../../../../..');

dotenv.config({ path: path.resolve(EHG_ENGINEER_ROOT, '.env') });

/**
 * PlanToExecVerifier - Validates PLAN→EXEC handoff readiness
 */
export class PlanToExecVerifier {
  constructor() {
    this.supabase = createSupabaseServiceClient();

    this.handoffValidator = new HandoffValidator();
    this.prdRequirements = PRD_REQUIREMENTS;
  }

  /**
   * Load PRD validation checklist system
   */
  async loadPRDValidator() {
    try {
      const validatorPath = path.join(__dirname, '../../../../prd-validation-checklist.js');
      const { validatePRD } = await import(validatorPath);
      return validatePRD;
    } catch (e) {
      console.warn('[PlanToExecVerifier] PRD validator not found, using basic validation:', e?.message || e);
      return basicPRDValidation;
    }
  }

  /**
   * Verify PLAN → EXEC handoff readiness
   */
  async verifyHandoff(sdId, prdId = null) {
    console.log('🔍 PLAN → EXEC HANDOFF VERIFICATION');
    console.log('='.repeat(50));
    console.log(`Strategic Directive: ${sdId}`);

    try {
      // 1. Load Strategic Directive (support UUID and sd_key)
      // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
      const { data: sd, error: sdError } = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .or(`id.eq.${sdId},sd_key.eq.${sdId}`)
        .single();

      if (sdError || !sd) {
        throw new Error(`Strategic Directive ${sdId} not found: ${sdError?.message}`);
      }

      // PAT-PARENT-DET: Detect parent orchestrator SDs
      const isParentOrchestrator = sd.metadata?.is_parent === true;
      if (isParentOrchestrator) {
        console.log('\n   🎯 PARENT ORCHESTRATOR DETECTED');
        console.log('      Skipping implementation-specific validation (user stories, workflow review)');
        console.log('      Work is delegated to child SDs');
      }

      // 2. Load associated PRD
      let prds = null;
      let prdError = null;
      let prdSource = 'sd_id';

      if (prdId) {
        const result = await this.supabase.from('product_requirements_v2').select('*').eq('id', prdId);
        prds = result.data;
        prdError = result.error;
        prdSource = 'id';
      } else {
        // Primary lookup by sd_id
        const result = await this.supabase.from('product_requirements_v2').select('*').eq('sd_id', sd.id);
        prds = result.data;
        prdError = result.error;

        // Fallback: Try directive_id column (for older PRDs)
        if ((!prds || prds.length === 0) && !prdError) {
          const fallback = await this.supabase.from('product_requirements_v2').select('*').eq('directive_id', sd.id);
          if (fallback.data && fallback.data.length > 0) {
            prds = fallback.data;
            prdSource = 'directive_id (legacy)';
            console.log('   ℹ️  PRD found via directive_id column (legacy fallback)');
          }
        }
      }

      if (prdError || !prds || prds.length === 0) {
        // RCA-PRD-FRICTION: Check validation profile for sd_type exemption
        const { data: prdProfile } = await this.supabase
          .from('sd_type_validation_profiles')
          .select('requires_prd')
          .eq('sd_type', sd.sd_type || 'feature')
          .maybeSingle();

        if (prdProfile && prdProfile.requires_prd === false) {
          console.log(`   ℹ️  PRD not required for sd_type='${sd.sd_type}' - proceeding without PRD`);
          // Return success with minimal verification for PRD-exempt SDs
          return {
            success: true,
            prdId: null,
            qualityScore: 100,
            message: `PRD exempted for sd_type='${sd.sd_type}' per validation profile`
          };
        }

        console.log(`   ❌ No PRD found with sd_id: ${sd.id}`);
        return rejectHandoff(this.supabase,sdId, 'NO_PRD', 'No PRD found for Strategic Directive');
      }

      const prd = Array.isArray(prds) ? prds[0] : prds;
      console.log(`PRD Found: ${prd.id} (via ${prdSource})`);

      // 3. Load handoff template
      const { data: template } = await this.supabase
        .from('leo_handoff_templates')
        .select('*')
        .eq('from_agent', 'PLAN')
        .eq('to_agent', 'EXEC')
        .single();

      // 3a. MANDATORY: Check User Stories Exist
      const { data: validationProfile } = await this.supabase
        .from('sd_type_validation_profiles')
        .select('requires_user_stories, requires_e2e_tests, requires_prd')
        .eq('sd_type', sd.sd_type)
        .single();

      const requiresUserStories = validationProfile?.requires_user_stories !== false;
      let userStories = [];
      let completedStories = 0;

      if (isParentOrchestrator) {
        console.log('\n📝 User stories check: SKIPPED (parent orchestrator)');
      } else if (!requiresUserStories) {
        console.log(`\n📝 User stories check: SKIPPED (sd_type='${sd.sd_type}')`);
      } else {
        console.log('\n📝 Checking for user stories...');
        const { data: stories, error: userStoriesError } = await this.supabase
          .from('user_stories')
          .select('id, story_key, title, status, user_role, user_want, user_benefit, acceptance_criteria, story_points, implementation_context, sd_id')
          .eq('sd_id', sd.id);

        if (userStoriesError) {
          return rejectHandoff(this.supabase,sdId, 'USER_STORIES_ERROR', `Error querying user stories: ${userStoriesError.message}`);
        }

        if (!stories || stories.length === 0) {
          // Fallback: check if PRD content has embedded user_stories before rejecting
          // Some workflows store stories in the PRD JSON but haven't migrated them to the table
          const prdForStoryCheck = prds && prds.length > 0 ? (Array.isArray(prds) ? prds[0] : prds) : null;
          const prdContent = prdForStoryCheck?.content;
          const embeddedStories = typeof prdContent === 'object' && prdContent?.user_stories;
          const hasEmbeddedStories = Array.isArray(embeddedStories) && embeddedStories.length > 0;

          if (hasEmbeddedStories) {
            console.log(`   ⚠️  No user stories in table, but found ${embeddedStories.length} in PRD content (fallback)`);
            console.log('   💡 Run add-prd-to-database.js to migrate stories to the user_stories table');
            userStories = embeddedStories;
          } else {
            console.log('   ❌ No user stories found');
            return rejectHandoff(this.supabase,sdId, 'NO_USER_STORIES', 'User stories are MANDATORY before EXEC phase.', {
              userStoriesCount: 0,
              requiredMinimum: 1,
              hint: 'If stories exist in the PRD, run add-prd-to-database.js to sync them to the user_stories table.'
            });
          }
        }

        userStories = stories;
        console.log(`   ✅ User stories found: ${userStories.length}`);
        completedStories = userStories.filter(s => s.status === 'completed').length;
        console.log(`   📊 Status: ${completedStories}/${userStories.length} completed`);
      }

      // 3a-2. User Story Quality Validation
      let storyQualityResult = { valid: true, averageScore: 100, warnings: [] };

      if (!isParentOrchestrator && requiresUserStories) {
        console.log('\n🔍 Validating user story quality...');
        const storyMinimumScore = getStoryMinimumScoreByCategory(sd.category, sd.sd_type);
        console.log(`   SD Type: ${sd.sd_type || 'unknown'}, Category: ${sd.category || 'unknown'} → Minimum Score: ${storyMinimumScore}%`);

        storyQualityResult = await validateUserStoriesForHandoff(userStories, {
          minimumScore: storyMinimumScore,
          minimumStories: 1,
          blockOnWarnings: false,
          sdType: sd.sd_type,
          sdCategory: sd.category
        });

        console.log(storyQualityResult.summary);

        if (!storyQualityResult.valid) {
          const guidance = getUserStoryImprovementGuidance(storyQualityResult);
          console.log('\n   ❌ User story quality validation failed');
          return rejectHandoff(this.supabase,sdId, 'USER_STORY_QUALITY', 'User stories do not meet quality standards for EXEC phase', {
            qualityValidation: storyQualityResult,
            improvements: guidance
          });
        }

        console.log(`   ✅ User story quality passed (average score: ${storyQualityResult.averageScore}%)`);
      }

      // 3b. Workflow Review Validation
      let workflowReviewResult = { valid: true, status: 'SKIPPED' };

      if (!isParentOrchestrator) {
        console.log('\n📋 Checking workflow review analysis...');
        workflowReviewResult = await validateWorkflowReview(this.supabase,sdId);

        if (!workflowReviewResult.valid) {
          return rejectHandoff(this.supabase,sdId, 'WORKFLOW_REVIEW_FAILED', workflowReviewResult.message, {
            workflowAnalysis: workflowReviewResult.analysis,
            requiredActions: workflowReviewResult.requiredActions
          });
        }

        console.log(`   ✅ Workflow review passed: ${workflowReviewResult.status}`);
      }

      // 4. Validate PRD Quality
      let prdValidation;

      if (isParentOrchestrator) {
        console.log('\n📊 Parent Orchestrator PRD Validation (simplified)...');
        prdValidation = validateParentOrchestratorPRD(prd);
        console.log(`   Score: ${prdValidation.percentage}%`);

        if (!prdValidation.valid) {
          console.log('   ❌ Parent orchestrator PRD validation failed');
          prdValidation.errors.forEach(err => console.log(`      • ${err}`));
          return rejectHandoff(this.supabase,sdId, 'PRD_QUALITY', 'Parent orchestrator PRD missing required fields', {
            prdValidation,
            requiredScore: 80,
            actualScore: prdValidation.percentage
          });
        }
        console.log('   ✅ Parent orchestrator PRD validation passed');
      } else {
        // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-127 FR-3: sd_type-aware threshold from
        // sd_type_validation_profiles.prd_minimum_score (fallback 85). Replaces the flat 100%
        // that caused PAT-HF-PLANTOEXEC-813875a9 — infra/docs PRDs with 6 of 7 fields failed at 86%.
        const minimumScore = await resolvePRDThreshold(this.supabase, sd.sd_type);
        const prdValidator = await this.loadPRDValidator();
        // basicPRDValidation honors options.minimumScore; richer validators ignore it harmlessly.
        prdValidation = await prdValidator(prd, { minimumScore });

        console.log(`\n📊 PRD Quality Score: ${prdValidation.percentage || prdValidation.score}% (threshold for sd_type='${sd.sd_type}': ${minimumScore}%)`);

        const actualScore = prdValidation.percentage || prdValidation.score;
        if (!prdValidation.valid || actualScore < minimumScore) {
          const topErrors = (prdValidation?.errors || []).slice(0, 3);
          const errorSuffix = topErrors.length > 0 ? `: ${topErrors.join('; ')}` : '';
          const prdQualityMsg = `PRD does not meet quality standards (score: ${actualScore}% / required: ${minimumScore}%)${errorSuffix}`;
          return rejectHandoff(this.supabase, sdId, 'PRD_QUALITY', prdQualityMsg, {
            prdValidation,
            requiredScore: minimumScore,
            actualScore
          });
        }
      }

      // 4a. PRD Boilerplate/Placeholder Detection
      let prdBoilerplateResult = { valid: true, score: 100, warnings: [] };
      const isRefactorBrief = prd.document_type === 'refactor_brief';

      if (!isParentOrchestrator) {
        const prdMinimumScore = isRefactorBrief ? 50 : getStoryMinimumScoreByCategory(sd.category, sd.sd_type);
        console.log('\n🔍 Validating PRD content quality...');

        prdBoilerplateResult = await validatePRDForHandoff(prd, {
          minimumScore: prdMinimumScore,
          blockOnWarnings: false,
          sdType: sd.sd_type,
          sdCategory: sd.category
        });

        console.log(prdBoilerplateResult.summary);

        if (!prdBoilerplateResult.valid) {
          const guidance = getPRDImprovementGuidance(prdBoilerplateResult);
          console.log('\n   ❌ PRD content quality validation failed');
          return rejectHandoff(this.supabase,sdId, 'PRD_BOILERPLATE', 'PRD contains placeholder or boilerplate content', {
            qualityValidation: prdBoilerplateResult,
            improvements: guidance
          });
        }

        console.log(`   ✅ PRD content quality passed (score: ${prdBoilerplateResult.score}%)`);
      }

      // 5. Check PLAN phase completion
      // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126 (PAT-HF-PLANTOEXEC-eaccd2b3):
      // Parent-orchestrator allow-list must include 'in_progress' to match
      // prerequisite-preflight.js:268 — parents re-entering PLAN-TO-EXEC after
      // a child cycle see their PRD in 'in_progress' legitimately.
      const validStatuses = isParentOrchestrator
        ? ['approved', 'ready_for_exec', 'planning', 'draft', 'in_progress']
        : ['approved', 'ready_for_exec', 'in_progress'];

      if (!validStatuses.includes(prd.status)) {
        return rejectHandoff(this.supabase,sdId, 'PLAN_INCOMPLETE', `PRD status is '${prd.status}', expected one of: ${validStatuses.join(', ')}`);
      }

      // 6. Validate handoff content (if provided)
      const handoffPath = path.join(EHG_ENGINEER_ROOT, 'handoffs', `PLAN-to-EXEC-${sdId}.md`);
      let handoffValidation = null;
      let planPresentationValidation = null;

      if (fs.existsSync(handoffPath)) {
        const handoffContent = fs.readFileSync(handoffPath, 'utf8');
        const handoffData = this.handoffValidator.parseHandoffDocument(handoffContent);
        handoffValidation = this.handoffValidator.validateHandoff(handoffData);

        if (!handoffValidation.valid) {
          return rejectHandoff(this.supabase,sdId, 'HANDOFF_INVALID', 'Handoff document does not meet LEO Protocol requirements', {
            handoffValidation
          });
        }

        // 6a. Validate plan_presentation in handoff metadata
        if (handoffData.metadata) {
          console.log('\n📋 Validating plan_presentation...');
          planPresentationValidation = validatePlanPresentation(handoffData.metadata);

          if (!planPresentationValidation.valid) {
            console.log('   ❌ plan_presentation validation failed');
            planPresentationValidation.errors.forEach(err => console.log(`      • ${err}`));
            return rejectHandoff(this.supabase,sdId, 'PLAN_PRESENTATION_INVALID', 'plan_presentation does not meet template requirements', {
              planPresentationValidation
            });
          }

          console.log('   ✅ plan_presentation validation passed');
        }
      }

      // 7. Create handoff execution record
      const execution = await createHandoffExecution(this.supabase,sd, prd, template, prdValidation, handoffValidation);

      // 8. HANDOFF APPROVED
      console.log('\n✅ HANDOFF APPROVED');
      console.log('='.repeat(50));
      console.log('✅ Strategic Directive exists and is active');
      const approvedThreshold = prdValidation.thresholdApplied ?? this.prdRequirements.minimumScore;
      console.log(`✅ PRD quality score: ${prdValidation.percentage || prdValidation.score}% (≥${approvedThreshold}%)`);
      console.log('✅ PRD status ready for execution');

      // Update PRD to EXEC phase
      await this.supabase
        .from('product_requirements_v2')
        .update({
          status: 'in_progress',
          phase: 'EXEC',
          updated_at: new Date().toISOString()
        })
        .eq('id', prd.id);

      console.log('\n🚀 EXEC PHASE AUTHORIZED');
      console.log('PRD handed off to EXEC agent for implementation');

      // SD-LEO-ENH-AUTO-PROCEED-001-04: Update AUTO-PROCEED state for resume tracking
      try {
        updateExecutionContext({
          sdKey: sdId,
          phase: 'EXEC',
          task: `Implementing ${prd.title || sdId}`,
          isActive: true
        });
      } catch (apError) {
        console.warn(`   ⚠️  Could not update AUTO-PROCEED state: ${apError.message}`);
      }

      return {
        success: true,
        executionId: execution.id,
        prdId: prd.id,
        qualityScore: prdValidation.percentage || prdValidation.score,
        validation: {
          prd: prdValidation,
          userStories: {
            count: userStories.length,
            completed: completedStories,
            verified: true,
            stories: userStories.map(s => ({ key: s.story_key, title: s.title, status: s.status }))
          },
          workflowReview: workflowReviewResult,
          planPresentation: planPresentationValidation || null,
          handoffDocument: handoffValidation || null,
          timestamp: new Date().toISOString(),
          verifier: 'PlanToExecVerifier'
        }
      };

    } catch (error) {
      console.error('❌ Handoff verification failed:', error.message);
      return rejectHandoff(this.supabase, sdId, 'SYSTEM_ERROR', error.message);
    }
  }
}

/**
 * CLI entry point
 */
export async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'verify' || !command) {
    const sdId = args[1];
    const prdId = args[2];

    if (!sdId) {
      console.log('Usage: node scripts/handoff.js execute PLAN-TO-EXEC SD-YYYY-XXX');
      console.log('       (legacy CLI; use scripts/handoff.js for current workflow)');
      process.exit(1);
    }

    const verifier = new PlanToExecVerifier();
    const result = await verifier.verifyHandoff(sdId, prdId);

    process.exit(result.success ? 0 : 1);

  } else if (command === 'help') {
    console.log('PLAN → EXEC Handoff Verification');
    console.log('='.repeat(40));
    console.log('');
    console.log('This script enforces LEO Protocol v4.1.2 handoff standards.');
    console.log('');
    console.log('USAGE:');
    console.log('  verify SD-YYYY-XXX     - Verify handoff for Strategic Directive');
    console.log('  verify SD-YYYY-XXX PRD-ID - Verify specific PRD handoff');
    console.log('  help                   - Show this help');
  } else {
    console.error('Unknown command. Use "help" for usage information.');
    process.exit(1);
  }
}
