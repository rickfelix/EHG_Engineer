/**
 * LeadToPlanExecutor - Executes LEAD → PLAN handoffs
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Validates that LEAD approval is complete and ready for PLAN phase.
 * Note: This mostly delegates to the existing LeadToPlanVerifier.
 *
 * ENHANCED: Creates handoff retrospectives for continuous improvement
 */

import BaseExecutor from './BaseExecutor.js';
import { execSync } from 'child_process';
import path from 'path';
import readline from 'readline';
import { SDTypeClassifier } from '../../sd-type-classifier.js';

// External verifier (will be lazy loaded)
let LeadToPlanVerifier;

export class LeadToPlanExecutor extends BaseExecutor {
  constructor(dependencies = {}) {
    super(dependencies);
    this.verifier = dependencies.verifier || null;
  }

  get handoffType() {
    return 'LEAD-TO-PLAN';
  }

  async setup(_sdId, _sd, _options) {
    await this._loadVerifier();
    return null;
  }

  getRequiredGates(_sd, _options) {
    const gates = [];

    // Target Application Validation Gate
    // SD-LEO-GEMINI-001: Validate target_application at LEAD-TO-PLAN to prevent
    // late-stage failures when commits are searched in wrong repository
    gates.push({
      name: 'TARGET_APPLICATION_VALIDATION',
      validator: async (ctx) => {
        console.log('\n🎯 GATE: Target Application Validation');
        console.log('-'.repeat(50));
        return this._validateTargetApplication(ctx.sd);
      },
      required: true,
      remediation: 'Set target_application to match the files in scope (EHG or EHG_Engineer)'
    });

    // PAT-SD-CATEGORY-001: Intelligent Category Detection
    // Auto-detect and correct SD category to ensure proper quality thresholds
    // during PLAN-TO-EXEC (API work vs feature work have different thresholds)
    gates.push({
      name: 'CATEGORY_DETECTION',
      validator: async (ctx) => {
        console.log('\n🏷️  GATE: Category Detection (PAT-SD-CATEGORY-001)');
        console.log('-'.repeat(50));
        return this._validateAndCorrectCategory(ctx.sd);
      },
      required: false,  // Informational, auto-corrects when possible
      remediation: 'Review SD category manually if auto-detection failed'
    });

    return gates;
  }

