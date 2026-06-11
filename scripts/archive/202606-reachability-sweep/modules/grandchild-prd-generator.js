/**
 * Grandchild PRD Generator — Creates individually-scoped PRDs for child SDs
 *
 * SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001-E (C5)
 *
 * Given an architecture plan and a decomposed child SD, generates a PRD
 * containing only the functional requirements relevant to that child's scope.
 * Avoids copy-pasting the parent PRD.
 *
 * @module scripts/modules/grandchild-prd-generator
 */

import { getLLMClient } from '../../lib/llm/index.js';
import { parseJSON } from '../../lib/eva/utils/parse-json.js';

const PRD_SYSTEM_PROMPT = `You are a PRD generator for a specific child SD within a decomposed hierarchy.

Given:
- The parent architecture plan phase this child covers
- The child SD title and scope
- The full architecture plan for context

Generate a focused PRD with ONLY the functional requirements relevant to this child.
Do NOT include requirements from other phases or sibling SDs.

Output valid JSON:
{
  "executive_summary": "1-2 sentence summary of this child's scope",
  "functional_requirements": [
    { "id": "FR-001", "title": "...", "description": "...", "priority": "must_have" }
  ],
  "acceptance_criteria": ["AC-001: ..."],
  "implementation_approach": "Brief approach for this child only",
  "risks": [{ "risk": "...", "mitigation": "..." }]
}`;

/**
 * Generate a PRD for a single child SD based on its architecture plan phase.
 *
 * @param {Object} childSD - Child SD record with title, description, scope
 * @param {Object} phase - Architecture plan phase this child covers
 * @param {Object} archPlan - Full architecture plan for context
 * @param {Object} [options]
 * @param {Object} [options.logger]
 * @returns {Promise<Object>} PRD content fields ready for product_requirements_v2
 */
export async function generateChildPRD(childSD, phase, archPlan, options = {}) {
  const { logger = console } = options;

  const userPrompt = `## Child SD
Title: ${childSD.title}
Scope: ${childSD.scope || childSD.description}

## Architecture Plan Phase
Title: ${phase.title || 'Phase'}
Description: ${phase.description || 'No description'}
${phase.sub_items ? `Sub-items:\n${phase.sub_items.map(s => `- ${s}`).join('\n')}` : ''}

## Full Architecture Context (for reference only — do NOT include other phases' requirements)
${(archPlan?.content || '').substring(0, 2000)}

Generate a focused PRD for this child SD only.`;

  try {
    const client = getLLMClient({ purpose: 'content-generation' });
    const response = await client.complete(PRD_SYSTEM_PROMPT, userPrompt, { timeout: 90000 });
    const result = parseJSON(response);

    logger.log(`[GrandchildPRD] Generated PRD for "${childSD.title}": ${result.functional_requirements?.length || 0} FRs`);

    return {
      executive_summary: result.executive_summary || `PRD for ${childSD.title}`,
      functional_requirements: result.functional_requirements || [],
      acceptance_criteria: result.acceptance_criteria || [],
      implementation_approach: result.implementation_approach || '',
      risks: result.risks || [],
    };
  } catch (err) {
    logger.warn(`[GrandchildPRD] LLM generation failed for "${childSD.title}": ${err.message}`);
    // Fallback: extract from phase content
    return generateFallbackPRD(childSD, phase);
  }
}

/**
 * Generate PRDs for all children in a hierarchy.
 *
 * @param {Object[]} children - Array of child SD records
 * @param {Object[]} phases - Architecture plan phases (aligned by index)
 * @param {Object} archPlan - Full architecture plan
 * @param {Object} [options]
 * @returns {Promise<Map<string, Object>>} Map of sd_key → PRD content
 */
export async function generateAllChildPRDs(children, phases, archPlan, options = {}) {
  const { logger = console } = options;
  const results = new Map();

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const phase = phases[i] || phases[phases.length - 1] || { title: child.title };

    const prd = await generateChildPRD(child, phase, archPlan, { logger });
    results.set(child.sd_key || child.title, prd);
  }

  logger.log(`[GrandchildPRD] Generated ${results.size} child PRDs`);
  return results;
}

/**
 * Fallback PRD generation without LLM.
 */
function generateFallbackPRD(childSD, phase) {
  return {
    executive_summary: `Implement ${childSD.title} as specified in the architecture plan.`,
    functional_requirements: [
      {
        id: 'FR-001',
        title: phase.title || childSD.title,
        description: phase.description || childSD.description || childSD.scope || 'Implement as specified',
        priority: 'must_have',
      }
    ],
    acceptance_criteria: [`AC-001: ${childSD.title} is implemented and tested`],
    implementation_approach: `Follow architecture plan phase: ${phase.title || 'as specified'}`,
    risks: [],
  };
}
