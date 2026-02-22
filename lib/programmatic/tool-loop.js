/**
 * Programmatic Tool-Use Loop Handler
 * SD-LEO-INFRA-PROGRAMMATIC-TOOL-CALLING-001
 *
 * Runs a tool-use loop where the LLM calls registered tools,
 * Node.js dispatches them, and only the final compact result surfaces to
 * the calling Claude Code session. Intermediate data never enters the main
 * context window.
 *
 * Supports: Anthropic Claude (primary) → Google Gemini (fallback)
 *
 * @module lib/programmatic/tool-loop
 */

import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4096;
const MAX_TOOL_TURNS = 20; // safety cap

/**
 * Determine which provider to use based on available API keys.
 * Set LLM_PROVIDER=google to force Google even when Anthropic key exists.
 * @returns {'anthropic'|'google'} Provider name
 */
function resolveProvider() {
  const preferred = (process.env.LLM_PROVIDER || '').toLowerCase();
  if (preferred === 'google' && (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY)) return 'google';
  if (process.env.ANTHROPIC_API_KEY && preferred !== 'google') return 'anthropic';
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) return 'google';
  return 'anthropic'; // will fail with a clear error
}

// ── Anthropic implementation ──────────────────────────────────────────

async function runAnthropicLoop(prompt, tools, options) {
  const {
    model = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    systemPrompt,
    dryRun = false,
  } = options;

  const client = new Anthropic();
  const toolDefs = tools.map(t => t.definition);
  const handlerMap = {};
  for (const t of tools) handlerMap[t.definition.name] = t.handler;

  const messages = [{ role: 'user', content: prompt }];
  let turns = 0;
  let finalText = '';

  while (turns < MAX_TOOL_TURNS) {
    turns++;
    const requestParams = { model, max_tokens: maxTokens, tools: toolDefs, messages };
    if (systemPrompt) requestParams.system = systemPrompt;

    const response = await client.messages.create(requestParams);

    const textBlocks = response.content.filter(b => b.type === 'text');
    if (textBlocks.length > 0) finalText = textBlocks.map(b => b.text).join('\n');

    if (response.stop_reason === 'end_turn') break;
    if (response.stop_reason !== 'tool_use') break;

    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    const toolResults = [];

    for (const toolUse of toolUseBlocks) {
      const handler = handlerMap[toolUse.name];
      let resultContent;
      if (!handler) {
        resultContent = JSON.stringify({ error: `Unknown tool: ${toolUse.name}` });
      } else {
        try {
          const result = await handler(toolUse.input, { dryRun });
          resultContent = typeof result === 'string' ? result : JSON.stringify(result);
        } catch (err) {
          resultContent = JSON.stringify({ error: err.message });
        }
      }
      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: resultContent });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }

  return finalText;
}

// ── Google Gemini implementation ──────────────────────────────────────

/**
 * Convert Anthropic-style tool definitions to Google function declarations.
 */
function toGeminiFunctionDeclarations(tools) {
  return tools.map(t => {
    const def = t.definition;
    return {
      name: def.name,
      description: def.description || '',
      parameters: def.input_schema || { type: 'object', properties: {} },
    };
  });
}

async function runGeminiLoop(prompt, tools, options) {
  const {
    maxTokens = DEFAULT_MAX_TOKENS,
    systemPrompt,
    dryRun = false,
  } = options;

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('No GEMINI_API_KEY or GOOGLE_AI_API_KEY set');

  const model = 'gemini-2.5-flash';
  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  const functionDeclarations = toGeminiFunctionDeclarations(tools);
  const handlerMap = {};
  for (const t of tools) handlerMap[t.definition.name] = t.handler;

  // Build initial contents
  const contents = [];
  if (systemPrompt) {
    // Gemini uses systemInstruction, handled in request body
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  let turns = 0;
  let finalText = '';

  while (turns < MAX_TOOL_TURNS) {
    turns++;

    const requestBody = {
      contents,
      tools: [{ functionDeclarations }],
      generationConfig: { maxOutputTokens: maxTokens },
    };
    if (systemPrompt) {
      requestBody.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const response = await fetch(
      `${baseUrl}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Google API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate) break;

    const parts = candidate.content?.parts || [];

    // Extract text parts
    const textParts = parts.filter(p => p.text);
    if (textParts.length > 0) finalText = textParts.map(p => p.text).join('\n');

    // Check for function calls
    const functionCalls = parts.filter(p => p.functionCall);
    if (functionCalls.length === 0) break; // No tool use, done

    // Add model response to contents
    contents.push({ role: 'model', parts });

    // Dispatch function calls and collect responses
    const functionResponseParts = [];
    for (const fc of functionCalls) {
      const handler = handlerMap[fc.functionCall.name];
      let responseData;
      if (!handler) {
        responseData = { error: `Unknown tool: ${fc.functionCall.name}` };
      } else {
        try {
          const result = await handler(fc.functionCall.args || {}, { dryRun });
          responseData = typeof result === 'string' ? { result } : result;
        } catch (err) {
          responseData = { error: err.message };
        }
      }
      functionResponseParts.push({
        functionResponse: { name: fc.functionCall.name, response: responseData },
      });
    }

    contents.push({ role: 'user', parts: functionResponseParts });
  }

  return finalText;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Run a programmatic task using the best available LLM provider's tool-use loop.
 *
 * @param {string} prompt - User prompt describing the task
 * @param {Array<{definition: Object, handler: Function}>} tools - Tool definitions + handlers
 * @param {Object} [options]
 * @param {string} [options.model] - Model to use (Anthropic only)
 * @param {number} [options.maxTokens] - Max tokens per response
 * @param {string} [options.systemPrompt] - Optional system prompt
 * @param {boolean} [options.dryRun] - If true, tool handlers receive dryRun=true flag
 * @returns {Promise<string>} Final text output from the LLM
 */
export async function runProgrammaticTask(prompt, tools, options = {}) {
  const provider = resolveProvider();

  if (provider === 'google') {
    console.log('   🔷 Programmatic tool-loop: Using Google Gemini (Anthropic unavailable)');
    return runGeminiLoop(prompt, tools, options);
  }

  // Default: Anthropic
  return runAnthropicLoop(prompt, tools, options);
}
