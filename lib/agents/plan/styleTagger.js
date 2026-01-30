/**
 * PLAN Agent Style Tagger
 * Suggests venture_personality based on SD characteristics during PRD elaboration.
 *
 * @sd SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-A
 */

/**
 * Valid personality values (must match venture-personality-mapping.js)
 */
export const VALID_PERSONALITIES = [
  'spartan',
  'enterprise',
  'startup',
  'dashboard',
  'consumer',
  'executive',
  'technical',
  'marketing',
  'minimal',
  'glass',
  'dark-mode-first',
  'accessible',
  'neutral',
  'mixed'
];

/**
 * Personality descriptions for reasoning
 */
export const PERSONALITY_DESCRIPTIONS = {
  spartan: 'Minimal, functional, maximum information density',
  enterprise: 'Professional, trustworthy, B2B suitable',
  startup: 'Modern, bold, energetic tech aesthetic',
  dashboard: 'Data-rich, analytical, decision-focused',
  consumer: 'Friendly, approachable, B2C suitable',
  executive: 'Premium, sophisticated, C-suite appropriate',
  technical: 'Developer-focused, precise, documentation-ready',
  marketing: 'Attention-grabbing, conversion-optimized',
  minimal: 'Clean, focused, intentional simplicity',
  glass: 'Modern glassmorphism with translucency',
  'dark-mode-first': 'Dark mode primary, light mode secondary',
  accessible: 'WCAG AAA compliant, inclusive design',
  neutral: 'Default, no specific personality applied',
  mixed: 'Combines multiple personalities contextually'
};

/**
 * Keyword mappings for style inference
 */
const STYLE_KEYWORDS = {
  spartan: ['minimal', 'simple', 'clean', 'no-frills', 'functional', 'utilitarian', 'bare-bones'],
  enterprise: ['enterprise', 'corporate', 'b2b', 'business', 'professional', 'formal', 'compliant'],
  startup: ['startup', 'modern', 'innovative', 'dynamic', 'agile', 'disruptive', 'cutting-edge'],
  dashboard: ['dashboard', 'analytics', 'metrics', 'kpi', 'monitoring', 'data', 'reporting', 'charts'],
  consumer: ['consumer', 'b2c', 'retail', 'user-friendly', 'casual', 'lifestyle', 'social'],
  executive: ['executive', 'c-suite', 'premium', 'luxury', 'high-end', 'vip', 'board'],
  technical: ['technical', 'developer', 'api', 'documentation', 'code', 'engineering', 'devops'],
  marketing: ['marketing', 'landing', 'conversion', 'campaign', 'promotion', 'sales', 'cta'],
  minimal: ['minimal', 'zen', 'focused', 'distraction-free', 'calm', 'simple'],
  glass: ['glass', 'glassmorphism', 'blur', 'translucent', 'modern', 'frosted'],
  'dark-mode-first': ['dark', 'night', 'low-light', 'dark-mode', 'developer', 'coding'],
  accessible: ['accessible', 'a11y', 'wcag', 'inclusive', 'disability', 'screen-reader', 'contrast']
};

/**
 * SD type to personality mapping defaults
 */
const SD_TYPE_DEFAULTS = {
  feature: 'neutral',
  bugfix: 'neutral',
  refactor: 'technical',
  infrastructure: 'technical',
  documentation: 'technical',
  security: 'enterprise',
  performance: 'dashboard',
  research: 'minimal',
  orchestrator: 'neutral',
  integration: 'enterprise'
};

/**
 * Category to personality mapping defaults
 */
const CATEGORY_DEFAULTS = {
  'quality': 'dashboard',
  'venture-management': 'executive',
  'infrastructure': 'technical',
  'feature': 'consumer',
  'security': 'enterprise',
  'compliance': 'enterprise',
  'analytics': 'dashboard',
  'developer-experience': 'technical'
};

/**
 * Analyze text for personality keywords
 * @param {string} text - Text to analyze
 * @returns {Object} Keyword matches per personality
 */
function analyzeKeywords(text) {
  const lowerText = (text || '').toLowerCase();
  const matches = {};

  for (const [personality, keywords] of Object.entries(STYLE_KEYWORDS)) {
    matches[personality] = keywords.filter(kw => lowerText.includes(kw)).length;
  }

  return matches;
}

/**
 * Suggest venture personality based on SD characteristics
 * @param {Object} sd - Strategic directive object
 * @param {string} sd.title - SD title
 * @param {string} sd.description - SD description
 * @param {string} sd.sd_type - SD type (feature, bugfix, etc.)
 * @param {string} sd.category - SD category
 * @param {string} [sd.scope] - SD scope text
 * @param {Object} [sd.prd] - PRD content if available
 * @returns {Object} Suggestion with personality, confidence, and reasoning
 */
