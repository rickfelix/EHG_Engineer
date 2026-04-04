/**
 * Provider Rotation Scheduler — Latin-Square Balanced Assignment
 * SD: SD-LEO-INFRA-MULTI-MODEL-BOARD-001
 *
 * Assigns LLM providers to board seats using a balanced rotation:
 * - Exactly 2 seats per provider per session
 * - Roles rotate through providers across sessions
 * - Full coverage (every role sees every provider) within 3 sessions
 *
 * Providers: anthropic (Claude), google (Gemini), openai (GPT)
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

const PROVIDERS = ['anthropic', 'google', 'openai'];

/**
 * Latin-square rotation matrices for 6 seats across 3 providers.
 * Each row is a session rotation (0-indexed). Each column is a seat index.
 * Values are provider indices into PROVIDERS array.
 * Designed so every seat sees every provider across 3 sessions.
 */
const ROTATION_MATRIX = [
  [0, 0, 1, 1, 2, 2], // Session 0: 2 anthropic, 2 google, 2 openai
  [1, 2, 2, 0, 0, 1], // Session 1: rotated
  [2, 1, 0, 2, 1, 0], // Session 2: rotated again — all combinations covered
];

/**
 * Get provider assignments for a given session.
 *
 * @param {number} sessionIndex - The rotation index (increments each session)
 * @param {string[]} seatCodes - Array of seat codes (e.g., ['CSO', 'CRO', 'CTO', 'CISO', 'COO', 'CFO'])
 * @returns {Array<{seatCode: string, provider: string, modelId: string}>}
 */
export function getProviderAssignments(sessionIndex, seatCodes) {
  const rotationRow = ROTATION_MATRIX[sessionIndex % ROTATION_MATRIX.length];
  const seatsToAssign = Math.min(seatCodes.length, rotationRow.length);

  return seatCodes.slice(0, seatsToAssign).map((seatCode, idx) => {
    const providerIdx = rotationRow[idx % rotationRow.length];
    const provider = PROVIDERS[providerIdx];
    return {
      seatCode,
      provider,
      modelId: getModelIdForProvider(provider)
    };
  });
}

/**
 * Get the configured model ID for a provider.
 * Reads from environment variables, falls back to defaults.
 *
 * @param {string} provider - Provider name (anthropic, google, openai)
 * @returns {string} Model ID
 */
function getModelIdForProvider(provider) {
  const defaults = {
    anthropic: 'claude-opus-4-6',
    google: 'gemini-2.5-pro',
    openai: 'gpt-5.4'
  };
  const envKeys = {
    anthropic: 'CLAUDE_DELIBERATION_MODEL',
    google: 'GEMINI_DELIBERATION_MODEL',
    openai: 'OPENAI_DELIBERATION_MODEL'
  };
  return process.env[envKeys[provider]] || defaults[provider];
}

/**
 * Get the current rotation state from the database.
 *
 * @returns {Promise<{rotationIndex: number, lastRotation: object}>}
 */
export async function getCurrentRotationState() {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('provider_rotation_state')
    .select('rotation_index, last_rotation')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  return data || { rotationIndex: 0, lastRotation: {} };
}

/**
 * Advance the rotation index and persist to database.
 *
 * @param {Array<{seatCode: string, provider: string}>} assignments - Current session assignments
 * @returns {Promise<number>} The new rotation index
 */
export async function advanceRotation(assignments) {
  const supabase = createSupabaseServiceClient();
  const current = await getCurrentRotationState();
  const newIndex = (current.rotationIndex + 1) % ROTATION_MATRIX.length;

  const { error } = await supabase
    .from('provider_rotation_state')
    .upsert({
      id: 1,
      rotation_index: newIndex,
      last_rotation: Object.fromEntries(assignments.map(a => [a.seatCode, a.provider])),
      updated_at: new Date().toISOString()
    });

  if (error) console.warn('[provider-rotation] Failed to persist rotation state:', error.message);
  return newIndex;
}

/**
 * Record seat assignments for a debate session (audit trail).
 *
 * @param {string} debateSessionId - The debate session UUID
 * @param {Array<{seatCode: string, provider: string, modelId: string}>} assignments
 * @param {number} roundNumber - Round number (default: 1)
 */
export async function recordSeatAssignments(debateSessionId, assignments, roundNumber = 1) {
  const supabase = createSupabaseServiceClient();
  const rows = assignments.map(a => ({
    session_id: debateSessionId,
    seat_code: a.seatCode,
    provider: a.provider,
    model_id: a.modelId,
    round_number: roundNumber
  }));

  const { error } = await supabase.from('provider_seat_assignments').insert(rows);
  if (error) console.warn('[provider-rotation] Failed to record assignments:', error.message);
}

/**
 * Check if multi-model deliberation is enabled.
 * @returns {boolean}
 */
export function isMultiModelEnabled() {
  return process.env.MULTI_MODEL_DELIBERATION !== 'false';
}

export { PROVIDERS, ROTATION_MATRIX };
