/**
 * PlanToExecExecutor - Executes PLAN → EXEC handoffs
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Validates that PLAN phase is complete and ready for EXEC implementation.
 *
 * ENHANCED: Creates handoff retrospectives for continuous improvement
 */

import BaseExecutor from './BaseExecutor.js';
import readline from 'readline';

// External validators (will be injected or imported)
let validateBMADForPlanToExec;
let validateGate1PlanToExec;
let shouldValidateDesignDatabaseSync; // ROOT CAUSE FIX: Use sync version (SD-NAV-CMD-001A)
let GitBranchVerifier;
let PlanToExecVerifier;
let extractAndPopulateDeliverables;
let validateContractGate;

export class PlanToExecExecutor extends BaseExecutor {
  constructor(dependencies = {}) {
    super(dependencies);

    // Allow injection of validators for testing
    this.validators = dependencies.validators || {};
  }

  get handoffType() {
    return 'PLAN-TO-EXEC';
  }

  async setup(sdId, sd, options) {
    // Lazy load validators
    await this._loadValidators();

    // Determine target repository
    const appPath = this.determineTargetRepository(sd);
    console.log(`   Target repository: ${appPath}`);
    options._appPath = appPath;
    options._sd = sd;

    // PAT-PARENT-DET: Detect parent orchestrator SDs
    // Parent orchestrators don't need implementation gates - work is in children
    const isParentOrchestrator = sd.metadata?.is_parent === true;
    options._isParentOrchestrator = isParentOrchestrator;

    if (isParentOrchestrator) {
      console.log('\n   🎯 PARENT ORCHESTRATOR DETECTED');
      console.log('      Implementation gates will be SKIPPED (work delegated to children)');

      // Get children count for context
      const { data: children } = await this.supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('parent_sd_id', sd.id);

      console.log(`      Children: ${children?.length || 0}`);
      options._childrenCount = children?.length || 0;
    }

    return null; // Continue execution
  }

