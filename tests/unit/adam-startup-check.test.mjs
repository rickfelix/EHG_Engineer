// Tests for scripts/adam-startup-check.mjs
// SD-LEO-INFRA-ENABLE-ADAM-GOVERNANCE-001 (FR-1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADAM_LOOPS,
  RESPONSIBILITIES,
  parseArmedSet,
  loopStatus,
  renderResponsibilities,
  renderLoops,
  buildReport,
  ROLE_CONTEXT_DOC,
} from '../../scripts/adam-startup-check.mjs';

test('ADAM_LOOPS has the 4 expected tick loops with the expected keys', () => {
  // self-adherence added by SD-LEO-INFRA-AUTOMATED-RECURRING-ADAM-001 (child E).
  assert.equal(ADAM_LOOPS.length, 4);
  assert.deepEqual(ADAM_LOOPS.map((l) => l.key), ['governance-scan', 'inbox-monitor', 'offer-help', 'self-adherence']);
  ADAM_LOOPS.forEach((l) => {
    assert.ok(l.cron && typeof l.cron === 'string', `${l.key} has a cron`);
    assert.ok(l.prompt && typeof l.prompt === 'string', `${l.key} has a prompt`);
  });
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

test('end-to-end CSV verdict: --armed with all 4 loop KEYS → nothing to arm (no duplicate re-arm)', () => {
  const armed = parseArmedSet(['--armed', ADAM_LOOPS.map((l) => l.key).join(',')], {});
  const out = renderLoops(armed);
  assert.match(out, /All 4 Adam tick loops armed\. Nothing to arm\./);
  assert.doesNotMatch(out, /MISSING/);
});

test('renderLoops emits CronCreate specs for the not-yet-armed loops (idempotent note)', () => {
  const out = renderLoops(parseArmedSet([], {}));
  assert.match(out, /ADAM RECURRING TICK \(4 loops\)/);
  assert.match(out, /CronCreate\(\{ cron: "0 13 \* \* \*"/); // governance-scan spec emitted
  assert.match(out, /idempotent/i);
});

test('renderLoops reports "Nothing to arm" when all loops are in the armed set', () => {
  const armedSet = new Set(ADAM_LOOPS.map((l) => l.prompt));
  const out = renderLoops({ provided: true, set: armedSet });
  assert.match(out, /All 4 Adam tick loops armed\. Nothing to arm\./);
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
