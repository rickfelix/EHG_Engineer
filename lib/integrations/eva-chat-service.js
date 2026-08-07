/**
 * EVA Chat Service — Phase 1
 * SD-LEO-INFRA-EVA-CHAT-CANVAS-002
 *
 * Handles EVA chat conversation orchestration:
 * - Creates conversations
 * - Processes user messages
 * - Generates EVA responses via Claude
 * - Stores messages in database
 *
 * Called by frontend via Supabase RPC or by scripts directly.
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import 'dotenv/config';
import { getClaudeModel } from '../config/model-config.js';
// SD-LEO-INFRA-USER-STORY-QUALITY-001 (FR-3): BOTH LLM call sites in this file destructured
// `createLLMClient` from a DYNAMIC import of client-factory.js — a symbol that module does not
// export. The destructure therefore yielded `undefined` and the call threw
// "createLLMClient is not a function" on EVERY invocation. That is a hard fail rather than the
// silent fallback the stories module had, so it was visible to whoever hit it — but it means EVA
// chat was dead on both paths, not degraded. Static import so the symbol is resolved at load time
// and a future rename breaks the build instead of one request.
// UPDATED BY SD-LEO-INFRA-LLM-ADAPTER-STREAMING-ABSENT-001: this comment said "BOTH LLM call sites"
// and named the streaming one. That site is gone — see the retirement block further down. Corrected
// here because a correction that lands on the deletion site while the file header keeps describing
// the deleted thing is how the next reader gets a false picture from a file that was just fixed.
import { getLLMClient } from '../llm/client-factory.js';
import { isMainModule } from '../utils/is-main-module.js';
import { getSectionPrompt } from '../eva/friday-chat-prompt.js';

const supabase = createSupabaseServiceClient();

// Decision intent keywords — word-boundary match, active only when friday_state present
const DECISION_INTENT_RE = /\b(accept|dismiss|defer|skip|next|move\s+on)\b/i;

/**
 * Route a decision intent detected in a chairman message during a Friday meeting.
 * Async, non-blocking — errors are logged but do not throw.
 *
 * @param {string} conversationId
 * @param {string} intent - Matched intent keyword
 * @param {Object} fridayState - Current friday_state from conversation metadata
 */
async function routeDecisionIntent(conversationId, intent, fridayState) {
  try {
    const { populateDecisionConsequences } = await import('../eva/services/friday-briefing-card.js');
    const normalizedIntent = intent.toLowerCase().replace(/\s+/g, '_');
    // Note: populateDecisionConsequences requires an actual eva_friday_decisions UUID.
    // Here we log the intent for section-level audit; real decision IDs come from
    // specific decision-card interactions in the UI.
    const outcome = {
      outcome_type: normalizedIntent,
      reasoning: `Chairman indicated ${normalizedIntent} during section ${fridayState.current_section}`,
      action_implied: normalizedIntent
    };
    // Only route if a real decision ID is available in state; otherwise just log
    const pendingDecisionId = fridayState.pending_decision_id || null;
    if (pendingDecisionId) {
      await populateDecisionConsequences(pendingDecisionId, outcome);
    }
    console.log(`[eva-chat-service] Decision intent routed: ${normalizedIntent} (conversation ${conversationId})`);
  } catch (err) {
    console.warn(`[eva-chat-service] Decision routing failed (non-blocking): ${err.message}`);
  }
}

/**
 * EVA Personality Layer — dual-persona awareness
 * Chairman mode: portfolio strategy, venture evaluation, kill gates
 * Builder mode: implementation, technical decisions, shipping
 */
const EVA_BASE_PROMPT = `You are EVA (Executive Virtual Assistant), an AI strategic thinking partner for the EHG venture portfolio chairman.

Personality traits:
- Intellectually curious — probe beneath surface-level answers
- Strategically deep — connect dots across the portfolio
- Constructively challenging — push back when reasoning is thin
- Dual-persona aware — adapt tone to context

Persona modes:
- CHAIRMAN MODE (portfolio strategy, venture evaluation, kill gates, resource allocation):
  Executive, concise, decision-oriented. Frame everything in terms of portfolio impact.
- BUILDER MODE (implementation, technical decisions, shipping, code):
  Collaborative, technical, detail-aware. Focus on unblocking and velocity.

Detect mode from conversation context. Default to chairman mode.

Every response MUST include at least one probing follow-up question that:
- Surfaces underlying assumptions or motivations
- Challenges the framing if appropriate
- Opens a deeper line of strategic inquiry

Communication style:
- Direct and actionable
- Use numbered lists for multiple points
- Bold key terms and conclusions
- Reference specific ventures by name when relevant
- Keep responses under 500 words unless the question demands more`;

