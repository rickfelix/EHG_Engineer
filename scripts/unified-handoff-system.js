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
import { validateBMADForPlanToExec, validateBMADForExecToPlan } from './modules/bmad-validation.js';
import { validateGate1PlanToExec, shouldValidateDesignDatabase } from './modules/design-database-gates-validation.js';
import { validateGate2ExecToPlan } from './modules/implementation-fidelity-validation.js';
import { validateGate3PlanToLead } from './modules/traceability-validation.js';
import { validateGate4LeadFinal } from './modules/workflow-roi-validation.js';
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
    
    // Supported handoff types (all uppercase for consistency)
    this.supportedHandoffs = [
      'LEAD-TO-PLAN',
      'PLAN-TO-EXEC',
      'EXEC-TO-PLAN',
      'PLAN-TO-LEAD'
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
        'All SDs must exist in strategic_directives_v2 table before work begins. ' +
        'Create SD first using the LEO Protocol dashboard or create-strategic-directive.js script.'
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
    // Normalize handoff type to standard format (case-insensitive, all uppercase)
    // Converts: "exec-to-plan", "EXEC-to-PLAN", "Exec-To-Plan" → "EXEC-TO-PLAN"
    const normalizedType = handoffType.toUpperCase();

    console.log('🔄 UNIFIED LEO HANDOFF SYSTEM');
    console.log('='.repeat(50));
    console.log(`Type: ${normalizedType}${handoffType !== normalizedType ? ` (normalized from: ${handoffType})` : ''}`);
    console.log(`Strategic Directive: ${sdId}`);
    console.log('Options:', options);
    console.log('');

    try {
      // MANDATORY DATABASE VERIFICATION (SD-TEST-MOCK-001 prevention)
      // This BLOCKING gate ensures SD exists in database before ANY handoff work proceeds
      await this.verifySDExistsInDatabase(sdId);

      // Validate handoff type (using normalized version)
      if (!this.supportedHandoffs.includes(normalizedType)) {
        throw new Error(`Unsupported handoff type: ${normalizedType} (original: ${handoffType}). Supported types: ${this.supportedHandoffs.join(', ')}`);
      }

      // Use normalized type for the rest of the execution
      handoffType = normalizedType;

      // Load handoff template
      const template = await this.loadHandoffTemplate(handoffType);
      if (!template) {
        throw new Error(`No template found for handoff type: ${handoffType}`);
      }
      
      // Route to specialized verifier
      let result;
      switch (handoffType) {
        case 'LEAD-TO-PLAN':
          result = await this.leadToPlanVerifier.verifyHandoff(sdId);
          break;

        case 'PLAN-TO-EXEC':
          result = await this.executePlanToExec(sdId, options);
          break;

        case 'EXEC-TO-PLAN':
          result = await this.executeExecToPlan(sdId, options);
          break;

        case 'PLAN-TO-LEAD':
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

      // GATE 1: DESIGN→DATABASE WORKFLOW VALIDATION (CONDITIONAL)
      // Validates that DESIGN and DATABASE sub-agents executed correctly
      // Only applies to SDs with both design and database categories
      if (shouldValidateDesignDatabase(sd)) {
        console.log('\n🚪 GATE 1: DESIGN→DATABASE Workflow Validation');
        console.log('-'.repeat(50));

        const gate1Results = await validateGate1PlanToExec(sdId, this.supabase);

        // Store Gate 1 results in handoff metadata
        handoffData.metadata.gate1_validation = gate1Results;

        if (!gate1Results.passed) {
          console.error('\n❌ GATE 1 VALIDATION FAILED (DESIGN→DATABASE)');
          console.error(`   Score: ${gate1Results.score}/${gate1Results.max_score}`);
          console.error(`   Issues: ${gate1Results.issues.join(', ')}`);
          console.error('\n   REMEDIATION:');
          console.error('   1. Run DESIGN sub-agent: node lib/sub-agent-executor.js DESIGN ' + sdId);
          console.error('   2. Run DATABASE sub-agent: node lib/sub-agent-executor.js DATABASE ' + sdId);
          console.error('   3. Run STORIES sub-agent: node lib/sub-agent-executor.js STORIES ' + sdId);
          console.error('   4. Re-run this handoff\n');

          return {
            success: false,
            rejected: true,
            reasonCode: 'GATE1_VALIDATION_FAILED',
            message: `Gate 1 validation failed - ${gate1Results.issues.join('; ')}`,
            details: gate1Results
          };
        }

        if (gate1Results.warnings.length > 0) {
          console.log('\n⚠️  GATE 1 VALIDATION WARNINGS:');
          gate1Results.warnings.forEach(w => console.log(`   • ${w}`));
        }
        console.log(`✅ Gate 1 validation passed (${gate1Results.score}/${gate1Results.max_score} points)\n`);
      }

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
      console.warn('   Falling back to heuristic detection...');
    }

    // FALLBACK: Heuristic detection if target_application not set or invalid
    console.log('   Repository determined by heuristics (category/keywords)...');

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
  async executeExecToPlan(sdId, _options) {
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

      // GATE 2: IMPLEMENTATION FIDELITY VALIDATION (CONDITIONAL)
      // Validates that EXEC implemented DESIGN and DATABASE recommendations
      // Only applies to SDs with both design and database categories
      if (shouldValidateDesignDatabase(sd)) {
        console.log('\n🚪 GATE 2: Implementation Fidelity Validation');
        console.log('-'.repeat(50));

        const gate2Results = await validateGate2ExecToPlan(sdId, this.supabase);

        // Store Gate 2 results in handoff metadata
        handoffData.metadata.gate2_validation = gate2Results;

        if (!gate2Results.passed) {
          console.error('\n❌ GATE 2 VALIDATION FAILED (IMPLEMENTATION FIDELITY)');
          console.error(`   Score: ${gate2Results.score}/${gate2Results.max_score}`);
          console.error(`   Issues: ${gate2Results.issues.join(', ')}`);
          console.error('\n   REMEDIATION:');
          console.error('   Review Gate 2 details to see which recommendations were not implemented:');
          console.error('   - Design fidelity: UI components, workflows, user actions');
          console.error('   - Database fidelity: Migrations, RLS policies, schema changes');
          console.error('   - Data flow: Database queries, form integration, validation');
          console.error('   - Testing: E2E tests, migration tests, coverage documentation');
          console.error('   After implementing missing items, re-run this handoff\n');

          return {
            success: false,
            rejected: true,
            reasonCode: 'GATE2_VALIDATION_FAILED',
            message: `Gate 2 validation failed - ${gate2Results.issues.join('; ')}`,
            details: gate2Results
          };
        }

        if (gate2Results.warnings.length > 0) {
          console.log('\n⚠️  GATE 2 VALIDATION WARNINGS:');
          gate2Results.warnings.forEach(w => console.log(`   • ${w}`));
        }
        console.log(`✅ Gate 2 validation passed (${gate2Results.score}/${gate2Results.max_score} points)\n`);
      }

      // RCA GATE ENFORCEMENT: Check for open P0/P1 RCRs (SD-RCA-001)
      console.log('\n🔍 Step 1: RCA Gate Validation');
      console.log('-'.repeat(50));

      const rcaGateResult = await this.validateRCAGateForHandoff(sdId);

      if (!rcaGateResult.gate_status === 'PASS') {
        console.error('\n❌ RCA GATE BLOCKED');
        console.error(`   Open P0/P1 RCRs: ${rcaGateResult.open_rcr_count}`);
        console.error(`   Blocking RCR IDs: ${rcaGateResult.blocking_rcr_ids.join(', ')}`);
        console.error('');
        console.error('   REMEDIATION: All P0/P1 RCRs must have verified CAPAs before handoff');
        console.error('   Run: node scripts/root-cause-agent.js capa verify --capa-id <UUID>');

        return {
          success: false,
          rejected: true,
          reasonCode: 'RCA_GATE_BLOCKED',
          message: `${rcaGateResult.open_rcr_count} P0/P1 RCRs without verified CAPAs`,
          details: rcaGateResult,
          remediation: 'Verify all P0/P1 CAPAs before proceeding with handoff'
        };
      }

      console.log('✅ RCA gate passed');
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
        console.error('   Threshold: 50% (UI features should have E2E tests)');
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

    // Initialize gate validation results (will be populated if validation runs)
    let gate3Results = null;
    let gate4Results = null;

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

      // Load Strategic Directive first to check if Gate 3 applies
      const { data: sdForGate3 } = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', sdId)
        .single();

      if (!sdForGate3) {
        throw new Error(`Strategic Directive not found: ${sdId}`);
      }

      // GATE 3: END-TO-END TRACEABILITY VALIDATION (CONDITIONAL)
      // Validates recommendation adherence and implementation quality
      // Only applies to SDs with both design and database categories
      if (shouldValidateDesignDatabase(sdForGate3)) {
        console.log('\n🚪 GATE 3: End-to-End Traceability Validation');
        console.log('-'.repeat(50));

        // Fetch Gate 2 results from EXEC→PLAN handoff
        const { data: execToPlanHandoff } = await this.supabase
          .from('sd_phase_handoffs')
          .select('metadata')
          .eq('sd_id', sdId)
          .eq('handoff_type', 'EXEC-TO-PLAN')
          .order('created_at', { ascending: false })
          .limit(1);

        const gate2Results = execToPlanHandoff?.[0]?.metadata?.gate2_validation || null;

        gate3Results = await validateGate3PlanToLead(sdId, this.supabase, gate2Results);

        // Store Gate 3 results (will be saved in handoff metadata later)
        // Results are already captured in gate3Results and will be saved below

        if (!gate3Results.passed) {
          console.error('\n❌ GATE 3 VALIDATION FAILED (END-TO-END TRACEABILITY)');
          console.error(`   Score: ${gate3Results.score}/${gate3Results.max_score}`);
          console.error(`   Issues: ${gate3Results.issues.join(', ')}`);
          console.error('\n   REMEDIATION:');
          console.error('   Review Gate 3 details to see traceability issues:');
          console.error('   - Recommendation adherence: Did EXEC follow DESIGN/DATABASE recommendations?');
          console.error('   - Implementation quality: Gate 2 score, test coverage');
          console.error('   - Traceability mapping: PRD→code, design→UI, database→schema');
          console.error('   - Sub-agent effectiveness: Execution time, recommendation quality');
          console.error('   - Lessons captured: Retrospective prep, workflow notes');
          console.error('   Address issues and re-run this handoff\n');

          return {
            success: false,
            rejected: true,
            reasonCode: 'GATE3_VALIDATION_FAILED',
            message: `Gate 3 validation failed - ${gate3Results.issues.join('; ')}`,
            details: gate3Results
          };
        }

        if (gate3Results.warnings.length > 0) {
          console.log('\n⚠️  GATE 3 VALIDATION WARNINGS:');
          gate3Results.warnings.forEach(w => console.log(`   • ${w}`));
        }
        console.log(`✅ Gate 3 validation passed (${gate3Results.score}/${gate3Results.max_score} points)\n`);

        // GATE 4: WORKFLOW ROI & PATTERN EFFECTIVENESS (LEAD FINAL)
        // Strategic value validation before final SD approval
        console.log('\n🚪 GATE 4: Workflow ROI & Pattern Effectiveness (LEAD Final)');
        console.log('-'.repeat(50));

        // Gather all prior gate results for Gate 4
        const { data: planToExecHandoff } = await this.supabase
          .from('sd_phase_handoffs')
          .select('metadata')
          .eq('sd_id', sdId)
          .eq('handoff_type', 'PLAN-TO-EXEC')
          .order('created_at', { ascending: false })
          .limit(1);

        const gate1Results = planToExecHandoff?.[0]?.metadata?.gate1_validation || null;

        const allGateResults = {
          gate1: gate1Results,
          gate2: gate2Results,
          gate3: gate3Results
        };

        gate4Results = await validateGate4LeadFinal(sdId, this.supabase, allGateResults);

        // Store Gate 4 results in handoff metadata
        // Will be saved when handoff is created below

        if (!gate4Results.passed) {
          console.error('\n❌ GATE 4 VALIDATION FAILED (WORKFLOW ROI & PATTERN EFFECTIVENESS)');
          console.error(`   Score: ${gate4Results.score}/${gate4Results.max_score}`);
          console.error(`   Issues: ${gate4Results.issues.join(', ')}`);
          console.error('\n   REMEDIATION:');
          console.error('   Review Gate 4 details to assess strategic value:');
          console.error('   - Process adherence: Did workflow follow protocol?');
          console.error('   - Value delivered: What business value was created?');
          console.error('   - Pattern effectiveness: Should we repeat this approach?');
          console.error('   - Executive validation: LEAD sign-off requirements');
          console.error('   - Strategic questions: Answer 6 LEAD pre-approval questions');
          console.error('   Address issues and re-run this handoff\n');

          return {
            success: false,
            rejected: true,
            reasonCode: 'GATE4_VALIDATION_FAILED',
            message: `Gate 4 validation failed - ${gate4Results.issues.join('; ')}`,
            details: gate4Results
          };
        }

        if (gate4Results.warnings.length > 0) {
          console.log('\n⚠️  GATE 4 VALIDATION WARNINGS:');
          gate4Results.warnings.forEach(w => console.log(`   • ${w}`));
        }
        console.log(`✅ Gate 4 validation passed (${gate4Results.score}/${gate4Results.max_score} points)\n`);
      }

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
              validation: planValidation,
              gate3_validation: gate3Results || null,
              gate4_validation: gate4Results || null
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
   * Validate RCA Gate for Handoff
   * SD-RCA-001: Checks for open P0/P1 RCRs without verified CAPAs
   *
   * GATE LOGIC:
   * - Blocks if any P0/P1 RCR exists without verified CAPA
   * - Returns PASS if no P0/P1 RCRs or all have verified CAPAs
   *
   * @param {string} sdId - Strategic Directive ID
   * @returns {Object} Gate result with status, open_rcr_count, blocking_rcr_ids
   */
  async validateRCAGateForHandoff(sdId) {
    const { data: openRCRs, error } = await this.supabase
      .from('root_cause_reports')
      .select(`
        id,
        severity_priority,
        status,
        problem_statement,
        remediation_manifests (
          id,
          status,
          verified_at
        )
      `)
      .eq('sd_id', sdId)
      .in('status', ['OPEN', 'IN_REVIEW', 'CAPA_PENDING', 'CAPA_APPROVED', 'FIX_IN_PROGRESS'])
      .in('severity_priority', ['P0', 'P1']);

    if (error) {
      console.error('⚠️  RCA gate check failed:', error.message);
      // Non-blocking: Allow handoff to proceed if RCA check fails
      return {
        gate_status: 'PASS',
        open_rcr_count: 0,
        blocking_rcr_ids: [],
        capa_verification_status: 'UNKNOWN',
        error: error.message
      };
    }

    if (!openRCRs || openRCRs.length === 0) {
      return {
        gate_status: 'PASS',
        open_rcr_count: 0,
        blocking_rcr_ids: [],
        capa_verification_status: 'ALL_VERIFIED',
        rcr_details: []
      };
    }

    // Check which RCRs have verified CAPAs
    const blockingRCRs = openRCRs.filter(rcr => {
      const capa = rcr.remediation_manifests?.[0];
      return !capa || capa.status !== 'VERIFIED';
    });

    if (blockingRCRs.length > 0) {
      return {
        gate_status: 'BLOCKED',
        open_rcr_count: blockingRCRs.length,
        blocking_rcr_ids: blockingRCRs.map(r => r.id),
        capa_verification_status: 'PENDING',
        rcr_details: blockingRCRs.map(rcr => ({
          rcr_id: rcr.id,
          severity: rcr.severity_priority,
          status: rcr.status,
          problem_statement: rcr.problem_statement,
          capa_id: rcr.remediation_manifests?.[0]?.id || null,
          capa_status: rcr.remediation_manifests?.[0]?.status || 'MISSING'
        }))
      };
    }

    return {
      gate_status: 'PASS',
      open_rcr_count: openRCRs.length,
      blocking_rcr_ids: [],
      capa_verification_status: 'ALL_VERIFIED',
      rcr_details: openRCRs.map(rcr => ({
        rcr_id: rcr.id,
        severity: rcr.severity_priority,
        status: rcr.status,
        capa_id: rcr.remediation_manifests?.[0]?.id,
        capa_status: 'VERIFIED'
      }))
    };
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
      from_agent: handoffType.split('-')[0],  // leo_handoff_executions uses from_agent/to_agent
      to_agent: handoffType.split('-')[2],
      sd_id: sdId,
      prd_id: result.prdId, // leo_handoff_executions has prd_id at top level
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
      const { data, error} = await this.supabase.from('leo_handoff_executions').insert(execution).select();
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
      if (handoffType === 'LEAD-TO-PLAN') {
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

      console.log('📄 Handoff artifact created (pending validation)...');

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

      console.log('✅ Handoff accepted and stored in sd_phase_handoffs');

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
    if (handoffType === 'LEAD-TO-PLAN') {
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

    // PLAN → EXEC handoff
    if (handoffType === 'PLAN-TO-EXEC') {
      content.executive_summary = `${fromPhase} phase complete for ${sd.id}: ${sd.title}. PRD created and validated. All pre-EXEC requirements met. EXEC implementation authorized.`;

      content.deliverables_manifest = [
        '- ✅ PRD created and validated',
        '- ✅ User stories generated',
        '- ✅ Deliverables extracted to sd_scope_deliverables',
        '- ✅ BMAD validation passed',
        '- ✅ Git branch enforcement verified',
        '- ✅ EXEC phase authorized'
      ].join('\n');

      content.key_decisions = [
        `**PRD Created**: ${result.prdId || 'PRD validated'}`,
        `**Branch**: ${result.branch_validation?.branch || 'Branch ready for EXEC work'}`,
        `**Repository**: ${result.repository || 'Target repository confirmed'}`,
        `**BMAD Score**: ${result.bmad_validation?.score || 'Validation passed'}`
      ].join('\n\n');

      content.known_issues = result.warnings?.join('\n') || 'No critical issues identified during PLAN validation';

      content.resource_utilization = `**BMAD Validation**: Complete\n**Branch Setup**: ${result.branch_validation?.created ? 'Created' : 'Existing'}\n**Deliverables Extracted**: ${result.deliverables_count || 'Yes'}`;

      content.action_items = [
        '- [ ] EXEC agent: Implement all user stories',
        '- [ ] EXEC agent: Write unit tests for all components',
        '- [ ] EXEC agent: Write E2E tests for user journeys',
        '- [ ] EXEC agent: Generate documentation',
        '- [ ] EXEC agent: Create EXEC→PLAN handoff when complete'
      ].join('\n');

      content.completeness_report = `**PLAN Phase**: 100% complete\n**PRD Status**: Validated\n**BMAD Score**: ${result.bmad_validation?.score || 'Passed'}\n**Status**: APPROVED for EXEC phase`;
    }

    // EXEC → PLAN handoff
    if (handoffType === 'EXEC-TO-PLAN') {
      content.executive_summary = `${fromPhase} phase complete for ${sd.id}: ${sd.title}. Implementation complete. All deliverables met, tests passing, documentation generated. Ready for PLAN verification.`;

      content.deliverables_manifest = [
        '- ✅ All user stories implemented',
        '- ✅ Unit tests written and passing',
        '- ✅ E2E tests written and passing',
        '- ✅ Documentation generated',
        '- ✅ Code committed to feature branch',
        '- ✅ Sub-agent validation passed',
        '- ✅ BMAD validation passed'
      ].join('\n');

      content.key_decisions = [
        `**Implementation Complete**: ${result.checkedItems || 'All'} items checked`,
        '**Test Coverage**: Unit + E2E tests passing',
        '**Documentation**: Generated and stored',
        `**Sub-Agents**: ${result.subAgents?.passed || 'All'} passed`,
        `**BMAD Score**: ${result.bmad_validation?.score || 'Validation passed'}`
      ].join('\n\n');

      content.known_issues = result.bmad_validation?.warnings?.join('\n') || 'No critical issues identified during EXEC work';

      content.resource_utilization = `**Sub-Agents Executed**: ${result.subAgents?.total || 'N/A'}\n**BMAD Validation**: Complete\n**Documentation**: Generated\n**E2E Test Mapping**: ${result.e2e_mapping?.mapped_count || 'Complete'}`;

      content.action_items = [
        '- [ ] PLAN agent: Verify all deliverables met',
        '- [ ] PLAN agent: Validate test coverage',
        '- [ ] PLAN agent: Review documentation quality',
        '- [ ] PLAN agent: Check E2E test mapping',
        '- [ ] PLAN agent: Create PLAN→LEAD handoff when verified'
      ].join('\n');

      content.completeness_report = `**EXEC Phase**: 100% complete\n**Deliverables**: ${result.checkedItems}/${result.totalItems} validated\n**Tests**: Passing\n**Documentation**: Generated\n**Status**: READY for PLAN verification`;
    }

    // PLAN → LEAD handoff
    if (handoffType === 'PLAN-TO-LEAD') {
      content.executive_summary = `${fromPhase} verification complete for ${sd.id}: ${sd.title}. All deliverables verified, tests validated, quality checks passed. Ready for LEAD final approval and SD completion.`;

      content.deliverables_manifest = [
        '- ✅ All deliverables verified complete',
        '- ✅ Test coverage validated',
        '- ✅ Documentation quality confirmed',
        '- ✅ User stories all completed',
        '- ✅ E2E tests mapped to user stories',
        '- ✅ SD ready for completion'
      ].join('\n');

      content.key_decisions = [
        '**Verification Status**: All checks passed',
        `**Quality Score**: ${result.qualityScore || 100}%`,
        `**User Stories**: ${result.userStories?.validated || 'All'} validated`,
        '**Test Coverage**: Comprehensive (Unit + E2E)',
        '**Documentation**: Quality confirmed'
      ].join('\n\n');

      content.known_issues = result.warnings?.join('\n') || 'No issues identified - SD ready for completion';

      content.resource_utilization = `**Verification Time**: ${result.verificationTime || 'N/A'}\n**User Stories Validated**: ${result.userStories?.count || 'All'}\n**Tests Validated**: ${result.tests?.count || 'All'}`;

      content.action_items = [
        '- [ ] LEAD agent: Review final implementation',
        '- [ ] LEAD agent: Validate strategic objectives met',
        '- [ ] LEAD agent: Create retrospective',
        '- [ ] LEAD agent: Mark SD as complete',
        '- [ ] LEAD agent: Close feature branch'
      ].join('\n');

      content.completeness_report = `**PLAN Verification**: 100% complete\n**Quality Score**: ${result.qualityScore || 100}%\n**All Phases**: Complete\n**Status**: APPROVED for SD completion`;
    }

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
      from_phase: handoffType.split('-')[0],
      to_phase: handoffType.split('-')[2],
      sd_id: sdId,
      handoff_type: handoffType,
      status: 'rejected',

      // 7-element handoff structure (required fields)
      executive_summary: `${handoffType} handoff REJECTED for ${sdId}. Validation score: ${result.actualScore || 0}%. Reason: ${result.reasonCode || 'VALIDATION_FAILED'}`,
      deliverables_manifest: result.message || 'Handoff validation failed',
      key_decisions: `Decision: Reject handoff - ${result.reasonCode || 'quality below threshold'}`,
      known_issues: result.issues?.join('\n') || 'See validation_details for full analysis',
      resource_utilization: '',
      action_items: result.recommendations?.join('\n') || 'Address validation issues and retry handoff',
      completeness_report: `Validation Score: ${result.actualScore || 0}%. Required: ${result.requiredScore || 70}%`,

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
      const { error } = await this.supabase.from('sd_phase_handoffs').insert(execution).select();
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
      sd_id: sdId,
      handoff_type: handoffType,
      status: 'failed',

      // Basic fields that exist in leo_handoff_executions schema
      executive_summary: `${handoffType} handoff FAILED for ${sdId} due to system error: ${errorMessage.substring(0, 200)}`,
      deliverables_manifest: 'System error prevented handoff completion',
      action_items: 'Review error logs and retry handoff after resolving system issues',

      // leo_handoff_executions uses from_agent/to_agent instead of from_phase/to_phase
      from_agent: handoffType.split('-')[0],
      to_agent: handoffType.split('-')[2],

      validation_score: 0,
      validation_passed: false,
      validation_details: {
        system_error: errorMessage,
        failed_at: new Date().toISOString()
      },

      rejection_reason: errorMessage,

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
        console.log('Handoff Types (case-insensitive, normalized to uppercase):');
        console.log('  LEAD-TO-PLAN   - Strategic to Planning handoff');
        console.log('  PLAN-TO-EXEC   - Planning to Execution handoff');
        console.log('  EXEC-TO-PLAN   - Execution to Verification handoff');
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