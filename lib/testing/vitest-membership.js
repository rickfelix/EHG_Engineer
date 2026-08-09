/**
 * SD-LEO-INFRA-FLEET-WIDE-VITEST-001 FR-1 — fleet-wide project-membership completeness.
 *
 * A test file that belongs to ZERO collected vitest projects never runs, and the suite still
 * reports GREEN. MEASURED: 3087 distinct collected paths vs 3616 tracked test files = 529
 * members of no project — 229 stranded by the gated-db config path and 12 ordinary unit tests
 * swallowed by a shared exclude, both invisible until enumerated. vitest.config.js:126 records
 * this same class previously stranding tests/smoke.test.js and breaking every commit for days.
 *
 * PRIOR ART (FR-4): Alpha built a NARROW version of this check inside DRIVE-STATE's own tests
 * ("no test this SD adds is a member of zero projects"). This supersedes rather than duplicates
 * it — a guard scoped to one SD cannot see the 229 and the 12 that live everywhere else.
 *
 * THE POPULATION MUST COME FROM VITEST'S OWN COLLECTION, never a repo glob. A glob measures
 * what the config INTENDS to collect; only `vitest list` measures what it ACTUALLY collects,
 * and the gap between those two is precisely this defect. AC-3 pins that with a fixture that
 * swaps the source and must flip the verdict.
 *
 * THE EXCLUSION SET IS CLOSED AND EXHAUSTIVE — five NAMED categories, each derived from an
 * authority rather than hand-listed. It is emphatically NOT "minus everything currently
 * uncollected": that formulation would have absorbed the 12 tests/unit/agents/ files this SD
 * exists to fix, and the guard's first act would have been to hide a defect it detected.
 */

/** Named reasons a tracked test file is legitimately outside vitest's collection. */
export const EXCLUSION_REASONS = Object.freeze({
  PLAYWRIGHT: 'playwright_owned',
  QUARANTINE: 'quarantined',
  NON_VITEST_SUITE: 'non_vitest_suite',
  PRODUCT_TREE: 'product_tree_not_tests',
  NAMED_SHARED_EXCLUDE: 'named_shared_exclude',
});

const norm = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');

/**
 * Classify one tracked file. Returns an EXCLUSION_REASONS value when the file is legitimately
 * uncollected, or null when it SHOULD be collected (and therefore must be, or the guard fails).
 *
 * @param {string} file repo-relative path
 * @param {object} authorities all derived, none hand-listed:
 *   playwrightDir      from playwright.config testDir
 *   quarantined        from vitest.config's own manifest loader (manifest.quarantined[].file)
 *   vitestMjsAnchors   the config's NARROW .mjs include anchors; anything .mjs/.cjs outside
 *                      them is a node:test suite the config deliberately omits
 *   productTrees       source trees named in SHARED_EXCLUDE that are not test locations
 *   namedExcludes      literal file paths named in SHARED_EXCLUDE
 */
