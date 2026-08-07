/**
 * SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (FR-3b) — the host-local durable venue.
 *
 * The PID-anchored liveness class (claude_sessions_heartbeat) is deliberately EXCLUDED from
 * .github/workflows/periodic-liveness-watcher-cron.yml, and that exclusion is correct: a CI runner
 * cannot resolve a PID on the dev host. The consequence was that the only half that actually
 * detects dead workers was left on a STANDARD_LOOPS entry — SESSION-BOUND, and labelled PARTIAL by
 * its own file. When the coordinator session dies, nothing checks worker PIDs.
 *
 * These tests cover the PURE parts of the registrar (argv/XML/verdict construction). The impure
 * part — that the OS really holds the definition — is verified by `--verify`, which reads the
 * definition BACK out of Task Scheduler in a separate process rather than comparing our own input
 * to itself.
 */

import { describe, it, expect } from 'vitest';
import {
  TASK_NAME,
  STARTUP_TASK_NAME,
  SWEEP_TASK_NAME,
  SWEEP_SCRIPT,
  buildWrapperScript,
  buildCreateArgs,
  buildStartupCreateArgs,
  verifyPersistedDefinition,
  parseArgs,
} from '../../../scripts/setup-liveness-watcher-task.mjs';

const REPO = 'C:\\repo';

describe('FR-3b the wrapper runs the PID class and nothing else', () => {
  it('sets LIVENESS_CLASSES to the PID-anchored class only', () => {
    const s = buildWrapperScript({ repoRoot: REPO });
    expect(s).toMatch(/set LIVENESS_CLASSES=claude_sessions_heartbeat/);
    // The other classes already have a correct CI home; duplicating them here would double-stamp.
    expect(s).not.toMatch(/self_stamped|eva_scheduler_heartbeat|github_actions_api/);
  });

  it('cds to the repo root before invoking the watcher', () => {
    const s = buildWrapperScript({ repoRoot: REPO });
    expect(s).toMatch(/cd \/d "C:\\repo"/);
    expect(s).toMatch(/call node scripts\/periodic-liveness-watcher\.mjs/);
  });

  it('refuses to build without a repo root rather than emitting a wrapper that cds nowhere', () => {
    expect(() => buildWrapperScript({})).toThrow(/repoRoot required/);
  });
});

describe('FR-3b registration uses the argv form that works unelevated', () => {
  it('cadence task is a repeating MINUTE schedule', () => {
    const a = buildCreateArgs({ wrapperPath: 'C:\\repo\\w.cmd' });
    expect(a).toContain('/SC');
    expect(a[a.indexOf('/SC') + 1]).toBe('MINUTE');
    expect(a).toContain('/F'); // idempotent re-registration
    // NOT /XML: measured on the fleet host, schtasks /Create /XML returns "Access is denied"
    // unelevated regardless of the XML's contents, while /SC succeeds.
    expect(a).not.toContain('/XML');
  });

  it('rejects a nonsense interval instead of registering something that never fires', () => {
    expect(() => buildCreateArgs({ wrapperPath: 'x', intervalMinutes: 0 })).toThrow(/invalid intervalMinutes/);
    expect(() => buildCreateArgs({ wrapperPath: 'x', intervalMinutes: 'soon' })).toThrow(/invalid intervalMinutes/);
  });

  it('startup companion is ONLOGON by default and ONSTART only when explicitly asked', () => {
    const logon = buildStartupCreateArgs({ wrapperPath: 'x' });
    expect(logon[logon.indexOf('/SC') + 1]).toBe('ONLOGON');
    const boot = buildStartupCreateArgs({ wrapperPath: 'x', boot: true });
    expect(boot[boot.indexOf('/SC') + 1]).toBe('ONSTART');
  });

  it('the two tasks have distinct names so neither overwrites the other', () => {
    expect(TASK_NAME).not.toBe(STARTUP_TASK_NAME);
  });

  it('--boot is opt-in, not the default', () => {
    expect(parseArgs(['node', 'x']).boot).toBe(false);
    expect(parseArgs(['node', 'x', '--boot']).boot).toBe(true);
  });
});

