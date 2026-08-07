/**
 * ESLint Rule: no-mocked-sut-import
 *
 * Flags a test file that BOTH `vi.mock('<relative-spec>', …)`s a module AND imports a binding from
 * that same specifier. That combination is the signature of STUBBED-WRITER BLINDNESS
 * (PAT-TEST-STUBBED-WRITER-UNVERIFIED-001): the suite asserts against the stub it installed, so the
 * real module's contract is UNVERIFIED no matter what colour the suite reports. The canonical
 * incident was 47 green tests over a production no-op, one of which asserted that the real writer is
 * never reached.
 *
 * SCOPE — RELATIVE SPECIFIERS ONLY, and that limit is the whole reason this rule is usable.
 * Mocking a package or IO boundary (`@supabase/supabase-js`, `node:fs`, global fetch) is legitimate
 * isolation and is NOT flagged, even when the test also imports from it. Measured on this repo: 334
 * of 3082 unit test files mock a local module and sampling showed most are ordinary collaborator
 * isolation — which is why this ships WARN-ONLY behind its own driver rather than as a blocking gate.
 *
 * *** WHAT THIS RULE PROVABLY DOES NOT CATCH — read before trusting it. ***
 * The canonical witness stubbed its writer by DEPENDENCY INJECTION, not `vi.mock`:
 *   tests/unit/coordinator/reconcile-late-verdicts.test.js contains ZERO vi.mock calls and passes
 *   `recordDisposition` in as an option. This rule is structurally blind to that, and
 *   tests/unit/eslint-rules/no-mocked-sut-import.test.js asserts the non-detection on purpose so the
 *   limit stays executable rather than drifting into folklore. The DI class is covered by the
 *   real-callee attestation field, not by this rule. Do not describe this rule as closing the pattern.
 *
 * HEURISTIC, STATED PLAINLY: it flags ANY binding imported from a mocked relative specifier, not only
 * one provably used in an assertion — "used in an assertion" is not decidable from the AST alone.
 * That is why the escape hatch exists and why the rollout is warn-only.
 *
 * KNOWN BLIND SPOTS beyond the DI case above — real, and listed so nobody assumes wider coverage:
 *   - DYNAMIC import('./foo.js') is invisible: only static ImportDeclaration nodes are visited.
 *   - SPECIFIER MISMATCH BY EXTENSION escapes: matching is exact string equality, so
 *     vi.mock('./foo') paired with import { x } from './foo.js' is missed even though Vitest
 *     resolves them to the same module. Widening this needs real resolution, not string munging.
 * Both are untested and unimplemented on purpose — they widen the rule, and widening a heuristic
 * with a 165-finding backlog is a separate decision from shipping it.
 *
 * Same 3-part class-guard shape as no-raw-session-coordination-insert.js: rule + driver script
 * (scripts/lint/no-mocked-sut-import-lint.mjs) + dedicated tests. Deliberately NOT registered in
 * eslint.config.js — this repo's `npm run lint` is not invoked by any CI workflow, so registering
 * it there would enforce nothing. Real enforcement is `npm run lint:mocked-sut-import` and
 * .github/workflows/no-mocked-sut-import-lint.yml, which runs the driver on every PR touching
 * tests/. Without that workflow the driver would execute only inside its own unit test — a
 * detection control that never runs unattended, which for THIS rule would be self-refuting.
 *
 * Escape hatch (REQUIRES a non-empty REASON after the `--` separator):
 *
 *   // eslint-disable-next-line no-mocked-sut-import -- <REASON>
 *   import { thing } from './mocked-module.js';
 *
 * @module eslint-rules/no-mocked-sut-import
 */

const RULE_NAME = 'no-mocked-sut-import';

const PRAGMA_DETECT_RE = new RegExp(
  String.raw`eslint-disable-next-line\s+(?:[^,\n]*,\s*)*(?:[\w@-]+(?:[/][\w@-]+)*/)?` +
    RULE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    String.raw`(?:\s*,[^\n]*)?(.*)$`
);

/** Relative specifiers only — a bare package or node: builtin is a BOUNDARY, never the SUT. */
function isRelativeSpecifier(value) {
  return typeof value === 'string' && (value.startsWith('./') || value.startsWith('../'));
}

