// Tests for QF-20260504-765 — post-tool-loop-state.cjs stdin port
// Pre-fix: hook read process.env.CLAUDE_SESSION_ID which Claude Code does NOT
// propagate to PostToolUse subprocesses, so loop_state was never written when
// ScheduleWakeup was called. Post-fix: uses lib/hooks/session-id.cjs resolver.

import { describe, it, expect } from 'vitest';
import path from 'node:path';

const HOOK_PATH = path.resolve(__dirname, '../post-tool-loop-state.cjs').replace(/\\/g, '/');

function spawnHook(stdinPayload, env = {}) {
  const { spawn } = require('node:child_process');
  // The hook calls setLoopState which would hit the DB; we want to verify the
  // session_id resolution path WITHOUT actually writing to DB. Mock the
  // tracker module via a require shim. Approach: spawn with a dynamic
  // require-cache override to swap the tracker.
  const code = `
    require.cache[require.resolve('${path.resolve(__dirname, '../../lib/sessions/loop-state-tracker.cjs').replace(/\\/g, '/')}')] = {
      exports: {
        setLoopState: async (sid, state) => {
          process.stdout.write('CALLED:' + sid + ':' + state, () => {});
        },
        LOOP_STATE_AWAITING_TICK: 'awaiting_tick'
      }
    };
    require('${HOOK_PATH}');
  `;
  // SD-LEO-INFRA-PARK-VISIBILITY-LOOP-STATE-001: spawn HARNESS-SHAPED by default —
  // CLAUDE_TOOL_NAME deliberately ABSENT (Claude Code never sets it for hooks; the
  // legacy default of injecting it here is exactly why the dead env-only guard
  // shipped undetected fleet-wide). Tests exercising the env FALLBACK set it via `env`.
  const spawnEnv = { ...process.env, LEO_PARK_SILENCE_ARM: 'off', ...env };
  if (!('CLAUDE_TOOL_NAME' in env)) delete spawnEnv.CLAUDE_TOOL_NAME;
  const probe = spawn('node', ['-e', code], {
    stdio: ['pipe', 'pipe', 'pipe'],
    // These cases assert ONLY the loop_state resolution path. Disable the FR-2
    // silence-arm (SD-FDBK-INFRA-AUTO-PUSH-WIP-001) so they stay hermetic — the
    // arm is covered separately by spawnHookSilence below.
    env: spawnEnv
  });
  if (stdinPayload === null) {
    probe.stdin.end();
  } else if (stdinPayload === 'NO_END') {
    // intentionally don't close
  } else {
    probe.stdin.end(stdinPayload);
  }
  return new Promise((resolve) => {
    let stdout = ''; let stderr = '';
    probe.stdout.on('data', c => { stdout += c; });
    probe.stderr.on('data', c => { stderr += c; });
    probe.on('close', code => resolve({ stdout, stderr, code }));
  });
}

describe('PTL-STDIN-1: hook resolves session_id from stdin and calls setLoopState', () => {
  it('passes the stdin session_id through to setLoopState', async () => {
    const r = await spawnHook(JSON.stringify({
      session_id: 'ptl-stdin-1-abc',
      hook_event_name: 'PostToolUse',
      tool_name: 'ScheduleWakeup'
    }));
    expect(r.stdout).toBe('CALLED:ptl-stdin-1-abc:awaiting_tick');
  });
});

describe('PTL-FAILSAFE-1: hook exits cleanly with no setLoopState call when stdin and env both miss', () => {
  it('does not call setLoopState; exits 0', async () => {
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDE_SESSION_ID;
    delete cleanEnv.SESSION_ID;
    cleanEnv.CLAUDE_TOOL_NAME = 'ScheduleWakeup';
    const r = await spawnHook(null, { CLAUDE_SESSION_ID: '', SESSION_ID: '' });
    expect(r.stdout).not.toContain('CALLED:');
    expect(r.code).toBe(0);
  });
});

describe('PTL-INTEGRATION-1: hook respects CLAUDE_TOOL_NAME guard', () => {
  it('does not call setLoopState when tool name is wrong, even with valid stdin', async () => {
    const r = await spawnHook(JSON.stringify({
      session_id: 'ptl-int-1-abc'
    }), { CLAUDE_TOOL_NAME: 'Bash' });
    expect(r.stdout).not.toContain('CALLED:');
    expect(r.code).toBe(0);
  });
});

// SD-FDBK-INFRA-AUTO-PUSH-WIP-001 (FR-5b): the same ScheduleWakeup edge arms a
// CAPPED expected_silence_until. Shim BOTH the loop-state tracker and the
// telemetry writer so we capture the patch without a DB write, and assert the
// window never exceeds lib/fleet/silence-cap.cjs SILENCE_HARD_CAP_MIN (30min).
const TRACKER_PATH = path.resolve(__dirname, '../../lib/sessions/loop-state-tracker.cjs').replace(/\\/g, '/');
const WRITER_PATH = path.resolve(__dirname, '../lib/session-telemetry-writer.cjs').replace(/\\/g, '/');

