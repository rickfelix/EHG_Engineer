/**
 * Stage 15 Analysis Step - Wireframe Generator for Stage 15 Layout
 * SD: SD-MAN-INFRA-WIREFRAME-GENERATOR-STAGE-001
 *
 * Generates persona-driven ASCII wireframe screens by combining:
 *   1. Brand Genome from Stage 10 (personality, design tokens, typography, color)
 *   2. Technical Architecture from Stage 14 (tech stack, data model, API contracts)
 *   3. Product Hunt top-rated products (UX patterns)
 *   4. Awwwards curated library (visual quality benchmarks)
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-15-wireframe-generator
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';

// ── Constants ────────────────────────────────────────────────────────
const MIN_SCREENS = 5;
const MAX_SCREENS = 15;
const DEFAULT_ARCHETYPE_CATEGORY = 'saas';
const DEFAULT_PH_CATEGORY = 'saas';

const SYSTEM_PROMPT = `You are EVA's Wireframe Generator Engine. Generate persona-driven ASCII wireframe screens for a venture's product.

You MUST output valid JSON with exactly this structure:
{
  "screens": [
    {
      "name": "Screen name (e.g., 'Dashboard', 'Onboarding', 'Settings')",
      "purpose": "What this screen accomplishes for the user",
      "persona": "Which persona this screen primarily serves",
      "ascii_layout": ["Line 1 of ASCII wireframe", "Line 2", "...(use +, -, |, [ ], text labels, min 5 lines as separate array elements)"],
      "key_components": ["Component 1", "Component 2"],
      "interaction_notes": "How the user interacts with this screen"
    }
  ],
  "navigation_flows": [
    {
      "name": "Flow name (e.g., 'Onboarding Flow')",
      "steps": ["Screen A", "Screen B", "Screen C"],
      "persona": "Which persona this flow serves",
      "description": "What this flow accomplishes"
    }
  ],
  "persona_coverage": {
    "persona_name": {
      "primary_screens": ["Screen 1", "Screen 2"],
      "secondary_screens": ["Screen 3"],
      "coverage_score": 85
    }
  },
  "design_rationale": {
    "brand_alignment": "How the wireframes reflect the brand genome",
    "tech_feasibility": "How the wireframes align with the technical architecture",
    "ux_patterns_used": ["Pattern 1 from Product Hunt reference", "Pattern 2"]
  }
}

Rules:
- Generate between ${MIN_SCREENS} and ${MAX_SCREENS} screens
- Each screen MUST have an ascii_layout as an ARRAY OF STRINGS (one string per line), with at least 5 elements
- ASCII wireframes should use: +---+ for borders, | | for sides, [ Button ] for actions, === for dividers
- CRITICAL: ascii_layout MUST be a JSON array, NOT a single string with embedded newlines
- Every persona from Stage 10 must be covered by at least one screen as primary
- navigation_flows must reference screens by name
- persona_coverage must include every persona with a coverage_score (0-100)
- key_components should reference actual UI elements (buttons, forms, lists, charts, etc.)
- Design choices should reflect the brand genome (colors, typography, tone)
- Technical feasibility should align with the Stage 14 architecture (data entities, API layer)
- Reference UX patterns from Product Hunt and Awwwards examples when provided`;

/**
 * Derive a category from brand genome archetype for service lookups.
 * Maps common brand archetypes to Product Hunt / Awwwards categories.
 *
 * @param {Object} brandGenome - Stage 10 brand genome
 * @returns {string} Category string
 */
function deriveCategory(brandGenome) {
  if (!brandGenome) return DEFAULT_PH_CATEGORY;

  const archetype = (brandGenome.archetype || '').toLowerCase();
  const audience = (brandGenome.audience || '').toLowerCase();
  const combined = `${archetype} ${audience}`;

  if (combined.includes('finance') || combined.includes('fintech') || combined.includes('banking')) return 'fintech';
  if (combined.includes('health') || combined.includes('medical') || combined.includes('wellness')) return 'health';
  if (combined.includes('developer') || combined.includes('engineering') || combined.includes('code')) return 'developer-tools';
  if (combined.includes('ai') || combined.includes('machine learning') || combined.includes('artificial')) return 'artificial-intelligence';
  if (combined.includes('productivity') || combined.includes('workflow')) return 'productivity';
  if (combined.includes('ecommerce') || combined.includes('commerce') || combined.includes('shop')) return 'e-commerce';

  return DEFAULT_PH_CATEGORY;
}



