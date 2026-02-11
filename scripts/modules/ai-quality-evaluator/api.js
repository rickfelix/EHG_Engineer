/**
 * AI Quality Evaluator - OpenAI API
 * API calls with retry logic and rate limit handling
 */

/**
 * Call OpenAI API with retry logic and rate limit handling
 * Note: gpt-5-mini doesn't support function/tool calling, so we use json_object mode
 *
 * Supports two calling patterns:
 *   callOpenAI(client, model, messages)  - explicit model
 *   callOpenAI(client, messages)         - model from client.defaultModel
 *
 * @param {Object} openai - OpenAI client instance or factory adapter with .chat.completions.create()
 * @param {string|Array} modelOrMessages - Model name or messages array (if 2-arg call)
 * @param {Array} [messages] - Array of message objects (if 3-arg call)
 * @param {number} [retries=3] - Number of retries
 * @returns {Promise<Object>} API response
 */
export async function callOpenAI(openai, modelOrMessages, messages, retries = 3) {
  // Support 2-arg call: callOpenAI(client, messages)
  let model;
  if (Array.isArray(modelOrMessages)) {
    messages = modelOrMessages;
    model = openai.defaultModel;
  } else {
    model = modelOrMessages;
  }
  const timeoutMs = parseInt(process.env.AI_API_TIMEOUT_MS) || 60000; // Default 60s timeout
  const DEBUG = process.env.AI_DEBUG === 'true';

  for (let attempt = 1; attempt <= retries; attempt++) {
    const attemptStart = Date.now();
    try {
      if (DEBUG && attempt > 1) {
        console.log(`[OpenAI] Retry attempt ${attempt}/${retries}...`);
      }

      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`OpenAI API timeout after ${timeoutMs}ms`)), timeoutMs)
      );

      // Create API call promise
      const apiPromise = openai.chat.completions.create({
        model,
        messages,
        response_format: { type: 'json_object' },
        max_completion_tokens: 8000  // Increased to handle detailed multi-criterion responses
        // Note: gpt-5-mini only supports temperature=1 (default)
      });

      // Race between API call and timeout
      const response = await Promise.race([apiPromise, timeoutPromise]);

      if (DEBUG && attempt > 1) {
        console.log(`[OpenAI] Retry ${attempt} succeeded after ${Date.now() - attemptStart}ms`);
      }

      return response;
    } catch (error) {
      const attemptDuration = Date.now() - attemptStart;
      const isRateLimit = error.status === 429 || error.message?.includes('rate') || error.code === 'rate_limit_exceeded';
      const isTimeout = error.message?.includes('timeout');
      const isNetworkError = error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message?.includes('network');

      // Enhanced error logging
      console.warn(`[OpenAI] Attempt ${attempt}/${retries} failed after ${attemptDuration}ms`);
      console.warn(`[OpenAI] Error type: ${isRateLimit ? 'RATE_LIMIT' : isTimeout ? 'TIMEOUT' : isNetworkError ? 'NETWORK' : 'OTHER'}`);
      console.warn(`[OpenAI] Error details: ${error.message || error.code || 'Unknown'}`);
      if (error.status) console.warn(`[OpenAI] HTTP status: ${error.status}`);

      if (attempt === retries) {
        if (isRateLimit) {
          throw new Error(`OpenAI rate limit exceeded after ${retries} retries. Try increasing AI_RATE_LIMIT_DELAY_MS (current: ${process.env.AI_RATE_LIMIT_DELAY_MS || '1500'}ms)`);
        }
        throw error;
      }

      // Rate limit: longer backoff (3s, 6s, 12s)
      // Timeout/other: exponential backoff (1s, 2s, 4s)
      const baseDelay = isRateLimit ? 3000 : 1000;
      const delay = Math.pow(2, attempt - 1) * baseDelay;
      console.warn(`[OpenAI] Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
