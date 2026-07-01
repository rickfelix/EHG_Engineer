/**
 * ESLint Rule: no-realtime-teardown-in-subscribe-callback
 *
 * Flags `<ref>.removeChannel(...)` (any host object — e.g. `supabase.removeChannel`)
 * or `<ref>.unsubscribe()` called SYNCHRONOUSLY from inside the callback passed to
 * a `.subscribe(...)` call. This is the recursion-causing shape behind a proven,
 * recurring crash class: Supabase's vendored phoenix client's `Channel.leave()`
 * (invoked by both `removeChannel()` and `unsubscribe()` — removeChannel wraps
 * unsubscribe internally) synchronously re-fires the SAME status callback before
 * settling, so a teardown call made from inside that callback recurses unbounded
 * -> `RangeError: Maximum call stack size exceeded`.
 *
 * Proven 3x independently: ae499d9957 / QF-20260701-709 (reality-gates.js,
 * stage-governance.js), then PR #5305 / QF-20260701-762 (chairman-decision-watcher.js).
 * Each time, a mock that didn't reproduce the re-fire let the anti-pattern ship
 * green through the full LEO gate pipeline. SD-LEO-INFRA-REALTIME-REMOVECHANNEL-
 * RECURSION-CLASSGUARD-001 — this rule is the structural guard against a 4th.
 *
 * Correct pattern: null the local channel reference inside the callback; defer
 * the actual removeChannel()/unsubscribe() call to OUTSIDE the callback (a
 * separate cleanup() path invoked on resolution/timeout, never from the status
 * handler itself).
 *
 * Escape hatch (REQUIRES a non-empty REASON after the `--` separator):
 *
 *   // eslint-disable-next-line no-realtime-teardown-in-subscribe-callback -- <REASON>
 *   channel.unsubscribe();
 *
 * Detection scope: walks the callback body passed to any `.subscribe(fn)` call
 * (fn must be a FunctionExpression/ArrowFunctionExpression), recursing into
 * blocks/if-else/switch/try but NOT into nested function boundaries (a call
 * inside a nested closure is not synchronously-within-the-subscribe-invocation
 * itself). Matches by property name only (`removeChannel` / `unsubscribe`),
 * independent of the host object's identifier name, since the client variable
 * name varies across call sites (`supabase`, `client`, `this.supabase`, ...).
 *
 * @module eslint-rules/no-realtime-teardown-in-subscribe-callback
 */

const RULE_NAME = 'no-realtime-teardown-in-subscribe-callback';
const TEARDOWN_METHOD_NAMES = new Set(['removeChannel', 'unsubscribe']);

// Detects `eslint-disable-next-line [<prefix>/]no-realtime-teardown-in-subscribe-callback`
// and captures the trailing text on the same line, mirroring the pragma contract
// established by eslint-rules/no-process-cwd-in-sub-agents.js.
const PRAGMA_DETECT_RE = new RegExp(
  String.raw`eslint-disable-next-line\s+(?:[^,\n]*,\s*)*(?:[\w@-]+(?:[/][\w@-]+)*/)?` +
    RULE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    String.raw`(?:\s*,[^\n]*)?(.*)$`
);

/**
 * Is this call expression `.subscribe(fn)` where fn is an inline function?
 *
 * @param {import('estree').Node} node
 * @returns {{ callback: import('estree').Node } | null}
 */
function matchSubscribeCall(node) {
  if (!node || node.type !== 'CallExpression') return null;
  const callee = node.callee;
  if (!callee || callee.type !== 'MemberExpression') return null;
  if (callee.computed) return null;
  if (!callee.property || callee.property.type !== 'Identifier' || callee.property.name !== 'subscribe') {
    return null;
  }
  const callback = node.arguments && node.arguments[0];
  if (!callback) return null;
  if (callback.type !== 'FunctionExpression' && callback.type !== 'ArrowFunctionExpression') return null;
  return { callback };
}

/**
 * Is this call expression `<ref>.removeChannel(...)` or `<ref>.unsubscribe()`?
 *
 * @param {import('estree').Node} node
 * @returns {boolean}
 */
