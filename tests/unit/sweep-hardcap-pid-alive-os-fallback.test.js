/**
 * SD-REFILL-00NFWJ6M — SWEEP_HARD_CAP_20M false-released a PID-ALIVE worker.
 *
 * The hard-cap hold guard (WIP_GUARD_HARDCAP_PID_ALIVE) HOLDs release when hasPidAlive=true,
 * but hasPidAlive was computed ONLY from .claude/session-identity/pid-*.json markers
 * (aliveCcPids). FR-4 deletes a live worker's marker aggressively, so a MISSING marker was
 * mis-read as death → a live worker deep in a >20min sub-agent run (no mid-Task heartbeat)
 * got hard-cap-released every tick (marker-vs-OS divergence, same family as b340c2d8).
 *
 * Fix: when the marker set misses, fall back to OS process truth (isProcessRunning via
 * process.kill(pid,0)), GATED on a claude.exe existing on this host (anyClaudeProcessRunning)
 * to guard against PID-recycling false-holds.
 *
 * Static source assertions match this monolithic script's test convention
 * (stale-sweep-qf211-claim-guards.test.js) + a behavioral check of the exported helpers.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const SCRIPT = path.resolve(__dirname, '../../scripts/stale-session-sweep.cjs');
const src = readFileSync(SCRIPT, 'utf8');
const { isProcessRunning, anyClaudeProcessRunning } = require('../../scripts/stale-session-sweep.cjs');

describe('SD-REFILL-00NFWJ6M: hard-cap pid-alive OS-truth fallback', () => {
  it('falls back to OS process truth when the marker set misses (gated on claude.exe)', () => {
    // the hasPidAlive computation must OR in the OS check, gated by the host-claude flag
    expect(src).toMatch(/hasPidAlive\s*=\s*aliveCcPids\.has\(String\(ccPid\)\)/);
    expect(src).toMatch(/!hasPidAlive\s*&&\s*claudeProcRunningHost\s*&&\s*isProcessRunning\(Number\(ccPid\)\)/);
  });

  it('computes the host-claude gate ONCE before the classification map', () => {
    const gateIdx = src.indexOf('const claudeProcRunningHost = anyClaudeProcessRunning()');
    const mapIdx = src.indexOf('const classified = sessions.map(');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(mapIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(mapIdx); // computed once, before the per-session loop
  });

  it('isProcessRunning: current process is alive, an unused high PID is not', () => {
    expect(isProcessRunning(process.pid)).toBe(true);
    expect(isProcessRunning(2_000_000_000)).toBe(false); // implausible PID → ESRCH
    expect(isProcessRunning(0)).toBe(false);
    expect(isProcessRunning(null)).toBe(false);
  });

  it('anyClaudeProcessRunning returns a boolean and never throws', () => {
    const r = anyClaudeProcessRunning();
    expect(typeof r).toBe('boolean');
  });
});
