/**
 * Stage 01 Analysis Step - Hydration from Stage 0 Synthesis
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Consumes Stage 0 synthesis output and hydrates into a structured
 * Draft Idea with description, value proposition, target market,
 * and a required problemStatement field.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-01-hydration
 */

import { getLLMClient } from '../../../llm/index.js';

const SYSTEM_PROMPT = `You are EVA's Stage 1 Hydration Engine. Your job is to transform a raw venture synthesis from Stage 0 into a structured draft idea.

You MUST output valid JSON with exactly these fields:
- description (string, min 50 chars): A clear description of the venture idea
- valueProp (string, min 20 chars): The core value proposition
- targetMarket (string, min 10 chars): Who this is for
- problemStatement (string, min 30 chars): The specific problem being solved

Rules:
- Use the synthesis data to ground every field
- problemStatement is REQUIRED and must be specific, not generic
- If the synthesis includes a reframed problem, prefer that over the raw intent
- Keep language crisp and actionable
- Do NOT invent claims not supported by the synthesis
- If template context is provided from a similar successful venture, use it as calibration guidance (not as a replacement for the synthesis data)`;

/**
 * Hydrate a venture from Stage 0 synthesis into Stage 1 Draft Idea.
 *
 * @param {Object} params
 * @param {Object} params.synthesis - Stage 0 synthesis output
 * @param {string} params.synthesis.name - Venture name
 * @param {string} params.synthesis.problem_statement - Problem statement
 * @param {string} params.synthesis.solution - Proposed solution
 * @param {string} params.synthesis.target_market - Target market
 * @param {string} [params.synthesis.raw_chairman_intent] - Original intent
 * @param {Object} [params.synthesis.metadata] - Synthesis metadata
 * @param {Object} [params.templateContext] - Template context from a similar successful venture (SD-EVA-FEAT-VENTURE-TEMPLATES-001)
 * @returns {Promise<{description: string, valueProp: string, targetMarket: string, problemStatement: string}>}
 */
export async function analyzeStage01({ synthesis, templateContext }) {
  if (!synthesis) {
    throw new Error('Stage 01 hydration requires Stage 0 synthesis output');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const userPrompt = `Hydrate this venture synthesis into a structured draft idea.

Venture Name: ${synthesis.name || 'Unknown'}
Problem Statement: ${synthesis.problem_statement || synthesis.raw_chairman_intent || 'Not provided'}
Solution: ${synthesis.solution || 'Not provided'}
Target Market: ${synthesis.target_market || 'Not provided'}
Origin: ${synthesis.origin_type || 'Unknown'}
${synthesis.metadata?.synthesis?.problem_reframing ? `Reframed Problem: ${JSON.stringify(synthesis.metadata.synthesis.problem_reframing)}` : ''}
${synthesis.metadata?.synthesis?.moat_architecture ? `Moat: ${JSON.stringify(synthesis.metadata.synthesis.moat_architecture)}` : ''}
${synthesis.metadata?.synthesis?.archetypes ? `Archetype: ${JSON.stringify(synthesis.metadata.synthesis.archetypes)}` : ''}
${templateContext ? buildTemplateGuidance(templateContext) : ''}
Output ONLY valid JSON matching the required schema.`;

  const response = await client.complete(SYSTEM_PROMPT, userPrompt);
  const parsed = parseJSON(response);

  // Validate minimum field requirements
  if (!parsed.problemStatement || parsed.problemStatement.length < 30) {
    throw new Error('Stage 01 hydration failed: problemStatement is required (min 30 chars)');
  }
  if (!parsed.description || parsed.description.length < 50) {
    throw new Error('Stage 01 hydration failed: description must be at least 50 chars');
  }

  return {
    description: parsed.description,
    valueProp: parsed.valueProp,
    targetMarket: parsed.targetMarket,
    problemStatement: parsed.problemStatement,
  };
}

/**
 * Build template guidance text for injection into the LLM prompt.
 * SD-EVA-FEAT-VENTURE-TEMPLATES-001 (FR-9)
 *
 * @param {Object} ctx - Template context from applyTemplate()
 * @returns {string} Formatted guidance text
 */
function buildTemplateGuidance(ctx) {
  const lines = ['\n--- Template Guidance (from similar successful venture) ---'];
  lines.push(`Template: ${ctx.template_name} (effectiveness: ${ctx.effectiveness_score}/100)`);

  if (ctx.suggested_thresholds) {
    lines.push(`Health score range: ${ctx.suggested_thresholds.min_health}-${ctx.suggested_thresholds.max_health} (avg: ${ctx.suggested_thresholds.avg_health})`);
  }

  if (ctx.assumption_guidance) {
    lines.push(`Expected assumption validation rate: ${ctx.assumption_guidance.expected_validation_rate}`);
  }

  if (ctx.pricing_reference?.model_type) {
    lines.push(`Pricing model used by similar venture: ${ctx.pricing_reference.model_type}`);
  }

  lines.push('Use this as calibration guidance, not as direct input.');
  lines.push('--- End Template Guidance ---');
  return lines.join('\n');
}

/**
 * Parse JSON from an LLM response, handling markdown fences.
 * @param {string} text
 * @returns {Object}
 */
function parseJSON(text) {
  // Strip markdown code fences if present
  const cleaned = text.replace(/```json\s*\n?/g, '').replace(/```\s*$/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${cleaned.substring(0, 200)}`);
  }
}
