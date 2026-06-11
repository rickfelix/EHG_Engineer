/**
 * Tests for SD-FDBK-ENH-SESSION-IDENTITY-SPLIT-001
 *
 * The Windows session-identity split: when CLAUDE_SESSION_ID is unset and the
 * process-ancestry tree-walk fails, getTerminalId() previously adopted the
 * NEWEST-mtime pid-*.json marker (Priority 2) or the process-SCAN PID's marker
 * (Priority 2b). On a SHARED SSE port that marker can belong to a SIBLING
 * conversation, minting a second claude_sessions row with a foreign UUID.
 *
 * The fix makes identity resolution ANCESTRY-VERIFIED in the env-unset window:
 *   FR-1 ancestor-owned marker wins over a sibling's marker
 *   FR-2 a non-ancestry-verified UUID is never cached to process.env
 *   FR-3 with no ancestry match, fall through to the per-PID unique fallback
 *   FR-4 Priority-1 (CLAUDE_SESSION_ID set) is unchanged
 *
 * Strategy: terminal-identity.js shells out to PowerShell via execSync for the
 * ancestor walk, the tree-walk, and the process scan, and reads pid-*.json
 * markers via fs. We mock both 'child_process' and 'fs' and dispatch the
 * execSync mock by decoding the base64 -EncodedCommand payloads.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const PORT = '22186';
const ANCESTOR_PID = '1000';
const SIBLING_PID = '5555';
const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // ancestor-owned marker (correct identity)
const UUID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // sibling-owned marker (foreign — must never win)

// Mutable scenario shared with the mock factories (read at call time).
const S = {
  ancestors: '',   // CSV returned by the ancestor walk ($pids -join ",")
  treewalk: '',     // chain returned by the tree-walk ($chain -join ";")
  scan: '',         // "pid|cmdline" returned by the process scan ($results -join ";")
  markers: {},      // { 'pid-NNNN.json': { session_id, sse_port } }
  wrote: {}         // captured writeFileSync payloads
};

function decodeEncodedCommand(cmd) {
  const m = /-EncodedCommand (\S+)/.exec(cmd);
  if (!m) return null;
  return Buffer.from(m[1], 'base64').toString('utf16le');
}

vi.mock('child_process', () => ({
  execSync: vi.fn((cmd) => {
    if (typeof cmd === 'string' && cmd.includes('git rev-parse')) return 'C:/fake-repo/.git';
    const script = decodeEncodedCommand(cmd);
    if (script) {
      if (script.includes('$chain -join')) return S.treewalk;       // tree-walk
      if (script.includes('$pids -join')) return S.ancestors;        // ancestor walk
      if (script.includes('$results -join')) return S.scan;          // process scan
    }
    if (typeof cmd === 'string' && cmd.includes('SessionId')) return '1';
    return '';
  })
}));

vi.mock('fs', () => {
  const findMarker = (p) => Object.keys(S.markers).find((k) => String(p).includes(k));
  return {
    readdirSync: vi.fn(() => Object.keys(S.markers)),
    readFileSync: vi.fn((p) => {
      const key = findMarker(p);
      if (key) return JSON.stringify(S.markers[key]);
      const e = new Error('ENOENT: ' + p);
      e.code = 'ENOENT';
      throw e;
    }),
    existsSync: vi.fn((p) => String(p).replace(/\\/g, '/').endsWith('.claude/session-identity')),
    writeFileSync: vi.fn((p, data) => { S.wrote[String(p)] = data; }),
    mkdirSync: vi.fn(),
    statSync: vi.fn(() => ({ mtimeMs: 0 }))
  };
});

async function loadGetTerminalId() {
  vi.resetModules();
  const mod = await import('../../lib/terminal-identity.js');
  return mod.getTerminalId;
}

describe('getTerminalId() ancestry-safe resolution (SD-FDBK-ENH-SESSION-IDENTITY-SPLIT-001)', () => {
  let savedSid, savedPort, savedPlatform;

  beforeEach(() => {
    savedSid = process.env.CLAUDE_SESSION_ID;
    savedPort = process.env.CLAUDE_CODE_SSE_PORT;
    savedPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    delete process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_CODE_SSE_PORT = PORT;
    // reset scenario
    S.ancestors = '';
    S.treewalk = '';
    S.scan = '';
    S.markers = {};
    S.wrote = {};
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: savedPlatform, configurable: true });
    if (savedSid === undefined) delete process.env.CLAUDE_SESSION_ID; else process.env.CLAUDE_SESSION_ID = savedSid;
    if (savedPort === undefined) delete process.env.CLAUDE_CODE_SSE_PORT; else process.env.CLAUDE_CODE_SSE_PORT = savedPort;
    vi.restoreAllMocks();
  });

  it('FR-1/TS-1: ancestor-owned marker wins over a sibling marker on a shared SSE port', async () => {
    // Tree-walk fails; ancestry includes ANCESTOR_PID (which owns marker UUID-A).
    // A sibling marker (UUID-B) also matches the port and could be the newest by mtime.
    S.treewalk = '';
    S.ancestors = `${process.pid},${ANCESTOR_PID}`;
    S.scan = `${SIBLING_PID}|node.exe foo --port ${PORT}`;
    S.markers = {
      [`pid-${ANCESTOR_PID}.json`]: { session_id: UUID_A, sse_port: PORT },
      [`pid-${SIBLING_PID}.json`]: { session_id: UUID_B, sse_port: PORT }
    };
    const getTerminalId = await loadGetTerminalId();
    const id = getTerminalId();
    expect(id).toBe(UUID_A);
    expect(id).not.toBe(UUID_B);
    expect(process.env.CLAUDE_SESSION_ID).toBe(UUID_A); // ancestry-verified, safe to cache
  });

  it('FR-3/TS-2: with only a non-ancestor sibling marker, falls through to a unique per-PID fallback (never the sibling UUID)', async () => {
    // Tree-walk fails; ancestry does NOT include the sibling PID; only the sibling marker exists.
    S.treewalk = '';
    S.ancestors = `${process.pid},${ANCESTOR_PID},2000`;
    S.scan = `${SIBLING_PID}|node.exe foo --port ${PORT}`;
    S.markers = {
      [`pid-${SIBLING_PID}.json`]: { session_id: UUID_B, sse_port: PORT }
    };
    const getTerminalId = await loadGetTerminalId();
    const id = getTerminalId();
    expect(id).not.toBe(UUID_B);
    expect(id).toMatch(/^win-(fallback-22186-\d+-[0-9a-f]{8}|pid-\d+)$/);
  });

  it('FR-2/TS-4: a non-ancestry-verified sibling UUID is never cached to process.env.CLAUDE_SESSION_ID', async () => {
    S.treewalk = '';
    S.ancestors = `${process.pid},${ANCESTOR_PID}`;
    S.scan = `${SIBLING_PID}|node.exe foo --port ${PORT}`;
    S.markers = {
      [`pid-${SIBLING_PID}.json`]: { session_id: UUID_B, sse_port: PORT }
    };
    const getTerminalId = await loadGetTerminalId();
    getTerminalId();
    expect(process.env.CLAUDE_SESSION_ID).not.toBe(UUID_B);
  });

  it('FR-4/TS-3: when CLAUDE_SESSION_ID is set, it is returned verbatim regardless of on-disk markers', async () => {
    process.env.CLAUDE_SESSION_ID = 'env-set-uuid-1234';
    // Even if a sibling marker exists, Priority-1 must short-circuit.
    S.markers = { [`pid-${SIBLING_PID}.json`]: { session_id: UUID_B, sse_port: PORT } };
    const getTerminalId = await loadGetTerminalId();
    expect(getTerminalId()).toBe('env-set-uuid-1234');
  });

  it('FR-1 edge: ancestry match also wins when the ancestor PID equals the discoverable CC PID (single-session legit case)', async () => {
    // Single conversation: exactly one marker, owned by an ancestor → resolves to its UUID.
    S.treewalk = '';
    S.ancestors = `${process.pid},${ANCESTOR_PID}`;
    S.markers = { [`pid-${ANCESTOR_PID}.json`]: { session_id: UUID_A, sse_port: PORT } };
    const getTerminalId = await loadGetTerminalId();
    expect(getTerminalId()).toBe(UUID_A);
  });

  it('FR-1 negative: sibling marker on a DIFFERENT sse_port is ignored even if its PID were an ancestor', async () => {
    // sse_port mismatch guard inside _scanMarkersByAncestry still applies.
    S.treewalk = '';
    S.ancestors = `${process.pid},${ANCESTOR_PID}`;
    S.scan = `${SIBLING_PID}|node.exe foo --port ${PORT}`;
    S.markers = {
      [`pid-${ANCESTOR_PID}.json`]: { session_id: UUID_B, sse_port: '99999' } // wrong port
    };
    const getTerminalId = await loadGetTerminalId();
    const id = getTerminalId();
    expect(id).not.toBe(UUID_B);
    expect(id).toMatch(/^win-(fallback-22186-\d+-[0-9a-f]{8}|pid-\d+)$/);
  });
});
