// Tests for scripts/coordinator-startup-check.mjs
// SD-LEO-INFRA-COORDINATOR-STARTUP-ONBOARDING-001
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STANDARD_LOOPS,
  RESPONSIBILITIES,
  parseArmedSet,
  loopStatus,
  renderResponsibilities,
  renderLoops,
  buildReport,
  ROLE_CONTEXT_DOC,
} from '../../scripts/coordinator-startup-check.mjs';

test('STANDARD_LOOPS has the expected standard loops with the expected keys', () => {
  // SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001 (FR-5) added the daily flag-review loop.
  assert.equal(STANDARD_LOOPS.length, 7);
  const keys = STANDARD_LOOPS.map((l) => l.key);
  assert.deepEqual(keys, ['sweep', 'dashboard', 'identity', 'inbox', 'audit', 'email', 'flag-review']);
});

test('every loop carries a non-empty label, script, cron, and CronCreate prompt', () => {
  for (const loop of STANDARD_LOOPS) {
    for (const field of ['label', 'script', 'cron', 'prompt']) {
      assert.ok(typeof loop[field] === 'string' && loop[field].trim().length > 0,
        `loop ${loop.key} field ${field} must be a non-empty string`);
    }
  }
});

test('the two new loops (audit, email) and the inbox loop are present in the standard set', () => {
  const byKey = Object.fromEntries(STANDARD_LOOPS.map((l) => [l.key, l]));
  assert.equal(byKey.audit.script, 'coordinator-audit.mjs');
  assert.equal(byKey.email.script, 'coordinator-email-summary.mjs');
  assert.match(byKey.inbox.prompt, /fleet-dashboard\.cjs inbox/);
});

test('responsibilities summary renders the MANAGER-not-IC role context (FR-1)', () => {
  assert.ok(RESPONSIBILITIES.length >= 5);
  const out = renderResponsibilities();
  assert.match(out, /MANAGER, not IC/);
  assert.match(out, /KEEP WORKERS BUSY/);
});

test('fail-open: a missing role-context doc warns but does not throw (FR-4)', () => {
  let out;
  assert.doesNotThrow(() => { out = renderResponsibilities('/no/such/repo/root'); });
  // Still renders the fallback summary text...
  assert.match(out, /MANAGER, not IC/);
  // ...and flags the missing source doc.
  assert.match(out, new RegExp('role-context doc not found'));
  assert.match(out, new RegExp(ROLE_CONTEXT_DOC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('parseArmedSet reads --armed arg, --armed= form, and COORD_ARMED_CRONS env', () => {
  assert.equal(parseArmedSet([], {}).provided, false);
  const a = parseArmedSet(['--armed', 'a.cjs, b.mjs'], {});
  assert.equal(a.provided, true);
  assert.ok(a.set.has('a.cjs') && a.set.has('b.mjs'));
  const b = parseArmedSet(['--armed=c.cjs'], {});
  assert.ok(b.provided && b.set.has('c.cjs'));
  const c = parseArmedSet([], { COORD_ARMED_CRONS: 'd.mjs' });
  assert.ok(c.provided && c.set.has('d.mjs'));
});

test('loopStatus marks armed|MISSING|unverified, distinguishing inbox vs dashboard (FR-2)', () => {
  const byKey = Object.fromEntries(STANDARD_LOOPS.map((l) => [l.key, l]));
  // No armed-set → unverified for all
  const none = parseArmedSet([], {});
  assert.equal(loopStatus(byKey.sweep, none), 'unverified');
  // Armed by full prompt
  const armed = parseArmedSet(['--armed', 'node scripts/coordinator-email-summary.mjs,node scripts/fleet-dashboard.cjs inbox'], {});
  assert.equal(loopStatus(byKey.email, armed), 'armed');
  assert.equal(loopStatus(byKey.inbox, armed), 'armed');
  // dashboard (fleet-dashboard.cjs all) is NOT armed just because the inbox prompt is present
  assert.equal(loopStatus(byKey.dashboard, armed), 'MISSING');
  // basename match arms non-shared scripts
  const armed2 = parseArmedSet(['--armed', 'stale-session-sweep.cjs'], {});
  assert.equal(loopStatus(byKey.sweep, armed2), 'armed');
});

test('renderLoops emits CronCreate spec for missing/unverified loops', () => {
  const none = parseArmedSet([], {});
  const out = renderLoops(none);
  assert.match(out, /STANDARD CRON LOOPS \(7\)/);
  // All prompts emitted as CronCreate specs when nothing is armed
  for (const loop of STANDARD_LOOPS) {
    assert.ok(out.includes(loop.prompt), `expected CronCreate prompt for ${loop.key}`);
  }
  assert.match(out, /CronCreate\(\{/);
});

test('renderLoops reports all-armed cleanly when every loop is armed', () => {
  const allPrompts = STANDARD_LOOPS.map((l) => l.prompt).join(',');
  const armed = parseArmedSet(['--armed', allPrompts], {});
  const out = renderLoops(armed);
  assert.match(out, /All 7 standard loops armed/);
});

test('buildReport combines responsibilities + loop sections', () => {
  const report = buildReport([], {});
  assert.match(report, /COORDINATOR ROLE/);
  assert.match(report, /STANDARD CRON LOOPS/);
});
