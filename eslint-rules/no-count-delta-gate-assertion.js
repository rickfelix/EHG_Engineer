/**
 * ESLint Rule: no-count-delta-gate-assertion
 *
 * Flags a raw numeric comparison (subtraction or relational: -, >, >=, <, <=, !==) where at
 * least one operand is a failure-COUNT-lexicon identifier/property (numFailedTests, failed_count,
 * baseline_failed, current_failed, new_failures, or the pattern /(^|_)(failed|failing|failure)_?
 * (count|tests|total)?$/i) AND no identity-set operation (new Set(...), .has(, .filter(...=>...has(,
 * computeIdentityRegression(, extractFailingIds() is present anywhere in the enclosing function.
 *
 * This is the recurring "count-delta gate" anti-pattern: a gate that flags on "failures rose N ->
 * M" rather than checking WHICH specific test/file identities changed. A count-delta gate
 * false-positives on unrelated flaky / CI-secret / shared-DB-drift noise — the SAME failing tests
 * can produce a higher count on a re-run with no change under test.
 *
 * Proven instances: scripts/ci/red-merge-detector.mjs (decide()/detectBaselineRot()),
 * scripts/compare-to-main-snapshot.mjs (BASELINE_REGRESSION), and — the instance this SD converted
 * — scripts/hooks/compare-test-baseline.cjs's original `current_failed - baseline_failed`.
 * SD-LEO-INFRA-COUNT-VS-IDENTITY-GATE-CLASSGUARD-001 — this rule is the structural guard against
 * a 4th instance being (re)introduced.
 *
 * Correct pattern: use lib/gates/identity-diff-gate.cjs's computeIdentityRegression(currentIds,
 * priorFailingIds) — a SET diff of failing identities, not a raw count comparison.
 *
 * NAME-ANCHORED BY DESIGN (not a general count-comparison match): the anti-pattern is semantic,
 * not syntactic — there is no crisp AST marker like a method name. A general "compare two numbers
 * in an if" rule would false-positive on every ordinary threshold check. This rule instead matches
 * by NAME (the failure-count lexicon), mirroring the proven match-by-NAME philosophy of
 * eslint-rules/no-realtime-teardown-in-subscribe-callback.js.
 *
 * Escape hatch (REQUIRES a non-empty REASON after the `--` separator):
 *
 *   // eslint-disable-next-line no-count-delta-gate-assertion -- <REASON>
 *   const delta = failed_count - baseline_failed;
 *
 * @module eslint-rules/no-count-delta-gate-assertion
 */

