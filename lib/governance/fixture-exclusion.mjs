// SD-LEO-FIX-FIXTURE-PREFIX-EXCLUSION-001: canonical fixture-exclusion predicates for
// metrics/gauges/counts.
//
// Fixture/test rows (ZZZ_-, UAT-, TEST--prefixed keys; __e2e/is_demo ventures) leaked into
// real gauges because the exclusion logic was fragmented across 7+ helpers with divergent
// prefix sets — none covered ZZZ_. This module is the CANONICAL union. Pure,
// top-level-await-free .mjs so BOTH worlds consume it (the proven
// lib/coordinator/sd-exclusion.mjs interop pattern): ESM `import`s it; CJS `require()`s it.
//
// ⚠ THE TOP-LEVEL-AWAIT-FREE PROPERTY IS LOAD-BEARING AND FAILS SILENTLY. scripts/fleet-dashboard.cjs:475
// require()s this module from CJS INSIDE A TRY/CATCH. Introduce a top-level await (or any async
// module evaluation) and that require throws, the catch swallows it, and the dashboard degrades to
// UNFILTERED output — a filter that quietly stops filtering, with no error anywhere. Keep every
// export synchronous, pure and side-effect-free. tests/unit/governance/fixture-exclusion-cjs-pin.cjs
// pins this OUTSIDE vitest, because vitest's own ESM pipeline can satisfy a require() that plain
// node cannot.
//
// MIRRORS — and the distinction below matters, because collapsing the wrong one reintroduces the
// over-exclusion class this module exists to prevent (SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-A).
// When adding a NEW fixture prefix, add it HERE first, then sync the DRIFT entries only.
//
// UNPAID DRIFT (should converge on this union):
//   - lib/coordinator/sd-exclusion.mjs FIXTURE_RE (SD dispatch/belt exclusion)
//   - lib/sourcing-engine/refill-candidate-validity.js FIXTURE_TITLE_RE
//   - scripts/sweep-fixture-residue.mjs FIXTURE_CLASS_RE (venture residue sweep)
//   - SQL view v_sd_next_candidates NOT LIKE list (chairman-gated DDL — parity deferred,
//     flagged in this SD's completion flags)
//
// DELIBERATE DIVERGENCE — DO NOT COLLAPSE. Each is narrower or broader ON PURPOSE:
//   - lib/fleet/claim-eligibility.cjs TEST_FIXTURE_KEY_RE — narrower BY DESIGN. It gates DISPATCH
//     eligibility, where over-exclusion STRANDS REAL WORK from ever being claimed. Widening it to
//     this union needs the same adversarial precision review PR #6186 ran here.
//   - lib/eva/chairman-decision-watcher.js FIXTURE_VENTURE_NAME_RE — excludes a bare `__` prefix ON
//     PURPOSE so `__citest_chairman__:<run>` can still exercise that module's real write path.
//   - lib/chairman/chairman-actionable.mjs FIXTURE_NAME_PATTERNS — a documented mirror of a
//     SEPARATE canonical source (the get_pending_chairman_items SQL RPC), deliberately a superset.
//   - scripts/reap-e2e-liveness-fixtures.mjs E2E_FIXTURE_PREFIX — narrower BY NECESSITY; see the
//     periodic_process_registry section below. This module now consumes that same '__e2e_' string
//     rather than the bare ^__ branch, so read-side and delete-side agree.
//
// PRECISION OVER RECALL (TR-3): a real row must never be excluded. Regexes are
// boundary-anchored (prefix-position only — 'LATEST'/'FASTEST' never match); missing
// name/flags fail open to NOT-fixture.

