/**
 * ESLint Rule: no-raw-ismainmodule-comparison
 *
 * Flags the raw, Windows-broken direct-execution guard comparison:
 * `import.meta.url === \`file://${process.argv[1]}\`` (or the string-concatenation
 * variant `import.meta.url === 'file://' + process.argv[1]`, either operand order).
 * On Windows, `process.argv[1]` is a backslash path (e.g. `C:\foo\bar.mjs`) while
 * `import.meta.url` is a proper `file:///C:/foo/bar.mjs` URL, so the raw string
 * comparison NEVER matches — every one of the ~20+ instances of this pattern
 * silently no-ops the direct-execution guard on Windows.
 *
 * Proven instance count: 21 live files (SD-LEO-INFRA-ISMAINMODULE-WINDOWS-GUARD-
 * CLASSFIX-001, converted by sibling child -A to `isMainModule(import.meta.url)`
 * from `lib/utils/is-main-module.js`). SD-LEO-INFRA-ISMAINMODULE-WINDOWS-GUARD-
 * CLASSFIX-001-B — this rule is the structural guard against a 21st (re)instance,
 * mirroring the proven shape of eslint-rules/no-count-delta-gate-assertion.js and
 * eslint-rules/no-realtime-teardown-in-subscribe-callback.js.
 *
 * Correct pattern: `isMainModule(import.meta.url)` (lib/utils/is-main-module.js).
 *
 * Deliberately NARROW by design: only the bare `process.argv[1]` MemberExpression
 * is matched, not a wrapped/transformed variant (`.replace(...)`, `new URL(...)`) —
 * those are structurally different, unproven-instance shapes out of this SD's scope
 * (matches the precision philosophy of the sibling rules over broad matching that
 * risks false positives).
 *
 * Escape hatch (REQUIRES a non-empty REASON after the `--` separator):
 *
 *   // eslint-disable-next-line no-raw-ismainmodule-comparison -- <REASON>
 *   if (import.meta.url === `file://${process.argv[1]}`) { ... }
 *
 * @module eslint-rules/no-raw-ismainmodule-comparison
 */

const RULE_NAME = 'no-raw-ismainmodule-comparison';
const COMPARISON_OPERATORS = new Set(['===', '==']);

// Detects `eslint-disable-next-line [<prefix>/]no-raw-ismainmodule-comparison` and captures
// the trailing text on the same line, mirroring the pragma contract established by the sibling
// rules (no-count-delta-gate-assertion.js / no-realtime-teardown-in-subscribe-callback.js).
const PRAGMA_DETECT_RE = new RegExp(
  String.raw`eslint-disable-next-line\s+(?:[^,\n]*,\s*)*(?:[\w@-]+(?:[/][\w@-]+)*/)?` +
    RULE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    String.raw`(?:\s*,[^\n]*)?(.*)$`
);

/**
 * Is this node `import.meta.url` — a MemberExpression `.url` on the `import.meta` MetaProperty?
 * @param {import('estree').Node} node
 * @returns {boolean}
 */
function isImportMetaUrl(node) {
  if (!node || node.type !== 'MemberExpression' || node.computed) return false;
  if (!node.property || node.property.type !== 'Identifier' || node.property.name !== 'url') return false;
  const obj = node.object;
  return !!obj && obj.type === 'MetaProperty' && obj.meta && obj.meta.name === 'import' && obj.property && obj.property.name === 'meta';
}

/**
 * Is this node the bare `process.argv[1]` MemberExpression?
 * @param {import('estree').Node} node
 * @returns {boolean}
 */
function isProcessArgv1(node) {
  if (!node || node.type !== 'MemberExpression' || !node.computed) return false;
  if (!node.property || node.property.type !== 'Literal' || node.property.value !== 1) return false;
  const obj = node.object;
  if (!obj || obj.type !== 'MemberExpression' || obj.computed) return false;
  if (!obj.property || obj.property.type !== 'Identifier' || obj.property.name !== 'argv') return false;
  return !!obj.object && obj.object.type === 'Identifier' && obj.object.name === 'process';
}

