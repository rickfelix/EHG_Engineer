/**
 * Design System Brief Generator for S17 Archetype Generation
 *
 * Extracts venture positioning, brand voice, and competitive context
 * from upstream Stage 11-12 artifacts to produce a venture-specific
 * design brief that enriches archetype prompts.
 *
 * SD-S17-DESIGN-MASTERY-PIPELINE-ORCH-001-A (US-001)
 * @module lib/eva/stage-17/design-system-brief
 */

const MAX_BRIEF_CHARS = 500;

const GENERIC_FALLBACK = {
  positioning: 'Modern, professional digital product',
  voice: 'Clear, confident, approachable',
  context: '',
};

/**
 * Build a design system brief from upstream venture artifacts.
 * Pure function — no database calls, only data transformation.
 *
 * @param {object} params
 * @param {object|null} params.identityArtifact - Stage 11 identity artifact (artifact_data)
 * @param {object|null} params.tokenManifest - design_token_manifest artifact (artifact_data)
 * @returns {{ positioning: string, voice: string, context: string }}
 */
export function buildDesignBrief({ identityArtifact, tokenManifest } = {}) {
  const positioning = extractPositioning(identityArtifact);
  const voice = extractVoice(identityArtifact);
  const context = extractContext(identityArtifact, tokenManifest);

  const brief = {
    positioning: truncate(positioning || GENERIC_FALLBACK.positioning, 200),
    voice: truncate(voice || GENERIC_FALLBACK.voice, 150),
    context: truncate(context || GENERIC_FALLBACK.context, 150),
  };

  return brief;
}

/**
 * Format the design brief as a prompt section string.
 *
 * @param {{ positioning: string, voice: string, context: string }} brief
 * @returns {string} Formatted prompt section (empty string if all generic)
 */
export function formatDesignBrief(brief) {
  if (!brief || (!brief.context && brief.positioning === GENERIC_FALLBACK.positioning)) {
    return '';
  }

  const lines = [
    '\nDESIGN STRATEGY BRIEF (venture-specific context):',
    `- Positioning: ${brief.positioning}`,
    `- Brand Voice: ${brief.voice}`,
  ];

  if (brief.context) {
    lines.push(`- Context: ${brief.context}`);
  }

  return lines.join('\n');
}

function extractPositioning(identity) {
  if (!identity) return null;
  const data = identity.brand ?? identity;
  return data.positioning
    ?? data.tagline
    ?? data.value_proposition
    ?? data.brand_essence
    ?? null;
}

function extractVoice(identity) {
  if (!identity) return null;
  const data = identity.brand ?? identity;
  if (data.voice) return data.voice;
  if (data.tone) return data.tone;
  if (Array.isArray(data.brand_attributes)) {
    return data.brand_attributes.slice(0, 3).join(', ');
  }
  return null;
}

function extractContext(identity, tokenManifest) {
  if (!identity) return null;
  const parts = [];
  const data = identity.brand ?? identity;
  if (data.target_audience) parts.push(`Audience: ${data.target_audience}`);
  if (data.industry) parts.push(`Industry: ${data.industry}`);
  if (tokenManifest?.style_direction) parts.push(`Style: ${tokenManifest.style_direction}`);
  return parts.length > 0 ? parts.join('. ') : null;
}

function truncate(str, max) {
  if (!str || str.length <= max) return str || '';
  return str.slice(0, max - 3) + '...';
}
