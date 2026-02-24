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
 * @param {Object} [hierarchy] - Parent and sibling context
 * @returns {string}
 */
function buildClassificationPrompt(title, description, categories, hierarchy = {}) {
  const ventureOptions = categories.ventureTags
    .map(c => `  - ${c.code}: ${c.label} (keywords: ${c.classification_keywords.join(', ')})`)
    .join('\n');

  const functionOptions = categories.businessFunctions
    .map(c => `  - ${c.code}: ${c.label} (keywords: ${c.classification_keywords.join(', ')})`)
    .join('\n');

  let hierarchySection = '';
  if (hierarchy.parentTitle) {
    hierarchySection += `\nParent Task: ${hierarchy.parentTitle}`;
  }
  if (hierarchy.siblingTitles?.length > 0) {
    hierarchySection += `\nSibling Tasks: ${hierarchy.siblingTitles.join('; ')}`;
  }
  if (hierarchySection) {
    hierarchySection = `\nHierarchy Context (use to improve classification):${hierarchySection}\n`;
  }

  let youtubeHint = '';
  if (hierarchy.youtubeVideoId) {
    if (hierarchy.youtubeMetadata) {
      const { title: vTitle, description: vDesc, channelName, tags } = hierarchy.youtubeMetadata;
      const descSnippet = (vDesc || '').slice(0, 500);
      const tagList = (tags || []).slice(0, 10).join(', ');
      youtubeHint = `\nYouTube Video Context:\n  Title: ${vTitle}\n  Channel: ${channelName || 'unknown'}`;
      if (descSnippet) youtubeHint += `\n  Description: ${descSnippet}`;
      if (tagList) youtubeHint += `\n  Tags: ${tagList}`;
      youtubeHint += '\n';
    } else {
      youtubeHint = `\nNote: This task references a YouTube video (ID: ${hierarchy.youtubeVideoId}). Consider this as potential learning_resource or content_strategy.\n`;
    }
  }

  return `Classify this idea into exactly one venture_tag and one business_function.

Title: ${title}
Description: ${description || 'No description'}${hierarchySection}${youtubeHint}

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
 * Load hierarchy context (parent title + sibling titles) for a task
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} item - Intake row with todoist_parent_id and todoist_task_id
 * @returns {Promise<{parentTitle: string|null, siblingTitles: string[]}>}
 */
async function loadHierarchyContext(supabase, item) {
  const result = { parentTitle: null, siblingTitles: [] };
  if (!item?.todoist_parent_id) return result;

  // Fetch parent task
  const { data: parent } = await supabase
    .from('eva_todoist_intake')
    .select('title')
    .eq('todoist_task_id', item.todoist_parent_id)
    .maybeSingle();

  if (parent) result.parentTitle = parent.title;

  // Fetch siblings (same parent, excluding self)
  const { data: siblings } = await supabase
    .from('eva_todoist_intake')
    .select('title')
    .eq('todoist_parent_id', item.todoist_parent_id)
    .neq('todoist_task_id', item.todoist_task_id)
    .order('todoist_child_order')
    .limit(10);

  if (siblings) result.siblingTitles = siblings.map(s => s.title);

  return result;
}

/**
 * Classify an intake item
 * @param {string} title
 * @param {string} description
 * @param {Object} [options]
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase]
 * @param {Object} [options.item] - Full intake row (for hierarchy context)
 * @returns {Promise<{venture_tag: string, business_function: string, confidence_score: number}>}
 */
export async function classifyIdea(title, description, options = {}) {
  const supabase = options.supabase || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const categories = await loadCategories(supabase);

  // Load hierarchy context if item provided
  const hierarchy = options.item
    ? await loadHierarchyContext(supabase, options.item)
    : { parentTitle: null, siblingTitles: [] };

  // Pass YouTube video ID and metadata if available
  if (options.item?.extracted_youtube_id) {
    hierarchy.youtubeVideoId = options.item.extracted_youtube_id;
  }
  if (options.item?.youtube_metadata) {
    hierarchy.youtubeMetadata = options.item.youtube_metadata;
  }

  const combinedText = `${hierarchy.parentTitle ? hierarchy.parentTitle + ' > ' : ''}${title} ${description || ''}`;

  // Try LLM classification first
  try {
    const { getClassificationClient } = await import('../llm/client-factory.js');
    const client = await getClassificationClient();

    const prompt = buildClassificationPrompt(title, description, categories, hierarchy);
    const content = await client.complete(
      'You are a precise classification system. Respond with only valid JSON.',
      prompt,
      { maxTokens: 100 }
    );
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
