/**
 * Stage 15 Analysis Step - User Story Pack Generator
 * SD-WIRE-USERSTORYPACK-AGENT-INTO-ORCH-001-A
 *
 * Invokes the user-story-pack blueprint agent to generate epics and
 * user stories from the venture brief, product roadmap (S13), and
 * technical architecture (S14). Runs after wireframe generation.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-15-user-story-pack
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { systemPrompt } from '../../blueprint-agents/user-story-pack.js';

/**
 * Generate user story pack from venture context.
 * @param {Object} ctx - Stage context (ventureId, supabase, stage13Data, stage14Data, etc.)
 * @returns {Object|null} User story pack with epics, stories, and personas
 */
export async function generateUserStoryPack(ctx) {
  const logger = ctx.logger || console;
  logger.log('[Stage15-UserStoryPack] Starting user story pack generation');

  // Build context from available stage data
  const ventureBrief = buildVentureBrief(ctx);
  if (!ventureBrief) {
    logger.warn('[Stage15-UserStoryPack] Insufficient venture context — skipping');
    return null;
  }

  const llm = getLLMClient({ purpose: 'content-generation' });

  const userPrompt = `Generate a structured user story pack for this venture:

${ventureBrief}

Output valid JSON with keys: "epics" (array), "personas" (array), "mvp_story_count" (number), "total_story_points" (number).`;

  try {
    const response = await llm.generateContent({
      systemPrompt,
      userPrompt,
      maxOutputTokens: 8192,
      temperature: 0.4,
    });

    const text = typeof response === 'string' ? response : response?.text || response?.content || '';
    const parsed = parseJSON(text);
    const usage = extractUsage(response);

    if (!parsed || !parsed.epics) {
      logger.warn('[Stage15-UserStoryPack] Failed to parse LLM response');
      return null;
    }

    logger.log('[Stage15-UserStoryPack] Generation complete', {
      epicCount: parsed.epics.length,
      storyCount: parsed.mvp_story_count || 0,
      totalPoints: parsed.total_story_points || 0,
      usage,
    });

    return parsed;
  } catch (err) {
    logger.warn('[Stage15-UserStoryPack] LLM call failed', { error: err.message });
    return null;
  }
}

/**
 * Build a venture brief string from available stage context data.
 */
function buildVentureBrief(ctx) {
  const parts = [];

  // From Stage 0/1: venture name and problem
  if (ctx.ventureName) parts.push(`Venture: ${ctx.ventureName}`);
  if (ctx.stage1Data?.problem) parts.push(`Problem: ${ctx.stage1Data.problem}`);
  if (ctx.stage1Data?.solution) parts.push(`Solution: ${ctx.stage1Data.solution}`);

  // From Stage 13: product roadmap
  if (ctx.stage13Data?.roadmap) {
    parts.push(`Product Roadmap: ${JSON.stringify(ctx.stage13Data.roadmap).substring(0, 2000)}`);
  }

  // From Stage 14: technical architecture
  if (ctx.stage14Data?.architecture) {
    parts.push(`Technical Architecture: ${JSON.stringify(ctx.stage14Data.architecture).substring(0, 1000)}`);
  }

  // From Stage 10: customer personas
  if (ctx.stage10Data?.customerPersonas?.length > 0) {
    const personas = ctx.stage10Data.customerPersonas.map(p => p.name || p.title || 'unnamed').join(', ');
    parts.push(`Target Personas: ${personas}`);
  }

  // Minimum: need at least venture name or problem statement
  return parts.length >= 1 ? parts.join('\n\n') : null;
}
