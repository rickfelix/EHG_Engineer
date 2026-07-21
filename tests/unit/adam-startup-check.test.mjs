// Tests for scripts/adam-startup-check.mjs
// SD-LEO-INFRA-ENABLE-ADAM-GOVERNANCE-001 (FR-1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADAM_LOOPS,
  RESPONSIBILITIES,
  parseArmedSet,
  loopStatus,
  renderResponsibilities,
  renderLoops,
  buildReport,
  ROLE_CONTEXT_DOC,
  parseDurableDutyMarkers,
  missingDurableDuties,
  renderContractParity,
  renderFreshness,
  ADAM_CRITICAL_PATHS,
} from '../../scripts/adam-startup-check.mjs';
import { CRITICAL_PROTOCOL_FILES } from '../../lib/governance/checkout-freshness.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('ADAM_LOOPS has the 15 expected tick loops with the expected keys', () => {
  // self-adherence added by SD-LEO-INFRA-AUTOMATED-RECURRING-ADAM-001 (child E);
  // belt-countdown added by SD-LEO-INFRA-ADAM-MACHINERY-CONSUMER-001 (FR2 — durable contract duty);
  // doc-drift + github-assessment added by SD-LEO-INFRA-REGISTER-TWO-EVERY-001 (every-3-day propose-only duties);
  // board-reconcile added by SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-B (durable contract duty);
  // heartbeat-sms (was heartbeat-email, QF-20260702-433) + morning-brief-sms added by QF-20260719-343
  //   (contract c3/c4, leo_protocol_sections id=601, chairman-directed 2026-07-19);
  // quiet-tick added by SD-LEO-INFRA-TOKEN-BURN-AUTOPILOT-001 (folds inbox-monitor/belt-countdown/offer-help);
  // coordinator-health added by SD-LEO-INFRA-ADAM-COORDINATOR-HEALTH-001 (3-KPI coordinator oversight probe);
  // self-score + solomon-health added by QF-20260719-825 (chairman-directed deliberate-check cadence)
  //   -- this assertion was stale at 12 for 2 days until QF-20260721-518 caught + fixed it.
  // decision-driving-sweep added by QF-20260721-010 (durable contract duty — DECISION-DRIVING-SWEEP DUTY (durable),
  //   leo_protocol_sections id=601; was session-only + undetectable by missingDurableDuties until named).
  assert.equal(ADAM_LOOPS.length, 15);
  assert.deepEqual(ADAM_LOOPS.map((l) => l.key), ['quiet-tick', 'governance-scan', 'inbox-monitor', 'offer-help', 'self-adherence', 'coordinator-health', 'belt-countdown', 'doc-drift', 'github-assessment', 'board-reconcile', 'self-score', 'solomon-health', 'heartbeat-sms', 'morning-brief-sms', 'decision-driving-sweep']);
  ADAM_LOOPS.forEach((l) => {
    assert.ok(l.cron && typeof l.cron === 'string', `${l.key} has a cron`);
    assert.ok(l.prompt && typeof l.prompt === 'string', `${l.key} has a prompt`);
  });
});

// SD-LEO-INFRA-ADAM-MACHINERY-CONSUMER-001 (FR2): the consumer-side invariant for the loop
// registry — every DURABLE contract-named duty in CLAUDE_ADAM.md must exist in ADAM_LOOPS, or
// it silently dies every Adam session (the belt-countdown failure mode).
test('FR2: every CLAUDE_ADAM.md durable duty marker is present in ADAM_LOOPS (contract↔tooling parity)', () => {
  const contract = readFileSync(resolve(REPO_ROOT, 'CLAUDE_ADAM.md'), 'utf-8');
  const duties = parseDurableDutyMarkers(contract);
  assert.ok(duties.includes('belt-countdown'), 'contract declares the BELT COUNTDOWN DUTY (durable)');
  const missing = missingDurableDuties(contract, ADAM_LOOPS);
  assert.deepEqual(missing, [], `durable duties missing from ADAM_LOOPS: ${missing.join(', ')}`);
});

