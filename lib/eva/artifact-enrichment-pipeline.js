/**
 * Artifact Enrichment Pipeline
 *
 * SD-LEO-INFRA-BRIDGE-ARTIFACT-ENRICHMENT-001
 *
 * Two-pass LLM enrichment for SDs created by lifecycle-sd-bridge:
 *
 * Pass 1 (once per venture): Summarize each artifact into 2-3 sentences with tags.
 *   Results cached in venture_artifact_summaries table.
 *
 * Pass 2 (once per SD): Generate enriched SD description from artifact summaries
 *   + resolved mapping context. Includes persona context, wireframe refs, data entities.
 *
 * FAIL-CLOSED: If either pass fails, the pipeline throws. No thin SD fallback.
 *
 * @module lib/eva/artifact-enrichment-pipeline
 */

import { getValidationClient, getLLMClient } from '../llm/client-factory.js';

const PASS1_MAX_TOKENS = 500;
const PASS2_MAX_TOKENS = 1500;

/**
 * Pass 1: Summarize all venture artifacts, caching results.
 *
 * Checks venture_artifact_summaries for existing summaries first.
 * Only summarizes artifacts that are missing or stale (source updated after summary).
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {Object[]} artifacts - Array of venture_artifacts rows
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger
 * @returns {Promise<Map<string, Object>>} Map of artifact_type -> { summary_text, tags }
 */
export async function summarizeArtifacts(supabase, ventureId, artifacts, options = {}) {
  const { logger = console } = options;

  if (!artifacts.length) {
    return new Map();
  }

  // Load existing cached summaries
  const { data: cached } = await supabase
    .from('venture_artifact_summaries')
    .select('artifact_id, artifact_type, summary_text, tags, source_updated_at')
    .eq('venture_id', ventureId);

  const cachedByArtifactId = new Map();
  for (const row of (cached || [])) {
    cachedByArtifactId.set(row.artifact_id, row);
  }

  const summaryMap = new Map();
  const toSummarize = [];

  for (const art of artifacts) {
    const existing = cachedByArtifactId.get(art.id);
    if (existing) {
      // Check staleness: if artifact was updated after summary was created
      const artUpdated = art.updated_at ? new Date(art.updated_at) : null;
      const summarySourceDate = existing.source_updated_at ? new Date(existing.source_updated_at) : null;

      if (!artUpdated || !summarySourceDate || artUpdated <= summarySourceDate) {
        // Cache hit — use existing summary
        summaryMap.set(art.artifact_type, {
          summary_text: existing.summary_text,
          tags: existing.tags || [],
        });
        continue;
      }
    }
    // Needs summarization
    toSummarize.push(art);
  }

  if (toSummarize.length > 0) {
    logger.log(`[EnrichmentPipeline] Pass 1: summarizing ${toSummarize.length} artifacts (${artifacts.length - toSummarize.length} cached)`);
  } else {
    logger.log(`[EnrichmentPipeline] Pass 1: all ${artifacts.length} artifacts cached`);
    return summaryMap;
  }

  // Summarize in batches
  const llm = getValidationClient();
  for (const art of toSummarize) {
    const contentText = typeof art.content === 'string'
      ? art.content
      : JSON.stringify(art.artifact_data || art.content || {});

    // Truncate if too long (keep first 3000 chars for summarization)
    const truncated = contentText.length > 3000 ? contentText.slice(0, 3000) + '...' : contentText;

    const prompt = `Summarize this venture artifact in 2-3 concise sentences. Extract 3-5 keyword tags.

Artifact type: ${art.artifact_type}
Stage: ${art.lifecycle_stage}
Title: ${art.title || 'N/A'}

Content:
${truncated}

Respond in JSON format: { "summary": "...", "tags": ["tag1", "tag2", ...] }`;

    let summary, tags;
    try {
      const response = await llm.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: PASS1_MAX_TOKENS,
        temperature: 0.3,
      });

      const text = response.choices?.[0]?.message?.content || response.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(`Pass 1 failed for ${art.artifact_type}: no JSON in response`);
      }
      const parsed = JSON.parse(jsonMatch[0]);
      summary = parsed.summary;
      tags = parsed.tags || [];
    } catch (err) {
      throw new Error(`[EnrichmentPipeline] Pass 1 FAILED for artifact ${art.artifact_type} (${art.id}): ${err.message}`);
    }

    // Cache the summary
    const { error: upsertError } = await supabase
      .from('venture_artifact_summaries')
      .upsert({
        venture_id: ventureId,
        artifact_id: art.id,
        artifact_type: art.artifact_type,
        lifecycle_stage: art.lifecycle_stage,
        summary_text: summary,
        tags,
        llm_model: llm.model || llm.defaultModel || 'unknown',
        token_count: summary.split(/\s+/).length,
        source_updated_at: art.updated_at || new Date().toISOString(),
      }, { onConflict: 'venture_id,artifact_id' });

    if (upsertError) {
      logger.warn(`[EnrichmentPipeline] Failed to cache summary for ${art.artifact_type}: ${upsertError.message}`);
    }

    summaryMap.set(art.artifact_type, { summary_text: summary, tags });
  }

  return summaryMap;
}

