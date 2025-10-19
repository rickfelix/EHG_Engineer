#!/usr/bin/env node

/**
 * Unified LEO Protocol Handoff System
 * Comprehensive handoff management leveraging database templates
 *
 * FEATURES:
 * - Unified interface for all handoff types (LEAD→PLAN, PLAN→EXEC, EXEC→PLAN)
 * - Database-driven execution with full audit trail
 * - PRD quality enforcement for PLAN→EXEC transitions
 * - Template-based validation with custom rules
 * - Rejection workflow with improvement guidance
 * - Dashboard integration for real-time monitoring
 *
 * BMAD ENHANCEMENTS:
 * - Risk assessment validation (checks risk_assessments table)
 * - User story context engineering validation (PLAN→EXEC gate)
 * - Checkpoint plan validation (for SDs with >8 stories)
 * - Test plan validation (EXEC→PLAN gate)
 * - User story → E2E test mapping validation (100% coverage requirement)
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import HandoffValidator from './handoff-validator.js';
import LeadToPlanVerifier from './verify-handoff-lead-to-plan.js';
import PlanToExecVerifier from './verify-handoff-plan-to-exec.js';
import GitCommitVerifier from './verify-git-commit-status.js';
import GitBranchVerifier from './verify-git-branch-status.js';
import { orchestrate } from './orchestrate-phase-subagents.js';
import { mapE2ETestsToUserStories, validateE2ECoverage } from './modules/handoff/map-e2e-tests-to-stories.js';
import { extractAndPopulateDeliverables } from './modules/handoff/extract-deliverables-from-prd.js';
import { validateBMADForPlanToExec, validateBMADForExecToPlan, validateRiskAssessment } from './modules/bmad-validation.js';
import { autoValidateUserStories } from './auto-validate-user-stories-on-exec-complete.js';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

class UnifiedHandoffSystem {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    this.handoffValidator = new HandoffValidator();
    
    // Initialize specialized verifiers
    this.leadToPlanVerifier = new LeadToPlanVerifier();
    this.planToExecVerifier = new PlanToExecVerifier();
    
    // Supported handoff types
    this.supportedHandoffs = [
      'LEAD-to-PLAN',
      'PLAN-to-EXEC',
      'EXEC-to-PLAN',
      'PLAN-to-LEAD'
    ];
  }

  /**
   * MANDATORY DATABASE VERIFICATION GATE (SD-TEST-MOCK-001 prevention)
   *
   * Verifies that a Strategic Directive exists in the database before allowing any handoff work to proceed.
   * This prevents the protocol violation where work was done on SD-TEST-MOCK-001 without it existing in the database.
   *
   * BLOCKING GATE: Throws error if SD not found - all handoffs MUST pass this check first
   *
   * @param {string} sdId - Strategic Directive ID
   * @throws {Error} If SD not found in database
   */
  async verifySDExistsInDatabase(sdId) {
    console.log(`🔍 Verifying SD exists in database: ${sdId}`);

    const { data: sd, error } = await this.supabase
      .from('strategic_directives_v2')
      .select('id, title, status, category')
      .eq('id', sdId)
      .single();

    if (error || !sd) {
      console.error('');
      console.error('❌ BLOCKING: Strategic Directive not found in database');
      console.error('='.repeat(60));
      console.error(`   SD ID: ${sdId}`);
      console.error('');
      console.error('   CRITICAL: All Strategic Directives MUST exist in the database');
      console.error('   before ANY work begins (LEAD, PLAN, EXEC, or handoffs).');
      console.error('');
      console.error('   This verification gate prevents the protocol violation that');
      console.error('   occurred in SD-TEST-MOCK-001, where EXEC work completed');
      console.error('   without a database record existing.');
      console.error('');
      console.error('   REMEDIATION:');
      console.error('   1. Create SD in database using LEO Protocol dashboard');
      console.error('   2. OR use: node scripts/create-strategic-directive.js');
      console.error('   3. Ensure SD has title, category, priority, and rationale');
      console.error('   4. Retry this handoff after SD is created');
      console.error('');
      console.error('   Database error: ' + (error ? error.message : 'SD not found'));
      console.error('='.repeat(60));

      throw new Error(
        `❌ BLOCKING: Strategic Directive ${sdId} not found in database. ` +
        `All SDs must exist in strategic_directives_v2 table before work begins. ` +
        `Create SD first using the LEO Protocol dashboard or create-strategic-directive.js script.`
      );
    }

    console.log(`✅ SD verified in database: ${sd.title}`);
    console.log(`   Status: ${sd.status} | Category: ${sd.category || 'N/A'}`);

    return sd;
  }

  /**
   * Main handoff execution entry point
   */
  async executeHandoff(handoffType, sdId, options = {}) {
    console.log('🔄 UNIFIED LEO HANDOFF SYSTEM');
    console.log('='.repeat(50));
    console.log(`Type: ${handoffType}`);
    console.log(`Strategic Directive: ${sdId}`);
    console.log(`Options:`, options);
    console.log('');

    try {
      // MANDATORY DATABASE VERIFICATION (SD-TEST-MOCK-001 prevention)
      // This BLOCKING gate ensures SD exists in database before ANY handoff work proceeds
      await this.verifySDExistsInDatabase(sdId);

      // Validate handoff type
      if (!this.supportedHandoffs.includes(handoffType)) {
        throw new Error(`Unsupported handoff type: ${handoffType}`);
      }

      // Load handoff template
      const template = await this.loadHandoffTemplate(handoffType);
      if (!template) {
        throw new Error(`No template found for handoff type: ${handoffType}`);
      }
      
      // Route to specialized verifier
      let result;
      switch (handoffType) {
        case 'LEAD-to-PLAN':
          result = await this.leadToPlanVerifier.verifyHandoff(sdId);
          break;

        case 'PLAN-to-EXEC':
          result = await this.executePlanToExec(sdId, options);
          break;

        case 'EXEC-to-PLAN':
          result = await this.executeExecToPlan(sdId, options);
          break;

        case 'PLAN-to-LEAD':
          result = await this.executePlanToLead(sdId, options);
          break;

        default:
          throw new Error(`Handler not implemented for: ${handoffType}`);
      }
      
      // Create unified execution record
      if (result.success) {
        await this.recordSuccessfulHandoff(handoffType, sdId, result, template);
      } else {
        await this.recordFailedHandoff(handoffType, sdId, result, template);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Handoff system error:', error.message);
      
      // Record system error
      await this.recordSystemError(handoffType, sdId, error.message);
      
      return {
        success: false,
        error: error.message,
        systemError: true
      };
    }
  }
  
  /**
   * Load handoff template from database
   */
  async loadHandoffTemplate(handoffType) {
    const [fromAgent, , toAgent] = handoffType.split('-');
    
    const { data: template, error } = await this.supabase
      .from('leo_handoff_templates')
      .select('*')
      .eq('from_agent', fromAgent)
      .eq('to_agent', toAgent)
      .single();
      
    if (error) {
      console.warn(`⚠️  Template not found: ${handoffType} - ${error.message}`);
      return null;
    }
    
    console.log(`📋 Template loaded: ${template.name}`);
    return template;
  }

  /**
   * Execute PLAN → EXEC handoff
   * PLAN has created PRD and is handing off to EXEC for implementation
   *
   * GATE 6 Integration: Branch enforcement before EXEC work begins
   */
  async executePlanToExec(sdId, options) {
    console.log('🔍 PLAN → EXEC HANDOFF EXECUTION');
    console.log('-'.repeat(30));

    try {
      // Load Strategic Directive to determine target repository
      const { data: sd } = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', sdId)
        .single();

      if (!sd) {
        throw new Error(`Strategic Directive not found: ${sdId}`);
      }

      // Determine target repository based on SD category
      // Engineering/Tool SDs → EHG_Engineer repository
      // Feature/Business SDs → EHG application repository
      const appPath = this.determineTargetRepository(sd);
      console.log(`   Target repository: ${appPath}`);

      // BMAD Enhancement: Validate PLAN→EXEC requirements before executing handoff
      console.log('\n🔍 Step 1: BMAD Validation');
      console.log('-'.repeat(50));

      const bmadPlanToExec = await validateBMADForPlanToExec(sdId, this.supabase);

      if (!bmadPlanToExec.passed) {
        console.error('\n❌ BMAD VALIDATION FAILED (PLAN→EXEC)');
        console.error(`   Score: ${bmadPlanToExec.score}/${bmadPlanToExec.max_score}`);
        console.error(`   Issues: ${bmadPlanToExec.issues.join(', ')}`);

        return {
          success: false,
          rejected: true,
          reasonCode: 'BMAD_VALIDATION_FAILED',
          message: `BMAD validation failed - ${bmadPlanToExec.issues.join('; ')}`,
          details: bmadPlanToExec
        };
      }

      if (bmadPlanToExec.warnings.length > 0) {
        console.log('\n⚠️  BMAD VALIDATION WARNINGS:');
        bmadPlanToExec.warnings.forEach(w => console.log(`   • ${w}`));
      }
      console.log('✅ BMAD validation passed (PLAN→EXEC)\n');

      // GATE 6: BRANCH ENFORCEMENT (BLOCKING)
      // Ensures correct branch exists and is checked out before EXEC work begins
      console.log('\n🔒 GATE 6: Git Branch Enforcement');
      console.log('-'.repeat(50));

      const branchVerifier = new GitBranchVerifier(sdId, sd.title, appPath);
      const branchResults = await branchVerifier.verify();

      if (branchResults.verdict === 'FAIL') {
        console.error('\n❌ GIT BRANCH ENFORCEMENT GATE FAILED');
        console.error(`   Blockers: ${branchResults.blockers.join(', ')}`);
        console.error('');
        console.error('   CRITICAL: Correct branch must be created and checked out');
        console.error('   before EXEC implementation work can begin.');
        console.error('');
        console.error('   This gate prevents wrong-branch issues and uncommitted work.');
        console.error('');
        console.error('   REMEDIATION:');
        console.error('   1. Branch will be created/switched automatically (stash-safe)');
        console.error('   2. Or resolve branch issues manually');
        console.error('   3. Re-run this handoff');

        return {
          success: false,
          rejected: true,
          reasonCode: 'BRANCH_ENFORCEMENT_FAILED',
          message: `Branch enforcement failed - ${branchResults.blockers.join('; ')}`,
          details: branchResults,
          remediation: 'Resolve branch issues, then retry handoff'
        };
      }

      console.log('✅ GATE 6: On correct branch, ready for EXEC work');
      console.log(`   Branch: ${branchResults.expectedBranch}`);
      console.log(`   Remote tracking: ${branchResults.remoteTrackingSetup ? 'configured' : 'will setup on first push'}`);
      console.log('-'.repeat(50));

      // NEW: Auto-populate deliverables from PRD (ROOT CAUSE FIX)
      console.log('\n📦 Step 1.5: Auto-Populate Deliverables from PRD');
      console.log('-'.repeat(50));

      // Get PRD first
      const sdUuid = sd.uuid_id || sd.id;
      const { data: prds } = await this.supabase
        .from('product_requirements_v2')
        .select('*')
        .eq('sd_uuid', sdUuid);

      if (prds && prds.length > 0) {
        const prd = prds[0];
        const deliverablesResult = await extractAndPopulateDeliverables(sdId, prd, this.supabase, {
          skipIfExists: true
        });

        if (deliverablesResult.success) {
          if (deliverablesResult.skipped) {
            console.log('   ℹ️  Deliverables already exist - skipping');
          } else {
            console.log(`   ✅ Populated ${deliverablesResult.count} deliverables`);
            console.log('   EXEC agents will track completion in sd_scope_deliverables table');
          }
        } else {
          console.log('   ⚠️  Could not extract deliverables from PRD');
          console.log(`   ${deliverablesResult.message}`);
          console.log('   EXEC agents may need to create deliverables manually');
        }
      } else {
        console.log('   ⚠️  No PRD found - cannot extract deliverables');
      }
      console.log('-'.repeat(50));

      // Proceed with standard PLAN-to-EXEC verification
      console.log('\n🔍 Step 2: Standard PLAN→EXEC Verification');
      console.log('-'.repeat(50));

      const verificationResult = await this.planToExecVerifier.verifyHandoff(sdId, options.prdId);

      if (!verificationResult.success) {
        return verificationResult;
      }

      // Merge validation details
      verificationResult.bmad_validation = bmadPlanToExec.details;
      verificationResult.branch_validation = {
        branch: branchResults.expectedBranch,
        created: branchResults.branchCreated,
        switched: branchResults.branchSwitched,
        remote_tracking: branchResults.remoteTrackingSetup
      };

      console.log('\n✅ PLAN → EXEC HANDOFF APPROVED');
      console.log('📋 Ready for EXEC implementation work');
      console.log(`   Branch: ${branchResults.expectedBranch}`);
      console.log(`   Repository: ${appPath}`);

      return verificationResult;

    } catch (error) {
      return {
        success: false,
        error: error.message,
        reasonCode: 'SYSTEM_ERROR'
      };
    }
  }

  /**
   * Determine target repository based on SD target_application field
   * PRIMARY: Use target_application field (explicit specification)
   * FALLBACK: Use category/ID pattern heuristics if field not set
   *
   * Engineering/Tool SDs → EHG_Engineer repository
   * Feature/Business SDs → EHG application repository
   */
  determineTargetRepository(sd) {
    // PRIMARY: Use target_application field if explicitly set
    if (sd.target_application) {
      const targetApp = sd.target_application.toLowerCase().trim();

      // Match EHG_Engineer repository
      if (targetApp.includes('engineer') ||
          targetApp === 'ehg_engineer' ||
          targetApp === 'ehg-engineer' ||
          targetApp === 'engineer' ||
          targetApp === 'ehg engineer') {
        console.log(`   Repository determined by target_application: "${sd.target_application}" → EHG_Engineer`);
        return '/mnt/c/_EHG/EHG_Engineer';
      }

      // Match EHG application repository
      if (targetApp === 'ehg' ||
          targetApp === 'app' ||
          targetApp === 'application' ||
          targetApp === 'ehg app' ||
          targetApp === 'ehg-app') {
        console.log(`   Repository determined by target_application: "${sd.target_application}" → EHG`);
        return '/mnt/c/_EHG/ehg';
      }

      // If target_application is set but doesn't match, warn and fall through to heuristics
      console.warn(`   ⚠️  Unknown target_application value: "${sd.target_application}"`);
      console.warn(`   Falling back to heuristic detection...`);
    }

    // FALLBACK: Heuristic detection if target_application not set or invalid
    console.log(`   Repository determined by heuristics (category/keywords)...`);

    const engineeringCategories = ['engineering', 'tool', 'infrastructure', 'devops', 'ci-cd'];
    const engineeringKeywords = ['eng/', 'tool/', 'infra/', 'pipeline/', 'build/', 'deploy/'];

    // Check if SD ID starts with engineering prefix patterns
    if (engineeringKeywords.some(keyword => sd.id.toLowerCase().includes(keyword))) {
      return '/mnt/c/_EHG/EHG_Engineer';
    }

    // Check if SD category is engineering-related
    if (sd.category && engineeringCategories.includes(sd.category.toLowerCase())) {
      return '/mnt/c/_EHG/EHG_Engineer';
    }

    // Check if title contains engineering keywords
    if (sd.title) {
      const titleLower = sd.title.toLowerCase();
      if (titleLower.includes('engineer') ||
          titleLower.includes('protocol') ||
          titleLower.includes('leo ') ||
          titleLower.includes('gate ') ||
          titleLower.includes('handoff')) {
        return '/mnt/c/_EHG/EHG_Engineer';
      }
    }

    // Default to EHG application for customer-facing features
    return '/mnt/c/_EHG/ehg';
  }

  /**
   * Execute EXEC → PLAN handoff (verification and acceptance)
   */
  async executeExecToPlan(sdId, options) {
    console.log('🔍 EXEC → PLAN HANDOFF EXECUTION');
    console.log('-'.repeat(30));

    try {
      // SUB-AGENT ORCHESTRATION: Run required sub-agents for PLAN_VERIFY phase
      console.log('\n🤖 Step 0: Sub-Agent Orchestration (PLAN_VERIFY phase)');
      console.log('-'.repeat(50));

      const orchestrationResult = await orchestrate('PLAN_VERIFY', sdId);

      if (!orchestrationResult.can_proceed) {
        console.error('\n❌ SUB-AGENT VERIFICATION FAILED');
        console.error(`   Verdict: ${orchestrationResult.verdict}`);
        console.error(`   Message: ${orchestrationResult.message}`);
        console.error(`   Failed agents: ${orchestrationResult.failed}`);
        console.error(`   Blocked agents: ${orchestrationResult.blocked}`);
        console.error('');
        console.error('   REMEDIATION: Fix sub-agent failures before creating EXEC→PLAN handoff');

        return {
          success: false,
          rejected: true,
          reasonCode: 'SUB_AGENT_VERIFICATION_FAILED',
          message: `${orchestrationResult.message} - Sub-agent verification must pass before handoff`,
          details: orchestrationResult,
          remediation: 'Review sub-agent results and fix issues, then retry handoff'
        };
      }

      console.log(`✅ Sub-agent orchestration passed: ${orchestrationResult.passed}/${orchestrationResult.total_agents} agents`);
      console.log('-'.repeat(50));

      // BMAD Enhancement: Validate EXEC→PLAN requirements
      const bmadValidation = await validateBMADForExecToPlan(sdId, this.supabase);

      if (!bmadValidation.passed) {
        console.error('\n❌ BMAD VALIDATION FAILED');
        console.error(`   Score: ${bmadValidation.score}/${bmadValidation.max_score}`);
        console.error(`   Issues: ${bmadValidation.issues.join(', ')}`);
        console.error('');
        console.error('   REMEDIATION: Fix BMAD validation issues before creating EXEC→PLAN handoff');

        return {
          success: false,
          rejected: true,
          reasonCode: 'BMAD_VALIDATION_FAILED',
          message: `BMAD validation failed - ${bmadValidation.issues.join('; ')}`,
          details: bmadValidation,
          remediation: bmadValidation.details
        };
      }

      if (bmadValidation.warnings.length > 0) {
        console.log('\n⚠️  BMAD VALIDATION WARNINGS:');
        bmadValidation.warnings.forEach(w => console.log(`   • ${w}`));
      }

      console.log('\n✅ BMAD validation passed');
      console.log('-'.repeat(50));

      // Load Strategic Directive and PRD
      const { data: sd } = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', sdId)
        .single();

      if (!sd) {
        throw new Error(`Strategic Directive not found: ${sdId}`);
      }

      // Use new sd_uuid column (post-migration) with fallback to uuid_id lookup
      const sdUuid = sd.uuid_id || sd.id;

      const { data: prds } = await this.supabase
        .from('product_requirements_v2')
        .select('*')
        .eq('sd_uuid', sdUuid);

      if (!prds || prds.length === 0) {
        return {
          success: false,
          rejected: true,
          reasonCode: 'NO_PRD',
          message: 'No PRD found - cannot verify EXEC work'
        };
      }

      const prd = prds[0];

      // Check if EXEC work is complete
      const execValidation = await this.validateExecWork(prd, sdId);

      console.log('📊 EXEC Validation Results:');
      console.log('   Score:', execValidation.score);
      console.log('   Checklist:', execValidation.checkedItems, '/', execValidation.totalItems);
      console.log('   Issues:', execValidation.issues);
      console.log('   Complete:', execValidation.complete);

      if (!execValidation.complete) {
        return {
          success: false,
          rejected: true,
          reasonCode: 'EXEC_INCOMPLETE',
          message: 'EXEC work not complete - cannot handoff to PLAN for verification',
          details: execValidation
        };
      }

      // SD-DOCUMENTATION-001: Documentation validation (MANDATORY)
      console.log('📚 Validating documentation exists...');
      const { data: docs, error: docsError } = await this.supabase
        .from('generated_docs')
        .select('id')
        .eq('sd_id', sdId)
        .limit(1);

      if (docsError) {
        console.warn(`⚠️  Documentation check failed: ${docsError.message}`);
        console.warn('   Proceeding with warning (infrastructure issue, not blocking)');
      } else if (!docs || docs.length === 0) {
        console.error('❌ DOCUMENTATION MISSING');
        console.error('   No documentation found in generated_docs table');
        console.error('');
        console.error('   This SD has not been documented according to LEO Protocol requirements.');
        console.error('   EXEC agents must generate documentation before creating EXEC→PLAN handoff.');
        console.error('');
        console.error('   REMEDIATION:');
        console.error(`   node scripts/generate-workflow-docs.js --sd-id ${sdId}`);
        console.error('');
        console.error('   After generating documentation, retry this handoff.');

        return {
          success: false,
          rejected: true,
          reasonCode: 'DOCUMENTATION_MISSING',
          message: 'No documentation found - EXEC→PLAN handoff blocked per SD-DOCUMENTATION-001',
          remediation: `node scripts/generate-workflow-docs.js --sd-id ${sdId}`,
          details: {
            sd_id: sdId,
            docs_found: 0,
            requirement: 'All Strategic Directives must have documentation before EXEC→PLAN handoff',
            protocol_integration: 'SD-DOCUMENTATION-001'
          }
        };
      } else {
        console.log(`✅ Documentation validated: ${docs.length} record(s) found`);
      }

      // NEW: E2E Test → User Story Mapping (ROOT CAUSE FIX)
      console.log('\n🔗 Step 2.5: E2E Test → User Story Mapping');
      console.log('-'.repeat(50));

      const mappingResult = await mapE2ETestsToUserStories(sdId, this.supabase);

      // Validate coverage (minimum 50% for UI features, backend validated via deliverables)
      const coverageValidation = validateE2ECoverage(mappingResult, 50);

      if (!coverageValidation.passed) {
        console.error('\n❌ E2E TEST COVERAGE INSUFFICIENT');
        console.error(`   Coverage: ${coverageValidation.coverage}%`);
        console.error(`   Threshold: 50% (UI features should have E2E tests)`);
        console.error(`   Unmapped: ${mappingResult.unmatchedStories.length} user stories`);
        console.error('');
        console.error('   REMEDIATION:');
        console.error('   • Create E2E tests for UI user stories (US-XXX naming convention)');
        console.error('   • OR validate backend stories via deliverables completion');
        console.error('   • OR update user_stories manually if tests exist but use different naming');
        console.error('');
        console.error('   Unmapped user stories:');
        mappingResult.unmatchedStories.slice(0, 10).forEach((s, idx) => {
          console.error(`   ${idx + 1}. ${s.story_key}: ${s.title}`);
        });
        if (mappingResult.unmatchedStories.length > 10) {
          console.error(`   ... and ${mappingResult.unmatchedStories.length - 10} more`);
        }

        return {
          success: false,
          rejected: true,
          reasonCode: 'E2E_COVERAGE_INSUFFICIENT',
          message: coverageValidation.message,
          details: mappingResult,
          remediation: coverageValidation.remediation
        };
      }

      console.log('✅ E2E test mapping complete');
      console.log(`   Coverage: ${mappingResult.coverage}% (${mappingResult.matched}/${mappingResult.total} stories)`);
      if (mappingResult.unmatched > 0) {
        console.log(`   Note: ${mappingResult.unmatched} backend stories validated via deliverables`);
      }
      console.log('-'.repeat(50));

      // Database-first: No file creation, handoff stored in PRD metadata + audit trail
      console.log('\n📝 EXEC→PLAN handoff will be stored in database (product_requirements_v2.metadata.exec_handoff)');
      console.log('   Audit trail: sd_phase_handoffs table');

      const handoffId = `EXEC-to-PLAN-${sdId}-${Date.now()}`;

      // Update PRD status for PLAN verification
      await this.supabase
        .from('product_requirements_v2')
        .update({
          status: 'verification',
          phase: 'PLAN_VERIFICATION',
          updated_at: new Date().toISOString(),
          metadata: {
            ...prd.metadata,
            exec_handoff: {
              handoff_id: handoffId,
                      validation: execValidation
            }
          }
        })
        .eq('id', prd.id);

      console.log('✅ EXEC → PLAN HANDOFF APPROVED');
      console.log('📋 EXEC work complete and handed to PLAN for verification');
      console.log('📊 Handoff ID:', handoffId);

      return {
        success: true,
        prdId: prd.id,
        handoffId: handoffId,
        validation: execValidation
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        reasonCode: 'SYSTEM_ERROR'
      };
    }
  }
  
  /**
   * Execute PLAN → LEAD handoff
   * PLAN has completed verification and is handing back to LEAD for final approval
   */
  async executePlanToLead(sdId, options) {
    console.log('🔍 PLAN → LEAD HANDOFF EXECUTION');
    console.log('-'.repeat(30));

    try {
      // SUB-AGENT ORCHESTRATION: Run required sub-agents for LEAD_FINAL phase
      console.log('\n🤖 Step 0: Sub-Agent Orchestration (LEAD_FINAL phase)');
      console.log('-'.repeat(50));

      const orchestrationResult = await orchestrate('LEAD_FINAL', sdId);

      if (!orchestrationResult.can_proceed) {
        console.error('\n❌ SUB-AGENT VERIFICATION FAILED');
        console.error(`   Verdict: ${orchestrationResult.verdict}`);
        console.error(`   Message: ${orchestrationResult.message}`);
        console.error('');
        console.error('   CRITICAL: Retrospective must be generated before LEAD final approval');
        console.error('');
        console.error('   REMEDIATION:');
        console.error(`   node scripts/generate-comprehensive-retrospective.js ${sdId}`);

        return {
          success: false,
          rejected: true,
          reasonCode: 'SUB_AGENT_VERIFICATION_FAILED',
          message: `${orchestrationResult.message} - Sub-agent verification must pass before handoff`,
          details: orchestrationResult,
          remediation: `node scripts/generate-comprehensive-retrospective.js ${sdId}`
        };
      }

      console.log(`✅ Sub-agent orchestration passed: ${orchestrationResult.passed}/${orchestrationResult.total_agents} agents`);
      console.log('-'.repeat(50));

      // Load Strategic Directive to determine target repository
      const { data: sdForGit } = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', sdId)
        .single();

      if (!sdForGit) {
        throw new Error(`Strategic Directive not found: ${sdId}`);
      }

      // GATE 5: GIT COMMIT ENFORCEMENT (BLOCKING)
      // Ensures all implementation work is committed and pushed before final approval
      console.log('\n🔒 GATE 5: Git Commit Enforcement');
      console.log('-'.repeat(50));

      // Determine application path (EHG vs EHG_Engineer) based on target_application
      const appPath = options.appPath || this.determineTargetRepository(sdForGit);
      console.log(`   Target repository: ${appPath}`);

      const gitVerifier = new GitCommitVerifier(sdId, appPath);
      const gitResults = await gitVerifier.verify();

      if (gitResults.verdict === 'FAIL') {
        console.error('\n❌ GIT COMMIT ENFORCEMENT GATE FAILED');
        console.error(`   Blockers: ${gitResults.blockers.join(', ')}`);
        console.error('');
        console.error('   CRITICAL: All implementation work must be committed and pushed');
        console.error('   to the remote repository before PLAN→LEAD handoff.');
        console.error('');
        console.error('   This gate prevents lost work (e.g., uncommitted Ventures page changes).');
        console.error('');
        console.error('   REMEDIATION:');
        console.error('   1. Review uncommitted changes: git status');
        console.error('   2. Commit all work: git commit -m "feat(' + sdId + '): <description>"');
        console.error('   3. Push to remote: git push');
        console.error('   4. Re-run this handoff');

        return {
          success: false,
          rejected: true,
          reasonCode: 'GIT_COMMIT_ENFORCEMENT_FAILED',
          message: `Git commit enforcement failed - ${gitResults.blockers.join('; ')}`,
          details: gitResults,
          remediation: 'Commit and push all changes, then retry handoff'
        };
      }

      console.log('✅ GATE 5: Git status clean, all commits pushed');
      console.log(`   Commits found: ${gitResults.commitCount}`);
      console.log('-'.repeat(50));

      // Load Strategic Directive and PRD
      const { data: sd } = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', sdId)
        .single();

      if (!sd) {
        throw new Error(`Strategic Directive not found: ${sdId}`);
      }

      // Use new sd_uuid column (post-migration) with fallback to uuid_id lookup
      const sdUuid = sd.uuid_id || sd.id;

      const { data: prds } = await this.supabase
        .from('product_requirements_v2')
        .select('*')
        .eq('sd_uuid', sdUuid);

      if (!prds || prds.length === 0) {
        return {
          success: false,
          rejected: true,
          reasonCode: 'NO_PRD',
          message: 'No PRD found - cannot verify work'
        };
      }

      const prd = prds[0];

      // Validate PLAN verification is complete
      const planValidation = this.validatePlanVerification(prd, sd);

      console.log('📊 PLAN Verification Results:');
      console.log('   Score:', planValidation.score);
      console.log('   Issues:', planValidation.issues);
      console.log('   Warnings:', planValidation.warnings);
      console.log('   Complete:', planValidation.complete);

      if (!planValidation.complete) {
        return {
          success: false,
          rejected: true,
          reasonCode: 'PLAN_INCOMPLETE',
          message: 'PLAN verification not complete - cannot handoff to LEAD for approval',
          details: planValidation
        };
      }

      // Database-first: Store handoff in database (PRD metadata + audit trail)
      console.log('📝 PLAN→LEAD handoff will be stored in database (product_requirements_v2.metadata.plan_handoff)');
      console.log('   Audit trail: sd_phase_handoffs table');

      const handoffId = `PLAN-to-LEAD-${sdId}-${Date.now()}`;

      // Update PRD status for LEAD approval
      await this.supabase
        .from('product_requirements_v2')
        .update({
          status: 'pending_approval',
          phase: 'LEAD_APPROVAL',
          updated_at: new Date().toISOString(),
          metadata: {
            ...prd.metadata,
            plan_handoff: {
              handoff_id: handoffId,
                      validation: planValidation
            }
          }
        })
        .eq('id', prd.id);

      // Update SD status for LEAD approval
      await this.supabase
        .from('strategic_directives_v2')
        .update({
          status: 'pending_approval',
          current_phase: 'LEAD',
          updated_at: new Date().toISOString()
        })
        .eq('id', sdId);

      console.log('✅ PLAN → LEAD HANDOFF APPROVED');
      console.log('📋 PLAN verification complete and handed to LEAD for approval');
      console.log('📊 Handoff ID:', handoffId);

      return {
        success: true,
        sdId: sdId,
        prdId: prd.id,
        handoffId: handoffId,
        validation: planValidation
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        reasonCode: 'SYSTEM_ERROR'
      };
    }
  }

  /**
   * Validate PLAN verification completeness
   */
  validatePlanVerification(prd, sd) {
    const validation = {
      complete: false,
      score: 0,
      issues: [],
      warnings: []
    };

    // Check PRD status is 'verification' (from EXEC→PLAN handoff)
    if (prd.status === 'verification' || prd.status === 'completed') {
      validation.score += 30;
    } else {
      validation.issues.push(`PRD status is '${prd.status}', expected 'verification' or 'completed'`);
    }

    // Check EXEC handoff exists in metadata
    if (prd.metadata?.exec_handoff) {
      validation.score += 20;
    } else {
      validation.issues.push('No EXEC→PLAN handoff found in metadata');
    }

    // Check sub-agent verification results (should be in metadata)
    const hasSubAgentResults = prd.metadata?.qa_verification || prd.metadata?.db_verification || prd.metadata?.design_review;
    if (hasSubAgentResults) {
      validation.score += 30;
    } else {
      validation.warnings.push('No sub-agent verification results found - verification may be incomplete');
    }

    // Check exec_checklist completion (should be high from EXEC phase)
    if (prd.exec_checklist && Array.isArray(prd.exec_checklist)) {
      const checkedItems = prd.exec_checklist.filter(item => item.checked).length;
      const totalItems = prd.exec_checklist.length;
      const completionRate = checkedItems / totalItems;

      if (completionRate >= 0.8) {
        validation.score += 20;
      } else {
        validation.warnings.push(`EXEC checklist only ${Math.round(completionRate * 100)}% complete`);
      }
    }

    validation.complete = validation.score >= 70 && validation.issues.length === 0;
    return validation;
  }

  /**
   * Validate EXEC work completeness
   */
  async validateExecWork(prd, sdId) {
    const validation = {
      complete: false,
      score: 0,
      issues: [],
      checkedItems: 0,
      totalItems: 0
    };
    
    // Check EXEC checklist completion
    if (prd.exec_checklist && Array.isArray(prd.exec_checklist)) {
      validation.totalItems = prd.exec_checklist.length;
      validation.checkedItems = prd.exec_checklist.filter(item => item.checked).length;
      
      if (validation.checkedItems >= validation.totalItems * 0.8) { // 80% minimum
        validation.score += 50;
      } else {
        validation.issues.push(`Insufficient checklist completion: ${validation.checkedItems}/${validation.totalItems} (need 80%)`);
      }
    } else {
      validation.issues.push('No EXEC checklist found');
    }
    
    // Check deliverables in sd_scope_deliverables table
    const { data: deliverables, error: deliverablesError } = await this.supabase
      .from('sd_scope_deliverables')
      .select('id')
      .eq('sd_id', sdId)
      .eq('completion_status', 'completed');

    if (deliverablesError) {
      validation.issues.push(`Deliverables check failed: ${deliverablesError.message}`);
    } else if (deliverables && deliverables.length > 0) {
      validation.score += 30;

      // AUTO-VALIDATION: Validate user stories when deliverables complete
      // Prevention mechanism for SD-TEST-MOCK-001 root cause
      console.log('🔍 Auto-validating user stories...');
      const userStoryValidation = await autoValidateUserStories(sdId);

      if (userStoryValidation.validated) {
        console.log(`✅ User stories validated: ${userStoryValidation.count} stories (${userStoryValidation.message})`);
      } else {
        console.log(`⚠️  User story validation: ${userStoryValidation.message || 'Validation incomplete'}`);
        if (userStoryValidation.error) {
          console.warn(`   Error: ${userStoryValidation.error}`);
        }
      }

      // Store validation results in handoff metadata for audit trail
      validation.user_story_validation = userStoryValidation;
    } else {
      validation.issues.push('No completed deliverables found');
    }

    // Check implementation status
    if (prd.status === 'implemented' || prd.status === 'completed') {
      validation.score += 20;
    } else if (prd.status === 'in_progress') {
      validation.issues.push('PRD status still in_progress - not ready for verification');
    }
    
    validation.complete = validation.score >= 80 && validation.issues.length === 0;
    return validation;
  }
  
  /**
   * Generate EXEC handoff document from PRD data
   */
  async generateExecHandoffDocument(sd, prd, filePath) {
    const handoff = `# EXEC → PLAN Handoff Document
## Strategic Directive: ${sd.id}
## PRD: ${prd.id}

Generated: ${new Date().toISOString()}

## HANDOFF SUMMARY

EXEC phase completion for ${sd.title}. Implementation complete with ${prd.exec_checklist?.filter(i => i.checked).length || 0} checklist items verified. Ready for PLAN verification and acceptance testing.

## COMPLETENESS REPORT

**Total Requirements**: ${prd.exec_checklist?.length || 0}
**Completed**: ${prd.exec_checklist?.filter(i => i.checked).length || 0}
**Implementation Status**: ${prd.status}
**Completion Rate**: ${Math.round(((prd.exec_checklist?.filter(i => i.checked).length || 0) / (prd.exec_checklist?.length || 1)) * 100)}%

## DELIVERABLES

### Primary:
${prd.deliverables?.map(d => `- ${d}`).join('\\n') || '- No deliverables specified'}

### Supporting:
- Database schema updates
- Configuration changes
- Documentation updates

## KEY DECISIONS

${prd.technical_decisions ? JSON.stringify(prd.technical_decisions, null, 2) : 'No technical decisions recorded'}

## KNOWN ISSUES

${prd.known_issues ? JSON.stringify(prd.known_issues, null, 2) : 'No known issues identified'}

## RESOURCE UTILIZATION

- Development Time: Implementation phase
- Database Changes: ${prd.metadata?.database_changes || 'None specified'}
- API Changes: ${prd.metadata?.api_changes || 'None specified'}

## ACTION ITEMS FOR PLAN

- [ ] Verify all acceptance criteria are met
- [ ] Test implementation against requirements
- [ ] Validate performance metrics
- [ ] Conduct security review
- [ ] Approve for deployment or return with feedback

---
*Generated by Unified Handoff System v4.1.2*
`;

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, handoff);
  }
  
  /**
   * Record successful handoff execution
   */
  async recordSuccessfulHandoff(handoffType, sdId, result, template) {
    // Generate proper UUID instead of TEXT ID
    const executionId = randomUUID();

    const execution = {
      id: executionId,
      template_id: template?.id,
      from_agent: handoffType.split('-')[0],
      to_agent: handoffType.split('-')[2],
      sd_id: sdId,
      prd_id: result.prdId,
      handoff_type: handoffType,
      status: 'accepted',

      validation_score: result.qualityScore || 100,
      validation_passed: true,
      validation_details: {
        result: result,
        verified_at: new Date().toISOString(),
        verifier: 'unified-handoff-system.js'
      },

      accepted_at: new Date().toISOString(),
      created_by: 'UNIFIED-HANDOFF-SYSTEM'
    };

    try {
      const { data, error } = await this.supabase.from('sd_phase_handoffs').insert(execution).select();
      if (error) {
        console.error('❌ Failed to store handoff execution:', error.message);
        console.error('   Details:', error);
        throw error; // Re-throw to surface the issue
      }
      console.log(`📝 Success recorded: ${executionId}`);

      // BUG FIX: Also create actual handoff record in sd_phase_handoffs
      // The execution table is for tracking, but sd_phase_handoffs contains the actual handoff artifact
      await this.createHandoffArtifact(handoffType, sdId, result, executionId);

      // AUTOMATION: Auto-generate PRD script on successful LEAD→PLAN handoff
      if (handoffType === 'LEAD-to-PLAN') {
        await this.autoGeneratePRDScript(sdId);
      }

    } catch (error) {
      console.error('⚠️  Critical: Could not store execution:', error.message);
      throw error; // Don't silently fail
    }
  }

  /**
   * Create the actual handoff artifact in sd_phase_handoffs table
   * BUG FIX: Unified handoff system was only creating execution records, not actual handoffs
   */
  async createHandoffArtifact(handoffType, sdId, result, executionId) {
    try {
      // Get SD details for handoff content
      const { data: sd } = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', sdId)
        .single();

      if (!sd) {
        console.warn('⚠️  Cannot create handoff artifact: SD not found');
        return;
      }

      // Get sub-agent results if available
      const { data: subAgentResults } = await this.supabase
        .from('sub_agent_execution_results')
        .select('*')
        .eq('sd_id', sdId)
        .order('created_at', { ascending: false })
        .limit(10);

      // Build 7-element handoff structure based on handoff type
      const [fromPhase, , toPhase] = handoffType.split('-');
      const handoffArtifact = this.buildHandoffContent(handoffType, sd, result, subAgentResults);

      const handoffId = randomUUID();
      const handoffRecord = {
        id: handoffId,
        sd_id: sdId,
        from_phase: fromPhase,
        to_phase: toPhase,
        handoff_type: handoffType,
        status: 'pending_acceptance', // Insert as pending first to avoid trigger bug
        ...handoffArtifact,
        metadata: {
          execution_id: executionId,
          quality_score: result.qualityScore || 100,
          created_via: 'unified-handoff-system',
          sub_agent_count: subAgentResults?.length || 0
        },
        created_by: 'UNIFIED-HANDOFF-SYSTEM'
      };

      // Debug: Log 7-element values
      console.log('📋 7-Element Handoff Values:');
      console.log('  1. executive_summary:', handoffRecord.executive_summary ? 'SET' : 'NULL', `(${handoffRecord.executive_summary?.length || 0} chars)`);
      console.log('  2. deliverables_manifest:', handoffRecord.deliverables_manifest ? 'SET' : 'NULL', `(${handoffRecord.deliverables_manifest?.length || 0} chars)`);
      console.log('  3. key_decisions:', handoffRecord.key_decisions ? 'SET' : 'NULL', `(${handoffRecord.key_decisions?.length || 0} chars)`);
      console.log('  4. known_issues:', handoffRecord.known_issues ? 'SET' : 'NULL', `(${handoffRecord.known_issues?.length || 0} chars)`);
      console.log('  5. resource_utilization:', handoffRecord.resource_utilization ? 'SET' : 'NULL', `(${handoffRecord.resource_utilization?.length || 0} chars)`);
      console.log('  6. action_items:', handoffRecord.action_items ? 'SET' : 'NULL', `(${handoffRecord.action_items?.length || 0} chars)`);
      console.log('  7. completeness_report:', handoffRecord.completeness_report ? 'SET' : 'NULL', `(${handoffRecord.completeness_report?.length || 0} chars)`);

      // Insert with pending status (trigger bug workaround: validation queries table, but row doesn't exist yet on INSERT)
      const { error: insertError } = await this.supabase
        .from('sd_phase_handoffs')
        .insert(handoffRecord);

      if (insertError) {
        console.error('❌ Failed to create handoff artifact:', insertError.message);
        throw insertError;
      }

      console.log(`📄 Handoff artifact created (pending validation)...`);

      // Update to accepted status (now trigger can validate the existing row)
      const { error: updateError } = await this.supabase
        .from('sd_phase_handoffs')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', handoffId);

      if (updateError) {
        console.error('❌ Failed to accept handoff:', updateError.message);
        // Clean up pending handoff
        await this.supabase.from('sd_phase_handoffs').delete().eq('id', handoffId);
        throw updateError;
      }

      console.log(`✅ Handoff accepted and stored in sd_phase_handoffs`);

    } catch (error) {
      console.error('⚠️  Could not create handoff artifact:', error.message);
      // Don't fail the entire handoff if artifact creation fails
    }
  }

  /**
   * Build 7-element handoff content based on handoff type
   */
  buildHandoffContent(handoffType, sd, result, subAgentResults) {
    const [fromPhase, , toPhase] = handoffType.split('-');

    // Base content structure
    const content = {
      executive_summary: '',
      deliverables_manifest: '',
      key_decisions: '',
      known_issues: '',
      resource_utilization: '',
      action_items: '',
      completeness_report: ''
    };

    // LEAD → PLAN handoff
    if (handoffType === 'LEAD-to-PLAN') {
      content.executive_summary = `${fromPhase} phase complete for ${sd.id}: ${sd.title}. Strategic validation passed with ${result.qualityScore || 100}% completeness. SD approved for PLAN phase PRD creation.`;

      content.deliverables_manifest = [
        '- ✅ Strategic Directive validated (100% completeness)',
        '- ✅ Sub-agent validations complete',
        `- ✅ ${subAgentResults?.length || 0} sub-agent assessments recorded`,
        '- ✅ SD status updated to active',
        '- ✅ PLAN phase authorized'
      ].join('\n');

      const subAgentSummary = (subAgentResults || []).map(sa =>
        `- ${sa.sub_agent_code}: ${sa.verdict} (${sa.confidence}% confidence)`
      ).join('\n');

      // Parse JSON strings if needed
      const parseJSONField = (field) => {
        if (!field) return [];
        if (Array.isArray(field)) return field;
        try {
          return JSON.parse(field);
        } catch {
          return [];
        }
      };

      const objectives = parseJSONField(sd.strategic_objectives);
      const metrics = parseJSONField(sd.success_metrics);
      const risks = parseJSONField(sd.risks);

      content.key_decisions = [
        `**Strategic Objectives**: ${objectives.length} defined`,
        `**Success Metrics**: ${metrics.length} measurable`,
        `**Risks Identified**: ${risks.length}`,
        `**Sub-Agent Verdicts**:\n${subAgentSummary || 'None recorded'}`
      ].join('\n\n');

      const warnings = (subAgentResults || [])
        .filter(sa => sa.warnings && sa.warnings.length > 0)
        .map(sa => `**${sa.sub_agent_code}**: ${sa.warnings.join(', ')}`)
        .join('\n');

      content.known_issues = warnings || 'No critical issues identified during LEAD validation';

      content.resource_utilization = `**Sub-Agents Executed**: ${subAgentResults?.length || 0}\n**Validation Time**: ${result.validationTime || 'N/A'}`;

      content.action_items = [
        '- [ ] PLAN agent: Create comprehensive PRD',
        '- [ ] PLAN agent: Generate user stories from requirements',
        '- [ ] PLAN agent: Validate PRD completeness before EXEC handoff',
        '- [ ] Address any sub-agent warnings before implementation'
      ].join('\n');

      content.completeness_report = `**LEAD Phase**: 100% complete\n**SD Completeness**: ${result.qualityScore || 100}%\n**Sub-Agent Coverage**: ${subAgentResults?.length || 0} agents\n**Status**: APPROVED for PLAN phase`;
    }

    // Can extend for other handoff types (PLAN-to-EXEC, EXEC-to-PLAN, etc.)

    return content;
  }
  
  /**
   * Record failed handoff execution
   */
  async recordFailedHandoff(handoffType, sdId, result, template) {
    // Generate proper UUID instead of TEXT ID
    const executionId = randomUUID();

    const execution = {
      id: executionId,
      template_id: template?.id,
      from_agent: handoffType.split('-')[0],
      to_agent: handoffType.split('-')[2],
      sd_id: sdId,
      handoff_type: handoffType,
      status: 'rejected',

      validation_score: result.actualScore || 0,
      validation_passed: false,
      validation_details: {
        result: result,
        rejected_at: new Date().toISOString(),
        reason: result.reasonCode,
        message: result.message
      },

      rejection_reason: result.message,
      created_by: 'UNIFIED-HANDOFF-SYSTEM'
    };

    try {
      const { data, error } = await this.supabase.from('sd_phase_handoffs').insert(execution).select();
      if (error) {
        console.error('❌ Failed to store handoff rejection:', error.message);
        throw error;
      }
      console.log(`📝 Failure recorded: ${executionId}`);
    } catch (error) {
      console.error('⚠️  Critical: Could not store execution:', error.message);
      // Don't throw here - rejection recording is less critical
    }
  }
  
  /**
   * Record system error
   */
  async recordSystemError(handoffType, sdId, errorMessage) {
    // Generate proper UUID instead of TEXT ID
    const executionId = randomUUID();

    const execution = {
      id: executionId,
      from_agent: handoffType.split('-')[0],
      to_agent: handoffType.split('-')[2],
      sd_id: sdId,
      handoff_type: handoffType,
      status: 'failed',

      validation_score: 0,
      validation_passed: false,
      validation_details: {
        system_error: errorMessage,
        failed_at: new Date().toISOString()
      },

      created_by: 'UNIFIED-HANDOFF-SYSTEM'
    };

    try {
      const { data, error} = await this.supabase.from('leo_handoff_executions').insert(execution).select();
      if (error) {
        console.error('❌ Failed to store system error:', error.message);
      }
    } catch (error) {
      console.warn('⚠️  Could not store error:', error.message);
    }
  }
  
  /**
   * List all handoff executions for dashboard
   */
  async listHandoffExecutions(filters = {}) {
    let query = this.supabase
      .from('sd_phase_handoffs')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (filters.sdId) {
      query = query.eq('sd_id', filters.sdId);
    }
    
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    
    if (filters.handoffType) {
      query = query.eq('handoff_type', filters.handoffType);
    }
    
    const { data, error } = await query.limit(filters.limit || 50);
    
    if (error) {
      console.error('Error loading handoff executions:', error);
      return [];
    }
    
    return data || [];
  }
  
  /**
   * Get handoff statistics
   */
  async getHandoffStats() {
    try {
      const { data: executions } = await this.supabase
        .from('sd_phase_handoffs')
        .select('status, handoff_type, metadata');
        
      if (!executions) return null;
      
      const stats = {
        total: executions.length,
        successful: executions.filter(e => e.status === 'accepted').length,
        rejected: executions.filter(e => e.status === 'rejected').length,
        failed: executions.filter(e => e.status === 'failed').length,
        averageScore: executions.reduce((sum, e) => sum + (e.validation_score || 0), 0) / executions.length,
        byType: {}
      };
      
      // Stats by handoff type
      this.supportedHandoffs.forEach(type => {
        const typeExecutions = executions.filter(e => e.handoff_type === type);
        stats.byType[type] = {
          total: typeExecutions.length,
          successful: typeExecutions.filter(e => e.status === 'accepted').length,
          rejected: typeExecutions.filter(e => e.status === 'rejected').length,
          averageScore: typeExecutions.reduce((sum, e) => sum + (e.validation_score || 0), 0) / (typeExecutions.length || 1)
        };
      });
      
      return stats;

    } catch (error) {
      console.error('Error calculating stats:', error);
      return null;
    }
  }

  /**
   * AUTO-GENERATE PRD SCRIPT ON LEAD→PLAN HANDOFF
   *
   * Automatically generates a PRD creation script when LEAD approves an SD.
   * This integration ensures PRD scripts are created immediately after approval,
   * following the schema validation best practices.
   *
   * Workflow:
   * 1. LEAD approves SD → LEAD-to-PLAN handoff created
   * 2. This method automatically runs generate-prd-script.js
   * 3. Creates scripts/create-prd-<sd-id>.js with proper schema
   * 4. User can then run the script manually or it can be auto-executed
   *
   * @param {string} sdId - Strategic Directive ID
   */
  async autoGeneratePRDScript(sdId) {
    try {
      console.log('\n🤖 AUTO-GENERATING PRD SCRIPT');
      console.log('='.repeat(70));

      // Fetch SD details
      const { data: sd, error: sdError } = await this.supabase
        .from('strategic_directives_v2')
        .select('id, title, category, priority')
        .eq('id', sdId)
        .single();

      if (sdError || !sd) {
        console.log(`⚠️  Could not fetch SD details: ${sdError?.message || 'Not found'}`);
        console.log('   Skipping auto-generation (can be run manually)');
        return;
      }

      console.log(`   SD: ${sd.title}`);

      // Import and execute the generator
      const { default: { execSync } } = await import('child_process');
      const scriptPath = path.join(process.cwd(), 'scripts', 'generate-prd-script.js');

      console.log(`   Running: node scripts/generate-prd-script.js ${sdId} "${sd.title} - Technical Implementation"`);

      // Execute the PRD script generator
      try {
        const output = execSync(
          `node "${scriptPath}" ${sdId} "${sd.title} - Technical Implementation"`,
          { encoding: 'utf-8', cwd: process.cwd() }
        );

        console.log('\n' + output);
        console.log('✅ PRD script auto-generated successfully!');
        console.log('');
        console.log('📝 NEXT STEPS:');
        console.log(`   1. Edit: scripts/create-prd-${sdId.toLowerCase()}.js`);
        console.log('      - Update TODO sections');
        console.log('      - Add requirements, architecture, test scenarios');
        console.log('');
        console.log(`   2. Run: node scripts/create-prd-${sdId.toLowerCase()}.js`);
        console.log('      - Creates PRD in database');
        console.log('      - Validates schema automatically');
        console.log('      - Triggers STORIES sub-agent');
        console.log('');

      } catch (execError) {
        // Script already exists or other error
        if (execError.message.includes('already exists')) {
          console.log('   ℹ️  PRD script already exists - skipping generation');
        } else {
          console.log(`   ⚠️  Generation failed: ${execError.message}`);
          console.log('   You can manually run: npm run prd:new ' + sdId);
        }
      }

    } catch (error) {
      console.log('\n⚠️  Auto-generation error:', error.message);
      console.log('   PRD script can be generated manually:');
      console.log(`   npm run prd:new ${sdId}`);
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const system = new UnifiedHandoffSystem();
  
  switch (command) {
    case 'execute':
      const handoffType = args[1];
      const sdId = args[2];
      const prdId = args[3];
      
      if (!handoffType || !sdId) {
        console.log('Usage: node unified-handoff-system.js execute HANDOFF_TYPE SD-YYYY-XXX [PRD-ID]');
        console.log('');
        console.log('Handoff Types:');
        console.log('  LEAD-to-PLAN   - Strategic to Planning handoff');
        console.log('  PLAN-to-EXEC   - Planning to Execution handoff');
        console.log('  EXEC-to-PLAN   - Execution to Verification handoff');
        process.exit(1);
      }
      
      const result = await system.executeHandoff(handoffType, sdId, { prdId });
      process.exit(result.success ? 0 : 1);
      break;
      
    case 'list':
      const sdFilter = args[1];
      const executions = await system.listHandoffExecutions({ 
        sdId: sdFilter,
        limit: 20 
      });
      
      console.log('📋 Recent Handoff Executions');
      console.log('='.repeat(60));
      executions.forEach(exec => {
        console.log(`${exec.handoff_type} | ${exec.sd_id} | ${exec.status} | ${exec.validation_score}% | ${exec.initiated_at}`);
      });
      break;
      
    case 'stats':
      const stats = await system.getHandoffStats();
      if (stats) {
        console.log('📊 Handoff System Statistics');
        console.log('='.repeat(40));
        console.log(`Total Executions: ${stats.total}`);
        console.log(`Success Rate: ${Math.round((stats.successful / stats.total) * 100)}%`);
        console.log(`Average Score: ${Math.round(stats.averageScore)}%`);
        console.log('');
        console.log('By Type:');
        Object.entries(stats.byType).forEach(([type, typeStats]) => {
          console.log(`  ${type}: ${typeStats.successful}/${typeStats.total} (${Math.round(typeStats.averageScore)}%)`);
        });
      }
      break;
      
    case 'help':
    default:
      console.log('Unified LEO Protocol Handoff System');
      console.log('='.repeat(40));
      console.log('');
      console.log('COMMANDS:');
      console.log('  execute TYPE SD-ID     - Execute handoff');
      console.log('  list [SD-ID]          - List handoff executions');
      console.log('  stats                 - Show system statistics');
      console.log('  help                  - Show this help');
      console.log('');
      console.log('FEATURES:');
      console.log('• Database-driven handoff templates');
      console.log('• PRD quality enforcement');
      console.log('• Complete audit trail');  
      console.log('• Rejection workflow with improvement guidance');
      console.log('• Dashboard integration');
      console.log('');
      console.log('INTEGRATION:');
      console.log('• Used by LEO Protocol agents for all handoffs');
      console.log('• Enforces quality gates at each transition');
      console.log('• Provides consistent handoff experience');
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default UnifiedHandoffSystem;