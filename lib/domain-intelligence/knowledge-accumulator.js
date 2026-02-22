/**
 * Knowledge Accumulator
 *
 * Extracts domain insights from completed brainstorm sessions
 * and stores them in the domain_knowledge table.
 *
 * Part of SD-LEO-FIX-CLOSE-DOMAIN-INTELLIGENCE-001
 */

import { upsert } from './domain-knowledge-service.js';

/**
 * Classify content into a knowledge_type based on keywords.
 *
 * @param {string} text - Content to classify
 * @returns {string} One of: market_data, competitor, pain_point, trend, regulation, technology
 */
export function classifyKnowledgeType(text) {
  const lower = (text || '').toLowerCase();

  if (/\b(competitors?|rivals?|alternatives?|versus|vs\.?)\b/.test(lower)) return 'competitor';
  if (/\b(regulation|compliance|legal|gdpr|hipaa|sox|law)\b/.test(lower)) return 'regulation';
  if (/\b(technology|tech|framework|platform|stack|api|sdk)\b/.test(lower)) return 'technology';
  if (/\b(trend|emerging|growth|forecast|projection|shift)\b/.test(lower)) return 'trend';
  if (/\b(pain|problem|challenge|friction|frustration|struggle)\b/.test(lower)) return 'pain_point';
  return 'market_data';
}

/**
 * Extract insight entries from a brainstorm session.
 * Parses session topic, conclusion, and metadata for knowledge items.
 *
 * @param {Object} session - Brainstorm session record
 * @param {string} session.topic - Session topic
 * @param {string} [session.conclusion] - Session conclusion/summary
 * @param {Object} [session.metadata] - Session metadata
 * @returns {Array<{title: string, content: string, knowledge_type: string}>}
 */
export function extractInsights(session) {
  const insights = [];

  // Extract from topic - always creates at least one entry
  if (session.topic) {
    insights.push({
      title: session.topic.slice(0, 200),
      content: session.conclusion || session.topic,
      knowledge_type: classifyKnowledgeType(session.topic + ' ' + (session.conclusion || '')),
    });
  }

  // Extract from metadata key_insights if present
  const keyInsights = session.metadata?.key_insights || session.metadata?.insights || [];
  for (const insight of keyInsights) {
    if (typeof insight === 'string' && insight.trim()) {
      insights.push({
        title: insight.slice(0, 200),
        content: insight,
        knowledge_type: classifyKnowledgeType(insight),
      });
    } else if (insight?.title && insight?.content) {
      insights.push({
        title: insight.title.slice(0, 200),
        content: insight.content,
        knowledge_type: insight.knowledge_type || classifyKnowledgeType(insight.content),
      });
    }
  }

  return insights;
}

/**
 * Accumulate domain knowledge from a completed brainstorm session.
 * This is called from brainstorm-retrospective.js after session completion.
 *
 * @param {Object} params
 * @param {Object} params.session - Brainstorm session with topic, conclusion, metadata
 * @param {Object} params.venture - Venture object with industry info
 * @param {string} params.venture.industry - Industry identifier
 * @param {string} [params.venture.segment] - Industry segment
 * @param {string} [params.venture.id] - Venture UUID
 * @param {import('@supabase/supabase-js').SupabaseClient} params.supabase
 * @returns {Promise<number>} Count of accumulated entries
 */
export async function accumulateFromSession({ session, venture, supabase }) {
  if (!session || !venture?.industry || !supabase) {
    return 0;
  }

  const insights = extractInsights(session);
  if (insights.length === 0) return 0;

  let count = 0;
  for (const insight of insights) {
    try {
      await upsert(supabase, {
        industry: venture.industry,
        segment: venture.segment || null,
        knowledge_type: insight.knowledge_type,
        title: insight.title,
        content: insight.content,
        confidence: 0.5,
        source_session_id: session.id || null,
        source_venture_id: venture.id || null,
        tags: [],
      });
      count++;
    } catch (err) {
      console.log(`[DomainIntelligence] Failed to accumulate insight "${insight.title}": ${err.message}`);
    }
  }

  return count;
}