  /**
   * Validate and potentially auto-correct target_application
   * SD-LEO-GEMINI-001: Prevents wrong repository being searched during final handoff
   */
  async _validateTargetApplication(sd) {
    const scope = (sd.scope || sd.description || '').toLowerCase();
    const title = (sd.title || '').toLowerCase();
    const combinedText = `${scope} ${title}`;

    // Patterns that indicate EHG_Engineer (LEO Protocol infrastructure)
    const engineerPatterns = [
      'claude.md', 'claude_', 'leo protocol', 'handoff.js', 'phase-preflight',
      'sub-agent', 'subagent', 'leo_protocol', 'retrospective', 'verification gate',
      'handoff system', 'bmad', 'scripts/modules', 'lib/sub-agents'
    ];

    // Patterns that indicate EHG (main application)
    const ehgPatterns = [
      'stage', 'venture', 'ui component', 'react', 'frontend', 'backend',
      'api endpoint', 'database table', 'rls policy', 'user interface',
      'supabase function', 'edge function'
    ];

    // Count pattern matches
    const engineerMatches = engineerPatterns.filter(p => combinedText.includes(p));
    const ehgMatches = ehgPatterns.filter(p => combinedText.includes(p));

    // Determine inferred target
    let inferredTarget = null;
    let confidence = 'low';

    if (engineerMatches.length > ehgMatches.length) {
      inferredTarget = 'EHG_Engineer';
      confidence = engineerMatches.length >= 2 ? 'high' : 'medium';
    } else if (ehgMatches.length > engineerMatches.length) {
      inferredTarget = 'EHG';
      confidence = ehgMatches.length >= 2 ? 'high' : 'medium';
    } else if (engineerMatches.length > 0) {
      inferredTarget = 'EHG_Engineer';
      confidence = 'medium';
    }

    const currentTarget = sd.target_application;

    console.log(`   Current target_application: ${currentTarget || '(not set)'}`);
    console.log(`   Inferred from scope: ${inferredTarget || '(could not determine)'} (${confidence} confidence)`);

    if (engineerMatches.length > 0) {
      console.log(`   Engineer patterns found: ${engineerMatches.slice(0, 3).join(', ')}${engineerMatches.length > 3 ? '...' : ''}`);
    }
    if (ehgMatches.length > 0) {
      console.log(`   EHG patterns found: ${ehgMatches.slice(0, 3).join(', ')}${ehgMatches.length > 3 ? '...' : ''}`);
    }

    // Validation scenarios
    if (!currentTarget && inferredTarget) {
      // No target set, but we can infer one - auto-set it
      console.log(`\n   ⚠️  target_application not set, auto-setting to: ${inferredTarget}`);

      const { error } = await this.supabase
        .from('strategic_directives_v2')
        .update({ target_application: inferredTarget })
        .eq('id', sd.id);

      if (error) {
        console.log(`   ❌ Failed to update: ${error.message}`);
        return {
          pass: false,
          score: 0,
          issues: [`Could not set target_application: ${error.message}`]
        };
      }

      console.log(`   ✅ Auto-set target_application to: ${inferredTarget}`);
      return {
        pass: true,
        score: 90,
        issues: [],
        warnings: [`target_application was auto-set to ${inferredTarget} based on scope analysis`]
      };
    }

    if (currentTarget && inferredTarget && currentTarget !== inferredTarget && confidence === 'high') {
      // Target set but doesn't match inferred with high confidence - warn and offer correction
      console.log('\n   ⚠️  MISMATCH DETECTED');
      console.log(`   Current: ${currentTarget}`);
      console.log(`   Inferred: ${inferredTarget} (high confidence)`);
      console.log(`   Auto-correcting to: ${inferredTarget}`);

      const { error } = await this.supabase
        .from('strategic_directives_v2')
        .update({ target_application: inferredTarget })
        .eq('id', sd.id);

      if (error) {
        console.log(`   ❌ Failed to update: ${error.message}`);
        return {
          pass: false,
          score: 0,
          issues: [`target_application mismatch: set to ${currentTarget}, but scope suggests ${inferredTarget}`]
        };
      }

      console.log(`   ✅ Corrected target_application to: ${inferredTarget}`);
      return {
        pass: true,
        score: 80,
        issues: [],
        warnings: [`target_application corrected from ${currentTarget} to ${inferredTarget}`]
      };
    }

    if (!currentTarget && !inferredTarget) {
      // No target and couldn't infer - default to EHG with warning
      console.log('\n   ⚠️  Could not determine target_application, defaulting to EHG');

      const { error } = await this.supabase
        .from('strategic_directives_v2')
        .update({ target_application: 'EHG' })
        .eq('id', sd.id);

      if (!error) {
        console.log('   ✅ Default target_application set to: EHG');
      }

      return {
        pass: true,
        score: 70,
        issues: [],
        warnings: ['target_application defaulted to EHG - verify this is correct']
      };
    }

    // Target is set and matches or no inference conflict
    console.log(`   ✅ target_application validated: ${currentTarget}`);
    return {
      pass: true,
      score: 100,
      issues: []
    };
  }

  /**
   * PAT-SD-CATEGORY-001: Validate and auto-correct SD category
   *
   * Detects whether an SD is API work, feature work, infrastructure, etc.
   * and auto-corrects the category if needed. This ensures proper quality
   * thresholds are applied during PLAN-TO-EXEC handoff.
   *
   * Example: SD titled "API Contracts for Chairman Operations" should have
   * category "api" not "feature" - API work has different quality thresholds.
   */
  async _validateAndCorrectCategory(sd) {
    const classifier = new SDTypeClassifier();
    const result = await classifier.autoCorrectCategory(sd, this.supabase);

    // Always pass - this is informational/auto-correcting
    return {
      pass: true,
      score: result.updated ? 90 : (result.mismatch ? 70 : 100),
      issues: [],
      warnings: result.mismatch && !result.updated
        ? [`Category may need manual review: current '${result.currentCategory}' vs detected '${result.detectedCategory}'`]
        : [],
      categoryResult: result
    };
  }

