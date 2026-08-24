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
 * KNOWN COVERAGE GAP — AND THE FIRST VERSION OF THIS NOTE UNDERSTATED IT BY ~16x. It cited only
 * `chore/` (40 branches) and PR #6664. MEASURED by the EXEC SECURITY sub-agent across all 3216 real
 * remote branches against the live key set: 1003 (31.2%) sit under prefixes this set refuses, and
 * 16 of the 40 currently-open PRs (40%). The dominant class is `qf/` at 637 branches.
 *
 * THIS SD WIDENED THE GUARD ON SUFFIXES AND LEFT IT NARROW ON PREFIXES, and only the first dimension
 * is measured in code. Honest bound on the harm: only 2 `QF-*` rows exist in
 * strategic_directives_v2, so those branches most likely complete through a different orchestrator —
 * 40% is an upper bound on the blind spot, not a count of missed completions. It still needs to be
 * an explicit measured acceptance rather than a sentence naming the smallest instance.
 *
 * DECIDED 2026-08-03 (coordinator ruling, COORDINATOR_REPLY 06e15ccf): THE SURFACE IS ACCEPTED IN
 * WRITING, not left as an open gap. The reasoning is the honest bound above — only 2 QF-keyed rows
 * exist in strategic_directives_v2, so 31.2% of branches and 16-of-40 open PRs bound the BRANCHES,
 * not the missed completions, and those branches overwhelmingly complete through other pipelines.
 * Widening would pay a proof-risk price (re-deriving prefix-freeness) for coverage of work this
 * gate does not decide.
 *
 * *** FLIP CONDITION — widen when EITHER of these becomes true, and never without the proof. ***
 *   (a) SD rows keyed under a refused prefix exceed 10, or
 *   (b) ONE measured missed completion attributes to this blind spot.
 * On either trigger the token set widens WITH the prefix-free property re-derived over the new set.
 * Recorded here rather than only in the SD row because the person weighing the widen will be
 * reading this constant, not the metadata — the same co-location lesson this SD kept relearning.
 * Measure (a) with scripts/breakage/gate-branch-visibility-scan.mjs.
 */
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

export const BRANCH_TYPE_TOKENS = Object.freeze(['feat', 'fix', 'docs', 'test']);

