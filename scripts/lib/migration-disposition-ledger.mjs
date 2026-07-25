/**
 * Migration disposition ledger — per-file APPLIED / RETIRED / DEFERRED decisions.
 *
 * SD-LEO-INFRA-MIGRATION-APPLY-STATE-TRIAGE-001.
 *
 * WHY THIS EXISTS. verify-migration-apply-state.mjs was column-blind until
 * QF-20260725-470; the re-run then exposed 126 forward migrations carrying gaps.
 * 117 of them sit before RETIRED_BEFORE and can never turn the CI gate red, so
 * "every file has a decision" is invisible to the verifier for 93% of the corpus.
 * This module is the seam that makes the decision auditable instead.
 *
 * STANDALONE ON PURPOSE. It imports nothing from the verifier or the tier
 * classifier. scripts/lib/migration-tier-classifier.mjs already imports
 * stripNonDdl from the verifier, and pending-migrations-check.js (a handoff hot
 * path) imports the classifier — routing this module through either would create
 * a cycle and put ledger disk I/O on every handoff.
 *
 * THREE INVARIANTS, each guarding a specific way this could go wrong:
 *
 *   1. FAIL OPEN (FR-6). An unreadable, malformed, empty or wrong-shaped ledger
 *      yields an EMPTY map — zero suppression, all real drift still reported. A
 *      corrupt JSON must never be able to mass-suppress genuine drift.
 *
 *   2. REASON REQUIRED (FR-1). An entry with a missing, empty or whitespace-only
 *      reason is IGNORED. Cloned from scripts/audit/count-truncation-inventory.mjs,
 *      whose override loader ignores note-less entries — except that original uses
 *      bare truthiness, which passes '   '. We trim.
 *
 *   3. APPLIED NEVER SUPPRESSES (FR-2b). This is the anti-ghost-completion guard.
 *      A genuinely applied migration cannot appear in the verifier's gap set at
 *      all, so a file that IS in gaps while marked APPLIED proves the disposition
 *      false — most likely a seeder that mapped the reachability bucket's "APPLY
 *      candidate" wording onto APPLIED before the apply actually happened. Honour
 *      it and the gate goes green while the columns are still absent, which is
 *      exactly how QF-20260719-281 ghost-completed. Only RETIRED and DEFERRED are
 *      legitimate grounds for suppression.
 */

import fs from 'fs';
import path from 'path';

/** Suppression is reachable only through these two. APPLIED is deliberately absent. */
export const SUPPRESSING_DISPOSITIONS = Object.freeze(['RETIRED', 'DEFERRED']);

/** The full recognised set. Anything outside this never suppresses (fail-closed enum). */
export const KNOWN_DISPOSITIONS = Object.freeze(['APPLIED', 'RETIRED', 'DEFERRED']);

export const DEFAULT_LEDGER_PATH = path.join('docs', 'audits', 'migration-dispositions.json');

/** Characters that render as nothing but survive String.trim(). */
const INVISIBLE_RE = /[\s​-‍­﻿]/g;

/**
 * True when `reason` contains at least one character a human could actually read.
 *
 * @param {unknown} reason
 * @returns {boolean}
 */
export function hasReadableReason(reason) {
  return typeof reason === 'string' && reason.replace(INVISIBLE_RE, '') !== '';
}

/**
 * True when `entry` is a well-formed disposition that may suppress its file.
 *
 * Pure and total: never throws, whatever shape it is handed.
 *
 * @param {unknown} entry
 * @returns {boolean}
 */
export function isSuppressingEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;

  // Invariant 2 — reason required. Stripped rather than merely trimmed: String.trim()
  // removes only WhiteSpace/LineTerminator, so a reason of "​" (zero-width space),
  // "‌", "­" (soft hyphen) or "﻿" survives it while rendering blank in every
  // editor and diff — a reason no human can read, passing a check named "reason required".
  if (!hasReadableReason(entry.reason)) return false;

  const disposition = entry.disposition;
  if (typeof disposition !== 'string') return false;

  // Invariants 1 and 3 — unknown values and APPLIED both fall through to false.
  return SUPPRESSING_DISPOSITIONS.includes(disposition);
}

/**
 * Read the ledger, FAILING OPEN.
 *
 * Every failure mode — absent file, unreadable path, malformed JSON, a JSON array
 * or scalar where an object was expected — resolves to an empty Map rather than an
 * exception. The caller cannot tell the difference between "no ledger" and "broken
 * ledger", and that is the point: both must suppress nothing.
 *
 * @param {string} [ledgerPath]
 * @returns {Map<string, object>} basename -> entry. Empty on any failure.
 */
export function loadLedger(ledgerPath = DEFAULT_LEDGER_PATH) {
  return inspectLedger(ledgerPath).ledger;
}

/**
 * loadLedger plus WHY it is empty.
 *
 * Fail-open means a corrupt ledger and an absent one behave identically, which is correct for
 * suppression but wrong for reporting: an operator who corrupts the ledger would otherwise see
 * "ledger entries=0" and read it as "no decisions recorded yet" — losing precisely the signal
 * this module exists to provide. Suppression consumes `ledger`; humans consume `status`.
 *
 * @param {string} [ledgerPath]
 * @returns {{ledger: Map<string, object>, status: 'ok'|'absent'|'unreadable'|'malformed'|'wrong-shape'}}
 */