test('FR2: parseDurableDutyMarkers slugs the marker name and EXCLUDES non-durable/temporary duties', () => {
  const md = [
    '**BELT COUNTDOWN DUTY (durable)**: post a one-liner.',
    '**SOME TEMP WATCHER**: a session-scoped watcher (NOT a durable duty).',
    '**AUTONOMY COMPLETION WATCHER**: temporary, .PUSHED lifecycle (no durable marker).',
  ].join('\n');
  assert.deepEqual(parseDurableDutyMarkers(md), ['belt-countdown']);
  // A durable duty with no ADAM_LOOPS entry must be reported missing (the guard's teeth).
  assert.deepEqual(missingDurableDuties('**GHOST DUTY (durable)**', ADAM_LOOPS), ['ghost']);
});

// SD-LEO-INFRA-ADAM-MACHINERY-CONSUMER-001 (review fix): the matcher must be FORGIVING so a
// stylistic variation never SILENTLY drops a durable duty from enforcement (a false negative =
// an unenforced duty). Hyphenated names, mixed/upper case, and uppercase DURABLE all match.
test('FR2: parseDurableDutyMarkers is forgiving (hyphens, mixed case, UPPER DURABLE) — no silent false negatives', () => {
  assert.deepEqual(parseDurableDutyMarkers('**Full-Inbox Sweep DUTY (durable)**'), ['full-inbox-sweep']);
  assert.deepEqual(parseDurableDutyMarkers('**Belt Countdown DUTY (DURABLE)**'), ['belt-countdown']);
  assert.deepEqual(parseDurableDutyMarkers('**FOO-BAR DUTY ( durable )**'), ['foo-bar']);
  // a plain bold heading without the " DUTY (durable)" token is NOT a durable duty
  assert.deepEqual(parseDurableDutyMarkers('**SOME HEADING**'), []);
});

// FR2: the parity invariant has RUNTIME teeth — renderContractParity surfaces drift at /adam
// startup (fail-open), not only in CI.
test('FR2: renderContractParity reports CLEAN for the real contract and is fail-open', () => {
  const out = renderContractParity(REPO_ROOT);
  assert.match(out, /CONTRACT↔TOOLING PARITY/);
  assert.match(out, /✅ all durable .* duties present/);
  assert.doesNotThrow(() => renderContractParity('/no/such/path'));
  assert.match(renderContractParity('/no/such/path'), /fail-open/);
});

test('FR2: buildReport includes the contract-parity section', () => {
  const report = buildReport([], {}, REPO_ROOT);
  assert.match(report, /CONTRACT↔TOOLING PARITY/);
});

test('FR2: belt-countdown is an agent-prompt 15-min tick (durable, survives session restart)', () => {
  const belt = ADAM_LOOPS.find((l) => l.key === 'belt-countdown');
  assert.ok(belt, 'belt-countdown loop exists');
  assert.equal(belt.script, null, 'agent-prompt tick (no script)');
  assert.equal(belt.cron, '*/15 * * * *', 'every 15 minutes');
  assert.match(belt.prompt, /belt-countdown/i);
  assert.match(belt.prompt, /Eastern time|ET/i);
});

test('self-adherence loop runs the recurring self-adherence review (propose-only)', () => {
  const sa = ADAM_LOOPS.find((l) => l.key === 'self-adherence');
  assert.ok(sa, 'self-adherence loop exists');
  assert.equal(sa.script, 'adam-self-adherence-review.mjs');
  assert.ok(sa.prompt.includes('adam-self-adherence-review'), 'runs the review script');
});

test('governance-scan loop runs the flag-gated opportunity-scan', () => {
  const gov = ADAM_LOOPS.find((l) => l.key === 'governance-scan');
  assert.match(gov.prompt, /adam-opportunity-scan\.cjs --scan/);
  assert.equal(gov.cron, '0 13 * * *'); // daily
});

test('parseArmedSet reads --armed arg, --armed= form, and ADAM_ARMED_CRONS env', () => {
  assert.equal(parseArmedSet(['--armed', 'a,b'], {}).provided, true);
  assert.ok(parseArmedSet(['--armed', 'a,b'], {}).set.has('a'));
  assert.ok(parseArmedSet(['--armed=x'], {}).set.has('x'));
  assert.ok(parseArmedSet([], { ADAM_ARMED_CRONS: 'y' }).set.has('y'));
  assert.equal(parseArmedSet([], {}).provided, false); // no set → unverified path
});

