/**
 * ESLint Rule: require-release-sd-wrapper
 *
 * Flags a raw `<obj>.rpc('release_sd', ...)` call site. release_sd is SESSION-scoped, not
 * SD-scoped (database/migrations/20260502_release_clear_worktree_state.sql:24) -- it releases
 * WHATEVER THE SESSION CURRENTLY HOLDS, so a caller that doesn't first assert the session
 * holds the SD it intends to release can silently drop an unrelated live claim
 * (QF-20260726-593, RCA a7d374f4b77ae2a1b). The sanctioned pattern is
 * lib/fleet/best-effort-release.mjs's bestEffortReleaseSd(supabase, sessionId, reason, log,
 * {expectedSdKey}), which performs that scope check internally before calling the RPC.
 *
 * SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002 (FR-4).
 *
 * SD-LEO-INFRA-RELEASE-KEY-SESSION-001 (FR-5): also flags a raw `.rpc('release_sd_by_key', ...)`
 * call. release_sd_by_key is a sibling RPC serving the same guard's purpose (a named-claim
 * release with a lock-time CAS) -- it escaped this rule entirely until this change, which is
 * exactly the class of bug this lint exists to prevent. The sanctioned wrapper is
 * bestEffortReleaseSdByKey(supabase, sessionId, sdKey, reason, log), also in
 * lib/fleet/best-effort-release.mjs.
 *
 * AST-based (not a text/regex scan): only a real CallExpression whose callee is a `.rpc`
 * member access with a string-literal first argument naming one of the guarded RPCs is
 * flagged, so a comment or a string mentioning these names elsewhere in a file is never a
 * false positive.
 *
 * DELIBERATELY NARROW, matching this repo's established checker style (see
 * eslint-rules/require-main-guard-in-one-off.js): a computed member access
 * (`obj['rpc'](...)`) or a non-literal first argument (`obj.rpc(fnName, ...)` where fnName is
 * a variable) is invisible to this rule -- no data-flow analysis is attempted. The corpus at
 * authoring time contains zero such shapes; if one is introduced later, this control does not
 * see it.
 *
 * @module eslint-rules/require-release-sd-wrapper
 */

const GUARDED_RPCS = {
  release_sd: {
    messageId: 'rawReleaseSdCall',
    message:
      "Raw rpc('release_sd', ...) call. release_sd is SESSION-scoped, not SD-scoped -- it releases " +
      'WHATEVER the session currently holds (QF-20260726-593). Route through ' +
      'bestEffortReleaseSd(supabase, sessionId, reason, log, {expectedSdKey}) from ' +
      'lib/fleet/best-effort-release.mjs instead, or add a reason+count entry to ' +
      'scripts/lint/require-release-sd-wrapper-allowlist.json if this site is a known, ' +
      'pending-retrofit exception.',
  },
  release_sd_by_key: {
    messageId: 'rawReleaseSdByKeyCall',
    message:
      "Raw rpc('release_sd_by_key', ...) call. Route through " +
      'bestEffortReleaseSdByKey(supabase, sessionId, sdKey, reason, log) from ' +
      'lib/fleet/best-effort-release.mjs instead (SD-LEO-INFRA-RELEASE-KEY-SESSION-001), or add ' +
      'a reason+count entry to scripts/lint/require-release-sd-wrapper-allowlist.json if this ' +
      'site is a known, pending-retrofit exception.',
  },
};

function guardedRpcNameOf(node) {
  if (!node || node.type !== 'CallExpression') return null;
  const callee = node.callee;
  if (!callee || callee.type !== 'MemberExpression' || callee.computed) return null;
  if (!callee.property || callee.property.type !== 'Identifier' || callee.property.name !== 'rpc') return null;
  const firstArg = node.arguments[0];
  if (!firstArg || firstArg.type !== 'Literal') return null;
  return Object.prototype.hasOwnProperty.call(GUARDED_RPCS, firstArg.value) ? firstArg.value : null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Require callers of the release_sd / release_sd_by_key RPCs to go through lib/fleet/best-effort-release.mjs's wrappers instead of calling supabase.rpc(...) directly",
      category: 'Possible Errors',
      recommended: true,
      url: 'https://github.com/rickfelix/EHG_Engineer/blob/main/eslint-rules/require-release-sd-wrapper.js',
    },
    messages: {
      rawReleaseSdCall: GUARDED_RPCS.release_sd.message,
      rawReleaseSdByKeyCall: GUARDED_RPCS.release_sd_by_key.message,
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node) {
        const name = guardedRpcNameOf(node);
        if (name) {
          context.report({ node, messageId: GUARDED_RPCS[name].messageId });
        }
      },
    };
  },
};
