/**
 * Stage 15 Analysis Step - Information Architecture Generator
 * SD-S15-WIREFRAME-BESTPRACTICE-ORCH-001-B
 *
 * Generates a sitemap and page hierarchy from:
 *   1. Venture brief (S1 problem/solution)
 *   2. Customer personas (S10)
 *   3. Product roadmap (S13)
 *   4. User story pack (generated earlier in S15)
 *
 * Output is consumed by the wireframe generator to produce
 * architecture-informed wireframes.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-15-ia-generator
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';

const IA_TIMEOUT = 60000; // 60s internal timeout

const SYSTEM_PROMPT = `You are EVA's Information Architecture Engine. Generate a structured sitemap and page hierarchy for a venture's product.

You MUST output valid JSON with exactly this structure:
{
  "pages": [
    {
      "name": "Page name (e.g., 'Dashboard', 'Settings', 'Onboarding')",
      "path": "/suggested-url-path",
      "purpose": "What this page accomplishes",
      "parent": null or "Parent Page Name",
      "priority": "primary" | "secondary" | "utility",
      "persona_relevance": ["Persona 1", "Persona 2"]
    }
  ],
  "navigation": {
    "primary": ["Page 1", "Page 2", "Page 3"],
    "secondary": ["Page 4", "Page 5"],
    "utility": ["Settings", "Help", "Profile"]
  },
  "user_flows": [
    {
      "name": "Flow name",
      "persona": "Target persona",
      "steps": ["Page A", "Page B", "Page C"],
      "description": "What this flow accomplishes"
    }
  ],
  "hierarchy_depth": 2,
  "total_pages": 10
}

Rules:
- Generate 8-20 pages covering all personas
- Every persona must have at least one primary page
- Navigation groups pages by importance
- User flows must trace complete journeys
- Hierarchy depth should be 2-3 levels max
- Page names should be user-friendly, not technical
- Paths should follow URL conventions (/kebab-case)
- Output ONLY valid JSON`;

/**
 * Generate Information Architecture (sitemap) from venture context.
 *
 * @param {Object} ctx - Stage context
 * @param {Object} ctx.stage1Data - Stage 1 venture brief
 * @param {Object} ctx.stage10Data - Stage 10 personas and brand
 * @param {Object} ctx.stage13Data - Stage 13 roadmap
 * @param {Object} [ctx.userStoryPack] - User story pack from earlier S15 sub-step
 * @param {string} [ctx.ventureName] - Venture display name
 * @param {Object} [ctx.logger] - Logger
 * @returns {Promise<Object|null>} IA sitemap or null on failure
 */
export async function generateInformationArchitecture(ctx) {
  const logger = ctx.logger || console;
  logger.log('[Stage15-IA] Starting information architecture generation');

  const ventureBrief = buildIAContext(ctx);
  if (!ventureBrief) {
    logger.warn('[Stage15-IA] Insufficient venture context — skipping IA generation');
    return null;
  }

  const llm = getLLMClient({ purpose: 'content-generation' });

  const userPrompt = `Generate an information architecture (sitemap and page hierarchy) for this venture's product.

${ventureBrief}

Output ONLY valid JSON matching the schema above.`;

  try {
    const response = await llm.complete(SYSTEM_PROMPT, userPrompt, { timeout: IA_TIMEOUT });
    const usage = extractUsage(response);
    const parsed = parseJSON(response);

    // Normalize the output
    const result = normalizeIAResult(parsed, ctx.stage10Data?.customerPersonas || []);
    result.usage = usage;

    logger.log('[Stage15-IA] Information architecture generated', {
      pageCount: result.pages.length,
      flowCount: result.user_flows.length,
    });

    return result;
  } catch (err) {
    logger.warn('[Stage15-IA] IA generation failed (non-fatal)', { error: err.message });
    return null;
  }
}

/**
 * Build context string for IA generation from available stage data.
 * @param {Object} ctx
 * @returns {string|null}
 */
