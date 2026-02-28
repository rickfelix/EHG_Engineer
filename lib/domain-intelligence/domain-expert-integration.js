/**
 * Domain Expert Integration
 *
 * Builds domain context from accumulated knowledge
 * for injection into AI agent prompts before brainstorm sessions.
 *
 * Part of SD-LEO-FIX-CLOSE-DOMAIN-INTELLIGENCE-001
 */

import { getByIndustry } from './domain-knowledge-service.js';
import { createDomainKnowledgeService } from './domain-knowledge-service.js';

const MAX_CONTEXT_CHARS = 2000;
const MIN_EFFECTIVE_CONFIDENCE = 0.1;

/**
 * Format a single knowledge entry for prompt injection.
 *
 * @param {Object} entry - Enriched domain_knowledge row (with effective_confidence)
 * @returns {string} Formatted entry
 */
function formatEntry(entry) {
  const conf = Math.round(entry.effective_confidence * 100);
  return `- [${entry.knowledge_type}] ${entry.title} (${conf}% confidence): ${entry.content}`;
}

/**
 * Build a domain context string from accumulated knowledge.
 * Returns a formatted block suitable for injection into AI agent prompts.
 *
 * Excludes stale entries (effective_confidence < MIN_EFFECTIVE_CONFIDENCE).
 * Caps output at MAX_CONTEXT_CHARS characters.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} industry - Industry to query knowledge for
 * @param {Object} [options]
 * @param {string} [options.segment] - Optional segment filter
 * @param {number} [options.maxChars] - Override max chars (default: 2000)
 * @returns {Promise<string>} Formatted context string, or empty string if no knowledge
 */
export async function buildDomainContext(supabase, industry, options = {}) {
  if (!supabase || !industry) return '';

  const maxChars = options.maxChars || MAX_CONTEXT_CHARS;

  let entries;
  try {
    entries = await getByIndustry(supabase, industry, {
      segment: options.segment,
      limit: 30,
    });
  } catch (err) {
    console.log(`[DomainIntelligence] buildDomainContext query failed: ${err.message}`);
    return '';
  }

  // Filter out stale entries
  const fresh = entries.filter(e => e.effective_confidence >= MIN_EFFECTIVE_CONFIDENCE);

  if (fresh.length === 0) return '';

  // Build context with character limit
  const header = `## Domain Knowledge: ${industry}\n`;
  let context = header;

  for (const entry of fresh) {
    const line = formatEntry(entry) + '\n';
    if (context.length + line.length > maxChars) break;
    context += line;
  }

  return context.trim();
}

/**
 * Append cross-venture pattern insights to a domain context block.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} industry - Industry to derive tags from
 * @param {Object} [options]
 * @param {string[]} [options.tags] - Tags to search across ventures
 * @param {string[]} [options.problemAreas] - Problem areas to match
 * @param {number} [options.maxChars] - Override max chars (default: 2000)
 * @returns {Promise<string>} Formatted context with cross-venture section, or empty string
 */
export async function buildDomainContextWithPatterns(supabase, industry, options = {}) {
  const base = await buildDomainContext(supabase, industry, options);
  const tags = options.tags || [industry];
  const problemAreas = options.problemAreas || [];

  if (tags.length === 0 && problemAreas.length === 0) return base;

  const maxChars = options.maxChars || MAX_CONTEXT_CHARS;
  const service = createDomainKnowledgeService(supabase);

  let patterns;
  try {
    patterns = await service.findCrossVenturePatterns(tags, problemAreas, 10);
  } catch {
    return base;
  }

  const fresh = patterns.filter(e => e.effective_confidence >= MIN_EFFECTIVE_CONFIDENCE);
  if (fresh.length === 0) return base;

  let context = base ? base + '\n\n' : '';
  context += '## Cross-Venture Patterns\n';

  for (const entry of fresh) {
    const line = formatEntry(entry) + '\n';
    if (context.length + line.length > maxChars) break;
    context += line;
  }

  return context.trim();
}
