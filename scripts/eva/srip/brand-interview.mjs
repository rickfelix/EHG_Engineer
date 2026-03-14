/**
 * SRIP Brand Interview Module
 * SD: SD-MAN-ORCH-SRIP-CLONER-INTEGRATION-001-C
 *
 * Stage 2 of the SRIP pipeline: Brand Interview
 * Pre-populates brand identity answers from venture data (vision docs, arch plans),
 * then stores the interview record for synthesis.
 *
 * Input: siteDnaId + optional ventureId
 * Output: Structured interview stored in srip_brand_interviews table
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Question Definitions
// ============================================================================

export const BRAND_QUESTIONS = [
  { key: 'brand_name', label: 'Brand Name', hint: 'The official brand or product name' },
  { key: 'tagline', label: 'Tagline', hint: 'Short slogan or value proposition' },
  { key: 'tone_of_voice', label: 'Tone of Voice', hint: 'e.g., professional, playful, authoritative, casual' },
  { key: 'target_audience', label: 'Target Audience', hint: 'Who is the primary user/customer?' },
  { key: 'color_primary', label: 'Primary Color', hint: 'Main brand color (hex or name)' },
  { key: 'color_secondary', label: 'Secondary Color', hint: 'Accent or secondary brand color' },
  { key: 'typography_preference', label: 'Typography Preference', hint: 'e.g., modern sans-serif, classic serif, monospace' },
  { key: 'layout_style', label: 'Layout Style', hint: 'e.g., minimal, content-rich, card-based, magazine' },
  { key: 'content_density', label: 'Content Density', hint: 'e.g., sparse, moderate, dense' },
  { key: 'call_to_action_style', label: 'Call-to-Action Style', hint: 'e.g., bold buttons, subtle links, floating CTAs' },
  { key: 'imagery_style', label: 'Imagery Style', hint: 'e.g., photography, illustrations, icons, abstract' },
  { key: 'competitive_positioning', label: 'Competitive Positioning', hint: 'How does this brand differentiate itself?' },
];

// ============================================================================
// Keyword Extraction Helpers
// ============================================================================

const TONE_KEYWORDS = {
  professional: ['professional', 'enterprise', 'corporate', 'business', 'formal'],
  playful: ['playful', 'fun', 'creative', 'vibrant', 'energetic'],
  authoritative: ['authoritative', 'expert', 'trusted', 'leader', 'authority'],
  casual: ['casual', 'friendly', 'approachable', 'conversational', 'relaxed'],
  technical: ['technical', 'developer', 'engineering', 'code', 'api'],
  minimalist: ['minimal', 'clean', 'simple', 'elegant', 'streamlined'],
};

const LAYOUT_KEYWORDS = {
  minimal: ['minimal', 'clean', 'whitespace', 'simple', 'sparse'],
  'content-rich': ['content-rich', 'dense', 'information', 'dashboard', 'data'],
  'card-based': ['card', 'grid', 'tile', 'modular', 'component'],
  magazine: ['magazine', 'editorial', 'article', 'blog', 'publication'],
};

const DENSITY_KEYWORDS = {
  sparse: ['sparse', 'minimal', 'whitespace', 'breathing', 'open'],
  moderate: ['moderate', 'balanced', 'standard', 'typical'],
  dense: ['dense', 'packed', 'compact', 'information-heavy', 'data-rich'],
};

/**
 * Scan text content for keyword matches and return the best-matching value.
 */
function matchKeywords(text, keywordMap) {
  if (!text) return null;
  const lower = text.toLowerCase();
  let bestMatch = null;
  let bestCount = 0;

  for (const [value, keywords] of Object.entries(keywordMap)) {
    const count = keywords.filter(kw => lower.includes(kw)).length;
    if (count > bestCount) {
      bestCount = count;
      bestMatch = value;
    }
  }

  return bestCount > 0 ? bestMatch : null;
}

/**
 * Extract a hex color from text content (looks for #hex patterns).
 */
function extractColor(text, position) {
  if (!text) return null;
  const hexPattern = /#[0-9a-fA-F]{6}\b/g;
  const matches = text.match(hexPattern);
  if (!matches || matches.length === 0) return null;
  // position 0 = primary (first), 1 = secondary (second if available)
  return matches[Math.min(position, matches.length - 1)] || null;
}

/**
 * Extract brand name from vision/arch content.
 * Looks for patterns like "Brand: X", "Product: X", or the first heading.
 */
