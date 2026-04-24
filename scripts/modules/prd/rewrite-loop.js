/**
 * PRD user-story rewrite loop (SD-LEO-INFRA-AUTO-GENERATED-PRD-001, FR-5 + FR-7).
 *
 * Iterates stories produced by the cloud-LLM PRD generator, scores each via
 * UserStoryQualityRubric, and re-prompts when the AND-gate fires (score below
 * threshold AND boilerplate/generic signal present). Fail-open on regression:
 * if a rewrite scores lower than the prior round, the prior output wins.
 *
 * Extracted into its own module so tests can stub both the rubric evaluator and
 * the LLM client without exercising live cloud APIs.
 */

import { getRewriteConfig, shouldRewriteStory } from './rewrite-config.js';
import { createTokenMeter } from './token-meter.js';

const PROMPT_LIMIT = 800;

function buildRewritePrompt(story, feedback, roundNumber) {
  const issues = Array.isArray(feedback) ? feedback : [];
  const issueBlock = issues.slice(0, 6).map((s, i) => `${i + 1}. ${s}`).join('\n');
  const originalAcs = Array.isArray(story?.acceptance_criteria) ? story.acceptance_criteria : [];
  const acLines = originalAcs.map(a => `- ${typeof a === 'string' ? a : (a?.criterion || '')}`).join('\n');
  return `You are rewriting one user story to improve its quality (round ${roundNumber}).

Original:
Title: ${story?.title || '(untitled)'}
As a ${story?.user_role || 'user'}, I want ${story?.user_want || '...'} so that ${story?.user_benefit || '...'}.

Acceptance criteria:
${acLines || '(none)'}

Quality issues to address:
${issueBlock || '(no specific feedback)'}

Return JSON only, same shape: {title, user_role, user_want, user_benefit, acceptance_criteria:[...]}.
Keep the business intent; make criteria concrete and user-observable; avoid generic phrasing.`.slice(0, PROMPT_LIMIT);
}

function tryParseStoryJSON(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/**
 * Apply the rewrite loop to a PRD content object. Mutates prdContent.user_stories
 * when rewrites yield improved scores; otherwise leaves input untouched.
 *
 * @param {Object} prdContent - Parsed PRD from parsePRDResponse()
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.llmClient - Upstream LLM client (getLLMClient() result)
 * @param {Object} deps.rubric - Instance of UserStoryQualityRubric
 * @param {Object} [deps.config] - Override config (else getRewriteConfig())
 * @param {Function} [deps.logger] - Optional logger (console.log-style)
 * @returns {Promise<{skipped:boolean, attempts:Array, budgetAborted:boolean}>}
 */
export async function applyRewriteLoop(prdContent, deps) {
  const { llmClient, rubric } = deps;
  const config = deps.config ?? getRewriteConfig();
  const log = deps.logger ?? (() => {});

  if (!config.enabled) {
    return { skipped: true, attempts: [], budgetAborted: false };
  }
  const stories = Array.isArray(prdContent?.user_stories) ? prdContent.user_stories : null;
  if (!stories || stories.length === 0) {
    return { skipped: true, attempts: [], budgetAborted: false, reason: 'no_user_stories_in_prd' };
  }
  if (!llmClient || typeof llmClient.complete !== 'function' || !rubric || typeof rubric.validateUserStoryQuality !== 'function') {
    return { skipped: true, attempts: [], budgetAborted: false, reason: 'missing_dependencies' };
  }

  const meter = createTokenMeter(llmClient, config);
  const attempts = [];
  let budgetAborted = false;

  for (let i = 0; i < stories.length; i++) {
    const original = stories[i];
    const storyId = original?.id || original?.story_key || `story_${i}`;
    const rounds = [];

    let currentStory = original;
    let lastAssessment = await rubric.validateUserStoryQuality(currentStory);
    let lastScore = Number(lastAssessment?.score ?? 0);

    for (let round = 1; round <= config.maxRounds; round++) {
      if (budgetAborted) {
        log(`[rewrite-loop] Rewrite skipped: token budget exceeded (story=${storyId})`);
        break;
      }
      const gate = shouldRewriteStory(currentStory, lastScore, config);
      if (!gate.triggered) break;

      try {
        const prompt = buildRewritePrompt(currentStory, lastAssessment?.issues, round);
        const response = await meter.complete(
          'You are a senior product writer. Improve user stories per feedback. Return JSON only.',
          prompt,
          { temperature: 0.3, max_tokens: 600 }
        );
        const candidate = tryParseStoryJSON(response?.content);
        if (!candidate) {
          rounds.push({ round_number: round, score_before: lastScore, score_after: lastScore, triggered_by: gate.reasons, kept: false, parse_failed: true });
          break;
        }
        const mergedStory = { ...currentStory, ...candidate };
        const newAssessment = await rubric.validateUserStoryQuality(mergedStory);
        const newScore = Number(newAssessment?.score ?? 0);
        const keep = newScore > lastScore;

        rounds.push({
          round_number: round,
          score_before: lastScore,
          score_after: newScore,
          triggered_by: gate.reasons,
          kept: keep,
          tokens_in: meter.totals().tokensIn,
          tokens_out: meter.totals().tokensOut,
        });

        if (keep) {
          currentStory = mergedStory;
          lastAssessment = newAssessment;
          lastScore = newScore;
        } else {
          log(`[rewrite-loop] Rewrite regressed (${lastScore} → ${newScore}); keeping prior (story=${storyId})`);
          break; // fail-open: one warning per regressed story, not per round
        }
      } catch (err) {
        if (err?.code === 'TOKEN_BUDGET_EXCEEDED') {
          budgetAborted = true;
          log(`[rewrite-loop] Rewrite skipped: token budget exceeded (story=${storyId})`);
          break;
        }
        rounds.push({ round_number: round, score_before: lastScore, score_after: lastScore, triggered_by: gate.reasons, kept: false, error: err?.message });
        break;
      }
    }

    if (rounds.length > 0) {
      stories[i] = currentStory;
      attempts.push({
        story_id: storyId,
        rounds,
        final_kept: rounds.some(r => r.kept),
        budget_aborted: budgetAborted,
      });
    }
  }

  return { skipped: false, attempts, budgetAborted };
}