function buildIAContext(ctx) {
  const parts = [];

  if (ctx.ventureName) {
    parts.push(`Venture: ${ctx.ventureName}`);
  }

  if (ctx.stage1Data?.description) {
    parts.push(`Description: ${sanitizeForPrompt(ctx.stage1Data.description)}`);
  }

  if (ctx.stage1Data?.problem) {
    parts.push(`Problem: ${sanitizeForPrompt(ctx.stage1Data.problem)}`);
  }

  if (ctx.stage1Data?.solution) {
    parts.push(`Solution: ${sanitizeForPrompt(ctx.stage1Data.solution)}`);
  }

  // Personas from S10
  if (ctx.stage10Data?.customerPersonas?.length > 0) {
    const personaList = ctx.stage10Data.customerPersonas
      .map(p => `- ${p.name}: ${(p.goals || []).slice(0, 2).join(', ')}`)
      .join('\n');
    parts.push(`\nCustomer Personas:\n${personaList}`);
  }

  // Roadmap from S13
  if (ctx.stage13Data?.roadmap) {
    const roadmap = typeof ctx.stage13Data.roadmap === 'string'
      ? ctx.stage13Data.roadmap.substring(0, 500)
      : JSON.stringify(ctx.stage13Data.roadmap).substring(0, 500);
    parts.push(`\nProduct Roadmap Summary:\n${roadmap}`);
  }

  // User stories from earlier S15 sub-step
  if (ctx.userStoryPack?.epics?.length > 0) {
    const epicList = ctx.userStoryPack.epics
      .slice(0, 5)
      .map(e => `- ${e.name || e.title}: ${(e.stories || []).length} stories`)
      .join('\n');
    parts.push(`\nUser Story Epics:\n${epicList}`);
  }

  if (parts.length < 2) return null; // Need at least venture name + one data source
  return parts.join('\n');
}

/**
 * Normalize IA result to ensure consistent structure.
 * @param {Object} parsed - Raw LLM output
 * @param {Array} personas - Customer personas for coverage validation
 * @returns {Object} Normalized IA result
 */
function normalizeIAResult(parsed, personas) {
  const personaNames = personas.map(p => p.name);

  // Normalize pages
  let pages = Array.isArray(parsed.pages) ? parsed.pages : [];
  pages = pages.map(p => ({
    name: String(p.name || 'Unnamed Page').substring(0, 200),
    path: String(p.path || '/').substring(0, 200),
    purpose: String(p.purpose || '').substring(0, 500),
    parent: p.parent ? String(p.parent).substring(0, 200) : null,
    priority: ['primary', 'secondary', 'utility'].includes(p.priority) ? p.priority : 'secondary',
    persona_relevance: Array.isArray(p.persona_relevance)
      ? p.persona_relevance.map(r => String(r).substring(0, 200))
      : [],
  }));

  // Normalize navigation
  const nav = parsed.navigation && typeof parsed.navigation === 'object' ? parsed.navigation : {};
  const navigation = {
    primary: Array.isArray(nav.primary) ? nav.primary.map(n => String(n)) : pages.filter(p => p.priority === 'primary').map(p => p.name),
    secondary: Array.isArray(nav.secondary) ? nav.secondary.map(n => String(n)) : pages.filter(p => p.priority === 'secondary').map(p => p.name),
    utility: Array.isArray(nav.utility) ? nav.utility.map(n => String(n)) : pages.filter(p => p.priority === 'utility').map(p => p.name),
  };

  // Normalize user flows
  let userFlows = Array.isArray(parsed.user_flows) ? parsed.user_flows : [];
  userFlows = userFlows.map(f => ({
    name: String(f.name || 'Unnamed Flow').substring(0, 200),
    persona: String(f.persona || personaNames[0] || 'General User').substring(0, 200),
    steps: Array.isArray(f.steps) ? f.steps.map(s => String(s)) : [],
    description: String(f.description || '').substring(0, 500),
  }));

  return {
    pages,
    navigation,
    user_flows: userFlows,
    hierarchy_depth: typeof parsed.hierarchy_depth === 'number' ? parsed.hierarchy_depth : 2,
    total_pages: pages.length,
  };
}

// Export helpers for testing
export { buildIAContext, normalizeIAResult, IA_TIMEOUT };