/**
 * Build full system prompt, optionally enriched with Friday data context.
 * @param {Object} [fridayData] - Structured metrics from friday-data-aggregator
 * @returns {string} Complete system prompt
 */
function buildSystemPrompt(fridayData) {
  if (!fridayData) return EVA_BASE_PROMPT;

  const sd = fridayData.sd_velocity || {};
  const ventures = fridayData.venture_progress || {};
  const patterns = fridayData.trending_patterns || {};

  return EVA_BASE_PROMPT + `\n\nFriday Session Context (${new Date().toLocaleDateString()}):
- SDs completed this week: ${sd.completed_this_week || 0}
- Active SDs: ${sd.active_count || 0}
- Active ventures: ${ventures.active_count || 0}
- Trending issue patterns: ${patterns.active_count || 0}
Use this data to ground your analysis in actual project metrics.`;
}

const EVA_SYSTEM_PROMPT = EVA_BASE_PROMPT;

/**
 * Generate EVA response for a user message
 * Uses Claude Sonnet via client-factory for cost efficiency
 */
async function generateEVAResponse(conversationMessages, systemPrompt = null) {
  // Dynamic import to handle ESM
  const client = await getLLMClient({ purpose: 'eva-chat', subAgent: 'EVA_CHAT' });

  const messages = conversationMessages.map(m => ({
    role: m.role,
    content: m.content
  }));

  const response = await client.messages.create({
    model: getClaudeModel('validation'),
    max_tokens: 1024,
    system: systemPrompt || EVA_SYSTEM_PROMPT,
    messages
  });

  const content = response.content[0]?.text || '';
  const tokenCount = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

  return {
    content,
    tokenCount,
    model: response.model || getClaudeModel('validation')
  };
}

/**
 * Send a message in a conversation and get EVA's response
 *
 * @param {string} conversationId - UUID of the conversation
 * @param {string} userContent - User's message text
 * @param {string} userId - UUID of the user
 * @returns {{ userMessage, assistantMessage }}
 */
export async function sendMessage(conversationId, userContent, _userId) {
  // Ensure conversation exists and load metadata for friday_state detection
  const { data: conv, error: convErr } = await supabase
    .from('eva_chat_conversations')
    .select('id, user_id, metadata')
    .eq('id', conversationId)
    .single();

  if (convErr || !conv) {
    throw new Error(`Conversation not found: ${conversationId}`);
  }

  // Detect Friday meeting mode and select section-aware prompt
  const fridayState = conv.metadata?.friday_state;
  const systemPrompt = fridayState
    ? getSectionPrompt(fridayState.current_section)
    : null;

  // Route decision intents non-blocking when friday_state is active
  if (fridayState) {
    const intentMatch = DECISION_INTENT_RE.exec(userContent);
    if (intentMatch) {
      routeDecisionIntent(conversationId, intentMatch[1], fridayState).catch(() => {});
    }
  }

  // Store user message
  const { data: userMsg, error: userErr } = await supabase
    .from('eva_chat_messages')
    .insert({
      conversation_id: conversationId,
      role: 'user',
      content: userContent
    })
    .select()
    .single();

  if (userErr) throw new Error(`Failed to store user message: ${userErr.message}`);

  // Get conversation history for context
  const { data: history } = await supabase
    .from('eva_chat_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  // Generate EVA response (section-aware when in Friday meeting mode)
  const evaResponse = await generateEVAResponse(history || [{ role: 'user', content: userContent }], systemPrompt);

  // Store EVA response
  const { data: assistantMsg, error: assistantErr } = await supabase
    .from('eva_chat_messages')
    .insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: evaResponse.content,
      token_count: evaResponse.tokenCount,
      model_used: evaResponse.model
    })
    .select()
    .single();

  if (assistantErr) throw new Error(`Failed to store EVA response: ${assistantErr.message}`);

  // Auto-title conversation if this is the first message
  if (history && history.length <= 1) {
    const title = userContent.slice(0, 80) + (userContent.length > 80 ? '...' : '');
    await supabase
      .from('eva_chat_conversations')
      .update({ title })
      .eq('id', conversationId);
  }

  return { userMessage: userMsg, assistantMessage: assistantMsg };
}

/**
 * Create a new conversation
 */
export async function createConversation(userId, title = 'New Conversation', metadata = {}) {
  const { data, error } = await supabase
    .from('eva_chat_conversations')
    .insert({ user_id: userId, title, metadata })
    .select()
    .single();

  if (error) throw new Error(`Failed to create conversation: ${error.message}`);
  return data;
}

/**
 * List conversations for a user
 */
