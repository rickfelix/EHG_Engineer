/**
 * Stage 16 Analysis Step — Venture-Grounded Positioning Brief (CO-OUTPUT)
 * Phase: THE BLUEPRINT (Stages 13-16)
 * SD: SD-LEO-FEAT-VENTURE-GROUNDED-STAGE-001 (Concern A — FR-1/FR-2)
 *
 * Produces a venture-grounded "positioning brief" at Stage 16 as a CO-OUTPUT
 * alongside the existing financial projection. Stage 17 design and Stage 18
 * marketing consume this brief, so it MUST be produced before Stage 17 — this
 * realizes the "marketing-before-design" reorder as a Stage-16 artifact (no
 * stage renumber).
 *
 * The brief is grounded in already-fetched upstream artifacts: venture name +
 * persona + brand voice + pricing + GTM + wireframes. It is persisted to the
 * venture_artifacts `content` column (JSON) as artifact_type
 * 'blueprint_positioning_brief' so the EHG GVOS composer can parse it.
 *
 * LLM-call mechanism is mirrored EXACTLY from stage-18-marketing-copy.js
 * (getLLMClient() cascade + parseJSON/extractUsage), including a deterministic
 * no-LLM fallback (buildFallbackBrief).
 *
 * Exact artifact contract (cross-repo — parsed by the EHG frontend from the
 * venture_artifacts `content` column):
 *   {
 *     positioning_statement: string,   // one-paragraph market positioning
 *     tagline: string,                 // short brand line
 *     hero_headline: string,           // landing hero headline
 *     hero_subhead?: string,
 *     brand_voice: { tone: string, attributes: string[] },
 *     key_messages: string[],          // 3-5 core messages
 *     per_persona_angles?: [{ persona: string, angle: string }]
 *   }
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-16-positioning-brief
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';

// Upstream artifact types this brief grounds itself in. These are a subset of
// the S16 upstream chain (CROSS_STAGE_DEPS[16] = [1, 13, 14, 15]) plus
// identity/pricing/GTM artifacts that the EVA worker fetches via the
// fetchUpstreamArtifacts __byType map when present. We read defensively from
// whatever upstream shape is provided (see resolvePositioningInputs).
export const POSITIONING_UPSTREAM_ARTIFACT_TYPES = Object.freeze([
  'truth_idea_brief',                 // S1  — problem statement, value prop
  'identity_persona_brand',           // S10 — customer personas with pain points
  'identity_brand_guidelines',        // S10 — brand voice, messaging pillars
  'identity_naming_visual',           // S11 — brand name, color palette, tagline
  'identity_brand_name',              // S11 — selected name + rationale
  'engine_pricing_model',             // S7  — pricing tiers
  'identity_gtm_sales_strategy',      // S12 — channels, positioning, launch strategy
  'wireframe_screens',                // S15 — wireframe screens (surface-aware)
]);

const KEY_MESSAGE_MIN = 3;
const KEY_MESSAGE_MAX = 5;

// 2026-05-21: LLM strategy mirrors stage-18-marketing-copy.js — use the
// getLLMClient() cascade (Anthropic > Google > Ollama) for positioning copy.
const SYSTEM_PROMPT = `You are EVA's Positioning Studio. Generate a venture-grounded positioning brief from upstream artifacts.

You MUST output valid JSON with exactly this structure:
{
  "positioning_statement": "One paragraph (2-4 sentences) of market positioning: who the product is for, the category, the key differentiator, and the outcome it delivers.",
  "tagline": "A short brand line (max 10 words).",
  "hero_headline": "A landing-page hero headline (max 12 words).",
  "hero_subhead": "A supporting hero subhead (max 25 words).",
  "brand_voice": {
    "tone": "A short phrase describing the overall tone (e.g. 'confident and approachable').",
    "attributes": ["3-5 single-word or short-phrase voice attributes"]
  },
  "key_messages": ["3-5 core messages, each one sentence, benefit-led not feature-led"],
  "per_persona_angles": [
    { "persona": "Primary persona name", "angle": "How positioning is framed for this persona (one sentence)." }
  ]
}

Rules:
- GROUND every field in the upstream artifacts provided. Do not invent facts not supported by the inputs.
- Use the PRIMARY PERSONA's pain points to frame the positioning_statement and key_messages.
- Match the BRAND VOICE from brand guidelines (formal vs casual, technical vs simple).
- Reflect the venture's NAME and TAGLINE candidates from naming/visual identity when available.
- Use GTM positioning + pricing to sharpen the differentiator in the positioning_statement.
- key_messages MUST contain between ${KEY_MESSAGE_MIN} and ${KEY_MESSAGE_MAX} entries.
- per_persona_angles is OPTIONAL but recommended when multiple personas exist.
- All copy must feel authentic and human, not AI-generated boilerplate.`;

/**
 * Read a possibly-nested value from an upstream artifact, accepting the several
 * shapes EVA passes (raw object, __byType-wrapped, artifact_data/content nested).
 * Pure helper — no I/O.
 *
 * @param {*} artifact
 * @returns {*} The most-specific data object for the artifact, or the input.
 */