test('loopStatus: armed on key, prompt or script match, MISSING when provided-but-absent, unverified otherwise', () => {
  const gov = ADAM_LOOPS.find((l) => l.key === 'governance-scan');
  assert.equal(loopStatus(gov, { provided: false, set: new Set() }), 'unverified');
  assert.equal(loopStatus(gov, { provided: true, set: new Set([gov.key]) }), 'armed');
  assert.equal(loopStatus(gov, { provided: true, set: new Set([gov.prompt]) }), 'armed');
  assert.equal(loopStatus(gov, { provided: true, set: new Set([gov.script]) }), 'armed');
  assert.equal(loopStatus(gov, { provided: true, set: new Set(['something-else']) }), 'MISSING');
  // offer-help has script=null and a comma-bearing prompt → the KEY is its only viable
  // CSV token (a comma-split prompt can never reassemble → would be MISSING forever and
  // re-armed as a duplicate every /adam startup)
  const offer = ADAM_LOOPS.find((l) => l.key === 'offer-help');
  assert.equal(offer.script, null);
  assert.ok(offer.prompt.includes(','), 'offer-help prompt contains commas (the CSV trap this guards)');
  assert.equal(loopStatus(offer, { provided: true, set: new Set(['x']) }), 'MISSING');
  assert.equal(loopStatus(offer, { provided: true, set: new Set([offer.key]) }), 'armed');
  assert.equal(loopStatus(offer, { provided: true, set: new Set([offer.prompt]) }), 'armed');
});

test('end-to-end CSV verdict: --armed with all loop KEYS → nothing to arm (no duplicate re-arm)', () => {
  const armed = parseArmedSet(['--armed', ADAM_LOOPS.map((l) => l.key).join(',')], {});
  const out = renderLoops(armed);
  assert.match(out, new RegExp(`All ${ADAM_LOOPS.length} Adam tick loops armed\\. Nothing to arm\\.`));
  assert.doesNotMatch(out, /MISSING/);
});

test('renderLoops emits CronCreate specs for the not-yet-armed loops (idempotent note)', () => {
  const out = renderLoops(parseArmedSet([], {}));
  assert.match(out, new RegExp(`ADAM RECURRING TICK \\(${ADAM_LOOPS.length} loops\\)`));
  assert.match(out, /CronCreate\(\{ cron: "0 13 \* \* \*"/); // governance-scan spec emitted
  assert.match(out, /idempotent/i);
});

test('renderLoops reports "Nothing to arm" when all loops are in the armed set', () => {
  const armedSet = new Set(ADAM_LOOPS.map((l) => l.prompt));
  const out = renderLoops({ provided: true, set: armedSet });
  assert.match(out, new RegExp(`All ${ADAM_LOOPS.length} Adam tick loops armed\\. Nothing to arm\\.`));
});

test('renderResponsibilities is fail-open (bad repoRoot → fallback, never throws)', () => {
  assert.doesNotThrow(() => renderResponsibilities('/no/such/path'));
  const out = renderResponsibilities('/no/such/path');
  assert.match(out, /ADAM ROLE/);
  assert.match(out, new RegExp(ROLE_CONTEXT_DOC));
});

test('buildReport composes responsibilities + the tick loops', () => {
  const report = buildReport([], {});
  assert.match(report, /ADAM ROLE/);
  assert.match(report, /ADAM RECURRING TICK/);
  assert.ok(RESPONSIBILITIES.length >= 3);
});

// SD-LEO-INFRA-SINGLETON-STALE-TREE-STALENESS-GAUGE-001 (FR-2)
test('ADAM_CRITICAL_PATHS extends the base protocol files with the Adam contract + tick script', () => {
  CRITICAL_PROTOCOL_FILES.forEach((p) => assert.ok(ADAM_CRITICAL_PATHS.includes(p), `missing base path ${p}`));
  assert.ok(ADAM_CRITICAL_PATHS.includes(ROLE_CONTEXT_DOC));
  assert.ok(ADAM_CRITICAL_PATHS.includes('scripts/adam-quiet-tick.mjs'));
});

test('renderFreshness is fail-open and reports a CHECKOUT FRESHNESS section', () => {
  assert.doesNotThrow(() => renderFreshness('/no/such/path'));
  const out = renderFreshness(process.cwd());
  assert.match(out, /CHECKOUT FRESHNESS/);
});
