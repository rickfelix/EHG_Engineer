/**
 * get-my-claims — SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-002 (FR-2).
 *
 * ONE importable predicate answering the OWNERSHIP question from the AUTHORITATIVE columns, for
 * both claim kinds. It is the hard blocker of FR-5, FR-6 and FR-7: each of those needs to ask "what
 * does this session actually hold" and, without a shared answer, each hand-rolls its own.
 *
 * THE TWO AXES, AND WHY CONFLATING THEM IS THE BUG THIS SD IS ABOUT:
 *   OWNERSHIP — "does this session hold this row RIGHT NOW". Authoritative: the claiming_session_id
 *               column on strategic_directives_v2 / quick_fixes.
 *   LIVENESS  — "is some session alive and working". claude_sessions.sd_key is a MIRROR of a past
 *               ownership decision and answers this one at best.
 * A reader asking OWNERSHIP while reading the mirror is a defect (releaseSD returning "No SD
 * currently claimed" while the claim is very much held). A reader asking LIVENESS from the mirror is
 * CORRECT and must be left alone — which is why FR-4 classifies readers rather than converging them.
 *
 * WHY CJS. pre-tool-enforce.cjs hand-rolled a raw-fetch variant instead of reusing findOwnSdClaim
 * precisely because that function is private inside a large ESM worker and could not be required.
 * A predicate that the CJS hook cannot import will be re-implemented, and re-implementations drift —
 * that drift is the whole reason this SD exists. So this file is .cjs and dependency-free apart from
 * the injected client.
 *
 * NO .limit(1) ANYWHERE. FR-8 needs to detect MULTIPLICITY (a session holding more than one claim),
 * and a limit-1 resolver structurally cannot report it — it would return the same single answer
 * whether the session holds one row or five, which is how a second held SD stays invisible.
 */

const SD_TABLE = 'strategic_directives_v2';
const QF_TABLE = 'quick_fixes';

/**
 * Every claim this session authoritatively holds, across both kinds.
 *
 * @param {object} supabase - injected client (never a module singleton, so callers and tests share one path)
 * @param {string} sessionId
 * @returns {Promise<{claims: Array<{key: string, kind: 'SD'|'QF', status?: string, current_phase?: string}>,
 *                    count: number, multiple: boolean, error: string|null}>}
 */
async function getMyClaims(supabase, sessionId) {
  const empty = { claims: [], count: 0, multiple: false, error: null };
  if (!supabase || !sessionId) return { ...empty, error: 'missing supabase client or sessionId' };

  const claims = [];
  const errors = [];

  try {
    const { data, error } = await supabase
      .from(SD_TABLE)
      .select('sd_key, status, current_phase')
      .eq('claiming_session_id', sessionId);
    if (error) throw new Error(error.message);
    for (const r of data || []) claims.push({ key: r.sd_key, kind: 'SD', status: r.status, current_phase: r.current_phase });
  } catch (e) { errors.push(`SD: ${(e && e.message) || e}`); }

  try {
    const { data, error } = await supabase
      .from(QF_TABLE)
      .select('id, status')
      .eq('claiming_session_id', sessionId);
    if (error) throw new Error(error.message);
    for (const r of data || []) claims.push({ key: r.id, kind: 'QF', status: r.status });
  } catch (e) { errors.push(`QF: ${(e && e.message) || e}`); }

  // A PARTIAL READ MUST NOT LOOK LIKE "NO CLAIMS". If either side failed, the error is reported
  // alongside whatever was found, so a caller can tell "you hold nothing" from "I could not see one
  // of the two surfaces" — the difference between a safe release and a silent no-op.
  return {
    claims,
    count: claims.length,
    multiple: claims.length > 1,
    error: errors.length ? errors.join('; ') : null,
  };
}

/**
 * Does this session hold this specific key? Answers the OWNERSHIP axis for one row.
 * Returns false on a read error — callers that must fail-closed should check getMyClaims().error.
 */
async function ownsClaim(supabase, sessionId, key) {
  if (!key) return false;
  const { claims } = await getMyClaims(supabase, sessionId);
  return claims.some((c) => c.key === key);
}

/** Pure: the same question over rows already in hand, for tests and in-memory reasoning. */
function claimsFromRows(rows, sessionId) {
  return (Array.isArray(rows) ? rows : []).filter((r) => r && r.claiming_session_id === sessionId);
}

module.exports = { getMyClaims, ownsClaim, claimsFromRows, SD_TABLE, QF_TABLE };
