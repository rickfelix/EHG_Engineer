/**
 * The registry of self-gating guards, and what each one needs its caller to supply.
 * SD-LEO-INFRA-PURE-GUARD-UNWIRED-001 FR-1.
 *
 * THE DEFECT CLASS. A pure, correct, well-documented guard that self-gates to PERMISSIVE when its
 * caller supplies no data is indistinguishable from a guard that evaluated and passed. Every one of
 * these documents its no-op as deliberate safety, and each is individually defensible — inverting
 * them to fail closed would trade a silent permit for a silent outage. The defect is not the
 * permissive branch. It is that nothing tells you which branch you got.
 *
 * WHAT THIS REGISTRY IS FOR. Not to re-derive that judgment per guard, but to answer one mechanical
 * question the codebase could not previously answer at all: DOES A PRODUCTION CALLER ACTUALLY
 * SUPPLY THE INPUT THIS GUARD GATES ON? enforceSweepBudget would have failed that on day one — it
 * is Solomon's own per-sweep cost ceiling, it has ten repo-wide occurrences, ZERO executable
 * production callers, and the only thing that looks like one is a PROMPT STRING.
 *
 * A PROMPT STRING IS NOT A CALL SITE. Neither is a test, a doc, or a comment. That distinction is
 * the whole point: a guard referenced only in prose reads as wired to a grep and to a reviewer, and
 * is unreachable at runtime. isProductionCallSite below is where that rule lives.
 *
 * Pure data + pure predicates: no fs, no DB. The test does the reading so this stays inspectable.
 */
'use strict';

/**
 * Paths that can never constitute production wiring.
 * Prompts are listed FIRST because they are the trap: they are executable-adjacent, they mention the
 * function by name, and they are what made enforceSweepBudget look wired for months.
 */
export const NON_PRODUCTION_PATTERNS = Object.freeze([
  /\.test\.(?:js|cjs|mjs|ts)$/i,        // tests
  /[\\/]tests?[\\/]/i,                   // test trees
  /[\\/]__tests__[\\/]/i,
  /\.md$/i,                              // docs
  /[\\/]docs[\\/]/i,
  /[\\/]\.claude[\\/]/i,                 // skills / commands / prompts
  /[\\/]archive[\\/]/i,
  /[\\/]_deprecated[\\/]/i,
  /[\\/]node_modules[\\/]/i,
]);

/** A reference only counts as wiring if it lives in executable production code. */
export function isProductionCallSite(filePath) {
  const p = String(filePath || '');
  if (!p) return false;
  if (!/\.(?:js|cjs|mjs)$/i.test(p)) return false;   // a prompt string in a .md can never be a caller
  return !NON_PRODUCTION_PATTERNS.some((re) => re.test(p));
}

/**
 * Does this call site actually SUPPLY the gated input?
 *
 * Deliberately narrow: it looks for the input name appearing in the same call expression, which is
 * a heuristic and is documented as one. The alternative — "the function is mentioned somewhere in a
 * production file" — is precisely the check that let these six through, because it cannot tell
 * `enforceSweepBudget({ spent })` from `enforceSweepBudget({})`.
 *
 * @param {string} callText the source text of the call expression
 * @param {string} gatedInput the property the guard self-gates on
 */
export function suppliesGatedInput(callText, gatedInput) {
  if (!callText || !gatedInput) return false;
  if (isStubbedInput(callText, gatedInput)) return false;   // supplied-but-inert is not wired
  // Match `spent`, `spent:`, `spent =`, `...spent`, or a shorthand inside an object literal.
  const re = new RegExp(`(^|[^\\w.])${gatedInput}\\s*(?::|,|\\}|\\)|=[^=])`, 'm');
  return re.test(callText);
}

/**
 * Is the input supplied as a HARD-CODED NO-OP — present to a syntactic check, useless at runtime?
 *
 * THE THIRD SHAPE, and it defeated this detector on its first real run. The class has three forms,
 * not one:
 *   1. NO CALLER AT ALL                  — enforceSweepBudget
 *   2. CALLER WIRED, DATA NEVER PRODUCED — capabilityGapTerm (nothing ever sets candidate.capability)
 *   3. INPUT SUPPLIED AS A STUB          — runPreShipGate, called in the PRODUCTION entrypoint as
 *      `runPreShipGate(brief, { getForecast: () => undefined })`, beneath a comment reading
 *      "Real runs inject the Solomon forecast accessor" — which this run is.
 *
 * Shape 3 is the most deceptive: it passes a grep, passes review, and passes any check that asks
 * only "is the input supplied". Treating it as wired would have made this very test report the
 * guard as healthy — a detector for guards that cannot see their subject, unable to see its own.
 */