// SD keys / work-item keys. PRECISION-FIRST (adversarial-review CRITICAL fix, PR #6186):
// the broad ^(SD-)?(DEMO|TEST)\b / ^TEST- branches (borrowed from the dispatch-side
// mirror) over-excluded REAL completed work — the SD-TEST-MANAGEMENT/TEST-MGMT-* family
// (14+ genuine shipped SDs) — which is fatal for hierarchy/count consumers. This module
// keeps only UNAMBIGUOUS fixture shapes: ZZZ_/dunder/bare-UAT prefixes, the named e2e
// fixture families, and epoch-stamped keys (a raw 12+-digit ms timestamp embedded in the
// key is generator residue — e.g. TEST-F3-RACE-1784287684096-bl1; no real SD key carries
// one). Recall loss on prefix-only fixtures (e.g. SD-TEST-MRO18ZP0) is accepted: a
// missed fixture inflates a count slightly; an excluded real row silently loses work.
// QF-20260726-031: the pattern had DRIFTED FROM THE FIXTURES. Run against the fixture keys the
// db-project claim tests actually use, six did not match — the SD-FAKE-* family and both
// QF-00000000-* keys carry no ZZZ_ prefix, no dunder, no UAT marker, no SD-DEMO- prefix and no
// epoch stamp, so two consumers of this predicate treated live test residue as REAL DATA.
// The shapes below were added only after confirming each catches ZERO real rows on the live DB
// (SD-FAKE-% 0, SD-FIXTURE% 0, QF-00000000-% 0, QF-FIXTURE% 0), which is the PRECISION OVER
// RECALL rule above: a missed fixture inflates a count, an excluded real row loses work.
//
// DELIBERATELY NOT ADDED, and this is the trap: the same enumeration surfaced keys like
// SD-EVA-QUALITY-VISION-GOVERNANCE-TESTS-001, SD-MAN-INFRA-E2E-REGRESSION-TEST-001,
// SD-FDBK-ENH-S17-PARITY-TEST-001 and SD-LEO-INFRA-BLOCK-TEST-SESSION-001. All four are REAL
// COMPLETED SDs (verified live), so any broadening toward "contains TEST" would silently exclude
// genuine shipped work — exactly the over-exclusion PR #6186 had to revert. Fixture-ness must come
// from UNAMBIGUOUS markers (FAKE, FIXTURE, an all-zero date stamp), never from the word TEST.
// The companion test enumerates the keys in ACTUAL USE and asserts BOTH directions, so the next
// fixture shape someone adds to a test fails there instead of drifting outside this pattern again.
export const FIXTURE_KEY_RE =
  /^ZZZ_|^__|^UAT[-_]|^SD-DEMO-|^SD-UAT-FIX-TEST-|^SD-LEO-FEAT-TEST-E2E-|^(?:SD|QF)-FAKE-|^(?:SD|QF)-FIXTURE(?:$|[-_])|^QF-0{8}[-_]|(?:^|-)TEST-E2E-\d{10,}(?:-|$)|[-_]\d{12,}(?:[-_][a-z0-9]{1,8})?$/i;

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
 * Is this ventures row a fixture? Flag-first (is_demo), name-prefix backstop for the
 * ~half-unflagged-synthetic class. Fail-open on missing fields.
 *
 * is_synthetic WAS read here and has been REMOVED (SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-A):
 * ventures.is_synthetic is a PHANTOM column — migration 20260312 was never applied, and a
 * live select reproduces PostgREST 42703. The branch never threw (it read an absent property
 * as undefined) but it could never be true either, so it was dead code sitting inside the one
 * predicate the codebase is supposed to trust. Do not reinstate it; use is_demo.
 *
 * NOT a fixture marker, deliberately: ventures.is_scaffolding. It flags a REAL venture used as
 * a build-out vehicle (excluded from gate calibration), which is a different question from
 * "this row is not real". Treating it as fixture-shaped would make this predicate over-eat on
 * genuine ventures.
 * @param {{name?: string|null, is_demo?: boolean}|null} v
 */
export function isFixtureVenture(v) {
  if (!v || typeof v !== 'object') return false;
  if (v.is_demo === true) return true;
  if (typeof v.name !== 'string') return false;
  return FIXTURE_VENTURE_NAME_RE.test(v.name) || EPOCH_TAIL_RE.test(v.name);
}

/**
 * The one value that marks a quick_fixes row as harness-produced. quick_fixes has 43 columns
 * and its three jsonb columns (files_changed, compliance_details, runtime_observation) are each
 * already committed to an unrelated dialect, so created_by is the only free carrier.
 *
 * WHY THIS SPECIFIC VALUE, and it is not arbitrary: created_by is DEFAULTED AND UNTRUTHFUL —
 * 1,355 of 1,376 live rows carry 'UAT_AGENT' (98.47%, EXACT full-population counts, not a
 * capped sample), including rows genuinely filed by workers. A marker equal to that default
 * would classify essentially the whole table as fixtures. FIXTURE_HARNESS is verified DISTINCT
 * from it and matches 0 live rows today, so this predicate can only ever ADD detections for
 * rows a producer explicitly marked — the precision-over-recall direction this module requires.
 * It stays inert until producers (child D) adopt it; that is expected, not a defect.
 */
export const FIXTURE_CREATED_BY = 'FIXTURE_HARNESS';

/**
 * Is this quick_fixes row a fixture? id/title prefix, plus the explicit created_by marker.
 * @param {{id?: string|null, title?: string|null, created_by?: string|null}|null} qf
 */