// Checked at module load, not only in tests. The doc on assertTypeTokensPrefixFree said it "exists
// so it fails loudly instead" — but it had ZERO production callers, so nothing would have thrown at
// runtime and the claim was false (caught by the EXEC TESTING sub-agent). A guard that only runs in
// the test suite protects the test suite. Deliberately unguarded: if this ever throws, every
// consumer of this module is resolving ambiguously and should stop, loudly, at import.
assertTypeTokensPrefixFree(BRANCH_TYPE_TOKENS);

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

    // .order() IS LOAD-BEARING, NOT TIDINESS. Postgres guarantees no row order across statements,
    // and this table is under continuous fleet mutation — a HOT-updated row moves between pages, so
    // unordered .range() paging can return the SAME row twice and miss another. My first paged
    // version omitted it and was caught holding 1000 distinct keys while reporting 2000 rows
    // fetched: ok:true, complete-looking, half the population.
    //
    // fetchAllPaginated is the CANONICAL instrument for this, from
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 — written after the same defect read "1000" for
    // a true 1495 (chairman-caught, 2026-07-19). I hand-rolled a second implementation of a lookup
    // that already had one, which is the failure this module is otherwise about.
    let rows;
    try {
      rows = await fetchAllPaginated(
        () => supabase.from('strategic_directives_v2').select('sd_key').order('sd_key'),
      );
    } catch (e) {
      return fail(OWNER_REASON.KEY_SET_UNAVAILABLE, (e && e.message) || 'pagination failed');
    }

    const keys = new Set();
    for (const r of rows) {
      const k = r && typeof r.sd_key === 'string' ? r.sd_key.trim() : '';
      if (k) keys.add(k);
    }
    if (keys.size === 0) {
      return fail(OWNER_REASON.KEY_SET_UNAVAILABLE, 'key set loaded but empty — treated as unavailable, not as "nothing matches"');
    }
    // COMPLETENESS ON DISTINCT KEYS, NOT ROWS FETCHED. The earlier version compared rows-fetched to
    // count and justified it with "rows can legitimately exceed distinct keys (null or duplicate
    // sd_key)" — MEASURED FALSE in this database: 5539 rows, 5539 distinct keys, 0 nulls. That
    // weaker form cannot see page overlap, because overlap keeps the row total correct while the
    // key set shrinks. This is what the guard is for: a partial key set answers confidently.
    if (keys.size < count) {
      // A SHORTFALL AGAINST THE OPENING COUNT IS NOT YET EVIDENCE OF INCOMPLETENESS. Rows are
      // deleted continuously here — measured 240-1162/day, worst minute 104 (1.73/s) — and a delete
      // landing inside the ~390ms load window legitimately leaves fewer keys than the count taken
      // before it. Failing on that blocks EVERY completion in the fleet: the SECURITY sub-agent put
      // it at ~49% during that burst. Fail-closed is right for a read that cannot be trusted; it is
      // wrong for a read that is simply newer than its own baseline.
      //
      // So re-read the count and compare against THAT. Truncation and page overlap both survive the
      // re-read (the shortfall is structural); a concurrent delete does not (the count comes down to
      // meet the keys). Ordered this way — not as a retry — because a retry would paper over a real
      // truncation by eventually getting lucky.
      const { count: countAfter, error: recountErr } = await supabase
        .from('strategic_directives_v2')
        .select('sd_key', { count: 'exact', head: true });
      if (recountErr || !Number.isFinite(countAfter)) {
        return fail(OWNER_REASON.KEY_SET_UNAVAILABLE, `recount failed (${recountErr?.message || 'no count'}) — cannot distinguish a truncated read from a concurrent delete`);
      }
      if (keys.size < countAfter) {
        return fail(
          OWNER_REASON.KEY_SET_UNAVAILABLE,
          `key set INCOMPLETE: ${keys.size} distinct keys against ${countAfter} rows (was ${count} at start, so this is not explained by concurrent deletes). The read was truncated or pages overlapped; either silently resolves real branches to "no matching key", which the gate reads as "no open PRs" and PASSES.`,
        );
      }
      // Reconciled by the re-read: rows were deleted mid-load. The key set is complete as of now.
      return { ok: true, keys, reason: OWNER_REASON.RESOLVED, error: null, rowCount: countAfter, deletedDuringLoad: count - countAfter };
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

/**
 * SD-LEO-FIX-LEAD-FINAL-APPROVAL-001 (FR-2): defense-in-depth ref-charset allowlist.
 *
 * NOT a substitute for execFileSync at a known sink -- execFileSync eliminates the shell
 * entirely there, making charset moot. This exists for sinks this repo has not yet converted
 * (or has not yet discovered) and for future ones: a branch failing this check must be treated
 * as BLOCKING/UNVERIFIED by the caller, never silently filtered out of whatever population is
 * being scanned -- filtering it out would be a fail-open (an attacker names one malformed
 * branch and it vanishes from the very check meant to catch it).
 *
 * Anchored, full-string match (an unanchored .test() returns true if ANY substring matches,
 * which would accept a malicious branch containing one safe substring). Character class keeps
 * the trailing '-' last so it is never misread as a range operator: [A-Za-z0-9.-_/] would make
 * '.-_' a RANGE (0x2E-0x5F) admitting ';', '<', '>', ':' -- a silent fail-open if reordered.
 *
 * Validated against a live census of this repo's real remote branches (3532 branches, 0
 * violations) before being chosen -- feat|fix|docs|test|qf|chore prefixes plus an SD-key
 * suffix never need anything outside this set.
 */
const REF_CHARSET_RE = /^[A-Za-z0-9._/-]+$/;
export function isRefCharsetSafe(branch) {
  return typeof branch === 'string' && REF_CHARSET_RE.test(branch);
}

export default { resolveBranchOwner, loadKeySet, branchBelongsToSd, isRefCharsetSafe, assertTypeTokensPrefixFree, BRANCH_TYPE_TOKENS, OWNER_REASON };