function spawnHookSilence(stdinPayload, env = {}) {
  const { spawn } = require('node:child_process');
  // NOTE: wrap cache keys in require.resolve() so they normalize to Node's native
  // path form (backslashes on Windows) — a raw forward-slash literal key does NOT
  // match the cache and the REAL module loads (its DB write + process.exit() then
  // triggers the Windows UV_HANDLE_CLOSING abort). Mirrors the tracker shim above.
  const code = `
    require.cache[require.resolve('${TRACKER_PATH}')] = { exports: {
      setLoopState: async () => {}, LOOP_STATE_AWAITING_TICK: 'awaiting_tick'
    }};
    require.cache[require.resolve('${WRITER_PATH}')] = { exports: {
      writeTelemetry: async () => true,
      writeTelemetryAwait: async (sid, patch) => {
        process.stdout.write('SILENCE:' + (patch && patch.expected_silence_until || ''), () => {});
        return true;
      }
    }};
    require('${HOOK_PATH}');
  `;
  // Harness-shaped: CLAUDE_TOOL_NAME absent (the payloads carry tool_name) — see spawnHook.
  const spawnEnvS = { ...process.env, ...env };
  if (!('CLAUDE_TOOL_NAME' in env)) delete spawnEnvS.CLAUDE_TOOL_NAME;
  const probe = spawn('node', ['-e', code], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: spawnEnvS
  });
  probe.stdin.end(stdinPayload);
  return new Promise((resolve) => {
    let stdout = ''; let stderr = '';
    probe.stdout.on('data', c => { stdout += c; });
    probe.stderr.on('data', c => { stderr += c; });
    probe.on('close', code => resolve({ stdout, stderr, code }));
  });
}

function windowMinutes(iso) {
  return (new Date(iso).getTime() - Date.now()) / 60000;
}

describe('PTL-SILENCE-1: ScheduleWakeup hook arms a capped expected_silence_until (FR-2/FR-5b)', () => {
  it('arms a future expected_silence_until within the 30min hard cap for a normal delaySeconds', async () => {
    const r = await spawnHookSilence(JSON.stringify({
      session_id: 'ptl-silence-1', tool_name: 'ScheduleWakeup', tool_input: { delaySeconds: 1200 }
    }));
    const iso = (r.stdout.match(/SILENCE:(\S+)/) || [])[1];
    expect(iso).toBeTruthy();
    const mins = windowMinutes(iso);
    expect(mins).toBeGreaterThan(0);
    expect(mins).toBeLessThanOrEqual(30 + 0.5); // small tolerance for spawn latency
  });

  it('clamps a huge delaySeconds to the 30min hard cap (writer<=reader)', async () => {
    const r = await spawnHookSilence(JSON.stringify({
      session_id: 'ptl-silence-2', tool_name: 'ScheduleWakeup', tool_input: { delaySeconds: 7200 }
    }));
    const iso = (r.stdout.match(/SILENCE:(\S+)/) || [])[1];
    expect(iso).toBeTruthy();
    expect(windowMinutes(iso)).toBeLessThanOrEqual(30 + 0.5);
  });

  it('respects LEO_PARK_SILENCE_ARM=off (no silence write)', async () => {
    const r = await spawnHookSilence(JSON.stringify({
      session_id: 'ptl-silence-3', tool_name: 'ScheduleWakeup', tool_input: { delaySeconds: 1200 }
    }), { LEO_PARK_SILENCE_ARM: 'off' });
    expect(r.stdout).not.toContain('SILENCE:');
    expect(r.code).toBe(0);
  });
});

// SD-LEO-INFRA-PARK-VISIBILITY-LOOP-STATE-001: payload-first tool-name resolution.
// The harness delivers tool_name in the stdin JSON and NEVER sets CLAUDE_TOOL_NAME
// (RCA #2 2026-05-04). The previous env-only guard exited silently on every real
// invocation — loop_state read 'unknown' fleet-wide. These pin both directions
// with the env var ABSENT (the legacy suite injected it and masked the bug).
describe('PTL-PAYLOAD-TOOLNAME: tool name resolves payload-first with env fallback', () => {
  it('HARNESS SHAPE: payload tool_name=ScheduleWakeup, env var absent => writes', async () => {
    const r = await spawnHook(JSON.stringify({
      session_id: 'ptl-payload-1', hook_event_name: 'PostToolUse',
      tool_name: 'ScheduleWakeup', tool_input: { delaySeconds: 1200 }
    }));
    expect(r.stdout).toBe('CALLED:ptl-payload-1:awaiting_tick');
    expect(r.code).toBe(0);
  });

  it('payload tool_name=Bash, env var absent => excluded (no write)', async () => {
    const r = await spawnHook(JSON.stringify({
      session_id: 'ptl-payload-2', hook_event_name: 'PostToolUse', tool_name: 'Bash'
    }));
    expect(r.stdout).not.toContain('CALLED:');
    expect(r.code).toBe(0);
  });

  it('env-only fallback still honored (manual invocations): no payload tool_name, env=ScheduleWakeup', async () => {
    const r = await spawnHook(JSON.stringify({
      session_id: 'ptl-payload-3'
    }), { CLAUDE_TOOL_NAME: 'ScheduleWakeup' });
    expect(r.stdout).toBe('CALLED:ptl-payload-3:awaiting_tick');
  });

  it('payload tool_name WINS over a conflicting env value', async () => {
    const r = await spawnHook(JSON.stringify({
      session_id: 'ptl-payload-4', tool_name: 'Bash'
    }), { CLAUDE_TOOL_NAME: 'ScheduleWakeup' });
    expect(r.stdout).not.toContain('CALLED:');
  });
});
