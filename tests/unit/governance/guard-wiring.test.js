/**
 * FR-1 — every self-gating guard must have a PRODUCTION caller that supplies the input it gates on.
 * SD-LEO-INFRA-PURE-GUARD-UNWIRED-001.
 *
 * Generalises PAT-PROCESS-PRODUCER-CONSUMER-INVARIANT-001 (tests/unit/cron/*-wiring.test.js) from
 * "this cron names its dispatcher" to "this guard names a caller that actually feeds it".
 *
 * THE QUESTION IT ANSWERS that no existing check could: not "is this function referenced" — grep
 * answers that, and grep is what made enforceSweepBudget look wired for months — but "does anything
 * executable pass it the data it self-gates on". A PROMPT STRING mentioning the function by name
 * satisfies the first and not the second, and that gap is the entire defect class.
 *
 * Static only: reads source text, runs nothing, touches no DB.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GUARD_REGISTRY, knownUnwired, isProductionCallSite, suppliesGatedInput, isStubbedInput,
} from '../../../lib/governance/guard-wiring-registry.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SCAN_DIRS = ['lib', 'scripts', 'server', 'src'];

/** Every production source file, once. */
function productionFiles() {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === '.worktrees') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (isProductionCallSite(full)) out.push(full);
    }
  };
  for (const d of SCAN_DIRS) walk(path.join(repoRoot, d));
  return out;
}

const FILES = productionFiles();

/**
 * The registry is DATA ABOUT guards, never a caller of them — and it must be excluded explicitly.
 *
 * It caught itself on the first run: a docblock example written to explain the check —
 * "it cannot tell enforceSweepBudget({ spent }) from enforceSweepBudget({})" — was counted as a
 * real wired call site. That is this SD's own defect class, in the detector built to find it: a
 * reference that LOOKS like wiring and executes nothing. Left as a comment rather than quietly
 * patched, because the next person writing a scanner will reach for the same shape.
 */
const REGISTRY_MODULE = 'lib/governance/guard-wiring-registry.js';

/** Call sites of `name` that also supply `gatedInput`, excluding the file that defines it. */
function wiredCallSites(name, gatedInput, defModule) {
  const hits = [];
  // A FIXED WINDOW after the opening paren — deliberately NOT `[\s\S]{0,400}?\)`, which is lazy and
  // stops at the FIRST close paren. For `runPreShipGate(brief, { getForecast: () => undefined })`
  // that first paren belongs to the ARROW FUNCTION, so the captured text was `brief, { getForecast: (`
  // — the stub was truncated away and the call read as wired. Silent truncation producing the
  // permissive answer, in the detector for guards that produce the permissive answer.
  const callRe = new RegExp(`\\b${name}\\s*\\(([\\s\\S]{0,400})`, 'g');
  for (const file of FILES) {
    const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
    if (rel === defModule || rel === REGISTRY_MODULE) continue;   // definition and registry are not callers
    let src = '';
    try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (!src.includes(name)) continue;
    for (const m of src.matchAll(callRe)) {
      if (suppliesGatedInput(m[1], gatedInput)) { hits.push(rel); break; }
    }
  }
  return hits;
}

