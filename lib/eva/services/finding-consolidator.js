/**
 * Finding Consolidator — Recommendation Grouping + Context Export
 * SD-EVA-FRIDAY-MEETING-ENHANCEMENT-ORCH-001-C
 *
 * Groups consultant recommendations by application_domain into consolidated
 * insight cards for injection into eva-chat-service Friday meeting context.
 *
 * No dependency on the legacy friday-meeting.mjs render path.
 * Output is a data primitive consumed by Child E eva-chat-service.
 */

import { applyRecommendationDecay } from '../../../scripts/eva/recommendation-feedback.mjs';

let sanitizeLLMInput;
try {
  ({ sanitizeLLMInput } = await import('./input-sanitizer.js'));
} catch {
  console.warn('[finding-consolidator] SANITIZER_UNAVAILABLE: input-sanitizer.js could not be imported. Using raw strings.');
  sanitizeLLMInput = (text) => ({ clean: text, warnings: [] });
}

/**
 * Group recommendations by application_domain into consolidated insight cards.
 *
 * @param {Array<{ id: string, title: string, application_domain: string, priority_score: number, [key: string]: any }>} recommendations
 * @returns {Array<{ domain: string, items: Array, count: number, combined_priority: number, summary: string }>}
 */
export function consolidateFindings(recommendations) {
  if (!recommendations || recommendations.length === 0) return [];

  const domainMap = new Map();

  for (const rec of recommendations) {
    const domain = rec.application_domain || 'unknown';
    if (!domainMap.has(domain)) {
      domainMap.set(domain, []);
    }
    domainMap.get(domain).push(rec);
  }

  const cards = [];
  for (const [domain, items] of domainMap) {
    const count = items.length;
    const combined_priority = count > 0
      ? items.reduce((sum, r) => sum + (r.priority_score || 0), 0) / count
      : 0;

    // summary: title of the highest-priority item
    const topItem = items.reduce((best, r) =>
      (r.priority_score || 0) > (best.priority_score || 0) ? r : best, items[0]);
    const rawSummary = topItem?.title || domain;
    const { clean: summary } = sanitizeLLMInput(rawSummary);

    cards.push({ domain, items, count, combined_priority, summary });
  }

  // Sort by combined_priority descending
  cards.sort((a, b) => b.combined_priority - a.combined_priority);

  return cards;
}

/**
 * Fetch pending recommendations, apply relevance decay, consolidate by domain,
 * and return structured context for eva-chat-service.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{ consolidatedFindings: Array, totalCount: number, decayApplied: boolean }>}
 */
export async function getConsolidatedContext(supabase) {
  try {
    const { data: recs, error } = await supabase
      .from('eva_consultant_recommendations')
      .select('id, title, application_domain, priority_score, recommendation_type, description, status, feedback_weight')
      .eq('status', 'pending')
      .order('priority_score', { ascending: false });

    if (error) {
      console.warn('[finding-consolidator] Failed to fetch recommendations:', error.message);
      return { consolidatedFindings: [], totalCount: 0, decayApplied: false };
    }

    const recommendations = recs || [];

    // Apply decay for this cycle
    const cycleDate = new Date().toISOString().slice(0, 10);
    await applyRecommendationDecay(cycleDate);

    const consolidatedFindings = consolidateFindings(recommendations);

    return {
      consolidatedFindings,
      totalCount: recommendations.length,
      decayApplied: true,
    };
  } catch (err) {
    console.warn('[finding-consolidator] getConsolidatedContext error:', err.message);
    return { consolidatedFindings: [], totalCount: 0, decayApplied: false };
  }
}
