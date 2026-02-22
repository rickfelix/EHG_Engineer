/**
 * Domain Knowledge Service
 *
 * CRUD operations, freshness computation, and hierarchy queries
 * for the domain_knowledge table.
 *
 * Part of SD-LEO-FIX-CLOSE-DOMAIN-INTELLIGENCE-001
 */

/**
 * Type-specific expiry periods in days.
 * After expiry, knowledge freshness decays to 0.
 */
const EXPIRY_DAYS = {
  market_data: 90,
  competitor: 60,
  pain_point: 730,
  trend: 180,
  regulation: 365,
  technology: 120,
};

/**
 * Compute freshness score for a knowledge entry.
 * freshness = max(0, 1 - daysSinceVerified / expiryDays)
 *
 * @param {Object} entry - domain_knowledge row
 * @param {string} entry.knowledge_type - One of the EXPIRY_DAYS keys
 * @param {string} entry.last_verified_at - ISO timestamp
 * @returns {number} Freshness score between 0 and 1
 */
export function computeFreshness(entry) {
  const expiryDays = EXPIRY_DAYS[entry.knowledge_type] || 180;
  const verifiedAt = new Date(entry.last_verified_at);
  const daysSince = (Date.now() - verifiedAt.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, 1 - daysSince / expiryDays);
}

/**
 * Compute effective confidence: raw confidence * freshness.
 *
 * @param {Object} entry - domain_knowledge row with confidence and freshness fields
 * @returns {number} Effective confidence between 0 and 1
 */
export function effectiveConfidence(entry) {
  const freshness = computeFreshness(entry);
  return (entry.confidence || 0) * freshness;
}

/**
 * Get domain knowledge entries for an industry, sorted by effective confidence.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} industry - Industry identifier
 * @param {Object} [options]
 * @param {string} [options.segment] - Optional segment filter
 * @param {string} [options.knowledgeType] - Optional type filter
 * @param {number} [options.limit=50] - Max entries
 * @returns {Promise<Object[]>} Entries sorted by effective_confidence descending
 */
export async function getByIndustry(supabase, industry, options = {}) {
  const { segment, knowledgeType, limit = 50 } = options;

  let query = supabase
    .from('domain_knowledge')
    .select('*')
    .eq('industry', industry)
    .limit(limit);

  if (segment) query = query.eq('segment', segment);
  if (knowledgeType) query = query.eq('knowledge_type', knowledgeType);

  const { data, error } = await query;
  if (error) throw new Error(`[DomainIntelligence] getByIndustry failed: ${error.message}`);

  return (data || [])
    .map(entry => ({
      ...entry,
      freshness_score: computeFreshness(entry),
      effective_confidence: effectiveConfidence(entry),
    }))
    .sort((a, b) => b.effective_confidence - a.effective_confidence);
}

/**
 * Upsert a domain knowledge entry using the dedup index (industry, knowledge_type, title).
 * On conflict, increments extraction_count and updates content/confidence.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} entry
 * @param {string} entry.industry
 * @param {string} entry.knowledge_type
 * @param {string} entry.title
 * @param {string} entry.content
 * @param {number} [entry.confidence=0.5]
 * @param {string} [entry.segment]
 * @param {string} [entry.problem_area]
 * @param {string} [entry.source_session_id]
 * @param {string} [entry.source_venture_id]
 * @param {string[]} [entry.tags]
 * @returns {Promise<Object>} Upserted entry
 */
export async function upsert(supabase, entry) {
  const row = {
    industry: entry.industry,
    knowledge_type: entry.knowledge_type,
    title: entry.title,
    content: entry.content,
    confidence: entry.confidence ?? 0.5,
    segment: entry.segment || null,
    problem_area: entry.problem_area || null,
    source_session_id: entry.source_session_id || null,
    source_venture_id: entry.source_venture_id || null,
    tags: entry.tags || [],
    last_verified_at: new Date().toISOString(),
  };

  // First try to find existing entry
  const { data: existing } = await supabase
    .from('domain_knowledge')
    .select('id, extraction_count')
    .eq('industry', entry.industry)
    .eq('knowledge_type', entry.knowledge_type)
    .eq('title', entry.title)
    .single();

  if (existing) {
    // Update existing: increment extraction_count, update content
    const { data, error } = await supabase
      .from('domain_knowledge')
      .update({
        content: row.content,
        confidence: Math.min(1, (entry.confidence ?? 0.5) + 0.05),
        extraction_count: (existing.extraction_count || 1) + 1,
        last_verified_at: row.last_verified_at,
        tags: row.tags,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw new Error(`[DomainIntelligence] upsert update failed: ${error.message}`);
    return data;
  }

  // Insert new entry
  const { data, error } = await supabase
    .from('domain_knowledge')
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(`[DomainIntelligence] upsert insert failed: ${error.message}`);
  return data;
}

/**
 * Get knowledge entries grouped by hierarchy (industry > segment > problem_area).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} industry
 * @returns {Promise<Object>} Hierarchical knowledge structure
 */
export async function getHierarchy(supabase, industry) {
  const entries = await getByIndustry(supabase, industry, { limit: 200 });

  const hierarchy = {};
  for (const entry of entries) {
    const seg = entry.segment || '_general';
    const area = entry.problem_area || '_general';
    if (!hierarchy[seg]) hierarchy[seg] = {};
    if (!hierarchy[seg][area]) hierarchy[seg][area] = [];
    hierarchy[seg][area].push(entry);
  }

  return hierarchy;
}
