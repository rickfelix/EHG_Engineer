// SD-LEO-FIX-FIXTURE-PREFIX-EXCLUSION-001: canonical fixture-exclusion predicates for
// metrics/gauges/counts.
//
// Fixture/test rows (ZZZ_-, UAT-, TEST--prefixed keys; __e2e/is_demo/is_synthetic
// ventures) leaked into real gauges because the exclusion logic was fragmented across
// 7+ helpers with divergent prefix sets — none covered ZZZ_. This module is the
// CANONICAL union. Pure, top-level-await-free .mjs so BOTH worlds consume it (the
// proven lib/coordinator/sd-exclusion.mjs interop pattern): ESM `import`s it; CJS
// `require()`s it.
//
// Existing helpers documented as MIRRORS of subsets of this union (full collapse is
// follow-on scope; when adding a NEW fixture prefix, add it HERE first, then sync):
//   - lib/coordinator/sd-exclusion.mjs FIXTURE_RE (SD dispatch/belt exclusion)
//   - lib/fleet/claim-eligibility.cjs TEST_FIXTURE_KEY_RE (dispatch classifier)
//   - lib/sourcing-engine/refill-candidate-validity.js FIXTURE_TITLE_RE
//   - scripts/sweep-fixture-residue.mjs FIXTURE_CLASS_RE (venture residue sweep)
//   - SQL view v_sd_next_candidates NOT LIKE list (chairman-gated DDL — parity deferred,
//     flagged in this SD's completion flags)
//
// PRECISION OVER RECALL (TR-3): a real row must never be excluded. Regexes are
// boundary-anchored (prefix-position only — 'LATEST'/'FASTEST' never match); missing
// name/flags fail open to NOT-fixture.

// SD keys / work-item keys. Union of the mirror helpers' prefixes PLUS the previously
// uncovered ZZZ_, UAT-/UAT_, TEST-HARNESS-, __e2e classes.
export const FIXTURE_KEY_RE =
  /^ZZZ_|^__e2e|^UAT[-_]|^TEST-|^(SD-)?(DEMO|TEST)\b|^SD-UAT-FIX-TEST-|^SD-LEO-FEAT-TEST-E2E-|(?:^|-)TEST-E2E-\d{10,}(?:-|$)/i;

// wave-linkage-coverage.js's exclusion set, lifted verbatim (FR-3): that gauge's
// semantics are DESIGNED-SIGNAL-sensitive (WAVE_LINKAGE_STARVATION) and must not be
// broadened — it keeps consuming exactly this regex plus claim-eligibility's
// TEST_FIXTURE_KEY_RE, byte-equivalent to its pre-lift behavior.
export const UAT_FIXTURE_KEY_RE = /^SD-UAT-FIX-TEST-/;

// Venture names. Superset of sweep-fixture-residue.mjs FIXTURE_CLASS_RE plus ZZZ_,
// TS-fixture-, and ANY dunder prefix (__e2e, __citest_… — no real venture starts with __).
export const FIXTURE_VENTURE_NAME_RE = /^(ZZZ_|__|TEST-|UAT[-_]|TS-fixture-|parity-test-|test-stub|Test Venture for )/i;

// Epoch/run-id tails (10+ digit numeric suffix after - or :) are test-generator residue —
// live rows like 'Pipeline-Test-1784250113322', 'HCGate-RealDB-rpc-block-1784238026383',
// '__citest_chairman__:28691380936'; no real venture name ends in a raw epoch/run id.
export const EPOCH_TAIL_RE = /[-:]\d{10,}$/;

/**
 * Is this SD/work-item key a fixture? metadata.is_fixture===true short-circuits.
 * @param {string|null|undefined} key
 * @param {{is_fixture?: boolean}|null} [metadata]
 */
export function isFixtureSdKey(key, metadata) {
  if (metadata && metadata.is_fixture === true) return true;
  return typeof key === 'string' && FIXTURE_KEY_RE.test(key);
}

/**
 * Is this ventures row a fixture? Flag-first (is_demo / is_synthetic), name-prefix
 * backstop for the ~half-unflagged-synthetic class. Fail-open on missing fields.
 * @param {{name?: string|null, is_demo?: boolean, is_synthetic?: boolean}|null} v
 */
export function isFixtureVenture(v) {
  if (!v || typeof v !== 'object') return false;
  if (v.is_demo === true || v.is_synthetic === true) return true;
  if (typeof v.name !== 'string') return false;
  return FIXTURE_VENTURE_NAME_RE.test(v.name) || EPOCH_TAIL_RE.test(v.name);
}

/**
 * Is this quick_fixes row a fixture? quick_fixes has NO flag columns, so the title/id
 * prefix is the only available discriminant.
 * @param {{id?: string|null, title?: string|null}|null} qf
 */
export function isFixtureQf(qf) {
  if (!qf || typeof qf !== 'object') return false;
  if (typeof qf.id === 'string' && /^QF-(TEST|DEMO)\b/i.test(qf.id)) return true;
  return typeof qf.title === 'string' && /^\s*(ZZZ_|__e2e|\[?TEST[-_\]]|\[?UAT[-_\]]|\[?DEMO\b)/i.test(qf.title);
}
