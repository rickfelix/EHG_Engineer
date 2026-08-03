/**
 * Branch → owning SD key resolution. SD-LEO-INFRA-RESUME-FINAL-READ-001 (FR-3, FR-4).
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A REGEX.
 * PR_MERGE_VERIFICATION matched branches with an anchored regex,
 * `^(feat|fix|docs|test)/<sd-key>$`. The `$` rejects any branch carrying a suffix after the key, so
 * an OPEN PR on `fix/SD-...-001-fr5-drop-recreate` was invisible, the gate reported "No open PRs
 * found for this SD", and an SD completed with its deliverable unmerged.
 *
 * The obvious repair — also match `<type>/<KEY>-<suffix>` while still refusing a DIFFERENT key that
 * shares a prefix — IS PROVABLY IMPOSSIBLE. For a key K and a child key K-x, the single string
 * `<type>/K-x` is SIMULTANEOUSLY a suffixed branch of K and the canonical branch of K-x. No
 * function of the branch name alone can return both answers. Measured on this repo: 1930
 * strict-prefix key pairs across 5533 keys; ~481 of 2429 real branches multi-matched; ~351 of those
 * are the exact canonical branch of a real child SD. It is not a corner case.
 *
 * The disambiguating information lives in the KEY SET, not in the string. Hence: resolution against
 * known keys, longest match wins.
 *
 * THE ANCHORING WAS ITSELF AN OVER-CORRECTION and this module must not repeat the shape. It was
 * added by QF-20260509-PRMERGE-EXACT to stop a FALSE POSITIVE (`.includes()` matching sibling
 * branches). Narrowing a guard to silence false alarms removed its ability to fire at all, in the
 * failing-OPEN direction. Widening without the key set would swing back. Both failure modes are
 * covered by the unit suite; neither is covered by the old regex.
 */

/**
 * Branch type tokens this resolver understands.
 *
 * PREFIX-FREE IS LOAD-BEARING, NOT COSMETIC. The tie-impossibility proof runs: two keys matching
 * one branch must share the same `<type>/` prefix, and two equal-length prefixes of one string are
 * identical — so two DISTINCT keys can never tie. That argument needs no token to be a prefix of
 * another. Add `te` alongside `test` and the proof lapses SILENTLY: nothing throws, resolution just
 * starts being ambiguous. `assertTypeTokensPrefixFree` exists so it fails loudly instead.
 *
 * KNOWN COVERAGE GAP, deliberately left visible rather than quietly widened: real branches exist
 * outside this set (e.g. `chore/SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001-approved-by-header`, PR #6664)
 * and are NOT resolvable here. Widening the set is a decision with a cost — the proof above must be
 * re-derived over the new set — so it is a deliberate choice, not a default.
 */
export const BRANCH_TYPE_TOKENS = Object.freeze(['feat', 'fix', 'docs', 'test']);

/** Outcome reasons. Distinct values because collapsing two of them is the bug this module fixes. */
export const OWNER_REASON = Object.freeze({
  RESOLVED: 'resolved',
  NO_MATCHING_KEY: 'no_matching_key',
  UNSUPPORTED_BRANCH_TYPE: 'unsupported_branch_type',
  MALFORMED_BRANCH: 'malformed_branch',
  KEY_SET_UNAVAILABLE: 'key_set_unavailable',
});

/**
 * Verify the token set is prefix-free. Throws rather than returning false: a lapsed proof must not
 * be something a caller can accidentally ignore.
 * @param {string[]} [tokens]
 */
export function assertTypeTokensPrefixFree(tokens = BRANCH_TYPE_TOKENS) {
  for (const a of tokens) {
    for (const b of tokens) {
      if (a !== b && b.startsWith(a)) {
        throw new Error(
          `branch type tokens must be prefix-free: "${a}" prefixes "${b}". The tie-impossibility ` +
          'proof in resolveBranchOwner depends on this; re-derive it before widening the set.',
        );
      }
    }
  }
  return true;
}

/**
 * Resolve which SD key owns a branch. PURE — the key set is a parameter, never loaded in here, so
 * every case is unit-testable without a database.
 *
 * @param {string} branch      e.g. 'fix/SD-FOO-001-some-suffix' (a leading 'origin/' is stripped)
 * @param {Iterable<string>} keySet  known sd_keys
 * @returns {{owner: string|null, reason: string, candidates: string[]}}
 */
