/**
 * Deep Research Provider Adapters
 * SD-LEO-FEAT-DEEP-RESEARCH-API-001 (FR-001)
 *
 * Provider-specific adapters for extended thinking / deep research modes:
 * - Anthropic: Extended Thinking with budget_tokens
 * - Google: Gemini with grounding/search
 * - OpenAI: o3-deep-research / o4-mini-deep-research
 *
 * All adapters normalize responses into a unified DeepResearchResult schema.
 */

import Anthropic from '@anthropic-ai/sdk';

const DEEP_RESEARCH_SYSTEM = `You are a deep research analyst performing thorough, multi-angle analysis.
Take your time to reason carefully. Consider multiple perspectives, edge cases, and implications.
Provide comprehensive, actionable findings with specific evidence and recommendations.`;

/** Anthropic Extended Thinking adapter. */
export async function anthropicDeepResearch(query, options = {}) {
  const client = new Anthropic();
  const model = options.model || 'claude-opus-4-5-20251101';
  const budgetTokens = options.thinkingBudget || 10000;
  const startTime = Date.now();

  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    thinking: { type: 'enabled', budget_tokens: budgetTokens },
    messages: [{ role: 'user', content: `${DEEP_RESEARCH_SYSTEM}\n\n## Research Query\n\n${query}` }],
  });

  let thinking = '';
  let result = '';
  let tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

  for (const block of response.content) {
    if (block.type === 'thinking') thinking += block.thinking;
    if (block.type === 'text') result += block.text;
  }

  return { provider: 'anthropic', model, query, thinking, result, tokens_used: tokensUsed, duration_ms: Date.now() - startTime, cost_estimate: estimateCost('anthropic', tokensUsed) };
}

/** Google Gemini deep research adapter. */
export async function googleDeepResearch(query, options = {}) {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY or GEMINI_API_KEY required');

  const model = options.model || 'gemini-2.5-pro';
  const startTime = Date.now();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${DEEP_RESEARCH_SYSTEM}\n\n## Research Query\n\n${query}` }] }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
        tools: [{ googleSearch: {} }],
      }),
    }
  );

  if (!response.ok) throw new Error(`Google API error: ${response.status} - ${await response.text()}`);

  const data = await response.json();
  const result = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n') || '';
  const tokensUsed = data.usageMetadata?.totalTokenCount || 0;

  return { provider: 'google', model, query, thinking: '', result, tokens_used: tokensUsed, duration_ms: Date.now() - startTime, cost_estimate: estimateCost('google', tokensUsed) };
}

/** OpenAI deep research adapter. */
export async function openaiDeepResearch(query, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY required');

  const model = options.model || 'o3-deep-research-2025-06-26';
  const startTime = Date.now();

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: DEEP_RESEARCH_SYSTEM }, { role: 'user', content: query }],
      max_completion_tokens: 8192,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI API error: ${response.status} - ${await response.text()}`);

  const data = await response.json();
  const choice = data.choices?.[0];
  const tokensUsed = data.usage?.total_tokens || 0;

  return { provider: 'openai', model, query, thinking: choice?.message?.reasoning || '', result: choice?.message?.content || '', tokens_used: tokensUsed, duration_ms: Date.now() - startTime, cost_estimate: estimateCost('openai', tokensUsed) };
}

/** Estimate cost in USD based on provider and token count. */
function estimateCost(provider, tokens) {
  const rates = { anthropic: 0.000015, google: 0.000005, openai: 0.000015 };
  return Math.round((tokens * (rates[provider] || 0.00001)) * 10000) / 10000;
}

/** Get the best available deep research provider based on API key availability. */
export function getBestAvailableProvider() {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY) return 'google';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
}

/** Route to the appropriate deep research adapter. */
export async function runDeepResearch(query, options = {}) {
  const provider = options.provider || getBestAvailableProvider();
  if (!provider) throw new Error('No AI provider API key configured for deep research');

  const adapters = { anthropic: anthropicDeepResearch, google: googleDeepResearch, openai: openaiDeepResearch };
  const adapter = adapters[provider];
  if (!adapter) throw new Error(`Unknown deep research provider: ${provider}`);

  return adapter(query, options);
}

export { estimateCost };
