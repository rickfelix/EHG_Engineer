/**
 * EVA Idea Classifier
 * SD: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001D
 *
 * AI-powered hybrid classification: assigns venture_tag and business_function
 * to intake items using LLM classification with category keyword hints.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Load category definitions from database
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{ventureTags: Array, businessFunctions: Array}>}
 */
async function loadCategories(supabase) {
  const { data } = await supabase
    .from('eva_idea_categories')
    .select('category_type, code, label, classification_keywords')
    .eq('is_active', true)
    .order('sort_order');

  return {
    ventureTags: (data || []).filter(c => c.category_type === 'venture_tag'),
    businessFunctions: (data || []).filter(c => c.category_type === 'business_function')
  };
}

/**
 * Build classification prompt for the LLM
 * @param {string} title
 * @param {string} description
 * @param {Object} categories
 * @returns {string}
 */
function buildClassificationPrompt(title, description, categories) {
  const ventureOptions = categories.ventureTags
    .map(c => `  - ${c.code}: ${c.label} (keywords: ${c.classification_keywords.join(', ')})`)
    .join('\n');

  const functionOptions = categories.businessFunctions
    .map(c => `  - ${c.code}: ${c.label} (keywords: ${c.classification_keywords.join(', ')})`)
    .join('\n');

  return `Classify this idea into exactly one venture_tag and one business_function.

Title: ${title}
Description: ${description || 'No description'}

Venture Tags (pick one):
${ventureOptions}

Business Functions (pick one):
${functionOptions}

Respond with ONLY valid JSON (no markdown, no explanation):
{"venture_tag": "<code>", "business_function": "<code>", "confidence": <0.0-1.0>}`;
}

/**
 * Parse LLM classification response
 * @param {string} response
 * @returns {Object|null}
 */
function parseClassificationResponse(response) {
  try {
    // Strip markdown code fences if present
    const cleaned = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.venture_tag && parsed.business_function && typeof parsed.confidence === 'number') {
      return {
        venture_tag: parsed.venture_tag,
        business_function: parsed.business_function,
        confidence_score: Math.min(1, Math.max(0, parsed.confidence))
      };
    }
  } catch {
    // Fall through to keyword-based fallback
  }
  return null;
}

/**
 * Keyword-based fallback classification
 * @param {string} text - Combined title + description
 * @param {Object} categories
 * @returns {Object}
 */
function keywordClassify(text, categories) {
  const lower = text.toLowerCase();

  let bestVenture = { code: 'cross_venture', score: 0 };
  for (const cat of categories.ventureTags) {
    const score = cat.classification_keywords.filter(kw => lower.includes(kw.toLowerCase())).length;
    if (score > bestVenture.score) {
      bestVenture = { code: cat.code, score };
    }
  }

  let bestFunction = { code: 'feature_idea', score: 0 };
  for (const cat of categories.businessFunctions) {
    const score = cat.classification_keywords.filter(kw => lower.includes(kw.toLowerCase())).length;
    if (score > bestFunction.score) {
      bestFunction = { code: cat.code, score };
    }
  }

  return {
    venture_tag: bestVenture.code,
    business_function: bestFunction.code,
    confidence_score: 0.5 // Lower confidence for keyword-based
  };
}

/**
 * Classify an intake item
 * @param {string} title
 * @param {string} description
 * @param {Object} [options]
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase]
 * @returns {Promise<{venture_tag: string, business_function: string, confidence_score: number}>}
 */
export async function classifyIdea(title, description, options = {}) {
  const supabase = options.supabase || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const categories = await loadCategories(supabase);
  const combinedText = `${title} ${description || ''}`;

  // Try LLM classification first
  try {
    const { getClassificationClient } = await import('../llm/client-factory.js');
    const client = await getClassificationClient();

    const prompt = buildClassificationPrompt(title, description, categories);
    const response = await client.chat({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 100
    });

    const content = response.choices?.[0]?.message?.content || response.content?.[0]?.text || '';
    const result = parseClassificationResponse(content);

    if (result) return result;
  } catch (err) {
    // LLM unavailable - fall through to keyword-based
    if (options.verbose) {
      console.log(`  LLM classification failed (${err.message}), using keyword fallback`);
    }
  }

  // Fallback to keyword-based classification
  return keywordClassify(combinedText, categories);
}

export default { classifyIdea };