/**
 * Fetch Awwwards design references for the venture's archetype.
 * Uses dynamic import with try/catch for graceful fallback.
 *
 * @param {string} archetype - Archetype category (e.g., 'saas', 'fintech')
 * @param {Object} logger
 * @returns {Promise<Array>} Awwwards references or empty array
 */
async function fetchDesignReferences(archetype, logger) {
  try {
    const { getDesignReferencesByArchetype } = await import('../../services/design-reference-library.js');
    const refs = await getDesignReferencesByArchetype(archetype, 5);
    logger.log('[Stage15-WF] Awwwards references fetched', { archetype, count: refs.length });
    return refs;
  } catch (err) {
    logger.warn?.('[Stage15-WF] Awwwards fetch failed (non-fatal)', { error: err.message });
    return [];
  }
}

/**
 * Build the persona context string from Stage 10 customer personas.
 *
 * @param {Array} personas
 * @returns {string}
 */
function buildPersonaContext(personas) {
  if (!Array.isArray(personas) || personas.length === 0) return 'No personas available.';

  return personas
    .map(p => `- ${p.name}: Goals: ${(p.goals || []).join(', ')}. Pain points: ${(p.painPoints || []).join(', ')}. Behaviors: ${(p.behaviors || []).join(', ')}`)
    .join('\n');
}

/**
 * Build the brand context string from Stage 10 brand genome.
 *
 * @param {Object} brandGenome
 * @returns {string}
 */
function buildBrandContext(brandGenome) {
  if (!brandGenome) return 'No brand genome available.';

  return `Brand Archetype: ${brandGenome.archetype || 'N/A'}
Brand Values: ${(brandGenome.values || []).join(', ')}
Brand Tone: ${brandGenome.tone || 'N/A'}
Target Audience: ${brandGenome.audience || 'N/A'}
Differentiators: ${(brandGenome.differentiators || []).join(', ')}`;
}

/**
 * Build the technical architecture context string from Stage 14 data.
 *
 * @param {Object} stage14Data
 * @returns {string}
 */
function buildTechContext(stage14Data) {
  if (!stage14Data) return 'No technical architecture available.';

  const parts = [];

  if (stage14Data.layers) {
    const layerSummary = Object.entries(stage14Data.layers)
      .map(([name, layer]) => `  ${name}: ${layer.technology || 'N/A'} (${(layer.components || []).slice(0, 3).join(', ')})`)
      .join('\n');
    parts.push(`Tech Stack:\n${layerSummary}`);
  }

  if (stage14Data.dataEntities && Array.isArray(stage14Data.dataEntities)) {
    const entitySummary = stage14Data.dataEntities
      .slice(0, 5)
      .map(e => `  ${e.name}: ${e.description || 'N/A'}`)
      .join('\n');
    parts.push(`Data Entities:\n${entitySummary}`);
  }

  if (stage14Data.security) {
    parts.push(`Auth Strategy: ${stage14Data.security.authStrategy || 'N/A'}`);
  }

  if (stage14Data.integration_points && Array.isArray(stage14Data.integration_points)) {
    const intPts = stage14Data.integration_points
      .slice(0, 3)
      .map(ip => `  ${ip.name}: ${ip.source_layer} -> ${ip.target_layer} (${ip.protocol})`)
      .join('\n');
    parts.push(`Integration Points:\n${intPts}`);
  }

  return parts.length > 0 ? parts.join('\n\n') : 'Technical architecture data is minimal.';
}

/**
 * Build context strings from Product Hunt and Awwwards data.
 *
 * @param {Array} phProducts - Product Hunt products
 * @param {Array} awwwardsRefs - Awwwards design references
 * @returns {{ phContext: string, awwwardsContext: string }}
 */