describe('the registry is well-formed enough to act on', () => {
  it('every guard names a file:line and the exact input it gates on', () => {
    // AC-4. Without the gated input, the check degrades to "is it mentioned" — which is the check
    // that already existed and already failed.
    for (const g of GUARD_REGISTRY) {
      expect(g.definedAt, `${g.name} has no file:line`).toMatch(/:\d+$/);
      expect(g.gatedInput, `${g.name} does not say what it gates on`).toBeTruthy();
      expect(g.permissiveMeans, `${g.name} does not say what its permissive branch MEANS`).toBeTruthy();
    }
  });

  it('…and the file:line RESOLVES — a format check is not a check on the content', () => {
    // Adversarial review found 6 of 7 line numbers wrong, including one I had just added. The
    // assertion above only matched /:\d+$/, so every wrong number passed: a check that validates
    // the SHAPE of an answer and never the answer is this SD's own subject, aimed at this SD's own
    // inventory. Resolve them instead.
    const defRe = (n) => new RegExp(
      `^\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${n}\\b`
      + `|^\\s*(?:export\\s+)?(?:const|let|var)\\s+${n}\\s*=`
      + `|^\\s*${n}\\s*[:(]`,
    );
    for (const g of GUARD_REGISTRY) {
      const [rel, lineStr] = g.definedAt.split(/:(?=\d+$)/);
      const abs = path.join(repoRoot, rel);
      expect(fs.existsSync(abs), `${g.name}: ${rel} does not exist`).toBe(true);
      const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
      const re = defRe(g.name);
      const actual = lines.findIndex((l) => re.test(l)) + 1;
      expect(actual, `${g.name} is not defined anywhere in ${rel}`).toBeGreaterThan(0);
      expect(Number(lineStr), `${g.name}: definedAt says :${lineStr}, actual definition is at :${actual}`).toBe(actual);
    }
  });

  it('scans a real corpus — a zero-file scan would make every assertion below vacuous', () => {
    expect(FILES.length).toBeGreaterThan(500);
  });

  it('THE SCANNER MUST PRODUCE BOTH VERDICTS — FR-3\'s doctrine applied to FR-1\'s own scanner', () => {
    // The gap this closes was found by adversarial review, and it is this SD's own defect class
    // aimed at this SD's own test: replacing the body of wiredCallSites() with `return []` left the
    // ENTIRE suite green. Every other assertion here either tested the pure predicates
    // (suppliesGatedInput, isStubbedInput) or asserted the scanner found NOTHING — and "found
    // nothing" is exactly what a scanner that never opens a file returns. The stated control and
    // the delivered control were at different layers, and the uncovered layer did the work.
    //
    // The fix is FR-3's rule turned on FR-1: a check never shown to produce BOTH of its verdicts
    // cannot be cited. So the scanner is required to FIND a call site that genuinely exists, and to
    // NOT find one for an input that is genuinely absent from that same call. Anchored on a real
    // production wiring rather than on registry membership — my first attempt registered FR-4's
    // consumer as a guard purely so this test would have something to find, which reviewers
    // correctly called a category error: it is a pure fold, its starved branch reports UNKNOWN, and
    // UNKNOWN is explicitly not the permissive answer this registry enumerates.
    const found = wiredCallSites('foldTermResults', 'results', 'lib/governance/inactive-reason-consumer.js');
    expect(found.length, 'the scanner found NO caller for a call site that demonstrably exists').toBeGreaterThan(0);
    expect(found).toContain('lib/adam/rationale-bar.js');

    const notFound = wiredCallSites('foldTermResults', 'spent', 'lib/governance/inactive-reason-consumer.js');
    expect(notFound, 'the scanner reported wiring for an input that call never supplies').toEqual([]);
  });

  it('every required root is actually walked — narrowing SCAN_DIRS must not pass silently', () => {
    // Paired with the above: a scanner can also be defeated by shrinking WHERE it looks. Dropping
    // 'scripts' from SCAN_DIRS is invisible to a "did it find files" check (lib alone clears 500),
    // and scripts/ is where enforceSweepBudget — the SD's motivating guard — is defined.
    //
    // Asserted against a HARD-CODED list, deliberately NOT against SCAN_DIRS: a check that compares
    // the config to itself cannot fail, which is the codebase's own recorded lesson.
    const REQUIRED_ROOTS = ['lib', 'scripts'];
    for (const root of REQUIRED_ROOTS) {
      const n = FILES.filter((f) => path.relative(repoRoot, f).replace(/\\/g, '/').startsWith(`${root}/`)).length;
      expect(n, `no files scanned under ${root}/ — the corpus walk does not cover it`).toBeGreaterThan(0);
    }
  });
});

describe('A PROMPT STRING IS NOT A CALL SITE', () => {
  it('rejects prompts, docs, tests and archives as wiring', () => {
    // AC-3. This is the distinction the whole SD turns on: enforceSweepBudget's only caller-shaped
    // reference is a prompt string, and two shipped docs assert it runs.
    expect(isProductionCallSite('.claude/commands/solomon.md')).toBe(false);
    expect(isProductionCallSite('scripts/solomon-startup-check.mjs')).toBe(true); // the FILE is production…
    expect(isProductionCallSite('docs/protocol/coordinator-solomon-comms.md')).toBe(false);
    expect(isProductionCallSite('tests/unit/foo.test.js')).toBe(false);
    expect(isProductionCallSite('lib/foo/bar.test.js')).toBe(false);
    expect(isProductionCallSite('scripts/archive/old.js')).toBe(false);
    expect(isProductionCallSite('lib/real/module.js')).toBe(true);
  });

  it('…but a mention inside a production file still does not count unless it FEEDS the guard', () => {
    // The subtle half: solomon-startup-check.mjs IS production, yet its reference is a prompt
    // string. suppliesGatedInput is what separates "names it" from "passes it the data".
    expect(suppliesGatedInput('enforceSweepBudget mentioned in a prompt', 'spent')).toBe(false);
    expect(suppliesGatedInput('{ budget, tasks }', 'spent')).toBe(false);
    expect(suppliesGatedInput('{ spent, budget }', 'spent')).toBe(true);
    expect(suppliesGatedInput('{ spent: total }', 'spent')).toBe(true);
  });
});