export function inspectLedger(ledgerPath = DEFAULT_LEDGER_PATH) {
  const empty = new Map();
  let raw;
  try {
    raw = fs.readFileSync(ledgerPath, 'utf8');
  } catch (e) {
    // ENOENT is the ordinary "not created yet" state; anything else is a real problem.
    return { ledger: empty, status: e && e.code === 'ENOENT' ? 'absent' : 'unreadable' };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ledger: empty, status: 'malformed' }; // malformed, empty, whitespace-only, BOM-mangled.
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ledger: empty, status: 'wrong-shape' }; // valid JSON, wrong shape.
  }

  const out = new Map();
  for (const [basename, entry] of Object.entries(parsed)) {
    if (typeof basename === 'string' && basename) out.set(basename, entry);
  }
  return { ledger: out, status: 'ok' };
}

/**
 * The set of basenames this ledger legitimately suppresses.
 *
 * Only entries clearing all three invariants are included, so callers can treat
 * membership as "a human recorded a real reason to stop reporting this".
 *
 * @param {Map<string, object>} ledger
 * @returns {Set<string>}
 */
export function suppressedBasenames(ledger) {
  const out = new Set();
  if (!(ledger instanceof Map)) return out;
  for (const [basename, entry] of ledger) {
    if (isSuppressingEntry(entry)) out.add(basename);
  }
  return out;
}

/**
 * Basename of a gap record, tolerating either a bare string or a `{file}` object,
 * and normalising both POSIX and Windows separators.
 *
 * Basename rather than full path is deliberate: schema_migrations_applied stores
 * worktree-varying absolute Windows paths (229 distinct paths, only 227 distinct
 * basenames), so path is not a stable key across worktrees.
 *
 * @param {unknown} gap
 * @returns {string}
 */
export function gapBasename(gap) {
  const file = typeof gap === 'string' ? gap : gap && typeof gap === 'object' ? gap.file : '';
  if (typeof file !== 'string' || !file) return '';
  return file.replace(/^.*[\\/]/, '');
}

/**
 * Partition gaps into those a ledger suppresses and those it does not.
 *
 * Total: with an empty ledger every gap lands in `remaining`, which is what makes
 * the fail-open path byte-identical to having no ledger at all.
 *
 * @param {Array<object|string>} gaps
 * @param {Map<string, object>} ledger
 * @returns {{remaining: Array, suppressed: Array}}
 */
export function applyDispositions(gaps, ledger) {
  const list = Array.isArray(gaps) ? gaps : [];
  const suppressedSet = suppressedBasenames(ledger);
  const remaining = [];
  const suppressed = [];
  for (const gap of list) {
    if (suppressedSet.has(gapBasename(gap))) suppressed.push(gap);
    else remaining.push(gap);
  }
  return { remaining, suppressed };
}

/**
 * Basenames carrying no disposition at all — the machine-checkable definition of
 * done (FR-3). "Every file has been decided" is provable by this reaching zero,
 * independently of whether the verifier exits clean.
 *
 * A file whose entry is malformed or reason-less counts as UNDISPOSITIONED, not
 * as decided: a decision nobody can read is not a decision.
 *
 * @param {Array<object|string>} gaps
 * @param {Map<string, object>} ledger
 * @returns {string[]} sorted, deduplicated
 */
export function undispositionedBasenames(gaps, ledger) {
  const list = Array.isArray(gaps) ? gaps : [];
  const decided = new Set();
  if (ledger instanceof Map) {
    for (const [basename, entry] of ledger) {
      // APPLIED IS NOT A DECISION *HERE*. This function is only ever asked about files that
      // appear in the verifier's gap set, and a genuinely applied migration cannot appear
      // there — so an APPLIED entry reaching this loop is self-contradictory by construction.
      //
      // Crediting it would let a hand-edited ledger marking all 123 residual files APPLIED
      // drive this metric — the SD's machine-checkable definition of done — to zero while
      // suppressing nothing and leaving every gap real. That is QF-20260719-281's ghost
      // completion again, one layer up from the suppression path FR-2b already guards.
      // The suppression guard alone was not enough: it protects what the gate BLOCKS on,
      // this protects what the SD CLAIMS. Contradictory entries are surfaced separately by
      // contradictoryBasenames() rather than silently ignored.
      if (isDecidedEntry(entry) && entry.disposition !== 'APPLIED') decided.add(basename);
    }
  }
  const out = new Set();
  for (const gap of list) {
    const basename = gapBasename(gap);
    if (basename && !decided.has(basename)) out.add(basename);
  }
  return [...out].sort();
}

/** A well-formed entry carrying a readable reason and a recognised disposition. */
function isDecidedEntry(entry) {
  return Boolean(
    entry && typeof entry === 'object' && !Array.isArray(entry)
    && hasReadableReason(entry.reason)
    && typeof entry.disposition === 'string'
    && KNOWN_DISPOSITIONS.includes(entry.disposition)
  );
}

/**
 * Basenames whose ledger entry CONTRADICTS observed reality: marked APPLIED, yet still
 * present in the verifier's gap set with objects genuinely missing from the live schema.
 *
 * Reported loudly rather than quietly discarded. A contradiction means either the ledger is
 * lying or the apply silently failed, and both are worth an operator's attention — the
 * QF-20260719-281 post-mortem turned on exactly this state going unnoticed.
 *
 * @param {Array<object|string>} gaps
 * @param {Map<string, object>} ledger
 * @returns {string[]} sorted, deduplicated
 */
export function contradictoryBasenames(gaps, ledger) {
  const list = Array.isArray(gaps) ? gaps : [];
  if (!(ledger instanceof Map)) return [];
  const out = new Set();
  for (const gap of list) {
    const basename = gapBasename(gap);
    const entry = basename ? ledger.get(basename) : null;
    if (entry && isDecidedEntry(entry) && entry.disposition === 'APPLIED') out.add(basename);
  }
  return [...out].sort();
}
