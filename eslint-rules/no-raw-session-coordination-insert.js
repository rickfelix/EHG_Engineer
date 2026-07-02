/**
 * ESLint Rule: no-raw-session-coordination-insert
 *
 * Flags a raw `<supabase>.from('session_coordination').insert(...)` call site. The canonical
 * choke point for writing session_coordination rows is insertCoordinationRow() in
 * lib/coordinator/dispatch.cjs, which validates the target (assertValidTarget), refuses
 * terminal/unknown SD targets (assertSdDispatchable), and enforces worker-tier dispatch rules
 * (assertWorkerTierAllowed) before inserting. A raw insert bypasses ALL of that.
 *
 * SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-D (FR-3b) — same 3-part class-guard shape as
 * no-count-delta-gate-assertion.js / no-realtime-teardown-in-subscribe-callback.js: an ESLint
 * rule + a driver script (scripts/lint/session-coordination-insert-classguard-lint.mjs) + a
 * dedicated blocking CI workflow. The driver script excludes lib/coordinator/dispatch.cjs (the
 * choke point's own definition) and test/fixture files (which legitimately seed rows directly
 * for setup) from the scan; this rule itself has no file-path awareness.
 *
 * Note: a DB-level advisory (non-blocking) insert-time trigger already covers every existing
 * raw producer regardless of code path (see database/migrations/
 * 20260702_session_coordination_insert_lint.sql) — this rule's job is to stop NEW raw sites
 * from being written, not to retroactively convert everything.
 *
 * Escape hatch (REQUIRES a non-empty REASON after the `--` separator):
 *
 *   // eslint-disable-next-line no-raw-session-coordination-insert -- <REASON>
 *   await supabase.from('session_coordination').insert(row);
 *
 * @module eslint-rules/no-raw-session-coordination-insert
 */

const RULE_NAME = 'no-raw-session-coordination-insert';
const TARGET_TABLE = 'session_coordination';

const PRAGMA_DETECT_RE = new RegExp(
  String.raw`eslint-disable-next-line\s+(?:[^,\n]*,\s*)*(?:[\w@-]+(?:[/][\w@-]+)*/)?` +
    RULE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    String.raw`(?:\s*,[^\n]*)?(.*)$`
);

/**
 * Is this call `X.from('session_coordination')`?
 * @param {import('estree').Node} node
 */
function isFromSessionCoordinationCall(node) {
  if (!node || node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (!callee || callee.type !== 'MemberExpression' || callee.computed) return false;
  if (!callee.property || callee.property.type !== 'Identifier' || callee.property.name !== 'from') return false;
  const arg = node.arguments && node.arguments[0];
  return !!arg && arg.type === 'Literal' && arg.value === TARGET_TABLE;
}

/**
 * Is this call `<fromCall>.insert(...)` where fromCall matches session_coordination?
 * @param {import('estree').Node} node
 */
function isRawInsertOnSessionCoordination(node) {
  if (!node || node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (!callee || callee.type !== 'MemberExpression' || callee.computed) return false;
  if (!callee.property || callee.property.type !== 'Identifier' || callee.property.name !== 'insert') return false;
  return isFromSessionCoordinationCall(callee.object);
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
        'Disallow a raw <supabase>.from(\'session_coordination\').insert(...) call outside the canonical insertCoordinationRow() choke point',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/rickfelix/EHG_Engineer/blob/main/eslint-rules/no-raw-session-coordination-insert.js',
    },
    messages: {
      noRawInsert:
        'Raw .from(\'session_coordination\').insert(...) bypasses the canonical choke point (insertCoordinationRow() in lib/coordinator/dispatch.cjs), which validates the target and enforces dispatch rules. ' +
        'To override: // eslint-disable-next-line no-raw-session-coordination-insert -- <reason>',
      pragmaMissingReason:
        'eslint-disable-next-line no-raw-session-coordination-insert requires a non-empty REASON after `--`. ' +
        'Example: // eslint-disable-next-line no-raw-session-coordination-insert -- test fixture seed, not a real producer',
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
            context.report({ loc: comment.loc, messageId: 'noRawInsert' });
          } else if (verdict.reason.length === 0) {
            context.report({ loc: comment.loc, messageId: 'pragmaMissingReason' });
          }
        }
      },

      CallExpression(node) {
        if (!isRawInsertOnSessionCoordination(node)) return;

        const above = getDisablePragmaCommentAbove(sourceCode, node);
        if (above && pragmaHandled.has(above.range && above.range[0])) return;

        context.report({ node, messageId: 'noRawInsert' });
      },
    };
  },
};