function unwrapArtifact(artifact) {
  if (!artifact || typeof artifact !== 'object') return artifact;
  // EVA worker shapes: { artifact_data }, { content }, or the data itself.
  if (artifact.artifact_data && typeof artifact.artifact_data === 'object') return artifact.artifact_data;
  if (artifact.content && typeof artifact.content === 'object') return artifact.content;
  return artifact;
}

/**
 * Pull the per-artifact-type map out of whatever upstream shape is provided.
 * Accepts either:
 *   - A flat object keyed by artifact_type (e.g. { identity_persona_brand: {...} })
 *   - The EVA stageN __byType wrapper (e.g. { stage10Data: { __byType: {...} } }
 *     merged across stages), or any object exposing `__byType`.
 *   - An object whose values themselves carry `.__byType`.
 * Returns a single flat { artifactType: data } map. Pure — no I/O.
 *
 * @param {Object|null|undefined} upstream
 * @returns {Object<string, *>}
 */
export function collectUpstreamByType(upstream) {
  const out = {};
  if (!upstream || typeof upstream !== 'object') return out;

  const absorb = (byType) => {
    if (!byType || typeof byType !== 'object') return;
    for (const [type, artifact] of Object.entries(byType)) {
      if (out[type] === undefined) out[type] = unwrapArtifact(artifact);
    }
  };

  // Case 1: top-level __byType
  if (upstream.__byType) absorb(upstream.__byType);

  // Case 2 & 3: walk values — either stageNData wrappers with .__byType, or a
  // flat type-keyed map. We additionally treat any key that is a known artifact
  // type as a direct entry.
  for (const [key, value] of Object.entries(upstream)) {
    if (key === '__byType') continue;
    if (value && typeof value === 'object' && value.__byType) {
      absorb(value.__byType);
    }
    // Direct type-keyed entry (flat map shape).
    if (POSITIONING_UPSTREAM_ARTIFACT_TYPES.includes(key) && out[key] === undefined) {
      out[key] = unwrapArtifact(value);
    }
  }

  return out;
}

/**
 * Extract a human persona name from an identity_persona_brand artifact,
 * tolerating the common data shapes. Pure — no I/O.
 *
 * @param {*} persona
 * @returns {string|null}
 */
function extractPersonaName(persona) {
  if (!persona) return null;
  if (typeof persona === 'string') return persona;
  if (persona.primary_persona?.name) return persona.primary_persona.name;
  if (Array.isArray(persona.personas) && persona.personas[0]?.name) return persona.personas[0].name;
  if (persona.name) return persona.name;
  if (persona.persona_name) return persona.persona_name;
  return null;
}

/**
 * Extract all persona names (for per_persona_angles grounding). Pure — no I/O.
 * @param {*} persona
 * @returns {string[]}
 */
