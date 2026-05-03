/**
 * SD Input Resolver — canonical bimodal SD identifier resolution.
 *
 * Closes the QF-515-class crash where gate-pipeline callsites query
 * strategic_directives_v2 with `.eq('id', sd_id)` and silently match zero
 * rows when sd_id is the sd_key form (which is the canonical CLI shape).
 *
 * Contract differs from legacy normalizeSDId (scripts/modules/sd-id-normalizer.js):
 *   - Legacy returns null on not-found (silent-zero) — known anti-pattern.
 *   - This helper THROWS on not-found — fail-fast contract for new code.
 * Existing helpers shim through this one in Phase 2 of the migration so
 * legacy callers keep their null-tolerance via try/catch translation.
 *
 * @module scripts/lib/sd-id-resolver
 */
import {
  detectIdFormat,
  isUUID,
} from '../modules/sd-id-normalizer.js';

const UUID_OR_KEY_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|SD-[A-Z0-9-]+)$/i;

/**
 * Resolve a Strategic Directive identifier (UUID or sd_key form) to its
 * canonical {sdId, sdKey, sd} triple via a single OR query.
 *
 * @param {string} sdInput - SD identifier in either UUID or SD-XXX-NNN form.
 * @param {Object} supabase - Supabase client (must support .from().select().or().single()).
 * @returns {Promise<{sdId: string, sdKey: string, sd: Object}>}
 * @throws {TypeError} on null/undefined/non-string/empty/malformed input.
 * @throws {Error} on row-not-found (with input value embedded in message).
 * @throws {Error} on DB error (with original error message preserved).
 */
export async function resolveSdInput(sdInput, supabase) {
  if (sdInput === null || sdInput === undefined) {
    throw new TypeError(`[resolveSdInput] sdInput must be a non-empty string, received ${sdInput === null ? 'null' : 'undefined'}`);
  }
  if (typeof sdInput !== 'string') {
    throw new TypeError(`[resolveSdInput] sdInput must be a non-empty string, received ${typeof sdInput}`);
  }
  const trimmed = sdInput.trim();
  if (trimmed.length === 0) {
    throw new TypeError('[resolveSdInput] sdInput must be a non-empty string, received empty string');
  }
  if (!UUID_OR_KEY_REGEX.test(trimmed)) {
    throw new TypeError(`[resolveSdInput] sdInput "${trimmed}" matches neither UUID nor SD_KEY format`);
  }

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .or(`id.eq.${trimmed},sd_key.eq.${trimmed}`)
    .single();

  // .single() returns error PGRST116 on 0 rows. Treat that as not-found,
  // and any other error as a DB error.
  if (error) {
    if (error.code === 'PGRST116' || /no rows|not found|0 rows/i.test(error.message || '')) {
      throw new Error(`[resolveSdInput] SD not found for input "${trimmed}"`);
    }
    throw new Error(`[resolveSdInput] DB error resolving "${trimmed}": ${error.message}`);
  }
  if (!data) {
    throw new Error(`[resolveSdInput] SD not found for input "${trimmed}"`);
  }

  return {
    sdId: data.id,
    sdKey: data.sd_key || data.id,
    sd: data,
  };
}

/**
 * Variant of resolveSdInput that returns {sd: null} instead of throwing on not-found.
 * Use for callsites that gracefully handle null results (e.g., gate validators that
 * skip when SD type unknown). Input-validation errors (TypeError) still throw.
 *
 * @param {string} sdInput
 * @param {Object} supabase
 * @returns {Promise<{sdId: string|null, sdKey: string|null, sd: Object|null}>}
 */
export async function resolveSdInputOrNull(sdInput, supabase) {
  try {
    return await resolveSdInput(sdInput, supabase);
  } catch (err) {
    if (err instanceof TypeError) throw err;
    return { sdId: null, sdKey: null, sd: null };
  }
}

export { detectIdFormat, isUUID };
export default resolveSdInput;
