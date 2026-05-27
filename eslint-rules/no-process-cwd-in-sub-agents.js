/**
 * ESLint Rule: no-process-cwd-in-sub-agents
 *
 * Bans `process.cwd()` calls in files under `lib/sub-agents/**`. Sub-agents
 * must resolve their execution repo via `resolveSubAgentRepo` from
 * `lib/sub-agents/resolve-repo.js` so cross-repo SDs route work into the
 * target_application's clone rather than the orchestrator's cwd.
 *
 * SD-LEO-INFRA-FLEET-WIDE-SUB-001 FR-4 — first lint-level enforcement.
 * Generalizes the cross-repo pattern from SD-LEO-INFRA-CROSS-REPO-AWARE-001
 * (DESIGN sub-agent) to the rest of the fleet.
 *
 * Escape hatch (REQUIRES a non-empty REASON after the `--` separator):
 *
 *   // eslint-disable-next-line no-process-cwd-in-sub-agents -- <REASON>
 *   const tempDir = path.join(process.cwd(), '.temp');
 *
 * Behaviour matrix:
 *   - process.cwd() with no pragma → noProcessCwd reported on the call
 *   - process.cwd() with pragma + non-empty REASON → ESLint suppresses naturally
 *   - process.cwd() with pragma but NO `--` marker → noProcessCwd reported on
 *     the comment line (so ESLint's disable-next-line, which covers the call
 *     line below, cannot suppress it)
 *   - process.cwd() with pragma `--` and EMPTY REASON body → pragmaMissingReason
 *     reported on the comment line
 *
 * The pragma matcher accepts an optional plugin prefix (`<scope>/<rule>`) so
 * the rule works whether it's loaded via `--rulesdir`, a flat-config `rules:`
 * block, or a `RuleTester` (which exposes it as `rule-to-test/<name>`).
 *
 * @module eslint-rules/no-process-cwd-in-sub-agents
 */

const RULE_NAME = 'no-process-cwd-in-sub-agents';
const SUB_AGENT_PATH_RE = /[\\/]lib[\\/]sub-agents[\\/]/;

// Detects `eslint-disable-next-line [<prefix>/]no-process-cwd-in-sub-agents`
// and captures the trailing text on the same line. The captured suffix is then
// inspected separately for the `--` REASON marker.
const PRAGMA_DETECT_RE = new RegExp(
  String.raw`eslint-disable-next-line\s+(?:[^,\n]*,\s*)*(?:[\w@-]+(?:[/][\w@-]+)*/)?` +
    RULE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    String.raw`(?:\s*,[^\n]*)?(.*)$`
);

/**
 * Check whether a node is the call expression `process.cwd()`.
 *
 * @param {import('estree').Node} node — AST node to inspect
 * @returns {boolean}
 */
function isProcessCwdCall(node) {
  if (!node || node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (!callee || callee.type !== 'MemberExpression') return false;
  if (callee.computed) return false;
  const obj = callee.object;
  const prop = callee.property;
  if (!obj || !prop) return false;
  if (obj.type !== 'Identifier' || obj.name !== 'process') return false;
  if (prop.type !== 'Identifier' || prop.name !== 'cwd') return false;
  return true;
}

/**
 * Determine whether the filename is under `lib/sub-agents/**`.
 * Handles both POSIX and Windows path separators.
 *
 * @param {string} filename — absolute file path from context.getFilename()
 * @returns {boolean}
 */
function isSubAgentFile(filename) {
  if (!filename || filename === '<input>' || filename === '<text>') return false;
  return SUB_AGENT_PATH_RE.test(filename);
}

/**
 * Classify a pragma comment targeting this rule.
 *
 * @param {string} commentValue — text of the comment (without `//` or `/*` prefix)
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

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow process.cwd() in lib/sub-agents/** — use resolveSubAgentRepo for cross-repo correctness',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/rickfelix/EHG_Engineer/blob/main/lib/sub-agents/resolve-repo.js',
    },
    messages: {
      noProcessCwd:
        'Use resolveSubAgentRepo from lib/sub-agents/resolve-repo.js instead of process.cwd(). ' +
        'To override, add: // eslint-disable-next-line no-process-cwd-in-sub-agents -- <reason>',
      pragmaMissingReason:
        'eslint-disable-next-line no-process-cwd-in-sub-agents requires a non-empty REASON after `--`. ' +
        'Example: // eslint-disable-next-line no-process-cwd-in-sub-agents -- ENGINEER_ROOT required for migration temp dir',
    },
    schema: [],
  },

  create(context) {
    const filename = context.getFilename();
    if (!isSubAgentFile(filename)) {
      return {};
    }
    const sourceCode = context.sourceCode || context.getSourceCode();

    // Index of comment locations that have already produced a diagnostic. Used
    // to suppress duplicate reporting from the CallExpression visitor for
    // pragma-targeted cases (the Program visitor handles those upfront).
    const pragmaHandled = new Set();

    return {
      Program() {
        // Pre-scan all comments. For each pragma targeting this rule, classify
        // its REASON and report directly on the comment line. Reporting on the
        // comment (line N) — not on the call below it (line N+1) — works
        // around ESLint's native disable-next-line suppression which only
        // covers line N+1.
        const comments = sourceCode.getAllComments();
        for (const comment of comments) {
          if (comment.type !== 'Line' && comment.type !== 'Block') continue;
          const verdict = classifyPragma(comment.value);
          if (!verdict.targets) continue;

          // Mark this comment so the CallExpression visitor below skips its
          // suppressed call site (we've already emitted a diagnostic).
          pragmaHandled.add(comment.range && comment.range[0]);

          if (!verdict.hasMarker) {
            // Pragma without -- REASON marker: bare suppression attempt.
            context.report({ loc: comment.loc, messageId: 'noProcessCwd' });
          } else if (verdict.reason.length === 0) {
            // Pragma with -- but no REASON body.
            context.report({ loc: comment.loc, messageId: 'pragmaMissingReason' });
          }
          // else: valid pragma — ESLint suppresses naturally; nothing to do.
        }
      },

      CallExpression(node) {
        if (!isProcessCwdCall(node)) return;

        // If a pragma comment is directly above and targets this rule, the
        // Program visitor already handled it (either passed-through valid
        // suppression or emitted a comment-line diagnostic). Skip to avoid
        // double-reporting at the call site (which ESLint may suppress anyway).
        const above = getDisablePragmaCommentAbove(sourceCode, node);
        if (above && pragmaHandled.has(above.range && above.range[0])) {
          return;
        }

        context.report({ node, messageId: 'noProcessCwd' });
      },
    };
  },
};

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
