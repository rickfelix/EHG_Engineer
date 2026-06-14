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
  // SD-LEO-INFRA-ARM-CANONICALIZE-WORK-001 added self-review; chairman req 2026-06-09 added hourly-review.
  // Chairman email cutover (advisory b7b73b86 / QF-20260609-024, 2026-06-10) RETIRED the email loop —
  // the one chairman-facing email is the Adam exec-summary GHA (adam-exec-email-cron.yml).
  // Operator 2026-06-10 added the predictive capacity-forecast loop (worker utilization + belt dry-out)
  // and the backlog-prioritization pass (dispatch_rank for self-claim ordering — SRE duty 6).
  // SD-LEO-INFRA-STANDING-ROW-GROWTH-001 added row-growth; SD-LEO-INFRA-CODIFY-SUBSYSTEM-REVIEW-001
  // added review-rotation (this pin had drifted to 11 while both shipped — fixed here).
  // SD-LEO-INFRA-SCRIPTS-ESTATE-RECONCILIATION-001 (FR-1) added the weekly scripts-reachability gauge.
  // SD-MAN-INFRA-RETENTION-OPS-FINISHER-001 added 'retention' (this pin had drifted — it was never added here).
  // SD-LEO-INFRA-COORDINATOR-CHARTER-SELF-AUDIT-001 added the durable charter-compliance self-audit (after 'audit').
  assert.equal(STANDARD_LOOPS.length, 16);
  const keys = STANDARD_LOOPS.map((l) => l.key);
  assert.deepEqual(keys, ['sweep', 'dashboard', 'identity', 'inbox', 'audit', 'charter-audit', 'flag-review', 'self-review', 'hourly-review', 'capacity-forecast', 'backlog-rank', 'fleet-retro', 'row-growth', 'review-rotation', 'scripts-reachability', 'retention']);
});

test('every loop carries a non-empty label, script, cron, and CronCreate prompt', () => {
  for (const loop of STANDARD_LOOPS) {
    for (const field of ['label', 'script', 'cron', 'prompt']) {
      assert.ok(typeof loop[field] === 'string' && loop[field].trim().length > 0,
        `loop ${loop.key} field ${field} must be a non-empty string`);
    }
  }
});

test('audit + inbox loops present; coordinator fleet email loop RETIRED (chairman cutover)', () => {
  const byKey = Object.fromEntries(STANDARD_LOOPS.map((l) => [l.key, l]));
  assert.equal(byKey.audit.script, 'coordinator-audit.mjs');
  assert.match(byKey.inbox.prompt, /fleet-dashboard\.cjs inbox/);
  // The coordinator email must NOT be re-armed — the Adam exec-summary GHA is the chairman channel.
  assert.equal(byKey.email, undefined);
  assert.ok(!STANDARD_LOOPS.some((l) => l.prompt.includes('coordinator-email-summary')));
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
  const armed = parseArmedSet(['--armed', 'node scripts/coordinator-audit.mjs,node scripts/fleet-dashboard.cjs inbox'], {});
  assert.equal(loopStatus(byKey.audit, armed), 'armed');
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
  assert.match(out, /STANDARD CRON LOOPS \(16\)/);
  // All prompts emitted as CronCreate specs when nothing is armed
  for (const loop of STANDARD_LOOPS) {
    assert.ok(out.includes(loop.prompt), `expected CronCreate prompt for ${loop.key}`);
  }
  assert.match(out, /CronCreate\(\{/);
});

test('renderLoops reports all-armed cleanly when every loop is armed', () => {
  // Build the armed set from loop SCRIPTS (basename match) + the shared fleet-dashboard.cjs full prompts
  // (loopStatus requires a full-prompt match for the shared script). Using scripts avoids the comma-in-prompt
  // shredding the prior join(',') approach suffered (retention + charter-audit prompts contain commas).
  const armedTokens = [
    ...STANDARD_LOOPS.map((l) => l.script),
    ...STANDARD_LOOPS.filter((l) => l.script === 'fleet-dashboard.cjs').map((l) => l.prompt),
  ];
  const armed = parseArmedSet(['--armed', armedTokens.join(',')], {});
  const out = renderLoops(armed);
  assert.match(out, /All 16 standard loops armed/);
});

test('buildReport combines responsibilities + loop sections', () => {
  const report = buildReport([], {});
  assert.match(report, /COORDINATOR ROLE/);
  assert.match(report, /STANDARD CRON LOOPS/);
});
