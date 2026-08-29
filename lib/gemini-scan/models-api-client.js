/**
 * Google Gemini authenticated models-list client (SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-I).
 *
 * Mirrors lib/sub-agents/vetting/provider-adapters.js's GoogleAdapter apiKey resolution
 * and base URL so this scan uses the same auth convention the rest of the repo already
 * relies on, rather than inventing a second one.
 */

export const GEMINI_MODELS_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export function resolveGeminiApiKey(env = process.env) {
  return env.GOOGLE_AI_API_KEY || env.GEMINI_API_KEY || null;
}

/**
 * Fetch the current Gemini model catalog. `fetchImpl` is injected so no test or
 * --dry-run invocation ever performs a real network call.
 * @param {{ apiKey?: string, fetchImpl?: typeof fetch, env?: object }} [options]
 * @returns {Promise<Array<{id: string, displayName: string, description: string}>>}
 */
export async function fetchGeminiModels({ apiKey, fetchImpl = fetch, env = process.env } = {}) {
  const key = apiKey || resolveGeminiApiKey(env);
  if (!key) {
    throw new Error('fetchGeminiModels: no API key resolved (set GOOGLE_AI_API_KEY or GEMINI_API_KEY)');
  }
  const res = await fetchImpl(`${GEMINI_MODELS_BASE_URL}/models?key=${encodeURIComponent(key)}`);
  if (!res.ok) {
    throw new Error(`fetchGeminiModels: Google models API returned ${res.status}`);
  }
  const body = await res.json();
  const models = Array.isArray(body?.models) ? body.models : [];
  return models.map((m) => ({
    id: String(m.name || '').replace(/^models\//, ''),
    displayName: m.displayName || '',
    description: m.description || '',
  }));
}
