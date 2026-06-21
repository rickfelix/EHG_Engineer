/**
 * SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-B — dry-run staged-candidate verifier.
 *
 * The auto-refill feature must NOT promote staged roadmap_wave_items blindly. This is the
 * operator/coordinator PREVIEW step: given the staged corpus, report which rows the FR-1
 * candidate-validity predicate (evaluateRefillCandidate, the -A SSOT) would accept as valid
 * auto-promote candidates vs reject (with the per-reason breakdown) — WITHOUT writing anything.
 * The -C auto-refill cron promotes; this -B verifier lets a human eyeball what it WOULD promote.
 *
 * PURE: verifyStagedCandidates() takes rows in → report out, no DB/fs/clock. The thin CLI
 * (scripts/sourcing-engine/refill-verify.mjs) is the only I/O and is what makes this module
 * INVOKED, not merely reachable (per the INVOCATION-PATH-PROOF lesson). Mirrors -A's ESM style.
 */
import { evaluateRefillCandidate, REFILL_INVALID_REASONS } from './refill-candidate-validity.js';

export { REFILL_INVALID_REASONS };

/**
 * Run the -A candidate-validity predicate over a set of staged roadmap_wave_items rows and
 * aggregate a dry-run report. Pure + total (never throws on odd input).
 *
 * @param {Array<Object>} rows - roadmap_wave_items rows (any shape; the predicate is total)
 * @param {{ shippedTitleSet?:Set<string> }} [opts] - SD-LEO-INFRA-AUTO-REFILL-BELT-001 (FR-4): forwarded
 *        verbatim to evaluateRefillCandidate so the belt-quality lookalike axis fires here too. Default
 *        empty (backward compatible — the dry-run CLI and any older caller still work unchanged).
 * @returns {{
 *   total:number, validCount:number, invalidCount:number,
 *   valid:Array<Object>, invalid:Array<{item:Object, reason:string}>,
 *   byReason:Object<string,number>
 * }}
 */
export function verifyStagedCandidates(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const valid = [];
  const invalid = [];
  const byReason = {};
  for (const r of list) {
    const verdict = evaluateRefillCandidate(r, opts);
    if (verdict.valid) {
      valid.push(r);
    } else {
      invalid.push({ item: r, reason: verdict.reason });
      byReason[verdict.reason] = (byReason[verdict.reason] || 0) + 1;
    }
  }
  return {
    total: list.length,
    validCount: valid.length,
    invalidCount: invalid.length,
    valid,
    invalid,
    byReason,
  };
}

/**
 * Render the dry-run report as human-readable lines (no I/O — returns the lines). Pure.
 * @param {ReturnType<typeof verifyStagedCandidates>} report
 * @returns {string[]}
 */
export function formatVerifierReport(report) {
  const r = report || { total: 0, validCount: 0, invalidCount: 0, byReason: {} };
  const lines = [
    `Staged candidates verified (DRY RUN — no writes): ${r.total}`,
    `  ✅ would auto-promote: ${r.validCount}`,
    `  ⛔ rejected: ${r.invalidCount}`,
  ];
  const reasons = Object.keys(r.byReason || {}).sort();
  for (const reason of reasons) lines.push(`     - ${reason}: ${r.byReason[reason]}`);
  return lines;
}