export function suggestPersonality(sd) {
  const suggestions = [];
  let totalWeight = 0;

  // Analyze title and description
  const textToAnalyze = [
    sd.title || '',
    sd.description || '',
    sd.scope || '',
    sd.prd?.overview || ''
  ].join(' ');

  const keywordMatches = analyzeKeywords(textToAnalyze);

  // Score based on keyword matches
  for (const [personality, matchCount] of Object.entries(keywordMatches)) {
    if (matchCount > 0) {
      suggestions.push({
        personality,
        weight: matchCount * 3,
        source: 'keyword_match',
        detail: `${matchCount} keyword match(es)`
      });
      totalWeight += matchCount * 3;
    }
  }

  // Factor in SD type default
  if (sd.sd_type && SD_TYPE_DEFAULTS[sd.sd_type]) {
    const typeDefault = SD_TYPE_DEFAULTS[sd.sd_type];
    suggestions.push({
      personality: typeDefault,
      weight: 2,
      source: 'sd_type',
      detail: `SD type "${sd.sd_type}" defaults to ${typeDefault}`
    });
    totalWeight += 2;
  }

  // Factor in category default
  if (sd.category && CATEGORY_DEFAULTS[sd.category]) {
    const catDefault = CATEGORY_DEFAULTS[sd.category];
    suggestions.push({
      personality: catDefault,
      weight: 2,
      source: 'category',
      detail: `Category "${sd.category}" defaults to ${catDefault}`
    });
    totalWeight += 2;
  }

  // Aggregate scores
  const scores = {};
  for (const suggestion of suggestions) {
    if (!scores[suggestion.personality]) {
      scores[suggestion.personality] = { weight: 0, sources: [] };
    }
    scores[suggestion.personality].weight += suggestion.weight;
    scores[suggestion.personality].sources.push(suggestion);
  }

  // Find winner
  let topPersonality = 'neutral';
  let topWeight = 0;
  let topSources = [];

  for (const [personality, data] of Object.entries(scores)) {
    if (data.weight > topWeight) {
      topWeight = data.weight;
      topPersonality = personality;
      topSources = data.sources;
    }
  }

  // Calculate confidence (0-1 scale)
  const confidence = totalWeight > 0 ? Math.min(topWeight / (totalWeight * 0.6), 1) : 0.1;

  // Build reasoning
  const reasoning = topSources.map(s => `• ${s.source}: ${s.detail}`).join('\n');

  return {
    personality: topPersonality,
    confidence: Math.round(confidence * 100) / 100,
    description: PERSONALITY_DESCRIPTIONS[topPersonality],
    reasoning: reasoning || '• No strong signals found, defaulting to neutral',
    alternatives: Object.entries(scores)
      .filter(([p]) => p !== topPersonality)
      .sort((a, b) => b[1].weight - a[1].weight)
      .slice(0, 2)
      .map(([p, data]) => ({
        personality: p,
        weight: data.weight,
        description: PERSONALITY_DESCRIPTIONS[p]
      }))
  };
}

/**
 * Validate a personality value
 * @param {string} personality - Personality to validate
 * @returns {boolean} True if valid
 */
export function isValidPersonality(personality) {
  return VALID_PERSONALITIES.includes(personality);
}

/**
 * Get all valid personality options with descriptions
 * @returns {Array} Array of {value, label, description}
 */
export function getPersonalityOptions() {
  return VALID_PERSONALITIES.map(p => ({
    value: p,
    label: p.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: PERSONALITY_DESCRIPTIONS[p]
  }));
}

/**
 * Apply style tag to SD (database update helper)
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD ID
 * @param {string} personality - Personality value
 * @returns {Object} Update result
 */
export async function applyStyleTag(supabase, sdId, personality) {
  if (!isValidPersonality(personality)) {
    return {
      success: false,
      error: `Invalid personality value: ${personality}. Valid values: ${VALID_PERSONALITIES.join(', ')}`
    };
  }

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      venture_personality: personality,
      updated_at: new Date().toISOString()
    })
    .eq('id', sdId)
    .select('id, title, venture_personality')
    .single();

  if (error) {
    return {
      success: false,
      error: error.message
    };
  }

  return {
    success: true,
    data,
    message: `Applied style tag "${personality}" to SD ${sdId}`
  };
}

export default {
  suggestPersonality,
  isValidPersonality,
  getPersonalityOptions,
  applyStyleTag,
  VALID_PERSONALITIES,
  PERSONALITY_DESCRIPTIONS
};
