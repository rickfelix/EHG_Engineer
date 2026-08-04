/**
 * SD-LEO-INFRA-THREE-GAPS-APPLIED-001 — FR-1.
 *
 * THE GAP IS NOT THAT THE BOUNDARY IS UNDOCUMENTED. It is documented, honestly and in
 * detail, in the KNOWN GAPS block at database/migrations/20260802_bound_anon_feedback_ingress.sql:272
 * — a SQL comment that nothing executes and no gate reads. The original author found the
 * gap, wrote it down accurately, and it still did not travel, because the only reader
 * was a human who happened to open that file.
 *
 * So FR-1's deliverable is not "write it down again". It is: state the boundary where an
 * AUTOMATED reader reaches it, and make drift from it fail.
 *
 * DECLARED, NOT ASSUMED. The constant below is a claim about the live database. The probe
 * compares it to the catalog. Either side moving is a finding:
 *   - live got MORE permissive than declared -> a new bypass appeared
 *   - live got LESS permissive than declared -> someone constrained the path (good!), and
 *     the declaration plus every closure claim must be updated to match
 * A declaration that cannot fail would be one more comment.
 */

/**
 * The honest boundary, as measured 2026-08-03. Every field is a live-catalog fact.
 *
 * Provenance note on `venture_uuids_anon_enumerable` and `force_row_security`: these come
 * from the KNOWN GAPS block's own analysis, NOT from a measurement of mine. They are
 * carried here labelled so a future reader does not mistake inherited assessment for
 * verified fact — the distinction this whole SD is about.
 */
export const DECLARED_BOUNDARY = Object.freeze({
  function: 'public.record_venture_error',
  security_definer: true,
  owner: 'postgres',
  owner_bypasses_rls: true,
  anon_has_execute: true,
  /** Both insert paths, because "it inserts severity=high" is true of only one of them. */
  insert_paths: Object.freeze([
    Object.freeze({ path: 'normal', type: 'issue', status: 'new', severity: 'medium' }),
    Object.freeze({ path: 'storm_watermark', type: 'issue', status: 'new', severity: 'high' }),
  ]),
  /** What arms the chairman queue. The storm path satisfies it; the normal path does not. */
  queue_arm_severities: Object.freeze(['critical', 'high']),
  storm_ceiling_distinct_fingerprints_per_venture_per_hour: 20,
  /** INHERITED ASSESSMENT, not measured by this SD. */
  inherited_unverified: Object.freeze({
    venture_uuids_anon_enumerable: false,
    feedback_force_row_security: false,
  }),
});

/**
 * The single sentence that may be stated about this boundary, and the one that may not.
 *
 * FORBIDDEN is deliberately a SENTENCE-SHAPED claim rather than a keyword. A keyword scan
 * for "anon" and "chairman" matches the honest paragraph explaining the gap just as
 * happily as it matches a false closure — the guard-matches-its-own-explanation trap,
 * which bit this session four separate times.
 */
export const HONEST_BOUNDARY_STATEMENT =
  'anon holds EXECUTE on a SECURITY DEFINER function owned by a role that bypasses RLS, so no RLS policy on '
  + 'public.feedback can constrain it; its storm-watermark path writes severity=high, which arms the chairman '
  + 'queue. Reaching that path requires a valid venture_id and 20+ distinct error fingerprints in an hour.';

/**
 * Compare a live catalog reading against the declaration.
 *
 * @returns {{ verdict: 'MATCHES'|'DRIFTED'|'UNREADABLE', drift: string[], detail: string }}
 *   UNREADABLE when the reading is absent — never a pass.
 */
export function evaluateBoundary(live) {
  if (!live || typeof live !== 'object') {
    return { verdict: 'UNREADABLE', drift: [], detail: 'No live reading supplied. UNREADABLE is not a pass.' };
  }

  const drift = [];
  const cmp = (field, declared, actual) => {
    if (actual === undefined || actual === null) {
      drift.push(`${field}: UNREADABLE (declared ${JSON.stringify(declared)})`);
      return;
    }
    if (actual !== declared) drift.push(`${field}: declared ${JSON.stringify(declared)}, live ${JSON.stringify(actual)}`);
  };

  cmp('security_definer', DECLARED_BOUNDARY.security_definer, live.security_definer);
  cmp('owner_bypasses_rls', DECLARED_BOUNDARY.owner_bypasses_rls, live.owner_bypasses_rls);
  cmp('anon_has_execute', DECLARED_BOUNDARY.anon_has_execute, live.anon_has_execute);

  // Severities are compared as a SET keyed by path, not as a list, so a reordering of the
  // function body is not reported as drift while an actual severity change is.
  const declaredByPath = new Map(DECLARED_BOUNDARY.insert_paths.map((p) => [p.path, p.severity]));
  const liveByPath = new Map(Array.isArray(live.insert_paths) ? live.insert_paths.map((p) => [p.path, p.severity]) : []);
  if (liveByPath.size === 0) {
    drift.push('insert_paths: UNREADABLE (could not read severities from the function body)');
  } else {
    for (const [path, sev] of declaredByPath) {
      if (!liveByPath.has(path)) drift.push(`insert_paths.${path}: MISSING live (declared severity ${sev})`);
      else if (liveByPath.get(path) !== sev) drift.push(`insert_paths.${path}: declared ${sev}, live ${liveByPath.get(path)}`);
    }
    for (const path of liveByPath.keys()) {
      if (!declaredByPath.has(path)) drift.push(`insert_paths.${path}: NEW live path not in the declaration`);
    }
  }

  if (drift.some((d) => d.includes('UNREADABLE'))) {
    return { verdict: 'UNREADABLE', drift, detail: 'At least one field could not be read. UNREADABLE is not a pass.' };
  }
  if (drift.length > 0) {
    return {
      verdict: 'DRIFTED',
      drift,
      detail:
        'The live boundary no longer matches the declaration. If the path was CONSTRAINED, that is good news — update '
        + 'DECLARED_BOUNDARY and every closure claim that describes the old boundary. If it became MORE permissive, a new '
        + 'bypass appeared. Either way a human must look; this must not be silenced by editing the declaration alone.',
    };
  }
  return { verdict: 'MATCHES', drift: [], detail: 'Live catalog matches the declared boundary exactly.' };
}

/**
 * Does `text` assert unreachability that the function contradicts?
 *
 * Matches CLAIM SHAPES, not keywords, and requires a negation bound to a reach verb near a
 * chairman-queue object. The honest paragraph says anon CAN reach it under stated
 * conditions and must NOT trip this. Tested in both directions.
 */
export function assertsUnreachability(text) {
  if (typeof text !== 'string' || !text) return false;
  const t = text.replace(/\s+/g, ' ').toLowerCase();
  const claim = /\banon\b[^.]{0,80}?\b(cannot|can not|can't|is unable to|has no way to|never)\b[^.]{0,60}?\breach|no\s+anon\s+path[^.]{0,40}\breach/;
  if (!claim.test(t)) return false;
  // A sentence that concedes falsity is a correction, not an assertion.
  const concedes = /\bfalse as stated\b|\bis not established\b|\bnot this policy'?s to make\b|\bis false\b/;
  return !concedes.test(t);
}
