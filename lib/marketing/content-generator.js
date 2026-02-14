/**
 * Marketing Content Generator Service
 * SD-EVA-FEAT-MARKETING-FOUNDATION-001
 *
 * Accepts venture context and produces text variants (headline, body, CTA)
 * via LLM Client Factory. Creates marketing_content + marketing_content_variants records.
 */

import Anthropic from '@anthropic-ai/sdk';

const CONTENT_TYPES = ['social_post', 'email', 'ad'];
const VARIANT_KEYS = ['variant_a', 'variant_b'];

/**
 * Generate marketing content variants for a venture
 * @param {object} params
 * @param {object} params.supabase - Supabase client
 * @param {string} params.ventureId - Venture UUID
 * @param {object} params.ventureContext - { name, description, targetAudience, industry }
 * @param {string} [params.contentType='social_post'] - Content type
 * @param {string} [params.platform='x'] - Target platform
 * @param {string} [params.campaignId] - Optional campaign to link
 * @param {string[]} [params.conceptTags=[]] - Tags for content categorization
 * @returns {Promise<{contentId: string, variants: object[]}>}
 */
export async function generateContent({
  supabase,
  ventureId,
  ventureContext,
  contentType = 'social_post',
  platform = 'x',
  campaignId = null,
  conceptTags = []
}) {
  if (!CONTENT_TYPES.includes(contentType)) {
    throw new Error(`Invalid content type: ${contentType}. Must be one of: ${CONTENT_TYPES.join(', ')}`);
  }

  // 1. Create marketing_content record in GENERATE state
  const { data: content, error: contentError } = await supabase
    .from('marketing_content')
    .insert({
      venture_id: ventureId,
      content_type: contentType,
      channel_family: contentType === 'ad' ? 'paid' : 'social',
      concept_tags: conceptTags,
      lifecycle_state: 'GENERATE',
      metadata: { platform, campaign_id: campaignId }
    })
    .select('id')
    .single();

  if (contentError) {
    throw new Error(`Failed to create marketing_content: ${contentError.message}`);
  }

  // 2. Generate variants via LLM
  const prompt = buildGenerationPrompt(ventureContext, contentType, platform);
  const variants = await callLLMForVariants(prompt);

  // 3. Insert variants
  const variantRecords = variants.map((v, i) => ({
    content_id: content.id,
    variant_key: VARIANT_KEYS[i] || `variant_${String.fromCharCode(97 + i)}`,
    headline: v.headline,
    body: v.body,
    cta: v.cta,
    metadata: { generated_by: 'content-generator', platform }
  }));

  const { data: insertedVariants, error: variantError } = await supabase
    .from('marketing_content_variants')
    .insert(variantRecords)
    .select('id, variant_key, headline, body, cta');

  if (variantError) {
    throw new Error(`Failed to insert variants: ${variantError.message}`);
  }

  // 4. Link to campaign if provided
  if (campaignId) {
    await supabase.from('campaign_content').insert({
      campaign_id: campaignId,
      content_id: content.id,
      platform,
      idempotency_key: `${ventureId}:${content.id}:${platform}:${Date.now()}`
    });
  }

  return {
    contentId: content.id,
    variants: insertedVariants
  };
}

/**
 * Transition content lifecycle state
 * @param {object} supabase - Supabase client
 * @param {string} contentId - Content UUID
 * @param {string} newState - Target lifecycle state
 */
export async function transitionContentState(supabase, contentId, newState) {
  const validStates = ['IDEATE', 'GENERATE', 'REVIEW', 'SCHEDULE', 'DISPATCH', 'MEASURE', 'OPTIMIZE'];
  if (!validStates.includes(newState)) {
    throw new Error(`Invalid lifecycle state: ${newState}`);
  }

  const { error } = await supabase
    .from('marketing_content')
    .update({ lifecycle_state: newState })
    .eq('id', contentId);

  if (error) {
    throw new Error(`Failed to transition content ${contentId} to ${newState}: ${error.message}`);
  }
}

/**
 * Build LLM prompt for content generation
 */
function buildGenerationPrompt(ventureContext, contentType, platform) {
  const platformConstraints = {
    x: 'Maximum 280 characters per post. Use hashtags sparingly (1-2 max).',
    bluesky: 'Maximum 300 characters. No hashtag support.',
    youtube: 'Title max 100 chars. Description can be longer.',
    mastodon: 'Maximum 500 characters. Hashtags supported.',
    threads: 'Maximum 500 characters.',
    linkedin: 'Professional tone. Can be longer form (up to 3000 chars).',
    tiktok: 'Short, engaging caption. Max 150 chars recommended.'
  };

  return `You are a marketing content specialist. Generate 2 distinct content variants for the following venture.

## Venture Context
- Name: ${ventureContext.name}
- Description: ${ventureContext.description || 'N/A'}
- Target Audience: ${ventureContext.targetAudience || 'General'}
- Industry: ${ventureContext.industry || 'Technology'}

## Content Requirements
- Type: ${contentType}
- Platform: ${platform}
- Platform Constraints: ${platformConstraints[platform] || 'No specific constraints.'}

## Output Format
Return exactly 2 variants as JSON array:
[
  { "headline": "...", "body": "...", "cta": "..." },
  { "headline": "...", "body": "...", "cta": "..." }
]

Make variants meaningfully different in tone/approach (e.g., one informative, one emotional).
Respond ONLY with the JSON array, no other text.`;
}

/**
 * Call LLM to generate content variants
 * Uses Anthropic SDK directly (haiku tier for cost efficiency)
 */
async function callLLMForVariants(prompt) {
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0]?.text || '[]';
    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('LLM response did not contain valid JSON array');
    }

    const variants = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(variants) || variants.length < 2) {
      throw new Error('LLM must return at least 2 variants');
    }

    return variants.slice(0, 2).map(v => ({
      headline: v.headline || '',
      body: v.body || '',
      cta: v.cta || ''
    }));
  } catch (error) {
    // Fallback: return template variants if LLM fails
    console.warn(`LLM content generation failed: ${error.message}. Using template fallback.`);
    return [
      { headline: 'Discover something new', body: 'Template variant A - update with real content', cta: 'Learn more' },
      { headline: 'Transform your workflow', body: 'Template variant B - update with real content', cta: 'Get started' }
    ];
  }
}