/**
 * Is this node's cooked/raw text exactly the literal `file://`?
 * @param {import('estree').Node} node
 * @returns {boolean}
 */
function isFileUrlLiteral(node) {
  return !!node && node.type === 'Literal' && node.value === 'file://';
}

/**
 * Is this node the banned `file://` + `process.argv[1]` construction — a TemplateLiteral
 * (`` `file://${process.argv[1]}` ``) or a `+` string concatenation (`'file://' + process.argv[1]`)?
 * @param {import('estree').Node} node
 * @returns {boolean}
 */
function isFileUrlArgv1Expression(node) {
  if (!node) return false;
  if (node.type === 'TemplateLiteral') {
    if (node.expressions.length !== 1 || node.quasis.length !== 2) return false;
    const head = node.quasis[0] && node.quasis[0].value && node.quasis[0].value.cooked;
    const tail = node.quasis[1] && node.quasis[1].value && node.quasis[1].value.cooked;
    if (head !== 'file://' || tail !== '') return false;
    return isProcessArgv1(node.expressions[0]);
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    return (isFileUrlLiteral(node.left) && isProcessArgv1(node.right)) ||
           (isFileUrlLiteral(node.right) && isProcessArgv1(node.left));
  }
  return false;
}

/**
 * Classify a pragma comment targeting this rule.
 * @param {string} commentValue
 * @returns {{ targets: false } | { targets: true, hasMarker: boolean, reason: string }}
 */
function classifyPragma(commentValue) {
  if (!commentValue) return { targets: false };
  const match = commentValue.match(PRAGMA_DETECT_RE);
  if (!match) return { targets: false };
  const suffix = match[1] || '';
  const markerIdx = suffix.indexOf('--');
  if (markerIdx === -1) return { targets: true, hasMarker: false, reason: '' };
  const reason = suffix.slice(markerIdx + 2).trim();
  return { targets: true, hasMarker: true, reason };
}

/**
 * Return the rule-targeting pragma comment directly above `node`, or null.
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

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow the raw, Windows-broken `import.meta.url === `file://${process.argv[1]}`` direct-execution guard comparison — use isMainModule(import.meta.url) instead',
      category: 'Possible Errors',
      recommended: true,
      url: 'https://github.com/rickfelix/EHG_Engineer/blob/main/eslint-rules/no-raw-ismainmodule-comparison.js',
    },
    messages: {
      noRawComparison:
        'Raw `import.meta.url === file://+argv[1]` comparison is Windows-broken (argv[1] is a backslash path, import.meta.url is a proper file:// URL — they never match). ' +
        'Use isMainModule(import.meta.url) from lib/utils/is-main-module.js instead. ' +
        'To override: // eslint-disable-next-line no-raw-ismainmodule-comparison -- <reason>',
      pragmaMissingReason:
        'eslint-disable-next-line no-raw-ismainmodule-comparison requires a non-empty REASON after `--`. ' +
        'Example: // eslint-disable-next-line no-raw-ismainmodule-comparison -- deliberately testing the broken legacy behavior',
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
            context.report({ loc: comment.loc, messageId: 'noRawComparison' });
          } else if (verdict.reason.length === 0) {
            context.report({ loc: comment.loc, messageId: 'pragmaMissingReason' });
          }
        }
      },

      BinaryExpression(node) {
        if (!COMPARISON_OPERATORS.has(node.operator)) return;

        const leftIsMeta = isImportMetaUrl(node.left);
        const rightIsMeta = isImportMetaUrl(node.right);
        if (!leftIsMeta && !rightIsMeta) return;

        const other = leftIsMeta ? node.right : node.left;
        if (!isFileUrlArgv1Expression(other)) return;

        const above = getDisablePragmaCommentAbove(sourceCode, node);
        if (above && pragmaHandled.has(above.range && above.range[0])) return;

        context.report({ node, messageId: 'noRawComparison' });
      },
    };
  },
};