function extractAllPersonaNames(persona) {
  const names = [];
  if (!persona || typeof persona !== 'object') return names;
  if (persona.primary_persona?.name) names.push(persona.primary_persona.name);
  if (Array.isArray(persona.personas)) {
    for (const p of persona.personas) {
      if (p?.name && !names.includes(p.name)) names.push(p.name);
    }
  }
  if (persona.name && !names.includes(persona.name)) names.push(persona.name);
  return names;
}

/**
 * Resolve positioning inputs from already-fetched upstream artifacts.
 *
 * Pulls venture name + persona + brand + pricing + GTM + wireframes out of the
 * upstream artifact map. Returns a normalized, graceful-on-missing structure
 * that buildPositioningContext + the LLM prompt consume. Pure — no I/O, no LLM.
 *
 * @param {Object|null|undefined} upstream - Upstream artifact map. Accepts the
 *   EVA stageN __byType shape, a flat type-keyed map, or { ventureName, ... }.
 * @returns {{
 *   ventureName: string|null,
 *   ideaBrief: *,
 *   persona: *,
 *   personaName: string|null,
 *   personaNames: string[],
 *   brandGuidelines: *,
 *   namingVisual: *,
 *   brandName: *,
 *   pricing: *,
 *   gtm: *,
 *   wireframes: *,
 *   availableTypes: string[]
 * }}
 */
export function resolvePositioningInputs(upstream) {
  const byType = collectUpstreamByType(upstream);

  // ventureName may be passed explicitly (worker params) rather than as an artifact.
  const ventureName =
    (upstream && typeof upstream === 'object' && typeof upstream.ventureName === 'string' && upstream.ventureName)
    || byType.identity_brand_name?.name
    || byType.identity_naming_visual?.brand_name
    || byType.identity_naming_visual?.name
    || null;

  const persona = byType.identity_persona_brand ?? null;

  const availableTypes = POSITIONING_UPSTREAM_ARTIFACT_TYPES.filter((t) => byType[t] !== undefined);

  return {
    ventureName,
    ideaBrief: byType.truth_idea_brief ?? null,
    persona,
    personaName: extractPersonaName(persona),
    personaNames: extractAllPersonaNames(persona),
    brandGuidelines: byType.identity_brand_guidelines ?? null,
    namingVisual: byType.identity_naming_visual ?? null,
    brandName: byType.identity_brand_name ?? null,
    pricing: byType.engine_pricing_model ?? null,
    gtm: byType.identity_gtm_sales_strategy ?? null,
    wireframes: byType.wireframe_screens ?? null,
    availableTypes,
  };
}

/**
 * Build a prompt context block from resolved positioning inputs. Gracefully
 * handles missing fields (emits "(not available)" markers rather than throwing
 * or omitting structure). Pure — no I/O.
 *
 * @param {ReturnType<typeof resolvePositioningInputs>} inputs
 * @returns {string} A formatted context block for the positioning prompt.
 */
export function buildPositioningContext(inputs) {
  const safe = inputs && typeof inputs === 'object' ? inputs : {};
  const lines = [];

  lines.push(`## Venture: ${safe.ventureName || 'Unknown Venture'}`);

  if (safe.personaName) {
    lines.push(`## Primary Persona: ${safe.personaName}`);
  } else {
    lines.push('## Primary Persona: (not available)');
  }

  const block = (heading, value) => {
    if (value === null || value === undefined) {
      lines.push(`## ${heading}: (not available)`);
      return;
    }
    const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    lines.push(`## ${heading}\n${body}`);
  };

  block('Idea Brief (S1)', safe.ideaBrief);
  block('Personas & Brand (S10) — USE THIS PERSONA IN POSITIONING', safe.persona);
  block('Brand Guidelines (S10) — MATCH THIS VOICE', safe.brandGuidelines);
  block('Naming & Visual Identity (S11)', safe.namingVisual);
  block('Brand Name (S11)', safe.brandName);
  block('Pricing Model (S7)', safe.pricing);
  block('GTM Strategy (S12)', safe.gtm);
  block('Stage 15 Wireframes', safe.wireframes);

  const availableCount = Array.isArray(safe.availableTypes) ? safe.availableTypes.length : 0;
  lines.push(`\n## Available Upstream Data: ${availableCount}/${POSITIONING_UPSTREAM_ARTIFACT_TYPES.length} artifacts`);
  if (availableCount < 3) {
    lines.push('⚠️ Limited upstream data. Ground the brief in what is available; do not fabricate.');
  }

  lines.push('\nGenerate the complete positioning brief JSON now.');
  return lines.join('\n');
}