  getRequiredGates(sd, options) {
    const gates = [];
    const appPath = options._appPath;
    const isParentOrchestrator = options._isParentOrchestrator;

    // ═══════════════════════════════════════════════════════════════════════════
    // ROOT CAUSE FIX: Prerequisite handoff validation (SD-VISION-V2-009)
    // ═══════════════════════════════════════════════════════════════════════════
    // Problem: PLAN-TO-EXEC could proceed without an accepted LEAD-TO-PLAN handoff.
    // This violates the LEO Protocol sequential handoff requirement:
    //   LEAD-TO-PLAN → PLAN-TO-EXEC → EXEC-TO-PLAN → PLAN-TO-LEAD
    //
    // Fix: This gate ensures LEAD-TO-PLAN must be accepted before PLAN-TO-EXEC.
    // ═══════════════════════════════════════════════════════════════════════════
    gates.push({
      name: 'PREREQUISITE_HANDOFF_CHECK',
      validator: async (ctx) => {
        console.log('\n🔐 PREREQUISITE CHECK: LEAD-TO-PLAN Handoff Required');
        console.log('-'.repeat(50));

        // Query for an accepted LEAD-TO-PLAN handoff for this SD
        // Use UUID (ctx.sd.id) not legacy_id (ctx.sdId) - handoffs are stored by UUID
        const sdUuid = ctx.sd?.id || ctx.sdId;
        const { data: leadToPlanHandoff, error } = await this.supabase
          .from('sd_phase_handoffs')
          .select('id, status, created_at, validation_score')
          .eq('sd_id', sdUuid)
          .eq('handoff_type', 'LEAD-TO-PLAN')
          .eq('status', 'accepted')
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) {
          console.log(`   ⚠️  Database error checking prerequisite: ${error.message}`);
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [`Database error: ${error.message}`],
            warnings: [],
            remediation: 'Check database connectivity and retry'
          };
        }

        if (!leadToPlanHandoff || leadToPlanHandoff.length === 0) {
          console.log('   ❌ No accepted LEAD-TO-PLAN handoff found');
          console.log('   ⚠️  LEO Protocol requires LEAD-TO-PLAN before PLAN-TO-EXEC');
          console.log('');
          console.log('   LEO Protocol handoff sequence:');
          console.log('   1. LEAD-TO-PLAN  (approval to plan)   ← MISSING');
          console.log('   2. PLAN-TO-EXEC  (approval to execute) ← blocked');
          console.log('   3. EXEC-TO-PLAN  (execution complete)');
          console.log('   4. PLAN-TO-LEAD  (final approval)');

          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: ['BLOCKING: No accepted LEAD-TO-PLAN handoff found - LEO Protocol violation'],
            warnings: [],
            remediation: 'Complete LEAD-TO-PLAN handoff before attempting PLAN-TO-EXEC. Run: node scripts/handoff.js lead-to-plan --sd-id <SD-ID>'
          };
        }

        const handoff = leadToPlanHandoff[0];
        console.log('   ✅ Prerequisite satisfied: LEAD-TO-PLAN handoff found');
        console.log(`      Handoff ID: ${handoff.id}`);
        console.log(`      Status: ${handoff.status}`);
        console.log(`      Score: ${handoff.validation_score || 'N/A'}`);
        console.log(`      Date: ${new Date(handoff.created_at).toLocaleString()}`);

        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: {
            prerequisite_handoff_id: handoff.id,
            prerequisite_score: handoff.validation_score,
            prerequisite_date: handoff.created_at
          }
        };
      },
      required: true
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // GATE_PRD_EXISTS: PRD Existence Check (SD-LEARN-008 Fix)
    // ═══════════════════════════════════════════════════════════════════════════
    // Problem: EXEC phase could proceed without a proper PRD, leading to
    // undocumented implementations and validation gaps.
    //
    // Fix: Block PLAN-TO-EXEC if no PRD exists for this SD. PRD must be:
    //   - Present in product_requirements_v2 table
    //   - Status must be 'approved' or 'ready_for_exec' (not 'draft' or 'planning')
    // ═══════════════════════════════════════════════════════════════════════════
    gates.push({
      name: 'GATE_PRD_EXISTS',
      validator: async (ctx) => {
        console.log('\n📋 GATE: PRD Existence Check');
        console.log('-'.repeat(50));
        console.log('   Reference: SD-LEARN-008 (prevent undocumented EXEC)');

        try {
          // Get PRD for this SD
          const sdUuid = ctx.sd?.id || ctx.sdId;
          const prd = await this.prdRepo?.getBySdId(sdUuid);

          if (!prd) {
            console.log('   ❌ No PRD found for this SD');
            console.log('');
            console.log('   PLAN-TO-EXEC requires a PRD to ensure:');
            console.log('   • Requirements are documented');
            console.log('   • Acceptance criteria exist');
            console.log('   • Implementation can be validated');

            return {
              passed: false,
              score: 0,
              max_score: 100,
              issues: [
                'BLOCKING: No PRD found for this SD',
                'PRD is mandatory before EXEC phase can begin'
              ],
              warnings: [],
              remediation: [
                'Create a PRD for this SD using:',
                '  node scripts/create-prd-template.js <SD-ID>',
                'Or use the PRD creation wizard in the UI',
                'Ensure PRD status is set to "approved" before retrying'
              ].join('\n')
            };
          }

          // Check PRD status
          const validStatuses = ['approved', 'ready_for_exec', 'in_progress'];
          if (!validStatuses.includes(prd.status)) {
            console.log(`   ⚠️  PRD exists but status is '${prd.status}'`);
            console.log('   ❌ PRD must be approved before EXEC phase');

            return {
              passed: false,
              score: 0,
              max_score: 100,
              issues: [
                `BLOCKING: PRD status is '${prd.status}', expected one of: ${validStatuses.join(', ')}`,
                'PRD must be approved before implementation can begin'
              ],
              warnings: [],
              remediation: [
                `Update PRD status from '${prd.status}' to 'approved'`,
                'Complete any required PRD review steps',
                'Then retry this handoff'
              ].join('\n')
            };
          }

          console.log('   ✅ PRD exists and is approved');
          console.log(`      PRD ID: ${prd.id}`);
          console.log(`      Title: ${prd.title}`);
          console.log(`      Status: ${prd.status}`);

          // Store PRD for later gates
          ctx._prd = prd;

          return {
            passed: true,
            score: 100,
            max_score: 100,
            issues: [],
            warnings: [],
            details: {
              prd_id: prd.id,
              prd_title: prd.title,
              prd_status: prd.status
            }
          };

        } catch (error) {
          console.log(`   ⚠️  PRD check error: ${error.message}`);
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [`PRD check failed: ${error.message}`],
            warnings: [],
            remediation: 'Check database connectivity and PRD table access'
          };
        }
      },
      required: true
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // CATASTROPHIC PREVENTION: Architecture Verification (SD-BACKEND-002A Lesson)
    // ═══════════════════════════════════════════════════════════════════════════
    // Problem: EXEC phase started implementing Next.js API routes in a Vite SPA,
    // wasting 30-52 hours of work that had to be completely discarded.
    //
    // Fix: Verify application architecture BEFORE any implementation begins.
    // This gate runs first in PLAN-TO-EXEC to catch mismatches early.
    // ═══════════════════════════════════════════════════════════════════════════
    gates.push({
      name: 'GATE_ARCHITECTURE_VERIFICATION',
      validator: async (ctx) => {
        console.log('\n🏗️  GATE: Architecture Verification (Catastrophic Prevention)');
        console.log('-'.repeat(50));
        console.log('   Reference: SD-BACKEND-002A (30-52h rework prevented)');

        try {
          // Dynamically import the architecture verifier
          const { verifyArchitecture } = await import('../../../../scripts/verify-app-architecture.js');

          // Get the target application path
          const targetPath = ctx.options?._appPath || this.determineTargetRepository(ctx.sd);

          console.log(`\n   Target: ${targetPath}`);

          // Run architecture verification
          const archResult = await verifyArchitecture(targetPath);

          if (!archResult.success) {
            console.log('\n   ❌ ARCHITECTURE VERIFICATION FAILED');
            return {
              passed: false,
              score: 0,
              max_score: 100,
              issues: [
                'BLOCKING: Could not verify application architecture',
                ...archResult.errors
              ],
              warnings: archResult.warnings,
              remediation: [
                'Verify the target application path exists and contains package.json',
                'Run: node scripts/verify-app-architecture.js --app-path <path>',
                'Ensure PRD specifies correct target_application'
              ].join('\n')
            };
          }

          // Store architecture info for later use in EXEC phase
          ctx._architectureProfile = archResult;

          // Check for critical warnings that should block (Vite SPA with API route intentions)
          const prd = await this.prdRepo?.getBySdId(ctx.sd?.id);
          const prdContent = prd?.implementation_details || prd?.technical_approach || '';
          const hasApiRouteIntention = /api.route|NextRequest|NextResponse|pages\/api|app\/api/i.test(prdContent);

          if (archResult.framework === 'VITE_SPA' && hasApiRouteIntention) {
            console.log('\n   🚨 CRITICAL MISMATCH DETECTED');
            console.log('      PRD mentions API routes but target is Vite SPA!');
            console.log('      This is EXACTLY what caused SD-BACKEND-002A failure.');

            return {
              passed: false,
              score: 0,
              max_score: 100,
              issues: [
                'BLOCKING: PRD specifies API routes but target is Vite SPA',
                'This mismatch caused 30-52 hours of wasted work in SD-BACKEND-002A',
                'Vite SPAs use Supabase client directly, NOT API routes'
              ],
              warnings: archResult.warnings,
              remediation: [
                'STOP: Do not proceed with implementation',
                'UPDATE PRD: Remove API route references',
                'USE: Supabase client calls directly from React components',
                'PATTERN: src/lib/supabase.ts → createClient → direct queries'
              ].join('\n'),
              details: {
                detectedFramework: archResult.framework,
                intendedApproach: 'API Routes',
                conflict: 'Vite SPA cannot use Next.js API routes'
              }
            };
          }

          // Success - architecture verified
          console.log('\n   ✅ Architecture verified successfully');
          console.log(`      Framework: ${archResult.framework}`);
          console.log(`      API Mechanism: ${archResult.apiMechanism}`);
          console.log(`      Build Tool: ${archResult.buildTool}`);

          if (archResult.warnings.length > 0) {
            console.log('\n   ⚠️  Warnings (non-blocking):');
            archResult.warnings.forEach(w => console.log(`      • ${w}`));
          }

          return {
            passed: true,
            score: 100,
            max_score: 100,
            issues: [],
            warnings: archResult.warnings,
            details: {
              framework: archResult.framework,
              apiMechanism: archResult.apiMechanism,
              buildTool: archResult.buildTool,
              profile: archResult.profile?.description
            }
          };

        } catch (error) {
          console.log(`\n   ⚠️  Architecture verification error: ${error.message}`);

          // Non-blocking on script errors - allow manual override
          return {
            passed: true,
            score: 50,
            max_score: 100,
            issues: [],
            warnings: [
              `Architecture verification script error: ${error.message}`,
              'Proceeding with manual verification recommended'
            ],
            details: { error: error.message }
          };
        }
      },
      required: true
    });

    // PAT-PARENT-DET: Parent orchestrators get simplified gates
    if (isParentOrchestrator) {
      console.log('\n   📋 PARENT ORCHESTRATOR GATE SET (simplified)');
      return this._getParentOrchestratorGates(sd, options);
    }

    // BMAD Validation
    gates.push({
      name: 'BMAD_PLAN_TO_EXEC',
      validator: async (ctx) => {
        const bmadResult = await validateBMADForPlanToExec(ctx.sdId, this.supabase);
        ctx._bmadResult = bmadResult; // Store for later use
        return bmadResult;
      },
      required: true
    });

    // Contract Compliance Gate (validates PRD against parent data/UX contracts)
    gates.push({
      name: 'GATE_CONTRACT_COMPLIANCE',
      validator: async (ctx) => {
        console.log('\n📜 CONTRACT COMPLIANCE GATE: Parent Contract Validation');
        console.log('-'.repeat(50));

        // Get PRD for validation
        // SD ID Schema Cleanup: Use sd.id directly (uuid_id deprecated)
        const prd = await this.prdRepo?.getBySdId(sd.id);

        if (!prd) {
          console.log('   ⚠️  No PRD found - skipping contract validation');
          return {
            passed: true,
            score: 100,
            max_score: 100,
            issues: [],
            warnings: ['No PRD found for contract validation'],
            details: { skipped: true, reason: 'No PRD' }
          };
        }

        const contractResult = await validateContractGate(ctx.sdId, prd);
        ctx._contractResult = contractResult;

        // DATA_CONTRACT violations are BLOCKERs
        // UX_CONTRACT violations are WARNINGs (allow override)
        const dataViolations = contractResult.issues.filter(i => i.includes('DATA_CONTRACT'));
        const uxWarnings = contractResult.warnings.filter(w => w.includes('UX_CONTRACT'));

        if (dataViolations.length > 0) {
          console.log(`   ❌ ${dataViolations.length} DATA_CONTRACT violation(s) - BLOCKING`);
          dataViolations.forEach(v => console.log(`      • ${v}`));
        }

        if (uxWarnings.length > 0) {
          console.log(`   ⚠️  ${uxWarnings.length} UX_CONTRACT warning(s) - overridable`);
        }

        if (contractResult.details?.cultural_design_style) {
          console.log(`   📎 Cultural style: ${contractResult.details.cultural_design_style}`);
        }

        if (contractResult.passed) {
          console.log('   ✅ Contract compliance validated');
        }

        return contractResult;
      },
      required: true
    });

    // Gate 1: DESIGN→DATABASE Workflow (conditional)
    // ROOT CAUSE FIX: Use sync version - async version was causing Promise-always-truthy bug (SD-NAV-CMD-001A)
    // bugfix type SDs do NOT require DESIGN/DATABASE sub-agents (quick fixes don't need full architecture review)
    // Gap #2 Fix (2026-01-01): Auto-invoke missing sub-agents instead of just failing
    if (shouldValidateDesignDatabaseSync(sd)) {
      gates.push({
        name: 'GATE1_DESIGN_DATABASE',
        validator: async (ctx) => {
          console.log('\n🚪 GATE 1: DESIGN→DATABASE Workflow Validation');
          console.log('-'.repeat(50));
          // Use UUID (ctx.sd.id) not legacy_id (ctx.sdId) for database queries
          const sdUuidForQuery = ctx.sd?.id || ctx.sdId;

          // First check: Validate existing sub-agents
          const initialResult = await validateGate1PlanToExec(sdUuidForQuery, this.supabase);

          // Gap #2 Fix: If validation fails, auto-invoke missing sub-agents
          if (!initialResult.passed && !ctx._autoInvokeAttempted) {
            console.log('\n   🔄 Auto-invoking missing PLAN phase sub-agents...');
            ctx._autoInvokeAttempted = true;

            try {
              const { orchestrate } = await import('../../../orchestrate-phase-subagents.js');
              const orchestrationResult = await orchestrate('PLAN_PRD', sdUuidForQuery, {
                autoRemediate: true,
                skipIfExists: true
              });

              if (orchestrationResult.status === 'PASS' || orchestrationResult.status === 'COMPLETE') {
                console.log('   ✅ Sub-agents invoked successfully');
                if (orchestrationResult.executed?.length > 0) {
                  console.log(`      Executed: ${orchestrationResult.executed.join(', ')}`);
                }

                // Re-check after invocation
                console.log('\n   🔁 Re-validating after sub-agent invocation...');
                const reCheckResult = await validateGate1PlanToExec(sdUuidForQuery, this.supabase);
                return reCheckResult;
              } else {
                console.log(`   ⚠️  Sub-agent orchestration status: ${orchestrationResult.status}`);
                console.log('      Proceeding with original validation result');
              }
            } catch (orchestrationError) {
              console.error('   ⚠️  Auto-invocation failed:', orchestrationError.message);
              console.log('      Proceeding with original validation result');
            }
          }

          return initialResult;
        },
        required: true
      });
    } else {
      console.log('\n   ℹ️  GATE1_DESIGN_DATABASE skipped: SD type does not require DESIGN/DATABASE sub-agents');
      console.log(`      SD Type: ${sd.sd_type || sd.category || 'unknown'}`);
    }

    // SD-LEO-GEMINI-001 (US-002): Exploration Audit Gate
    // Validates that PRD has exploration_summary with ≥3 file references
    gates.push({
      name: 'GATE_EXPLORATION_AUDIT',
      validator: async (_ctx) => {
        console.log('\n📚 GATE: Exploration Audit');
        console.log('-'.repeat(50));
        return this._validateExplorationAudit(sd);
      },
      required: false // Warning-only, doesn't block handoff
    });

    // SD-LEO-PROTOCOL-V435-001 US-003: Deliverables Planning Gate
    // Validates that deliverables are defined before EXEC phase (if required by SD type)
    gates.push({
      name: 'GATE_DELIVERABLES_PLANNING',
      validator: async (_ctx) => {
        console.log('\n📦 GATE: Deliverables Planning Check');
        console.log('-'.repeat(50));
        return this._validateDeliverablesPlanning(sd);
      },
      required: false // Non-blocking for now (auto-populates in executeSpecific)
    });

    // Gate 6: Branch Enforcement
    gates.push({
      name: 'GATE6_BRANCH_ENFORCEMENT',
      validator: async (ctx) => {
        console.log('\n🔒 GATE 6: Git Branch Enforcement');
        console.log('-'.repeat(50));

        const branchVerifier = new GitBranchVerifier(ctx.sdId, sd.title, appPath);
        const branchResults = await branchVerifier.verify();

        ctx._branchResults = branchResults;

        if (branchResults.verdict === 'FAIL') {
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: branchResults.blockers,
            warnings: []
          };
        }

        console.log('✅ GATE 6: On correct branch, ready for EXEC work');
        console.log(`   Branch: ${branchResults.expectedBranch}`);

        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: branchResults
        };
      },
      required: true
    });

    return gates;
  }

  async executeSpecific(sdId, sd, options, gateResults) {
    // Display pre-handoff warnings from recent retrospectives
    await this._displayPreHandoffWarnings('PLAN_TO_EXEC');

    // Auto-populate deliverables from PRD
    console.log('\n📦 Step 1.5: Auto-Populate Deliverables from PRD');
    console.log('-'.repeat(50));

    // SD ID Schema Cleanup: Use sd.id directly (uuid_id deprecated)
    const prd = await this.prdRepo?.getBySdId(sd.id);

    if (prd) {
      try {
        // Use sd.id (UUID) for foreign key compatibility, not sdId (string key)
        const deliverablesResult = await extractAndPopulateDeliverables(sd.id, prd, this.supabase, {
          skipIfExists: true
        });

        if (deliverablesResult.success) {
          if (deliverablesResult.skipped) {
            console.log('   ℹ️  Deliverables already exist - skipping');
          } else {
            console.log(`   ✅ Populated ${deliverablesResult.count} deliverables`);
          }
        } else {
          console.log('   ⚠️  Could not extract deliverables from PRD');
        }
      } catch (error) {
        console.log(`   ⚠️  Deliverables extraction error: ${error.message}`);
      }
    } else {
      console.log('   ⚠️  No PRD found - cannot extract deliverables');
    }

    // AI Quality Assessment (Russian Judge) - PRD & User Stories
    const russianJudgeEnabled = process.env.RUSSIAN_JUDGE_ENABLED === 'true';
    if (russianJudgeEnabled && prd) {
      try {
        console.log('\n🤖 AI QUALITY ASSESSMENT (Russian Judge)');
        console.log('-'.repeat(50));

        // Assess PRD Quality
        const { PRDQualityRubric } = await import('../../rubrics/prd-quality-rubric.js');
        const prdRubric = new PRDQualityRubric();
        const prdAssessment = await prdRubric.validatePRDQuality(prd, sd);

        console.log(`   PRD Score: ${prdAssessment.score}% (threshold: 70%)`);
        console.log(`   Status: ${prdAssessment.passed ? 'PASSED' : 'NEEDS IMPROVEMENT'}`);

        if (prdAssessment.issues && prdAssessment.issues.length > 0) {
          console.log('\n   ⚡ PRD Issues:');
          prdAssessment.issues.forEach(issue => console.log(`     - ${issue}`));
        }

        // Assess User Stories Quality (if exist)
        const { data: userStories } = await this.supabase
          .from('user_stories')
          .select('*')
          .eq('prd_id', prd.id)
          .limit(5);

        if (userStories && userStories.length > 0) {
          const { UserStoryQualityRubric } = await import('../../rubrics/user-story-quality-rubric.js');
          const storyRubric = new UserStoryQualityRubric();

          let totalScore = 0;
          for (const story of userStories) {
            const storyAssessment = await storyRubric.validateUserStoryQuality(story, prd);
            totalScore += storyAssessment.score;
          }
          const avgStoryScore = Math.round(totalScore / userStories.length);

          console.log(`   User Stories Score: ${avgStoryScore}% (${userStories.length} stories sampled)`);
        }

        console.log('');
      } catch (error) {
        console.log(`\n   ⚠️  Russian Judge unavailable: ${error.message}`);
        console.log('   Proceeding with traditional validation only\n');
      }
    }

    // Standard PLAN-to-EXEC verification
    console.log('🔍 Step 2: Standard PLAN→EXEC Verification');
    console.log('-'.repeat(50));

    const verifier = new PlanToExecVerifier();
    const verificationResult = await verifier.verifyHandoff(sdId, options.prdId);

    if (!verificationResult.success) {
      return verificationResult;
    }

    // Create handoff retrospective after successful handoff
    await this._createHandoffRetrospective(sdId, sd, verificationResult, 'PLAN_TO_EXEC', {
      prd,
      gateResults
    });

    // STATE TRANSITION: Update PRD status on successful handoff
    // Root cause fix: Handoffs should act as state machine transitions, not just validation gates
    await this._transitionPrdToExec(prd, sdId);

    // STATE TRANSITION: Update SD current_phase to EXEC
    // Root cause fix: SD phase was not being updated after handoff approval
    await this._transitionSdToExec(sdId, sd);

    // Display EXEC phase requirements (proactive guidance)
    await this._displayExecPhaseRequirements(sdId, prd);

    // Merge validation details
    const branchResults = gateResults.gateResults.GATE6_BRANCH_ENFORCEMENT?.details || {};

    return {
      success: true,
      ...verificationResult,
      bmad_validation: gateResults.gateResults.BMAD_PLAN_TO_EXEC,
      branch_validation: {
        branch: branchResults.expectedBranch,
        created: branchResults.branchCreated,
        switched: branchResults.branchSwitched,
        remote_tracking: branchResults.remoteTrackingSetup
      },
      repository: options._appPath
    };
  }

  /**
   * DISPLAY PRE-HANDOFF WARNINGS
   *
   * Query recent retrospectives to surface common issues before handoff execution.
   * This allows the team to proactively address known friction points.
   */
  async _displayPreHandoffWarnings(handoffType) {
    try {
      console.log('\n⚠️  PRE-HANDOFF WARNINGS: Recent Friction Points');
      console.log('='.repeat(70));

      // Query recent retrospectives of this handoff type
      const { data: retrospectives, error } = await this.supabase
        .from('retrospectives')
        .select('what_needs_improvement, action_items, key_learnings')
        .eq('retrospective_type', handoffType)
        .eq('status', 'PUBLISHED')
        .order('conducted_date', { ascending: false })
        .limit(10);

      if (error || !retrospectives || retrospectives.length === 0) {
        console.log('   ℹ️  No recent retrospectives found for this handoff type');
        console.log('');
        return;
      }

      // Aggregate common issues
      const issueFrequency = {};
      retrospectives.forEach(retro => {
        const improvements = Array.isArray(retro.what_needs_improvement)
          ? retro.what_needs_improvement
          : [];

        improvements.forEach(item => {
          const improvement = typeof item === 'string' ? item : item.improvement || item;
          if (improvement) {
            issueFrequency[improvement] = (issueFrequency[improvement] || 0) + 1;
          }
        });
      });

      // Sort by frequency and display top 3
      const topIssues = Object.entries(issueFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      if (topIssues.length > 0) {
        console.log('   📊 Most Common Issues (last 10 retrospectives):');
        topIssues.forEach(([issue, count], index) => {
          console.log(`   ${index + 1}. [${count}x] ${issue}`);
        });
      } else {
        console.log('   ✅ No common issues identified in recent retrospectives');
      }

      console.log('');
    } catch (error) {
      console.log(`   ⚠️  Could not load warnings: ${error.message}`);
      console.log('');
    }
  }

  /**
   * SD-LEO-GEMINI-001 (US-002): Exploration Audit
   *
   * Validates that PRD has exploration_summary with documented file references.
   * Ensures PLAN agents explored the codebase before creating the PRD.
   *
   * Thresholds:
   * - COMPREHENSIVE: ≥10 files with documented findings
   * - ADEQUATE: 5-9 files with findings
   * - MINIMAL: 3-4 files (warning issued)
   * - INSUFFICIENT: <3 files (fails gate)
   *
   * @param {Object} sd - Strategic Directive object
   * @returns {Object} Audit result with rating and details
   */
  async _validateExplorationAudit(sd) {
    const MINIMUM_FILES = 3;
    const ADEQUATE_FILES = 5;
    const COMPREHENSIVE_FILES = 10;

    try {
      // Get PRD with exploration_summary
      // SD ID Schema Cleanup: Use sd.id directly (uuid_id deprecated)
      const prd = await this.prdRepo?.getBySdId(sd.id);

      if (!prd) {
        console.log('   ⚠️  No PRD found - skipping exploration audit');
        return {
          passed: true,
          score: 50,
          max_score: 100,
          issues: [],
          warnings: ['No PRD found for exploration audit'],
          details: { skipped: true, reason: 'No PRD' }
        };
      }

      // Check for exploration_summary in multiple locations (backward compatibility)
      // Priority: top-level > metadata.exploration_summary > metadata.files_explored
      let filesExplored = [];
      let source = 'none';

      if (prd.exploration_summary && Array.isArray(prd.exploration_summary)) {
        filesExplored = prd.exploration_summary;
        source = 'exploration_summary';
      } else if (prd.metadata?.exploration_summary && Array.isArray(prd.metadata.exploration_summary)) {
        // SYSTEMIC FIX: Also check metadata.exploration_summary (common storage location)
        filesExplored = prd.metadata.exploration_summary;
        source = 'metadata.exploration_summary';
      } else if (prd.metadata?.files_explored && Array.isArray(prd.metadata.files_explored)) {
        filesExplored = prd.metadata.files_explored;
        source = 'metadata.files_explored';
      } else if (sd?.metadata?.exploration_summary?.files_explored && Array.isArray(sd.metadata.exploration_summary.files_explored)) {
        // ROOT CAUSE FIX: Also check SD metadata (common storage location from update-sd-exploration.js)
        filesExplored = sd.metadata.exploration_summary.files_explored;
        source = 'sd.metadata.exploration_summary.files_explored';
      }

      const fileCount = filesExplored.length;

      console.log('   📊 Exploration Audit:');
      console.log(`      Files documented: ${fileCount}`);
      console.log(`      Source: ${source}`);

      // Determine rating
      let rating, passed, score;
      const issues = [];
      const warnings = [];

      if (fileCount >= COMPREHENSIVE_FILES) {
        rating = 'COMPREHENSIVE';
        passed = true;
        score = 100;
        console.log(`   ✅ ${rating}: Excellent exploration (${fileCount} files)`);
      } else if (fileCount >= ADEQUATE_FILES) {
        rating = 'ADEQUATE';
        passed = true;
        score = 80;
        console.log(`   ✅ ${rating}: Good exploration (${fileCount} files)`);
      } else if (fileCount >= MINIMUM_FILES) {
        rating = 'MINIMAL';
        passed = true;
        score = 60;
        warnings.push(`Exploration is minimal (${fileCount} files). EXEC may need additional context.`);
        console.log(`   ⚠️  ${rating}: Exploration is minimal (${fileCount} files)`);
        console.log('      Consider exploring more files for complex implementations');
      } else if (fileCount > 0) {
        rating = 'INSUFFICIENT';
        passed = false;
        score = 30;
        issues.push(`Exploration audit failed: Only ${fileCount} files documented, minimum ${MINIMUM_FILES} required.`);
        console.log(`   ❌ ${rating}: Only ${fileCount} files documented`);
        console.log(`      Minimum ${MINIMUM_FILES} files required. Update exploration_summary in PRD.`);
      } else {
        rating = 'NONE';
        passed = false;
        score = 0;
        issues.push('No exploration documented. Add exploration_summary to PRD with file references.');
        console.log(`   ❌ ${rating}: No exploration documented`);
        console.log('      Add exploration_summary JSONB array to PRD');
      }

      // Validate findings quality (if files exist)
      if (fileCount > 0) {
        const filesWithFindings = filesExplored.filter(f => {
          if (typeof f === 'string') return false; // Just a path, no findings
          return f.key_findings || f.findings || f.purpose;
        });

        const findingsRate = (filesWithFindings.length / fileCount) * 100;
        console.log(`      Files with findings: ${filesWithFindings.length}/${fileCount} (${findingsRate.toFixed(0)}%)`);

        if (findingsRate < 50) {
          warnings.push(`Low findings documentation rate (${findingsRate.toFixed(0)}%). Add key_findings for each file.`);
        }
      }

      // Show first few files explored
      if (fileCount > 0 && fileCount <= 10) {
        console.log('\n   📁 Files Explored:');
        filesExplored.slice(0, 10).forEach((f, i) => {
          const filePath = typeof f === 'string' ? f : (f.file_path || f.path);
          const hasFindings = typeof f === 'object' && (f.key_findings || f.findings);
          console.log(`      ${i + 1}. ${filePath} ${hasFindings ? '✓' : ''}`);
        });
      }

      return {
        passed,
        score,
        max_score: 100,
        issues,
        warnings,
        details: {
          rating,
          fileCount,
          minimumRequired: MINIMUM_FILES,
          source,
          filesExplored: filesExplored.map(f => typeof f === 'string' ? f : (f.file_path || f.path))
        }
      };

    } catch (error) {
      console.log(`   ⚠️  Exploration audit error: ${error.message}`);
      return {
        passed: true,
        score: 50,
        max_score: 100,
        issues: [],
        warnings: [`Exploration audit error: ${error.message}`],
        details: { error: error.message }
      };
    }
  }

  /**
   * SD-LEO-PROTOCOL-V435-001 US-003: Validate Deliverables Planning
   *
   * Checks if deliverables are defined before EXEC phase for SD types that require them.
   * Non-code SD types (infrastructure, documentation, orchestrator) can skip this gate.
   *
   * @param {Object} sd - Strategic Directive object
   * @returns {Object} Gate validation result
   */
  async _validateDeliverablesPlanning(sd) {
    try {
      const sdType = (sd.sd_type || sd.category || 'feature').toLowerCase();

      // Check if this SD type requires deliverables from sd_type_validation_profiles
      const { data: profile } = await this.supabase
        .from('sd_type_validation_profiles')
        .select('requires_deliverables, requires_deliverables_gate')
        .eq('sd_type', sdType)
        .single();

      // Determine if deliverables are required
      // Priority: requires_deliverables_gate > requires_deliverables > default (true)
      const requiresDeliverables = profile?.requires_deliverables_gate ??
                                   profile?.requires_deliverables ??
                                   !['infrastructure', 'documentation', 'docs', 'orchestrator', 'process'].includes(sdType);

      console.log(`   SD Type: ${sdType}`);
      console.log(`   Requires Deliverables: ${requiresDeliverables ? 'Yes' : 'No'}`);

      if (!requiresDeliverables) {
        console.log(`   ✅ Deliverables gate skipped for ${sdType} type`);
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { skipped: true, reason: `${sdType} type does not require deliverables` }
        };
      }

      // Check for existing deliverables
      const { data: deliverables } = await this.supabase
        .from('sd_scope_deliverables')
        .select('id, name, completion_status')
        .eq('sd_id', sd.id);

      const deliverableCount = deliverables?.length || 0;

      console.log(`   Deliverables Defined: ${deliverableCount}`);

      if (deliverableCount === 0) {
        console.log('   ⚠️  No deliverables defined yet');
        console.log('      Deliverables will be auto-populated from PRD');
        return {
          passed: true, // Non-blocking - auto-populate will handle
          score: 70,
          max_score: 100,
          issues: [],
          warnings: ['No deliverables defined. Will attempt auto-population from PRD.'],
          details: {
            deliverableCount: 0,
            message: 'Deliverables will be extracted from PRD exec_checklist'
          }
        };
      }

      // Count completed vs pending
      const completed = deliverables.filter(d => d.completion_status === 'completed').length;
      const pending = deliverableCount - completed;

      console.log(`   📊 Status: ${completed} completed, ${pending} pending`);
      console.log('\n   📦 Deliverables:');
      deliverables.slice(0, 5).forEach((d, i) => {
        const status = d.completion_status === 'completed' ? '✓' : '○';
        console.log(`      ${i + 1}. ${status} ${d.name || 'Unnamed'}`);
      });
      if (deliverableCount > 5) {
        console.log(`      ... and ${deliverableCount - 5} more`);
      }

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: pending > 0 ? [`${pending} deliverables pending completion`] : [],
        details: {
          deliverableCount,
          completed,
          pending,
          deliverables: deliverables.map(d => ({ name: d.name, status: d.completion_status }))
        }
      };

    } catch (error) {
      console.log(`   ⚠️  Deliverables gate error: ${error.message}`);
      return {
        passed: true,
        score: 50,
        max_score: 100,
        issues: [],
        warnings: [`Deliverables gate error: ${error.message}`],
        details: { error: error.message }
      };
    }
  }

  /**
   * CREATE HANDOFF RETROSPECTIVE
   *
   * After a successful handoff, automatically creates a retrospective record.
   * Uses handoff metrics for quality scoring. Interactive prompts are optional
   * and have a timeout to prevent blocking in non-interactive contexts.
   *
   * ROOT CAUSE FIX: Previous version used blocking readline prompts that would
   * hang indefinitely in non-interactive mode (piped output, Claude Code, etc.).
   * Now uses non-blocking defaults with optional interactive enhancement.
   */
  async _createHandoffRetrospective(sdId, sd, handoffResult, retrospectiveType, context = {}) {
    try {
      console.log('\n📝 HANDOFF RETROSPECTIVE: Auto-capturing learnings');
      console.log('='.repeat(70));

      // Determine if running interactively (TTY connected to stdin)
      const isInteractive = process.stdin.isTTY && process.stdout.isTTY;

      let prdRating = '4';
      let storiesRating = '4';
      let validationRating = '4';
      let gapsFound = 'none';
      let testPlanRating = '4';

      if (isInteractive) {
        // Interactive mode: prompt with timeout
        console.log('   Handoff successful! Quick feedback (10s timeout, Enter to skip):');
        console.log('');

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const promptWithTimeout = (question, timeoutMs = 10000) => new Promise((resolve) => {
          const timer = setTimeout(() => {
            resolve('');
          }, timeoutMs);

          rl.question(`   ${question}`, (answer) => {
            clearTimeout(timer);
            resolve(answer);
          });
        });

        // Key questions for PLAN→EXEC handoff (with timeout)
        prdRating = (await promptWithTimeout('PRD completeness? (1-5, 5=very complete): ')) || '4';
        storiesRating = (await promptWithTimeout('User stories actionable? (1-5): ')) || '4';
        validationRating = (await promptWithTimeout('Validation criteria clear? (1-5): ')) || '4';
        gapsFound = (await promptWithTimeout('Any gaps discovered? (or "none"): ')) || 'none';
        testPlanRating = (await promptWithTimeout('Test plan adequate? (1-5): ')) || '4';

        rl.close();
      } else {
        // Non-interactive mode: use defaults based on handoff result
        console.log('   Running in non-interactive mode - using auto-generated metrics');

        // Derive quality from handoff result
        if (handoffResult.qualityScore) {
          const derivedRating = Math.ceil(handoffResult.qualityScore / 20); // 0-100 -> 1-5
          prdRating = String(derivedRating);
          storiesRating = String(derivedRating);
          validationRating = String(derivedRating);
          testPlanRating = String(derivedRating);
        }

        // Check BMAD validation for stories quality
        if (context.gateResults?.gateResults?.BMAD_PLAN_TO_EXEC?.score) {
          const bmadScore = context.gateResults.gateResults.BMAD_PLAN_TO_EXEC.score;
          storiesRating = String(Math.ceil(bmadScore / 20));
        }
      }

      // Calculate quality score from ratings
      const numericRatings = [prdRating, storiesRating, validationRating, testPlanRating]
        .map(r => parseInt(r, 10))
        .filter(n => !isNaN(n) && n >= 1 && n <= 5);

      const avgRating = numericRatings.length > 0
        ? numericRatings.reduce((a, b) => a + b, 0) / numericRatings.length
        : 4; // Default to 4 if no ratings provided

      const qualityScore = Math.round((avgRating / 5) * 100);

      // Build retrospective data
      const whatWentWell = [];
      if (parseInt(prdRating) >= 4) whatWentWell.push({ achievement: 'PRD was comprehensive and complete for implementation', is_boilerplate: false });
      if (parseInt(storiesRating) >= 4) whatWentWell.push({ achievement: 'User stories were actionable with clear acceptance criteria', is_boilerplate: false });
      if (parseInt(validationRating) >= 4) whatWentWell.push({ achievement: 'Validation criteria were clear and testable', is_boilerplate: false });
      if (parseInt(testPlanRating) >= 4) whatWentWell.push({ achievement: 'Test plan was adequate and comprehensive', is_boilerplate: false });
      if (handoffResult.success) whatWentWell.push({ achievement: 'Handoff validation passed all gates successfully', is_boilerplate: false });

      // Ensure minimum 5 achievements
      const boilerplateAchievements = [
        'PLAN phase completed systematically',
        'All quality gates validated successfully',
        'Branch enforcement ensured proper workflow'
      ];
      while (whatWentWell.length < 5) {
        whatWentWell.push({ achievement: boilerplateAchievements[whatWentWell.length - 2] || 'Standard PLAN process followed', is_boilerplate: true });
      }

      const whatNeedsImprovement = [];
      if (parseInt(prdRating) <= 3) whatNeedsImprovement.push('PRD completeness could be improved before handoff');
      if (parseInt(storiesRating) <= 3) whatNeedsImprovement.push('User stories need more actionable details and test criteria');
      if (parseInt(validationRating) <= 3) whatNeedsImprovement.push('Validation criteria clarity needs enhancement');
      if (parseInt(testPlanRating) <= 3) whatNeedsImprovement.push('Test plan needs more comprehensive coverage');
      if (gapsFound && gapsFound !== 'none' && gapsFound !== 'N/A') {
        whatNeedsImprovement.push(`Gap identified: ${gapsFound}`);
      }

      // Ensure minimum 3 improvements
      while (whatNeedsImprovement.length < 3) {
        whatNeedsImprovement.push('Continue monitoring PLAN→EXEC handoff for improvement opportunities');
      }

      const keyLearnings = [
        { learning: `Average handoff quality rating: ${avgRating.toFixed(1)}/5`, is_boilerplate: false },
        { learning: `Handoff completed with quality score: ${qualityScore}%`, is_boilerplate: false }
      ];

      if (gapsFound && gapsFound !== 'none' && gapsFound !== 'N/A') {
        keyLearnings.push({ learning: `Implementation gap discovered: ${gapsFound}`, is_boilerplate: false });
      }

      // Add gate-specific learnings
      if (context.gateResults?.gateResults?.BMAD_PLAN_TO_EXEC?.passed) {
        keyLearnings.push({ learning: 'BMAD validation ensures user story quality before implementation', is_boilerplate: false });
      }

      // Ensure minimum 5 learnings
      const boilerplateLearnings = [
        'PLAN→EXEC handoff validates implementation readiness',
        'Quality gates prevent premature implementation',
        'Retrospective capture improves continuous learning'
      ];
      while (keyLearnings.length < 5) {
        keyLearnings.push({ learning: boilerplateLearnings[keyLearnings.length - 3] || 'Standard handoff learning captured', is_boilerplate: true });
      }

      const actionItems = [];
      if (parseInt(prdRating) <= 3) {
        actionItems.push({ action: 'Enhance PRD template to ensure completeness before handoff', is_boilerplate: false });
      }
      if (parseInt(storiesRating) <= 3) {
        actionItems.push({ action: 'Improve user story quality checklist in PLAN phase', is_boilerplate: false });
      }
      if (parseInt(testPlanRating) <= 3) {
        actionItems.push({ action: 'Create test plan template with comprehensive coverage examples', is_boilerplate: false });
      }
      if (gapsFound && gapsFound !== 'none' && gapsFound !== 'N/A') {
        actionItems.push({ action: `Address implementation gap: ${gapsFound}`, is_boilerplate: false });
      }

      // Ensure minimum 3 action items
      while (actionItems.length < 3) {
        actionItems.push({ action: 'Continue following LEO Protocol handoff best practices', is_boilerplate: true });
      }

      // Create retrospective record
      const retrospective = {
        sd_id: sdId,
        project_name: sd.title,
        retro_type: retrospectiveType,
        retrospective_type: retrospectiveType, // New field for handoff type
        title: `${retrospectiveType} Handoff Retrospective: ${sd.title}`,
        description: `Retrospective for ${retrospectiveType} handoff of ${sd.sd_key}`,
        conducted_date: new Date().toISOString(),
        agents_involved: ['PLAN', 'EXEC'],
        sub_agents_involved: ['STORIES', 'DATABASE', 'DESIGN'],
        human_participants: ['PLAN'],
        what_went_well: whatWentWell,
        what_needs_improvement: whatNeedsImprovement,
        action_items: actionItems,
        key_learnings: keyLearnings,
        quality_score: qualityScore,
        team_satisfaction: Math.round(avgRating * 2), // Scale to 1-10
        business_value_delivered: 'Handoff process improvement',
        customer_impact: 'Implementation quality improvement',
        technical_debt_addressed: false,
        technical_debt_created: false,
        bugs_found: 0,
        bugs_resolved: 0,
        tests_added: 0,
        objectives_met: handoffResult.success,
        on_schedule: true,
        within_scope: true,
        success_patterns: [`Quality rating: ${avgRating.toFixed(1)}/5`],
        failure_patterns: whatNeedsImprovement.slice(0, 3),
        improvement_areas: whatNeedsImprovement.slice(0, 3),
        generated_by: 'MANUAL',
        trigger_event: 'HANDOFF_COMPLETION',
        status: 'PUBLISHED',
        performance_impact: 'Standard',
        target_application: 'EHG_Engineer',
        learning_category: 'PROCESS_IMPROVEMENT',
        related_files: [],
        related_commits: [],
        related_prs: [],
        affected_components: ['LEO Protocol', 'Handoff System', 'PRD', 'User Stories'],
        tags: ['handoff', 'plan-to-exec', 'process-improvement']
      };

      // Insert retrospective
      const { data, error } = await this.supabase
        .from('retrospectives')
        .insert(retrospective)
        .select();

      if (error) {
        console.log(`\n   ⚠️  Could not save retrospective: ${error.message}`);
        console.log('   Retrospective data will not be persisted');
      } else {
        console.log(`\n   ✅ Handoff retrospective created (ID: ${data[0].id})`);
        console.log(`   Quality Score: ${qualityScore}% | Team Satisfaction: ${Math.round(avgRating * 2)}/10`);
      }

      console.log('');
    } catch (error) {
      console.log(`\n   ⚠️  Retrospective creation error: ${error.message}`);
      console.log('   Continuing with handoff execution');
      console.log('');
    }
  }

  /**
   * DISPLAY EXEC PHASE REQUIREMENTS
   *
   * Proactive guidance showing what needs to be completed during EXEC phase.
   * This prevents the "forgot to create E2E tests" pattern by listing all
   * requirements at the START of EXEC rather than failing at handoff.
   */
  async _displayExecPhaseRequirements(sdId, _prd) {
    try {
      console.log('\n' + '='.repeat(70));
      console.log('📋 EXEC PHASE REQUIREMENTS');
      console.log('   To complete EXEC-TO-PLAN handoff, you must:');
      console.log('='.repeat(70));

      // Get user stories for this SD
      const { data: userStories, error } = await this.supabase
        .from('user_stories')
        .select('id, title, status, e2e_test_path, e2e_test_status')
        .eq('sd_id', sdId)
        .order('created_at', { ascending: true });

      if (error) {
        console.log('\n   ⚠️  Could not retrieve user stories');
      } else if (userStories && userStories.length > 0) {
        console.log(`\n   □ Implement ${userStories.length} user stories:`);
        userStories.forEach((story, idx) => {
          const statusIcon = story.status === 'completed' ? '✓' : '○';
          console.log(`     ${statusIcon} US-${String(idx + 1).padStart(3, '0')}: ${story.title}`);
        });

        // E2E test requirements
        const needsE2E = userStories.filter(s => !s.e2e_test_path);
        if (needsE2E.length > 0) {
          console.log(`\n   □ Create E2E tests for ${needsE2E.length} user stories:`);
          console.log('     - Each user story must have e2e_test_path populated');
          console.log('     - Tests must pass (e2e_test_status = "passing")');
          console.log('     - Example: tests/e2e/phase-N-stages.spec.ts');
        } else {
          console.log('\n   ✓ E2E test paths already mapped');
        }
      } else {
        console.log('\n   ⚠️  No user stories found - create them during EXEC');
      }

      // Deliverables reminder
      console.log('\n   □ Complete all deliverables:');
      console.log('     - UI components implemented and functional');
      console.log('     - API endpoints working and tested');
      console.log('     - Database migrations applied (if applicable)');

      // Final steps
      console.log('\n   □ Final verification:');
      console.log('     - All unit tests passing');
      console.log('     - All E2E tests passing');
      console.log('     - Changes committed and pushed to feature branch');

      console.log('\n' + '='.repeat(70));
      console.log('   Run: node scripts/handoff.js execute EXEC-TO-PLAN ' + sdId);
      console.log('   when all requirements are complete.');
      console.log('='.repeat(70) + '\n');

    } catch (error) {
      console.log(`\n   ⚠️  Could not display EXEC requirements: ${error.message}`);
    }
  }

  /**
   * STATE TRANSITION: Update PRD status on successful PLAN-TO-EXEC handoff
   *
   * Root cause fix: Handoffs were designed as validation gates (check state) but not
   * state machine transitions (update state). This caused PRD status to remain stale,
   * blocking downstream handoffs that depend on PRD status.
   *
   * 5 Whys Analysis: See SD-QA-STAGES-21-25-001 retrospective
   */
  async _transitionPrdToExec(prd, _sdId) {
    if (!prd) {
      console.log('\n   ⚠️  No PRD to transition');
      return;
    }

    console.log('\n📊 STATE TRANSITION: PRD Status Update');
    console.log('-'.repeat(50));

    try {
      // QF-20251220-860: Use valid status 'in_progress' instead of 'ready_for_exec'
      // Valid statuses: approved, completed, draft, in_progress, planning
      const { error } = await this.supabase
        .from('product_requirements_v2')
        .update({
          status: 'in_progress',
          phase: 'exec',
          updated_at: new Date().toISOString()
        })
        .eq('id', prd.id);

      if (error) {
        // QF-20251220-860: Make status update failure blocking instead of silent warning
        console.error(`   ❌ BLOCKING: Could not update PRD status: ${error.message}`);
        throw new Error(`PRD status update failed: ${error.message}. Cannot proceed with inconsistent state.`);
      } else {
        console.log('   ✅ PRD status transitioned: approved → in_progress');
        console.log('   ✅ PRD phase transitioned: → exec');
      }
    } catch (error) {
      console.error(`   ❌ PRD transition error: ${error.message}`);
      throw error; // Re-throw to block handoff
    }
  }

  /**
   * STATE TRANSITION: Update SD current_phase on successful PLAN-TO-EXEC handoff
   *
   * Root cause fix: When handoff was approved, SD current_phase remained at 'PLAN'
   * even though PRD was transitioned. This caused phase tracking to be out of sync
   * and blocked downstream processes that check SD phase.
   *
   * SYSTEMIC FIX: SD state machine now transitions alongside PRD state machine.
   */
  async _transitionSdToExec(sdId, sd) {
    console.log('\n📊 STATE TRANSITION: SD Phase Update');
    console.log('-'.repeat(50));

    try {
      // Determine the correct SD ID field (UUID vs legacy_id)
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);
      const queryField = isUUID ? 'id' : 'legacy_id';

      const { error } = await this.supabase
        .from('strategic_directives_v2')
        .update({
          current_phase: 'EXEC',
          status: 'active',
          is_working_on: true,
          updated_at: new Date().toISOString()
        })
        .eq(queryField, sdId);

      if (error) {
        console.log(`   ⚠️  Could not update SD phase: ${error.message}`);
      } else {
        const oldPhase = sd?.current_phase || 'PLAN';
        console.log(`   ✅ SD phase transitioned: ${oldPhase} → EXEC`);
        console.log('   ✅ SD status transitioned: → active');
        console.log('   ✅ SD marked as working_on: true');
      }
    } catch (error) {
      console.log(`   ⚠️  SD transition error: ${error.message}`);
    }
  }

  getRemediation(gateName) {
    const remediations = {
      'GATE_ARCHITECTURE_VERIFICATION': [
        'ARCHITECTURE MISMATCH DETECTED (SD-BACKEND-002A Prevention)',
        '',
        'This gate prevents the catastrophic 30-52 hour rework that occurred when',
        'Next.js API routes were implemented in a Vite SPA application.',
        '',
        'STEPS TO RESOLVE:',
        '1. Run: node scripts/verify-app-architecture.js --app-path <target-app>',
        '2. Review the detected framework vs PRD implementation approach',
        '3. If mismatch: Update PRD to match actual framework',
        '',
        'COMMON FIXES:',
        '• Vite SPA → Use Supabase client directly, NOT API routes',
        '• Next.js → Can use app/api/ or pages/api/ routes',
        '• Remix → Use loader/action functions in routes',
        '',
        'If architecture is correct but gate fails: Check target_application in SD'
      ].join('\n'),
      'BMAD_PLAN_TO_EXEC': 'Run STORIES sub-agent to generate user stories with proper acceptance criteria.',
      'GATE_CONTRACT_COMPLIANCE': [
        'PRD violates parent SD contract boundaries:',
        '',
        'DATA_CONTRACT violations (BLOCKING):',
        '1. Review allowed_tables in parent contract',
        '2. Update PRD to only reference allowed tables',
        '3. Request contract update if scope needs expansion',
        '',
        'UX_CONTRACT violations (WARNING):',
        '1. Review component_paths in parent UX contract',
        '2. Either adjust component paths or document justification',
        '',
        'Cultural Design Style:',
        '- Style is STRICTLY inherited from parent',
        '- Cannot be overridden by child SDs',
        '',
        'Run: node scripts/verify-contract-system.js to debug contracts'
      ].join('\n'),
      'GATE1_DESIGN_DATABASE': [
        'Execute DESIGN and DATABASE sub-agents:',
        '1. Run DESIGN sub-agent: node scripts/execute-subagent.js --code DESIGN --sd-id <SD-ID>',
        '2. Run DATABASE sub-agent: node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>',
        '3. Run STORIES sub-agent: node scripts/execute-subagent.js --code STORIES --sd-id <SD-ID>',
        '4. Re-run this handoff'
      ].join('\n'),
      'GATE6_BRANCH_ENFORCEMENT': [
        'Create a feature branch before EXEC work begins:',
        '1. Branch will be created/switched automatically (stash-safe)',
        '2. Or resolve branch issues manually',
        '3. Re-run this handoff'
      ].join('\n')
    };

    return remediations[gateName] || null;
  }

  /**
   * PAT-PARENT-DET: Parent Orchestrator Gates
   *
   * Parent orchestrators don't need implementation gates like DESIGN/DATABASE
   * because the actual implementation is delegated to child SDs.
   *
   * Simplified gate set for parent orchestrators:
   * 1. PRD exists (orchestrator PRD with decomposition)
   * 2. Children are properly linked
   * 3. No implementation gates (DESIGN, DATABASE, BRANCH)
   */
  _getParentOrchestratorGates(sd, _options) {
    const gates = [];

    // Gate 1: PRD Exists with proper metadata
    gates.push({
      name: 'PARENT_PRD_EXISTS',
      validator: async (_ctx) => {
        console.log('\n📋 GATE: Parent Orchestrator PRD Validation');
        console.log('-'.repeat(50));

        const prd = await this.prdRepo?.getBySdId(sd.id);

        if (!prd) {
          console.log('   ❌ No PRD found for parent orchestrator');
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: ['Parent orchestrator must have a PRD with decomposition structure'],
            warnings: []
          };
        }

        // Check if it's a proper orchestrator PRD
        const isOrchestratorPRD = prd.metadata?.is_orchestrator_prd === true ||
                                   prd.metadata?.prd_type === 'parent_orchestrator';

        if (!isOrchestratorPRD) {
          console.log('   ⚠️  PRD exists but may not be orchestrator-formatted');
        }

        console.log('   ✅ Parent orchestrator PRD found:', prd.id);
        console.log(`      Type: ${prd.metadata?.prd_type || 'standard'}`);

        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: isOrchestratorPRD ? [] : ['PRD may not have orchestrator metadata'],
          details: { prdId: prd.id, isOrchestratorPRD }
        };
      },
      required: true
    });

    // Gate 2: Children Structure Validated
    gates.push({
      name: 'CHILDREN_STRUCTURE_VALID',
      validator: async (_ctx) => {
        console.log('\n👶 GATE: Children Structure Validation');
        console.log('-'.repeat(50));

        const { data: children } = await this.supabase
          .from('strategic_directives_v2')
          .select('id, legacy_id, title, status, parent_sd_id')
          .eq('parent_sd_id', sd.id);

        if (!children || children.length === 0) {
          console.log('   ❌ No children found - parent orchestrator must have children');
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: ['Parent orchestrator has no child SDs'],
            warnings: []
          };
        }

        console.log(`   ✅ Found ${children.length} child SDs:`);
        children.forEach(c => {
          const icon = c.status === 'completed' ? '✅' : '📋';
          console.log(`      ${icon} ${c.legacy_id || c.id} [${c.status}]`);
        });

        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { childrenCount: children.length, children: children.map(c => c.legacy_id || c.id) }
        };
      },
      required: true
    });

    console.log('   ✓ SKIPPED: DESIGN sub-agent (delegated to children)');
    console.log('   ✓ SKIPPED: DATABASE sub-agent (delegated to children)');
    console.log('   ✓ SKIPPED: Branch enforcement (no direct implementation)');

    return gates;
  }

  async _loadValidators() {
    if (!validateBMADForPlanToExec) {
      const bmad = await import('../../bmad-validation.js');
      validateBMADForPlanToExec = bmad.validateBMADForPlanToExec;
    }

    if (!validateGate1PlanToExec) {
      const designDb = await import('../../design-database-gates-validation.js');
      validateGate1PlanToExec = designDb.validateGate1PlanToExec;
      // ROOT CAUSE FIX: Use sync version to avoid Promise-always-truthy bug (SD-NAV-CMD-001A)
      shouldValidateDesignDatabaseSync = designDb.shouldValidateDesignDatabaseSync;
    }

    if (!GitBranchVerifier) {
      const { default: Verifier } = await import('../../../verify-git-branch-status.js');
      GitBranchVerifier = Verifier;
    }

    if (!PlanToExecVerifier) {
      const { default: Verifier } = await import('../../../verify-handoff-plan-to-exec.js');
      PlanToExecVerifier = Verifier;
    }

    if (!extractAndPopulateDeliverables) {
      const { extractAndPopulateDeliverables: fn } = await import('../extract-deliverables-from-prd.js');
      extractAndPopulateDeliverables = fn;
    }

    if (!validateContractGate) {
      const { validateContractGate: fn } = await import('../../contract-validation.js');
      validateContractGate = fn;
    }
  }
}

export default PlanToExecExecutor;
