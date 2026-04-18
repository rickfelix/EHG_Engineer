/**
 * SRIP Wireframe Generator for Stage 15
 * SD-MAN-INFRA-WIREFRAME-GENERATOR-STAGE-001
 *
 * Generates persona-driven ASCII wireframe screens by combining:
 * 1. Brand Genome (Stage 10) - brand personality, design tokens
 * 2. Technical Architecture (Stage 14) - tech stack, data model
 * 3. Product Hunt top-rated products - UX patterns (via app_rankings)
 * 4. Awwwards design references - visual quality benchmarks (design_reference_library)
 *
 * Specialist board agents score wireframes with auto-refinement.
 * Persists as blueprint_wireframes artifact for WireframeViewer.tsx.
 */

import { createSupabaseServiceClient } from '../../../lib/supabase-client.js';
import { ARTIFACT_TYPES } from '../../../lib/eva/artifact-types.js';
import { writeArtifact } from '../../../lib/eva/artifact-persistence-service.js';
import { getLLMClient } from '../../../lib/llm/index.js';
import { getDesignReferencesByArchetype } from '../../../lib/eva/services/design-reference-library.js';

const SPECIALIST_AGENTS = [
  { role: 'UX Architect', focus: 'information architecture, navigation, content hierarchy, user mental models' },
  { role: 'Interaction Designer', focus: 'user flow quality, micro-interactions, state management, feedback loops' },
  { role: 'Accessibility Expert', focus: 'WCAG 2.1 AA compliance, screen reader compatibility, keyboard navigation, color contrast' },
  { role: 'Frontend Engineer', focus: 'technical feasibility, component reusability, responsive design, performance' },
];

const MAX_REFINEMENT_CYCLES = 4;
const MIN_SCORE_THRESHOLD = 6.0;

/**
 * Fetch Brand Genome data from Stage 10 artifacts.
 */
async function fetchBrandGenome(supabase, ventureId) {
  const { data } = await supabase
    .from('venture_artifacts')
    .select('artifact_data')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'identity_persona_brand')
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();

  return data?.artifact_data || null;
}

/**
 * Fetch Technical Architecture from Stage 14 artifacts.
 */
async function fetchTechArchitecture(supabase, ventureId) {
  const { data } = await supabase
    .from('venture_artifacts')
    .select('artifact_data')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 14)
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();

  return data?.artifact_data || null;
}

/**
 * Fetch UX patterns from Product Hunt top products in the venture category.
 */
async function fetchProductHuntPatterns(supabase, ventureCategory) {
  const { data } = await supabase
    .from('app_rankings')
    .select('app_name, description, metadata')
    .eq('source', 'product_hunt')
    .order('rank', { ascending: true })
    .limit(5);

  if (!data?.length) return [];
  return data.map(d => ({
    name: d.app_name,
    description: d.description,
    ux_signals: d.metadata?.tagline || d.description?.substring(0, 100),
  }));
}

/**
 * Fetch design references from the Awwwards curated library.
 * Uses the shared service layer (design-reference-library.js) which returns
 * all fields via select('*'), sorted by score_combined DESC.
 */
async function fetchDesignReferences(_supabase, archetypeCategory) {
  const archetype = archetypeCategory || 'corporate';
  return getDesignReferencesByArchetype(archetype, 5);
}

/**
 * Build the wireframe generation prompt.
 */
