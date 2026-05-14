/**
 * Map ventures-table columns to ClassifyArchetypeInput shape.
 *
 * SD-LEO-FEAT-GVOS-ACTIVATION-REMEDIATION-001 / FR-4
 *
 * Reality (empirical at SD time): the ventures table does NOT have industry_tags
 * or audience_tags columns. It has industry, vertical_category, tags (array),
 * target_market (free-form description), venture_type, tier, business_model_class.
 *
 * This helper centralizes the column-to-input mapping so the S11 worker hook
 * and the FR-5 backfill script agree on what data feeds the classifier.
 *
 * Mapping:
 *   industry_tags  = [industry, vertical_category, ...tags] (non-null, deduped)
 *   audience_tags  = derived from target_market keyword extraction (small whitelist)
 *   businessModelClass = business_model_class column (may be null)
 *
 * Drift note: when the ventures schema evolves to include explicit industry_tags /
 * audience_tags columns (likely a follow-up SD), this helper should switch to
 * reading them directly.
 */

const AUDIENCE_KEYWORDS = [
  // executive / enterprise
  'executive', 'cfo', 'cio', 'cto', 'enterprise', 'large-enterprise',
  // developer / technical
  'developer', 'developers', 'engineering-team', 'devops', 'engineer',
  // healthcare
  'clinician', 'patient', 'doctor', 'medical-administrator',
  // government / education
  'citizen', 'student', 'educator', 'civic-administrator',
  // family / consumer
  'parent', 'child', 'family', 'caretaker',
  // creator / artist
  'fan', 'artist', 'creator', 'audiophile', 'audience', 'viewer', 'gamer',
  // wellness / individual
  'individual', 'wellness-seeker', 'personal-investor',
  // legal / compliance
  'compliance-officer', 'legal-counsel',
  // collector / luxury
  'collector', 'curator', 'gallery-visitor', 'luxury-consumer',
];

function extractAudienceKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  const lowered = text.toLowerCase();
  const hits = new Set();
  for (const kw of AUDIENCE_KEYWORDS) {
    if (lowered.includes(kw)) hits.add(kw);
  }
  // also broad terms
  if (/\bdeveloper(s)?\b/.test(lowered)) hits.add('developer');
  if (/\bteam(s)?\b/.test(lowered)) hits.add('engineering-team');
  if (/\bindie\b/.test(lowered)) hits.add('developer');
  return Array.from(hits);
}

/**
 * @param {{ industry?: string|null, vertical_category?: string|null, tags?: string[]|null,
 *           target_market?: string|null, business_model_class?: string|null }} venture
 * @returns {{ industryTags: string[], audienceTags: string[], businessModelClass: string|null }}
 */
export function buildClassifierInputFromVenture(venture) {
  if (!venture || typeof venture !== 'object') {
    return { industryTags: [], audienceTags: [], businessModelClass: null };
  }
  const industryTags = [
    venture.industry,
    venture.vertical_category,
    ...((Array.isArray(venture.tags) ? venture.tags : []) || []),
  ]
    .filter((s) => typeof s === 'string' && s.trim() && s.trim().toLowerCase() !== 'other')
    .map((s) => s.trim().toLowerCase());

  return {
    industryTags: Array.from(new Set(industryTags)),
    audienceTags: extractAudienceKeywords(venture.target_market || ''),
    businessModelClass: venture.business_model_class || null,
  };
}

export { AUDIENCE_KEYWORDS, extractAudienceKeywords };