export function resolveBranchOwner(branch, keySet) {
  const raw = typeof branch === 'string' ? branch.trim() : '';
  if (!raw) return { owner: null, reason: OWNER_REASON.MALFORMED_BRANCH, candidates: [] };

  const name = raw.replace(/^origin\//, '');
  const slash = name.indexOf('/');
  if (slash <= 0) return { owner: null, reason: OWNER_REASON.MALFORMED_BRANCH, candidates: [] };

  const type = name.slice(0, slash).toLowerCase();
  const rest = name.slice(slash + 1);
  if (!BRANCH_TYPE_TOKENS.includes(type)) {
    return { owner: null, reason: OWNER_REASON.UNSUPPORTED_BRANCH_TYPE, candidates: [] };
  }
  if (!rest) return { owner: null, reason: OWNER_REASON.MALFORMED_BRANCH, candidates: [] };

  // A key owns the branch when the remainder is exactly the key, or the key followed by '-'.
  // The '-' matters: without it 'SD-FOO-001' would claim 'SD-FOO-0012', a different key.
  const candidates = [];
  for (const key of keySet || []) {
    if (typeof key !== 'string' || !key) continue;
    if (rest === key || rest.startsWith(`${key}-`)) candidates.push(key);
  }
  if (candidates.length === 0) {
    return { owner: null, reason: OWNER_REASON.NO_MATCHING_KEY, candidates: [] };
  }

  // Longest match wins. Ties are impossible for DISTINCT keys (see BRANCH_TYPE_TOKENS), so this is
  // deterministic and total rather than a preference among equals.
  candidates.sort((a, b) => b.length - a.length || a.localeCompare(b));
  return { owner: candidates[0], reason: OWNER_REASON.RESOLVED, candidates };
}

/**
 * Load the known-key set, FAIL-CLOSED.
 *
 * THIS IS THE NEW HAZARD THE SUBSTRATE CHANGE INTRODUCES, and the reason the result is a envelope
 * rather than a bare Set. Moving from a regex to a key-set lookup adds a way for the lookup to be
 * UNAVAILABLE — and the naive handling ("no keys loaded" → nothing matched → no open PRs → PASS) is
 * a fresh route into exactly the fail-open this SD closes.
 *
 * So `ok:false` is returned on ANY failure and MUST NOT be treated as an empty key set. Callers are
 * required to branch on `ok` BEFORE resolving. An empty-but-successful load is also `ok:false`
 * (`KEY_SET_UNAVAILABLE`): a database that answers with zero SDs is not a world in which nothing is
 * claimed, it is a broken read.
 *
 * @param {{from: function}} supabase  injected client (never constructed here — that is what keeps
 *                                     the failure path unit-testable without a live DB)
 * @returns {Promise<{ok: boolean, keys: Set<string>, reason: string, error: string|null}>}
 */
export async function loadKeySet(supabase) {
  const fail = (reason, error = null) => ({
    ok: false, keys: new Set(), reason, error,
  });
  if (!supabase || typeof supabase.from !== 'function') {
    return fail(OWNER_REASON.KEY_SET_UNAVAILABLE, 'no supabase client supplied');
  }
  try {
    // A PARTIAL KEY SET IS WORSE THAN NO KEY SET, AND THIS IS NOT HYPOTHETICAL — the first version
    // of this function was a plain .select('sd_key'), which PostgREST silently caps at 1000 rows.
    // Measured against live data: 1000 of 5536 keys returned, ok:true, looking perfectly healthy.
    // Every SD outside those rows resolved to NO_MATCHING_KEY, so its branch was invisible and the
    // gate PASSED — including this SD's own key. That is the exact defect this module exists to
    // close, reintroduced one level down: a lookup that reports success while seeing 18% of the
    // population. The unit tests could never have caught it; they use 1-3 key sets. Only a scan
    // against real data did.
    //
    // So: page explicitly, and RECONCILE against an exact count. The reconciliation is the point —
    // paginating without verifying just moves the silent truncation somewhere less obvious.
    const { count, error: countErr } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key', { count: 'exact', head: true });
    if (countErr) return fail(OWNER_REASON.KEY_SET_UNAVAILABLE, `count failed: ${countErr.message}`);
    if (!Number.isFinite(count)) return fail(OWNER_REASON.KEY_SET_UNAVAILABLE, 'count unavailable — cannot verify completeness');

    const PAGE = 1000;
    const keys = new Set();
    let fetched = 0;
    for (let from = 0; from < count; from += PAGE) {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .select('sd_key')
        .range(from, from + PAGE - 1);
      if (error) return fail(OWNER_REASON.KEY_SET_UNAVAILABLE, `page ${from} failed: ${error.message}`);
      const rows = Array.isArray(data) ? data : [];
      fetched += rows.length;
      for (const r of rows) {
        const k = r && typeof r.sd_key === 'string' ? r.sd_key.trim() : '';
        if (k) keys.add(k);
      }
      if (rows.length === 0) break; // defensive: never spin if a page comes back empty mid-range
    }

    if (keys.size === 0) {
      return fail(OWNER_REASON.KEY_SET_UNAVAILABLE, 'key set loaded but empty — treated as unavailable, not as "nothing matches"');
    }
    // COMPLETENESS IS ASSERTED, NOT ASSUMED. Rows can legitimately exceed distinct keys (null or
    // duplicate sd_key), so the check is on ROWS FETCHED vs COUNT, not on Set size.
    if (fetched < count) {
      return fail(
        OWNER_REASON.KEY_SET_UNAVAILABLE,
        `key set TRUNCATED: fetched ${fetched} of ${count} rows. A partial key set silently resolves real branches to "no matching key", which the gate reads as "no open PRs" and PASSES.`,
      );
    }
    return { ok: true, keys, reason: OWNER_REASON.RESOLVED, error: null, rowCount: count };
  } catch (e) {
    return fail(OWNER_REASON.KEY_SET_UNAVAILABLE, (e && e.message) || 'threw');
  }
}

/**
 * Does `branch` belong to `sdKey`? The direct replacement for `exactBranchRegex.test(branch)`.
 *
 * Note the shape difference from the regex it replaces: this takes the whole key set, because
 * whether `feat/K-x` belongs to K depends on whether K-x is itself a key — information the branch
 * string does not carry. That is the entire substrate change in one signature.
 *
 * @returns {{belongs: boolean, owner: string|null, reason: string}}
 */
export function branchBelongsToSd(branch, sdKey, keySet) {
  const r = resolveBranchOwner(branch, keySet);
  return { belongs: r.owner === sdKey && !!sdKey, owner: r.owner, reason: r.reason };
}

export default { resolveBranchOwner, loadKeySet, branchBelongsToSd, assertTypeTokensPrefixFree, BRANCH_TYPE_TOKENS, OWNER_REASON };
