/**
 * ESLint Rule: no-echoed-session-coordination-target
 *
 * Flags a `target_session:` object property whose VALUE is an echoed field from a prior
 * session_coordination row (e.g. `row.target_session`, `msg.target_session`,
 * `row.sender_session`) rather than a fresh call to one of the identity resolvers
 * (getActiveAdamId / getActiveSolomonId / getActiveCoordinatorId / resolvePeerTarget /
 * resolveCoordinatorId / resolveCoordinatorIdSafe).
 *
 * SD-LEO-INFRA-SESSION-COORDINATION-LANE-001 (clause (a) of the Solomon session_coordination
 * delivery-contract advisory, session_coordination row 09189ed9): "role-addressed sends
 * resolve ONLY through the identity resolvers — raw session-id targeting for role mail
 * becomes a lint error, never session-guessed." An echoed row field is a specific,
 * mechanically-detectable instance of session-guessing: the ORIGINAL row's target may have
 * gone stale (the role holder re-registered under a new session) by the time a later insert
 * echoes that field back as its own target.
 *
 * This rule is intentionally narrow (AST pattern match on known echo property names, not a
 * general data-flow analysis) — mirrors no-raw-session-coordination-insert.js's own pragmatic
 * approach. It accepts false negatives (a differently-shaped echo it doesn't recognize) over
 * false positives (flagging a legitimate resolver-sourced or worker-addressed value).
 *
 * Escape hatch (REQUIRES a non-empty REASON after the `--` separator):
 *
 *   // eslint-disable-next-line no-echoed-session-coordination-target -- <REASON>
 *   await insertCoordinationRow(supabase, { target_session: row.target_session, ... });
 *
 * @module eslint-rules/no-echoed-session-coordination-target
 */

const RULE_NAME = 'no-echoed-session-coordination-target';
const TARGET_PROPERTY = 'target_session';
const ECHO_PROPERTY_NAMES = new Set(['target_session', 'sender_session']);

const PRAGMA_DETECT_RE = new RegExp(
  String.raw`eslint-disable-next-line\s+(?:[^,\n]*,\s*)*(?:[\w@-]+(?:[/][\w@-]+)*/)?` +
    RULE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    String.raw`(?:\s*,[^\n]*)?(.*)$`
);

/**
 * Is `node` a `target_session: <value>` Property in an ObjectExpression, where <value> is a
 * MemberExpression echoing a known session_coordination target/sender field?
 * @param {import('estree').Node} node
 */
function isEchoedTargetProperty(node) {
  if (!node || node.type !== 'Property') return false;
  const key = node.key;
  const keyName = key && (key.type === 'Identifier' ? key.name : key.type === 'Literal' ? key.value : null);
  if (keyName !== TARGET_PROPERTY) return false;

  const value = node.value;
  if (!value || value.type !== 'MemberExpression' || value.computed) return false;
  const prop = value.property;
  if (!prop || prop.type !== 'Identifier') return false;
  return ECHO_PROPERTY_NAMES.has(prop.name);
}

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
  'ExpressionStatement', 'VariableDeclaration', 'IfStatement', 'ReturnStatement',
  'AwaitExpression', 'BlockStatement',
]);

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

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a target_session: value echoed from a prior session_coordination row field instead of a fresh identity-resolver call',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/rickfelix/EHG_Engineer/blob/main/eslint-rules/no-echoed-session-coordination-target.js',
    },
    messages: {
      noEchoedTarget:
        'target_session sourced from an echoed row field ({{propName}}) may be stale by the time this insert fires — re-resolve via getActiveAdamId/getActiveSolomonId/getActiveCoordinatorId instead of echoing a prior row. ' +
        'To override: // eslint-disable-next-line no-echoed-session-coordination-target -- <reason>',
      pragmaMissingReason:
        'eslint-disable-next-line no-echoed-session-coordination-target requires a non-empty REASON after `--`. ' +
        'Example: // eslint-disable-next-line no-echoed-session-coordination-target -- worker-addressed, not role mail',
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
            context.report({ loc: comment.loc, messageId: 'noEchoedTarget', data: { propName: '' } });
          } else if (verdict.reason.length === 0) {
            context.report({ loc: comment.loc, messageId: 'pragmaMissingReason' });
          }
        }
      },

      Property(node) {
        if (!isEchoedTargetProperty(node)) return;

        const above = getDisablePragmaCommentAbove(sourceCode, node);
        if (above && pragmaHandled.has(above.range && above.range[0])) return;

        context.report({
          node,
          messageId: 'noEchoedTarget',
          data: { propName: node.value.property.name },
        });
      },
    };
  },
};
