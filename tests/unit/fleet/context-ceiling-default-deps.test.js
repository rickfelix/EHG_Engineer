/**
 * SD-FDBK-INFRA-COORDINATION-VOLUME-DEGRADES-001 -- unit tests for
 * lib/fleet/context-ceiling-default-deps.cjs. Uses real temp files (fs), never the real
 * .claude/logs/ directory -- every test passes an explicit logPath override.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  defaultReadLatestUsageRow,
  defaultInvokeCompactSkill,
  defaultPersistCeilingEvent,
} = require('../../../lib/fleet/context-ceiling-default-deps.cjs');

const tmpFiles = [];
function tmpPath(name) {
  const p = path.join(os.tmpdir(), `ctx-ceiling-test-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
  tmpFiles.push(p);
  return p;
}
afterEach(() => {
  while (tmpFiles.length) {
    const p = tmpFiles.pop();
    try { fs.unlinkSync(p); } catch (_) { /* noop */ }
  }
});

describe('defaultReadLatestUsageRow', () => {
  it('returns null when the log file does not exist', async () => {
    const result = await defaultReadLatestUsageRow('s-1', { logPath: tmpPath('missing.jsonl') });
    expect(result).toBeNull();
  });

  it('returns null when no line matches the session id', async () => {
    const p = tmpPath('log.jsonl');
    fs.writeFileSync(p, JSON.stringify({ session_id: 'other', usage_percent: 50, timestamp: '2026-01-01T00:00:00Z' }) + '\n');
    const result = await defaultReadLatestUsageRow('s-1', { logPath: p });
    expect(result).toBeNull();
  });

  it('returns the LATEST matching snapshot when multiple exist for the same session', async () => {
    const p = tmpPath('log.jsonl');
    const lines = [
      { session_id: 's-1', usage_percent: 10, timestamp: '2026-01-01T00:00:00Z' },
      { session_id: 'other', usage_percent: 99, timestamp: '2026-01-01T00:00:01Z' },
      { session_id: 's-1', usage_percent: 55, timestamp: '2026-01-01T00:05:00Z' },
    ].map((e) => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(p, lines);
    const result = await defaultReadLatestUsageRow('s-1', { logPath: p });
    expect(result).toEqual({ usage_percent: 55, created_at: '2026-01-01T00:05:00Z' });
  });

  it('skips malformed JSON lines without throwing', async () => {
    const p = tmpPath('log.jsonl');
    fs.writeFileSync(p, 'not json\n' + JSON.stringify({ session_id: 's-1', usage_percent: 33, timestamp: '2026-01-01T00:00:00Z' }) + '\n');
    const result = await defaultReadLatestUsageRow('s-1', { logPath: p });
    expect(result).toEqual({ usage_percent: 33, created_at: '2026-01-01T00:00:00Z' });
  });

  it('never throws for a null/undefined sessionId', async () => {
    await expect(defaultReadLatestUsageRow(null)).resolves.toBeNull();
    await expect(defaultReadLatestUsageRow(undefined)).resolves.toBeNull();
  });
});

describe('defaultInvokeCompactSkill', () => {
  it('prints an unmissable action line rather than silently no-opping', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await defaultInvokeCompactSkill();
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('COMPACT_ACTION_REQUIRED'))).toBe(true);
    logSpy.mockRestore();
  });
});

describe('defaultPersistCeilingEvent', () => {
  it('appends the event as a JSON line to the events log', async () => {
    const p = tmpPath('events.jsonl');
    const event = { session_id: 's-1', role: 'adam', before_percent: 96, after_percent: 20 };
    await defaultPersistCeilingEvent(event, { logPath: p });
    const content = fs.readFileSync(p, 'utf8').trim();
    expect(JSON.parse(content)).toEqual(event);
  });

  it('appends a second event on a second call rather than overwriting', async () => {
    const p = tmpPath('events.jsonl');
    await defaultPersistCeilingEvent({ n: 1 }, { logPath: p });
    await defaultPersistCeilingEvent({ n: 2 }, { logPath: p });
    const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1])).toEqual({ n: 2 });
  });

  it('never throws when the target directory cannot be created', async () => {
    // An invalid path (null byte) makes mkdirSync/appendFileSync throw internally -- must be swallowed.
    await expect(defaultPersistCeilingEvent({ n: 1 }, { logPath: '\0invalid' })).resolves.toBeUndefined();
  });
});
