/**
 * SD-LEO-INFRA-UNBLOCK-PORTFOLIO-WIDE-001 (FR-3) — the FIRST consumer of
 * issue_patterns.auto_block_on_match.
 *
 * Before this module the flag had ZERO runtime consumers (grep-verified) — setting it was a
 * no-op (a dark seam). This converts it into a real "prevent-at-gate" seam, designed FAIL-SAFE
 * for a live 6-session fleet:
 *   - ADVISORY by default: surfaces enabled high-signal patterns + their prevention checklists.
 *   - FAIL-OPEN: any error -> advise, never block (the fleet is never wedged by this code).
 *   - OPT-IN ENFORCE: blocking requires BOTH an explicit enforce flag AND a pattern that carries
 *     an explicit, narrow `block_signatures` list (in metadata) that is found in the evaluated
 *     context. A pattern WITHOUT block_signatures can NEVER block — it is advisory-only. So
 *     enabling auto_block_on_match on a curated pattern is safe; enforcement is a separate,
 *     deliberate, per-pattern + per-invocation opt-in.
 *
 * PURE core (evaluateAutoBlock) is unit-tested; thin IO (loadEnabledPatterns / runAutoBlockCheck)
 * does the live read. Enforce is gated by env LEO_AUTO_BLOCK_ENFORCE === 'on' (default OFF).
 */

export const ENFORCE_ENV = 'LEO_AUTO_BLOCK_ENFORCE';

/**
 * Is enforcement enabled? Fail-closed to ADVISORY: only the exact string 'on' enables it.
 * @param {object} [env]
 * @returns {boolean}
 */
export function isEnforceEnabled(env = (typeof process !== 'undefined' ? process.env : {})) {
  try { return String((env && env[ENFORCE_ENV]) || '').trim() === 'on'; } catch { return false; }
}

/** Normalize the evaluated context into a single lowercased haystack string. */
function contextHaystack(context) {
  if (!context) return '';
  if (typeof context === 'string') return context.toLowerCase();
  const parts = [];
  if (typeof context.text === 'string') parts.push(context.text);
  if (Array.isArray(context.files)) parts.push(context.files.join('\n'));
  if (Array.isArray(context.diffLines)) parts.push(context.diffLines.join('\n'));
  return parts.join('\n').toLowerCase();
}

/** Extract a pattern's explicit, narrow block signatures (only these can ever block). */
function blockSignatures(pattern) {
  const sig = pattern && pattern.metadata && pattern.metadata.block_signatures;
  return Array.isArray(sig) ? sig.filter((x) => typeof x === 'string' && x.trim()) : [];
}

/**
 * PURE — evaluate enabled patterns against a context. No IO.
 * @param {object} params
 * @param {object[]} params.patterns - enabled+active patterns ({pattern_id, issue_summary, severity, prevention_checklist, metadata})
 * @param {object|string} [params.context] - what we are checking ({text, files, diffLines} or string)
 * @param {boolean} [params.enforce] - opt-in enforcement (default false -> advisory only)
 * @returns {{verdict:'ADVISE'|'BLOCK', blocked:boolean, enforced:boolean, advisories:object[], hardMatches:object[], failedOpen:boolean}}
 */
export function evaluateAutoBlock({ patterns, context, enforce = false } = {}) {
  try {
    const list = Array.isArray(patterns) ? patterns : [];
    const haystack = contextHaystack(context);
    const advisories = [];
    const hardMatches = [];
    for (const p of list) {
      if (!p || !p.pattern_id) continue;
      advisories.push({
        pattern_id: p.pattern_id,
        severity: p.severity || 'unknown',
        summary: (p.issue_summary || '').slice(0, 200),
        prevention: Array.isArray(p.prevention_checklist) ? p.prevention_checklist.slice(0, 10) : [],
      });
      const sigs = blockSignatures(p);
      if (sigs.length && haystack) {
        const hit = sigs.find((s) => haystack.includes(s.toLowerCase()));
        if (hit) hardMatches.push({ pattern_id: p.pattern_id, signature: hit, severity: p.severity || 'unknown' });
      }
    }
    const blocked = Boolean(enforce) && hardMatches.length > 0;
    return { verdict: blocked ? 'BLOCK' : 'ADVISE', blocked, enforced: Boolean(enforce), advisories, hardMatches, failedOpen: false };
  } catch (e) {
    // FAIL-OPEN: never block the fleet on an internal error.
    return { verdict: 'ADVISE', blocked: false, enforced: false, advisories: [], hardMatches: [], failedOpen: true, error: e && e.message ? e.message : String(e) };
  }
}

/**
 * Thin IO — load the enabled (auto_block_on_match=true) ACTIVE patterns. Fail-open: [] on error.
 * @param {object} supabase
 * @returns {Promise<object[]>}
 */
export async function loadEnabledPatterns(supabase) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('issue_patterns')
      .select('pattern_id, severity, issue_summary, prevention_checklist, metadata, status, auto_block_on_match')
      .eq('auto_block_on_match', true)
      .eq('status', 'active');
    if (error) return [];
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 exact-cap tripwire: exactly the
    // PostgREST 1000-row max is presumed truncated — missing patterns silently weaken the
    // auto-block guard. WARN, don't crash (this loader is fail-open by contract).
    // (Pagination not used: the unit-test chain stubs expose no .order()/.range().)
    if (Array.isArray(data) && data.length === 1000) {
      console.warn('[auto-block-consumer] enabled-pattern read returned exactly 1000 rows (PostgREST cap) — pattern set may be truncated');
    }
    return data || [];
  } catch { return []; }
}

/**
 * IO wrapper — load enabled patterns and evaluate. Enforce resolves from env unless overridden.
 * Fail-open throughout.
 * @param {object} params
 * @param {object} params.supabase
 * @param {object|string} [params.context]
 * @param {boolean} [params.enforce] - explicit override; defaults to env LEO_AUTO_BLOCK_ENFORCE
 * @param {object} [params.env]
 * @returns {Promise<object>}
 */
export async function runAutoBlockCheck({ supabase, context, enforce, env } = {}) {
  try {
    const patterns = await loadEnabledPatterns(supabase);
    const eff = typeof enforce === 'boolean' ? enforce : isEnforceEnabled(env);
    const result = evaluateAutoBlock({ patterns, context, enforce: eff });
    return { ...result, enabledCount: patterns.length };
  } catch (e) {
    return { verdict: 'ADVISE', blocked: false, enforced: false, advisories: [], hardMatches: [], failedOpen: true, enabledCount: 0, error: e && e.message ? e.message : String(e) };
  }
}
