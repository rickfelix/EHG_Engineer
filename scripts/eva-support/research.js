/**
 * Sub-flow: research.
 * SD: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A
 * Phase 2 extension: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-B / FR-2, TR-3, US-004
 *   research-cache short-circuit before LLM invocation; cache miss falls through
 *   to runSubFlow and writes back on success.
 */

import { runSubFlow } from './_internal/sub-flow-base.js';
import * as defaultResearchCache from '../../lib/eva-support/research-cache.js';
import { buildEntry } from './decision-log-formatter.js';

const FLOW_GUIDANCE = `Mode: investigation. The chairman has an open question that needs prior art, evidence, or context before a decision can be made.

Your reply MUST:
- Cite at least one concrete reference (URL, file path in this repo, SD-key, doc title) — never reply without a citation
- State what you would investigate next, in concrete terms
- If the question is malformed or unanswerable as posed, push back and refine the question

Do not pre-make the decision. Stay in research mode unless the operator overrides.`;

/**
 * Compose the cache lookup key from subtask + operator input. Keeps the cache
 * key stable across whitespace/casing variations via research-cache.normalizeQuery.
 */
function cacheKeyFor(subtask, operatorInput) {
  const parts = [subtask?.content ?? '', subtask?.description ?? '', operatorInput ?? ''];
  return parts.filter(Boolean).join(' :: ');
}

export default async function research(
  subtask,
  { history = [], operatorInput = '', client, model, decisionLogStore = null, researchCache = defaultResearchCache } = {},
) {
  // Phase 2 cache lookup (fail-soft per research-cache.js posture — any error returns hit:false).
  const cacheKey = cacheKeyFor(subtask, operatorInput);
  if (researchCache && typeof researchCache.get === 'function') {
    try {
      const cached = await researchCache.get(cacheKey);
      if (cached && cached.hit) {
        const sequence = (history?.length ?? 0) + 1;
        const decision_log_entry = buildEntry({
          task_id: subtask.id,
          sequence,
          flow: 'research',
          eva_reply: cached.response,
          operator_input: operatorInput,
          override_reason: null,
          model: 'cache:eva_support_research_cache',
          tokens_in: 0,
          tokens_out: 0,
          references: Array.isArray(cached.references) ? cached.references : [],
        });
        // Persist the cache-hit entry to DB if a store is wired (FR-4 dual-write contract).
        let db_persisted = false;
        if (decisionLogStore && typeof decisionLogStore.insertEntry === 'function') {
          const result = await decisionLogStore.insertEntry(decision_log_entry);
          db_persisted = !!(result && (result.verified || result.inserted));
        }
        return {
          reply: cached.response,
          decision_log_entry,
          db_persisted,
          cache: { hit: true, hash: cached.hash },
        };
      }
    } catch {
      // Fail-soft: cache infrastructure must never block the research flow.
    }
  }

  const result = await runSubFlow({
    flow: 'research',
    flowGuidance: FLOW_GUIDANCE,
    subtask,
    history,
    operatorInput,
    client,
    model,
    decisionLogStore,
  });

  // Write-back: store the LLM response in the cache for future invocations.
  if (researchCache && typeof researchCache.set === 'function') {
    try {
      await researchCache.set(cacheKey, result.reply, {
        references: result.decision_log_entry?.references ?? [],
      });
    } catch {
      // Fail-soft on write — caller already has the response.
    }
  }

  return { ...result, cache: { hit: false } };
}
