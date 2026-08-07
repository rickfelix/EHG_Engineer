/**
 * no-unfenced-verdict-mutation — SD-LEO-INFRA-WRITER-SUB-AGENT-001, FR-4 / FR-4a.
 *
 * THE DEFECT THIS EXISTS FOR. A completed CRITICAL SD fixed ONE verdict-mutating writer; the class
 * survived its own fix, and the predecessor's literal `verdict: x || 'WARNING'` was still alive in
 * two other files. An enumeration cannot prevent that recurrence — a list is evidence about where
 * someone LOOKED, never about where writers CAN exist. So the acceptance for this rule is not
 * "flags M1..Mn"; it is "flags a mutator that appears in no enumeration".
 *
 * WHY A LIST-SHAPED TEST WOULD HAVE BEEN THE SAME BUG ONE LAYER UP: asserting "none of the known
 * mutators mutate" is a receipt for the list. It passes forever while writer #15 lands unfenced.
 * That is the exact failure this SD documents, reproduced in its own anti-recurrence device.
 *
 * TWO PREDICATES, BECAUSE ONE SHAPE IS INVISIBLE TO THE OTHER — and the split is MEASURED, not
 * guessed. Run over 98 files / 142 verdict assignments during PLAN:
 *
 *   P1 alone (a function RECEIVES `results` as a parameter and overwrites `.verdict`)
 *       -> 14 flags, 12 of them FALSE POSITIVES (86%). Authors split across helper functions look
 *          identical to mutators, because WHO CREATED THE OBJECT lives in the caller's file and a
 *          single-file AST cannot see it.
 *   P1 AND P2 (P2 = the enclosing conditional READS `.verdict`, i.e. read-modify-write)
 *       -> exactly 2 flags, ZERO false positives: the two genuine in-place mutators.
 *
 * A rule with an 86% false-positive rate gets disabled within a week — which is how the previous
 * class-guard in this repo died. So the conjunction is the rule, and the cost is stated openly
 * below rather than hidden.
 *
 * PREDICATE B is separate and additive: `verdict: <expr> || <fallback>` as a Property inside an
 * object literal. This is the predecessor's own defect shape and it is an ObjectExpression
 * Property, not an AssignmentExpression — structurally invisible to any assignment-based predicate,
 * no matter how good. Two shapes, two predicates.
 *
 * KNOWN-MISSED, RECORDED RATHER THAN IMPLIED (see also the driver's canary output):
 *   - Spread-rebuild: `return { ...results, verdict: X }` builds a NEW object, so nothing is
 *     "overwritten". Live and idiomatic in this tree (lib/fleet/spawn-control.js:1419).
 *   - Helper-indirected mutation: `applyX(results)` where the overwrite happens a file away.
 *   - Read-modify-write whose condition tests something OTHER than `.verdict` — P2 misses it by
 *     construction. lib/sub-agents/performance.js:239 is a real instance.
 * These are debt, not oversights. The driver prints them so the gap stays visible.
 *
 * ESCAPE HATCH: `// eslint-disable-next-line verdict-chain/no-unfenced-verdict-mutation -- <REASON>`
 * The reason is MANDATORY and enforced by the driver, mirroring the `-- <REASON>` convention used
 * by the other class-guards here. A bare disable is itself a finding: silent exemption is how a
 * fence becomes decorative.
 */

const MESSAGE =
  'Unfenced verdict mutation. Route it through recordVerdictMutation() in lib/sub-agents/verdict-chain.js ' +
  'so the caller verdict survives in metadata.verdict_chain, or add an eslint-disable with a "-- <reason>".';

const MESSAGE_DEFAULT =
  'Unfenced verdict DEFAULT. `verdict: x || FALLBACK` silently promotes a missing verdict — this is the ' +
  'literal defect SD-LEO-INFRA-SUBAGENT-VERDICT-LAUNDERED-001 fixed in one file and left in two others. ' +
  'Pass the verdict through unmodified and let the canonical writer map it.';

/**
 * Is this node a `<obj>.verdict` member expression?
 *
 * Computed access is included: `results['verdict'] = x` is the same write with different syntax,
 * and excluding it left a one-character evasion.
 */
function isVerdictMember(node) {
  if (!node || node.type !== 'MemberExpression') return false;
  if (!node.computed) {
    return node.property?.type === 'Identifier' && node.property.name === 'verdict';
  }
  return node.property?.type === 'Literal' && node.property.value === 'verdict';
}

/** Does this subtree read `.verdict` anywhere? (P2's test) */
function readsVerdict(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return false;
  if (isVerdictMember(node)) return true;
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) if (readsVerdict(c, depth + 1)) return true;
    } else if (child && typeof child.type === 'string') {
      if (readsVerdict(child, depth + 1)) return true;
    }
  }
  return false;
}

/** Names of the enclosing function's parameters — P1's test. */
function enclosingParamNames(ancestors) {
  const names = new Set();
  for (const a of ancestors) {
    if (a.type === 'FunctionDeclaration' || a.type === 'FunctionExpression' || a.type === 'ArrowFunctionExpression') {
      for (const p of a.params || []) {
        if (p.type === 'Identifier') names.add(p.name);
        else if (p.type === 'AssignmentPattern' && p.left?.type === 'Identifier') names.add(p.left.name);
      }
    }
  }
  return names;
}

