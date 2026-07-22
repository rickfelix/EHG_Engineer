#!/usr/bin/env node
/**
 * Reboot-respawn ENTRYPOINT — SD-LEO-INFRA-LEO-COMPLETION-001-D (FR-5).
 *
 * Thin wrapper the ONSTART/ONLOGON scheduled task (scripts/setup-reboot-respawn-task.mjs) calls on
 * host reboot. All logic lives in lib/fleet/reboot-respawn-runner.js (injectable-seam core); this
 * file only wires the real supabase service client + the real detached spawner and invokes it. Does
 * NOT run on import (require.main guard) so the core stays unit-testable.
 *
 * STAGED / INERT: the runner defaults to FLEET_SPAWN_CONTROL_LIVE (default OFF). Unset → logs the
 * intended per-slot resume invocations + roster and spawns nothing. The scheduled-task wrapper sets
 * the flag per the operator gate.
 */
if (require.main === module) {
  (async () => {
    const { runRebootRespawn } = await import('../../lib/fleet/reboot-respawn-runner.js');
    const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');
    const { spawn } = require('node:child_process');
    const supabase = createSupabaseServiceClient();

    // Real detached spawner — mirrors spawn-control.js's default spawner (detached + unref'd so the
    // relaunched tabs survive this process's exit). Only invoked when live.
    const spawnFn = (program, args, env, cwd) => {
      // Pilot fix FR-2: pass the invocation's repo-root cwd through (paired with the new-tab -d
      // start-dir) so the wt.exe process starts at repo root too; the spawned tab registers in claude_sessions.
      const child = spawn(program, args, { detached: true, stdio: 'ignore', cwd, env: { ...process.env, ...env } });
      if (child && typeof child.unref === 'function') child.unref();
      return child;
    };

    const res = await runRebootRespawn({ supabase, spawnFn, log: (m) => console.log(m) });
    console.log(`[reboot-respawn] done: live=${res.live}, slots=${res.slotCount}, respawned=${res.results.filter((r) => r.spawned).length}`);
    process.exit(0);
  })().catch((e) => { console.error('[reboot-respawn] fatal:', e && e.message); process.exit(1); });
}
