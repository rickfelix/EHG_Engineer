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
 * AST-based (not a text/regex scan): only a real CallExpression whose callee is a `.rpc`
 * member access with a string-literal first argument `'release_sd'` is flagged, so a comment
 * or a string mentioning "release_sd" elsewhere in a file is never a false positive.
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

function isReleaseSdRpcCall(node) {
  if (!node || node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (!callee || callee.type !== 'MemberExpression' || callee.computed) return false;
  if (!callee.property || callee.property.type !== 'Identifier' || callee.property.name !== 'rpc') return false;
  const firstArg = node.arguments[0];
  return !!firstArg && firstArg.type === 'Literal' && firstArg.value === 'release_sd';
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Require callers of the release_sd RPC to go through lib/fleet/best-effort-release.mjs's bestEffortReleaseSd(expectedSdKey) instead of calling supabase.rpc('release_sd', ...) directly",
      category: 'Possible Errors',
      recommended: true,
      url: 'https://github.com/rickfelix/EHG_Engineer/blob/main/eslint-rules/require-release-sd-wrapper.js',
    },
    messages: {
      rawReleaseSdCall:
        "Raw rpc('release_sd', ...) call. release_sd is SESSION-scoped, not SD-scoped -- it releases " +
        'WHATEVER the session currently holds (QF-20260726-593). Route through ' +
        'bestEffortReleaseSd(supabase, sessionId, reason, log, {expectedSdKey}) from ' +
        'lib/fleet/best-effort-release.mjs instead, or add a reason+count entry to ' +
        'scripts/lint/require-release-sd-wrapper-allowlist.json if this site is a known, ' +
        'pending-retrofit exception.',
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node) {
        if (isReleaseSdRpcCall(node)) {
          context.report({ node, messageId: 'rawReleaseSdCall' });
        }
      },
    };
  },
};