describe('THE BASELINE — it may shrink, it must never grow', () => {
  it('no guard outside the known-unwired set has lost its wiring', () => {
    // A permanently red suite blocks every merge and gets muted, which is how a loud signal becomes
    // a quiet one. So the KNOWN unwired guards are recorded as a baseline; anything NEW failing is
    // a regression and fails here.
    const baseline = new Set(knownUnwired());
    const regressions = [];
    for (const g of GUARD_REGISTRY) {
      if (baseline.has(g.name)) continue;
      const sites = wiredCallSites(g.name, g.gatedInput, g.module);
      if (sites.length === 0) regressions.push(`${g.name} (needs '${g.gatedInput}') — permissive means: ${g.permissiveMeans}`);
    }
    expect(regressions, `guards lost their wiring:\n  ${regressions.join('\n  ')}`).toEqual([]);
  });

  it('reports the known-unwired population, naming the MISSING INPUT and the consequence', () => {
    // AC-1: the failure must name the missing input, not just the guard. This test does not fail —
    // it is the loud inventory the SD asks for. Shrinking this list is the work; the test above is
    // what stops it growing.
    const unwired = GUARD_REGISTRY.filter((g) => g.expectedWired === false);
    expect(unwired.length).toBeGreaterThan(0);
    for (const g of unwired) {
      const sites = wiredCallSites(g.name, g.gatedInput, g.module);
      // If one of these acquires a real caller, remove it from the baseline — that is the win.
      expect(sites, `${g.name} now HAS a wired caller (${sites.join(', ')}) — remove expectedWired:false from the registry`).toEqual([]);
    }
  });
});

describe('THE THIRD SHAPE — an input supplied as a stub is not wiring', () => {
  it('a hard-coded no-op accessor does not count as supplying the input', () => {
    // Found live, and it defeated this detector on its first real run: the PRODUCTION entrypoint
    // scripts/daily-review-drive-doc.js:45 calls
    //   runPreShipGate(brief, { getForecast: () => undefined })
    // beneath a comment reading "Real runs inject the Solomon forecast accessor" — which that run
    // IS. A check asking only "is the input supplied" reports this guard as healthy forever.
    expect(isStubbedInput('brief, { getForecast: () => undefined }', 'getForecast')).toBe(true);
    expect(suppliesGatedInput('brief, { getForecast: () => undefined }', 'getForecast')).toBe(false);
    for (const stub of ['{ x: () => null }', '{ x: () => false }', '{ x: () => ({}) }', '{ x: null }', '{ x: undefined }']) {
      expect(isStubbedInput(stub, 'x'), stub).toBe(true);
    }
  });

  it('NEGATIVE CONTROL — a REAL accessor still counts as wiring', () => {
    // Without this, "everything is a stub" would satisfy the assertion above and report the whole
    // codebase unwired — the mirror failure, and just as believable.
    expect(isStubbedInput('{ getForecast: solomonForecast }', 'getForecast')).toBe(false);
    expect(suppliesGatedInput('{ getForecast: solomonForecast }', 'getForecast')).toBe(true);
    expect(suppliesGatedInput('{ getForecast: () => fetchReal() }', 'getForecast')).toBe(true);
  });
});

