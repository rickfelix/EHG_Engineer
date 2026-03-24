/**
 * SRIP Artifact Synthesizer
 * SD: SD-MAN-INFRA-SRIP-AUTO-SYNTHESIZER-001
 *
 * Maps stage 1-9 artifacts (idea brief, competitive analysis, financial model,
 * BMC, exit strategy) into the SRIP dna_json format expected by
 * srip-interview-engine.js. Enables SRIP enrichment for auto-discovered
 * ventures that lack a manual reference URL.
 *
 * Data flow:
 *   venture_artifacts (stages 1,3,4,5,8, is_current=true)
 *     → synthetic dna_json
 *     → generateInterviewDefaults()
 *     → srip_site_dna + srip_brand_interviews
 *     → checkSripEnrichment() finds data → Stage 10 LLM enriched
 */

import { generateInterviewDefaults } from './srip-interview-engine.js';

const SOURCE_TAG = 'artifact_synthesis';

/**
 * Collect stage artifacts from venture_artifacts.
 *
 * Uses venture_artifacts (committed before stage progression) instead of
 * venture_stage_work (updated after in _syncStageWork) to avoid a race
 * condition where Stage 10 starts before previous stages' work is synced.
 *
 * @param {string} ventureId
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object|null>} Map of stage number to artifact_data, or null if stage 1 missing
 */
async function collectArtifacts(ventureId, supabase) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('lifecycle_stage, artifact_data, content')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .in('lifecycle_stage', [1, 3, 4, 5, 8])
    .order('lifecycle_stage', { ascending: true });

  if (error) throw new Error(`collectArtifacts failed: ${error.message}`);

  const artifacts = {};
  for (const row of data || []) {
    let ad = row.artifact_data;
    if (!ad && row.content && typeof row.content === 'string') {
      try { ad = JSON.parse(row.content); } catch { /* skip unparseable content */ }
    }
    if (ad && typeof ad === 'object' && Object.keys(ad).length > 0) {
      artifacts[row.lifecycle_stage] = ad;
    }
  }

  // Stage 1 is the minimum required input
  if (!artifacts[1] || !artifacts[1].description) return null;

  return artifacts;
}

/**
 * Map stage artifacts into a synthetic dna_json matching the format
 * expected by generateInterviewDefaults().
 *
 * The dna_json shape mirrors a real forensic audit output:
 *   { design_tokens, copy_patterns, macro_architecture, component_behaviors, tech_stack }
 *
 * @param {Object} artifacts - Map of stage number to advisory_data
 * @returns {Object} Synthetic dna_json
 */
function mapArtifactsToDna(artifacts) {
  const stage1 = artifacts[1] || {};
  const _stage3 = artifacts[3] || {};
  const stage4 = artifacts[4] || {};
  const stage5 = artifacts[5] || {};
  const stage8 = artifacts[8] || {};

  // Derive copy_patterns from stage 1 (idea brief) and stage 8 (BMC)
  const headings = [];
  if (stage1.valueProp) headings.push(String(stage1.valueProp).substring(0, 200));
  if (stage8.valuePropositions?.items?.[0]) headings.push(String(stage8.valuePropositions.items[0]).substring(0, 200));

  const ctas = [];
  if (stage8.channels?.items) {
    for (const ch of stage8.channels.items.slice(0, 3)) {
      ctas.push(String(ch).substring(0, 100));
    }
  }
  // Infer B2B vs B2C from customer segments
  const segments = stage8.customerSegments?.items || stage8.customerSegments || [];
  const segmentText = JSON.stringify(segments).toLowerCase();
  const isB2B = /enterprise|b2b|saas|business|corporate/i.test(segmentText);
  if (isB2B) ctas.push('Contact Sales');
  else ctas.push('Get Started');

  // Derive tone from venture archetype / description
  const tone = stage1.archetype
    ? `${stage1.archetype}-inspired, professional`
    : 'Professional, modern';

  const copyPatterns = {
    tone,
    headings,
    ctas,
    sample_paragraphs: stage1.description ? [stage1.description.substring(0, 300)] : [],
    word_count: (stage1.description || '').split(/\s+/).length,
  };

  // Derive design_tokens from venture category / archetype
  const designTokens = {
    colors: {
      primary: inferPrimaryColor(stage1.archetype, stage1.ventureType),
    },
    typography: {
      font_family: isB2B ? 'Inter, sans-serif' : 'Poppins, sans-serif',
    },
    spacing: { base: '16px' },
  };

  // Derive macro_architecture from BMC structure
  const hasManySegments = (Array.isArray(segments) ? segments.length : 0) > 2;
  const macroArchitecture = {
    page_flow: hasManySegments ? 'multi-section' : 'single-page',
    responsive_approach: 'mobile-first',
  };

  // Derive component_behaviors from BMC / stage 1
  const components = [];
  if (stage8.customerRelationships?.items?.length) {
    components.push({ type: 'form', name: 'contact-form' });
  }
  if (stage4.competitors?.length > 0) {
    components.push({ type: 'card_grid', name: 'feature-comparison' });
  }
  if (stage5.revenueStreams || stage5.year1) {
    components.push({ type: 'pricing', name: 'pricing-table' });
  }

  const componentBehaviors = { components };

  // Tech stack from venture type
  const techStack = {
    framework: 'react',
    css_approach: 'tailwind',
    rendering: 'client-side',
  };

  return {
    design_tokens: designTokens,
    copy_patterns: copyPatterns,
    macro_architecture: macroArchitecture,
    component_behaviors: componentBehaviors,
    tech_stack: techStack,
    _source: SOURCE_TAG,
    _stage_sources: Object.keys(artifacts).map(Number),
  };
}