/** Is this `vi.mock('<spec>', …)` or `jest.mock('<spec>', …)`? Returns the specifier or null. */
function mockedSpecifierOf(node) {
  if (!node || node.type !== 'CallExpression') return null;
  const callee = node.callee;
  if (!callee || callee.type !== 'MemberExpression' || callee.computed) return null;
  if (!callee.object || callee.object.type !== 'Identifier') return null;
  if (callee.object.name !== 'vi' && callee.object.name !== 'jest') return null;
  if (!callee.property || callee.property.type !== 'Identifier') return null;
  if (callee.property.name !== 'mock' && callee.property.name !== 'doMock') return null;
  const arg = node.arguments && node.arguments[0];
  if (!arg || arg.type !== 'Literal' || typeof arg.value !== 'string') return null;
  return arg.value;
}

function classifyPragma(commentValue) {
  if (!commentValue) return { targets: false };
  const match = commentValue.match(PRAGMA_DETECT_RE);
  if (!match) return { targets: false };
  const suffix = match[1] || '';
  const markerIdx = suffix.indexOf('--');
  if (markerIdx === -1) return { targets: true, hasMarker: false, reason: '' };
  return { targets: true, hasMarker: true, reason: suffix.slice(markerIdx + 2).trim() };
}

function hasDisablePragmaAbove(sourceCode, node) {
  const comments = sourceCode.getCommentsBefore(node);
  if (!comments || comments.length === 0) return null;
  const last = comments[comments.length - 1];
  if (!last || (last.type !== 'Line' && last.type !== 'Block')) return null;
  if (last.loc && node.loc && last.loc.end.line < node.loc.start.line - 1) return null;
  const verdict = classifyPragma(last.value);
  return verdict.targets ? { comment: last, verdict } : null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a test that mocks a relative module and also imports a binding from that same specifier — the suite would be asserting against its own stub',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/rickfelix/EHG_Engineer/blob/main/eslint-rules/no-mocked-sut-import.js',
    },
    messages: {
      mockedSutImport:
        'This file mocks "{{specifier}}" and also imports {{binding}} from it, so any assertion on {{binding}} is describing the stub, not the real module — its contract stays unverified however green the suite is. ' +
        'Either drive the real module (mock only the IO boundary beneath it), or override: // eslint-disable-next-line no-mocked-sut-import -- <reason>',
      pragmaMissingReason:
        'eslint-disable-next-line no-mocked-sut-import requires a non-empty REASON after `--`. ' +
        'Example: // eslint-disable-next-line no-mocked-sut-import -- collaborator isolation; the real contract is covered by <named test>',
    },
    schema: [],
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    /** @type {Set<string>} specifiers passed to vi.mock/jest.mock */
    const mockedSpecs = new Set();
    /** @type {Array<{node: object, specifier: string, binding: string}>} */
    const relativeImports = [];

    return {
      CallExpression(node) {
        const spec = mockedSpecifierOf(node);
        // Record every mocked specifier, relative or not; the relative filter is applied to the
        // IMPORT side so a boundary mock can never pair into a finding.
        if (spec !== null) mockedSpecs.add(spec);
      },

      ImportDeclaration(node) {
        const spec = node.source && node.source.value;
        if (!isRelativeSpecifier(spec)) return;
        if (!node.specifiers || node.specifiers.length === 0) return; // side-effect import binds nothing
        const names = node.specifiers.map((s) => (s.local && s.local.name) || '?');
        relativeImports.push({ node, specifier: spec, binding: names.join(', ') });
      },

      'Program:exit'() {
        for (const entry of relativeImports) {
          if (!mockedSpecs.has(entry.specifier)) continue;

          const pragma = hasDisablePragmaAbove(sourceCode, entry.node);
          if (pragma) {
            // A pragma with no `--` reason is itself the violation — an unexplained suppression on
            // exactly this class of defect is how a blind suite gets waved through.
            if (!pragma.verdict.hasMarker || pragma.verdict.reason.length === 0) {
              context.report({ loc: pragma.comment.loc, messageId: 'pragmaMissingReason' });
            }
            continue;
          }

          context.report({
            node: entry.node,
            messageId: 'mockedSutImport',
            data: { specifier: entry.specifier, binding: entry.binding },
          });
        }
      },
    };
  },
};