export async function listConversations(userId, limit = 20, offset = 0) {
  const { data, error } = await supabase
    .rpc('get_eva_conversations', {
      p_user_id: userId,
      p_limit: limit,
      p_offset: offset
    });

  if (error) throw new Error(`Failed to list conversations: ${error.message}`);
  return data || [];
}

/**
 * Get messages for a conversation
 */
export async function getMessages(conversationId) {
  const { data, error } = await supabase
    .rpc('get_conversation_messages', {
      p_conversation_id: conversationId
    });

  if (error) throw new Error(`Failed to get messages: ${error.message}`);
  return data || [];
}

/**
 * *** streamMessage WAS DELETED HERE. IT IS NOT MISSING, IT IS RETIRED. ***
 * SD-LEO-INFRA-LLM-ADAPTER-STREAMING-ABSENT-001.
 *
 * READ THIS BEFORE FILING IT AS A DEFECT AGAIN. Three separate parties examined this function and
 * each re-derived from scratch that it was dead: the parent SD that deliberately left it broken,
 * the SD filed to repair it, and two independent review agents. The cost of that rediscovery is
 * why this comment is longer than a deletion note needs to be.
 *
 * WHAT IT WAS: an SSE token-streaming entry point for EVA chat, added 2026-03-09 (86c2e384f1d,
 * SD-LEO-INFRA-EVA-CHAT-CANVAS-004 Phase 3) together with its only caller, POST /api/eva/chat/stream
 * in server/routes/eva-chat.js.
 *
 * WHY IT IS GONE: that route was deleted 2026-06-02 in f85cd2a7c92 (QF-20260602-028, PR #4185)
 * under a ratified Chairman wire-or-cut decision, feedback cff73055 — "CUT CRUD + retire /stream".
 * The route removal took the caller and left the callee. THE CONSUMER WAS RETIRED TWO MONTHS BEFORE
 * ANYONE FILED THE FUNCTION AS BROKEN. Verified at deletion time: zero callers across all four
 * repos by import graph and by git history; no SSE surface (text/event-stream) anywhere in this
 * repo; the ehg frontend hook useEVAChatConversation.ts uses Supabase RPC only, with no fetch and
 * no EventSource.
 *
 * NOTE the deleting QF's own justification was imprecise: it retained this module because
 * "Friday-meeting uses it", which is true of sendMessage and was never true of streamMessage.
 *
 * IT ALSO NEVER DEMONSTRATED THE DEFECT IT WAS FILED FOR. It destructured `createLLMClient` from
 * client-factory.js — a symbol that module has NEVER exported (git log -S on that file is empty) —
 * so it threw on a missing symbol one line before it reached .messages.stream(). The streaming gap
 * is real, but this call site never reached it.
 *
 * IF YOU NEED TOKEN STREAMING: the adapter layer HAS streaming transport and it is live in
 * production — AnthropicAdapter._completeWithStreaming (lib/sub-agents/vetting/provider-adapters.js)
 * calls real messages.stream(), GoogleAdapter uses SSE, and three callers pass {stream:true} today.
 * What is absent is incremental DELIVERY: lib/llm/stream-watchdog.js onText() takes no argument and
 * discards the token text, resolving to a single finalMessage(). It is a stall detector, not a pipe.
 * Surfacing incremental events is roughly 150-200 LOC. See docs/architecture/llm-stream-watchdog.md.
 *
 * The exact call shape is preserved as an inert specimen at
 * tests/fixtures/llm-call-shapes/dead-factory-messages-stream.fixture.mjs so a future lint rule has
 * a positive subject. Reviving this path would also make two latent issues live immediately: there
 * is no ownership check on conversationId, and both compat layers discard a claude-* model when the
 * provider is google, which .env sets today.
 */

export { buildSystemPrompt, EVA_BASE_PROMPT };

// CLI entry point
if (isMainModule(import.meta.url)) {
  const [,, command, ...args] = process.argv;

  switch (command) {
    case 'send': {
      const [convId, userId, ...messageParts] = args;
      const content = messageParts.join(' ');
      sendMessage(convId, content, userId)
        .then(r => console.log(JSON.stringify(r, null, 2)))
        .catch(e => console.error('Error:', e.message));
      break;
    }
    case 'create': {
      const [userId, title] = args;
      createConversation(userId, title)
        .then(r => console.log('Created:', r.id))
        .catch(e => console.error('Error:', e.message));
      break;
    }
    case 'list': {
      const [userId] = args;
      listConversations(userId)
        .then(r => console.log(JSON.stringify(r, null, 2)))
        .catch(e => console.error('Error:', e.message));
      break;
    }
    default:
      console.log('Usage: node eva-chat-service.js <send|create|list> [args]');
  }
}