describe('FR-3b the SWEEP gets a durable PID-capable venue too', () => {
  // SECURITY review finding (EXEC evidence b0956042): FR-3a makes the GHA sweep abstain whenever
  // it cannot see PIDs, which is right — but on its own it would leave stale-session-sweep.cjs
  // with NO durable PID-capable venue, its only one being the same session-bound STANDARD_LOOPS
  // entry this SD exists to stop depending on. Hardening the watcher's venue and not the sweep's
  // would be a fifth instance of "the half that could be reached got fixed".
  it('registers a sweep venue distinct from the watcher venue', () => {
    expect(SWEEP_TASK_NAME).not.toBe(TASK_NAME);
    expect(SWEEP_TASK_NAME).not.toBe(STARTUP_TASK_NAME);
  });

  it('the sweep wrapper runs the sweep, with NO class filter', () => {
    const s = buildWrapperScript({ repoRoot: REPO, env: {}, script: SWEEP_SCRIPT });
    expect(s).toMatch(/call node scripts\/stale-session-sweep\.cjs/);
    // The sweep takes no class filter; leaking LIVENESS_CLASSES into its env would be cargo-culted
    // from the watcher and could confuse a future reader into thinking it honours one.
    expect(s).not.toMatch(/LIVENESS_CLASSES/);
  });

  it('runs the sweep on a tighter cadence than the watcher, matching sweep-cron.yml', () => {
    const sweep = buildCreateArgs({ taskName: SWEEP_TASK_NAME, wrapperPath: 'x', intervalMinutes: 5 });
    expect(sweep[sweep.indexOf('/MO') + 1]).toBe('5');
    const watcher = buildCreateArgs({ wrapperPath: 'x' });
    expect(Number(watcher[watcher.indexOf('/MO') + 1])).toBeGreaterThan(5);
  });
});

describe('FR-3b the verify predicate judges the OS definition correctly', () => {
  const healthy = `<Task><Settings>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
  </Settings><Triggers><TimeTrigger>
    <Repetition><Interval>PT30M</Interval></Repetition>
  </TimeTrigger></Triggers></Task>`;

  it('accepts the shape Task Scheduler actually returns', () => {
    const v = verifyPersistedDefinition(healthy, '');
    expect(v.ok).toBe(true);
  });

  it('ABSENCE of <Enabled> counts as enabled — the bug this test exists to prevent', () => {
    // MEASURED: the definition the OS returned for a freshly registered, running task contains no
    // <Enabled> element at all, because Task Scheduler omits it at its default of true. An earlier
    // revision asserted /<Enabled>true</ and reported a perfectly healthy task as broken. The
    // correct test is for an EXPLICIT false.
    expect(healthy).not.toMatch(/<Enabled>/);
    expect(verifyPersistedDefinition(healthy, '').ok).toBe(true);
    const disabled = healthy.replace('<Settings>', '<Settings><Enabled>false</Enabled>');
    expect(verifyPersistedDefinition(disabled, '').ok).toBe(false);
  });

  it('rejects the battery defaults that would silently suspend the watcher', () => {
    // Task Scheduler defaults BOTH of these to true. On a laptop fleet host that means the
    // liveness watcher stops whenever the machine is unplugged — a watcher that reads as
    // scheduled while not running is the exact failure class this SD is about.
    const onBattery = healthy.replace(
      '<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>',
      '<DisallowStartIfOnBatteries>true</DisallowStartIfOnBatteries>'
    );
    const v = verifyPersistedDefinition(onBattery, '');
    expect(v.ok).toBe(false);
    expect(v.problems.join(' ')).toMatch(/on battery/);
  });

  it('rejects a definition with no repetition — it would fire once and never again', () => {
    const once = healthy.replace('<Repetition><Interval>PT30M</Interval></Repetition>', '');
    expect(verifyPersistedDefinition(once, '').ok).toBe(false);
  });

  it('a missing startup arm is a WARNING, not a failure', () => {
    // The durability property is the persisted repeating cadence task; the companion only makes
    // the first post-boot run prompt. ONLOGON/ONSTART need elevation on this host, so treating
    // its absence as fatal would make the venue uninstallable for a marginal gain.
    const v = verifyPersistedDefinition(healthy, '');
    expect(v.ok).toBe(true);
    expect(v.triggerKind).toBeNull();
    expect(v.warnings.join(' ')).toMatch(/no startup companion/);
  });

  it('reports WHICH startup trigger it saw rather than assuming', () => {
    expect(verifyPersistedDefinition(healthy, '<LogonTrigger></LogonTrigger>').triggerKind).toBe('LogonTrigger');
    expect(verifyPersistedDefinition(healthy, '<BootTrigger></BootTrigger>').triggerKind).toBe('BootTrigger');
  });

  it('an empty OS response is a failure, never a silent pass', () => {
    expect(verifyPersistedDefinition('', '').ok).toBe(false);
    expect(verifyPersistedDefinition(null, null).ok).toBe(false);
  });
});
