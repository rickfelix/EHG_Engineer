/**
 * Task classifier — routes a Todoist subtask to one of 6 flows.
 * SD: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A
 *
 * Returns one of FLOWS — never null, never throws on valid input,
 * never a 7th category (FR-2 AC-3).
 */

import { FLOWS } from './_internal/system-prompt.js';
import { createAnthropicClient, complete, DEFAULT_MODEL } from './_internal/anthropic-client.js';

const CLASSIFIER_PROMPT = `Classify the following subtask into exactly one flow:
- research: open question that needs investigation
- decision: binary or multi-way choice
- draft: produce written output
- action_prep: concrete next-step planning
- platform: tool/service selection or configuration
- pure_human: requires human-only action (call, meeting)

Respond with ONLY the flow name (one of: research, decision, draft, action_prep, platform, pure_human). No prose, no quotes, no punctuation.`;

const KEYWORD_HINTS = {
  research: ['research', 'investigate', 'explore', 'compare', 'evaluate', 'study', 'should i', 'why does', 'how does'],
  decision: ['decide', 'decision', 'choose', 'pick', 'go with', 'select', 'a or b', 'either'],
  draft: ['draft', 'write', 'compose', 'email', 'message', 'rfc', 'document', 'letter', 'reply to'],
  action_prep: ['plan', 'prepare', 'next step', 'checklist', 'todo', 'before i', 'what do i need'],
  platform: ['tool', 'service', 'platform', 'install', 'configure', 'set up', 'use which', 'pick a'],
  pure_human: ['call', 'meeting', 'in person', 'phone', 'visit', 'talk to', 'face to face'],
};

/**
 * Heuristic fallback used when the SDK is unavailable.
 * @param {object} subtask
 * @returns {string} one of FLOWS
 */
export function classifyHeuristic(subtask) {
  const haystack = `${subtask?.content ?? ''} ${subtask?.description ?? ''}`.toLowerCase();
  let bestFlow = 'research';
  let bestScore = 0;
  for (const flow of FLOWS) {
    const hints = KEYWORD_HINTS[flow] ?? [];
    let score = 0;
    for (const h of hints) if (haystack.includes(h)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestFlow = flow;
    }
  }
  return bestFlow;
}

function normalizeReply(reply) {
  const cleaned = String(reply || '').trim().toLowerCase().replace(/[^a-z_]/g, '');
  return FLOWS.includes(cleaned) ? cleaned : null;
}

/**
 * Classify a subtask via Anthropic SDK call.
 * Falls back to heuristic when SDK call fails or returns invalid output.
 *
 * @param {object} subtask - {content, description, ...}
 * @param {object} [opts] - {client, model, useHeuristic}
 * @returns {Promise<string>} one of FLOWS
 */
export async function classify(subtask, opts = {}) {
  if (!subtask || typeof subtask !== 'object') {
    throw new Error('classify(subtask): subtask must be an object with content');
  }

  if (opts.useHeuristic) return classifyHeuristic(subtask);

  let client;
  try {
    client = opts.client ?? createAnthropicClient();
  } catch {
    return classifyHeuristic(subtask);
  }

  const userMessage = `Title: ${subtask.content ?? ''}\n\nDescription: ${subtask.description ?? '(none)'}`;
  try {
    const { reply } = await complete({
      client,
      systemPrompt: CLASSIFIER_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      model: opts.model ?? DEFAULT_MODEL,
      maxTokens: 16,
    });
    const normalized = normalizeReply(reply);
    if (normalized) return normalized;
  } catch {
    // fall through to heuristic
  }
  return classifyHeuristic(subtask);
}

export default { classify, classifyHeuristic, FLOWS };
