/**
 * PlanToExecExecutor - Executes PLAN → EXEC handoffs
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Validates that PLAN phase is complete and ready for EXEC implementation.
 */

import BaseExecutor from './BaseExecutor.js';

// External validators (will be injected or imported)
let validateBMADForPlanToExec;
let validateGate1PlanToExec;
let shouldValidateDesignDatabase;
let GitBranchVerifier;
let PlanToExecVerifier;
let extractAndPopulateDeliverables;

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

    return null; // Continue execution
  }

  getRequiredGates(sd, options) {
    const gates = [];
    const appPath = options._appPath;

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

    // Gate 1: DESIGN→DATABASE Workflow (conditional)
    if (shouldValidateDesignDatabase(sd)) {
      gates.push({
        name: 'GATE1_DESIGN_DATABASE',
        validator: async (ctx) => {
          console.log('\n🚪 GATE 1: DESIGN→DATABASE Workflow Validation');
          console.log('-'.repeat(50));
          return validateGate1PlanToExec(ctx.sdId, this.supabase);
        },
        required: true
      });
    }

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
    // Auto-populate deliverables from PRD
    console.log('\n📦 Step 1.5: Auto-Populate Deliverables from PRD');
    console.log('-'.repeat(50));

    const sdUuid = sd.uuid_id || sd.id;
    const prd = await this.prdRepo?.getBySdUuid(sdUuid);

    if (prd) {
      try {
        const deliverablesResult = await extractAndPopulateDeliverables(sdId, prd, this.supabase, {
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

    // Standard PLAN-to-EXEC verification
    console.log('\n🔍 Step 2: Standard PLAN→EXEC Verification');
    console.log('-'.repeat(50));

    const verifier = new PlanToExecVerifier();
    const verificationResult = await verifier.verifyHandoff(sdId, options.prdId);

    if (!verificationResult.success) {
      return verificationResult;
    }

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

  getRemediation(gateName) {
    const remediations = {
      'BMAD_PLAN_TO_EXEC': 'Run STORIES sub-agent to generate user stories with proper acceptance criteria.',
      'GATE1_DESIGN_DATABASE': [
        'Execute DESIGN and DATABASE sub-agents:',
        '1. Run DESIGN sub-agent: node lib/sub-agent-executor.js DESIGN <SD-ID>',
        '2. Run DATABASE sub-agent: node lib/sub-agent-executor.js DATABASE <SD-ID>',
        '3. Run STORIES sub-agent: node lib/sub-agent-executor.js STORIES <SD-ID>',
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

  async _loadValidators() {
    if (!validateBMADForPlanToExec) {
      const bmad = await import('../../bmad-validation.js');
      validateBMADForPlanToExec = bmad.validateBMADForPlanToExec;
    }

    if (!validateGate1PlanToExec) {
      const designDb = await import('../../design-database-gates-validation.js');
      validateGate1PlanToExec = designDb.validateGate1PlanToExec;
      shouldValidateDesignDatabase = designDb.shouldValidateDesignDatabase;
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
  }
}

export default PlanToExecExecutor;
