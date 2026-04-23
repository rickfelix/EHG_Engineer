/**
 * Regression tests for capture-session-id.cjs hook
 * SD-LEO-INFRA-SESSION-PID-MARKER-001
 * SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-001 (FR-1 matcher scope)
 *
 * Covers:
 *   TS-5: 3 concurrent invocations produce 3 pid-*.json markers
 *   TR-2: settings.json registered timeout ≥ internal PowerShell budget + margin
 *   FR-3: Discovery log line emitted on every invocation
 *   FR-1: hook fires on all SessionStart sub-events (no matcher:"startup" gate)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const hookPath = resolve(repoRoot, 'scripts/hooks/capture-session-id.cjs');
const settingsPath = resolve(repoRoot, '.claude/settings.json');
const markerDir = resolve(repoRoot, '.claude/session-identity');

function readHookSource() {
  return readFileSync(hookPath, 'utf8');
}

function extractNumberConstant(src, name) {
  const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`));
  return m ? Number(m[1]) : null;
}

function extractOuterSetTimeout(src) {
  const m = src.match(/setTimeout\(\s*resolve\s*,\s*(\d+)\s*\)/);
  return m ? Number(m[1]) : null;
}

function getRegisteredHookTimeoutSeconds() {
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  const sessionStart = settings?.hooks?.SessionStart || [];
  for (const entry of sessionStart) {
    for (const hook of entry.hooks || []) {
      if (typeof hook.command === 'string' && hook.command.includes('capture-session-id.cjs')) {
        return hook.timeout;
      }
    }
  }
  return null;
}

describe('capture-session-id.cjs — timing budget invariant', () => {
  let src;
  beforeAll(() => { src = readHookSource(); });

  it('registered hook timeout is in seconds, not milliseconds', () => {
    // Claude Code hook timeouts are in SECONDS per its documented schema.
    // A 3-digit timeout would signal someone confused the unit.
    const t = getRegisteredHookTimeoutSeconds();
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(120);
  });

  it('settings.json hook timeout is at least 15s', () => {
    const t = getRegisteredHookTimeoutSeconds();
    expect(t).toBeGreaterThanOrEqual(15);
  });

  it('internal PowerShell budget fits within the registered hook timeout (+3s margin)', () => {
    const treeWalk = extractNumberConstant(src, 'TREE_WALK_TIMEOUT_MS');
    const scan = extractNumberConstant(src, 'SCAN_TIMEOUT_MS');
    const registeredMs = getRegisteredHookTimeoutSeconds() * 1000;
    expect(treeWalk).not.toBeNull();
    expect(scan).not.toBeNull();
    const internalBudget = treeWalk + scan;
    expect(registeredMs - internalBudget).toBeGreaterThanOrEqual(3000);
  });

  it('outer setTimeout exceeds the internal PowerShell budget', () => {
    const treeWalk = extractNumberConstant(src, 'TREE_WALK_TIMEOUT_MS');
    const scan = extractNumberConstant(src, 'SCAN_TIMEOUT_MS');
    const outer = extractOuterSetTimeout(src);
    expect(outer).not.toBeNull();
    expect(outer).toBeGreaterThanOrEqual(treeWalk + scan);
  });

  it('outer setTimeout fits within the registered hook timeout', () => {
    const outer = extractOuterSetTimeout(src);
    const registeredMs = getRegisteredHookTimeoutSeconds() * 1000;
    expect(outer).toBeLessThan(registeredMs);
  });
});

describe('capture-session-id.cjs — SessionStart matcher scope (FR-1)', () => {
  it('hook is NOT gated behind matcher:"startup"', () => {
    // Regression: when the hook was registered with matcher:"startup", it fired only
    // for fresh sessions — resume/compact/reconnect sub-events produced no marker,
    // no env var export, and no tick daemon. This stranded ~67% of sessions with
    // stale heartbeats. The hook must fire for all SessionStart sub-events.
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    const sessionStart = settings?.hooks?.SessionStart || [];
    const hostingBlocks = sessionStart.filter(entry =>
      (entry.hooks || []).some(h =>
        typeof h.command === 'string' && h.command.includes('capture-session-id.cjs')
      )
    );
    expect(hostingBlocks.length).toBeGreaterThanOrEqual(1);
    for (const block of hostingBlocks) {
      expect(
        block.matcher,
        `capture-session-id.cjs must not be behind matcher:"${block.matcher}" — that skips resume/compact/reconnect events`
      ).toBeUndefined();
    }
  });
});

describe('capture-session-id.cjs — discovery instrumentation', () => {
  it('includes entry_path, method_used, duration_ms, outcome fields per FR-3', () => {
    const src = readHookSource();
    expect(src).toMatch(/entry_path/);
    expect(src).toMatch(/method_used/);
    expect(src).toMatch(/duration_ms/);
    expect(src).toMatch(/outcome/);
    expect(src).toMatch(/fallback_ppid/);
  });

  it('uses process.hrtime.bigint for timing per TR-1', () => {
    const src = readHookSource();
    expect(src).toMatch(/process\.hrtime\.bigint\(\)/);
  });
});

// Integration test: spawn the hook with JSON input and verify marker write.
// Windows-only per TR-3 platform skip.
const runOnWindows = process.platform === 'win32' ? describe : describe.skip;

async function invokeHook(sessionId, source = 'startup') {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [hookPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CLAUDE_ENV_FILE: '' },
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.on('data', (b) => { stderr += b.toString(); });
    child.on('close', (code) => resolvePromise({ code, stderr }));
    child.on('error', () => resolvePromise({ code: -1, stderr }));
    child.stdin.write(JSON.stringify({ session_id: sessionId, source }));
    child.stdin.end();
  });
}

runOnWindows('capture-session-id.cjs — concurrent invocations (Windows only)', () => {
  it('three parallel invocations each produce a marker within 15s', async () => {
    const testRunId = crypto.randomUUID().slice(0, 8);
    const sessionIds = [0, 1, 2].map(i => `test-${testRunId}-${i}`);

    const start = Date.now();
    const results = await Promise.all(sessionIds.map(sid => invokeHook(sid, 'startup')));
    const duration = Date.now() - start;

    // All invocations should exit cleanly
    for (const r of results) {
      expect(r.code).toBe(0);
    }

    // Each session should have a per-session marker written
    for (const sid of sessionIds) {
      const markerFile = resolve(markerDir, `${sid}.json`);
      expect(existsSync(markerFile), `marker missing for ${sid}`).toBe(true);
      const marker = JSON.parse(readFileSync(markerFile, 'utf8'));
      expect(marker.session_id).toBe(sid);
      expect(marker.cc_pid).toBeTruthy();
    }

    // Total wall-clock must fit within the registered hook timeout budget
    expect(duration).toBeLessThan(15000);

    // Cleanup: remove only the test-run markers we created (leave real markers alone)
    try {
      for (const sid of sessionIds) {
        const f = resolve(markerDir, `${sid}.json`);
        if (existsSync(f)) unlinkSync(f);
      }
    } catch { /* best effort */ }
  }, 30_000);

  it('discovery log line is emitted on stderr for every invocation', async () => {
    const sid = `test-telemetry-${crypto.randomUUID().slice(0, 8)}`;
    const { code, stderr } = await invokeHook(sid, 'startup');
    expect(code).toBe(0);
    const lines = stderr.split('\n').filter(Boolean);
    const discovery = lines
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(e => e && e.event === 'capture-session-id.discovery');
    expect(discovery.length).toBeGreaterThanOrEqual(1);
    expect(discovery[0]).toMatchObject({
      entry_path: 'startup',
      method_used: expect.any(String),
      outcome: expect.any(String),
    });
    // Cleanup
    try {
      const f = resolve(markerDir, `${sid}.json`);
      if (existsSync(f)) unlinkSync(f);
    } catch { /* best effort */ }
  }, 30_000);
});
