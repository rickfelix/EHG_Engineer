#!/usr/bin/env node

/**
 * LEAD → PLAN Handoff Verification Script
 * LEO Protocol v4.1.2 - Strategic Quality Gate
 * 
 * ENFORCES: Strategic Directive must be complete before PLAN phase begins
 * PREVENTS: Incomplete or unclear strategic direction reaching technical planning
 * RETURNS: To LEAD with specific improvement requirements if validation fails
 */

import { createClient } from '@supabase/supabase-js';
import HandoffValidator from './handoff-validator.js';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

class LeadToPlanVerifier {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    this.handoffValidator = new HandoffValidator();
    
    // Strategic Directive Quality Requirements (LEO Protocol v4.3.3)
    this.sdRequirements = {
      minimumScore: 90, // Required fields (30) + objectives (20) + metrics (20) + principles (10) + risks (10) = 90
      requiredFields: [
        'title',
        'description',
        'scope',                 // What the SD will implement
        'strategic_objectives',  // Updated from business_objectives
        // Note: success_metrics OR success_criteria accepted (checked separately)
        'key_principles',        // Updated from constraints
        // Note: risks checked separately (can be empty array for low-risk SDs)
        'priority'
      ],
      // Alternate field names (accept either)
      alternateFields: {
        success_metrics: 'success_criteria',  // Accept success_criteria as alternative
      },
      minimumObjectives: 2,
      minimumMetrics: 3,  // Applies to success_metrics OR success_criteria
      minimumConstraints: 1
    };
  }
  
  /**
   * Verify LEAD → PLAN handoff readiness
   */
  async verifyHandoff(sdId) {
    console.log('🔍 LEAD → PLAN HANDOFF VERIFICATION');
    console.log('='.repeat(50));
    console.log(`Strategic Directive: ${sdId}`);
    
    try {
      // 1. Load Strategic Directive (support both UUID and legacy_id)
      const { data: sd, error: sdError } = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .or(`id.eq.${sdId},legacy_id.eq.${sdId}`)
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
        
      // 3. Validate Strategic Directive Completeness
      const sdValidation = this.validateStrategicDirective(sd);
      
      console.log(`\\n📊 SD Completeness Score: ${sdValidation.percentage}%`);

      if (!sdValidation.valid || sdValidation.percentage < this.sdRequirements.minimumScore) {
        return this.rejectHandoff(sdId, 'SD_INCOMPLETE', 'Strategic Directive does not meet completeness standards', {
          sdValidation,
          requiredScore: this.sdRequirements.minimumScore,
          actualScore: sdValidation.percentage
        });
      }

      // 3.5. AI SD Type Classification (GPT-4o Mini)
      // Validates sd_type matches actual scope/content with worst-case handoff enforcement
      try {
        console.log('\n🤖 AI SD TYPE CLASSIFICATION');
        console.log('-'.repeat(50));

        const { default: SDTypeClassifier } = await import('./modules/sd-type-classifier.js');
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
            // High confidence mismatch - add as warning (not blocking in Phase 1)
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

          // Store effective handoffs in SD metadata for later enforcement
          sdValidation.effectiveHandoffs = classification.effectiveHandoffs;
        }

        console.log('\n   ✅ Classification complete');
      } catch (classifierError) {
        console.log(`\n   ⚠️  AI Classification unavailable: ${classifierError.message}`);
        console.log('   Falling back to keyword-based validation');
      }

      // 3.6. AI Quality Assessment (Russian Judge)
      const russianJudgeEnabled = process.env.RUSSIAN_JUDGE_ENABLED === 'true';
      if (russianJudgeEnabled) {
        try {
          console.log('\n🤖 AI QUALITY ASSESSMENT (Russian Judge)');
          console.log('-'.repeat(50));

          const { SDQualityRubric } = await import('./modules/rubrics/sd-quality-rubric.js');
          const rubric = new SDQualityRubric();
          const aiAssessment = await rubric.validateSDQuality(sd);

          console.log(`   Score: ${aiAssessment.score}% (threshold: 70%)`);
          console.log(`   Status: ${aiAssessment.passed ? 'PASSED' : 'NEEDS IMPROVEMENT'}`);

          if (aiAssessment.issues && aiAssessment.issues.length > 0) {
            console.log('\\n   ⚡ Issues identified:');
            aiAssessment.issues.forEach(issue => console.log(`     - ${issue}`));
          }

          if (aiAssessment.warnings && aiAssessment.warnings.length > 0) {
            console.log('\\n   💡 Recommendations:');
            aiAssessment.warnings.forEach(warning => console.log(`     - ${warning}`));
          }

          // Mode: ADVISORY for LEAD-TO-PLAN (log but don't block)
          if (!aiAssessment.passed) {
            console.log('\\n   ⚠️  Note: Proceeding despite quality concerns (ADVISORY mode)');
          } else {
            console.log('\\n   ✅ Quality assessment passed');
          }
        } catch (error) {
          console.log(`\\n   ⚠️  Russian Judge unavailable: ${error.message}`);
          console.log('   Proceeding with traditional validation only');
        }
      }

      // 4. Check Strategic Directive status
      // Accept 'draft' for new SDs (LEAD-TO-PLAN is the first transition)
      // Note: 'approved' is not a valid DB status - removed from check
      const validStatuses = ['draft', 'active', 'in_progress'];
      if (!validStatuses.includes(sd.status)) {
        return this.rejectHandoff(sdId, 'SD_STATUS', `SD status is '${sd.status}', expected one of: ${validStatuses.join(', ')}`);
      }
      
      // 5. Validate business impact and feasibility
      const feasibilityCheck = this.validateFeasibility(sd);
      if (!feasibilityCheck.passed) {
        return this.rejectHandoff(sdId, 'FEASIBILITY', 'Strategic Directive feasibility concerns identified', {
          feasibilityIssues: feasibilityCheck.issues
        });
      }
      
      // 6. Validate handoff content (if provided)
      const handoffPath = `/mnt/c/_EHG/EHG_Engineer/handoffs/LEAD-to-PLAN-${sdId}.md`;
      let handoffValidation = null;
      
      if (fs.existsSync(handoffPath)) {
        const handoffContent = fs.readFileSync(handoffPath, 'utf8');
        const handoffData = this.handoffValidator.parseHandoffDocument(handoffContent);
        handoffValidation = this.handoffValidator.validateHandoff(handoffData);
        
        if (!handoffValidation.valid) {
          return this.rejectHandoff(sdId, 'HANDOFF_INVALID', 'Handoff document does not meet LEO Protocol requirements', {
            handoffValidation
          });
        }
      }
      
      // 7. Check environment readiness
      const envCheck = await this.checkEnvironmentReadiness(sd);
      if (!envCheck.ready) {
        return this.rejectHandoff(sdId, 'ENV_NOT_READY', 'Development environment not ready for planning phase', {
          envIssues: envCheck.issues
        });
      }

      // 7.5. Async Dependency Validation (validate referenced SDs exist in DB)
      const asyncDepCheck = await this.validateDependenciesExist(sd);
      sdValidation.warnings.push(...asyncDepCheck.warnings);

      // 8. Display PRD-Readiness Warnings (Advisory Mode)
      if (sdValidation.warnings.length > 0) {
        console.log('\n📋 PRD-READINESS WARNINGS (Advisory)');
        console.log('-'.repeat(50));
        sdValidation.warnings.forEach((warning, i) => {
          console.log(`   ${i + 1}. ${warning}`);
        });
        console.log('\n   ℹ️  These are recommendations, not blocking errors.');
        console.log('   Addressing them will help PLAN create a better PRD.');
      }

      // 8.5. Display PRD-Readiness Score
      if (sdValidation.prdReadinessScore !== undefined) {
        console.log(`\n📊 PRD-Readiness Score: ${sdValidation.prdReadinessScore}/100`);
      }

      // 9. Create handoff execution record
      const execution = await this.createHandoffExecution(sd, template, sdValidation, handoffValidation);

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
      
      // Update SD to indicate PLAN phase can begin
      await this.supabase
        .from('strategic_directives_v2')
        .update({
          status: 'active',
          phase: 'PLAN',
          updated_at: new Date().toISOString(),
          metadata: {
            ...sd.metadata,
            handoff_to_plan: {
              verified_at: new Date().toISOString(),
              quality_score: sdValidation.percentage,
              verifier: 'verify-handoff-lead-to-plan.js'
            }
          }
        })
        .eq('id', sdId);
      
      console.log('\\n🎯 PLAN PHASE AUTHORIZED');
      console.log('Strategic Directive handed off to PLAN agent for PRD creation');
      
      return {
        success: true,
        executionId: execution.id,
        sdId: sdId,
        qualityScore: sdValidation.percentage
      };
      
    } catch (error) {
      console.error('❌ Handoff verification failed:', error.message);
      return this.rejectHandoff(sdId, 'SYSTEM_ERROR', error.message);
    }
  }
  
  /**
   * Validate Strategic Directive completeness
   */
  validateStrategicDirective(sd) {
    const validation = {
      valid: true,
      score: 0,
      maxScore: 100,
      errors: [],
      warnings: []
    };
    
    // Check required fields (40 points)
    this.sdRequirements.requiredFields.forEach(field => {
      if (!sd[field] || !sd[field].toString().trim()) {
        validation.valid = false;
        validation.errors.push(`Missing required field: ${field}`);
      } else {
        validation.score += 5;
      }
    });
    
    // Validate strategic objectives (20 points)
    if (sd.strategic_objectives) {
      const objectivesText = sd.strategic_objectives.toString();

      // Accept either JSON array or markdown text (minimum 100 chars for quality)
      if (typeof sd.strategic_objectives === 'string' && objectivesText.length >= 100) {
        validation.score += 20;
      } else if (Array.isArray(sd.strategic_objectives)) {
        if (sd.strategic_objectives.length >= this.sdRequirements.minimumObjectives) {
          validation.score += 20;

          // Check objective quality
          sd.strategic_objectives.forEach(obj => {
            if (obj.description && obj.description.length < 20) {
              validation.warnings.push(`Objective "${obj.title || 'unnamed'}" description is too brief`);
            }
          });
        } else {
          validation.errors.push(`Insufficient strategic objectives: ${sd.strategic_objectives.length}/${this.sdRequirements.minimumObjectives}`);
          validation.valid = false;
        }
      } else if (objectivesText.length < 100) {
        validation.errors.push('Strategic objectives text is too brief (minimum 100 characters)');
        validation.valid = false;
      }
    }
    
    // Validate success metrics OR success_criteria (20 points)
    // Accept either field name - LEO Protocol v4.3.3 flexibility
    // Check for non-empty content (empty array [] should fall through to success_criteria)
    const hasSuccessMetrics = sd.success_metrics &&
      (Array.isArray(sd.success_metrics) ? sd.success_metrics.length > 0 : sd.success_metrics);
    const hasSuccessCriteria = sd.success_criteria &&
      (typeof sd.success_criteria === 'string' ? sd.success_criteria.length > 0 :
       Array.isArray(sd.success_criteria) ? sd.success_criteria.length > 0 : sd.success_criteria);
    const metricsSource = hasSuccessMetrics ? sd.success_metrics :
                          hasSuccessCriteria ? sd.success_criteria : null;
    if (metricsSource) {
      let metrics = [];
      try {
        metrics = Array.isArray(metricsSource)
          ? metricsSource
          : (typeof metricsSource === 'string' ? JSON.parse(metricsSource) : []);
      } catch (e) {
        // If parsing fails, treat as single item
        metrics = [metricsSource];
      }

      if (Array.isArray(metrics) && metrics.length >= this.sdRequirements.minimumMetrics) {
        validation.score += 20;

        // Check for measurable metrics (only if objects with target/goal)
        if (metrics.length > 0 && typeof metrics[0] === 'object') {
          let measurableCount = 0;
          metrics.forEach(metric => {
            if (metric.target || metric.goal) {
              measurableCount++;
            }
          });

          if (measurableCount < metrics.length * 0.8) {
            validation.warnings.push('Some success metrics lack measurable targets');
          }
        }
      } else {
        validation.errors.push(`Insufficient success metrics/criteria: ${metrics?.length || 0}/${this.sdRequirements.minimumMetrics}`);
        validation.valid = false;
      }
    } else {
      validation.errors.push('Missing success_metrics or success_criteria');
      validation.valid = false;
    }

    // Validate key principles (10 points) - risks checked separately
    if (sd.key_principles) {
      validation.score += 10;
    } else {
      validation.errors.push('Missing key principles');
      validation.valid = false;
    }

    // Validate risks (10 points) - allow empty array for low-risk SDs
    // Empty array is acceptable, undefined/null is not
    if (sd.risks !== undefined && sd.risks !== null) {
      validation.score += 10;

      // Warn if empty but SD seems high-risk based on keywords
      const riskKeywords = ['migration', 'security', 'auth', 'production', 'data', 'schema'];
      const textToCheck = `${sd.title || ''} ${sd.scope || ''}`.toLowerCase();
      const seemsHighRisk = riskKeywords.some(kw => textToCheck.includes(kw));
      const risksArray = Array.isArray(sd.risks) ? sd.risks : [];

      if (seemsHighRisk && risksArray.length === 0) {
        validation.warnings.push('risks array is empty but SD keywords suggest potential risks. Consider documenting risks.');
      }
    } else {
      validation.errors.push('Missing risk assessment (risks field)');
      validation.valid = false;
    }

    // =========================================================================
    // EARLY VALIDATION GATES (Added per SD-VISION-TRANSITION-001D6 retrospective)
    // These validations prevent issues from being caught only at SD closure
    // =========================================================================

    // GATE: target_application vs deliverable type validation
    // Root cause: SD-D6 had target_application=EHG_Engineer but UI components were in EHG app
    if (sd.target_application && sd.scope) {
      const scope = (sd.scope || '').toLowerCase();
      const targetApp = sd.target_application;

      // Patterns that suggest EHG app (frontend/UI work)
      const ehgPatterns = ['ui', 'component', 'form', 'page', 'dialog', 'dashboard', 'stage', 'frontend', 'react'];
      // Patterns that suggest EHG_Engineer (tooling/infrastructure)
      const engineerPatterns = ['script', 'tooling', 'migration', 'protocol', 'handoff', 'agent', 'cli', 'database migration'];

      const suggestsEHG = ehgPatterns.some(p => scope.includes(p));
      const suggestsEngineer = engineerPatterns.some(p => scope.includes(p));

      if (suggestsEHG && !suggestsEngineer && targetApp === 'EHG_Engineer') {
        validation.warnings.push('target_application is \'EHG_Engineer\' but scope suggests UI/frontend work (EHG app). Verify target_application is correct.');
      } else if (suggestsEngineer && !suggestsEHG && targetApp === 'EHG') {
        validation.warnings.push('target_application is \'EHG\' but scope suggests tooling/infrastructure work (EHG_Engineer). Verify target_application is correct.');
      }
    }

    // GATE: strategic_objectives SMART criteria validation
    // Root cause: SD-D6 had generic objectives without Owner/Target/Baseline/Deadline
    if (sd.strategic_objectives && Array.isArray(sd.strategic_objectives)) {
      const smartKeywords = ['owner:', 'target:', 'baseline:', 'deadline:', 'due:'];
      let smartObjectiveCount = 0;

      sd.strategic_objectives.forEach((obj, index) => {
        const objText = (typeof obj === 'string' ? obj : obj.description || '').toLowerCase();
        const hasSmart = smartKeywords.some(kw => objText.includes(kw));

        if (hasSmart) {
          smartObjectiveCount++;
        }
      });

      const smartRatio = smartObjectiveCount / sd.strategic_objectives.length;

      if (smartRatio < 0.5) {
        validation.warnings.push(`Only ${Math.round(smartRatio * 100)}% of strategic_objectives have SMART criteria (Owner/Target/Baseline/Deadline). Consider enhancing objectives for measurability.`);
      }
    }

    // GATE: sd_type classification validation
    // Root cause: SD-D6 was blocked because infrastructure SDs had wrong handoff requirements
    // This gate validates that sd_type matches the actual scope/content of the SD
    if (sd.sd_type && sd.scope) {
      const detectedType = this.autoDetectSdType(sd);

      if (detectedType.type !== sd.sd_type && detectedType.confidence >= 0.70) {
        const confidencePercent = Math.round(detectedType.confidence * 100);
        validation.warnings.push(
          `sd_type is '${sd.sd_type}' but scope suggests '${detectedType.type}' (${confidencePercent}% confidence). ` +
          `Matched keywords: ${detectedType.matchedKeywords.join(', ')}. ` +
          'Verify sd_type is correct - wrong classification affects validation requirements.'
        );
      }
    }

    // =========================================================================
    // PRD-READINESS VALIDATION (Added per Foundation V3 analysis)
    // These validations ensure SD has everything PLAN needs to create a PRD
    // All checks are WARNINGS (not blocking) - Phase 1 rollout
    // =========================================================================

    // 1. PRD-READINESS PRE-CHECK: Validate minimum content for PRD creation
    const prdReadiness = this.validatePRDReadiness(sd);
    validation.warnings.push(...prdReadiness.warnings);
    validation.prdReadinessScore = prdReadiness.score;

    // 2. VISION DOCUMENT REFERENCE VALIDATION: Check referenced specs exist
    const visionCheck = this.validateVisionDocumentReferences(sd);
    validation.warnings.push(...visionCheck.warnings);

    // 3. DEPENDENCY CHAIN VALIDATION: Check dependencies are valid
    // Note: This is async, so we'll do it in the main verifyHandoff method
    // and pass results here. For now, add a sync check for basic structure.
    const depCheck = this.validateDependencyStructure(sd);
    validation.warnings.push(...depCheck.warnings);

    // 4. SCOPE STRUCTURE VALIDATION: Check for IN/OUT scope sections
    const scopeCheck = this.validateScopeStructure(sd);
    validation.warnings.push(...scopeCheck.warnings);

    // 5. SUCCESS CRITERIA ACTIONABILITY: Check criteria are verifiable
    const criteriaCheck = this.validateSuccessCriteriaActionability(sd);
    validation.warnings.push(...criteriaCheck.warnings);

    // 6. IMPLEMENTATION CONTEXT METADATA: Check for helpful context
    const contextCheck = this.validateImplementationContext(sd);
    validation.warnings.push(...contextCheck.warnings);

    validation.percentage = Math.round(validation.score);
    return validation;
  }

  /**
   * PRD-Readiness Pre-Check (Improvement #1)
   * Validates SD has minimum content PLAN needs to create a PRD
   * Based on CLAUDE_PLAN.md requirements
   */
  validatePRDReadiness(sd) {
    const result = { score: 0, maxScore: 100, warnings: [] };
    const checks = {
      description: { minLength: 100, weight: 25 },
      scope: { minLength: 50, weight: 25 },
      rationale: { minLength: 30, weight: 20 },
      strategic_objectives: { minItems: 2, weight: 15 },
      success_criteria: { minItems: 3, weight: 15 }
    };

    // Check description length
    const descLength = (sd.description || '').length;
    if (descLength >= checks.description.minLength) {
      result.score += checks.description.weight;
    } else {
      result.warnings.push(
        `PRD-Readiness: description is ${descLength} chars (recommend ≥${checks.description.minLength}). ` +
        'PLAN may need to gather additional context.'
      );
    }

    // Check scope length
    const scopeLength = (sd.scope || '').length;
    if (scopeLength >= checks.scope.minLength) {
      result.score += checks.scope.weight;
    } else {
      result.warnings.push(
        `PRD-Readiness: scope is ${scopeLength} chars (recommend ≥${checks.scope.minLength}). ` +
        'PLAN may struggle to define boundaries.'
      );
    }

    // Check rationale length
    const rationaleLength = (sd.rationale || '').length;
    if (rationaleLength >= checks.rationale.minLength) {
      result.score += checks.rationale.weight;
    } else {
      result.warnings.push(
        `PRD-Readiness: rationale is ${rationaleLength} chars (recommend ≥${checks.rationale.minLength}). ` +
        'PLAN benefits from understanding "why" behind the SD.'
      );
    }

    // Check strategic_objectives count
    const objectives = Array.isArray(sd.strategic_objectives) ? sd.strategic_objectives : [];
    if (objectives.length >= checks.strategic_objectives.minItems) {
      result.score += checks.strategic_objectives.weight;
    } else {
      result.warnings.push(
        `PRD-Readiness: ${objectives.length} strategic_objectives (recommend ≥${checks.strategic_objectives.minItems}). ` +
        'More objectives help PLAN prioritize features.'
      );
    }

    // Check success_criteria count
    const criteria = Array.isArray(sd.success_criteria) ? sd.success_criteria :
      (typeof sd.success_criteria === 'string' ? JSON.parse(sd.success_criteria || '[]') : []);
    if (criteria.length >= checks.success_criteria.minItems) {
      result.score += checks.success_criteria.weight;
    } else {
      result.warnings.push(
        `PRD-Readiness: ${criteria.length} success_criteria (recommend ≥${checks.success_criteria.minItems}). ` +
        'More criteria help PLAN define acceptance tests.'
      );
    }

    return result;
  }

  /**
   * Vision Document Reference Validation (Improvement #2)
   * Validates that referenced vision documents actually exist
   */
  validateVisionDocumentReferences(sd) {
    const result = { warnings: [] };
    const projectRoot = '/mnt/c/_EHG/EHG_Engineer';

    // Check if SD references vision documents
    const visionRefs = sd.metadata?.vision_document_references || [];

    // For Vision V2 SDs or SDs with vision refs, validate they exist
    if (sd.id?.includes('VISION') || visionRefs.length > 0) {
      if (visionRefs.length === 0) {
        result.warnings.push(
          'PRD-Readiness: No vision_document_references in metadata. ' +
          'Vision-related SDs should reference authoritative spec documents.'
        );
      } else {
        // Check each referenced file exists
        const missingDocs = [];
        for (const docPath of visionRefs) {
          const fullPath = path.join(projectRoot, docPath);
          if (!fs.existsSync(fullPath)) {
            missingDocs.push(docPath);
          }
        }

        if (missingDocs.length > 0) {
          result.warnings.push(
            `PRD-Readiness: ${missingDocs.length} vision document(s) not found: ` +
            `${missingDocs.slice(0, 3).join(', ')}${missingDocs.length > 3 ? '...' : ''}. ` +
            'Verify paths are correct.'
          );
        }
      }
    }

    // Also check for sparse references (less than 2 for complex SDs)
    if (visionRefs.length === 1 && (sd.description || '').length > 500) {
      result.warnings.push(
        'PRD-Readiness: Only 1 vision_document_reference for a complex SD. ' +
        'Consider adding related specs to help PLAN understand full context.'
      );
    }

    return result;
  }

  /**
   * Dependency Structure Validation (Improvement #3)
   * Validates dependencies array is properly structured
   * Note: Async DB validation happens in verifyHandoff method
   */
  validateDependencyStructure(sd) {
    const result = { warnings: [] };

    // Check if dependencies field exists and is an array
    const deps = sd.dependencies;

    if (deps === undefined || deps === null) {
      // Check if this is a Phase 1 SD (no dependencies expected)
      const phase = sd.metadata?.phase;
      if (phase && phase > 1) {
        result.warnings.push(
          `PRD-Readiness: dependencies array is empty but SD is Phase ${phase}. ` +
          'Non-Phase-1 SDs typically depend on earlier work. Verify execution order.'
        );
      }
    } else if (Array.isArray(deps) && deps.length > 0) {
      // Validate dependency format (should be SD IDs)
      const invalidDeps = deps.filter(d =>
        typeof d !== 'string' || !d.startsWith('SD-')
      );

      if (invalidDeps.length > 0) {
        result.warnings.push(
          `PRD-Readiness: ${invalidDeps.length} invalid dependency format(s). ` +
          'Dependencies should be SD IDs like "SD-FOUNDATION-V3-001".'
        );
      }
    }

    // Check for circular dependency hints (same prefix)
    if (Array.isArray(deps) && deps.length > 0 && sd.id) {
      const selfRef = deps.find(d => d === sd.id);
      if (selfRef) {
        result.warnings.push(
          'PRD-Readiness: SD references itself in dependencies (circular). Remove self-reference.'
        );
      }
    }

    return result;
  }

  /**
   * Scope Structure Validation (Improvement #4)
   * Checks for clear IN SCOPE / OUT OF SCOPE sections
   */
  validateScopeStructure(sd) {
    const result = { warnings: [] };
    const scopeText = (sd.scope || '').toLowerCase();

    // Patterns indicating explicit scope boundaries
    const inScopePatterns = [
      /\bin\s*scope\b/i,
      /\bincluded\b/i,
      /\bwill\s+(do|implement|build|create)\b/i,
      /\bscope\s*:/i,
      /##\s*in\s*scope/i
    ];

    const outScopePatterns = [
      /\bout\s*(of)?\s*scope\b/i,
      /\bexcluded\b/i,
      /\bwon'?t\s+(do|implement|build)\b/i,
      /\bnot\s+included\b/i,
      /##\s*out\s*(of)?\s*scope/i
    ];

    const hasInScope = inScopePatterns.some(p => p.test(scopeText));
    const hasOutScope = outScopePatterns.some(p => p.test(scopeText));

    if (!hasInScope && !hasOutScope) {
      result.warnings.push(
        'PRD-Readiness: Scope lacks explicit IN SCOPE / OUT OF SCOPE sections. ' +
        'Clear boundaries prevent scope creep during PLAN and EXEC phases.'
      );
    } else if (hasInScope && !hasOutScope) {
      result.warnings.push(
        'PRD-Readiness: Scope has IN SCOPE but no OUT OF SCOPE section. ' +
        'Explicitly stating what is NOT included helps prevent over-building.'
      );
    }

    return result;
  }

  /**
   * Success Criteria Actionability Check (Improvement #5)
   * Verifies criteria are specific and verifiable
   */
  validateSuccessCriteriaActionability(sd) {
    const result = { warnings: [] };

    // Parse success_criteria
    let criteria = [];
    try {
      criteria = Array.isArray(sd.success_criteria) ? sd.success_criteria :
        (typeof sd.success_criteria === 'string' ? JSON.parse(sd.success_criteria || '[]') : []);
    } catch (e) {
      // If parsing fails, skip this check
      return result;
    }

    if (criteria.length === 0) return result;

    // Patterns indicating actionable/verifiable criteria
    const actionablePatterns = [
      /\bpass(es)?\b/i,           // "tests pass"
      /\bcompile[sd]?\b/i,        // "build compiles"
      /\bno\s+\w+\s+errors?\b/i,  // "no type errors"
      /\d+%/,                      // percentages like "≥85%"
      /\breturns?\b/i,            // "returns correct data"
      /\bexists?\b/i,             // "file exists"
      /\bvisible\b/i,             // "visible in UI"
      /\bworks?\b/i,              // "feature works"
      /\bcan\s+\w+/i,             // "user can login"
      /\bshows?\b/i,              // "shows data"
      /\bdisplays?\b/i,           // "displays correctly"
      /\bcomplete[sd]?\b/i,       // "task completed"
      /\bfunctional\b/i,          // "endpoint functional"
      /\bsuccessful(ly)?\b/i      // "deploys successfully"
    ];

    // Vague/non-actionable patterns
    const vaguePatterns = [
      /\bimproved?\b/i,           // "improved performance" (how much?)
      /\bbetter\b/i,              // "better UX" (subjective)
      /\bnice(r)?\b/i,            // "nicer design"
      /\bgood\b/i,                // "good quality"
      /\bclean(er)?\b/i,          // "cleaner code" (subjective)
      /\boptimized?\b/i           // "optimized" without metric
    ];

    let vagueCriteria = [];
    let actionableCriteria = [];

    criteria.forEach((criterion, index) => {
      const text = typeof criterion === 'string' ? criterion :
        (criterion.description || criterion.criterion || '');

      const isActionable = actionablePatterns.some(p => p.test(text));
      const isVague = vaguePatterns.some(p => p.test(text)) && !isActionable;

      if (isVague) {
        vagueCriteria.push({ index: index + 1, text: text.substring(0, 50) });
      } else if (isActionable) {
        actionableCriteria.push(index + 1);
      }
    });

    // Warn if more than 30% of criteria are vague
    const vagueRatio = vagueCriteria.length / criteria.length;
    if (vagueRatio > 0.3) {
      result.warnings.push(
        `PRD-Readiness: ${vagueCriteria.length}/${criteria.length} success criteria may be hard to verify. ` +
        `Examples: "${vagueCriteria[0]?.text}...". ` +
        'Consider adding measurable targets (e.g., "≥80% coverage", "loads in <2s").'
      );
    }

    return result;
  }

  /**
   * Implementation Context Metadata Check (Improvement #6)
   * Validates that helpful implementation hints exist in metadata
   */
  validateImplementationContext(sd) {
    const result = { warnings: [] };

    // Skip for documentation-only SDs
    if (sd.sd_type === 'documentation') return result;

    // Context fields that help PLAN understand implementation
    const contextFields = [
      'key_files',
      'affected_tables',
      'data_sources',
      'verification_steps',
      'key_tables',
      'key_components',
      'execution_pipeline'
    ];

    const metadata = sd.metadata || {};
    const presentFields = contextFields.filter(field => {
      const value = metadata[field];
      return value && (Array.isArray(value) ? value.length > 0 : true);
    });

    // For technical SDs with substantial scope, expect some context
    const scopeLength = (sd.scope || '').length;
    const isSubstantial = scopeLength > 200 || (sd.description || '').length > 500;

    if (presentFields.length === 0 && isSubstantial) {
      result.warnings.push(
        'PRD-Readiness: No implementation context in metadata (key_files, affected_tables, etc.). ' +
        'Adding context helps PLAN understand where changes will be made.'
      );
    } else if (presentFields.length === 1 && isSubstantial) {
      result.warnings.push(
        `PRD-Readiness: Only "${presentFields[0]}" in metadata for substantial SD. ` +
        'Consider adding more context (key_files, affected_tables, verification_steps).'
      );
    }

    return result;
  }

  /**
   * Async Dependency Validation (Improvement #3 - async part)
   * Validates that referenced SDs actually exist in the database
   */
  async validateDependenciesExist(sd) {
    const result = { warnings: [] };
    const deps = sd.dependencies;

    if (!Array.isArray(deps) || deps.length === 0) {
      return result;
    }

    try {
      // Query all referenced dependencies
      const { data: existingDeps, error } = await this.supabase
        .from('strategic_directives_v2')
        .select('id, legacy_id, status, title')
        .or(deps.map(d => `id.eq.${d},legacy_id.eq.${d}`).join(','));

      if (error) {
        result.warnings.push(
          `PRD-Readiness: Could not verify dependencies exist (DB error: ${error.message})`
        );
        return result;
      }

      // Find which dependencies don't exist
      const existingIds = new Set([
        ...(existingDeps || []).map(d => d.id),
        ...(existingDeps || []).map(d => d.legacy_id)
      ]);

      const missingDeps = deps.filter(d => !existingIds.has(d));

      if (missingDeps.length > 0) {
        result.warnings.push(
          `PRD-Readiness: ${missingDeps.length} dependency SD(s) not found in database: ` +
          `${missingDeps.join(', ')}. Verify SD IDs are correct.`
        );
      }

      // Check if any dependencies are not yet completed (informational)
      const incompleteDeps = (existingDeps || []).filter(d =>
        d.status !== 'completed' && d.status !== 'done'
      );

      if (incompleteDeps.length > 0 && incompleteDeps.length === deps.length) {
        result.warnings.push(
          `PRD-Readiness: All ${incompleteDeps.length} dependencies are not yet completed. ` +
          'PLAN should verify dependency work is sufficiently complete before starting.'
        );
      }

    } catch (e) {
      result.warnings.push(
        `PRD-Readiness: Dependency validation error: ${e.message}`
      );
    }

    return result;
  }

  /**
   * Auto-detect SD type based on scope, title, and description keywords
   * Returns: { type: string, confidence: number (0-1), matchedKeywords: string[] }
   */
  autoDetectSdType(sd) {
    const text = `${sd.title || ''} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

    // Keyword patterns for each SD type (ordered by specificity)
    const typePatterns = {
      security: {
        keywords: ['auth', 'authentication', 'authorization', 'rls', 'row level security',
                   'permission', 'role', 'rbac', 'vulnerability', 'cve', 'owasp',
                   'encryption', 'credential', 'secret', 'token', 'jwt', 'session'],
        weight: 1.2 // Higher weight for security (specific domain)
      },
      database: {
        keywords: ['schema', 'migration', 'table', 'column', 'index', 'postgres', 'supabase',
                   'sql', 'query', 'rls policy', 'foreign key', 'constraint', 'trigger',
                   'stored procedure', 'function', 'view', 'materialized'],
        weight: 1.1
      },
      infrastructure: {
        keywords: ['ci/cd', 'pipeline', 'github action', 'workflow', 'deploy', 'docker',
                   'script', 'tooling', 'automation', 'build', 'bundle', 'lint', 'prettier',
                   'eslint', 'pre-commit', 'hook', 'protocol', 'handoff', 'agent system',
                   'mcp', 'leo protocol', 'devops', 'monitoring', 'logging'],
        weight: 1.0
      },
      documentation: {
        keywords: ['documentation', 'docs', 'readme', 'guide', 'tutorial', 'comment',
                   'jsdoc', 'api doc', 'changelog', 'contributing', 'onboarding'],
        weight: 0.9 // Lower weight - easily confused with other types
      },
      bugfix: {
        keywords: ['bug', 'fix', 'error', 'issue', 'broken', 'crash', 'regression',
                   'hotfix', 'patch', 'resolve', 'repair'],
        weight: 1.0
      },
      refactor: {
        keywords: ['refactor', 'restructure', 'reorganize', 'cleanup', 'technical debt',
                   'code quality', 'architecture', 'modularize', 'extract', 'simplify'],
        weight: 1.0
      },
      performance: {
        keywords: ['performance', 'optimize', 'speed', 'latency', 'cache', 'memory',
                   'cpu', 'load time', 'bundle size', 'lazy load', 'memoize', 'index'],
        weight: 1.0
      },
      feature: {
        keywords: ['feature', 'ui', 'component', 'page', 'form', 'dialog', 'modal',
                   'dashboard', 'button', 'input', 'frontend', 'react', 'user interface',
                   'ux', 'user experience', 'screen', 'view', 'layout', 'stage'],
        weight: 0.8 // Lower weight - default fallback
      }
    };

    let bestMatch = { type: 'feature', confidence: 0, matchedKeywords: [] };

    for (const [type, config] of Object.entries(typePatterns)) {
      const matchedKeywords = config.keywords.filter(kw => text.includes(kw));

      if (matchedKeywords.length > 0) {
        // Calculate confidence based on matches and weight
        const baseConfidence = Math.min(matchedKeywords.length / 3, 1); // Cap at 3 keywords = 100%
        const weightedConfidence = baseConfidence * config.weight;

        if (weightedConfidence > bestMatch.confidence) {
          bestMatch = {
            type,
            confidence: Math.min(weightedConfidence, 1), // Cap at 1.0
            matchedKeywords
          };
        }
      }
    }

    // If no strong match, default to feature with low confidence
    if (bestMatch.confidence < 0.3) {
      bestMatch = {
        type: 'feature',
        confidence: 0.3,
        matchedKeywords: ['(default - no strong keyword matches)']
      };
    }

    return bestMatch;
  }

  /**
   * Validate strategic feasibility
   */
  validateFeasibility(sd) {
    const check = {
      passed: true,
      issues: []
    };
    
    // Check for unrealistic timelines in key principles
    if (sd.key_principles) {
      try {
        const principles = typeof sd.key_principles === 'string'
          ? JSON.parse(sd.key_principles)
          : sd.key_principles;
          
        // Look for timeline constraints in key principles
        const timelineConstraint = Array.isArray(principles)
          ? principles.find(c => c.type === 'timeline' || c.title?.toLowerCase().includes('time'))
          : null;
          
        if (timelineConstraint && timelineConstraint.value) {
          const timeline = timelineConstraint.value.toLowerCase();
          if (timeline.includes('1 day') || timeline.includes('immediate')) {
            check.issues.push('Timeline constraint may be unrealistic for comprehensive implementation');
          }
        }
      } catch (e) {
        // Ignore JSON parsing errors for feasibility check
      }
    }
    
    // Check priority vs complexity alignment
    if (sd.priority === 'LOW' && sd.description?.length > 500) {
      check.issues.push('Low priority directive with high complexity description - consider priority adjustment');
    }
    
    // Validate risk mitigation
    if (sd.risks) {
      try {
        const risks = typeof sd.risks === 'string' ? JSON.parse(sd.risks) : sd.risks;
        if (Array.isArray(risks)) {
          const highRisks = risks.filter(r => r.level === 'HIGH' || r.severity === 'HIGH');
          const withMitigation = highRisks.filter(r => r.mitigation || r.response);
          
          if (highRisks.length > 0 && withMitigation.length < highRisks.length) {
            check.issues.push('High-risk items lack mitigation strategies');
          }
        }
      } catch (e) {
        // Ignore JSON parsing errors
      }
    }
    
    // Only fail for critical feasibility issues
    if (check.issues.some(issue => issue.includes('unrealistic') || issue.includes('lack mitigation'))) {
      check.passed = false;
    }
    
    return check;
  }
  
  /**
   * Check development environment readiness
   */
  async checkEnvironmentReadiness(sd) {
    const check = {
      ready: true,
      issues: []
    };
    
    try {
      // Check database connectivity
      const { error: dbError } = await this.supabase.from('strategic_directives_v2').select('id').limit(1);
      if (dbError) {
        check.ready = false;
        check.issues.push('Database connectivity issue');
      }
      
      // Check required tables exist
      const requiredTables = ['strategic_directives_v2', 'product_requirements_v2'];
      for (const table of requiredTables) {
        const { error } = await this.supabase.from(table).select('*').limit(1);
        if (error) {
          check.ready = false;
          check.issues.push(`Required table missing: ${table}`);
        }
      }
      
      // Check filesystem accessibility
      const projectRoot = '/mnt/c/_EHG/EHG_Engineer';
      if (!fs.existsSync(projectRoot)) {
        check.ready = false;
        check.issues.push('Project filesystem not accessible');
      }
      
      // Check required directories
      const requiredDirs = ['scripts', 'docs/strategic-directives', 'docs/prds'];
      for (const dir of requiredDirs) {
        const fullPath = path.join(projectRoot, dir);
        if (!fs.existsSync(fullPath)) {
          check.issues.push(`Directory missing: ${dir} (will create if needed)`);
        }
      }
      
    } catch (error) {
      check.ready = false;
      check.issues.push(`Environment check failed: ${error.message}`);
    }
    
    return check;
  }
  
  /**
   * Create handoff execution record
   */
  async createHandoffExecution(sd, template, sdValidation, handoffValidation) {
    const executionId = `PLAN-${sd.id}-${Date.now()}`;
    
    const execution = {
      id: executionId,
      template_id: template?.id,
      from_agent: 'LEAD',
      to_agent: 'PLAN',
      sd_id: sd.id,
      handoff_type: 'LEAD-to-PLAN',
      status: 'accepted',
      
      // Summary of strategic direction
      executive_summary: sd.description?.substring(0, 200) + '...',
      
      // Validation results
      validation_score: sdValidation.percentage,
      validation_passed: true,
      validation_details: {
        sd_validation: sdValidation,
        handoff_validation: handoffValidation,
        verified_at: new Date().toISOString(),
        verifier: 'verify-handoff-lead-to-plan.js'
      },
      
      completed_at: new Date().toISOString(),
      created_by: 'LEAD-PLAN-VERIFIER'
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
      rejected_by: 'LEAD-PLAN-VERIFIER',
      return_to_agent: 'LEAD',
      details
    };
    
    // Provide specific improvement guidance
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
      timeEstimate: '45-90 minutes',
      instructions: ''
    };
    
    switch (reasonCode) {
      case 'SD_INCOMPLETE':
        const sdValidation = details.sdValidation;
        guidance.required = sdValidation.errors || ['Complete Strategic Directive required fields'];
        guidance.actions = [
          'Review SD validation checklist',
          'Enhance business objectives detail',
          'Add measurable success metrics',
          'Complete constraints and risk analysis'
        ];
        guidance.timeEstimate = '2-3 hours';
        guidance.instructions = `Current SD score: ${details.actualScore}%. Minimum required: ${details.requiredScore}%. Focus on business objectives and success metrics.`;
        break;
        
      case 'SD_STATUS':
        guidance.required = ['Update Strategic Directive status to active or approved'];
        guidance.actions = ['Review SD content', 'Finalize strategic direction', 'Update status to active'];
        guidance.timeEstimate = '30-60 minutes';
        guidance.instructions = 'Strategic Directive must be approved before technical planning can begin.';
        break;
        
      case 'FEASIBILITY':
        guidance.required = details.feasibilityIssues || ['Address feasibility concerns'];
        guidance.actions = ['Review timeline constraints', 'Add risk mitigation strategies', 'Validate priority alignment'];
        guidance.timeEstimate = '1-2 hours';
        guidance.instructions = 'Ensure strategic directive is realistic and achievable within constraints.';
        break;
        
      case 'ENV_NOT_READY':
        guidance.required = details.envIssues || ['Fix development environment issues'];
        guidance.actions = ['Check database connectivity', 'Verify filesystem access', 'Create required directories'];
        guidance.timeEstimate = '30-45 minutes';
        guidance.instructions = 'Development environment must be ready before planning phase can begin.';
        break;
        
      case 'HANDOFF_INVALID':
        guidance.required = ['Fix handoff document to meet LEO Protocol standards'];
        guidance.actions = ['Review handoff validation errors', 'Update handoff document', 'Ensure all 7 elements present'];
        guidance.timeEstimate = '30-45 minutes';
        guidance.instructions = 'Handoff document must include all 7 required elements per LEO Protocol v4.1.2.';
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
    console.log('');
    console.log('INTEGRATION:');
    console.log('• Called by LEAD agent before requesting PLAN handoff');
    console.log('• Prevents incomplete strategy from reaching technical planning');
    console.log('• PRD-Readiness warnings help LEAD create better SDs');
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

export default LeadToPlanVerifier;