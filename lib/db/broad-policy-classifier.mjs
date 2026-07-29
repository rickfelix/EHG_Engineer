/**
 * broad-policy-classifier.mjs — SD-LEO-INFRA-DEFAULT-ANON-AUTHENTICATED-001 (FR-3/FR-4).
 *
 * ONE classification function, shared by BOTH the migration-text lint (FR-3) and the live-database
 * audit query (FR-4). They ask the same question of different inputs, so authoring two classifiers
 * would let them drift — and the drift would be invisible, because each would look correct on its
 * own. That is the failure this SD's sibling work keeps finding, so it is designed out here rather
 * than warned about.
 *
 * THE CRITERION IS EXPOSURE SHAPE, NOT TABLE NAMING:
 *   does the policy admit a principal broader than service_role WITHOUT a row-level predicate that
 *   narrows it to an intended audience?
 *
 *   fn_is_chairman()                  -> NARROWS. A real predicate about the caller.
 *   auth.uid() = user_id              -> NARROWS. Binds the row to the caller's identity.
 *   is_current = true                 -> NARROWS. A row predicate, even though it says nothing
 *                                        about the caller — it reduces what the audience can reach.
 *   true                              -> DOES NOT narrow.
 *   auth.role() = 'authenticated'     -> DOES NOT narrow. It RE-STATES the role the policy already
 *                                        grants to: a tautology wearing the shape of a check. This
 *                                        is the third shape, and the one the existing lint misses
 *                                        because there is no tenant column whose binding to check.
 *
 * WHY THE RESTATEMENT CASE NEEDS CARE: matching on the substring `auth.role()` alone would flag a
 * COMPOUND predicate like `auth.role() = 'authenticated' AND auth.uid() = user_id`, which genuinely
 * narrows. The classifier must therefore decide whether ANY narrowing conjunct survives once the
 * role-restatement terms are removed — not whether the string appears.
 */

/**
 * Terms that re-state the granted role and therefore narrow nothing.
 *
 * THE `::text` CAST IS LOAD-BEARING, and it was found by a calibration check rather than by
 * reasoning. pg_policies renders the live qual as `auth.role() = 'authenticated'::text`, not
 * `auth.role() = 'authenticated'`. Without the optional cast in this pattern the role term was
 * stripped but its trailing `::text` survived, that residue read as "a real predicate", and the
 * classifier reported the one shape it was built to catch as SAFE.
 *
 * The instrument looked healthy while doing so — 472 findings, all four negative controls passing —
 * which is exactly why the positive control (does it flag the KNOWN instance?) is not optional. A
 * detector that only ever gets checked against things it should ignore cannot be shown to work.
 */
// Cast suffix is GENERIC, not just ::text. SECURITY f3cdce33 showed that hardcoding ::text left
// `auth.role() = 'authenticated'::name` (or any other cast) classified as narrowed — the same bug
// as the original ::text miss, one cast away.
const ROLE_RESTATEMENT = /auth\.role\(\)\s*=\s*'(?:authenticated|anon|service_role)'(?:::\w+)?/gi;

/**
 * Tautologies: expressions that are always true and therefore narrow nothing, but which survive
 * naive residue-counting because they contain "real-looking" tokens.
 *
 * SECURITY f3cdce33 verified all of these against the SHIPPED function and every one was
 * MISCLASSIFIED AS NARROWED: `1=1`, `'a'='a'`, `NOT false`, and `true OR fn_is_chairman()` — the
 * last being the nastiest, because the disjunct makes the whole expression true while the
 * fn_is_chairman() token makes it LOOK like the most narrowed policy in the schema.
 *
 * A FALSE NEGATIVE IS THE DANGEROUS DIRECTION HERE. This classifier's job is to prove policies are
 * narrowed; marking a broad one "safe" removes it from the audit silently, which is the same
 * failure mode as the defect the audit exists to find.
 */
const TAUTOLOGY = [
  /^\s*\(*\s*true\s*\)*\s*$/i,                                  // true, (true), (((true)))
  /^\s*\(*\s*NOT\s+false\s*\)*\s*$/i,                           // NOT false
  /(\b\d+\s*=\s*\1\b)/,                                         // 1=1, 42=42
  /'([^']*)'(?:::\w+)?\s*=\s*'\1'(?:::\w+)?/,                   // 'a'='a'
];

