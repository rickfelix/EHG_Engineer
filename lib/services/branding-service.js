/**
 * Branding Service — EHG Venture Factory
 * SD: SD-LEO-ORCH-EHG-VENTURE-FACTORY-001-D
 *
 * Generates confidence-scored brand artifacts for ventures.
 * Routes artifacts through the Decision Filter Engine:
 *   - >0.85 confidence → auto-PR (auto-apply to venture repo)
 *   - 0.5-0.85 → review-flagged PR (Chairman reviews)
 *   - <0.5 → draft-only (stored but not applied)
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { reportTelemetry } from './telemetry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRANDING_SCHEMA = JSON.parse(
  readFileSync(join(__dirname, 'schemas', 'branding-artifact.json'), 'utf8')
);

// Decision Filter Engine thresholds
const DFE_THRESHOLDS = {
  AUTO_APPROVE: 0.85,   // Auto-PR to venture repo
  REVIEW_FLAG: 0.50,    // Chairman review required
  // Below 0.50 = draft-only
};

/**
 * Generate branding artifacts for a venture.
 * @param {object} supabase - Supabase client
 * @param {object} params - Task input parameters
 * @param {string} params.venture_id - UUID of the target venture
 * @param {string} params.brand_name - Venture brand name
 * @param {string} [params.industry] - Industry context for generation
 * @param {string} [params.target_audience] - Target audience description
 * @param {string[]} [params.competitor_brands] - Competitor brand names
 * @returns {Promise<{artifact: object, confidence_score: number, routing: string}>}
 */
export async function generateBrandArtifact(supabase, params) {
  const { venture_id, brand_name, industry, target_audience, competitor_brands } = params;

  // Generate brand artifacts with confidence scoring
  const artifact = buildBrandArtifact(brand_name, industry, target_audience);
  const confidence = computeConfidence(artifact, params);
  const routing = classifyRouting(confidence);

  // Store telemetry
  await reportTelemetry(supabase, {
    service_key: 'branding',
    venture_id,
    event_type: 'artifact_generated',
    confidence_score: confidence,
    routing_decision: routing,
    metadata: {
      brand_name,
      industry: industry || null,
      artifact_fields: Object.keys(artifact).length,
    },
  });

  return { artifact, confidence_score: confidence, routing };
}

/**
 * Build brand artifact from input parameters.
 * Uses deterministic generation based on brand name characteristics.
 */
function buildBrandArtifact(brandName, industry, targetAudience) {
  const nameHash = simpleHash(brandName);

  // Color palette derived from brand name characteristics
  const palette = generateColorPalette(nameHash, industry);

  // Typography based on industry context
  const typography = selectTypography(industry);

  // Brand voice based on audience and industry
  const voice = determineBrandVoice(industry, targetAudience);

  // Logo specification
  const logoSpec = generateLogoSpec(brandName, industry);

  return {
    venture_id: null, // Set by caller
    brand_name: brandName,
    tagline: generateTagline(brandName, industry),
    color_palette: palette,
    typography,
    brand_voice: voice,
    logo_spec: logoSpec,
  };
}

/**
 * Compute confidence score for generated artifacts.
 * Higher confidence when more input context is provided.
 */
function computeConfidence(artifact, params) {
  let score = 0.6; // Base confidence

  // More context = higher confidence
  if (params.industry) score += 0.1;
  if (params.target_audience) score += 0.1;
  if (params.competitor_brands?.length > 0) score += 0.05;

  // Artifact completeness
  if (artifact.tagline) score += 0.05;
  if (artifact.logo_spec) score += 0.05;
  if (artifact.brand_voice?.personality_traits?.length >= 3) score += 0.05;

  return Math.min(1.0, Math.round(score * 100) / 100);
}

/**
 * Classify routing decision based on confidence score.
 * @returns {'auto_approve' | 'review_flagged' | 'draft_only'}
 */
function classifyRouting(confidence) {
  if (confidence >= DFE_THRESHOLDS.AUTO_APPROVE) return 'auto_approve';
  if (confidence >= DFE_THRESHOLDS.REVIEW_FLAG) return 'review_flagged';
  return 'draft_only';
}

// --- Internal generation helpers ---

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function generateColorPalette(hash, industry) {
  const palettes = {
    technology: { primary: '#2563EB', secondary: '#1E40AF', accent: '#3B82F6', background: '#F8FAFC', text: '#0F172A' },
    finance: { primary: '#047857', secondary: '#065F46', accent: '#10B981', background: '#F0FDF4', text: '#064E3B' },
    health: { primary: '#0891B2', secondary: '#0E7490', accent: '#22D3EE', background: '#ECFEFF', text: '#164E63' },
    education: { primary: '#7C3AED', secondary: '#6D28D9', accent: '#A78BFA', background: '#F5F3FF', text: '#4C1D95' },
    default: { primary: '#0F766E', secondary: '#115E59', accent: '#14B8A6', background: '#F0FDFA', text: '#134E4A' },
  };
  return palettes[industry] || palettes.default;
}

function selectTypography(industry) {
  const styles = {
    technology: { heading_font: 'Inter', body_font: 'Inter', mono_font: 'JetBrains Mono', base_size_px: 16 },
    finance: { heading_font: 'Merriweather', body_font: 'Source Sans 3', mono_font: 'Fira Code', base_size_px: 16 },
    health: { heading_font: 'Nunito', body_font: 'Open Sans', mono_font: 'IBM Plex Mono', base_size_px: 16 },
    education: { heading_font: 'Poppins', body_font: 'Lato', mono_font: 'Source Code Pro', base_size_px: 16 },
    default: { heading_font: 'Inter', body_font: 'Inter', base_size_px: 16 },
  };
  return styles[industry] || styles.default;
}

function determineBrandVoice(industry, targetAudience) {
  const voices = {
    technology: { tone: 'professional', personality_traits: ['innovative', 'precise', 'forward-thinking'], writing_style: 'concise' },
    finance: { tone: 'authoritative', personality_traits: ['trustworthy', 'reliable', 'analytical'], writing_style: 'formal' },
    health: { tone: 'warm', personality_traits: ['caring', 'knowledgeable', 'supportive'], writing_style: 'conversational' },
    education: { tone: 'friendly', personality_traits: ['encouraging', 'clear', 'curious'], writing_style: 'conversational' },
    default: { tone: 'professional', personality_traits: ['reliable', 'clear'], writing_style: 'concise' },
  };
  return voices[industry] || voices.default;
}

function generateLogoSpec(brandName, industry) {
  const firstChar = brandName.charAt(0).toUpperCase();
  const isShortName = brandName.length <= 8;
  return {
    style: isShortName ? 'wordmark' : 'combination',
    shape: 'rounded',
    description: `${isShortName ? 'Wordmark' : 'Combination mark'} featuring "${firstChar}" with ${industry || 'modern'} design sensibility`,
  };
}

function generateTagline(brandName, industry) {
  const taglines = {
    technology: `${brandName} — Engineering the future`,
    finance: `${brandName} — Your financial compass`,
    health: `${brandName} — Wellness, redefined`,
    education: `${brandName} — Learn without limits`,
    default: `${brandName} — Built for what matters`,
  };
  return taglines[industry] || taglines.default;
}

export { DFE_THRESHOLDS, BRANDING_SCHEMA, classifyRouting, computeConfidence };