function extractBrandName(text) {
  if (!text) return null;
  // Try "brand: X" or "product: X" patterns
  const brandMatch = text.match(/(?:brand|product|project)\s*(?:name)?[:=]\s*["']?([^"'\n,]+)/i);
  if (brandMatch) return brandMatch[1].trim();
  return null;
}

/**
 * Extract tagline from content.
 */
function extractTagline(text) {
  if (!text) return null;
  const taglineMatch = text.match(/(?:tagline|slogan|value.?prop(?:osition)?|motto)[:=]\s*["']?([^"'\n]+)/i);
  if (taglineMatch) return taglineMatch[1].trim();
  return null;
}

/**
 * Extract target audience from content.
 */
function extractTargetAudience(text) {
  if (!text) return null;
  const audienceMatch = text.match(/(?:target\s*audience|user(?:s)?|customer(?:s)?|persona(?:s)?)[:=]\s*["']?([^"'\n]+)/i);
  if (audienceMatch) return audienceMatch[1].trim();
  return null;
}

/**
 * Extract typography preference from content.
 */
function extractTypography(text) {
  if (!text) return null;
  // Look for font-family declarations or typography mentions
  const fontMatch = text.match(/(?:font(?:-family)?|typography)[:=]\s*["']?([^"'\n;,]+)/i);
  if (fontMatch) return fontMatch[1].trim();

  // Check for common font style keywords
  if (/sans-serif|inter|roboto|open\s*sans|lato|montserrat/i.test(text)) return 'modern sans-serif';
  if (/serif|georgia|times|playfair|merriweather/i.test(text)) return 'classic serif';
  if (/mono|fira\s*code|jetbrains|consolas/i.test(text)) return 'monospace';
  return null;
}

/**
 * Extract CTA style from content.
 */
function extractCtaStyle(text) {
  if (!text) return null;
  if (/bold\s*button|prominent\s*cta|large\s*button/i.test(text)) return 'bold buttons';
  if (/subtle\s*link|text\s*link|inline\s*cta/i.test(text)) return 'subtle links';
  if (/float(?:ing)?\s*cta|sticky\s*button|fixed\s*button/i.test(text)) return 'floating CTAs';
  return null;
}

/**
 * Extract imagery style from content.
 */
function extractImageryStyle(text) {
  if (!text) return null;
  if (/photograph|photo|stock\s*image|real\s*image/i.test(text)) return 'photography';
  if (/illustrat(?:ion|ed)|drawing|sketch/i.test(text)) return 'illustrations';
  if (/icon(?:s|ography)?|symbol/i.test(text)) return 'icons';
  if (/abstract|geometric|pattern/i.test(text)) return 'abstract';
  return null;
}

/**
 * Extract competitive positioning from content.
 */
function extractCompetitivePositioning(text) {
  if (!text) return null;
  const posMatch = text.match(/(?:differentiat(?:or|ion|e)|competitive|positioning|unique|advantage)[:=]?\s*["']?([^"'\n.]+)/i);
  if (posMatch) return posMatch[1].trim();
  return null;
}

// ============================================================================
// Pre-Population from Venture Data
// ============================================================================

/**
 * Query venture vision docs and architecture plans, then extract brand-relevant
 * answers from their content.
 *
 * @param {string} ventureId - UUID of the venture
 * @param {object} supabase - Supabase client instance
 * @returns {object} Partial answers map { question_key: extracted_value }
 */
export async function prePopulateFromVenture(ventureId, supabase) {
  const answers = {};

  if (!ventureId) return answers;

  // Fetch vision documents for this venture
  const { data: visionDocs, error: visionError } = await supabase
    .from('eva_vision_documents')
    .select('vision_key, content, metadata')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (visionError) {
    console.warn(`   Warning: Could not fetch vision docs: ${visionError.message}`);
  }

  // Fetch architecture plans for this venture
  const { data: archPlans, error: archError } = await supabase
    .from('eva_architecture_plans')
    .select('plan_key, content, metadata')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (archError) {
    console.warn(`   Warning: Could not fetch arch plans: ${archError.message}`);
  }

  // Combine all content for analysis
  const allContent = [
    ...(visionDocs || []).map(d => d.content || ''),
    ...(archPlans || []).map(d => d.content || ''),
  ].join('\n\n');

  // Also check metadata fields for structured brand data
  const allMetadata = [
    ...(visionDocs || []).map(d => d.metadata).filter(Boolean),
    ...(archPlans || []).map(d => d.metadata).filter(Boolean),
  ];

  const metadataStr = allMetadata.length > 0 ? JSON.stringify(allMetadata) : '';
  const combinedText = allContent + '\n' + metadataStr;

  if (!combinedText.trim()) return answers;

  // Extract each question from combined content
  const brandName = extractBrandName(combinedText);
  if (brandName) answers.brand_name = brandName;

  const tagline = extractTagline(combinedText);
  if (tagline) answers.tagline = tagline;

  const tone = matchKeywords(combinedText, TONE_KEYWORDS);
  if (tone) answers.tone_of_voice = tone;

  const audience = extractTargetAudience(combinedText);
  if (audience) answers.target_audience = audience;

  const primaryColor = extractColor(combinedText, 0);
  if (primaryColor) answers.color_primary = primaryColor;

  const secondaryColor = extractColor(combinedText, 1);
  if (secondaryColor) answers.color_secondary = secondaryColor;

  const typography = extractTypography(combinedText);
  if (typography) answers.typography_preference = typography;

  const layout = matchKeywords(combinedText, LAYOUT_KEYWORDS);
  if (layout) answers.layout_style = layout;

  const density = matchKeywords(combinedText, DENSITY_KEYWORDS);
  if (density) answers.content_density = density;

  const ctaStyle = extractCtaStyle(combinedText);
  if (ctaStyle) answers.call_to_action_style = ctaStyle;

  const imagery = extractImageryStyle(combinedText);
  if (imagery) answers.imagery_style = imagery;

  const positioning = extractCompetitivePositioning(combinedText);
  if (positioning) answers.competitive_positioning = positioning;

  return answers;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Run the Brand Interview for a given Site DNA record.
 *
 * @param {object} params
 * @param {string} params.siteDnaId - UUID of the srip_site_dna record
 * @param {string} [params.ventureId] - Optional venture UUID (auto-detected from site_dna if absent)
 * @param {object} [params.supabase] - Optional Supabase client (created if not provided)
 * @returns {object|null} The stored interview record, or null on failure
 */
export async function runBrandInterview({ siteDnaId, ventureId, supabase }) {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  console.log('\n   Brand Interview');
  console.log(`   Site DNA: ${siteDnaId}`);

  // Load Site DNA record
  const { data: siteDna, error: dnaError } = await supabase
    .from('srip_site_dna')
    .select('id, venture_id, dna_json, reference_url, status')
    .eq('id', siteDnaId)
    .single();

  if (dnaError || !siteDna) {
    console.error(`   Site DNA not found: ${dnaError?.message || 'no data'}`);
    return null;
  }

  // Auto-detect venture_id from site_dna if not provided
  const resolvedVentureId = ventureId || siteDna.venture_id;
  console.log(`   Venture: ${resolvedVentureId || 'none (no pre-population)'}`);
  console.log(`   Reference URL: ${siteDna.reference_url || 'N/A'}`);

  // Pre-populate from venture data
  const prePopulated = resolvedVentureId
    ? await prePopulateFromVenture(resolvedVentureId, supabase)
    : {};

  // Also try to extract brand data from the Site DNA itself
  const dnaJson = siteDna.dna_json || {};
  if (dnaJson.design_tokens) {
    const tokens = dnaJson.design_tokens;
    if (!prePopulated.color_primary && tokens.colors?.primary) {
      prePopulated.color_primary = tokens.colors.primary;
    }
    if (!prePopulated.color_secondary && tokens.colors?.secondary) {
      prePopulated.color_secondary = tokens.colors.secondary;
    }
    if (!prePopulated.typography_preference && tokens.typography?.font_family) {
      prePopulated.typography_preference = tokens.typography.font_family;
    }
  }

  // Build full answers map: pre-populated values + nulls for unanswered
  const answers = {};
  let prePopulatedCount = 0;
  let manualInputCount = 0;

  for (const question of BRAND_QUESTIONS) {
    if (prePopulated[question.key] != null) {
      answers[question.key] = prePopulated[question.key];
      prePopulatedCount++;
    } else {
      answers[question.key] = null;
      manualInputCount++;
    }
  }

  console.log(`\n   Pre-populated: ${prePopulatedCount}/${BRAND_QUESTIONS.length} answers`);
  if (manualInputCount > 0) {
    const unanswered = BRAND_QUESTIONS.filter(q => answers[q.key] === null);
    console.log(`   Needs input: ${unanswered.map(q => q.key).join(', ')}`);
  }

  // Store in database
  const interviewRecord = {
    venture_id: resolvedVentureId || null,
    site_dna_id: siteDnaId,
    answers,
    pre_populated_count: prePopulatedCount,
    manual_input_count: manualInputCount,
    status: manualInputCount === 0 ? 'completed' : 'draft',
    created_by: 'SRIP_BRAND_INTERVIEW',
  };

  const { data, error } = await supabase
    .from('srip_brand_interviews')
    .insert(interviewRecord)
    .select('id, status, pre_populated_count, manual_input_count');

  if (error) {
    console.error(`   DB insert failed: ${error.message}`);
    return null;
  }

  const result = data[0];
  console.log(`\n   Interview stored: ${result.id}`);
  console.log(`   Status: ${result.status}`);

  return result;
}