export function isStubbedInput(callText, gatedInput) {
  if (!callText || !gatedInput) return false;
  // `getForecast: () => undefined`, `: () => null`, `: () => false`, `: () => ({})`, `: null`
  const stub = new RegExp(
    `(^|[^\\w.])${gatedInput}\\s*:\\s*(?:` +
    '\\(\\s*\\)\\s*=>\\s*(?:undefined|null|false|\\{\\s*\\}|\\(\\s*\\{\\s*\\}\\s*\\)|\\[\\s*\\])' +
    '|undefined|null' +
    ')',
    'm',
  );
  return stub.test(callText);
}

/**
 * Every guard is listed with the input it gates on and WHAT THE PERMISSIVE BRANCH MEANS, because
 * a reader deciding whether an unwired entry matters needs the consequence, not just the name.
 *
 * `expectedWired: false` records a guard KNOWN to be unwired today. The wiring test asserts that
 * set can SHRINK but never GROW — a permanently red suite would block every merge and get muted,
 * which is how a loud signal becomes a quiet one. Removing an entry from the unwired set and
 * watching the test go red is the proof that it bites.
 */
export const GUARD_REGISTRY = Object.freeze([
  {
    name: 'enforceSweepBudget',
    module: 'scripts/solomon-advisory.cjs',
    definedAt: 'scripts/solomon-advisory.cjs:263',
    gatedInput: 'spent',
    permissiveMeans: 'withinBudget:true — the per-sweep cost ceiling does not apply',
    expectedWired: false,
    note: 'Solomon\'s own cost ceiling. Ten repo-wide occurrences, ZERO executable production callers; '
      + 'the only caller-shaped reference is a PROMPT STRING at scripts/solomon-startup-check.mjs:187. '
      + 'It has never been able to fire. Two shipped docs assert that it runs — .claude/commands/solomon.md:18 '
      + 'and docs/protocol/coordinator-solomon-comms.md:43 — which makes it active false assurance rather than '
      + 'merely a gap.',
  },
  {
    name: 'createRegistryNarrowedTrustGate',
    module: 'lib/ship/auto-merge.mjs',
    definedAt: 'lib/ship/auto-merge.mjs:76',
    gatedInput: 'registry',
    permissiveMeans: 'the trust gate cannot REVOKE auto-merge for a mis-tagged platform repo',
    expectedWired: false,
    note: 'The only code able to revoke auto-merge on a mis-tagged repo. Its permissive branch is the '
      + 'one that ships an unreviewed merge, so "could not evaluate" and "evaluated and allowed" '
      + 'differ by the entire value of the gate.',
  },
  {
    name: 'runPreShipGate',
    module: 'lib/daily-review/artifact-preship-gate.js',
    definedAt: 'lib/daily-review/artifact-preship-gate.js:27',
    gatedInput: 'getForecast',
    permissiveMeans: 'the pre-ship artifact check passes without a forecast',
    expectedWired: false,
    note: 'The sole caller hard-codes getForecast to return undefined, so the guard is reached but '
      + 'permanently blind — worse than uncalled, because the call site LOOKS like wiring.',
  },
  {
    name: 'enforceGuardrail',
    module: 'lib/eva/guardrail-enforcement-engine.js',
    definedAt: 'lib/eva/guardrail-enforcement-engine.js:49',
    gatedInput: 'guardrails',
    permissiveMeans: 'no guardrail is enforced',
    expectedWired: false,
  },
  {
    name: 'auditSourcingGateConflict',
    module: 'lib/governance/adam-contract-audit.js',
    definedAt: 'lib/governance/adam-contract-audit.js:40',
    gatedInput: 'gates',
    permissiveMeans: 'a sourcing-gate conflict goes unreported',
    expectedWired: false,
  },
  {
    name: 'capabilityGapTerm',
    module: 'lib/adam/rationale-bar.js',
    definedAt: 'lib/adam/rationale-bar.js:284',
    gatedInput: 'capability',
    permissiveMeans: 'the capability-gap term contributes nothing to the rationale bar',
    expectedWired: false,
    note: 'A subtler shape than the others: gaps ARE injected, but NO PRODUCER ever sets '
      + 'candidate.capability, so the term self-gates on data that structurally never arrives. '
      + 'The caller is wired; the data is not.',
  },
]);

/** Guards currently known to be unwired — the baseline that may shrink and must never grow. */
export function knownUnwired(registry = GUARD_REGISTRY) {
  return registry.filter((g) => g.expectedWired === false).map((g) => g.name).sort();
}