/**
 * Pass 2: Generate an enriched SD description from artifact summaries.
 *
 * @param {Object} params
 * @param {string} params.sdTitle - The SD title
 * @param {string} params.sdDescription - The original (thin) SD description
 * @param {string} params.sdLayer - The SD's architecture layer (data/api/ui/tests)
 * @param {Object} params.resolvedArtifacts - From resolveArtifactsForSD: { required, supplemental }
 * @param {Map} params.summaryMap - From summarizeArtifacts: artifact_type -> { summary_text, tags }
 * @param {Object} params.ventureContext - { id, name }
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger
 * @returns {Promise<Object>} { enrichedDescription, artifactReferences }
 */
export async function enrichSDDescription(params, options = {}) {
  const { sdTitle, sdDescription, sdLayer, resolvedArtifacts, summaryMap, ventureContext } = params;
  const { logger: _logger = console } = options;

  const allArtifacts = [...(resolvedArtifacts.required || []), ...(resolvedArtifacts.supplemental || [])];

  if (allArtifacts.length === 0) {
    throw new Error(`[EnrichmentPipeline] Pass 2 FAILED: no artifacts resolved for SD "${sdTitle}" (layer: ${sdLayer})`);
  }

  // Build artifact context block
  const artifactContext = allArtifacts.map(art => {
    const summary = summaryMap.get(art.artifact_type);
    return `[${art.classification.toUpperCase()}] ${art.artifact_type} (Stage ${art.lifecycle_stage}):
  ${summary ? summary.summary_text : 'No summary available'}
  Tags: ${summary ? summary.tags.join(', ') : 'none'}`;
  }).join('\n\n');

  const prompt = `You are enriching an SD (Strategic Directive) description with upstream artifact context.

SD Title: ${sdTitle}
SD Layer: ${sdLayer}
Venture: ${ventureContext?.name || 'Unknown'}

Original Description:
${sdDescription}

Upstream Artifact Context:
${artifactContext}

Generate an enriched SD description that:
1. Preserves the original intent and scope
2. Adds specific persona names/characteristics from identity artifacts
3. References specific wireframe sections or UI patterns if applicable
4. Names specific data entities, API endpoints, or schema elements from blueprints
5. Includes 2-3 specific acceptance criteria derived from artifact context

Respond in JSON format:
{
  "enriched_description": "...",
  "artifact_references": [
    { "artifact_type": "...", "artifact_id": "...", "relevance": "required|supplemental" }
  ],
  "extracted_context": {
    "persona_names": [],
    "data_entities": [],
    "api_endpoints": [],
    "wireframe_sections": []
  }
}`;

  let result;
  try {
    const llm = getLLMClient({ effort: 'medium' });
    const response = await llm.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: PASS2_MAX_TOKENS,
      temperature: 0.4,
    });

    const text = response.choices?.[0]?.message?.content || response.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in response');
    }
    result = JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new Error(`[EnrichmentPipeline] Pass 2 FAILED for SD "${sdTitle}": ${err.message}`);
  }

  if (!result.enriched_description) {
    throw new Error(`[EnrichmentPipeline] Pass 2 FAILED: empty enriched_description for SD "${sdTitle}"`);
  }

  // Build artifact_references with IDs
  const artifactReferences = allArtifacts.map(art => ({
    artifact_type: art.artifact_type,
    artifact_id: art.id,
    lifecycle_stage: art.lifecycle_stage,
    classification: art.classification,
  }));

  return {
    enrichedDescription: result.enriched_description,
    artifactReferences,
    extractedContext: result.extracted_context || {},
  };
}

/**
 * Run the full enrichment pipeline for a set of SDs.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {Object[]} artifacts - venture_artifacts rows for this venture (stages 0-18)
 * @param {Object[]} sdSpecs - Array of { title, description, layer, ... } for each SD to enrich
 * @param {Object} mapping - From loadMapping()
 * @param {Object} ventureContext - { id, name }
 * @param {Object} [options]
 * @returns {Promise<Object[]>} Array of { sdIndex, enrichedDescription, artifactReferences, extractedContext }
 */
export async function runEnrichmentPipeline(supabase, ventureId, artifacts, sdSpecs, mapping, ventureContext, options = {}) {
  const { logger = console } = options;
  const { resolveArtifactsForSD } = await import('./artifact-mapping-resolver.js');

  // Pass 1: Summarize all artifacts (cached)
  const summaryMap = await summarizeArtifacts(supabase, ventureId, artifacts, { logger });

  // Pass 2: Enrich each SD
  const results = [];
  for (let i = 0; i < sdSpecs.length; i++) {
    const spec = sdSpecs[i];
    const resolved = resolveArtifactsForSD(mapping, spec.layer || 'data', artifacts);

    const enrichment = await enrichSDDescription({
      sdTitle: spec.title,
      sdDescription: spec.description,
      sdLayer: spec.layer || 'data',
      resolvedArtifacts: resolved,
      summaryMap,
      ventureContext,
    }, { logger });

    results.push({
      sdIndex: i,
      ...enrichment,
    });
  }

  return results;
}
