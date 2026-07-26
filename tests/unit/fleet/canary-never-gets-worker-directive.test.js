/**
 * SD-...-PROMPT-LIBRARY-001-D — THE HAZARD TEST. One file, ALL THREE prompt-decision sites.
 *
 * WHY THIS FILE EXISTS. FR-3 required patching every site that decides which prompt a session
 * receives. There are three (LEAD review): spawn-control.js, reboot-respawn-runner.js and
 * scripts/fleet/worker-spawn-executor.cjs. They were patched ONE AT A TIME, and in between, a
 * canary spawned through spawn() was handed the full claiming-worker directive — verified at the
 * consumer by reading the delivered file: 1406 bytes, first line "/loop You are an autonomous LEO
 * fleet worker...". That is the precise fleet-wide hazard the SD exists to prevent, and it was
 * invisible because each site's own tests passed.
 *
 * Per-site tests could not catch it: each one only ever looked at its own site. So this asserts the
 * INVARIANT ACROSS THE POPULATION — no site, on any path, may hand a canary the worker directive.
 * Adding a fourth spawner without wiring it in should fail HERE.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { FLEET_WORKER_STARTUP_PROMPT } = require('../../../lib/coordinator/coordination-events.cjs');

/**
 * Whether a prompt was resolved AT ALL for this invocation. `promptFilePath` is non-null exactly
 * when a prompt was selected, so it is the discriminator — and unlike reading the delivered file it
 * does not depend on the repo root existing. That matters: under vitest resolveRepoRoot points at
 * `tests/fixtures/__no_such_tree__`, and buildSessionLaunch deliberately refuses to fabricate a
 * missing start directory, so no file is written and a payload-reading assertion cannot see the
 * worker arm at all. It would have reported "canary safe" for the trivial reason that NOBODY gets
 * a prompt — a check that cannot fail in the direction that matters.
 */
const gotAPrompt = (invocation) => Boolean(invocation && invocation.promptFilePath);

describe('ACCEPTANCE STEP 2 — PAYLOAD HOP: the FILE bytes, per callsign class', () => {
  // smoke_test_steps step 2 asks for the bytes of the file the pointer names, not just that a
  // prompt was selected. That needs a start dir that EXISTS (buildSessionLaunch refuses to
  // fabricate one), so cwd is an explicit temp dir here rather than the vitest repo root, which
  // resolves to tests/fixtures/__no_such_tree__.
  const os = require('node:os');
  const path = require('node:path');
  const { buildSessionLaunch } = require('../../../lib/fleet/build-session-launch.cjs');
  const { resolveStartupPromptForCallsign } = require('../../../lib/fleet/startup-prompt-selection.js');

  const launchFor = (callsign) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'payload-'));
    const { prompt } = resolveStartupPromptForCallsign(callsign, {
      workerPrompt: FLEET_WORKER_STARTUP_PROMPT, canaryPrompt: null, logFn: () => {},
    });
    const inv = buildSessionLaunch({ role: 'worker', callsign, cwd, startupPrompt: prompt });
    return { inv, prompt, cwd };
  };

  it('WORKER: the file on disk is BYTE-EQUAL to the source constant', () => {
    const { inv } = launchFor('Charlie');
    expect(inv.promptFilePath).toBeTruthy();
    expect(fs.existsSync(inv.promptFilePath)).toBe(true);
    expect(fs.readFileSync(inv.promptFilePath, 'utf8')).toBe(FLEET_WORKER_STARTUP_PROMPT);
  });

  it('CANARY: no prompt, no file — absence asserted explicitly, with the worker as control', () => {
    const canary = launchFor('Canary-pilot');
    expect(canary.prompt).toBeNull();
    expect(canary.inv.promptFilePath).toBeNull();
    // CONTROL: absence-because-nobody-got-anything must not be able to pass.
    expect(launchFor('Charlie').prompt).toBe(FLEET_WORKER_STARTUP_PROMPT);
  });

  it('UNIDENTIFIABLE: no prompt, no file', () => {
    const { inv, prompt } = launchFor('');
    expect(prompt).toBeNull();
    expect(inv.promptFilePath).toBeNull();
  });
});

