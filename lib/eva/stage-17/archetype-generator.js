/**
 * Stage 17 Design Archetype Generator
 *
 * Generates the initial batch of full-page HTML archetypes the Chairman
 * chooses from in Pass 1 of the selection funnel (selection-flow.js). Restores
 * the producer half of the pipeline that was lost when the Stitch-owned
 * lib/eva/stage-17/archetype-generator.js was deleted (commit e0a02f417b),
 * leaving selection-flow.js reading a 'stage_17_archetype' artifact type that
 * nothing wrote. Locks the venture's design tokens (via ensureTokenManifestLocked)
 * before generating so every screen -- landing and app alike -- draws from ONE
 * shared design system.
 *
 * Exports:
 *   generateArchetypeVariants(ventureId, screenName, screenId, supabase, options)
 *   generateArchetypesForAllScreens(ventureId, supabase)
 *
 * SD-LEO-INFRA-FABLE-VENTURE-DESIGN-001
 * @module lib/eva/stage-17/archetype-generator
 */

import { writeArtifact } from '../artifact-persistence-service.js';
import { getClaudeModel } from '../../config/model-config.js';
import { ensureTokenManifestLocked } from './token-manifest.js';
import { classifySurface } from '../stage-templates/analysis-steps/stage-15-wireframe-generator.js';

const VARIANT_COUNT = 4;

const ARCHETYPE_STYLES = [
  'bold and editorial with strong visual hierarchy',
  'clean and minimal with generous whitespace',
  'warm and approachable with rounded, friendly forms',
  'high-contrast and technical with precise grid alignment',
];

/**
 * Generate VARIANT_COUNT full-page HTML archetype candidates for one screen,
 * constrained by the venture's locked design tokens. Locks the tokens first
 * (idempotent) if not already locked, so this is always safe to call as the
 * first step of Stage 17 design generation for a screen.
 *
 * Model/provider config mirrors refinement.js verbatim (env override + a
 * getClaudeModel('premium-generation') fallback, provider:anthropic) so
 * pointing this at a future Fable runtime is a one-line env-var change.
 *
 * @param {string} ventureId
 * @param {string} screenName - Human-readable screen name (e.g. "Dashboard")
 * @param {string} screenId - Stable identifier correlating this screen across Pass 1/2 (e.g. a page_type slug)
 * @param {object} supabase
 * @param {object} [options]
 * @param {object} [options.screen] - Original wireframe_screens screen entry, used for surface classification
 * @returns {Promise<string[]>} Array of VARIANT_COUNT stage_17_archetype artifact IDs
 */
export async function generateArchetypeVariants(ventureId, screenName, screenId, supabase, options = {}) {
  const tokens = await ensureTokenManifestLocked(ventureId, supabase);

  const { getLLMClient } = await import('../../llm/client-factory.js');
  // COST CONTROL / FABLE RE-POINT SLOT: same pattern as refinement.js's
  // CLAUDE_MODEL_S17_GENERATION. Override here once a Fable runtime exists.
  const generationModel = process.env.CLAUDE_MODEL_S17_ARCHETYPE_GENERATION || getClaudeModel('premium-generation');
  const client = getLLMClient({ purpose: 'generation', provider: 'anthropic', model: generationModel });

  const { surface } = classifySurface(options.screen ?? { name: screenName });
  const isAppSurface = surface === 'app' || surface === 'auth';

  const colorList = (tokens?.colors ?? []).slice(0, 5).join(', ') || 'brand primary';
  const headingFont = tokens?.typeScale?.heading ?? 'serif';
  const bodyFont = tokens?.typeScale?.body ?? 'sans-serif';

  const surfaceGuidance = isAppSurface
    ? `APP-UI DIRECTIVES (this is a product/app screen, not a marketing page):
- Prioritize information density and clarity over marketing flourish.
- Include an explicit empty state (what shows with zero data) and a loading state treatment.
- Interactive elements (buttons, inputs, rows) must show a clear hover/active/focus treatment.
- Avoid large hero sections or marketing copy blocks -- this is a working screen, not a landing page.`
    : `MARKETING/LANDING DIRECTIVES (this is a customer-facing marketing page):
- Lead with a hero section (value proposition headline + subtext) and a prominent CTA.
- Include social proof and feature highlight sections where appropriate.`;

  const artifactIds = [];

  for (let i = 0; i < VARIANT_COUNT; i++) {
    const style = ARCHETYPE_STYLES[i % ARCHETYPE_STYLES.length];
    const prompt = `You are a senior UI designer producing an initial design archetype for a venture's ${screenName} screen. Generate Archetype ${i + 1} of ${VARIANT_COUNT} in the following style: ${style}.

BRAND TOKENS (LOCKED):
- Colors: ${colorList}
- Heading font: ${headingFont}
- Body font: ${bodyFont}
- Spacing: 4px grid

${surfaceGuidance}

REQUIREMENTS:
1. Produce one complete, self-contained HTML document with inline CSS only
2. Apply brand tokens via CSS custom properties (var(--token-name))
3. Include one <!-- distinctive move: ... --> HTML comment

Output ONLY the HTML — no explanation, no markdown fences.`;

    const result = await client.complete(
      'You are a senior UI designer producing initial design archetypes. Return only the complete HTML.',
      prompt,
      { stream: true, timeout: 120000, cacheTTLMs: 0, maxTokens: 32768, purpose: 'content-generation' }
    );
    const html = result?.content ?? String(result);

    const artifactId = await writeArtifact(supabase, {
      ventureId,
      lifecycleStage: 17,
      artifactType: 'stage_17_archetype',
      title: `${screenName} — Archetype ${i + 1}: ${style.split(' ')[0]}`,
      content: html,
      artifactData: {
        variantIndex: i + 1,
        style,
        screenName,
        surface,
      },
      qualityScore: 80,
      validationStatus: 'pending',
      source: 'stage-17-archetype-generator',
      metadata: { variantIndex: i + 1, screenId, surface },
    });

    artifactIds.push(artifactId);
  }

  return artifactIds;
}

/**
 * Generate archetype variants for every screen in the venture's
 * wireframe_screens artifact, all constrained by the SAME locked token
 * manifest -- landing and app screens alike (chairman: one design system,
 * generated once, applied everywhere).
 *
 * @param {string} ventureId
 * @param {object} supabase
 * @returns {Promise<{ screenId: string, screenName: string, surface: string, artifactIds: string[] }[]>}
 */
export async function generateArchetypesForAllScreens(ventureId, supabase) {
  await ensureTokenManifestLocked(ventureId, supabase);

  const { data: wireframeArt } = await supabase
    .from('venture_artifacts')
    .select('artifact_data')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'wireframe_screens')
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const screens = wireframeArt?.artifact_data?.screens ?? [];
  const results = [];

  for (const screen of screens) {
    const screenName = screen.name ?? screen.screen_name ?? screen.title ?? 'Untitled Screen';
    const { surface, page_type: screenId } = classifySurface(screen);
    const artifactIds = await generateArchetypeVariants(ventureId, screenName, screenId, supabase, { screen });
    results.push({ screenId, screenName, surface, artifactIds });
  }

  return results;
}
