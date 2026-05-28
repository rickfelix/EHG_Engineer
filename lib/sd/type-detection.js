/**
 * Unified SD-Type Detection
 * SD-LEO-INFRA-CONSOLIDATE-DUAL-DETECTION-001 FR-2
 *
 * Single source of truth for "what kind of SD is this?" classification questions.
 *
 * BEFORE this helper, the same questions were answered by checking different subsets
 * of signals across N call sites — surveyed by the Phase 1 audit at
 * docs/audits/sd-leo-infra-consolidate-dual-detection-001-audit.md. Each call site
 * picked 1-2 signals; combinations differed; verdicts diverged on edge cases.
 *
 * API mirrors lib/handoff/parent-detection.js (PR #4021 canonical reference):
 *   - Async classify(...) + sync ...Sync(...) variants
 *   - WeakMap cache keyed on sd object identity
 *   - OR-merge of all available signals
 *
 * Per LEAD VALIDATION C2: this helper MUST import (not duplicate)
 *   - lib/sd-type-enum.js — canonical CANONICAL_SD_TYPES Set + assertValidSdType
 *   - lib/eva/bridge/sd-router.js — LEGITIMATE_NO_VENTURE_SD_TYPES Set
 *
 * Per LEAD DESIGN Q3: this helper uses WeakMap cache (sd objects are mostly
 * request-scoped); the Cluster B ownership-detection.js helper does NOT cache
 * by default (different access pattern). Each cluster's helper picks the
 * cache strategy that matches its consumer pattern.
 *
 * Sibling: lib/utils/sd-type-validation.js handles a DIFFERENT abstraction
 * (validation REQUIREMENTS — does this SD need TESTING/UAT/E2E?) and is
 * intentionally left in place.
 */

import { CANONICAL_SD_TYPES, isValidSdType } from '../sd-type-enum.js';
import { LEGITIMATE_NO_VENTURE_SD_TYPES } from '../eva/bridge/sd-router.js';

const cache = new WeakMap();

function readCache(sd, key) {
  const entry = cache.get(sd);
  return entry && key in entry ? entry[key] : undefined;
}

function writeCache(sd, key, value) {
  const entry = cache.get(sd) || {};
  entry[key] = value;
  cache.set(sd, entry);
  return value;
}

/**
 * Returns true if SD is an orchestrator. Async — performs a DB children lookup
 * when neither sd_type nor metadata flags assert the answer.
 *
 * OR-merges:
 *   - sd.sd_type === 'orchestrator'
 *   - sd.metadata?.is_orchestrator === true
 *   - sd.metadata?.is_parent === true   (legacy parent-orchestrator flag)
 *   - DB query: at least 1 child in strategic_directives_v2 WHERE parent_sd_id = sd.id
 *
 * @param {Object} sd
 * @param {Object|null} supabase - Pass null/undefined to skip the DB-query branch
 * @returns {Promise<boolean>}
 */
export async function isOrchestrator(sd, supabase) {
  if (!sd) return false;
  const cached = readCache(sd, 'isOrchestrator');
  if (cached !== undefined) return cached;

  if (
    sd.sd_type === 'orchestrator' ||
    sd.metadata?.is_orchestrator === true ||
    sd.metadata?.is_parent === true
  ) {
    return writeCache(sd, 'isOrchestrator', true);
  }

  if (!supabase || !sd.id) {
    return writeCache(sd, 'isOrchestrator', false);
  }

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('parent_sd_id', sd.id)
    .limit(1);

  const hasChildren = !error && Array.isArray(data) && data.length > 0;
  return writeCache(sd, 'isOrchestrator', hasChildren);
}

/**
 * Sync orchestrator check (metadata + sd_type only — no DB lookup).
 * Use in hot-path mid-handoff sites where read-after-write transactional consistency
 * matters more than catching DB-only parents (per LEAD RISK C1).
 *
 * @param {Object} sd
 * @returns {boolean}
 */
export function isOrchestratorSync(sd) {
  if (!sd) return false;
  return (
    sd.sd_type === 'orchestrator' ||
    sd.metadata?.is_orchestrator === true ||
    sd.metadata?.is_parent === true
  );
}

/**
 * Returns true if SD belongs to a venture (i.e. delivers product to a venture's
 * codebase, not engineering/governance infra work).
 *
 * OR-merges:
 *   - sd.venture_id is set (canonical writer)
 *   - sd.sd_type === 'venture'  (rare; most ventures use other sd_types)
 *   - sd.metadata?.is_venture === true
 *
 * Note: sd_key prefix patterns (SD-VENTURE-*, SD-CRONGENIUS-*) are intentionally NOT
 * a signal here — sd_key prefixes drift (e.g., SD-CRONGENIUS-LEO-INFRA-* was
 * prefix-misleading per pilot journal P-FAIL-5). Trust the venture_id column.
 *
 * @param {Object} sd
 * @returns {boolean}
 */
export function isVenture(sd) {
  if (!sd) return false;
  return (
    Boolean(sd.venture_id) ||
    sd.sd_type === 'venture' ||
    sd.metadata?.is_venture === true
  );
}

/** Alias — venture detection has no async branch (no DB lookup needed). */
export function isVentureSync(sd) {
  return isVenture(sd);
}

/**
 * Returns true if SD's sd_type is on the canonical "no venture needed" list
 * (engineering / governance / LEO infrastructure work).
 *
 * Signals merged:
 *   - sd.sd_type is in LEGITIMATE_NO_VENTURE_SD_TYPES (from lib/eva/bridge/sd-router.js)
 *
 * @param {Object} sd
 * @returns {boolean}
 */
export function isInfraNoVenture(sd) {
  if (!sd || !sd.sd_type) return false;
  return LEGITIMATE_NO_VENTURE_SD_TYPES.has(sd.sd_type);
}

/** Alias — no async branch. */
export function isInfraNoVentureSync(sd) {
  return isInfraNoVenture(sd);
}

/**
 * Returns the canonical sd_type for this SD, applying the OR-merge priority:
 *   1. Explicit sd.sd_type if it's a canonical value
 *   2. 'orchestrator' if metadata.is_orchestrator or metadata.is_parent is true
 *   3. null (caller decides default — usually 'feature')
 *
 * @param {Object} sd
 * @returns {string|null}
 */
export function classifySDType(sd) {
  if (!sd) return null;
  if (sd.sd_type && isValidSdType(sd.sd_type)) return sd.sd_type;
  if (sd.metadata?.is_orchestrator === true || sd.metadata?.is_parent === true) {
    return 'orchestrator';
  }
  return null;
}

/**
 * Test helper: signal that the WeakMap cache should be considered cleared.
 * WeakMap entries are released when sd objects are GCed; this helper exists so
 * tests can document their cache-reset intent. Production code should never
 * call this.
 */
export function _clearCache() {
  // No-op. Pass fresh sd object instances in tests instead.
}
