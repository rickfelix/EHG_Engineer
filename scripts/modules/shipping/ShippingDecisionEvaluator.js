/**
 * ShippingDecisionEvaluator - LLM-powered shipping decisions
 *
 * Extends the AIQualityEvaluator pattern for consistent evaluation.
 * Uses GPT-5.2 to make intelligent decisions about:
 * - PR_CREATION: Should we create a PR for this work?
 * - PR_MERGE: Should we merge this PR to main?
 * - BRANCH_CLEANUP: Should we delete this branch?
 *
 * Confidence Levels:
 * - HIGH: Proceed automatically
 * - MEDIUM: Proceed automatically with logging
 * - LOW: ALWAYS escalate to human - no exceptions
 *
 * @module shipping/ShippingDecisionEvaluator
 * @version 1.0.0
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// SD-LLM-CONFIG-CENTRAL-001: Centralized model configuration
import { getOpenAIModel } from '../../../lib/config/model-config.js';

dotenv.config();

export class ShippingDecisionEvaluator {
  /**
   * @param {string} decisionType - PR_CREATION | PR_MERGE | BRANCH_CLEANUP
   * @param {Object} options - Additional options
   */
  constructor(decisionType, options = {}) {
    this.decisionType = decisionType;
    this.options = options;
    this.model = getOpenAIModel('validation'); // SD-LLM-CONFIG-CENTRAL-001: Centralized config
    this.temperature = 0.3; // Balance consistency + nuance

    // Get rubric config for this decision type
    this.rubricConfig = ShippingDecisionEvaluator.getRubricConfig(decisionType);

    // Initialize OpenAI
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not found in environment');
    }
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Initialize Supabase
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Scoring band thresholds
    this.bandThresholds = {
      PASS: 75,        // 75+ = PASS (slightly lower than quality eval since shipping is action-oriented)
      NEEDS_REVIEW: 50 // 50-74 = NEEDS_REVIEW, <50 = FAIL
    };
  }

  /**
   * Get rubric configuration for each decision type
   */
  static getRubricConfig(decisionType) {
    const configs = {
      PR_CREATION: {
        contentType: 'shipping_pr_creation',
        criteria: [
          {
            name: 'commit_quality',
            weight: 0.20,
            prompt: `Evaluate commit quality:
- 0-3: No commits, garbage messages, or completely unclear history
- 4-6: Commits exist but messages are vague or inconsistent
- 7-8: Good commit messages following conventional commit format
- 9-10: Excellent atomic commits with clear, descriptive messages explaining WHY not just WHAT`
          },
          {
            name: 'test_evidence',
            weight: 0.30,
            prompt: `Evaluate test evidence for this change:
- 0-3: No test evidence, or tests explicitly failing
- 4-6: Some test evidence but unclear if comprehensive
- 7-8: Good evidence of passing tests
- 9-10: Clear evidence of both unit and E2E tests passing with good coverage`
          },
          {
            name: 'pr_readiness',
            weight: 0.30,
            prompt: `Evaluate PR readiness:
- 0-3: Uncommitted changes, unpushed commits, or incomplete work
- 4-6: Code pushed but missing documentation or incomplete
- 7-8: Ready for review with minor gaps
- 9-10: Fully ready - pushed, clean build, all changes committed`
          },
          {
            name: 'scope_appropriateness',
            weight: 0.20,
            prompt: `Evaluate if PR scope is appropriate:
- 0-3: Massive PR (>400 lines) or unfocused changes
- 4-6: Large PR (200-400 lines) that could be split
- 7-8: Reasonable PR size (<200 lines)
- 9-10: Focused PR (<100 lines) with single clear purpose`
          }
        ]
      },

      PR_MERGE: {
        contentType: 'shipping_pr_merge',
        criteria: [
          {
            name: 'ci_status',
            weight: 0.35,
            prompt: `Evaluate CI/CD pipeline status:
- 0-3: CI failing, not run, or unknown status
- 4-6: CI has warnings or some checks pending
- 7-8: CI passing with minor warnings
- 9-10: All CI checks passing cleanly, no warnings`
          },
          {
            name: 'review_and_approval',
            weight: 0.25,
            prompt: `Evaluate review/approval status:
- 0-3: No review, or review explicitly rejected
- 4-6: Review requested but not completed, or approved with unresolved comments
- 7-8: Approved with minor outstanding comments
- 9-10: Approved with all comments addressed and resolved`
          },
          {
            name: 'merge_readiness',
            weight: 0.25,
            prompt: `Evaluate merge readiness:
- 0-3: Has unresolved merge conflicts or significant behind main
- 4-6: Potential conflicts or needs rebase investigation
- 7-8: Clean merge with minor rebasing that can be done automatically
- 9-10: Clean merge, fully up-to-date with main, no conflicts`
          },
          {
            name: 'deployment_risk',
            weight: 0.15,
            prompt: `Evaluate deployment risk based on files changed:
- 0-3: Very high risk (database migrations, auth, secrets, RLS policies)
- 4-6: Medium risk (API changes, package dependencies)
- 7-8: Low risk (standard feature code, tests)
- 9-10: Minimal risk (documentation, configs, minor fixes)`
          }
        ]
      },

      BRANCH_CLEANUP: {
        contentType: 'shipping_branch_cleanup',
        criteria: [
          {
            name: 'merge_status',
            weight: 0.50,
            prompt: `Evaluate if branch is fully merged:
- 0-3: Branch has unmerged commits or active work
- 4-6: Uncertain merge status, needs investigation
- 7-8: Appears merged but should verify
- 9-10: Confirmed fully merged to main, all commits accounted for`
          },
          {
            name: 'branch_age_and_activity',
            weight: 0.25,
            prompt: `Evaluate branch age and recent activity:
- 0-3: Very recent activity (< 2 hours) - may be parallel Claude instance!
- 4-6: Active within 24 hours, verify no ongoing work
- 7-8: Stale (1-7 days), likely safe
- 9-10: Very stale (> 7 days), definitely safe to delete`
          },
          {
            name: 'cleanup_safety',
            weight: 0.25,
            prompt: `Evaluate overall cleanup safety:
- 0-3: Branch may have unique unmerged work or important history
- 4-6: Needs investigation before deletion
- 7-8: Safe to delete with standard precautions
- 9-10: Definitely safe to delete, no risk of data loss`
          }
        ]
      }
    };

    return configs[decisionType];
  }

  /**
   * Make a shipping decision using LLM evaluation
   * @param {Object} shippingContext - Context from ShippingContextBuilder
   * @returns {Promise<Object>} Decision result
   */
  async makeDecision(shippingContext) {
    const startTime = Date.now();
    const DEBUG = process.env.AI_DEBUG === 'true';
    const logPrefix = `[Shipping:${this.decisionType}]`;

    if (DEBUG) {
      console.log(`${logPrefix} Starting evaluation...`);
    }

    try {
      // Format context for LLM
      const formattedContent = this.formatContextForEvaluation(shippingContext);

      // Build prompt
      const messages = this.buildPrompt(formattedContent, shippingContext.sd);

      // Call OpenAI API
      const apiStart = Date.now();
      const response = await this.callOpenAI(messages);
      const apiDuration = Date.now() - apiStart;

      if (DEBUG) {
        console.log(`${logPrefix} API response in ${apiDuration}ms`);
      }

      // Parse response
      let scores;
      let meta = { confidence: 'MEDIUM', confidence_reasoning: 'Default confidence' };

      try {
        const parsed = JSON.parse(response.choices[0].message.content);
        if (parsed._meta) {
          meta = {
            confidence: parsed._meta.confidence || 'MEDIUM',
            confidence_reasoning: parsed._meta.confidence_reasoning || ''
          };
          delete parsed._meta;
        }
        scores = parsed;
      } catch (parseError) {
        console.error(`${logPrefix} Failed to parse response:`, response.choices[0].message.content.substring(0, 500));
        throw new Error(`JSON parse failed: ${parseError.message}`);
      }

      // Calculate weighted score
      const weightedScore = this.calculateWeightedScore(scores);

      // Determine band and decision
      const band = this.determineBand(weightedScore);
      const confidence = meta.confidence;
      const decision = this.determineDecision(band, confidence, weightedScore);

      // Track metrics
      const duration = Date.now() - startTime;
      const tokensUsed = response.usage;
      const cost = this.calculateCost(tokensUsed);

      if (DEBUG) {
        console.log(`${logPrefix} Score: ${weightedScore}% | Band: ${band} | Confidence: ${confidence}`);
        console.log(`${logPrefix} Decision: ${decision.action}`);
      }

      // Store decision in database
      await this.storeShippingDecision(shippingContext, {
        scores,
        weightedScore,
        band,
        confidence,
        confidence_reasoning: meta.confidence_reasoning
      }, decision, duration, tokensUsed, cost);

      return {
        decision: decision.action,
        confidence,
        confidenceScore: weightedScore,
        reasoning: decision.reasoning,
        shouldEscalate: confidence === 'LOW',
        scores,
        band,
        feedback: this.generateFeedback(scores),
        duration,
        cost,
        executionContext: this.buildExecutionContext(shippingContext, decision)
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`${logPrefix} FAILED after ${duration}ms: ${error.message}`);

      // On error, escalate to human
      return {
        decision: 'ESCALATE',
        confidence: 'LOW',
        confidenceScore: 0,
        reasoning: `Evaluation failed: ${error.message}`,
        shouldEscalate: true,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Format shipping context for LLM evaluation
   */
  formatContextForEvaluation(ctx) {
    return `# Shipping Decision Context: ${this.decisionType}

## Strategic Directive
- **SD ID**: ${ctx.sdId}
- **Title**: ${ctx.sd?.title || 'Unknown'}
- **Type**: ${ctx.sd?.sd_type || 'feature'}
- **Status**: ${ctx.sd?.status || 'Unknown'}
- **Phase**: ${ctx.sd?.current_phase || 'Unknown'}

## Git State
- **Current Branch**: ${ctx.git?.currentBranch || 'Unknown'}
- **Commits Ahead of Main**: ${ctx.git?.commitsAhead || 0}
- **Uncommitted Changes**: ${ctx.git?.hasUncommittedChanges ? 'YES - BLOCKING' : 'NO'}
- **Unstaged Changes**: ${ctx.git?.hasUnstagedChanges ? 'YES' : 'NO'}
- **Unpushed Commits**: ${ctx.git?.unpushedCommits || 0}
- **Files Changed**: ${ctx.git?.filesChangedCount || 0}
- **Lines Added/Removed**: +${ctx.git?.linesAdded || 0}/-${ctx.git?.linesRemoved || 0}
- **Branch Age**: ${ctx.git?.branchAge ? `${ctx.git.branchAge.hours} hours (${ctx.git.branchAge.days} days)` : 'Unknown'}

## Recent Commits
${ctx.git?.recentCommits?.slice(0, 5).map(c => `- ${c.sha?.substring(0, 7)}: ${c.message} (${c.age})`).join('\n') || 'No commits'}

## CI/CD Status
- **Last Run Status**: ${ctx.ci?.lastRunStatus || 'Unknown'}
- **Workflows Passing**: ${ctx.ci?.workflowsPassing ? 'YES' : 'NO/UNKNOWN'}
- **Checks Complete**: ${ctx.ci?.checksComplete ? 'YES' : 'NO'}
- **Failing Checks**: ${ctx.ci?.failingChecks?.join(', ') || 'None'}

## PR Status
- **PR Number**: ${ctx.pr?.number || 'None (will create)'}
- **PR State**: ${ctx.pr?.state || 'N/A'}
- **Mergeable**: ${ctx.pr?.mergeable ?? 'N/A'}
- **Review Status**: ${ctx.pr?.reviewStatus || 'N/A'}
- **Checks Status**: ${ctx.pr?.checksStatus || 'N/A'}

## Test Results
- **Unit Tests**: ${ctx.tests?.unitTestsPassing === true ? 'PASSING' : ctx.tests?.unitTestsPassing === false ? 'FAILING' : 'UNKNOWN'}
- **E2E Tests**: ${ctx.tests?.e2eTestsPassing === true ? 'PASSING' : ctx.tests?.e2eTestsPassing === false ? 'FAILING' : 'UNKNOWN'}

## Risk Assessment
- **Risk Level**: ${ctx.risk?.level?.toUpperCase() || 'Unknown'}
- **Risk Score**: ${ctx.risk?.score || 0}/100
- **Risk Factors**:
${ctx.risk?.factors?.map(f => `  - ${f}`).join('\n') || '  - None identified'}

## LEO Handoff Results
- **Last Handoff**: ${ctx.handoffResults?.lastHandoff || 'None'}
- **Gates Passed**: ${ctx.handoffResults?.gatesPassed === true ? 'YES' : ctx.handoffResults?.gatesPassed === false ? 'NO' : 'N/A'}
- **Gate Score**: ${ctx.handoffResults?.gateScore ?? 'N/A'}%

## Files Changed (sample)
${ctx.git?.filesChanged?.slice(0, 15).join('\n') || 'None'}
${ctx.git?.filesChangedCount > 15 ? `... and ${ctx.git.filesChangedCount - 15} more files` : ''}
`;
  }

  /**
   * Build OpenAI prompt
   */
  buildPrompt(content, sd = null) {
    const systemPrompt = this.getSystemPrompt(sd);
    const userPrompt = this.getUserPrompt(content);

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
  }

  /**
   * Get system prompt for shipping decisions
   */
  getSystemPrompt(_sd = null) {
    const decisionDescriptions = {
      PR_CREATION: 'whether to CREATE a Pull Request for this work',
      PR_MERGE: 'whether to MERGE this Pull Request to main',
      BRANCH_CLEANUP: 'whether to DELETE this branch after merge'
    };

    return `You are an intelligent shipping decision evaluator for the LEO Protocol.

**Your Task:** Decide ${decisionDescriptions[this.decisionType]}.

**LEO Protocol Context:**
LEO Protocol automates software development with quality gates. Your decision should be:
- PROCEED: Automatically execute the action (create PR, merge, or delete branch)
- DEFER: Wait for issues to be fixed (don't escalate, just delay)
- ESCALATE: Requires human review (only for truly ambiguous situations)

**CRITICAL: Full Automation is the Goal**
- Default to PROCEED unless there's a clear blocker
- DEFER if there are fixable issues (uncommitted changes, failing tests)
- ESCALATE only when you genuinely cannot determine the right action

**Decision Criteria for ${this.decisionType}:**
${this.rubricConfig.criteria.map(c => `- **${c.name}**: ${c.prompt.split('\n')[0]}`).join('\n')}

**Confidence Guidelines:**
- HIGH: Clear evidence supports decision, no ambiguity
- MEDIUM: Reasonable decision but some interpretation required
- LOW: Genuinely ambiguous or insufficient information to decide safely

**WARNING:** LOW confidence triggers human escalation. Only use LOW when you truly cannot make a safe automated decision.

**Scoring Scale (0-10):**
- 0-3: Completely inadequate, blocks the action
- 4-6: Present but has issues, may need attention
- 7-8: Good, ready to proceed
- 9-10: Excellent, proceed with confidence

Return ONLY valid JSON:
{
  "criterion_name": {
    "score": <0-10>,
    "reasoning": "<1-2 sentence explanation>"
  },
  "_meta": {
    "confidence": "<HIGH | MEDIUM | LOW>",
    "confidence_reasoning": "<1 sentence explaining confidence>"
  }
}

NO additional text - ONLY the JSON object.`;
  }

  /**
   * Get user prompt with content
   */
  getUserPrompt(content) {
    const criteriaList = this.rubricConfig.criteria.map(c =>
      `\n### ${c.name} (${Math.round(c.weight * 100)}% weight)\n${c.prompt}`
    ).join('\n');

    return `Evaluate this shipping context and score each criterion:

${content}

---

## Criteria to Evaluate:
${criteriaList}

Remember: Return ONLY valid JSON with scores for each criterion and _meta confidence.`;
  }

  /**
   * Call OpenAI API with retry logic
   */
  async callOpenAI(messages, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages,
          temperature: this.temperature,
          max_tokens: 1000,
          response_format: { type: 'json_object' }
        });
        return response;
      } catch (error) {
        if (attempt === retries) throw error;
        console.warn(`[Shipping] OpenAI attempt ${attempt} failed, retrying...`);
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  /**
   * Calculate weighted score from criterion scores
   */
  calculateWeightedScore(scores) {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const criterion of this.rubricConfig.criteria) {
      const score = scores[criterion.name]?.score;
      if (typeof score === 'number') {
        weightedSum += (score / 10) * 100 * criterion.weight;
        totalWeight += criterion.weight;
      }
    }

    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  }

  /**
   * Determine scoring band
   */
  determineBand(weightedScore) {
    if (weightedScore >= this.bandThresholds.PASS) {
      return 'PASS';
    } else if (weightedScore >= this.bandThresholds.NEEDS_REVIEW) {
      return 'NEEDS_REVIEW';
    }
    return 'FAIL';
  }

  /**
   * Determine decision action based on band and confidence
   */
  determineDecision(band, confidence, weightedScore) {
    // LOW confidence = ALWAYS escalate
    if (confidence === 'LOW') {
      return {
        action: 'ESCALATE',
        reasoning: `Low confidence (${weightedScore}%): Cannot make automated decision safely. Human review required.`
      };
    }

    // PASS band = PROCEED
    if (band === 'PASS') {
      return {
        action: 'PROCEED',
        reasoning: `High quality assessment (${weightedScore}%): All criteria passed. Proceeding automatically.`
      };
    }

    // NEEDS_REVIEW with MEDIUM/HIGH confidence - still PROCEED but log
    if (band === 'NEEDS_REVIEW') {
      return {
        action: 'PROCEED',
        reasoning: `Acceptable quality (${weightedScore}%): Minor issues noted but proceeding with logging.`
      };
    }

    // FAIL band = DEFER (not escalate, let the system fix issues first)
    return {
      action: 'DEFER',
      reasoning: `Quality issues detected (${weightedScore}%): Issues need to be fixed before proceeding.`
    };
  }

  /**
   * Generate feedback from scores
   */
  generateFeedback(scores) {
    const feedback = {
      issues: [],
      warnings: [],
      strengths: []
    };

    for (const criterion of this.rubricConfig.criteria) {
      const result = scores[criterion.name];
      if (!result) continue;

      if (result.score <= 3) {
        feedback.issues.push(`${criterion.name}: ${result.reasoning}`);
      } else if (result.score <= 6) {
        feedback.warnings.push(`${criterion.name}: ${result.reasoning}`);
      } else if (result.score >= 8) {
        feedback.strengths.push(`${criterion.name}: ${result.reasoning}`);
      }
    }

    return feedback;
  }

  /**
   * Calculate API cost
   */
  calculateCost(tokensUsed) {
    if (!tokensUsed) return 0;
    // GPT-5.2 pricing estimate
    const inputCost = (tokensUsed.prompt_tokens / 1_000_000) * 2.50;
    const outputCost = (tokensUsed.completion_tokens / 1_000_000) * 10.00;
    return inputCost + outputCost;
  }

  /**
   * Store shipping decision in database
   */
  async storeShippingDecision(context, assessment, decision, duration, tokensUsed, cost) {
    try {
      await this.supabase
        .from('shipping_decisions')
        .insert({
          sd_id: context.sd?.legacy_id || context.sd?.id || context.sdId,
          handoff_type: context.handoffType,
          decision_type: this.decisionType,
          decision: decision.action,
          confidence: assessment.confidence,
          confidence_score: assessment.weightedScore,
          reasoning: decision.reasoning,
          context_snapshot: context,
          escalated_to_human: assessment.confidence === 'LOW',
          model: this.model,
          tokens_used: tokensUsed,
          cost_usd: cost
        });
    } catch (error) {
      console.warn(`[Shipping] Failed to store decision: ${error.message}`);
    }
  }

  /**
   * Build execution context for ShippingExecutor
   */
  buildExecutionContext(shippingContext, decision) {
    return {
      sdId: shippingContext.sdId,
      repoPath: shippingContext.repoPath,
      branch: shippingContext.git?.currentBranch,
      prNumber: shippingContext.pr?.number,
      prUrl: shippingContext.pr?.url,
      action: decision.action,
      decisionType: this.decisionType,
      sd: shippingContext.sd
    };
  }
}

export default ShippingDecisionEvaluator;
