/**
 * Research Engine for Multi-Model Deep Research
 * SD-LEO-FEAT-CLARIFY-VERIFICATION-TAXONOMY-001 (FR-3)
 *
 * Performs API-only deep research by querying multiple AI providers
 * in parallel and synthesizing results into a structured report.
 *
 * Uses existing provider adapters from the debate system.
 */

import { getAllAdapters } from '../sub-agents/vetting/provider-adapters.js';

const RESEARCH_SYSTEM_PROMPT = `You are a research analyst providing thorough analysis on technical topics.

Given a research question and optional context, provide a structured analysis covering:
1. Executive takeaways (2-3 key points)
2. Available options/approaches (with pros and cons for each)
3. Key tradeoffs to consider
4. Risks and pitfalls
5. Recommended path forward

You MUST respond in JSON format:
{
  "executive_takeaways": ["takeaway1", "takeaway2"],
  "options": [
    {"name": "Option A", "description": "...", "pros": ["..."], "cons": ["..."]}
  ],
  "tradeoffs": ["tradeoff1", "tradeoff2"],
  "risks": ["risk1", "risk2"],
  "recommended_path": "...",
  "confidence_score": 0.0-1.0
}

Be specific, practical, and evidence-based. Avoid generic advice.`;

/**
 * Run deep research across multiple AI providers
 *
 * @param {Object} params - Research parameters
 * @param {string} params.question - The research question
 * @param {string} [params.context] - Additional context
 * @param {Object} [params.constraints] - Research constraints
 * @returns {Object} Structured research result
 */
export async function runResearch({ question, context, constraints } = {}) {
  if (!question) {
    throw new Error('Research question is required');
  }

  const startTime = Date.now();
  const adapters = getAllAdapters();
  const providerNames = Object.keys(adapters);

  // Build the user prompt
  let userPrompt = `## Research Question\n\n${question}`;
  if (context) {
    userPrompt += `\n\n## Context\n\n${context}`;
  }
  if (constraints) {
    userPrompt += `\n\n## Constraints\n\n${JSON.stringify(constraints, null, 2)}`;
  }

  // Query all providers in parallel
  const providerResults = await Promise.allSettled(
    providerNames.map(async (name) => {
      const adapter = adapters[name];
      const callStart = Date.now();
      const response = await adapter.complete(RESEARCH_SYSTEM_PROMPT, userPrompt, {
        maxTokens: 3000
      });
      return {
        provider: name,
        model: response.model,
        content: response.content,
        durationMs: Date.now() - callStart,
        usage: response.usage
      };
    })
  );

  // Separate successes and failures
  const successes = [];
  const failures = [];
  const providersStatus = {};

  providerResults.forEach((result, i) => {
    const name = providerNames[i];
    if (result.status === 'fulfilled') {
      successes.push(result.value);
      providersStatus[name] = { status: 'OK', model: result.value.model, durationMs: result.value.durationMs };
    } else {
      failures.push({ provider: name, error: result.reason?.message || 'Unknown error' });
      providersStatus[name] = { status: 'FAILED', error: result.reason?.message };
    }
  });

  if (successes.length === 0) {
    return {
      success: false,
      error: 'All providers failed',
      providers_status: providersStatus,
      durationMs: Date.now() - startTime
    };
  }

  // Parse and synthesize results
  const parsedResults = successes.map(s => {
    try {
      const jsonMatch = s.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return { provider: s.provider, data: JSON.parse(jsonMatch[0]), raw: false };
      }
    } catch { /* parse error - use raw */ }
    return { provider: s.provider, data: { raw_response: s.content }, raw: true };
  });

  // Synthesize into unified report
  const synthesis = synthesizeResults(parsedResults, question);

  return {
    success: true,
    question,
    synthesis,
    provider_perspectives: parsedResults.map(r => ({
      provider: r.provider,
      is_structured: !r.raw,
      data: r.data
    })),
    providers_status: providersStatus,
    providers_used: successes.length,
    providers_failed: failures.length,
    durationMs: Date.now() - startTime
  };
}

/**
 * Synthesize results from multiple providers into a unified report
 * @private
 */
function synthesizeResults(parsedResults, question) {
  const structured = parsedResults.filter(r => !r.raw);

  if (structured.length === 0) {
    return {
      executive_takeaways: ['Multiple providers responded but none returned structured data'],
      options: [],
      tradeoffs: [],
      risks: ['Unable to parse structured responses - manual review needed'],
      recommended_path: 'Review raw provider responses for insights',
      confidence_score: 0.3
    };
  }

  // Merge executive takeaways (deduplicate)
  const allTakeaways = structured.flatMap(r => r.data.executive_takeaways || []);
  const executive_takeaways = [...new Set(allTakeaways)].slice(0, 5);

  // Merge options (keep all unique)
  const allOptions = structured.flatMap(r => r.data.options || []);
  const seenOptions = new Set();
  const options = allOptions.filter(o => {
    const key = (o.name || '').toLowerCase();
    if (seenOptions.has(key)) return false;
    seenOptions.add(key);
    return true;
  });

  // Merge tradeoffs
  const tradeoffs = [...new Set(structured.flatMap(r => r.data.tradeoffs || []))].slice(0, 7);

  // Merge risks
  const risks = [...new Set(structured.flatMap(r => r.data.risks || []))].slice(0, 7);

  // Use highest-confidence recommendation
  const recommendations = structured
    .map(r => ({ path: r.data.recommended_path, score: r.data.confidence_score || 0.5, provider: r.provider }))
    .sort((a, b) => b.score - a.score);

  const recommended_path = recommendations[0]?.path || 'No clear recommendation from providers';

  // Average confidence
  const confidence_score = Math.round(
    (structured.reduce((sum, r) => sum + (r.data.confidence_score || 0.5), 0) / structured.length) * 100
  ) / 100;

  return {
    executive_takeaways,
    options,
    tradeoffs,
    risks,
    recommended_path,
    confidence_score,
    consensus: structured.length >= 2 ? evaluateConsensus(structured) : 'insufficient_providers'
  };
}

/**
 * Evaluate consensus among provider results
 * @private
 */
function evaluateConsensus(structured) {
  const recommendations = structured.map(r => (r.data.recommended_path || '').toLowerCase());

  // Simple word overlap check between recommendations
  const words = recommendations.map(r => new Set(r.split(/\s+/).filter(w => w.length > 3)));
  if (words.length < 2) return 'insufficient_data';

  let totalOverlap = 0;
  let comparisons = 0;
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const intersection = [...words[i]].filter(w => words[j].has(w)).length;
      const union = new Set([...words[i], ...words[j]]).size;
      totalOverlap += union > 0 ? intersection / union : 0;
      comparisons++;
    }
  }

  const avgOverlap = comparisons > 0 ? totalOverlap / comparisons : 0;
  if (avgOverlap > 0.3) return 'strong';
  if (avgOverlap > 0.15) return 'moderate';
  return 'weak';
}

export default { runResearch };
