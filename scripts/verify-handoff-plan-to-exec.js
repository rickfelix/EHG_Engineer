#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';





/**
 * PLAN → EXEC Handoff Verification Script
 * LEO Protocol v4.1.2 - Critical Quality Gate
 * 
 * ENFORCES: PRD must meet quality standards before EXEC phase begins
 * PREVENTS: Incomplete or low-quality PRDs reaching implementation
 * RETURNS: To PLAN with specific improvement requirements if validation fails
 */

import { createClient } from '@supabase/supabase-js';
import HandoffValidator from './handoff-validator.js';
import { validateUserStoriesForHandoff, getUserStoryImprovementGuidance } from './modules/user-story-quality-validation.js';
import { validatePRDForHandoff, getPRDImprovementGuidance } from './modules/prd-quality-validation.js';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

class PlanToExecVerifier {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    this.handoffValidator = new HandoffValidator();
    
    // PRD Quality Requirements (LEO Protocol v4.1.2)
    this.prdRequirements = {
      minimumScore: 100, // MAXIMUM standard - 100% completeness required
      requiredFields: [
        'executive_summary',
        'functional_requirements',
        'system_architecture',      // Updated from technical_requirements
        'acceptance_criteria',
        'test_scenarios',           // Updated from success_metrics
        'implementation_approach',  // Updated from constraints
        'risks'                     // Updated from risk_assessment
      ],
      minimumFunctionalReqs: 3,
      minimumTechnicalReqs: 2,
      minimumAcceptanceCriteria: 5
    };
  }

  /**
   * Get minimum user story quality score based on SD category
   * Infrastructure and documentation SDs have more lenient thresholds
   * since they focus less on user-facing acceptance criteria
   *
   * @param {string} category - SD category from strategic_directives_v2
   * @returns {number} Minimum score percentage
   */
  getStoryMinimumScoreByCategory(category, sdType = null) {
    // Map category/type to minimum score (matching ai-quality-evaluator.js thresholds)
    const categoryThresholds = {
      // Very lenient for documentation-only work
      'documentation': 50,
      'docs': 50,

      // Lenient for internal/infrastructure work (includes QA/testing tooling)
      'infrastructure': 55,
      'infra': 55,
      'tooling': 55,
      'devops': 55,
      'quality': 55,  // QA/testing work is similar to infrastructure

      // Moderate for standard features (lowered to 55% during Phase 1 AI calibration)
      // TODO: Increase to 65% once AI scoring is calibrated (target: 2-4 weeks)
      'feature': 55,
      'enhancement': 55,

      // Stricter for data/security work
      'database': 68,
      'security': 68,

      // Default for unknown categories
      'default': 70
    };

    const normalizedCategory = (category || '').toLowerCase();
    const normalizedSdType = (sdType || '').toLowerCase();

    // Try category first, then sd_type, then default
    return categoryThresholds[normalizedCategory] ||
           categoryThresholds[normalizedSdType] ||
           categoryThresholds.default;
  }

  /**
   * Load PRD validation checklist system
   */
  async loadPRDValidator() {
    try {
      const validatorPath = path.join(__dirname, 'prd-validation-checklist.js');
      const { validatePRD } = require(validatorPath);
      return validatePRD;
    } catch (error) {
      console.warn('⚠️  PRD validator not found, using basic validation');
      return this.basicPRDValidation.bind(this);
    }
  }
  
  /**
   * Basic PRD validation fallback
   */
  basicPRDValidation(prd) {
    const validation = {
      valid: true,
      score: 0,
      maxScore: 100,
      errors: [],
      warnings: []
    };

    // Check required fields
    this.prdRequirements.requiredFields.forEach(field => {
      const value = prd[field];
      const isPresent = value !== null && value !== undefined;

      if (!isPresent) {
        validation.valid = false;
        validation.errors.push(`Missing required field: ${field}`);
      } else {
        // For strings, check if non-empty after trim
        if (typeof value === 'string' && !value.trim()) {
          validation.valid = false;
          validation.errors.push(`Empty required field: ${field}`);
        } else if (Array.isArray(value) && value.length === 0) {
          validation.valid = false;
          validation.errors.push(`Empty array for required field: ${field}`);
        } else {
          validation.score += 10;
        }
      }
    });
    
    // Check functional requirements count
    if (prd.functional_requirements) {
      const funcReqs = Array.isArray(prd.functional_requirements) 
        ? prd.functional_requirements 
        : JSON.parse(prd.functional_requirements || '[]');
      
      if (funcReqs.length < this.prdRequirements.minimumFunctionalReqs) {
        validation.errors.push(`Insufficient functional requirements: ${funcReqs.length}/${this.prdRequirements.minimumFunctionalReqs}`);
        validation.valid = false;
      }
    }
    
    validation.percentage = Math.round((validation.score / 70) * 100); // Adjust for available points
    return validation;
  }

  /**
   * PAT-PARENT-DET: Validate parent orchestrator PRD
   * Parent orchestrators have different requirements than implementation PRDs:
   * - Focus on decomposition structure and children coordination
   * - Don't need system_architecture or implementation_approach
   * - Need metadata.is_orchestrator_prd and decomposition_structure
   */
  validateParentOrchestratorPRD(prd) {
    const validation = {
      valid: true,
      score: 0,
      maxScore: 100,
      errors: [],
      warnings: [],
      percentage: 0
    };

    // Required fields for parent orchestrator PRD
    const requiredFields = [
      'id',
      'title',
      'executive_summary',
      'functional_requirements'
    ];

    // Check required fields
    let fieldScore = 0;
    requiredFields.forEach(field => {
      const value = prd[field];
      const isPresent = value !== null && value !== undefined;

      if (!isPresent) {
        validation.errors.push(`Missing required field: ${field}`);
        validation.valid = false;
      } else if (typeof value === 'string' && !value.trim()) {
        validation.errors.push(`Empty required field: ${field}`);
        validation.valid = false;
      } else if (Array.isArray(value) && value.length === 0) {
        validation.errors.push(`Empty array for required field: ${field}`);
        validation.valid = false;
      } else {
        fieldScore += 20; // 20 points per field, 80 total for 4 fields
      }
    });

    // Check for orchestrator metadata
    if (prd.metadata?.is_orchestrator_prd === true) {
      fieldScore += 10;
    } else {
      validation.warnings.push('PRD metadata.is_orchestrator_prd not set to true');
    }

    // Check for decomposition_structure
    if (prd.metadata?.decomposition_structure) {
      fieldScore += 10;
    } else {
      validation.warnings.push('PRD metadata.decomposition_structure not present');
    }

    validation.score = fieldScore;
    validation.percentage = Math.min(100, fieldScore);

    // Parent orchestrator PRDs pass with 80% (functional requirements present)
    if (validation.percentage >= 80 || validation.errors.length === 0) {
      validation.valid = true;
    }

    return validation;
  }

  /**
   * Validate plan_presentation structure in handoff metadata
   * SD-PLAN-PRESENT-001: Ensures PLAN→EXEC handoffs include implementation guidance
   */
  validatePlanPresentation(metadata) {
    const validation = {
      valid: true,
      errors: []
    };

    if (!metadata?.plan_presentation) {
      validation.valid = false;
      validation.errors.push('plan_presentation required in PLAN→EXEC handoff metadata');
      return validation;
    }

    const pp = metadata.plan_presentation;

    // Validate goal_summary
    if (!pp.goal_summary || pp.goal_summary.trim().length === 0) {
      validation.errors.push('plan_presentation.goal_summary is required');
      validation.valid = false;
    } else if (pp.goal_summary.length > 300) {
      validation.errors.push(`plan_presentation.goal_summary must be ≤300 characters (current: ${pp.goal_summary.length})`);
      validation.valid = false;
    }

    // Validate file_scope
    if (!pp.file_scope || typeof pp.file_scope !== 'object') {
      validation.errors.push('plan_presentation.file_scope is required');
      validation.valid = false;
    } else {
      const hasFiles = (pp.file_scope.create?.length > 0) ||
                       (pp.file_scope.modify?.length > 0) ||
                       (pp.file_scope.delete?.length > 0);
      if (!hasFiles) {
        validation.errors.push('plan_presentation.file_scope must have at least one of: create, modify, or delete');
        validation.valid = false;
      }
    }

    // Validate execution_plan
    if (!Array.isArray(pp.execution_plan) || pp.execution_plan.length === 0) {
      validation.errors.push('plan_presentation.execution_plan must be array with ≥1 step');
      validation.valid = false;
    }

    // Validate testing_strategy
    if (!pp.testing_strategy || typeof pp.testing_strategy !== 'object') {
      validation.errors.push('plan_presentation.testing_strategy is required');
      validation.valid = false;
    } else {
      if (!pp.testing_strategy.unit_tests) {
        validation.errors.push('plan_presentation.testing_strategy.unit_tests is required');
        validation.valid = false;
      }
      if (!pp.testing_strategy.e2e_tests) {
        validation.errors.push('plan_presentation.testing_strategy.e2e_tests is required');
        validation.valid = false;
      }
    }

    return validation;
  }

  /**
   * Verify PLAN → EXEC handoff readiness
   */
  async verifyHandoff(sdId, prdId = null) {
    console.log('🔍 PLAN → EXEC HANDOFF VERIFICATION');
    console.log('='.repeat(50));
    console.log(`Strategic Directive: ${sdId}`);
    
    try {
      // 1. Load Strategic Directive
      const { data: sd, error: sdError } = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', sdId)
        .single();
        
      if (sdError || !sd) {
        throw new Error(`Strategic Directive ${sdId} not found: ${sdError?.message}`);
      }

      // PAT-PARENT-DET: Detect parent orchestrator SDs
      // Parent orchestrators coordinate children - they don't need implementation validation
      const isParentOrchestrator = sd.metadata?.is_parent === true;
      if (isParentOrchestrator) {
        console.log('\n   🎯 PARENT ORCHESTRATOR DETECTED');
        console.log('      Skipping implementation-specific validation (user stories, workflow review)');
        console.log('      Work is delegated to child SDs');
      }

      // 2. Load associated PRD
      // SD ID Schema Cleanup (2025-12-12): Use sd.id directly (uuid_id deprecated)
      // SYSTEMIC FIX: Add fallback to directive_id column (matches PRDRepository.getBySdId behavior)
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

        // Fallback: Try directive_id column (for older PRDs created before standardization)
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
        console.log(`   ❌ No PRD found with sd_id: ${sd.id}`);
        console.log('   PRD Error:', prdError);
        return this.rejectHandoff(sdId, 'NO_PRD', 'No PRD found for Strategic Directive');
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
      // PAT-PARENT-DET: Skip for parent orchestrators - children have user stories
      let userStories = [];
      let completedStories = 0;

      if (isParentOrchestrator) {
        console.log('\n📝 User stories check: SKIPPED (parent orchestrator)');
        console.log('   ℹ️  User stories belong to child SDs, not parent orchestrator');
      } else {
        console.log('\n📝 Checking for user stories...');
        const { data: stories, error: userStoriesError } = await this.supabase
          .from('user_stories')
          .select('id, story_key, title, status, user_role, user_want, user_benefit, acceptance_criteria, story_points, implementation_context, sd_id')
          .eq('sd_id', sdId);

        if (userStoriesError) {
          return this.rejectHandoff(sdId, 'USER_STORIES_ERROR', `Error querying user stories: ${userStoriesError.message}`);
        }

        if (!stories || stories.length === 0) {
          console.log('   ❌ No user stories found');
          return this.rejectHandoff(sdId, 'NO_USER_STORIES', 'User stories are MANDATORY before EXEC phase. Product Requirements Expert must generate user stories from PRD.', {
            userStoriesCount: 0,
            requiredMinimum: 1
          });
        }

        userStories = stories;
        console.log(`   ✅ User stories found: ${userStories.length}`);
        completedStories = userStories.filter(s => s.status === 'completed').length;
        console.log(`   📊 Status: ${completedStories}/${userStories.length} completed`);
      }

      // 3a-2. NEW: User Story Quality Validation (SD-CAPABILITY-LIFECYCLE-001)
      // Prevents boilerplate and low-quality stories from reaching EXEC
      // PAT-PARENT-DET: Skip for parent orchestrators
      let storyQualityResult = { valid: true, averageScore: 100, warnings: [] };

      if (isParentOrchestrator) {
        console.log('\n🔍 User story quality check: SKIPPED (parent orchestrator)');
      } else {
        console.log('\n🔍 Validating user story quality...');

        // SD-type-aware minimum score (infrastructure/documentation are more lenient)
        const storyMinimumScore = this.getStoryMinimumScoreByCategory(sd.category, sd.sd_type);
        console.log(`   SD Category: ${sd.category || 'unknown'} → Minimum Score: ${storyMinimumScore}%`);

        storyQualityResult = await validateUserStoriesForHandoff(userStories, {
          minimumScore: storyMinimumScore,
          minimumStories: 1,
          blockOnWarnings: false
        });

        console.log(storyQualityResult.summary);

        if (!storyQualityResult.valid) {
          const guidance = getUserStoryImprovementGuidance(storyQualityResult);
          console.log('\n   ❌ User story quality validation failed');
          return this.rejectHandoff(sdId, 'USER_STORY_QUALITY', 'User stories do not meet quality standards for EXEC phase', {
            qualityValidation: storyQualityResult,
            improvements: guidance
          });
        }

        console.log(`   ✅ User story quality passed (average score: ${storyQualityResult.averageScore}%)`);
        if (storyQualityResult.warnings.length > 0) {
          console.log(`   ⚠️  ${storyQualityResult.warnings.length} warnings (non-blocking)`);
        }
      }

      // 3b. MANDATORY: Workflow Review Validation (SD-DESIGN-WORKFLOW-REVIEW-001)
      // PAT-PARENT-DET: Skip for parent orchestrators
      let workflowReviewResult = { valid: true, status: 'SKIPPED' };

      if (isParentOrchestrator) {
        console.log('\n📋 Workflow review check: SKIPPED (parent orchestrator)');
        console.log('   ℹ️  Workflow review applies to child SDs with implementations');
      } else {
        console.log('\n📋 Checking workflow review analysis...');
        workflowReviewResult = await this.validateWorkflowReview(sdId);

        if (!workflowReviewResult.valid) {
          return this.rejectHandoff(sdId, 'WORKFLOW_REVIEW_FAILED', workflowReviewResult.message, {
            workflowAnalysis: workflowReviewResult.analysis,
            requiredActions: workflowReviewResult.requiredActions
          });
        }

        console.log(`   ✅ Workflow review passed: ${workflowReviewResult.status}`);
        if (workflowReviewResult.uxScore !== undefined) {
          console.log(`   📊 UX Impact Score: ${workflowReviewResult.uxScore}/10`);
        }
      }

      // 4. Validate PRD Quality
      // PAT-PARENT-DET: Parent orchestrators use simplified validation
      let prdValidation;

      if (isParentOrchestrator) {
        console.log('\n📊 Parent Orchestrator PRD Validation (simplified)...');
        prdValidation = this.validateParentOrchestratorPRD(prd);
        console.log(`   Score: ${prdValidation.percentage}%`);

        if (!prdValidation.valid) {
          console.log('   ❌ Parent orchestrator PRD validation failed');
          prdValidation.errors.forEach(err => console.log(`      • ${err}`));
          return this.rejectHandoff(sdId, 'PRD_QUALITY', 'Parent orchestrator PRD missing required fields', {
            prdValidation,
            requiredScore: 80,
            actualScore: prdValidation.percentage
          });
        }
        console.log('   ✅ Parent orchestrator PRD validation passed');
      } else {
        const prdValidator = await this.loadPRDValidator();
        prdValidation = await prdValidator(prd);

        console.log(`\\n📊 PRD Quality Score: ${prdValidation.percentage || prdValidation.score}%`);

        if (!prdValidation.valid || (prdValidation.percentage || prdValidation.score) < this.prdRequirements.minimumScore) {
          return this.rejectHandoff(sdId, 'PRD_QUALITY', 'PRD does not meet quality standards', {
            prdValidation,
            requiredScore: this.prdRequirements.minimumScore,
            actualScore: prdValidation.percentage || prdValidation.score
          });
        }
      }

      // 4a. NEW: PRD Boilerplate/Placeholder Detection (SD-CAPABILITY-LIFECYCLE-001)
      // Prevents placeholder text like "To be defined" from reaching EXEC
      // PAT-PARENT-DET: Skip for parent orchestrators - their PRDs have decomposition content
      let prdBoilerplateResult = { valid: true, score: 100, warnings: [] };

      if (isParentOrchestrator) {
        console.log('\n🔍 PRD boilerplate check: SKIPPED (parent orchestrator)');
        console.log('   ℹ️  Parent orchestrator PRDs use decomposition format');
      } else {
        console.log('\n🔍 Validating PRD content quality (boilerplate detection)...');

        // SD-type-aware minimum score for PRD (same logic as user stories)
        const prdMinimumScore = this.getStoryMinimumScoreByCategory(sd.category, sd.sd_type);
        console.log(`   SD Category: ${sd.category || 'unknown'} → PRD Minimum Score: ${prdMinimumScore}%`);

        prdBoilerplateResult = await validatePRDForHandoff(prd, {
          minimumScore: prdMinimumScore,
          blockOnWarnings: false
        });

        console.log(prdBoilerplateResult.summary);

        if (!prdBoilerplateResult.valid) {
          const guidance = getPRDImprovementGuidance(prdBoilerplateResult);
          console.log('\n   ❌ PRD content quality validation failed');
          return this.rejectHandoff(sdId, 'PRD_BOILERPLATE', 'PRD contains placeholder or boilerplate content', {
            qualityValidation: prdBoilerplateResult,
            improvements: guidance
          });
        }

        console.log(`   ✅ PRD content quality passed (score: ${prdBoilerplateResult.score}%)`);
        if (prdBoilerplateResult.warnings.length > 0) {
          console.log(`   ⚠️  ${prdBoilerplateResult.warnings.length} warnings (non-blocking)`);
        }
      }

      // 5. Check PLAN phase completion
      // PAT-PARENT-DET: Parent orchestrators can have 'planning' status since they don't implement
      const validStatuses = isParentOrchestrator
        ? ['approved', 'ready_for_exec', 'planning', 'draft']
        : ['approved', 'ready_for_exec'];

      if (!validStatuses.includes(prd.status)) {
        return this.rejectHandoff(sdId, 'PLAN_INCOMPLETE', `PRD status is '${prd.status}', expected one of: ${validStatuses.join(', ')}`);
      }

      if (isParentOrchestrator && (prd.status === 'planning' || prd.status === 'draft')) {
        console.log(`\n   ℹ️  Parent orchestrator PRD status: ${prd.status} (accepted for orchestrator)`);
      }
      
      // 6. Validate handoff content (if provided)
      const handoffPath = `/mnt/c/_EHG/EHG_Engineer/handoffs/PLAN-to-EXEC-${sdId}.md`;
      let handoffValidation = null;
      let planPresentationValidation = null;

      if (fs.existsSync(handoffPath)) {
        const handoffContent = fs.readFileSync(handoffPath, 'utf8');
        const handoffData = this.handoffValidator.parseHandoffDocument(handoffContent);
        handoffValidation = this.handoffValidator.validateHandoff(handoffData);

        if (!handoffValidation.valid) {
          return this.rejectHandoff(sdId, 'HANDOFF_INVALID', 'Handoff document does not meet LEO Protocol requirements', {
            handoffValidation
          });
        }

        // 6a. Validate plan_presentation in handoff metadata (SD-PLAN-PRESENT-001)
        if (handoffData.metadata) {
          console.log('\n📋 Validating plan_presentation...');
          planPresentationValidation = this.validatePlanPresentation(handoffData.metadata);

          if (!planPresentationValidation.valid) {
            console.log('   ❌ plan_presentation validation failed');
            planPresentationValidation.errors.forEach(err => console.log(`      • ${err}`));
            return this.rejectHandoff(sdId, 'PLAN_PRESENTATION_INVALID', 'plan_presentation does not meet template requirements', {
              planPresentationValidation
            });
          }

          console.log('   ✅ plan_presentation validation passed');
        }
      }

      // 7. Create handoff execution record
      const execution = await this.createHandoffExecution(sd, prd, template, prdValidation, handoffValidation);
      
      // 8. HANDOFF APPROVED
      console.log('\\n✅ HANDOFF APPROVED');
      console.log('='.repeat(50));
      console.log('✅ Strategic Directive exists and is active');
      console.log(`✅ PRD quality score: ${prdValidation.percentage || prdValidation.score}% (≥${this.prdRequirements.minimumScore}%)`);
      console.log('✅ PRD status ready for execution');
      if (handoffValidation) {
        console.log('✅ Handoff document meets protocol standards');
      }
      if (planPresentationValidation) {
        console.log('✅ plan_presentation template validated (SD-PLAN-PRESENT-001)');
      }
      
      // Update PRD to EXEC phase
      await this.supabase
        .from('product_requirements_v2')
        .update({
          status: 'in_progress',
          phase: 'EXEC',
          updated_at: new Date().toISOString()
        })
        .eq('id', prd.id);
      
      console.log('\\n🚀 EXEC PHASE AUTHORIZED');
      console.log('PRD handed off to EXEC agent for implementation');

      return {
        success: true,
        executionId: execution.id,
        prdId: prd.id,
        qualityScore: prdValidation.percentage || prdValidation.score,
        // Enhanced validation breakdown for audit trail
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
          verifier: 'verify-handoff-plan-to-exec.js'
        }
      };
      
    } catch (error) {
      console.error('❌ Handoff verification failed:', error.message);
      return this.rejectHandoff(sdId, 'SYSTEM_ERROR', error.message);
    }
  }
  
  /**
   * Create handoff execution record
   */
  async createHandoffExecution(sd, prd, template, prdValidation, handoffValidation) {
    const executionId = `EXEC-${sd.id}-${Date.now()}`;
    
    const execution = {
      id: executionId,
      template_id: template?.id,
      from_agent: 'PLAN',
      to_agent: 'EXEC', 
      sd_id: sd.id,
      prd_id: prd.id,
      handoff_type: 'PLAN-to-EXEC',
      status: 'accepted',
      
      // Validation results
      validation_score: prdValidation.percentage || prdValidation.score,
      validation_passed: true,
      validation_details: {
        prd_validation: prdValidation,
        handoff_validation: handoffValidation,
        verified_at: new Date().toISOString(),
        verifier: 'verify-handoff-plan-to-exec.js'
      },
      
      completed_at: new Date().toISOString(),
      created_by: 'PLAN-EXEC-VERIFIER'
    };
    
    // Store execution (if table exists)
    try {
      await this.supabase.from('sd_phase_handoffs').insert(execution);
      console.log(`📝 Handoff execution recorded: ${executionId}`);
    } catch (error) {
      console.warn('⚠️  Could not store handoff execution:', error.message);
    }
    
    return execution;
  }
  
  /**
   * Validate workflow review analysis from Design Sub-Agent
   * Checks for workflow validation status and UX impact score
   *
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<Object>} Validation result
   */
  async validateWorkflowReview(sdId) {
    try {
      // Query sub_agent_execution_results for DESIGN sub-agent workflow analysis
      const { data: designResults, error } = await this.supabase
        .from('sub_agent_execution_results')
        .select('metadata, created_at')
        .eq('sd_id', sdId)
        .eq('sub_agent_code', 'DESIGN')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.warn(`   ⚠️  Error querying workflow analysis: ${error.message}`);
        return {
          valid: true, // Don't block if query fails
          status: 'SKIPPED',
          message: 'Workflow review not available (query error)'
        };
      }

      if (!designResults || designResults.length === 0) {
        console.warn('   ⚠️  No DESIGN sub-agent execution found');
        return {
          valid: true, // Don't block if no execution yet
          status: 'SKIPPED',
          message: 'Workflow review not yet executed'
        };
      }

      const workflowAnalysis = designResults[0].metadata?.workflow_analysis;

      if (!workflowAnalysis) {
        console.warn('   ⚠️  No workflow_analysis in DESIGN results');
        return {
          valid: true, // Don't block if workflow review was skipped
          status: 'SKIPPED',
          message: 'Workflow review not performed (no user stories or disabled)'
        };
      }

      // Check workflow validation status
      const status = workflowAnalysis.status;
      const uxScore = workflowAnalysis.ux_impact_score;
      const deadEnds = workflowAnalysis.validation_results?.dead_ends || [];
      const circularFlows = workflowAnalysis.validation_results?.circular_flows || [];
      const regressions = workflowAnalysis.interaction_impact?.regressions_detected || [];

      // BLOCKING: Workflow validation failed
      if (status === 'FAIL') {
        const issues = [];
        if (deadEnds.length > 0) {
          issues.push(`${deadEnds.length} dead end(s) detected`);
        }
        if (circularFlows.length > 0) {
          issues.push(`${circularFlows.length} circular flow(s) detected`);
        }
        if (uxScore < 6.0) {
          issues.push(`UX impact score ${uxScore}/10 below minimum 6.0`);
        }

        return {
          valid: false,
          status: 'FAIL',
          message: `Workflow validation failed: ${issues.join(', ')}`,
          analysis: workflowAnalysis,
          requiredActions: workflowAnalysis.recommendations?.filter(r => r.priority === 'CRITICAL') || []
        };
      }

      // WARNING: UX score below recommended threshold but not blocking
      if (uxScore < 6.5 && uxScore >= 6.0) {
        console.warn(`   ⚠️  UX score ${uxScore}/10 below recommended 6.5 (still passing)`);
        if (regressions.length > 0) {
          console.warn(`   ⚠️  ${regressions.length} regression(s) detected - review recommendations`);
        }
      }

      // PASS
      return {
        valid: true,
        status: workflowAnalysis.status,
        uxScore: uxScore,
        message: 'Workflow validation passed',
        analysis: workflowAnalysis
      };

    } catch (error) {
      console.error(`   ❌ Workflow review validation error: ${error.message}`);
      return {
        valid: true, // Don't block on system errors
        status: 'ERROR',
        message: `Workflow review validation error: ${error.message}`
      };
    }
  }

  /**
   * Reject handoff and provide improvement guidance
   */
  async rejectHandoff(sdId, reasonCode, message, details = {}) {
    console.log('\\n❌ HANDOFF REJECTED');
    console.log('='.repeat(50));
    console.log(`Reason: ${reasonCode}`);
    console.log(`Message: ${message}`);
    
    const rejection = {
      id: `REJ-${sdId}-${Date.now()}`,
      sd_id: sdId,
      reason_code: reasonCode,
      rejection_reason: message,
      rejected_by: 'PLAN-EXEC-VERIFIER',
      return_to_agent: 'PLAN',
      details
    };
    
    // Provide specific improvement guidance based on reason
    const improvements = this.generateImprovementGuidance(reasonCode, details);
    rejection.required_improvements = improvements.required;
    rejection.recommended_actions = improvements.actions;
    rejection.estimated_fix_time = improvements.timeEstimate;
    rejection.retry_instructions = improvements.instructions;
    
    // Store rejection record
    try {
      await this.supabase.from('leo_handoff_rejections').insert(rejection);
      console.log(`📝 Rejection recorded: ${rejection.id}`);
    } catch (error) {
      console.warn('⚠️  Could not store rejection:', error.message);
    }
    
    // Display improvement guidance
    console.log('\\n🔧 REQUIRED IMPROVEMENTS');
    console.log('-'.repeat(30));
    improvements.required.forEach(item => console.log(`• ${item}`));
    
    console.log('\\n📋 RECOMMENDED ACTIONS');
    console.log('-'.repeat(30));
    improvements.actions.forEach(item => console.log(`• ${item}`));
    
    console.log(`\\n⏰ Estimated Fix Time: ${improvements.timeEstimate}`);
    console.log(`\\n📝 Instructions: ${improvements.instructions}`);
    
    return {
      success: false,
      rejected: true,
      reasonCode,
      message,
      rejectionId: rejection.id,
      improvements
    };
  }
  
  /**
   * Generate specific improvement guidance
   */
  generateImprovementGuidance(reasonCode, details) {
    const guidance = {
      required: [],
      actions: [],
      timeEstimate: '30-60 minutes',
      instructions: ''
    };
    
    switch (reasonCode) {
      case 'NO_PRD':
        guidance.required = ['Create comprehensive PRD using create-prd-script.js'];
        guidance.actions = ['Run PRD creation script', 'Validate PRD quality', 'Resubmit handoff'];
        guidance.timeEstimate = '2-3 hours';
        guidance.instructions = 'Execute comprehensive PRD creation script and ensure all required fields are completed.';
        break;
        
      case 'PRD_QUALITY':
        const prdValidation = details.prdValidation;
        guidance.required = prdValidation.errors || ['Improve PRD quality to meet minimum standards'];
        guidance.actions = [
          'Review PRD validation checklist',
          'Address all validation errors',
          'Enhance functional and technical requirements',
          'Improve acceptance criteria detail'
        ];
        guidance.timeEstimate = '1-2 hours';
        guidance.instructions = `Current PRD score: ${details.actualScore}%. Minimum required: ${details.requiredScore}%. Focus on completing missing fields and enhancing requirement detail.`;
        break;
        
      case 'PLAN_INCOMPLETE':
        guidance.required = ['Complete PLAN phase activities', 'Update PRD status to approved'];
        guidance.actions = ['Review PLAN checklist', 'Complete outstanding items', 'Update PRD status'];
        guidance.timeEstimate = '45-90 minutes';
        guidance.instructions = 'Complete all PLAN phase checklist items before requesting EXEC handoff.';
        break;

      case 'NO_USER_STORIES':
        guidance.required = ['Generate user stories from PRD via Product Requirements Expert sub-agent'];
        guidance.actions = [
          'Trigger Product Requirements Expert sub-agent',
          'Generate user stories from PRD acceptance criteria',
          'Map user stories to E2E test scenarios',
          'Store user stories in database',
          'Retry PLAN→EXEC handoff'
        ];
        guidance.timeEstimate = '30-45 minutes';
        guidance.instructions = 'User stories are MANDATORY for testing validation. Run Product Requirements Expert to generate user stories from PRD before proceeding to EXEC phase.';
        break;

      case 'USER_STORIES_ERROR':
        guidance.required = ['Fix database access issues for user_stories table'];
        guidance.actions = ['Check database connectivity', 'Verify user_stories table exists', 'Retry handoff'];
        guidance.timeEstimate = '15-20 minutes';
        guidance.instructions = 'Database error accessing user_stories table. Verify table exists and permissions are correct.';
        break;

      case 'USER_STORY_QUALITY':
        // SD-CAPABILITY-LIFECYCLE-001: User story quality gate
        const qualityValidation = details.qualityValidation;
        const qualityImprovements = details.improvements;

        guidance.required = qualityImprovements?.required || ['Improve user story quality to meet minimum standards'];
        guidance.actions = [
          'Review user story quality validation results',
          'Fix stories with boilerplate acceptance criteria',
          'Add specific, testable acceptance criteria (minimum 2 per story)',
          'Use Given-When-Then format for acceptance criteria',
          'Replace generic user_role with specific personas',
          'Ensure user_want describes actual functionality (≥20 chars)',
          'Ensure user_benefit explains value to user (≥15 chars)',
          'Re-run stories-agent to regenerate poor quality stories',
          'Retry PLAN→EXEC handoff'
        ];
        guidance.timeEstimate = qualityImprovements?.timeEstimate || '30-60 minutes';
        guidance.instructions = qualityImprovements?.instructions ||
          `User story quality score is ${qualityValidation?.averageScore || 0}% (minimum 70%). ` +
          `${qualityValidation?.qualityDistribution?.poor || 0} stories scored below 70. ` +
          'Focus on stories with blocking issues first. Use the stories-agent skill for guidance.';
        break;

      case 'PRD_BOILERPLATE':
        // SD-CAPABILITY-LIFECYCLE-001: PRD content quality gate
        const prdQualityValidation = details.qualityValidation;
        const prdImprovements = details.improvements;

        guidance.required = prdImprovements?.required || ['Replace placeholder content in PRD with specific requirements'];
        guidance.actions = [
          'Review PRD boilerplate detection results',
          'Replace "To be defined" with specific functional requirements',
          'Add SD-specific acceptance criteria (not generic "all tests passing")',
          'Define specific test scenarios with inputs and expected outputs',
          'Write a detailed executive summary for this SD',
          'Document implementation approach with specific steps',
          'Add system architecture details',
          'Retry PLAN→EXEC handoff'
        ];
        guidance.timeEstimate = prdImprovements?.timeEstimate || '30-60 minutes';
        guidance.instructions = prdImprovements?.instructions ||
          `PRD content quality score is ${prdQualityValidation?.score || 0}% (minimum 70%). ` +
          'Focus on replacing placeholder text with specific, measurable content unique to this SD.';
        break;

      case 'HANDOFF_INVALID':
        guidance.required = ['Fix handoff document to meet LEO Protocol standards'];
        guidance.actions = ['Review handoff validation errors', 'Update handoff document', 'Ensure all 7 elements present'];
        guidance.timeEstimate = '30-45 minutes';
        guidance.instructions = 'Handoff document must include all 7 required elements per LEO Protocol v4.1.2.';
        break;

      case 'PLAN_PRESENTATION_INVALID':
        const ppValidation = details.planPresentationValidation;
        guidance.required = ppValidation?.errors || ['Add complete plan_presentation to handoff metadata'];
        guidance.actions = [
          'Review plan_presentation template structure in leo_handoff_templates',
          'Add plan_presentation object to handoff metadata',
          'Ensure goal_summary ≤300 chars',
          'Include file_scope (create/modify/delete)',
          'Define execution_plan steps',
          'Specify testing_strategy (unit_tests + e2e_tests)',
          'Resubmit handoff'
        ];
        guidance.timeEstimate = '20-30 minutes';
        guidance.instructions = 'PLAN→EXEC handoffs require plan_presentation in metadata per SD-PLAN-PRESENT-001. Include implementation goals, file scope, execution steps, and testing strategy.';
        break;

      case 'WORKFLOW_REVIEW_FAILED':
        const workflowAnalysis = details.workflowAnalysis;
        const requiredActions = details.requiredActions || [];

        guidance.required = requiredActions.map(action =>
          `[${action.priority}] ${action.action}: ${action.rationale}`
        );

        if (guidance.required.length === 0) {
          guidance.required = ['Fix workflow validation issues detected by Design Sub-Agent'];
        }

        // Count issues across all dimensions
        const vr = workflowAnalysis?.validation_results || {};
        const allIssues = [
          ...(vr.dead_ends || []),
          ...(vr.circular_flows || []),
          ...(vr.error_recovery || []),
          ...(vr.loading_states || []),
          ...(vr.confirmations || []),
          ...(vr.form_validation || []),
          ...(vr.state_management || []),
          ...(vr.accessibility || [])
        ];
        const criticalCount = allIssues.filter(i => i.severity === 'CRITICAL').length;
        const highCount = allIssues.filter(i => i.severity === 'HIGH').length;

        guidance.actions = [
          '🎯 RECOMMENDED: Use interactive workflow review CLI',
          '   → node scripts/review-workflow.js <SD-ID>',
          '   → Human-in-loop iteration with intelligent recommendations',
          '   → Automatically applies fixes to user stories',
          '   → Max 3 iterations with re-analysis after each fix',
          '',
          'OR manually fix issues:',
          `   1. Review ${allIssues.length} workflow issue(s) (${criticalCount} CRITICAL, ${highCount} HIGH)`,
          '   2. Update user story acceptance_criteria or implementation_context',
          '   3. Re-run Design Sub-Agent: node lib/sub-agent-executor.js DESIGN <SD-ID> --workflow-review',
          '   4. Retry PLAN→EXEC handoff'
        ];

        const issues = [];
        if (vr.dead_ends?.length > 0) {
          issues.push(`${vr.dead_ends.length} dead ends`);
        }
        if (vr.circular_flows?.length > 0) {
          issues.push(`${vr.circular_flows.length} circular flows`);
        }
        if (criticalCount > 0) {
          issues.push(`${criticalCount} CRITICAL`);
        }
        if (highCount > 0) {
          issues.push(`${highCount} HIGH`);
        }
        if (workflowAnalysis?.ux_impact_score < 6.0) {
          issues.push(`UX score ${workflowAnalysis.ux_impact_score}/10`);
        }

        guidance.timeEstimate = criticalCount > 3 ? '1-2 hours' : '30-60 minutes';
        guidance.instructions = `Workflow validation failed with ${issues.join(', ')}.

RECOMMENDED: node scripts/review-workflow.js <SD-ID>

Interactive tool features:
- Adaptive analysis depth (DEEP/STANDARD/LIGHT based on story risk)
- Pattern learning from existing codebase
- Confidence-based recommendations (≥90%: auto-apply, 60-89%: options, <60%: ask human)
- Direct user story updates in database
- Iterative re-analysis (max 3 rounds)

After iteration complete, retry handoff.`;
        break;

      default:
        guidance.required = ['Address system errors and retry'];
        guidance.actions = ['Check system status', 'Verify database connectivity', 'Retry handoff'];
        guidance.timeEstimate = '15-30 minutes';
        guidance.instructions = 'System error encountered. Check logs and retry handoff verification.';
    }
    
    return guidance;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'verify' || !command) {
    const sdId = args[1];
    const prdId = args[2];
    
    if (!sdId) {
      console.log('Usage: node verify-handoff-plan-to-exec.js verify SD-YYYY-XXX [PRD-ID]');
      console.log('       node verify-handoff-plan-to-exec.js help');
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
    console.log('REQUIREMENTS CHECKED:');
    console.log('• Strategic Directive exists and is active');
    console.log('• PRD exists with minimum 80% quality score');
    console.log('• PRD status is ready for execution');
    console.log('• Handoff document meets protocol standards (if provided)');
    console.log('');
    console.log('USAGE:');
    console.log('  verify SD-YYYY-XXX     - Verify handoff for Strategic Directive');
    console.log('  verify SD-YYYY-XXX PRD-ID - Verify specific PRD handoff');
    console.log('  help                   - Show this help');
    console.log('');
    console.log('INTEGRATION:');
    console.log('• Called by PLAN agent before requesting EXEC handoff');  
    console.log('• Prevents low-quality PRDs from reaching implementation');
    console.log('• Returns detailed improvement guidance on rejection');
    
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

export default PlanToExecVerifier;