function buildExternalContext(phProducts, awwwardsRefs) {
  let phContext = '';
  if (phProducts.length > 0) {
    phContext = `\nProduct Hunt UX Pattern References (top-rated in category):\n${phProducts
      .map(p => `- ${p.name}: ${p.tagline}. ${p.description ? p.description.substring(0, 120) : ''}`)
      .join('\n')}`;
  }

  let awwwardsContext = '';
  if (awwwardsRefs.length > 0) {
    awwwardsContext = `\nAwwwards Visual Quality Benchmarks:\n${awwwardsRefs
      .map(r => {
        const scores = `Design ${r.score_design ?? 'N/A'}/10, Usability ${r.score_usability ?? 'N/A'}/10, Creativity ${r.score_creativity ?? 'N/A'}/10, Content ${r.score_content ?? 'N/A'}/10`;
        const tech = Array.isArray(r.tech_stack) ? r.tech_stack.join(', ') : (r.tech_stack || '');
        const techLine = tech ? `\n  Tech: ${tech}` : '';
        const urlLine = r.url ? `\n  URL: ${r.url}` : '';
        const desc = r.description || '';
        return `- ${r.site_name} (${r.archetype_category}): ${scores}${techLine}${urlLine}\n  ${desc}`;
      })
      .join('\n')}`;
  }

  return { phContext, awwwardsContext };
}

/**
 * Generate persona-driven ASCII wireframe screens for a venture.
 *
 * Combines Stage 10 brand genome, Stage 14 technical architecture,
 * Product Hunt UX patterns, and Awwwards visual benchmarks to produce
 * wireframe layouts tailored to each customer persona.
 *
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {Object} params.stage10Data - Stage 10 customer & brand data (required)
 * @param {Object} [params.stage14Data] - Stage 14 technical architecture
 * @param {Object} [params.stage1Data] - Stage 1 Draft Idea
 * @param {string} [params.ventureName] - Venture display name
 * @param {Object} [params.options] - Additional options
 * @param {Object} [params.logger] - Logger instance
 * @returns {Promise<Object>} Wireframe generation result
 */
