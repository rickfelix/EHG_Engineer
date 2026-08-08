/**
 * Producer-side assert-before-insert guard. SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-D.
 *
 * WHAT THIS GENERALIZES, and it already existed exactly once: scripts/harness/s20-fixture.mjs
 * asserts a fixture predicate on the row and THROWS before `.from('ventures').insert(row)`. That
 * is the rule. This module is that rule, made reusable — not a second convention.
 *
 * ── WHY THE GUARD PERFORMS THE WRITE ──────────────────────────────────────────────────────────
 * A bare `assertX(row)` that a caller invokes before its own insert has an OBJECT-IDENTITY SEAM:
 * nothing binds the row that was CHECKED to the row that is WRITTEN. That is not hypothetical —
 * scripts/harness/spine-verify-first-run.mjs builds `{ ...buildFixtureVentureRow(...), name: <x> }`,
 * overriding a field AFTER the builder returns. With a detached assert a producer can check one
 * object and insert another, satisfying every test while writing an unguarded row. So the guard
 * owns the insert: there is no window between the check and the write for the row to change.
 *
 * ── WHY A CLASSIFICATION AND NOT A BOOLEAN ────────────────────────────────────────────────────
 * Three intents exist in this codebase and a boolean can only express two:
 *   FIXTURE              — a synthetic row; MUST trip the canonical discriminant.
 *   DELIBERATELY_REAL    — a row that must exercise the real path; MUST NOT trip it.
 *   SANCTIONED_PERMANENT — the live canary: permanently is_demo=true AND permanently exempt.
 * A boolean opt-out would have to call the canary "not a fixture", which is false, or "a fixture",
 * which loses the exemption.
 *
 * ── THE OPT-OUT IS TWO-SIDED, AND THAT IS THE POINT ───────────────────────────────────────────
 * An escape hatch that merely SKIPS the assert is unfalsifiable: it lets the write through while
 * the row stays misclassified downstream. So every non-FIXTURE declaration (1) NAMES ITSELF in
 * output every single time it fires, so a spreading opt-out is visible in ordinary logs rather
 * than discovered years later by counting, and (2) carries its OWN assert. DELIBERATELY_REAL must
 * prove the row does not trip the discriminant; SANCTIONED_PERMANENT must prove the row both trips
 * it AND belongs to a closed, named set. Without (2), SANCTIONED_PERMANENT degenerates into a
 * --force flag that waves any row through — strictly WIDER than the boolean it replaced.
 *
 * ── SCOPE OF THE NEGATIVE ASSERT: CANONICAL ONLY, STATED SO IT IS NOT MISREAD AS COVERAGE ─────
 * DELIBERATELY_REAL is checked against the CANONICAL predicate only. Other live predicates
 * disagree with canonical by design (lib/governance/fixture-exclusion.mjs carries a
 * "DELIBERATE DIVERGENCE — DO NOT COLLAPSE" heading naming them, with a reason each). A row can
 * therefore pass this guard and still be classified a fixture by chairman-actionable's unanchored
 * substring patterns. THAT IS A KNOWN, BOUNDED RESIDUAL, not an oversight: closing it belongs to
 * QF-20260807-014 (anchoring those patterns) and to founding instance 4 on the parent SD. It is
 * named here because an unstated residual reads as coverage.
 *
 * ── WHY THIS FILE AND NOT fixture-exclusion.mjs ───────────────────────────────────────────────
 * That module is deliberately synchronous, pure and zero-import (see its own header) because
 * scripts/fleet-dashboard.cjs reaches it through require(), and a degraded load there fails OPEN
 * to unfiltered. This guard performs I/O, so it lives beside it and imports from it.
 */

import { isFixtureVenture } from './fixture-exclusion.mjs';
import { CANARY_NAME } from './venture-archive-predicate.mjs';

/** The three declarable intents. A producer must name one; there is no default. */
export const CLASSIFICATION = Object.freeze({
  FIXTURE: 'fixture',
  DELIBERATELY_REAL: 'deliberately-real',
  SANCTIONED_PERMANENT: 'sanctioned-permanent',
});

const VALID = Object.freeze(new Set(Object.values(CLASSIFICATION)));

/**
 * The closed set for SANCTIONED_PERMANENT. CANARY_NAME is IMPORTED, never re-declared — it is
 * already declared twice in this repo and a third copy would be the parallel convention this SD
 * exists to abolish. Membership is exact-match on name, not a pattern: a pattern would let the
 * set grow by accident, which is the property a sanctioned set must not have.
 */
const SANCTIONED_PERMANENT_SET = new Set([CANARY_NAME]);

/**
 * Read-only view of the sanctioned set. Exported as a FROZEN ARRAY, and the predicate below is the
 * only membership test.
 *
 * WHY NOT THE SET: Object.freeze() does NOT freeze Set contents. A previously-exported frozen Set
 * reported Object.isFrozen() === true while `.add(...)` still succeeded from anywhere in-process —
 * so the invariant this comment claims ("a sanctioned set must not grow by accident") was
 * reflectively verifiable and factually false. That is worse than an unfrozen set, because every
 * check agrees with the claim while the claim is untrue.
 */
export const SANCTIONED_PERMANENT_NAMES = Object.freeze([...SANCTIONED_PERMANENT_SET]);

/** The one membership test. Exported so callers never need the container itself. */
export function isSanctionedPermanentName(name) {
  return typeof name === 'string' && SANCTIONED_PERMANENT_SET.has(name);
}

/** Tables this guard can assert today. `ventures` is the only one with a row-shaped predicate. */
const SUPPORTED_TABLES = Object.freeze(new Set(['ventures']));

