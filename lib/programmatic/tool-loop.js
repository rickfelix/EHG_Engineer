/**
 * Programmatic Tool-Use Loop Handler
 * SD-LEO-INFRA-PROGRAMMATIC-TOOL-CALLING-001
 *
 * Runs an Anthropic tool-use loop where Claude calls registered tools,
 * Node.js dispatches them, and only the final compact result surfaces to
 * the calling Claude Code session. Intermediate data never enters the main
 * context window.
 *
 * @module lib/programmatic/tool-loop
 */

import Anthropic from '@anthropic-ai/sdk';

const SDK_MIN_VERSION = '0.36.0'; // tool_use stable since this version
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4096;
const MAX_TOOL_TURNS = 20; // safety cap

/**
 * Check Anthropic SDK version is sufficient.
 * Uses Anthropic.VERSION static property when available.
 * @throws {Error} if SDK version is confirmed too old
 */
function checkSdkVersion() {
  try {
    // Anthropic class exposes VERSION since 0.20+
    const v = String(Anthropic.VERSION ?? '0.39.0');
    const [major, minor] = v.split('.').map(Number);
    const [minMajor, minMinor] = SDK_MIN_VERSION.split('.').map(Number);
    if (major < minMajor || (major === minMajor && minor < minMinor)) {
      throw new Error(
        `@anthropic-ai/sdk ${v} is too old for programmatic tool calling. ` +
        `Upgrade to >= ${SDK_MIN_VERSION}: npm install @anthropic-ai/sdk@latest`
      );
    }
  } catch (err) {
    if (err.message.includes('too old')) throw err;
    // Version check failed non-critically — proceed
  }
}

/**
 * Run a programmatic task using the Anthropic tool-use loop.
 *
 * @param {string} prompt - User prompt describing the task
 * @param {Array<{definition: Object, handler: Function}>} tools - Tool definitions + handlers
 * @param {Object} [options]
 * @param {string} [options.model] - Claude model to use
 * @param {number} [options.maxTokens] - Max tokens per response
 * @param {string} [options.systemPrompt] - Optional system prompt
 * @param {boolean} [options.dryRun] - If true, tool handlers receive dryRun=true flag
 * @returns {Promise<string>} Final text output from Claude
 */
export async function runProgrammaticTask(prompt, tools, options = {}) {
  checkSdkVersion();

  const {
    model = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    systemPrompt,
    dryRun = false,
  } = options;

  const client = new Anthropic();

  // Build tool definitions for the API call
  const toolDefs = tools.map(t => t.definition);

  // Build handler map
  const handlerMap = {};
  for (const t of tools) {
    handlerMap[t.definition.name] = t.handler;
  }

  // Initial messages
  const messages = [{ role: 'user', content: prompt }];

  let turns = 0;
  let finalText = '';

  while (turns < MAX_TOOL_TURNS) {
    turns++;

    const requestParams = {
      model,
      max_tokens: maxTokens,
      tools: toolDefs,
      messages,
    };
    if (systemPrompt) requestParams.system = systemPrompt;

    const response = await client.messages.create(requestParams);

    // Collect text from this response
    const textBlocks = response.content.filter(b => b.type === 'text');
    if (textBlocks.length > 0) {
      finalText = textBlocks.map(b => b.text).join('\n');
    }

    if (response.stop_reason === 'end_turn') {
      break;
    }

    if (response.stop_reason !== 'tool_use') {
      // Unexpected stop reason — return what we have
      break;
    }

    // Dispatch tool calls
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

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: resultContent,
      });
    }

    // Append assistant response + tool results to message history
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }

  return finalText;
}