export async function analyzeStage15WireframeGenerator({
  ventureId,
  stage10Data,
  stage14Data,
  stage1Data,
  ventureName,
  options = {},
  logger = console,
}) {
  const startTime = Date.now();
  logger.log('[Stage15-WF] Starting wireframe generation', { ventureName, ventureId });

  // ── Validate required inputs ───────────────────────────────────
  if (!stage10Data?.customerPersonas || !Array.isArray(stage10Data.customerPersonas) || stage10Data.customerPersonas.length === 0) {
    throw new Error('Stage 15 wireframe generator requires Stage 10 data with customerPersonas');
  }
  if (!stage10Data?.brandGenome) {
    throw new Error('Stage 15 wireframe generator requires Stage 10 data with brandGenome');
  }

  // ── Derive category for external service lookups ───────────────
  const category = deriveCategory(stage10Data.brandGenome);
  const archetypeCategory = category === 'e-commerce' ? 'e-commerce' : category;

  // ── Fetch Awwwards design references ────────────────────────────
  const awwwardsRefs = await fetchDesignReferences(archetypeCategory, logger);

  // ── Build LLM prompt context ───────────────────────────────────
  const personaContext = buildPersonaContext(stage10Data.customerPersonas);
  const brandContext = buildBrandContext(stage10Data.brandGenome);
  const techContext = buildTechContext(stage14Data);
  const { phContext, awwwardsContext } = buildExternalContext([], awwwardsRefs);

  const ventureDescription = stage1Data?.description
    ? sanitizeForPrompt(stage1Data.description)
    : 'No description available';

  const userPrompt = `Generate persona-driven ASCII wireframe screens for this venture's product.

Venture: ${ventureName || 'Unnamed'}
Description: ${ventureDescription}

Customer Personas (from Stage 10):
${personaContext}

Brand Identity:
${brandContext}

Technical Architecture (from Stage 14):
${techContext}
${phContext}
${awwwardsContext}

IMPORTANT:
- Generate ${MIN_SCREENS}-${MAX_SCREENS} screens covering ALL personas
- Each screen must have a detailed ASCII wireframe layout (min 5 lines)
- Navigation flows must connect screens into coherent user journeys
- persona_coverage must include EVERY persona listed above
- Design choices should reflect the brand archetype and tone
- Technical feasibility should respect the architecture layers and data entities

Output ONLY valid JSON.`;

  // ── Call LLM ───────────────────────────────────────────────────
  const client = getLLMClient({ purpose: 'content-generation' });
  const response = await client.complete(SYSTEM_PROMPT, userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);

  let llmFallbackCount = 0;
  const personaNames = stage10Data.customerPersonas.map(p => p.name);

  // ── Normalize screens ──────────────────────────────────────────
  let screens = Array.isArray(parsed.screens) ? parsed.screens : [];
  if (screens.length < MIN_SCREENS) {
    llmFallbackCount++;
    // First pass: pad with fallback screens for uncovered personas
    const coveredPersonas = new Set(screens.map(s => s.persona));
    for (const pName of personaNames) {
      if (screens.length >= MIN_SCREENS) break;
      if (!coveredPersonas.has(pName)) {
        screens.push({
          name: `${pName} Dashboard`,
          purpose: `Primary dashboard for ${pName}`,
          persona: pName,
          ascii_layout: [
            '+---------------------------------------------+',
            '|  Logo    [ Nav1 ] [ Nav2 ] [ Profile ]      |',
            '+---------------------------------------------+',
            '|  Welcome, User                               |',
            '|  +------------------+  +------------------+  |',
            '|  |  Key Metric 1   |  |  Key Metric 2   |  |',
            '|  +------------------+  +------------------+  |',
            '|  [ Primary Action ]                          |',
            '+---------------------------------------------+',
          ].join('\n'),
          key_components: ['Navigation bar', 'Metrics cards', 'Primary action button'],
          interaction_notes: 'Landing screen after login. Persona can access key metrics and primary action.',
        });
        coveredPersonas.add(pName);
      }
    }
    // Second pass: pad with generic screens to reach MIN_SCREENS
    const genericScreenNames = ['Settings', 'Profile', 'Notifications', 'Help Center', 'Analytics', 'Reports'];
    let genericIdx = 0;
    while (screens.length < MIN_SCREENS && genericIdx < genericScreenNames.length) {
      const screenName = genericScreenNames[genericIdx];
      screens.push({
        name: screenName,
        purpose: `${screenName} management screen`,
        persona: personaNames[genericIdx % personaNames.length] || 'General User',
        ascii_layout: [
          '+---------------------------------------------+',
          `|  [ Back ]    ${screenName.padEnd(28)}  |`,
          '+=============================================+',
          '|                                             |',
          '|  +---------------------------------------+  |',
          `|  |  ${screenName} Content Area            |  |`,
          '|  +---------------------------------------+  |',
          '|                                             |',
          '|  [ Save ]            [ Cancel ]             |',
          '+---------------------------------------------+',
        ].join('\n'),
        key_components: ['Back navigation', 'Content area', 'Action buttons'],
        interaction_notes: `User manages ${screenName.toLowerCase()} from this screen.`,
      });
      genericIdx++;
    }
  }

  // Truncate to max
  if (screens.length > MAX_SCREENS) {
    screens = screens.slice(0, MAX_SCREENS);
  }

  // Normalize each screen
  screens = screens.map((s, i) => ({
    name: String(s.name || `Screen ${i + 1}`).substring(0, 200),
    purpose: String(s.purpose || 'General purpose screen').substring(0, 500),
    persona: String(s.persona || personaNames[0] || 'General User').substring(0, 200),
    ascii_layout: Array.isArray(s.ascii_layout)
      ? s.ascii_layout.map(line => String(line).substring(0, 200))
      : String(s.ascii_layout || '').split('\n').map(line => line.substring(0, 200)),
    key_components: Array.isArray(s.key_components)
      ? s.key_components.map(c => String(c).substring(0, 200))
      : ['Content area'],
    interaction_notes: String(s.interaction_notes || '').substring(0, 500),
  }));

  // ── Normalize navigation flows ─────────────────────────────────
  let navigationFlows = Array.isArray(parsed.navigation_flows) ? parsed.navigation_flows : [];
  if (navigationFlows.length === 0) {
    llmFallbackCount++;
    // Generate a default flow from the screens
    navigationFlows = [{
      name: 'Main User Flow',
      steps: screens.slice(0, 4).map(s => s.name),
      persona: personaNames[0] || 'General User',
      description: 'Primary navigation path through the application',
    }];
  }
  navigationFlows = navigationFlows.map(f => ({
    name: String(f.name || 'Unnamed Flow').substring(0, 200),
    steps: Array.isArray(f.steps) ? f.steps.map(s => String(s).substring(0, 200)) : [],
    persona: String(f.persona || personaNames[0] || 'General User').substring(0, 200),
    description: String(f.description || '').substring(0, 500),
  }));

  // ── Normalize persona coverage ─────────────────────────────────
  let personaCoverage = parsed.persona_coverage && typeof parsed.persona_coverage === 'object'
    ? parsed.persona_coverage
    : {};

  // Ensure every persona is represented
  for (const pName of personaNames) {
    if (!personaCoverage[pName]) {
      llmFallbackCount++;
      const primaryScreens = screens.filter(s => s.persona === pName).map(s => s.name);
      personaCoverage[pName] = {
        primary_screens: primaryScreens,
        secondary_screens: [],
        coverage_score: primaryScreens.length > 0 ? 60 : 30,
      };
    }
  }

  // Normalize each persona coverage entry
  const normalizedCoverage = {};
  for (const [pName, coverage] of Object.entries(personaCoverage)) {
    normalizedCoverage[pName] = {
      primary_screens: Array.isArray(coverage.primary_screens)
        ? coverage.primary_screens.map(s => String(s).substring(0, 200))
        : [],
      secondary_screens: Array.isArray(coverage.secondary_screens)
        ? coverage.secondary_screens.map(s => String(s).substring(0, 200))
        : [],
      coverage_score: typeof coverage.coverage_score === 'number'
        ? Math.min(100, Math.max(0, Math.round(coverage.coverage_score)))
        : 50,
    };
  }

  // ── Normalize design rationale ─────────────────────────────────
  const rawRationale = parsed.design_rationale || {};
  const designRationale = {
    brand_alignment: String(rawRationale.brand_alignment || 'Wireframes reflect the brand personality and tone').substring(0, 500),
    tech_feasibility: String(rawRationale.tech_feasibility || 'Wireframes align with the chosen technical stack').substring(0, 500),
    ux_patterns_used: Array.isArray(rawRationale.ux_patterns_used)
      ? rawRationale.ux_patterns_used.map(p => String(p).substring(0, 200))
      : [],
  };

  // ── Compute summary metrics ────────────────────────────────────
  const avgCoverageScore = Object.values(normalizedCoverage).length > 0
    ? Math.round(
        Object.values(normalizedCoverage).reduce((sum, c) => sum + c.coverage_score, 0) /
        Object.values(normalizedCoverage).length,
      )
    : 0;

  if (llmFallbackCount > 0) {
    logger.warn?.('[Stage15-WF] LLM fallback fields detected', { llmFallbackCount });
  }

  const duration = Date.now() - startTime;
  logger.log('[Stage15-WF] Wireframe generation complete', {
    duration,
    screenCount: screens.length,
    flowCount: navigationFlows.length,
    personaCount: Object.keys(normalizedCoverage).length,
    avgCoverageScore,
  });

  return {
    screens,
    navigation_flows: navigationFlows,
    persona_coverage: normalizedCoverage,
    design_rationale: designRationale,
    totalScreens: screens.length,
    totalFlows: navigationFlows.length,
    avgPersonaCoverageScore: avgCoverageScore,
    enrichment: {
      product_hunt_count: 0,
      awwwards_count: awwwardsRefs.length,
      category,
    },
    usage,
    llmFallbackCount,
  };
}

// Export constants and helpers for testing
export {
  MIN_SCREENS,
  MAX_SCREENS,
  DEFAULT_ARCHETYPE_CATEGORY,
  DEFAULT_PH_CATEGORY,
  deriveCategory,
  buildPersonaContext,
  buildBrandContext,
  buildTechContext,
  buildExternalContext,
};
