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

  it('scans a real corpus — a zero-file scan would make every assertion below vacuous', () => {
    expect(FILES.length).toBeGreaterThan(500);
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
