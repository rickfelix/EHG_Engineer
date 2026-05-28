/**
 * Stage 17 Design Refinement Engine
 *
 * Generates 4 refined design variants from the 2 archetypes the Chairman
 * selects in Pass 1 of the selection funnel. This is the LIVE GVOS Stage-17
 * refinement path — invoked by selection-flow.js submitPass1Selection.
 *
 * Extracted verbatim from archetype-generator.js (SD-LEO-REFAC-EXTRACT-S17-ARCHETYPE-001)
 * to decouple the live refinement from the dead legacy archetype generation,
 * so the generation-only remainder could be deleted.
 *
 * Exports:
 *   generateRefinedVariants(ventureId, screenName, selectedHtmls, tokens, supabase, options)
 *
 * @module lib/eva/stage-17/refinement
 */

import { writeArtifact } from '../artifact-persistence-service.js';

/**
 * Generate 4 refined variants from 2 selected archetype HTMLs.
 * Used by selection-flow.js Pass 1.
 *
 * @param {string} ventureId
 * @param {string} screenName - Screen identifier for artifact titles
 * @param {string[]} selectedHtmls - Array of 2 selected archetype HTML strings
 * @param {object} tokens - Brand token manifest
 * @param {object} supabase
 * @param {object} [options]
 * @param {string} [options.mobileContextHtml] - Approved mobile HTML for desktop reference
 * @returns {Promise<string[]>} Array of 4 artifact IDs
 */
export async function generateRefinedVariants(ventureId, screenName, selectedHtmls, tokens, supabase, options = {}) {
  const { getLLMClient } = await import('../../llm/client-factory.js');
  // COST CONTROL (2026-04-19; model bumped 2026-05-28): Refined variant HTML generation
  // uses Opus 4.8 explicitly. Same rationale as generateArchetypeVariants above — variant
  // HTML requires Opus-level design fidelity. All other LLM calls default to Google Gemini
  // for cost savings. Override via CLAUDE_MODEL_S17_GENERATION env var if needed.
  const generationModel = process.env.CLAUDE_MODEL_S17_GENERATION || 'claude-opus-4-8';
  const client = getLLMClient({ purpose: 'generation', provider: 'anthropic', model: generationModel });

  const mobileContext = options.mobileContextHtml
    ? `\n\nMOBILE REFERENCE (approved mobile design for this screen — desktop must maintain visual coherence):\n${options.mobileContextHtml.slice(0, 2000)}`
    : '';

  const colorList = (tokens?.colors ?? []).slice(0, 5).join(', ') || 'brand primary';
  const headingFont = tokens?.typeScale?.heading ?? 'serif';
  const bodyFont = tokens?.typeScale?.body ?? 'sans-serif';

  const refinementStyles = [
    'elevated visual polish with refined spacing and micro-interactions',
    'high contrast with strong typographic hierarchy',
    'warm and approachable with softer transitions',
    'minimal and focused with reduced visual noise',
  ];

  const artifactIds = [];

  for (let i = 0; i < 4; i++) {
    const prompt = `You are a senior UI designer refining chosen design archetypes. Generate Refined Variant ${i + 1} of 4 by synthesizing the best elements of the two chosen archetypes below.

BRAND TOKENS (LOCKED):
- Colors: ${colorList}
- Heading font: ${headingFont}
- Body font: ${bodyFont}
- Spacing: 4px grid

REFINEMENT DIRECTION: ${refinementStyles[i]}

HIGH-END AESTHETIC DIRECTIVES (Awwwards-level quality expected):
- Spatial Composition: Use unexpected layouts — grid-breaking elements, overlapping layers, generous
  negative space. Do NOT default to safe, symmetrical, template-like grids.
- Typography: Pair a distinctive display/heading font treatment (weight, size, letter-spacing, case)
  against a refined body font. Create typographic tension and hierarchy, not bland uniform sizing.
- Motion: Include ONE well-orchestrated, staggered page-load animation using CSS-only (@keyframes +
  animation-delay). One cohesive entrance moment, not scattered micro-interactions.
  Use @media (prefers-reduced-motion: reduce) to disable.

SELECTED ARCHETYPE 1:
${selectedHtmls[0].slice(0, 2000)}

SELECTED ARCHETYPE 2:
${selectedHtmls[1].slice(0, 2000)}${mobileContext}

REQUIREMENTS:
1. Produce one complete, self-contained HTML document with inline CSS only
2. Apply brand tokens via CSS custom properties (var(--token-name))
3. Include one <!-- distinctive move: ... --> HTML comment (MANDATORY)

SELF-VERIFICATION (mandatory before finalizing):
After generating the HTML, review against these checks:
1. Does the layout break away from generic template patterns?
2. Is there clear typographic tension between heading and body treatments?
3. Is there exactly one cohesive CSS entrance animation?
4. Does the distinctive move create real visual impact?
5. Are brand tokens applied via CSS custom properties?
If any check fails, revise before outputting. Annotate:
<!-- verified: spatial=[pass/revised], typography=[pass/revised], motion=[pass/revised] -->

Output ONLY the HTML — no explanation, no markdown fences.`;

    const refinedResult = await client.complete(
      'You are a senior UI designer refining chosen design archetypes. Return only the complete HTML.',
      prompt,
      { stream: true, timeout: 120000, cacheTTLMs: 0, maxTokens: 32768, purpose: 'content-generation' }
    );
    const refinedHtml = refinedResult?.content ?? String(refinedResult);

    const artifactId = await writeArtifact(supabase, {
      ventureId,
      lifecycleStage: 17,
      artifactType: 'stage_17_refined',
      title: `${screenName} — Refined ${i + 1}: ${refinementStyles[i].split(' ')[0]}`,
      content: refinedHtml,
      artifactData: {
        variantIndex: i + 1,
        refinementDirection: refinementStyles[i],
        screenName,
      },
      qualityScore: 85,
      validationStatus: 'pending',
      source: 'stage-17-archetype-generator',
      metadata: { variantIndex: i + 1 },
    });

    artifactIds.push(artifactId);
  }

  return artifactIds;
}