/**
 * Decide whether `row` satisfies `classification`, and say why not when it does not.
 *
 * PURE. Exported so the decision is testable without a database — the DB plumbing is not where
 * the contract lives.
 *
 * @param {{name?: string, is_demo?: boolean}|null|undefined} row
 * @param {string} classification one of CLASSIFICATION
 * @returns {{ok: boolean, reason: string|null, tripsCanonical: boolean}}
 */
export function evaluateDeclaration(row, classification) {
  if (!VALID.has(classification)) {
    return {
      ok: false,
      tripsCanonical: false,
      reason: `unknown classification '${classification}' — must be one of ${[...VALID].join(', ')}`,
    };
  }

  const tripsCanonical = isFixtureVenture(row);

  if (classification === CLASSIFICATION.FIXTURE) {
    return tripsCanonical
      ? { ok: true, reason: null, tripsCanonical }
      : {
        ok: false,
        tripsCanonical,
        reason: 'declared FIXTURE but the row does not trip the canonical discriminant — '
          + 'refusing to create an unguarded fixture',
      };
  }

  if (classification === CLASSIFICATION.DELIBERATELY_REAL) {
    // The negative assert. This is the half that makes the opt-out falsifiable.
    return tripsCanonical
      ? {
        ok: false,
        tripsCanonical,
        reason: 'declared DELIBERATELY_REAL but the row TRIPS the canonical discriminant, so it '
          + 'will be excluded as a fixture by canonical consumers — the declaration and the row '
          + 'disagree. Common cause: an epoch-millisecond suffix in the name (EPOCH_TAIL_RE).',
      }
      : { ok: true, reason: null, tripsCanonical };
  }

  // SANCTIONED_PERMANENT — both halves required, so this cannot be used as a force flag.
  const named = isSanctionedPermanentName(row?.name);
  if (!named) {
    return {
      ok: false,
      tripsCanonical,
      reason: `declared SANCTIONED_PERMANENT but '${row?.name}' is not in the closed sanctioned `
        + `set {${SANCTIONED_PERMANENT_NAMES.join(', ')}} — this declaration is not a bypass`,
    };
  }
  if (!tripsCanonical) {
    return {
      ok: false,
      tripsCanonical,
      reason: 'declared SANCTIONED_PERMANENT and is in the sanctioned set, but the row does not '
        + 'trip the canonical discriminant — a sanctioned row that no longer reads as a fixture '
        + 'has changed shape and the exemption no longer describes it',
    };
  }
  return { ok: true, reason: null, tripsCanonical };
}

/** Build the loud self-naming line. Exported so its content is asserted, not just its existence. */
export function formatOptOutNotice({ table, classification, source, reason }) {
  return `[fixture-producer-guard] OPT-OUT FIRED: ${classification} on ${table} `
    + `from ${source} — reason: ${reason}`;
}

/**
 * Assert `row` against `classification`, then INSERT it. The write is inside the guard on purpose;
 * see the object-identity note in the header.
 *
 * DELIBERATELY SYNCHRONOUS, and the call site is why. Producers chain the supabase builder —
 * `.insert(row).select('id, name').single()`. An async guard would hand back a Promise, which has
 * no `.select()`, so every adopter would have to restructure its call and the guard would be the
 * awkward option. The assert itself is pure and synchronous, so there is nothing to await: this
 * returns the builder untouched and the caller chains as it always did. Throwing is likewise
 * synchronous — the write is never reached.
 *
 * @param {{from: Function}} supabase  supabase client (or a fake exposing .from().insert())
 * @param {string} table
 * @param {object} row
 * @param {{classification: string, source: string, reason?: string, logger?: {log: Function}}} decl
 * @returns {any} the supabase insert builder, unchanged and still chainable
 */
export function insertGuarded(supabase, table, row, decl) {
  const { classification, source, reason, logger = console } = decl ?? {};

  if (!SUPPORTED_TABLES.has(table)) {
    throw new Error(
      `[fixture-producer-guard] no row-shaped predicate for table '${table}' — `
      + `supported: ${[...SUPPORTED_TABLES].join(', ')}. Rows keyed by venture_id or sd_key are `
      + 'derived from their parent and are out of scope for this guard today.',
    );
  }
  if (!source) {
    throw new Error('[fixture-producer-guard] `source` is required — an opt-out with no author '
      + 'cannot be reviewed');
  }

  const verdict = evaluateDeclaration(row, classification);

  // LOUD: every non-FIXTURE declaration names itself on EVERY firing, pass or fail. Emitting only
  // on failure would make a spreading opt-out invisible, which is the state this guard prevents.
  if (classification !== CLASSIFICATION.FIXTURE) {
    if (!reason || !String(reason).trim()) {
      throw new Error(`[fixture-producer-guard] classification '${classification}' requires a `
        + 'non-empty `reason` — an escape hatch with a blank justification has no author');
    }
    const notice = formatOptOutNotice({ table, classification, source, reason });
    // TWO SINKS, and the unconditional one is the control. The injected `logger` exists so tests can
    // assert the notice's CONTENT — but it is caller-supplied, so a producer passing
    // `logger: { log: () => {} }` could fire an opt-out with zero output anywhere, silently undoing
    // the one property that makes a spreading opt-out visible. stderr is also the right sink: CI
    // reporters swallow stdout on PASSING tests, which is exactly when a quiet opt-out spreads.
    console.error(notice);
    if (logger && logger !== console && typeof logger.log === 'function') logger.log(notice);
  }

  if (!verdict.ok) {
    throw new Error(`[fixture-producer-guard] ${source} -> ${table}: ${verdict.reason}`);
  }

  return supabase.from(table).insert(row);
}