/** Strip SQL comments so a `--` inside a USING clause cannot hide a tautology (SECURITY f3cdce33). */
function stripSqlComments(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
}

/**
 * Does this qual contain a predicate that genuinely narrows what the audience can reach?
 *
 * Strategy: strip comments, reject outright tautologies, remove role-restatement terms, then ask
 * whether anything of substance remains. Deliberately CONSERVATIVE — when in doubt it reports NOT
 * narrowed, because over-reporting costs a reviewer a glance while under-reporting hides a broad
 * policy from the audit entirely.
 *
 * @param {string|null|undefined} qual the policy's USING expression
 * @returns {boolean}
 */
export function hasNarrowingPredicate(qual) {
  if (qual === null || qual === undefined) return false;
  const raw = stripSqlComments(String(qual)).trim();
  if (raw === '') return false;

  // Whole-expression tautologies narrow nothing regardless of what tokens they contain.
  if (TAUTOLOGY.some(re => re.test(raw))) return false;

  // A top-level `true OR <anything>` is true for every row: the other disjunct is decoration.
  // Checked BEFORE residue-counting, because that disjunct is usually a real-looking function
  // call and would otherwise be counted as the narrowing this expression does not do.
  const unwrapped = raw.replace(/^\s*\(+|\)+\s*$/g, '');
  if (/(^|\bOR\s+)\(*\s*true\s*\)*(\s+OR\b|$)/i.test(unwrapped)) return false;

  // Remove the tautological role terms, then the boolean scaffolding they were joined by.
  let residue = raw.replace(ROLE_RESTATEMENT, ' ');
  residue = residue.replace(/\b(?:OR|AND|NOT)\b/gi, ' ')
    .replace(/\btrue\b/gi, ' ')
    .replace(/[()\s]/g, '');

  // Anything left is a real predicate: a function call, a column comparison, a literal test.
  return residue.length > 0;
}

/**
 * Classify one policy. Roles are compared as a set so `{public}` — which PostgREST resolves to
 * anon+authenticated — is treated as broad, not as a name to be trusted.
 * @param {{roles?: string|string[], cmd?: string, qual?: string|null}} policy
 * @returns {{ broad: boolean, narrowed: boolean, violation: boolean, reason: string }}
 */
export function classifyPolicy(policy = {}) {
  const roles = Array.isArray(policy.roles)
    ? policy.roles
    : String(policy.roles || '').replace(/[{}]/g, '').split(',').map(r => r.trim()).filter(Boolean);

  const readCmd = ['SELECT', 'ALL'].includes(String(policy.cmd || 'SELECT').toUpperCase());
  // service_role and postgres alone are not broad; anything else reaching rows is.
  const broad = readCmd && roles.some(r => !['service_role', 'postgres'].includes(r));
  const narrowed = hasNarrowingPredicate(policy.qual);

  if (!readCmd) return { broad: false, narrowed, violation: false, reason: 'not a read policy' };
  if (!broad) return { broad: false, narrowed, violation: false, reason: 'service_role/postgres only' };
  if (narrowed) return { broad: true, narrowed: true, violation: false, reason: 'broad principal, but rows are narrowed' };
  return {
    broad: true, narrowed: false, violation: true,
    reason: String(policy.qual || '').trim().toLowerCase() === 'true' || !policy.qual
      ? 'admits a broad principal with no predicate at all (qual=true)'
      : 'admits a broad principal; the qual only RE-STATES the granted role and narrows nothing',
  };
}

/**
 * Is an intended audience recorded for this table? FR-1's convention is a line beginning
 * `Audience:` inside COMMENT ON TABLE — chosen because COMMENT ON TABLE is an existing habit here
 * (~487 instances) rather than a new artifact class.
 * @param {string|null|undefined} tableComment
 * @returns {boolean}
 */
export function hasRecordedAudience(tableComment) {
  return /(^|\s)Audience:\s*\S/.test(String(tableComment || ''));
}

export default { classifyPolicy, hasNarrowingPredicate, hasRecordedAudience };