function buildGenerationPrompt({ brandGenome, techArch, productHuntPatterns, designReferences, ventureName, ventureDescription }) {
  const brand = brandGenome ? JSON.stringify({
    archetype: brandGenome.archetype,
    values: brandGenome.values,
    tone: brandGenome.tone,
    audience: brandGenome.audience,
    personas: brandGenome.personas?.slice(0, 2),
  }, null, 2) : 'No brand data available';

  const tech = techArch ? JSON.stringify({
    presentation: techArch.presentation,
    api: techArch.api,
    data_entities: techArch.data_entities?.slice(0, 5),
  }, null, 2) : 'No architecture data available';

  const phPatterns = productHuntPatterns.length
    ? productHuntPatterns.map(p => `- ${p.name}: ${p.ux_signals}`).join('\n')
    : 'No Product Hunt data available';

  const designRefs = designReferences.length
    ? designReferences.map(r => {
        const scores = `Design ${r.score_design ?? 'N/A'}/10, Usability ${r.score_usability ?? 'N/A'}/10, Creativity ${r.score_creativity ?? 'N/A'}/10, Content ${r.score_content ?? 'N/A'}/10`;
        const tech = Array.isArray(r.tech_stack) ? r.tech_stack.join(', ') : (r.tech_stack || '');
        const techLine = tech ? `\n  Tech: ${tech}` : '';
        const desc = r.description || '';
        return `- ${r.site_name} (${r.url}): ${scores}${techLine}\n  ${desc}`;
      }).join('\n')
    : 'No design references available';

  return `Generate 5-7 ASCII wireframe screens for "${ventureName}".

VENTURE CONTEXT:
${ventureDescription || 'No description provided'}

BRAND GENOME (Stage 10):
${brand}

TECHNICAL ARCHITECTURE (Stage 14):
${tech}

UX PATTERNS (Product Hunt Top Products):
${phPatterns}

DESIGN REFERENCES (Awwwards Award Winners):
${designRefs}

OUTPUT FORMAT (JSON):
{
  "screens": [
    {
      "name": "Screen Name",
      "purpose": "What this screen does",
      "wireframe": "ASCII art wireframe using box-drawing characters",
      "components": ["component1", "component2"],
      "user_flow_notes": "How user arrives and exits this screen",
      "brand_alignment": "How this reflects brand personality"
    }
  ],
  "flows": [
    {
      "name": "Flow Name",
      "steps": ["screen1 -> screen2 -> screen3"],
      "persona": "Which persona this flow serves"
    }
  ],
  "design_system_notes": {
    "typography": "Recommended fonts/sizes based on brand",
    "color_palette": "Primary/secondary colors from brand genome",
    "component_library": "Key reusable components identified"
  }
}

REQUIREMENTS:
- Each wireframe uses ASCII box-drawing characters (┌─┐│└─┘)
- Show headers, navigation, content areas, CTAs clearly
- Reference brand genome values in design decisions
- Account for technical architecture (what data is displayed, API calls)
- Draw from award-winning design patterns where relevant
- Include at least: Landing page, Dashboard, Key feature page, Settings, Mobile variant`;
}

/**
 * Score wireframes using specialist board agents.
 */
async function scoreWithSpecialists(llmClient, screens, flows) {
  const scores = [];
  const wireframeSummary = screens.map(s => `${s.name}: ${s.purpose}`).join('; ');

  for (const agent of SPECIALIST_AGENTS) {
    try {
      const response = await llmClient.complete(
        `You are a ${agent.role} specializing in ${agent.focus}.`,
        `Score these wireframes 1-10:

Screens: ${wireframeSummary}
Flows: ${flows.map(f => f.name).join(', ')}

Return JSON: {"score": <number>, "rationale": "<brief explanation>", "improvements": ["<suggestion>"]}`,
        { maxTokens: 500 }
      );

      const text = response.text || response.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        scores.push({
          agent: agent.role,
          score: Math.min(10, Math.max(1, parsed.score || 5)),
          rationale: parsed.rationale || '',
          improvements: parsed.improvements || [],
        });
      }
    } catch {
      scores.push({ agent: agent.role, score: 5, rationale: 'Scoring unavailable', improvements: [] });
    }
  }

  return scores;
}

/**
 * Main wireframe generation function.
 */
