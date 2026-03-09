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

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * System prompt for EVA strategic adviser responses
 */
const EVA_SYSTEM_PROMPT = `You are EVA, an AI strategic adviser for the EHG venture portfolio chairman.

Your role:
- Provide strategic analysis across the venture portfolio
- Help with decision-making using structured frameworks
- Surface risks, opportunities, and trade-offs
- Be concise but thorough — the chairman values substance over length

Communication style:
- Direct and actionable
- Use numbered lists for multiple points
- Bold key terms and conclusions
- Reference specific ventures by name when relevant
- Keep responses under 500 words unless the question demands more`;

/**
 * Generate EVA response for a user message
 * Uses Claude Sonnet via client-factory for cost efficiency
 */
async function generateEVAResponse(conversationMessages) {
  // Dynamic import to handle ESM
  const { createLLMClient } = await import('../llm/client-factory.js');

  const client = await createLLMClient('sonnet');

  const messages = conversationMessages.map(m => ({
    role: m.role,
    content: m.content
  }));

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: EVA_SYSTEM_PROMPT,
    messages
  });

  const content = response.content[0]?.text || '';
  const tokenCount = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

  return {
    content,
    tokenCount,
    model: response.model || 'claude-sonnet-4-20250514'
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
  // Ensure conversation exists and belongs to user
  const { data: conv, error: convErr } = await supabase
    .from('eva_chat_conversations')
    .select('id, user_id')
    .eq('id', conversationId)
    .single();

  if (convErr || !conv) {
    throw new Error(`Conversation not found: ${conversationId}`);
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

  // Generate EVA response
  const evaResponse = await generateEVAResponse(history || [{ role: 'user', content: userContent }]);

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
 * Stream EVA response tokens via SSE callbacks.
 * SD-LEO-INFRA-EVA-CHAT-CANVAS-004 (Phase 3 — Streaming)
 *
 * @param {string} conversationId
 * @param {string} userContent
 * @param {string} userId
 * @param {{ onToken: (t:string)=>void, onComplete: (msg:object)=>void, onError: (e:Error)=>void }} callbacks
 */
export async function streamMessage(conversationId, userContent, _userId, callbacks) {
  // Validate conversation
  const { data: conv, error: convErr } = await supabase
    .from('eva_chat_conversations')
    .select('id')
    .eq('id', conversationId)
    .single();

  if (convErr || !conv) {
    callbacks.onError(new Error(`Conversation not found: ${conversationId}`));
    return;
  }

  // Store user message
  const { error: userErr } = await supabase
    .from('eva_chat_messages')
    .insert({ conversation_id: conversationId, role: 'user', content: userContent });

  if (userErr) {
    callbacks.onError(new Error(`Failed to store user message: ${userErr.message}`));
    return;
  }

  // Get conversation history
  const { data: history } = await supabase
    .from('eva_chat_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  const messages = (history || [{ role: 'user', content: userContent }]).map(m => ({
    role: m.role,
    content: m.content
  }));

  try {
    const { createLLMClient } = await import('../llm/client-factory.js');
    const client = await createLLMClient('sonnet');

    // Use Claude streaming API
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: EVA_SYSTEM_PROMPT,
      messages
    });

    let fullContent = '';

    stream.on('text', (text) => {
      fullContent += text;
      callbacks.onToken(text);
    });

    const finalMessage = await stream.finalMessage();

    const tokenCount = (finalMessage.usage?.input_tokens || 0) + (finalMessage.usage?.output_tokens || 0);

    // Store the complete response
    const { data: assistantMsg, error: assistantErr } = await supabase
      .from('eva_chat_messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: fullContent,
        token_count: tokenCount,
        model_used: finalMessage.model || 'claude-sonnet-4-20250514'
      })
      .select()
      .single();

    if (assistantErr) {
      callbacks.onError(new Error(`Failed to store response: ${assistantErr.message}`));
      return;
    }

    // Auto-title if first exchange
    if (history && history.length <= 1) {
      const title = userContent.slice(0, 80) + (userContent.length > 80 ? '...' : '');
      await supabase
        .from('eva_chat_conversations')
        .update({ title })
        .eq('id', conversationId);
    }

    callbacks.onComplete(assistantMsg);
  } catch (err) {
    callbacks.onError(err);
  }
}

// CLI entry point
const isMain = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
               import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
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