describe('the registry and its patterns cannot be edited into agreement', () => {
  it('the gated input is escaped as DATA — a regex metacharacter must not match everything', () => {
    // `gatedInput: '.*'` reported EVERY call site as supplying it, turning the whole registry green
    // on one plausible typo; `'('` threw a SyntaxError; a pathological value backtracked
    // exponentially. All three land on "this guard looks wired", the answer that ends enquiry.
    expect(suppliesGatedInput('enforceSweepBudget({}) // no data at all', '.*')).toBe(false);
    expect(() => suppliesGatedInput('anything', '(')).not.toThrow();
    // An escaped '.' matches a literal dot and nothing else. My first version of this assertion
    // expected `{ a.b: 1 }` NOT to match 'a.b', which is backwards — escaping is what MAKES it
    // match there, and match only there.
    expect(suppliesGatedInput('{ a.b: 1 }', 'a.b')).toBe(true);
    expect(suppliesGatedInput('{ axb: 1 }', 'a.b')).toBe(false);
    expect(suppliesGatedInput('{ spent, budget }', 'spent')).toBe(true);   // control: still works
  });

  it('the registry is frozen DEEPLY — a shallow freeze leaves the baseline writable', () => {
    // Object.freeze on the array left every entry mutable, so `expectedWired = true` silently shrank
    // the known-unwired baseline this test compares against.
    expect(Object.isFrozen(GUARD_REGISTRY)).toBe(true);
    expect(Object.isFrozen(GUARD_REGISTRY[0])).toBe(true);
    const before = knownUnwired().length;
    expect(() => { GUARD_REGISTRY[0].expectedWired = true; }).toThrow();
    expect(knownUnwired().length).toBe(before);
  });

  it('mocks, fixtures and harness code are not production wiring', () => {
    // 111 files in this tree classified as production before these patterns existed — every one a
    // file whose entire job is to MENTION production functions. A false POSITIVE here reports an
    // unwired guard as healthy, which is the permissive direction.
    for (const p of [
      'lib/mock/firewall.js', 'lib/test-helpers/build.js', 'lib/testing/harness.js',
      'lib/apa/fixtures/sample.mjs', 'src/thing.spec.ts', 'lib/x/__mocks__/y.js',
    ]) {
      expect(isProductionCallSite(p), p).toBe(false);
    }
    // …and TypeScript IS production: excluding it made 25 files invisible, and invisible resolves
    // to "no caller found".
    expect(isProductionCallSite('src/app/gate.ts')).toBe(true);
    expect(isProductionCallSite('src/app/Gate.tsx')).toBe(true);
    expect(isProductionCallSite('lib/real/module.js')).toBe(true);
  });
});

describe('FR-1 TURNED ON THIS SD\'S OWN LAST HOP', () => {
  it('main() actually supplies the scan result to the outcome builder', () => {
    // The unclaimed win. I had written that main()'s single remaining call could not be covered by
    // unit tests "at all", and review corrected it: the mutation class I demonstrated — deleting the
    // argument, omitting it, stubbing it to null — is a STATIC property of the call text, and
    // deciding exactly that is what suppliesGatedInput was built for. FR-1 asks "does a production
    // caller actually supply the input this thing needs"; the last hop of this SD was that question,
    // unanswered, in a file this SD wrote, with the answer sitting in a module this SD shipped.
    //
    // What this does NOT do, so the next reader does not over-read it: it cannot prove the value
    // passed is the RIGHT one — that needs a process-level test running the CLI, which is not cheap
    // because the scan reads the database first. It converts "no signal whatsoever" into "signal for
    // deletion, omission and null-stubbing".
    const src = fs.readFileSync(path.join(repoRoot, 'scripts/adam-opportunity-scan.cjs'), 'utf8');
    // `outcome.entry`, not `outcome`: suppliesGatedInput matches an identifier followed by a
    // supply token (`:` `,` `}` `)` `=`), and a member access puts a `.` there instead. Naming the
    // whole expression is the correct input here — and it only works because gatedInput is escaped
    // as data, which is the C5 fix earning its keep one file over.
    for (const [callee, input] of [['scanOutcome', 'result'], ['appendLedger', 'outcome.entry']]) {
      // The call inside main(), not the definition — skip the `function <name>(` declaration.
      const calls = [...src.matchAll(new RegExp(`(?<!function )\\b${callee}\\s*\\(([\\s\\S]{0,300})`, 'g'))]
        .map((m) => m[1]);
      expect(calls.length, `no call to ${callee} found`).toBeGreaterThan(0);
      expect(
        calls.some((text) => suppliesGatedInput(text, input)),
        `no call to ${callee} supplies '${input}' — the last hop is unwired`,
      ).toBe(true);
    }
  });
});

describe('the detector can actually see wiring — not just its absence', () => {
  it('NEGATIVE CONTROL: a synthetic wired guard is detected', () => {
    // Without this, every assertion above would also pass on a detector that finds NOTHING, which
    // would report the whole codebase as unwired and be believed. A check that can only return one
    // answer is the defect this SD exists to remove.
    const call = 'runPreShipGate({ getForecast, artifacts })';
    expect(suppliesGatedInput(call, 'getForecast')).toBe(true);
    expect(suppliesGatedInput(call, 'spent')).toBe(false);
  });
});