export async function generateWireframes({
  ventureId,
  ventureName = 'Unknown Venture',
  ventureDescription = '',
  archetypeCategory = 'corporate',
  logger = console,
  _supabase = null,
  _llmClient = null,
  _writeArtifactFn = null,
  _fetchDesignRefsFn = null,
}) {
  const supabase = _supabase || createSupabaseServiceClient();
  const startTime = Date.now();
  logger.log('[WireframeGen] Starting for venture:', ventureName);

  // 1. Fetch all 4 data sources in parallel
  const fetchRefs = _fetchDesignRefsFn || ((_sb, cat) => fetchDesignReferences(_sb, cat));
  const [brandGenome, techArch, productHuntPatterns, designReferences] = await Promise.all([
    fetchBrandGenome(supabase, ventureId),
    fetchTechArchitecture(supabase, ventureId),
    fetchProductHuntPatterns(supabase, archetypeCategory),
    fetchRefs(supabase, archetypeCategory),
  ]);

  logger.log('[WireframeGen] Data sources loaded:', {
    brandGenome: !!brandGenome,
    techArch: !!techArch,
    productHunt: productHuntPatterns.length,
    designRefs: designReferences.length,
  });

  // 2. Generate wireframes via LLM
  const llmClient = _llmClient || getLLMClient();
  const prompt = buildGenerationPrompt({
    brandGenome, techArch, productHuntPatterns, designReferences,
    ventureName, ventureDescription,
  });

  let wireframes = null;
  let refinementCount = 0;
  let specialistScores = [];

  for (let cycle = 0; cycle <= MAX_REFINEMENT_CYCLES; cycle++) {
    const userPrompt = cycle === 0
      ? prompt
      : `${prompt}\n\nPREVIOUS SPECIALIST FEEDBACK (improve based on this):\n${specialistScores.map(s => `${s.agent}: Score ${s.score}/10 - ${s.rationale}\nImprovements: ${s.improvements.join(', ')}`).join('\n\n')}`;

    const response = await llmClient.complete(
      'You are an expert wireframe designer. Return valid JSON.',
      userPrompt,
      { maxTokens: 4000 }
    );

    const text = response.text || response.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        wireframes = JSON.parse(jsonMatch[0]);
      } catch {
        logger.warn('[WireframeGen] JSON parse failed on cycle', cycle);
        continue;
      }
    }

    if (!wireframes?.screens?.length) {
      logger.warn('[WireframeGen] No screens generated on cycle', cycle);
      continue;
    }

    // Score with specialist board
    specialistScores = await scoreWithSpecialists(llmClient, wireframes.screens, wireframes.flows || []);
    const avgScore = specialistScores.reduce((sum, s) => sum + s.score, 0) / specialistScores.length;
    logger.log(`[WireframeGen] Cycle ${cycle}: avg score ${avgScore.toFixed(1)}/10`);

    if (avgScore >= MIN_SCORE_THRESHOLD || cycle === MAX_REFINEMENT_CYCLES) {
      refinementCount = cycle;
      break;
    }
  }

  if (!wireframes?.screens?.length) {
    logger.error('[WireframeGen] Failed to generate wireframes after all cycles');
    return { success: false, error: 'Generation failed' };
  }

  // 3. Persist as blueprint_wireframes artifact
  const artifactData = {
    screens: wireframes.screens,
    flows: wireframes.flows || [],
    design_system_notes: wireframes.design_system_notes || {},
    specialist_scores: specialistScores,
    data_sources: {
      brand_genome: !!brandGenome,
      tech_architecture: !!techArch,
      product_hunt_count: productHuntPatterns.length,
      design_references_count: designReferences.length,
      design_references: designReferences.map(r => r.site_name),
    },
    refinement_cycles: refinementCount,
  };

  const avgScore = specialistScores.reduce((sum, s) => sum + s.score, 0) / specialistScores.length;

  const writeFn = _writeArtifactFn || writeArtifact;
  const artifactId = await writeFn(supabase, {
    ventureId,
    lifecycleStage: 15,
    artifactType: ARTIFACT_TYPES.BLUEPRINT_WIREFRAMES,
    title: `UI Wireframes - ${ventureName}`,
    artifactData,
    metadata: {
      screen_count: wireframes.screens.length,
      flow_count: (wireframes.flows || []).length,
      avg_specialist_score: avgScore,
      refinement_cycles: refinementCount,
      design_system_applied: true,
      archetype_category: archetypeCategory,
    },
    qualityScore: Math.round(avgScore * 10),
    source: 'srip-wireframe-generator',
    isCurrent: true,
  });

  const duration = Date.now() - startTime;
  logger.log(`[WireframeGen] Complete in ${duration}ms: ${wireframes.screens.length} screens, avg score ${avgScore.toFixed(1)}`);

  return {
    success: true,
    artifactId,
    screen_count: wireframes.screens.length,
    flow_count: (wireframes.flows || []).length,
    specialist_scores: specialistScores,
    avg_score: avgScore,
    refinement_cycles: refinementCount,
    duration_ms: duration,
  };
}