/**
 * Nearest enclosing conditional, so P2 can inspect what it branches on.
 *
 * SwitchStatement is included and its DISCRIMINANT is the test — `switch (results.verdict) { case
 * 'FAIL': results.verdict = 'PASS' }` is a read-modify-write in every sense that matters, and the
 * first version of this rule walked only IfStatement/ConditionalExpression. A reviewer found the
 * shape live at scripts/execute-subagent.js:186 and lib/.../result-aggregator.js:282 among others.
 */
function enclosingConditionalTest(ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i];
    if (a.type === 'IfStatement' || a.type === 'ConditionalExpression') return a.test;
    if (a.type === 'SwitchStatement') return a.discriminant;
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Verdict mutations in the sub-agent evidence path must be declared via recordVerdictMutation, ' +
        'so the caller verdict is preserved and the mutator is attributed.'
    },
    schema: [],
    messages: { unfenced: MESSAGE, unfencedDefault: MESSAGE_DEFAULT }
  },

  create(context) {
    const filename = context.filename || context.getFilename?.() || '';
    // The seam itself assigns results.verdict — that IS the fence, not a violation of it.
    if (filename.replace(/\\/g, '/').endsWith('lib/sub-agents/verdict-chain.js')) return {};

    return {
      // PREDICATE A: read-modify-write on a parameter-received object (P1 AND P2).
      AssignmentExpression(node) {
        if (!isVerdictMember(node.left)) return;
        const objectNode = node.left.object;
        if (objectNode?.type !== 'Identifier') return;

        const ancestors = context.sourceCode?.getAncestors?.(node) ?? context.getAncestors?.() ?? [];

        // P1: the mutated object arrived as a parameter — an AUTHOR builds its own local object.
        if (!enclosingParamNames(ancestors).has(objectNode.name)) return;

        // PREDICATE A-PRIME — THE STATEMENT-FORM DEFAULT, AND IT IS THE MOST IMPORTANT ONE HERE.
        //   results.verdict = results.verdict || 'WARNING';
        //   results.verdict ||= 'WARNING';
        // This needs NO enclosing conditional, so P2 would never see it, and it is not an
        // ObjectExpression Property, so Predicate B would never see it either. It is also the
        // predecessor SD's literal defect one refactor away — and precisely the refactor an author
        // performs when Predicate B blocks the object-literal form. A fence that teaches its own
        // evasion is worse than no fence, because it converts a visible pattern into a hidden one.
        // Flagged regardless of P2: a string-literal fallback on a verdict IS the laundering
        // signature, exactly as in Predicate B (`?? null` stays absent; `|| 'WARNING'` manufactures).
        const rhs = node.right;
        const isLogicalDefault =
          (node.operator === '||=' || node.operator === '??=')
            ? (rhs?.type === 'Literal' && typeof rhs.value === 'string')
            : (rhs?.type === 'LogicalExpression'
                && (rhs.operator === '||' || rhs.operator === '??')
                && rhs.right?.type === 'Literal'
                && typeof rhs.right.value === 'string');
        if (isLogicalDefault) {
          context.report({ node, messageId: 'unfencedDefault' });
          return;
        }

        // P2: the enclosing conditional reads .verdict — the read-modify-write signature. Without
        // this conjunct the rule is 86% false positives and gets switched off.
        const test = enclosingConditionalTest(ancestors);
        if (!test || !readsVerdict(test)) return;

        context.report({ node, messageId: 'unfenced' });
      },

      // PREDICATE B: `verdict: <expr> || <fallback>` in an object literal. An ObjectExpression
      // Property, invisible to Predicate A by construction — this is the shape that survived the
      // predecessor SD in two files.
      Property(node) {
        if (node.computed) return;
        const key = node.key;
        const keyName = key?.type === 'Identifier' ? key.name : (key?.type === 'Literal' ? key.value : null);
        if (keyName !== 'verdict') return;
        const v = node.value;
        if (v?.type !== 'LogicalExpression') return;
        if (v.operator !== '||' && v.operator !== '??') return;

        // ONLY a STRING-LITERAL fallback is laundering, and the distinction is the point rather
        // than a convenience. `verdict: x ?? null` defaults to UNKNOWN — it preserves the absence,
        // and the gate has explicit handling for a null verdict. `verdict: x || 'WARNING'`
        // MANUFACTURES a value the caller never supplied, and WARNING happens to sit in the gate's
        // ACCEPT set, so absence silently becomes approval. Same syntax, opposite meaning.
        //
        // Measured while building this rule: without this narrowing the predicate flagged
        // scripts/modules/handoff/gates/subagent-evidence-gate.js:395
        // (`verdict: latestByCode.get(norm(r))?.verdict ?? null`), a read-only display struct in the
        // gate's own reporting. That is a false positive, and a rule that cries wolf on the gate it
        // protects is a rule someone deletes.
        const fallback = v.right;
        const isStringLiteralFallback = fallback?.type === 'Literal' && typeof fallback.value === 'string';
        if (!isStringLiteralFallback) return;

        context.report({ node, messageId: 'unfencedDefault' });
      }
    };
  }
};