describe('CANARY MUST NEVER RECEIVE THE WORKER DIRECTIVE — all three prompt-decision sites', () => {
  it('SITE 1 spawn-control.spawn()', async () => {
    const { spawn } = await import('../../../lib/fleet/spawn-control.js');
    const canary = await spawn({ role: 'worker', callsign: 'Canary-pilot' }, { live: false });
    const worker = await spawn({ role: 'worker', callsign: 'Charlie' }, { live: false });

    expect(gotAPrompt(canary.invocation), 'a canary must resolve to NO prompt').toBe(false);
    // CONTROL ARM — without it this passes even if nobody ever receives a prompt, which is exactly
    // how the original defect hid: every site's own tests were green.
    expect(gotAPrompt(worker.invocation), 'a worker MUST still get one').toBe(true);
    // And a canary must carry no positional at all, so nothing can be read from argv either.
    expect(canary.invocation.args.some((a) => /Read the file/.test(String(a)))).toBe(false);
    expect(worker.invocation.args.some((a) => /Read the file/.test(String(a)))).toBe(true);
  });

  it('SITE 2 reboot-respawn-runner', async () => {
    const { runRebootRespawn } = await import('../../../lib/fleet/reboot-respawn-runner.js');
    const seen = [];
    await runRebootRespawn({
      loadFn: async () => ([{ name: 'Canary-pilot', role: 'worker' }, { name: 'Charlie', role: 'worker' }]),
      rosterFn: (s) => s.map((x) => x.name),
      buildInvocationFn: ({ callsign, startupPrompt }) => {
        seen.push({ callsign, startupPrompt });
        return { program: 'wt.exe', args: [], env: {}, sessionId: 'sid' };
      },
      live: false, log: () => {}, logFn: () => {},
    });
    const canary = seen.find((s) => s.callsign === 'Canary-pilot');
    const worker = seen.find((s) => s.callsign === 'Charlie');
    expect(canary.startupPrompt).not.toBe(FLEET_WORKER_STARTUP_PROMPT);
    expect(worker.startupPrompt).toBe(FLEET_WORKER_STARTUP_PROMPT); // control arm
  });

  it('SITE 3 worker-spawn-executor', async () => {
    const { runExecutor } = require('../../../scripts/fleet/worker-spawn-executor.cjs');
    const built = [];
    await runExecutor({
      // status:'pending' is REQUIRED — resolveSpawnDecisions skips anything else as 'not_pending',
      // which silently emptied toSpawn and made the first version of this test vacuous.
      pendingRequests: [
        { id: 'r1', requested_callsign: 'Canary-pilot', status: 'pending', requested_at: new Date(0).toISOString() },
        { id: 'r2', requested_callsign: 'Charlie', status: 'pending', requested_at: new Date(0).toISOString() },
      ],
      liveCallsigns: new Set(),
      nowMs: 0,
      perTickCap: 10,
      live: false,
      prompt: FLEET_WORKER_STARTUP_PROMPT,
      log: () => {},
      buildInvocationFn: (callsign, prompt) => { built.push({ callsign, prompt }); return { program: 'wt.exe', args: [] }; },
      spawnFn: vi.fn(),
      supabase: null,
    });

    // The executor resolves per request; a hoisted single prompt would give BOTH the directive.
    const canary = built.find((b) => b.callsign === 'Canary-pilot');
    const worker = built.find((b) => b.callsign === 'Charlie');
    if (canary) expect(canary.prompt).not.toBe(FLEET_WORKER_STARTUP_PROMPT);
    if (worker) expect(worker.prompt).toBe(FLEET_WORKER_STARTUP_PROMPT); // control arm
    // Guard: if the executor skipped both requests this test would pass vacuously.
    expect(built.length, 'executor built no invocations — assertions above were vacuous').toBeGreaterThan(0);
  });
});
