/**
 * Shared base for sub-flow modules.
 * SD: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A
 *
 * Each sub-flow module composes a flow-specific prompt suffix on top
 * of the base SYSTEM_PROMPT, calls Anthropic, and returns
 * {reply, decision_log_entry} for the dispatcher.
 */

import { SYSTEM_PROMPT, OVERRIDE_TOKEN } from './system-prompt.js';
import { createAnthropicClient, complete, DEFAULT_MODEL } from './anthropic-client.js';
import { buildEntry } from '../decision-log-formatter.js';

/**
 * Detect whether the operator's input begins with a literal Override:<reason>
 * token. Returns the trimmed reason text, or null.
 */
export function extractOverrideReason(operatorInput) {
  if (typeof operatorInput !== 'string') return null;
  if (!operatorInput.startsWith(OVERRIDE_TOKEN)) return null;
  const reason = operatorInput.slice(OVERRIDE_TOKEN.length).trim();
  return reason.length > 0 ? reason : null;
}

/**
 * Run a sub-flow.
 *
 * @param {object} params
 * @param {string} params.flow - one of FLOWS
 * @param {string} params.flowGuidance - flow-specific instructions appended to SYSTEM_PROMPT
 * @param {object} params.subtask - {id, content, description}
 * @param {Array<object>} [params.history] - prior decision_log_entry objects
 * @param {string} [params.operatorInput] - operator's most recent message (may begin with Override:)
 * @param {object} [params.client] - optional Anthropic client (for tests)
 * @param {string} [params.model]
 * @param {object} [params.decisionLogStore] - SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-B / FR-4:
 *   optional Phase 2 store. If provided, the entry is INSERTed via
 *   decisionLogStore.insertEntry(entry) BEFORE returning. A throw here means
 *   the caller MUST NOT proceed with the Todoist comment write (atomic DB-FIRST
 *   contract). If omitted, behavior is identical to Phase 1 (build + return only).
 * @returns {Promise<{reply: string, decision_log_entry: object, db_persisted?: boolean}>}
 */
export async function runSubFlow({ flow, flowGuidance, subtask, history = [], operatorInput = '', client, model = DEFAULT_MODEL, decisionLogStore = null }) {
  if (!subtask?.id) throw new Error('subtask.id is required');

  const sdkClient = client ?? createAnthropicClient();
  const overrideReason = extractOverrideReason(operatorInput);
  const sequence = (history?.length ?? 0) + 1;

  const systemPrompt = `${SYSTEM_PROMPT}\n\nACTIVE FLOW: ${flow}\n${flowGuidance}`;

  const messages = [];
  for (const h of history) {
    if (h.operator_input_summary) messages.push({ role: 'user', content: h.operator_input_summary });
    if (h.eva_reply_summary) messages.push({ role: 'assistant', content: h.eva_reply_summary });
  }
  const userText = `Subtask: ${subtask.content ?? ''}\n\nDescription: ${subtask.description ?? '(none)'}\n\nOperator input: ${operatorInput || '(none)'}`;
  messages.push({ role: 'user', content: userText });

  const { reply, tokens_in, tokens_out, model: usedModel } = await complete({
    client: sdkClient,
    systemPrompt,
    messages,
    model,
  });

  const decision_log_entry = buildEntry({
    task_id: subtask.id,
    sequence,
    flow,
    eva_reply: reply,
    operator_input: operatorInput,
    override_reason: overrideReason,
    model: usedModel,
    tokens_in,
    tokens_out,
    references: [],
  });

  // Phase 2 atomic DB-FIRST dual-write (SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-B / FR-4):
  // when a store is injected, persist the envelope to eva_support_decision_log BEFORE
  // returning. A throw propagates to the dispatcher → slash command, which then
  // MUST NOT post the Todoist comment. This makes DB the canonical store; Todoist
  // becomes a human-readable mirror only when the DB write succeeds.
  let db_persisted = false;
  if (decisionLogStore && typeof decisionLogStore.insertEntry === 'function') {
    const result = await decisionLogStore.insertEntry(decision_log_entry);
    db_persisted = !!(result && (result.verified || result.inserted));
  }

  return { reply, decision_log_entry, db_persisted };
}

export default { runSubFlow, extractOverrideReason };