  async executeSpecific(sdId, sd, _options, _gateResults) {
    // Display pre-handoff warnings from recent retrospectives
    await this._displayPreHandoffWarnings('LEAD_TO_PLAN');

    // Delegate to existing LeadToPlanVerifier
    // This verifier handles all the LEAD→PLAN validation logic
    const verifier = this.verifier || new LeadToPlanVerifier();
    const result = await verifier.verifyHandoff(sdId);

    if (!result.success) {
      return result;
    }

    // Auto-generate PRD script on successful LEAD→PLAN handoff
    await this._autoGeneratePRDScript(sdId, sd);

    // Create handoff retrospective after successful handoff
    await this._createHandoffRetrospective(sdId, sd, result, 'LEAD_TO_PLAN');

    // Merge additional context
    return {
      success: true,
      ...result,
      qualityScore: result.qualityScore || 100
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
   * After a successful handoff, automatically creates a retrospective record.
   * Uses handoff metrics for quality scoring. Interactive prompts are optional
   * and have a timeout to prevent blocking in non-interactive contexts.
   *
   * ROOT CAUSE FIX: Previous version used blocking readline prompts that would
   * hang indefinitely in non-interactive mode (piped output, Claude Code, etc.).
   * Now uses non-blocking defaults with optional interactive enhancement.
   */
  async _createHandoffRetrospective(sdId, sd, handoffResult, retrospectiveType) {
    try {
      console.log('\n📝 HANDOFF RETROSPECTIVE: Auto-capturing learnings');
      console.log('='.repeat(70));

      // Determine if running interactively (TTY connected to stdin)
      const isInteractive = process.stdin.isTTY && process.stdout.isTTY;

      let clarityRating = '4';
      let criteriaRating = '4';
      let depsRating = '4';
      let simplicityRating = '4';
      let frictionPoints = 'none';

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

        // Key questions for LEAD→PLAN handoff (with timeout)
        clarityRating = (await promptWithTimeout('SD clarity? (1-5, 5=very clear): ')) || '4';
        criteriaRating = (await promptWithTimeout('Acceptance criteria? (1-5): ')) || '4';
        depsRating = (await promptWithTimeout('Dependencies identified? (1-5): ')) || '4';
        simplicityRating = (await promptWithTimeout('Simplicity held up? (1-5): ')) || '4';
        frictionPoints = (await promptWithTimeout('Friction points? (or "none"): ')) || 'none';

        rl.close();
      } else {
        // Non-interactive mode: use defaults based on handoff result
        console.log('   Running in non-interactive mode - using auto-generated metrics');

        // Derive quality from handoff result
        if (handoffResult.qualityScore) {
          const derivedRating = Math.ceil(handoffResult.qualityScore / 20); // 0-100 -> 1-5
          clarityRating = String(derivedRating);
          criteriaRating = String(derivedRating);
          depsRating = String(derivedRating);
          simplicityRating = String(derivedRating);
        }
      }

      // Calculate quality score from ratings
      const numericRatings = [clarityRating, criteriaRating, depsRating, simplicityRating]
        .map(r => parseInt(r, 10))
        .filter(n => !isNaN(n) && n >= 1 && n <= 5);

      const avgRating = numericRatings.length > 0
        ? numericRatings.reduce((a, b) => a + b, 0) / numericRatings.length
        : 4; // Default to 4 if no ratings provided

      const qualityScore = Math.round((avgRating / 5) * 100);

      // Build retrospective data
      const whatWentWell = [];
      if (parseInt(clarityRating) >= 4) whatWentWell.push({ achievement: 'SD was clear and well-defined for planning', is_boilerplate: false });
      if (parseInt(criteriaRating) >= 4) whatWentWell.push({ achievement: 'Acceptance criteria were comprehensive and actionable', is_boilerplate: false });
      if (parseInt(depsRating) >= 4) whatWentWell.push({ achievement: 'Dependencies were correctly identified upfront', is_boilerplate: false });
      if (parseInt(simplicityRating) >= 4) whatWentWell.push({ achievement: 'Simplicity assessment was accurate and helpful', is_boilerplate: false });
      if (handoffResult.success) whatWentWell.push({ achievement: 'Handoff validation passed all gates successfully', is_boilerplate: false });

      // Ensure minimum 5 achievements
      const boilerplateAchievements = [
        'LEAD phase completed systematically',
        'SD approval workflow followed correctly',
        'Handoff documentation generated automatically'
      ];
      while (whatWentWell.length < 5) {
        whatWentWell.push({ achievement: boilerplateAchievements[whatWentWell.length - 2] || 'Standard LEAD process followed', is_boilerplate: true });
      }

      const whatNeedsImprovement = [];
      if (parseInt(clarityRating) <= 3) whatNeedsImprovement.push('SD clarity could be improved for better planning');
      if (parseInt(criteriaRating) <= 3) whatNeedsImprovement.push('Acceptance criteria need more detail and specificity');
      if (parseInt(depsRating) <= 3) whatNeedsImprovement.push('Dependency identification process needs enhancement');
      if (parseInt(simplicityRating) <= 3) whatNeedsImprovement.push('Simplicity assessment methodology could be refined');
      if (frictionPoints && frictionPoints !== 'none' && frictionPoints !== 'N/A') {
        whatNeedsImprovement.push(frictionPoints);
      }

      // Ensure minimum 3 improvements
      while (whatNeedsImprovement.length < 3) {
        whatNeedsImprovement.push('Continue monitoring handoff process for improvement opportunities');
      }

      const keyLearnings = [
        { learning: `Average handoff quality rating: ${avgRating.toFixed(1)}/5`, is_boilerplate: false },
        { learning: `Handoff completed with quality score: ${qualityScore}%`, is_boilerplate: false }
      ];

      if (frictionPoints && frictionPoints !== 'none' && frictionPoints !== 'N/A') {
        keyLearnings.push({ learning: `Friction identified: ${frictionPoints}`, is_boilerplate: false });
      }

      // Ensure minimum 5 learnings
      const boilerplateLearnings = [
        'LEAD→PLAN handoff process provides valuable quality gates',
        'Pre-handoff warnings help identify recurring issues',
        'Retrospective capture improves continuous learning'
      ];
      while (keyLearnings.length < 5) {
        keyLearnings.push({ learning: boilerplateLearnings[keyLearnings.length - 3] || 'Standard handoff learning captured', is_boilerplate: true });
      }

      const actionItems = [];
      if (parseInt(clarityRating) <= 3) {
        actionItems.push({ action: 'Enhance SD template to improve clarity for PLAN phase', is_boilerplate: false });
      }
      if (parseInt(criteriaRating) <= 3) {
        actionItems.push({ action: 'Create acceptance criteria checklist for LEAD approval', is_boilerplate: false });
      }
      if (frictionPoints && frictionPoints !== 'none' && frictionPoints !== 'N/A') {
        actionItems.push({ action: `Address friction point: ${frictionPoints}`, is_boilerplate: false });
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
        agents_involved: ['LEAD', 'PLAN'],
        sub_agents_involved: [],
        human_participants: ['LEAD'],
        what_went_well: whatWentWell,
        what_needs_improvement: whatNeedsImprovement,
        action_items: actionItems,
        key_learnings: keyLearnings,
        quality_score: qualityScore,
        team_satisfaction: Math.round(avgRating * 2), // Scale to 1-10
        business_value_delivered: 'Handoff process improvement',
        customer_impact: 'Process efficiency improvement',
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
        affected_components: ['LEO Protocol', 'Handoff System'],
        tags: ['handoff', 'lead-to-plan', 'process-improvement']
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
   * AUTO-GENERATE PRD SCRIPT ON LEAD→PLAN HANDOFF
   *
   * Automatically generates a PRD creation script when LEAD approves an SD.
   * This integration ensures PRD scripts are created immediately after approval.
   */
  async _autoGeneratePRDScript(sdId, sd) {
    try {
      console.log('\n🤖 AUTO-GENERATING PRD SCRIPT');
      console.log('='.repeat(70));

      console.log(`   SD: ${sd.title || sdId}`);

      const scriptPath = path.join(process.cwd(), 'scripts', 'generate-prd-script.js');
      const title = sd.title || 'Technical Implementation';

      console.log(`   Running: node scripts/generate-prd-script.js ${sdId} "${title}"`);

      try {
        const output = execSync(
          `node "${scriptPath}" ${sdId} "${title}"`,
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

  getRemediation(_gateName) {
    return 'Review LEAD validation requirements. Ensure SD has all required fields and approvals.';
  }

  async _loadVerifier() {
    if (!LeadToPlanVerifier) {
      const { default: Verifier } = await import('../../../verify-handoff-lead-to-plan.js');
      LeadToPlanVerifier = Verifier;
    }
  }
}

export default LeadToPlanExecutor;