export function classifyTrackedFile(file, authorities = {}) {
  const f = norm(file);
  const {
    playwrightDir = 'tests/e2e',
    quarantined = [],
    vitestMjsAnchors = [],
    productTrees = [],
    namedExcludes = [],
  } = authorities;

  const dir = norm(playwrightDir).replace(/\/$/, '');
  if (f === dir || f.startsWith(`${dir}/`)) return EXCLUSION_REASONS.PLAYWRIGHT;

  if (quarantined.some((q) => { const n = norm(q); return f === n || f.endsWith(`/${n}`); })) {
    return EXCLUSION_REASONS.QUARANTINE;
  }

  if (namedExcludes.some((n) => f === norm(n) || f.endsWith(`/${norm(n)}`))) {
    return EXCLUSION_REASONS.NAMED_SHARED_EXCLUDE;
  }

  if (productTrees.some((t) => { const n = norm(t).replace(/\/$/, ''); return f.startsWith(`${n}/`); })) {
    return EXCLUSION_REASONS.PRODUCT_TREE;
  }

  // vitest's unit include targets `.test.js` broadly, plus NARROW `.mjs` anchors. Every other
  // test-shaped file (.spec.*, and .mjs/.cjs outside those anchors) is a suite vitest is not
  // meant to collect — the config comment states the repo's .test.mjs files are node:test-based
  // and not vitest-compatible.
  if (/\.test\.(mjs|cjs)$/.test(f)) {
    const anchored = vitestMjsAnchors.some((a) => f.startsWith(`${norm(a).replace(/\/$/, '')}/`));
    return anchored ? null : EXCLUSION_REASONS.NON_VITEST_SUITE;
  }
  if (/\.spec\.(js|mjs|cjs|ts|tsx)$/.test(f)) return EXCLUSION_REASONS.NON_VITEST_SUITE;
  if (!/\.test\.(js|ts|tsx)$/.test(f)) return EXCLUSION_REASONS.NON_VITEST_SUITE;

  return null; // should be collected
}

/**
 * The verdict: which tracked files that SHOULD be collected are members of zero projects.
 *
 * An empty `collected` is treated as an ERROR, never as "everything is fine" — an enumeration
 * that failed to run would otherwise make this guard pass while collecting nothing, which is
 * the same green-but-blind failure it exists to catch.
 */
export function findUnmembered({ collected, tracked, authorities }) {
  if (!Array.isArray(collected) || collected.length === 0) {
    throw new Error('vitest-membership: collected enumeration is empty — refusing to report a pass. An enumeration that could not run is an error, not an empty set.');
  }
  const inCollection = new Set(collected.map(norm));
  const unmembered = [];
  for (const file of tracked.map(norm)) {
    if (classifyTrackedFile(file, authorities) !== null) continue;
    if (!inCollection.has(file)) unmembered.push(file);
  }
  return unmembered.sort();
}

/**
 * The DB_INCLUDE patterns from vitest.config.js:113-119. These files are stranded by the
 * gated-db config path, which CANNOT be repaired here: `tests/setup.db.js` does not gate at
 * runtime (it passes a real SUPABASE_URL through via `||=`), and vitest.config.js:163 states
 * 125 of 225 db suites do not self-guard — so ungating discovery would run them against
 * whatever the URL points at. Coordinator verified that premise independently and split the
 * runtime-gate work to a sibling data-integrity SD.
 */
export const KNOWN_STRANDED_DB_PATTERNS = Object.freeze([
  /(^|\/)tests\/integration\/.*\.test\.js$/,
  /(^|\/)tests\/database\/.*\.test\.js$/,
  /(^|\/)tests\/db-invariants\/.*\.test\.js$/,
  /(^|\/)tests\/migration-readiness\/.*\.test\.js$/,
  /\.db\.test\.js$/,
]);

/**
 * ADVISORY SPLIT — and the reason it is not a blind check.
 *
 * The guard runs in advisory mode ONLY for the gated-db class, and only until the sibling SD
 * lands the runtime gate. Everything else FAILS immediately. The waiver is defined by the
 * DB_INCLUDE PATTERNS, deliberately NOT by "whatever is currently unmembered" — a
 * currently-failing snapshot would absorb the next real defect the moment it appeared, which
 * is the catch-all this guard exists to prevent. A NEW orphan outside those patterns is a
 * hard failure on day one.
 *
 * @returns {{waived: string[], blocking: string[]}}
 */
export function splitAdvisory(unmembered) {
  const waived = [];
  const blocking = [];
  for (const f of unmembered) {
    (KNOWN_STRANDED_DB_PATTERNS.some((re) => re.test(f)) ? waived : blocking).push(f);
  }
  return { waived, blocking };
}

export default { EXCLUSION_REASONS, classifyTrackedFile, findUnmembered, splitAdvisory, KNOWN_STRANDED_DB_PATTERNS };