/**
 * Deterministic, no-LLM fallback brief. Mirrors the shape contract exactly so
 * downstream consumers (EHG GVOS composer, S17/S18) always get a parseable
 * object even when the LLM is unavailable. Pure — no I/O.
 *
 * @param {ReturnType<typeof resolvePositioningInputs>} inputs
 * @returns {Object} A contract-shaped positioning brief.
 */
export function buildFallbackBrief(inputs) {
  const safe = inputs && typeof inputs === 'object' ? inputs : {};
  const name = safe.ventureName || 'Our Product';
  const personaName = safe.personaName || 'our target user';
  return {
    positioning_statement:
      `${name} is built for ${personaName}. [Fallback — LLM unavailable. Regenerate for a fully grounded positioning brief.]`,
    tagline: `${name} — Built for ${personaName}`,
    hero_headline: `${name}: Your Solution`,
    hero_subhead: `Built specifically for ${personaName}.`,
    brand_voice: {
      tone: 'clear and approachable',
      attributes: ['clear', 'practical', 'trustworthy'],
    },
    key_messages: [
      `${name} solves the core problem ${personaName} faces.`,
      `${name} is designed around ${personaName}'s real workflow.`,
      `Get started with ${name} quickly — no friction.`,
    ],
    per_persona_angles: personaName !== 'our target user'
      ? [{ persona: personaName, angle: `Positioned for ${personaName}'s primary goal.` }]
      : [],
  };
}

/**
 * Coerce a parsed LLM payload into the exact artifact contract, dropping unknown
 * fields and normalizing types. Guarantees brand_voice/key_messages shape.
 * Pure — no I/O.
 *
 * @param {*} parsed
 * @param {ReturnType<typeof resolvePositioningInputs>} inputs
 * @returns {Object} A contract-shaped positioning brief.
 */
export function coercePositioningBrief(parsed, inputs) {
  const fallback = buildFallbackBrief(inputs);
  if (!parsed || typeof parsed !== 'object') return fallback;

  const str = (v, d) => (typeof v === 'string' && v.trim() ? v : d);

  // brand_voice
  let brand_voice = fallback.brand_voice;
  if (parsed.brand_voice && typeof parsed.brand_voice === 'object') {
    const attrs = Array.isArray(parsed.brand_voice.attributes)
      ? parsed.brand_voice.attributes.filter((a) => typeof a === 'string' && a.trim())
      : fallback.brand_voice.attributes;
    brand_voice = {
      tone: str(parsed.brand_voice.tone, fallback.brand_voice.tone),
      attributes: attrs.length > 0 ? attrs : fallback.brand_voice.attributes,
    };
  }

  // key_messages — clamp to [MIN, MAX]
  let key_messages = Array.isArray(parsed.key_messages)
    ? parsed.key_messages.filter((m) => typeof m === 'string' && m.trim())
    : [];
  if (key_messages.length === 0) key_messages = fallback.key_messages;
  if (key_messages.length > KEY_MESSAGE_MAX) key_messages = key_messages.slice(0, KEY_MESSAGE_MAX);

  // per_persona_angles — optional
  let per_persona_angles;
  if (Array.isArray(parsed.per_persona_angles)) {
    per_persona_angles = parsed.per_persona_angles
      .filter((a) => a && typeof a === 'object' && (a.persona || a.angle))
      .map((a) => ({ persona: str(a.persona, 'Primary persona'), angle: str(a.angle, '') }));
  }

  const brief = {
    positioning_statement: str(parsed.positioning_statement, fallback.positioning_statement),
    tagline: str(parsed.tagline, fallback.tagline),
    hero_headline: str(parsed.hero_headline, fallback.hero_headline),
    brand_voice,
    key_messages,
  };

  // Optional fields only when present/meaningful.
  const hero_subhead = str(parsed.hero_subhead, '');
  if (hero_subhead) brief.hero_subhead = hero_subhead;
  if (per_persona_angles && per_persona_angles.length > 0) brief.per_persona_angles = per_persona_angles;

  return brief;
}

