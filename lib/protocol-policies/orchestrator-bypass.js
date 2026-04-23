/**
 * lib/protocol-policies/orchestrator-bypass.js
 *
 * SD-LEO-INFRA-LEO-PROTOCOL-POLICY-001 (FR-001, Part A)
 *
 * Single source of truth for sd_type-driven bypass rules at handoff gates.
 * Callers (preflight, gates) import from here instead of carrying local copies.
 *
 * Rules mirror the "Required Sub-Agents by Type" and "PRD Required" columns of
 * the SD Type matrix in CLAUDE_CORE.md. When CLAUDE_CORE.md changes, the
 * doc-vs-code linter (FR-005) enforces that the sets below stay in sync.
 *
 * Design constraints (TR-001):
 *   - Pure functions only — no DB, no fs, no process.env reads beyond literals.
 *   - Accept either an SD object {sd_type, ...} or a bare sd_type string so
 *     call sites don't have to unwrap.
 *   - Safe defaults: unknown / null types do NOT bypass (caller still enforces).
 */

/**
 * sd_type values exempt from the USER_STORIES requirement at PLAN-TO-EXEC.
 * Matches "Required Sub-Agents by Type" in CLAUDE_CORE.md — only feature and
 * bugfix require STORIES sub-agent execution.
 */
export const STORY_EXEMPT_TYPES = new Set([
  'infrastructure',
  'documentation',
  'database',
  'security',
  'refactor',
  'orchestrator',
]);

/**
 * sd_type values exempt from the PRD requirement at PLAN-TO-EXEC.
 * Matches the "PRD Required" column in CLAUDE_CORE.md SD-type matrix.
 */
export const PRD_EXEMPT_TYPES = new Set([
  'documentation',
  'fix',
]);

/**
 * Extract sd_type from either an SD object or a bare string.
 * Returns null if the input is not a usable sd_type.
 *
 * @param {Object|string|null|undefined} sdOrType
 * @returns {string|null}
 */
function extractSdType(sdOrType) {
  if (typeof sdOrType === 'string') {
    return sdOrType.length > 0 ? sdOrType : null;
  }
  if (sdOrType && typeof sdOrType === 'object' && !Array.isArray(sdOrType)) {
    const t = sdOrType.sd_type;
    return typeof t === 'string' && t.length > 0 ? t : null;
  }
  return null;
}

/**
 * Should the USER_STORIES requirement be bypassed for this SD?
 *
 * Returns true when the sd_type is exempt from STORIES sub-agent execution
 * per CLAUDE_CORE.md. Returns false for unknown / null / missing types (safe
 * default — caller enforces the requirement).
 *
 * @param {Object|string|null} sdOrType - SD object or sd_type string
 * @returns {boolean}
 */
export function shouldBypassUserStories(sdOrType) {
  const sdType = extractSdType(sdOrType);
  if (!sdType) return false;
  return STORY_EXEMPT_TYPES.has(sdType);
}

/**
 * Should the PRD requirement be bypassed for this SD?
 *
 * Returns true when the sd_type is exempt from PRD creation per the "PRD
 * Required" column in the CLAUDE_CORE.md SD-type matrix.
 *
 * @param {Object|string|null} sdOrType - SD object or sd_type string
 * @returns {boolean}
 */
export function shouldBypassPRD(sdOrType) {
  const sdType = extractSdType(sdOrType);
  if (!sdType) return false;
  return PRD_EXEMPT_TYPES.has(sdType);
}
