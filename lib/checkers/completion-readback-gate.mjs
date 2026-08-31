// @wire-check-exempt: statically imported by scripts/modules/complete-quick-fix/orchestrator.js
// and scripts/hooks/stop-subagent-enforcement/post-completion-validator.js (both verified via
// direct relative import). Neither importer is reachable from wire-check-gate's package.json-script
// traversal: the QF orchestrator is invoked via scripts/complete-quick-fix.js (a CLI entry not listed
// in package.json scripts), and post-completion-validator.js is invoked from a Claude Code Stop hook
// (scripts/hooks/stop-subagent-enforcement.js), not a package.json script. Genuinely wired, blind spot
// in the gate's entry-point discovery, not dead code.
/**
 * SD-LEO-INFRA-COMPLETION-GATE-DATA-001-A — FR-4/FR-5 shared trigger + kill-switch
 * wrapper around lib/checkers/readback-checker.mjs's verifyReadback(), reused by both
 * completion write paths (QF: scripts/modules/complete-quick-fix/orchestrator.js; SD:
 * scripts/hooks/stop-subagent-enforcement/post-completion-validator.js) so the trigger
 * condition and kill-switch semantics live in exactly one place.
 *
 * TRIGGER (structured, not free-form text parsing): fires ONLY when the caller's
 * completion metadata carries a `data_claim` object shaped exactly
 * `{table: string, match: object, expectedFields: object}` — e.g.
 * `{table:'quick_fixes', match:{id: qfId}, expectedFields:{status:'completed'}}`.
 * No `metadata.data_claim` at all => full bypass, proceeds exactly as before this SD.
 *
 * A PRESENT but malformed claim (missing table/match/expectedFields) is a distinct
 * class from "no claim" — it is ALWAYS hard-refused via a thrown ClaimMalformedError,
 * regardless of LEO_READBACK_GATE_ENABLED.
 *
 * A present, well-formed claim that fails verifyReadback() with a genuine mismatch
 * (rowcount / field / required-key) is:
 *   - LEO_READBACK_GATE_ENABLED=true  => re-thrown (hard block)
 *   - unset/false (default)           => logged as READBACK_WOULD_HAVE_BLOCKED, non-fatal
 *
 * A verifyReadback() INFRASTRUCTURE failure (client construction, query timeout/transport
 * error — distinct from a genuine mismatch) is NEVER a silent pass and NEVER blocks: it
 * logs READBACK_UNVERIFIABLE regardless of the kill-switch (FR-6 COULD-NOT-CHECK contract).
 */
import {
  verifyReadback,
  ReadbackRowcountError,
  ReadbackFieldMismatchError,
  ReadbackKeyDropError,
} from './readback-checker.mjs';

export class ClaimMalformedError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ClaimMalformedError';
    Object.assign(this, details);
  }
}

const REQUIRED_CLAIM_KEYS = ['table', 'match', 'expectedFields'];

/**
 * @param {object|null|undefined} metadata - completion call metadata; only
 *   metadata.data_claim is consulted.
 * @param {{logLabel?: string}} [opts]
 * @returns {Promise<{status:'BYPASSED'|'PASS'|'WOULD_HAVE_BLOCKED'|'UNVERIFIABLE', error?: Error}>}
 * @throws {ClaimMalformedError} data_claim present but missing a required key (always).
 * @throws {ReadbackCheckError} LEO_READBACK_GATE_ENABLED=true and a well-formed claim
 *   fails readback with a genuine mismatch.
 */
export async function applyCompletionReadbackGate(metadata, { logLabel = '' } = {}) {
  const claim = metadata && typeof metadata === 'object' ? metadata.data_claim : undefined;
  if (claim === undefined || claim === null) return { status: 'BYPASSED' };

  const label = logLabel ? ` (${logLabel})` : '';

  if (typeof claim !== 'object' || Array.isArray(claim)) {
    throw new ClaimMalformedError(
      `CLAIM_MALFORMED${label}: metadata.data_claim must be an object shaped {table, match, expectedFields}`,
      { claim }
    );
  }
  const missing = REQUIRED_CLAIM_KEYS.filter((k) => !(k in claim));
  if (missing.length > 0) {
    throw new ClaimMalformedError(
      `CLAIM_MALFORMED${label}: metadata.data_claim missing required key(s): ${missing.join(', ')}`,
      { claim, missing }
    );
  }

  const enabled = process.env.LEO_READBACK_GATE_ENABLED === 'true';
  try {
    await verifyReadback({ table: claim.table, match: claim.match, expectedFields: claim.expectedFields });
    return { status: 'PASS' };
  } catch (err) {
    const isGenuineMismatch = err instanceof ReadbackRowcountError
      || err instanceof ReadbackFieldMismatchError
      || err instanceof ReadbackKeyDropError;

    if (isGenuineMismatch) {
      if (enabled) throw err; // hard block
      console.warn(`⚠️  READBACK_WOULD_HAVE_BLOCKED${label}: ${err.message}`);
      return { status: 'WOULD_HAVE_BLOCKED', error: err };
    }

    // Infra failure (client construction threw before the query even ran, a
    // ReadbackQueryError from a query timeout/transport error, or any other
    // unexpected throw) — distinct from a genuine mismatch. Never silently PASS,
    // never block: log UNVERIFIABLE regardless of the kill-switch.
    console.warn(`⚠️  READBACK_UNVERIFIABLE${label}: ${err.message}`);
    return { status: 'UNVERIFIABLE', error: err };
  }
}
