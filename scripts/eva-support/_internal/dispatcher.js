/**
 * Flow dispatcher.
 * SD: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A
 *
 * Routes a classified subtask to the matching sub-flow module.
 * Single import surface for the slash command.
 *
 * Phase 3 (SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C / FR-4): post-handler middleware
 * prepends a "Related SDs:" block to result.reply when the EVA_SD_READER_ENABLED
 * flag is on AND sd-reader / sd-blocker-surface return non-empty results.
 *
 * Design notes:
 *   - Single change point: this file. The six sub-flow modules are untouched.
 *   - Flag-OFF behavior: middleware is a no-op (sd-reader returns []). Exactly
 *     one reader_disabled audit row is written per dispatch invocation (audit
 *     economy: sd-blocker-surface reuses sd-reader's flag-check via composability
 *     hook, so we don't double-write).
 *   - Substring-redundancy audit: the "Related SDs:" prefix string is unique to
 *     this module — no overlap with the existing 6-flow reply envelope markers
 *     (per CLAUDE_PLAN.md "Substring-Redundancy Audit for Keyword-List Expansions").
 */

import research from '../research.js';
import decision from '../decision.js';
import draft from '../draft.js';
import actionPrep from '../action-prep.js';
import platform from '../platform.js';
import pureHuman from '../pure-human.js';
import { getActiveSDs } from '../../../lib/eva-support/sd-reader.js';
import { getBlockedSDs } from '../../../lib/eva-support/sd-blocker-surface.js';

export const FLOW_HANDLERS = {
  research,
  decision,
  draft,
  action_prep: actionPrep,
  platform,
  pure_human: pureHuman,
};

export function getHandler(flow) {
  const handler = FLOW_HANDLERS[flow];
  if (!handler) throw new Error(`Unknown flow: ${flow}`);
  return handler;
}

/**
 * Build the "Related SDs:" prefix block, or null if empty.
 * Returns a string ready to be prepended (with trailing blank line) to a reply.
 *
 * @param {{ sds: Array, blockers: Array }} ctx
 * @returns {string | null}
 */
export function buildRelatedSDsPrefix({ sds = [], blockers = [] } = {}) {
  if (!sds.length && !blockers.length) return null;
  const lines = ['Related SDs:'];
  const seen = new Set();
  for (const sd of sds.slice(0, 5)) {
    if (seen.has(sd.sd_key)) continue;
    seen.add(sd.sd_key);
    const progress = typeof sd.progress === 'number' ? `${sd.progress}%` : '—';
    lines.push(`  ${sd.sd_key} | ${sd.status} | ${progress}`);
  }
  for (const b of blockers.slice(0, 3)) {
    if (seen.has(b.sd_key)) continue;
    seen.add(b.sd_key);
    lines.push(`  ${b.sd_key} | BLOCKER | ${b.blocker_reason}`);
  }
  return lines.join('\n') + '\n\n';
}

/**
 * Fetch Related-SDs context (active + blocked). Uses sd-reader's flag-check;
 * passes the result to sd-blocker-surface via the composability hook to avoid
 * double-fetch and keep audit-row count to exactly one per invocation when
 * the flag is OFF.
 *
 * @param {Object} options
 * @param {string} [options.targetApplication]
 * @param {Object} [options.client]
 * @param {string} [options.eva_invocation_id]
 * @returns {Promise<{ sds: Array, blockers: Array, flag_enabled: boolean }>}
 */
async function fetchRelatedSDsContext(options) {
  const { targetApplication, client, eva_invocation_id } = options;

  // sd-reader runs first. When flag OFF, it writes the audit row and returns [].
  let activeResult;
  try {
    activeResult = await getActiveSDs({ targetApplication, limit: 10, client, eva_invocation_id });
  } catch {
    // Fail-soft: any reader exception → no prefix is injected.
    return { sds: [], blockers: [], flag_enabled: false };
  }

  if (!activeResult.flag_enabled) {
    return { sds: [], blockers: [], flag_enabled: false };
  }

  // Flag ON — fetch blockers using the composability hook so we don't re-call
  // sd-reader internally.
  let blockerResult = { blockers: [], flag_enabled: true };
  try {
    blockerResult = await getBlockedSDs({
      targetApplication,
      limit: 5,
      client,
      eva_invocation_id,
      _activeSDsOverride: activeResult.sds,
      _flagEnabledOverride: true,
    });
  } catch {
    // Fail-soft: keep active SDs prefix even if blocker fetch fails.
  }

  return {
    sds: activeResult.sds,
    blockers: blockerResult.blockers ?? [],
    flag_enabled: true,
  };
}

export async function dispatch(flow, subtask, options = {}) {
  const result = await getHandler(flow)(subtask, options);

  // Post-handler middleware (FR-4): conditionally prepend "Related SDs:" prefix.
  // Skip if explicitly disabled by caller (e.g. snapshot tests for 6-flow regression).
  if (options._skipRelatedSDs) {
    return result;
  }

  try {
    const ctx = await fetchRelatedSDsContext({
      targetApplication: options.targetApplication,
      client: options.relatedSDsClient,
      eva_invocation_id: options.eva_invocation_id ?? subtask?.id,
    });

    const prefix = buildRelatedSDsPrefix(ctx);
    if (prefix && typeof result.reply === 'string') {
      return { ...result, reply: prefix + result.reply, related_sds_context: ctx };
    }
  } catch {
    // Defensive: any middleware exception falls through to the original result.
    // The reply envelope must never disappear because the Related-SDs surface failed.
  }
  return result;
}

export default { dispatch, getHandler, FLOW_HANDLERS, buildRelatedSDsPrefix };
