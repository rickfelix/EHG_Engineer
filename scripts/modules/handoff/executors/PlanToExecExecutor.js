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
let shouldValidateDesignDatabase;
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

    // Contract Compliance Gate (validates PRD against parent data/UX contracts)
    gates.push({
      name: 'GATE_CONTRACT_COMPLIANCE',
      validator: async (ctx) => {
        console.log('\n📜 CONTRACT COMPLIANCE GATE: Parent Contract Validation');
        console.log('-'.repeat(50));

        // Get PRD for validation
        const sdUuid = sd.uuid_id || sd.id;
        const prd = await this.prdRepo?.getBySdUuid(sdUuid);

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
    // Display pre-handoff warnings from recent retrospectives
    await this._displayPreHandoffWarnings('PLAN_TO_EXEC');

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
   * CREATE HANDOFF RETROSPECTIVE
   *
   * After a successful handoff, prompt for key insights to capture learnings.
   * This creates a retrospective record for continuous improvement.
   */
  async _createHandoffRetrospective(sdId, sd, handoffResult, retrospectiveType, context = {}) {
    try {
      console.log('\n📝 HANDOFF RETROSPECTIVE: Capture Learnings');
      console.log('='.repeat(70));
      console.log('   Handoff successful! Let\'s capture key insights for improvement.');
      console.log('');

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const prompt = (question) => new Promise((resolve) => {
        rl.question(question, resolve);
      });

      // Key questions for PLAN→EXEC handoff
      const questions = [
        'Was the PRD complete enough to start implementation? (1-5, 5=very complete): ',
        'Were user stories actionable and testable? (1-5, 5=very actionable): ',
        'Were validation criteria clear? (1-5, 5=very clear): ',
        'Were any gaps discovered when reviewing for implementation? (describe or "none"): ',
        'Was the test plan adequate? (1-5, 5=excellent): '
      ];

      console.log('   Please answer these quick questions (press Enter to skip):');
      console.log('');

      const answers = [];
      for (const question of questions) {
        const answer = await prompt(`   ${question}`);
        answers.push(answer.trim() || 'N/A');
      }

      rl.close();

      // Parse ratings and gap descriptions
      const [prdRating, storiesRating, validationRating, gapsFound, testPlanRating] = answers;

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

  getRemediation(gateName) {
    const remediations = {
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

    if (!validateContractGate) {
      const { validateContractGate: fn } = await import('../../contract-validation.js');
      validateContractGate = fn;
    }
  }
}

export default PlanToExecExecutor;