/**
 * Generate a venture-grounded positioning brief from upstream artifacts via LLM.
 *
 * Calls the LLM the SAME way stage-18-marketing-copy.js does: getLLMClient()
 * cascade + client.complete(SYSTEM_PROMPT, userPrompt, { timeout }) +
 * parseJSON/extractUsage, with a deterministic fallback on error/invalid output.
 *
 * @param {Object} params
 * @param {string} [params.ventureName]
 * @param {string} [params.ventureId]
 * @param {Object} [params.logger]
 * @param {Object} [params.upstream] - Optional pre-resolved upstream map. When
 *   omitted, the params object itself is treated as the upstream source (it may
 *   carry stageNData / __byType shapes spread in by the EVA runner).
 * @returns {Promise<{ brief: Object, usage: Object, llmFallbackCount: number, metadata: Object }>}
 */
export async function analyzeStage16PositioningBrief(params = {}) {
  const { logger = console, ventureName, ventureId } = params;

  // Resolve inputs from the provided upstream source. The EVA runner spreads
  // the upstream stageNData map + ventureName into params, so default to params.
  const upstreamSource = params.upstream && typeof params.upstream === 'object' ? params.upstream : params;
  const inputs = resolvePositioningInputs(upstreamSource);
  if (ventureName && !inputs.ventureName) inputs.ventureName = ventureName;

  logger.info?.('[S16-PositioningBrief] Starting brief generation for', inputs.ventureName || ventureName || 'unknown venture');
  logger.info?.(`[S16-PositioningBrief] Available upstream artifacts: ${inputs.availableTypes.length}/${POSITIONING_UPSTREAM_ARTIFACT_TYPES.length}`, inputs.availableTypes);

  const userPrompt = buildPositioningContext(inputs);

  let brief;
  let usage = {};
  let llmFallbackCount = 0;

  try {
    const client = getLLMClient();
    // 180s timeout — long-form positioning copy on multi-artifact prompts can
    // exceed the 30s default (mirrors stage-18-marketing-copy.js).
    const response = await client.complete(SYSTEM_PROMPT, userPrompt, { timeout: 180000 });
    const parsed = parseJSON(response);
    usage = extractUsage(response) || {};

    if (parsed && (parsed.positioning_statement || parsed.tagline || parsed.hero_headline)) {
      brief = coercePositioningBrief(parsed, inputs);
    } else {
      logger.warn?.('[S16-PositioningBrief] LLM returned invalid structure, using fallback');
      llmFallbackCount = 1;
      brief = buildFallbackBrief(inputs);
    }
  } catch (err) {
    logger.error?.('[S16-PositioningBrief] LLM error:', err?.message || err);
    llmFallbackCount = 1;
    brief = buildFallbackBrief(inputs);
  }

  logger.info?.('[S16-PositioningBrief] Complete', {
    keyMessageCount: brief.key_messages?.length ?? 0,
    personaAngles: brief.per_persona_angles?.length ?? 0,
    llmFallbackCount,
  });

  return {
    brief,
    usage,
    llmFallbackCount,
    metadata: {
      upstream_artifacts_available: inputs.availableTypes.length,
      upstream_artifacts_used: inputs.availableTypes,
      persona_name: inputs.personaName,
      venture_name: inputs.ventureName || ventureName || null,
      llm_fallback_count: llmFallbackCount,
    },
  };
}

export { KEY_MESSAGE_MIN, KEY_MESSAGE_MAX };
