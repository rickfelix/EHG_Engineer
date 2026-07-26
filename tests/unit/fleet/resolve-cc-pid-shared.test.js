/**
 * SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (C2 RESOLVER)
 *
 * The PID leg of the liveness ladder was 100% inert: hasPidAlive took the LAST '-' segment of
 * terminal_id, which for the bare UUIDs sessions actually write is a hex group, never a PID.
 * Measured against the full live population (status in active/idle/stale with a heartbeat in the
 * last 24h, exact head-count 9 = 9 rows examined, so not a truncated sample): the old logic
 * resolved 0 of 9; the shared resolver resolves 6 of 9 — 100% of the rows that carry a
 * terminal_id at all. The other 3 have terminal_id NULL and must stay could-not-determine.
 *
 * These tests are deliberately written so they FAIL against the pre-C2 implementation:
 * the UUID cases below are exactly what the old last-segment split could not resolve.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, it, expect, afterEach } from 'vitest';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { resolveCcPidFromTerminalId, MARKER_DIR } = require('../../../lib/fleet/resolve-cc-pid.cjs');
const { hasPidAlive } = require('../../../lib/fleet/session-liveness.cjs');

const FIXTURE_DIR = path.join(__dirname, '.tmp-markers-c2');
const UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/**
 * The two hasPidAlive marker tests below MUST write into the REAL MARKER_DIR, because
 * hasPidAlive takes no markerDir override. That directory is SHARED STATE, so they use a
 * session id owned exclusively by this file.
 *
 * Do NOT reuse UUID here. tests/unit/stale-session-sweep-terminal-parser.test.js AC-3.4
 * asserts that UUID resolves to null; writing a marker for it made that sibling suite fail
 * whenever the two files ran in the same process. My file passed in isolation and only broke
 * in the combined run — a shared-fixture leak, not a code defect.
 */
const OWNED_UUID = 'c2c2c2c2-0000-4000-8000-resolvercc0de';

function writeMarker(dir, pid, sessionId) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `pid-${pid}.json`),
    JSON.stringify({ session_id: sessionId, cc_pid: String(pid), sse_port: '1234' })
  );
}

const created = [];
afterEach(() => {
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
  while (created.length) {
    try { fs.rmSync(created.pop(), { force: true }); } catch { /* already gone */ }
  }
});

describe('C2: shared cc-pid resolver', () => {
  it('resolves a bare-UUID terminal_id through the markers — the case the old split could not', () => {
    writeMarker(FIXTURE_DIR, 4242, UUID);
    expect(resolveCcPidFromTerminalId(UUID, UUID, FIXTURE_DIR)).toBe(4242);
  });

  it('matches on session_id when terminal_id is a UUID that differs from it', () => {
    writeMarker(FIXTURE_DIR, 777, 'session-uuid-value');
    expect(resolveCcPidFromTerminalId(UUID, 'session-uuid-value', FIXTURE_DIR)).toBe(777);
  });

  it('still resolves the two inline formats (no back-compat regression)', () => {
    expect(resolveCcPidFromTerminalId('win-cc-13596-22408')).toBe(22408);
    expect(resolveCcPidFromTerminalId('win-13596')).toBe(13596);
  });

  it('returns null — could-not-determine, NOT dead — only when nothing can match', () => {
    expect(resolveCcPidFromTerminalId(null)).toBeNull();
    expect(resolveCcPidFromTerminalId('')).toBeNull();
    expect(resolveCcPidFromTerminalId(null, null)).toBeNull();
    expect(resolveCcPidFromTerminalId('not-a-known-format')).toBeNull();
    // marker dir exists but holds no matching session
    writeMarker(FIXTURE_DIR, 4242, 'some-other-session');
    expect(resolveCcPidFromTerminalId(UUID, UUID, FIXTURE_DIR)).toBeNull();
  });

  /**
   * A NULL terminal_id must NOT short-circuit the marker scan. Measured on the full live
   * population (exact head-count 12 == 12 examined): 3 rows have terminal_id NULL and ALL
   * THREE have a marker keyed by session_id — including the fleet coordinator, whose row is
   * how this defect was found. An earlier revision returned null here, leaving 25% of live
   * sessions permanently could-not-determine while the answer sat on disk.
   */
  it('resolves a row with NULL terminal_id via its session_id marker', () => {
    writeMarker(FIXTURE_DIR, 24496, 'coordinator-session-id');
    expect(resolveCcPidFromTerminalId(null, 'coordinator-session-id', FIXTURE_DIR)).toBe(24496);
    expect(resolveCcPidFromTerminalId(undefined, 'coordinator-session-id', FIXTURE_DIR)).toBe(24496);
    expect(resolveCcPidFromTerminalId('', 'coordinator-session-id', FIXTURE_DIR)).toBe(24496);
  });

  it('survives a malformed marker instead of throwing', () => {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    fs.writeFileSync(path.join(FIXTURE_DIR, 'pid-99.json'), '{not json');
    writeMarker(FIXTURE_DIR, 100, UUID);
    expect(resolveCcPidFromTerminalId(UUID, UUID, FIXTURE_DIR)).toBe(100);
  });

  it('is the SAME function the sweep exports — one implementation, not two', () => {
    const sweep = require('../../../scripts/stale-session-sweep.cjs');
    expect(sweep.resolveCcPidFromTerminalId).toBe(resolveCcPidFromTerminalId);
  });
});

describe('C2: hasPidAlive consumes the shared resolver', () => {
  it('reports a UUID-terminal_id session ALIVE when its marker pid is running', () => {
    // process.pid is by definition a live process, so this isolates resolution from liveness.
    const marker = path.join(MARKER_DIR, `pid-${process.pid}.json`);
    fs.mkdirSync(MARKER_DIR, { recursive: true });
    fs.writeFileSync(marker, JSON.stringify({ session_id: OWNED_UUID, cc_pid: String(process.pid) }));
    created.push(marker);
    expect(hasPidAlive({ terminal_id: OWNED_UUID, session_id: OWNED_UUID })).toBe(true);
  });

  it('still resolves a NULL-terminal_id session through its session_id marker', () => {
    const marker = path.join(MARKER_DIR, `pid-${process.pid}.json`);
    fs.mkdirSync(MARKER_DIR, { recursive: true });
    fs.writeFileSync(marker, JSON.stringify({ session_id: OWNED_UUID, cc_pid: String(process.pid) }));
    created.push(marker);
    expect(hasPidAlive({ terminal_id: null, session_id: OWNED_UUID })).toBe(true);
  });

  it('abstains (false) only when there is nothing to match on', () => {
    expect(hasPidAlive({ terminal_id: null, session_id: null })).toBe(false);
    expect(hasPidAlive({})).toBe(false);
    expect(hasPidAlive(null)).toBe(false);
  });

  it('still honours an injected aliveCcPids set for the inline formats', () => {
    expect(hasPidAlive({ terminal_id: 'win-cc-13596-22408' }, new Set(['22408']))).toBe(true);
    expect(hasPidAlive({ terminal_id: 'win-cc-13596-22408' }, new Set(['999']))).toBe(false);
  });
});