/**
 * Infer a primary brand color from venture archetype / type.
 */
function inferPrimaryColor(archetype, ventureType) {
  const a = (archetype || '').toLowerCase();
  const v = (ventureType || '').toLowerCase();

  // Business archetype → color mapping (canonical ARCHETYPES list)
  const ARCHETYPE_COLORS = {
    saas: '#1a56db',          // Trust blue
    marketplace: '#d97706',   // Marketplace amber
    ai_product: '#7c3aed',    // AI purple
    e_commerce: '#dc2626',    // Commerce red
    fintech: '#1a56db',       // Finance blue
    healthtech: '#059669',    // Health green
    edtech: '#2563eb',        // Education blue
    media: '#dc2626',         // Media red
    creator_tools: '#7c3aed', // Creative purple
    services: '#1a56db',      // Professional blue
    deeptech: '#374151',      // Tech gray
    real_estate: '#059669',   // Property green
  };
  if (ARCHETYPE_COLORS[a]) return ARCHETYPE_COLORS[a];

  // Brand personality fallback (hero, creator, caregiver, etc.)
  if (/hero|warrior|ruler/i.test(a)) return '#1a56db';
  if (/creator|magician|innovator/i.test(a)) return '#7c3aed';
  if (/caregiver|innocent|sage/i.test(a)) return '#059669';
  if (/rebel|outlaw|jester/i.test(a)) return '#dc2626';
  if (/explorer|adventurer/i.test(a)) return '#d97706';

  // venture_type fallback
  if (/health|wellness|medical/i.test(v)) return '#059669';
  if (/fintech|finance/i.test(v)) return '#1a56db';
  if (/creative|design|art/i.test(v)) return '#7c3aed';
  return '#1a56db'; // Default trust blue
}

/**
 * Check if SRIP data already exists for this venture (manual or prior synthesis).
 *
 * @param {string} ventureId
 * @param {Object} supabase
 * @returns {Promise<boolean>}
 */
async function hasExistingSripData(ventureId, supabase) {
  const { data, error } = await supabase
    .from('srip_site_dna')
    .select('id')
    .eq('venture_id', ventureId)
    .eq('status', 'completed')
    .limit(1);

  if (error) return false;
  return (data?.length || 0) > 0;
}

/**
 * Synthesize SRIP data from stage 1-9 artifacts for a venture.
 *
 * This is the main entry point. It:
 * 1. Checks if SRIP data already exists (skip if so)
 * 2. Collects stage artifacts from venture_artifacts
 * 3. Maps artifacts to synthetic dna_json
 * 4. Generates 12 interview defaults
 * 5. Persists to srip_site_dna and srip_brand_interviews
 *
 * @param {string} ventureId - Venture UUID
 * @param {Object} supabase - Supabase client
 * @param {Object} [logger=console] - Logger instance
 * @returns {Promise<{synthesized: boolean, siteDnaId?: string, prePopulatedCount?: number}>}
 */
export async function synthesizeFromArtifacts(ventureId, supabase, logger = console) {
  // 1. Skip if SRIP data already exists (manual or prior synthesis)
  const exists = await hasExistingSripData(ventureId, supabase);
  if (exists) {
    logger.log('[SRIP-Synth] Existing SRIP data found — skipping synthesis');
    return { synthesized: false };
  }

  // 2. Collect stage artifacts
  const artifacts = await collectArtifacts(ventureId, supabase);
  if (!artifacts) {
    logger.log('[SRIP-Synth] Stage 1 data missing — cannot synthesize');
    return { synthesized: false };
  }

  logger.log('[SRIP-Synth] Collected artifacts from stages:', Object.keys(artifacts).join(', '));

  // 3. Map to synthetic DNA
  const syntheticDna = mapArtifactsToDna(artifacts);

  // 4. Generate interview defaults
  const { answers, prePopulatedCount } = generateInterviewDefaults(syntheticDna);
  logger.log(`[SRIP-Synth] Generated ${prePopulatedCount}/12 interview defaults`);

  // 5. Persist srip_site_dna
  const { data: dnaRow, error: dnaError } = await supabase
    .from('srip_site_dna')
    .insert({
      venture_id: ventureId,
      reference_url: `synthesized://artifacts/${ventureId}`,
      dna_json: syntheticDna,
      status: 'completed',
      quality_score: 60, // Synthetic data scores lower than forensic audit
      created_by: SOURCE_TAG,
    })
    .select('id')
    .single();

  if (dnaError) throw new Error(`SRIP DNA insert failed: ${dnaError.message}`);

  // 6. Persist srip_brand_interviews
  const { error: interviewError } = await supabase
    .from('srip_brand_interviews')
    .insert({
      venture_id: ventureId,
      site_dna_id: dnaRow.id,
      answers,
      pre_populated_count: prePopulatedCount,
      manual_input_count: 0,
      status: 'completed',
      created_by: SOURCE_TAG,
    });

  if (interviewError) throw new Error(`SRIP interview insert failed: ${interviewError.message}`);

  logger.log('[SRIP-Synth] Synthesis complete — DNA and interview persisted');
  return { synthesized: true, siteDnaId: dnaRow.id, prePopulatedCount };
}

// For testing
export { collectArtifacts, mapArtifactsToDna, hasExistingSripData, inferPrimaryColor };