const RULE_NAME = 'no-count-delta-gate-assertion';
const DELTA_OPERATORS = new Set(['-', '>', '>=', '<', '<=', '!==', '!=']);
const EXACT_LEXICON = new Set([
  'numFailedTests', 'failed_count', 'baseline_failed', 'current_failed', 'new_failures',
  'priorFailedCount', 'failedCount', 'baselineFailed', 'currentFailed', 'newFailures',
]);
const LEXICON_PATTERN = /(^|_)(failed|failing|failure)_?(count|tests|total)?$/i;
const IDENTITY_MARKERS = [/\bnew\s+Set\s*\(/, /\.has\s*\(/, /computeIdentityRegression\s*\(/, /extractFailingIds\s*\(/];

// Detects `eslint-disable-next-line [<prefix>/]no-count-delta-gate-assertion` and captures the
// trailing text on the same line, mirroring the pragma contract established by the sibling rules.
const PRAGMA_DETECT_RE = new RegExp(
  String.raw`eslint-disable-next-line\s+(?:[^,\n]*,\s*)*(?:[\w@-]+(?:[/][\w@-]+)*/)?` +
    RULE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    String.raw`(?:\s*,[^\n]*)?(.*)$`
);

/**
 * Is this identifier/property name a failure-count-lexicon match?
 * @param {string} name
 * @returns {boolean}
 */
function isCountLexiconName(name) {
  if (!name) return false;
  return EXACT_LEXICON.has(name) || LEXICON_PATTERN.test(name);
}

/**
 * Does this operand reference a failure-count-lexicon name — an Identifier, or a
 * MemberExpression whose non-computed property matches?
 * @param {import('estree').Node} node
 * @returns {boolean}
 */
function referencesCountLexicon(node) {
  if (!node) return false;
  if (node.type === 'Identifier') return isCountLexiconName(node.name);
  if (node.type === 'MemberExpression' && !node.computed && node.property && node.property.type === 'Identifier') {
    return isCountLexiconName(node.property.name);
  }
  return false;
}

/**
 * Is this operand an ABSOLUTE-THRESHOLD reference (a numeric literal, or an ALL_CAPS constant
 * identifier) rather than another baseline/prior/current COUNT variable? A relational comparison
 * of a count against an absolute threshold (`failed > 0`, `failureCount < MIN_FAILURES`) is an
 * existence/cap check, NOT the main-vs-PR/expected-vs-actual count-delta anti-pattern — VALIDATION
 * (LEAD phase) explicitly classified this as out of scope (it would create noise if flagged).
 * @param {import('estree').Node} node
 * @returns {boolean}
 */
function isAbsoluteThresholdOperand(node) {
  if (!node) return false;
  if (node.type === 'Literal' && typeof node.value === 'number') return true;
  if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument && node.argument.type === 'Literal') return true;
  if (node.type === 'Identifier' && /^[A-Z][A-Z0-9_]*$/.test(node.name)) return true;
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

const STATEMENT_TYPES = new Set([
  'ExpressionStatement', 'VariableDeclaration', 'IfStatement', 'WhileStatement', 'DoWhileStatement',
  'ForStatement', 'ForInStatement', 'ForOfStatement', 'ReturnStatement', 'SwitchStatement',
  'ThrowStatement', 'BlockStatement', 'FunctionDeclaration',
]);

/**
 * The pragma convention is line-oriented ("disable the violation on the NEXT line"), which is
 * inherently statement-level — a BinaryExpression nested deep inside a `while (...)` condition (or
 * any other sub-expression) does not itself have the comment immediately before IT in the token
 * stream (the preceding token is often `&&`/`(` etc., not the comment). Walk up to the nearest
 * enclosing statement first, then look for the pragma comment above THAT.
 * @param {import('eslint').SourceCode} sourceCode @param {import('estree').Node} node
 */
function getDisablePragmaCommentAbove(sourceCode, node) {
  let stmt = node;
  while (stmt && stmt.parent && !STATEMENT_TYPES.has(stmt.type)) stmt = stmt.parent;
  for (const candidate of [node, stmt]) {
    const comments = sourceCode.getCommentsBefore(candidate);
    if (!comments || comments.length === 0) continue;
    const last = comments[comments.length - 1];
    if (!last || (last.type !== 'Line' && last.type !== 'Block')) continue;
    if (last.loc && candidate.loc && last.loc.end.line < candidate.loc.start.line - 1) continue;
    const verdict = classifyPragma(last.value);
    if (verdict.targets) return last;
  }
  return null;
}

/**
 * Walk up from `node` to the nearest enclosing function (or Program) and return its source text.
 * @param {import('estree').Node} node
 * @param {import('eslint').SourceCode} sourceCode
 * @returns {string}
 */
function enclosingScopeText(node, sourceCode) {
  let cur = node;
  while (cur && cur.type !== 'FunctionDeclaration' && cur.type !== 'FunctionExpression' &&
         cur.type !== 'ArrowFunctionExpression' && cur.type !== 'Program') {
    cur = cur.parent;
  }
  return cur ? sourceCode.getText(cur) : sourceCode.getText();
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a raw count-delta comparison (subtraction/relational) on a failure-count-lexicon identifier without a nearby identity-set diff — gates on WHICH identities changed, not a raw count',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/rickfelix/EHG_Engineer/blob/main/eslint-rules/no-count-delta-gate-assertion.js',
    },
    messages: {
      noCountDeltaGate:
        'Raw count-delta comparison on "{{name}}" without a nearby identity-set diff (new Set/.has/computeIdentityRegression/extractFailingIds) — false-positives on unrelated flaky/CI-secret/shared-DB-drift noise. ' +
        'Use lib/gates/identity-diff-gate.cjs computeIdentityRegression(currentIds, priorFailingIds) instead. ' +
        'To override: // eslint-disable-next-line no-count-delta-gate-assertion -- <reason>',
      pragmaMissingReason:
        'eslint-disable-next-line no-count-delta-gate-assertion requires a non-empty REASON after `--`. ' +
        'Example: // eslint-disable-next-line no-count-delta-gate-assertion -- absolute hard-cap check, no main-vs-PR delta semantics',
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
            context.report({ loc: comment.loc, messageId: 'noCountDeltaGate', data: { name: 'count' } });
          } else if (verdict.reason.length === 0) {
            context.report({ loc: comment.loc, messageId: 'pragmaMissingReason' });
          }
        }
      },

      BinaryExpression(node) {
        if (!DELTA_OPERATORS.has(node.operator)) return;
        const leftMatch = referencesCountLexicon(node.left);
        const rightMatch = referencesCountLexicon(node.right);
        if (!leftMatch && !rightMatch) return;

        // A relational comparison (not subtraction) against an absolute threshold — a numeric
        // literal or an ALL_CAPS constant — is an existence/cap check, not a main-vs-PR delta.
        // Subtraction ('-') is always the delta anti-pattern regardless of the other operand.
        if (node.operator !== '-') {
          const otherOperand = leftMatch ? node.right : node.left;
          if (isAbsoluteThresholdOperand(otherOperand)) return;
        }

        const scopeText = enclosingScopeText(node, sourceCode);
        if (IDENTITY_MARKERS.some((re) => re.test(scopeText))) return;

        const above = getDisablePragmaCommentAbove(sourceCode, node);
        if (above && pragmaHandled.has(above.range && above.range[0])) return;

        const name = leftMatch
          ? (node.left.type === 'Identifier' ? node.left.name : node.left.property.name)
          : (node.right.type === 'Identifier' ? node.right.name : node.right.property.name);

        context.report({ node, messageId: 'noCountDeltaGate', data: { name } });
      },
    };
  },
};
