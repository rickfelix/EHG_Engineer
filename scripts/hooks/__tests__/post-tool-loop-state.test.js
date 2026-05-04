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
  const probe = spawn('node', ['-e', code], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CLAUDE_TOOL_NAME: 'ScheduleWakeup', ...env }
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