function isTeardownCall(node) {
  if (!node || node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (!callee || callee.type !== 'MemberExpression') return false;
  if (callee.computed) return false;
  if (!callee.property || callee.property.type !== 'Identifier') return false;
  return TEARDOWN_METHOD_NAMES.has(callee.property.name);
}

/**
 * Classify a pragma comment targeting this rule.
 *
 * @param {string} commentValue
 * @returns {{ targets: false } | { targets: true, hasMarker: boolean, reason: string }}
 */
function classifyPragma(commentValue) {
  if (!commentValue) return { targets: false };
  const match = commentValue.match(PRAGMA_DETECT_RE);
  if (!match) return { targets: false };
  const suffix = match[1] || '';
  const markerIdx = suffix.indexOf('--');
  if (markerIdx === -1) {
    return { targets: true, hasMarker: false, reason: '' };
  }
  const reason = suffix.slice(markerIdx + 2).trim();
  return { targets: true, hasMarker: true, reason };
}

/**
 * Return the rule-targeting pragma comment directly above `node`, or null.
 *
 * @param {import('eslint').SourceCode} sourceCode
 * @param {import('estree').Node} node
 * @returns {import('estree').Comment | null}
 */
function getDisablePragmaCommentAbove(sourceCode, node) {
  const comments = sourceCode.getCommentsBefore(node);
  if (!comments || comments.length === 0) return null;
  const last = comments[comments.length - 1];
  if (!last || (last.type !== 'Line' && last.type !== 'Block')) return null;
  if (last.loc && node.loc && last.loc.end.line < node.loc.start.line - 1) return null;
  const verdict = classifyPragma(last.value);
  return verdict.targets ? last : null;
}

/**
 * Walk statement/expression nodes reachable synchronously from `root` WITHOUT
 * crossing into a nested function boundary, invoking `visit` on every
 * CallExpression found.
 *
 * @param {import('estree').Node} root
 * @param {(node: import('estree').Node) => void} visit
 */
function walkSynchronousBody(root, visit) {
  const stack = [root];
  const seen = new Set();
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);

    if (node.type === 'CallExpression') visit(node);

    // Do not descend into nested function boundaries — a call inside a nested
    // closure does not execute synchronously as part of THIS callback invocation.
    if (
      node !== root &&
      (node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression' ||
        node.type === 'FunctionDeclaration')
    ) {
      continue;
    }

    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'loc' || key === 'range') continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item.type === 'string') stack.push(item);
        }
      } else if (value && typeof value.type === 'string') {
        stack.push(value);
      }
    }
  }
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow removeChannel()/unsubscribe() called synchronously inside a .subscribe(status => {...}) callback — causes unbounded recursion via phoenix Channel.leave() re-firing the same callback',
      category: 'Possible Errors',
      recommended: true,
      url: 'https://github.com/rickfelix/EHG_Engineer/blob/main/eslint-rules/no-realtime-teardown-in-subscribe-callback.js',
    },
    messages: {
      noTeardownInCallback:
        '{{method}}() called inside a .subscribe() callback recurses unboundedly (phoenix Channel.leave() re-fires this same callback) -> RangeError: Maximum call stack size exceeded. ' +
        'Null the local channel reference here instead; defer the actual teardown to OUTSIDE the callback. ' +
        'To override: // eslint-disable-next-line no-realtime-teardown-in-subscribe-callback -- <reason>',
      pragmaMissingReason:
        'eslint-disable-next-line no-realtime-teardown-in-subscribe-callback requires a non-empty REASON after `--`. ' +
        'Example: // eslint-disable-next-line no-realtime-teardown-in-subscribe-callback -- channel is a DIFFERENT, unrelated subscription',
    },
    schema: [],
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    const pragmaHandled = new Set();

    return {
      Program() {
        const comments = sourceCode.getAllComments();
        for (const comment of comments) {
          if (comment.type !== 'Line' && comment.type !== 'Block') continue;
          const verdict = classifyPragma(comment.value);
          if (!verdict.targets) continue;

          pragmaHandled.add(comment.range && comment.range[0]);

          if (!verdict.hasMarker) {
            context.report({ loc: comment.loc, messageId: 'noTeardownInCallback', data: { method: 'removeChannel/unsubscribe' } });
          } else if (verdict.reason.length === 0) {
            context.report({ loc: comment.loc, messageId: 'pragmaMissingReason' });
          }
        }
      },

      CallExpression(node) {
        const match = matchSubscribeCall(node);
        if (!match) return;

        walkSynchronousBody(match.callback.body, (callNode) => {
          if (!isTeardownCall(callNode)) return;

          const above = getDisablePragmaCommentAbove(sourceCode, callNode);
          if (above && pragmaHandled.has(above.range && above.range[0])) {
            return;
          }

          context.report({
            node: callNode,
            messageId: 'noTeardownInCallback',
            data: { method: callNode.callee.property.name },
          });
        });
      },
    };
  },
};