export function isFixtureQf(qf) {
  if (!qf || typeof qf !== 'object') return false;
  if (typeof qf.id === 'string' && /^QF-(TEST|DEMO)\b/i.test(qf.id)) return true;
  if (qf.created_by === FIXTURE_CREATED_BY) return true;
  // PRECISION-FIRST (adversarial-review CRITICAL fix, PR #6186): the earlier bare
  // TEST-/UAT-/DEMO title branches matched REAL bug reports titled 'Test-fixture
  // ventures leak…' (two live instances in two weeks) — silently hiding real open work
  // from every dispatch surface. Only unambiguous markers remain: ZZZ_/dunder prefixes.
  return typeof qf.title === 'string' && /^\s*(ZZZ_|__)/i.test(qf.title);
}

// ─── periodic_process_registry ────────────────────────────────────────────────────────────
// THE ONE PLACE FIXTURE_KEY_RE MUST NOT BE REUSED, and the reason is the whole point of this SD.
//
// FIXTURE_KEY_RE (above) carries a bare ^__ alternative. Applied to this table it would classify
// REAL PRODUCTION ROWS as fixtures. Enumerated live (194 rows, full fetch — not a sample):
//   __watcher_self__               — the liveness watcher's own marker
//   __eva_scheduler_watcher_self__ — the scheduler watcher's own marker
// Reaping or hiding either BLINDS THE INSTRUMENT the filter exists to protect. And per the same
// safety argument in scripts/reap-e2e-liveness-fixtures.mjs:24-27, name keywords are equally
// unsafe — three further live rows read as test-shaped but are REAL processes:
//   gha_cron:venture-fixture-sweep.yml, standard_loop:account-usage-sample,
//   cron_script:account-usage-sample.mjs
// One of those IS the venture-fixture-sweep cron, so a keyword predicate here could disable the
// very cleanup control this SD family installs. A NAME IS A CLAIM, NOT EVIDENCE.
//
// So the discriminant is the '__e2e_' prefix ONLY. This is the same string and the same
// semantics as scripts/reap-e2e-liveness-fixtures.mjs E2E_FIXTURE_PREFIX, kept as ONE
// representation: that module is the DELETE-side consumer, this is the read-side consumer, and
// they must never diverge — a reaper that deletes more than the filter hides is the worst case.
export const FIXTURE_PROCESS_KEY_PREFIX = '__e2e_';

/**
 * Is this periodic_process_registry row fixture residue? Takes the KEY ONLY — deliberately never
 * consults last_state or age, because a predicate that reads symptoms can be argued into
 * classifying a real row that merely looks abandoned. Provenance decides, not symptoms.
 * @param {string|null|undefined} processKey
 */
export function isFixtureProcessKey(processKey) {
  return typeof processKey === 'string' && processKey.startsWith(FIXTURE_PROCESS_KEY_PREFIX);
}

// ─── jsonb-carrier tables ─────────────────────────────────────────────────────────────────
/**
 * ONE representation of what a fixture marker looks like inside a jsonb column, shared by every
 * jsonb-carrier table so the two never drift apart.
 *
 * Two accepted keys, and the second is not redundancy: `synthetic` is SHIPPED PRECEDENT —
 * scripts/solomon/trend-eyes-receipt-rls-probe.mjs already writes metadata:{synthetic:true,…}
 * into live codebase_health_snapshots rows. Refusing it would leave real synthetic rows
 * unfiltered today; `is_fixture` is the forward-looking canonical key matching isFixtureSdKey's
 * existing metadata contract. Strict === true only — a truthy string or 1 does NOT qualify, so a
 * row carrying an unrelated key of another shape can never be silently swept up.
 * @param {Record<string, unknown>|null|undefined} carrier
 */
export function hasFixtureMarker(carrier) {
  if (!carrier || typeof carrier !== 'object') return false;
  return carrier.is_fixture === true || carrier.synthetic === true;
}

/**
 * Is this codebase_health_snapshots row synthetic? Reads the metadata jsonb column.
 *
 * NOT keyed on `dimension`: a shipped acceptance probe requires its seed keep
 * dimension='trend_eyes_sweep_receipt', and dimension is a legitimate grouping key for real rows.
 * Keying on it would over-eat. The table's liveness consumers read ORDER BY scanned_at DESC
 * LIMIT 1 per dimension, so ONE unfiltered synthetic row is enough to make a dead runner read
 * alive — this predicate is what stops that.
 * @param {{metadata?: Record<string, unknown>|null}|null} row
 */
export function isFixtureHealthSnapshot(row) {
  if (!row || typeof row !== 'object') return false;
  return hasFixtureMarker(row.metadata);
}

/**
 * Is this session_coordination row synthetic? Reads the payload jsonb column.
 * @param {{payload?: Record<string, unknown>|null}|null} row
 */
export function isFixtureCoordinationRow(row) {
  if (!row || typeof row !== 'object') return false;
  return hasFixtureMarker(row.payload);
}
