/**
 * --full roadmap-creation guard — SD-LEO-INFRA-ROADMAP-REGENERATION-DUPLICATES-001 FR-5.
 *
 * Extracted from scripts/roadmap-generate.js main() because that file invokes main() at module
 * load, so the guard could not be imported without executing the generator. It therefore had NO
 * unit coverage and survived mutation twice in the EXEC adversarial review. A guard nothing can
 * test is a guard nothing protects.
 *
 * PREDICATE IS "any NON-ARCHIVED roadmap", not "any ACTIVE roadmap". createRoadmap() inserts
 * status:'draft' and only roadmap-manager.js approveSequence flips it to 'active', so --full has
 * never been able to fork a second ACTIVE roadmap — and the historical incident was two duplicate
 * DRAFT rows (a89b078b, 8ffa7fdf, 2026-07-17). An active-only guard would not have caught the very
 * thing it was written for.
 */

export const REFUSE_EXISTING = 'existing_non_archived_roadmap';
export const REFUSE_REASON_REQUIRED = 'replace_active_requires_reason';

/**
 * audit_log.severity is CHECK-constrained to exactly these values. Probed live 2026-07-29:
 * 'high' / 'low' / 'medium' / 'HIGH' are all REJECTED (23514). I shipped severity:'high' and it
 * failed silently — supabase-js RETURNS {error}, it does not throw, so the try/catch around the
 * insert was dead code and the override wrote no audit row at all while telling the operator it
 * had. Exported so the value is asserted by a test rather than re-guessed.
 */
export const AUDIT_SEVERITY = 'critical';
export const VALID_AUDIT_SEVERITIES = Object.freeze(['critical', 'warning', 'info', 'error']);

/**
 * Decide whether `--full` may create a roadmap.
 *
 * @param {Array<{id:string,title?:string,status:string}>} liveRoadmaps  non-archived roadmaps
 * @param {{replaceActive?: boolean, replaceReason?: string}} flags
 * @returns {{allow: boolean, refusal?: string, existing?: Array, override?: boolean}}
 */
export function evaluateFullCreate(liveRoadmaps, flags = {}) {
  const live = Array.isArray(liveRoadmaps) ? liveRoadmaps : [];
  // Bootstrap: nothing live, nothing to fork. This is --full's legitimate purpose.
  if (live.length === 0) return { allow: true };

  if (!flags.replaceActive) return { allow: false, refusal: REFUSE_EXISTING, existing: live };

  // An override without a stated reason is an unaudited override. Refuse rather than log "".
  // A bare `--reason` also swallows the NEXT flag as its value (`--reason --force-reassign` gave
  // reason="--force-reassign", which passed a plain trim check), so a value that looks like a
  // flag is treated as a missing reason rather than an accepted one.
  const raw = typeof flags.replaceReason === 'string' ? flags.replaceReason.trim() : '';
  const reason = raw.startsWith('--') ? '' : raw;
  if (!reason) return { allow: false, refusal: REFUSE_REASON_REQUIRED, existing: live };

  return { allow: true, override: true, existing: live };
}

/**
 * The ids an override must archive before creating. Returns ALL non-archived roadmaps, not just
 * the first: leaving any behind reproduces the exact duplicate state this guard exists to prevent,
 * so "replace" that replaces only one of two is not a replacement.
 * @param {Array<{id:string}>} liveRoadmaps
 * @returns {string[]}
 */
export function roadmapsToArchive(liveRoadmaps) {
  return (Array.isArray(liveRoadmaps) ? liveRoadmaps : []).map((r) => r.id).filter(Boolean);
}

export default { evaluateFullCreate, roadmapsToArchive, REFUSE_EXISTING, REFUSE_REASON_REQUIRED };
