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
 *
 * KNOWN, DEFERRED (SECURITY evidence 00145217-33d6-458f-a7a7-63079e4afb1a, finding F2 --
 * documented, not silently dropped, mirroring acceptance-artifact-gate.js's own KNOWN/
 * DEFERRED section for the identical shape of concern): the probe is a bare id lookup, not
 * scoped to the authoring SD's own identity -- an author-typed uuid can read/leak the
 * existence + owner key of ANY row on an allowlisted table system-wide, not just one the
 * authoring SD has a legitimate need to reference. Measured LOW materiality today: only
 * scripts/leo-create-sd.js (--from-plan) and the child-decomposition path call this, both
 * already service-role-authorized callers, and the leaked surface is bounded to a single
 * existence-oracle + owner-identifier column (never full row contents). Revisit if this
 * resolver is ever exposed to a caller that is not already service-role-trusted, or if the
 * allowlist grows to include a table whose mere existence-and-owner is itself sensitive.
 */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EXTRACTION_CAP = 10;

// Explicit, reviewed allowlist — deliberately NOT select('*'), deliberately NOT
// schema-introspected. Add a table here only when a real authoring workflow needs it.
// SECURITY evidence 00145217-33d6-458f-a7a7-63079e4afb1a (F3): freeze is applied per-entry
// too -- Object.freeze() on the outer array alone left each entry object mutable.
export const ARTIFACT_OWNER_ALLOWLIST = Object.freeze([
  Object.freeze({ table: 'strategic_directives_v2', idColumn: 'id', ownerColumn: 'sd_key' }),
  Object.freeze({ table: 'venture_artifacts', idColumn: 'id', ownerColumn: 'venture_id' }),
  Object.freeze({ table: 'uat_test_runs', idColumn: 'id', ownerColumn: 'sd_id' }),
]);

/**
 * Bound and neutralize an owner key before it is ever interpolated into stored prose --
 * mirrors acceptance-artifact-gate.js's safeLabel() precedent. Closes SECURITY finding F5
 * (evidence 00145217-33d6-458f-a7a7-63079e4afb1a): an unescaped, unbounded ownerKey could
 * break annotation idempotency (a literal ')' in the value re-opens the "(owner: ...)"
 * group on the next pass) or carry control/ANSI characters into a persisted SD field.
 */
function safeOwnerKey(ownerKey) {
  const stripped = String(ownerKey).replace(/[()\r\n\t]/g, '').replace(/[\x00-\x1f\x7f]/g, '');
  return stripped.length > 100 ? `${stripped.slice(0, 100)}…` : stripped;
}

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
    const { data, error } = await supabase
      .from(entry.table)
      .select(`${entry.idColumn}, ${entry.ownerColumn}`)
      .eq(entry.idColumn, token)
      .maybeSingle();
    if (error) {
      // SECURITY evidence 00145217-33d6-458f-a7a7-63079e4afb1a (F1): a genuine DB/schema
      // error is NOT evidence the token doesn't exist -- .maybeSingle() already returns
      // {data:null, error:null} for a real "no row" result, so reaching here means the
      // probe itself could not run (schema drift, outage). Propagate so the caller
      // (pipeline.js's outer try/catch) can fail OPEN on infra errors, matching this
      // module's stated intent -- an empty catch here previously swallowed the error and
      // let every drift/outage silently masquerade as "unresolved", hard-refusing mints.
      throw new Error(`resolveArtifactOwner: ${entry.table} probe failed: ${error.message}`);
    }
    if (data) {
      // TESTING evidence 20c3546f-c048-42d8-b88c-60657cfddd73: a real row with a NULL
      // owner column must not be treated as "not found on this table" (which would
      // fall through and probe the id against unrelated tables) -- the token DOES
      // resolve, it just has nothing to annotate.
      // TESTING evidence f9900d37-ddf7-411d-8b62-494c83935cf4: a truthiness check (not
      // just != null) so an empty-string owner column is also treated as "nothing to
      // annotate" rather than yielding a literal "(owner: )".
      const ownerValue = data[entry.ownerColumn];
      return { token, resolved: true, table: entry.table, ownerKey: ownerValue ? String(ownerValue) : null };
    }
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
  const safeKey = safeOwnerKey(ownerKey);
  return text.replace(tokenRe, (_m, matchedToken) => `${matchedToken} (owner: ${safeKey})`);
}
