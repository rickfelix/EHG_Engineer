/**
 * Authoring-time evidence-artifact resolver — SD-LEO-FIX-AUTHORING-TIME-EVIDENCE-001.
 *
 * Distinct from scripts/modules/handoff/executors/lead-final-approval/gates/
 * acceptance-artifact-gate.js, which validates a STRUCTURED {table,match,satisfied}
 * declaration and is explicitly "NOT a prose parser" (its own doc comment) — confirmed
 * unreusable for free-text scanning (VALIDATION evidence 3aedc8bd-7e2e-4b90-9fa0-582fadaa3790).
 * This module instead scans free-text SD prose (description/scope/success_criteria) for
 * uuid-shaped tokens an author may have cited as fixture/artifact references, resolves
 * each against a small explicit table allowlist, and annotates the verified owner beside
 * each resolved token — refusing loudly (never silently) when a token resolves to nothing.
 *
 * Precedent reused, not re-derived:
 *   - Token extraction shape: lib/feedback/preclaim-feedback-rows.js's extractFeedbackUuids()
 *   - Table-allowlist shape: lib/schema-context-loader.js's KNOWN_TABLES/extractTableNames()
 */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EXTRACTION_CAP = 10;

// Explicit, reviewed allowlist — deliberately NOT select('*'), deliberately NOT
// schema-introspected. Add a table here only when a real authoring workflow needs it.
export const ARTIFACT_OWNER_ALLOWLIST = Object.freeze([
  { table: 'strategic_directives_v2', idColumn: 'id', ownerColumn: 'sd_key' },
  { table: 'venture_artifacts', idColumn: 'id', ownerColumn: 'venture_id' },
  { table: 'uat_test_runs', idColumn: 'id', ownerColumn: 'sd_id' },
]);

/** Extract deduped, lowercased uuid-shaped tokens from free text, cap-bounded. */
export function extractUuidTokens(text, cap = EXTRACTION_CAP) {
  const found = String(text || '').match(UUID_RE) || [];
  const seen = [];
  for (const u of found) {
    const lc = u.toLowerCase();
    if (!seen.includes(lc)) seen.push(lc);
    if (seen.length >= cap) break;
  }
  return seen;
}

/**
 * Resolve one token against the explicit table allowlist.
 * @returns {Promise<{token:string, resolved:boolean, table?:string, ownerKey?:string}>}
 */
export async function resolveArtifactOwner(supabase, token) {
  for (const entry of ARTIFACT_OWNER_ALLOWLIST) {
    try {
      const { data } = await supabase
        .from(entry.table)
        .select(`${entry.idColumn}, ${entry.ownerColumn}`)
        .eq(entry.idColumn, token)
        .maybeSingle();
      if (data && data[entry.ownerColumn]) {
        return { token, resolved: true, table: entry.table, ownerKey: String(data[entry.ownerColumn]) };
      }
    } catch { /* this table refused/errored -- try the next allowlisted table */ }
  }
  return { token, resolved: false };
}

/**
 * Resolve every uuid-shaped token across the given prose fields.
 * @param {object} supabase
 * @param {Array<string|null|undefined>} fields
 * @returns {Promise<{resolutions: Array, unresolved: string[]}>}
 */
export async function resolveArtifactOwnersInFields(supabase, fields) {
  const text = (fields || []).filter(Boolean).map((f) => (typeof f === 'string' ? f : JSON.stringify(f))).join('\n');
  const tokens = extractUuidTokens(text);
  const resolutions = [];
  for (const token of tokens) {
    resolutions.push(await resolveArtifactOwner(supabase, token));
  }
  const unresolved = resolutions.filter((r) => !r.resolved).map((r) => r.token);
  return { resolutions, unresolved };
}

/**
 * Rewrite a resolved token's owner annotation IN PLACE within `text`, replacing any
 * existing "(owner: X)" annotation immediately following the token — the row's
 * live-read owner always wins over stale/self-authored prose, never the reverse.
 */
export function annotateOwnerInText(text, token, ownerKey) {
  if (typeof text !== 'string' || !text) return text;
  const tokenRe = new RegExp(`(${token})(\\s*\\(owner:[^)]*\\))?`, 'gi');
  return text.replace(tokenRe, (_m, matchedToken) => `${matchedToken} (owner: ${ownerKey})`);
}
