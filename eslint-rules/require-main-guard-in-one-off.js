/**
 * ESLint Rule: require-main-guard-in-one-off
 *
 * Flags an unconditional top-level entrypoint call (`main()` / `run()`, optionally chained with
 * any of `.then(...)`/`.catch(...)`/`.finally(...)`, or `await main()` / `await run()` -- as a
 * bare expression statement OR as a top-level `const x = await main();` declarator init) that is
 * NOT wrapped in any top-level conditional. An unconditional call at module scope executes on a
 * bare `import()`/`require()` of the file -- no direct invocation needed.
 *
 * SD-FDBK-ENH-578-SCRIPTS-ONE-001. Root incident, 2026-08-21: importing
 * scripts/one-off/backfill-solomon-ledger-decision-by.mjs for ESM/CJS-interop inspection
 * (no intent to run it) executed main() for real against live prod -- 1212
 * solomon_advice_outcome_ledger.decision_by rows mutated, irreversibly, pre-merge. That file's
 * own fix wraps the call in `if (isDirectRun) { main().catch(...) }` where `isDirectRun` is a
 * variable bound to `fileURLToPath(import.meta.url) === process.argv[1]`.
 *
 * DELIBERATELY NARROW (matches this repo's established checker style -- see
 * eslint-rules/no-raw-ismainmodule-comparison.js's own "still narrow, deliberately" note):
 * this rule does NOT attempt data-flow analysis of arbitrary conditionals. Any top-level
 * IfStatement (or other conditional) wrapping the call is sufficient to pass -- the rule
 * does not verify the guard's condition is one of the two known-safe shapes
 * (isMainModule(import.meta.url) or fileURLToPath(import.meta.url)===process.argv[1]).
 * That is intentional: an author who wrote *some* guard, even an imperfect one, has already
 * broken the "executes unconditionally on bare import" failure mode this rule exists to
 * prevent. A wrong-condition guard is a narrower, separate defect class, not this one.
 *
 * Scope of "risky call": specifically `main`/`run` (the established scripts/one-off/*
 * entrypoint-function convention -- confirmed by this SD's own corpus re-measurement), not
 * an unbounded scan for any top-level side effect. A file with no main()/run() call at all
 * (pure exports, or a script with no defined entrypoint function) is never flagged by this
 * rule -- there is nothing here to guard.
 *
 * @module eslint-rules/require-main-guard-in-one-off
 */

const ENTRYPOINT_NAMES = new Set(['main', 'run']);
// SD-FDBK-ENH-578-SCRIPTS-ONE-001 EXEC-TO-PLAN TESTING finding (2026-08-22): a real corpus scan
// found 3 live, service-role-holding, DB-mutating scripts.one-off/* files whose unconditional
// main() executed on bare import while this rule reported "0 ungoverned violations" over them --
// this SD's own defect class, uncaught by the tool built to catch it. Two independent gaps, both
// closed below: a single `.catch` peel missed any LONGER promise chain (`main().then(a).catch(b)`
// resolved to `main().then(a)`, whose callee is a MemberExpression, not the named Identifier), and
// only `Program > ExpressionStatement` was visited, so `const data = await main();` -- a top-level
// VariableDeclaration, never an ExpressionStatement -- was invisible outright.
const CHAIN_METHODS = new Set(['then', 'catch', 'finally']);

/**
 * If `node` is a CallExpression to an Identifier named `main` or `run` -- either directly, or
 * with any chain of `.then(...)`/`.catch(...)`/`.finally(...)` calls layered on top (e.g.
 * `main().then(a).catch(b)`) -- return the INNER, named CallExpression (never a chain wrapper,
 * which has no `.callee.name` of its own). Returns null if `node` doesn't match either shape.
 * @param {import('estree').Node} node
 * @returns {import('estree').Node | null}
 */
function resolveEntrypointCall(node) {
  if (!node || node.type !== 'CallExpression') return null;
  let target = node;
  while (
    target.callee.type === 'MemberExpression' &&
    !target.callee.computed &&
    target.callee.property &&
    target.callee.property.type === 'Identifier' &&
    CHAIN_METHODS.has(target.callee.property.name) &&
    target.callee.object.type === 'CallExpression'
  ) {
    target = target.callee.object;
  }
  if (
    !!target &&
    target.type === 'CallExpression' &&
    target.callee.type === 'Identifier' &&
    ENTRYPOINT_NAMES.has(target.callee.name)
  ) {
    return target;
  }
  return null;
}

/**
 * Given a top-level ExpressionStatement's expression, OR a top-level VariableDeclarator's init
 * expression, resolve the risky entrypoint call -- either directly, or as the argument of a bare
 * top-level `await`. Always returns the INNER named CallExpression (e.g. `main()`, not
 * `main().catch(...)`) so `.callee.name` is reliable.
 * @param {import('estree').Node} expr
 * @returns {import('estree').Node | null}
 */
function findUnconditionalEntrypointCall(expr) {
  const direct = resolveEntrypointCall(expr);
  if (direct) return direct;
  if (expr && expr.type === 'AwaitExpression') {
    return resolveEntrypointCall(expr.argument);
  }
  return null;
}

/**
 * Does a recognized main-guard construct appear anywhere in the file? Either accepted shape
 * is sufficient -- isMainModule(...) call, or fileURLToPath(import.meta.url)===process.argv[1]
 * (either operand order). This is a presence check across the whole file (not scoped to a
 * specific if-test), matching this rule's deliberately narrow, non-dataflow design.
 */
function isMainModuleCall(node) {
  return (
    !!node &&
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'isMainModule'
  );
}

function isFileURLToPathCall(node) {
  return (
    !!node &&
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'fileURLToPath'
  );
}

function isProcessArgv1(node) {
  if (!node || node.type !== 'MemberExpression' || !node.computed) return false;
  if (!node.property || node.property.type !== 'Literal' || node.property.value !== 1) return false;
  const obj = node.object;
  if (!obj || obj.type !== 'MemberExpression' || obj.computed) return false;
  if (!obj.property || obj.property.type !== 'Identifier' || obj.property.name !== 'argv') return false;
  return !!obj.object && obj.object.type === 'Identifier' && obj.object.name === 'process';
}

function isFileURLToPathArgv1Comparison(node) {
  if (!node || node.type !== 'BinaryExpression') return false;
  if (node.operator !== '===' && node.operator !== '==') return false;
  return (
    (isFileURLToPathCall(node.left) && isProcessArgv1(node.right)) ||
    (isFileURLToPathCall(node.right) && isProcessArgv1(node.left))
  );
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a scripts/one-off/*.{mjs,cjs} file with a top-level main()/run() entrypoint call to guard it, so a bare import()/require() cannot execute it',
      category: 'Possible Errors',
      recommended: true,
      url: 'https://github.com/rickfelix/EHG_Engineer/blob/main/eslint-rules/require-main-guard-in-one-off.js',
    },
    messages: {
      missingMainGuard:
        'Unconditional top-level {{name}}() call executes on a bare import()/require() of this file, with no guard. ' +
        'Guard it with isMainModule(import.meta.url) from lib/utils/is-main-module.js (or the equivalent ' +
        'fileURLToPath(import.meta.url)===process.argv[1] comparison) before calling {{name}}().',
    },
    schema: [],
  },

  create(context) {
    let hasRecognizedGuard = false;
    let unconditionalCall = null;

    return {
      CallExpression(node) {
        if (isMainModuleCall(node)) hasRecognizedGuard = true;
      },
      BinaryExpression(node) {
        if (isFileURLToPathArgv1Comparison(node)) hasRecognizedGuard = true;
      },
      'Program > ExpressionStatement'(node) {
        const found = findUnconditionalEntrypointCall(node.expression);
        if (found && !unconditionalCall) unconditionalCall = found;
      },
      'Program > VariableDeclaration'(node) {
        for (const decl of node.declarations) {
          if (!decl.init) continue;
          const found = findUnconditionalEntrypointCall(decl.init);
          if (found && !unconditionalCall) unconditionalCall = found;
        }
      },
      'Program:exit'() {
        if (unconditionalCall && !hasRecognizedGuard) {
          context.report({
            node: unconditionalCall,
            messageId: 'missingMainGuard',
            data: { name: unconditionalCall.callee.name },
          });
        }
      },
    };
  },
};
