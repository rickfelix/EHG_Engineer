/**
 * Tests for session-role-orient.cjs (QF-20260511-026).
 *
 * Pure-function tests for decide() + readCoordFile() + fetchMeta(), plus a
 * static-pin regression check that the three [ROLE] block constants remain
 * verbatim (workers, coordinators, and solo sessions read these at boot).
 *
 * Hook is .cjs and module.exports its pure helpers — we test via require()
 * with cache bust, mirroring concurrent-session-worktree.test.js.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOOK_PATH = path.resolve(__dirname, '../session-role-orient.cjs');

function loadHook() {
  delete require.cache[require.resolve(HOOK_PATH)];
  return require(HOOK_PATH);
}

// ─── decide() — pure routing ────────────────────────────────────────────────

describe('decide()', () => {
  let decide, SOLO, COORDINATOR;

  beforeEach(() => {
    ({ decide, SOLO, COORDINATOR } = loadHook());
  });

  it('returns COORDINATOR when meta.is_coordinator is true', () => {
    expect(decide('me', { is_coordinator: true }, null)).toBe(COORDINATOR);
  });

  it('returns COORDINATOR when coord file points to my own session (DB row absent)', () => {
    // File-only fallback: meta unavailable but the pointer file says I am the coord.
    const out = decide('abc123', null, { session_id: 'abc123' });
    expect(out).toBe(COORDINATOR);
  });

  it('returns workerLines when coord file points to a different session', () => {
    const out = decide('worker-uuid', { callsign: 'Bravo' }, { session_id: 'coord-uuid-12345678' });
    expect(out[0]).toMatch(/WORKER \(callsign: Bravo\) under coordinator session=coord-uu\./);
    expect(out[1]).toMatch(/\/signal <type>/);
    expect(out[2]).toMatch(/Types: stuck \| need-sweep/);
  });

  it('workerLines degrades to "no callsign" when metadata is missing', () => {
    const out = decide('worker-uuid', null, { session_id: 'coord-uuid-12345678' });
    expect(out[0]).toMatch(/WORKER \(no callsign\)/);
  });

  it('returns SOLO when there is no coord file and no metadata', () => {
    expect(decide('me', null, null)).toBe(SOLO);
  });

  it('returns SOLO when there is no coord file even with metadata present', () => {
    expect(decide('me', { callsign: 'Bravo' }, null)).toBe(SOLO);
  });
});

// ─── readCoordFile() — filesystem I/O ───────────────────────────────────────

describe('readCoordFile()', () => {
  let readCoordFile;
  let savedCoord;
  const COORD_PATH = path.resolve(__dirname, '../../../.claude/active-coordinator.json');

  beforeEach(() => {
    ({ readCoordFile } = loadHook());
    try { savedCoord = fs.existsSync(COORD_PATH) ? fs.readFileSync(COORD_PATH, 'utf8') : null; } catch { savedCoord = null; }
  });

  afterEach(() => {
    try {
      if (savedCoord === null && fs.existsSync(COORD_PATH)) fs.unlinkSync(COORD_PATH);
      else if (savedCoord !== null) fs.writeFileSync(COORD_PATH, savedCoord);
    } catch { /* ignore */ }
  });

  it('returns null when the file does not exist', () => {
    if (fs.existsSync(COORD_PATH)) fs.unlinkSync(COORD_PATH);
    expect(readCoordFile()).toBeNull();
  });

  it('returns parsed JSON when the file exists', () => {
    fs.mkdirSync(path.dirname(COORD_PATH), { recursive: true });
    fs.writeFileSync(COORD_PATH, JSON.stringify({ session_id: 'abc', started_at: 'now', host: 'h' }));
    expect(readCoordFile()).toEqual({ session_id: 'abc', started_at: 'now', host: 'h' });
  });

  it('returns null on malformed JSON (no throw)', () => {
    fs.mkdirSync(path.dirname(COORD_PATH), { recursive: true });
    fs.writeFileSync(COORD_PATH, '{not json');
    expect(readCoordFile()).toBeNull();
  });
});

// ─── fetchMeta() — Supabase wrapper ─────────────────────────────────────────

describe('fetchMeta()', () => {
  let fetchMeta;
  let envSnapshot;

  beforeEach(() => {
    ({ fetchMeta } = loadHook());
    envSnapshot = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  });

  afterEach(() => {
    process.env.SUPABASE_URL = envSnapshot.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = envSnapshot.key;
    vi.restoreAllMocks();
  });

  it('returns null when SUPABASE_URL is missing (fail-soft)', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
    expect(await fetchMeta('any')).toBeNull();
  });

  it('returns metadata object on 200 OK with row present', async () => {
    process.env.SUPABASE_URL = 'http://x.local';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ metadata: { is_coordinator: true, callsign: 'Alpha' } }]
    }));
    expect(await fetchMeta('s1')).toEqual({ is_coordinator: true, callsign: 'Alpha' });
  });

  it('returns null on non-2xx response (fail-soft, no throw)', async () => {
    process.env.SUPABASE_URL = 'http://x.local';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    expect(await fetchMeta('s1')).toBeNull();
  });

  it('returns null when fetch throws (network error)', async () => {
    process.env.SUPABASE_URL = 'http://x.local';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect(await fetchMeta('s1')).toBeNull();
  });

  it('returns null when the response is an empty array (no row for this session)', async () => {
    process.env.SUPABASE_URL = 'http://x.local';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    expect(await fetchMeta('s1')).toBeNull();
  });
});

// ─── findActiveCoord() — DB fallback for worktree workers ──────────────────

describe('findActiveCoord()', () => {
  let findActiveCoord;

  beforeEach(() => {
    ({ findActiveCoord } = loadHook());
    process.env.SUPABASE_URL = 'http://x.local';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('returns the coordinator session_id when DB returns a row', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ session_id: 'coord-xyz' }]
    }));
    expect(await findActiveCoord()).toBe('coord-xyz');
  });

  it('returns null when no coordinator session is fresh', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    expect(await findActiveCoord()).toBeNull();
  });

  it('issues a PostgREST query with the is_coordinator filter and heartbeat cutoff', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchSpy);
    await findActiveCoord();
    const calledUrl = fetchSpy.mock.calls[0][0];
    expect(calledUrl).toMatch(/metadata->>is_coordinator=eq\.true/);
    expect(calledUrl).toMatch(/heartbeat_at=gte\./);
    expect(calledUrl).toMatch(/order=heartbeat_at\.desc/);
    expect(calledUrl).toMatch(/limit=1/);
  });
});

// ─── Static-pin: verbatim [ROLE] block content ──────────────────────────────
// Workers read these blocks at boot to learn the /signal channel — wording is
// part of the user-visible behavior, not an implementation detail. Pin so an
// accidental edit (e.g. dropping the threshold list) fails the test.

describe('static-pin: [ROLE] block content', () => {
  let SOLO, COORDINATOR, workerLines;

  beforeEach(() => {
    ({ SOLO, COORDINATOR, workerLines } = loadHook());
  });

  it('SOLO block names the canonical pause points + /leo assist fallback', () => {
    const joined = SOLO.join('\n');
    expect(joined).toMatch(/SOLO/);
    expect(joined).toMatch(/Canonical pause points/);
    expect(joined).toMatch(/\/leo assist Phase 1/);
  });

  it('COORDINATOR block names /coordinator inbox + 60min aggregation rule', () => {
    const joined = COORDINATOR.join('\n');
    expect(joined).toMatch(/COORDINATOR/);
    expect(joined).toMatch(/\/coordinator inbox/);
    expect(joined).toMatch(/60min/);
    expect(joined).toMatch(/harness_backlog/);
  });

  it('WORKER block names /signal trigger thresholds + 7 type vocabulary', () => {
    const lines = workerLines('Bravo', 'abc12345').join('\n');
    expect(lines).toMatch(/WORKER/);
    expect(lines).toMatch(/gate 2×/);
    expect(lines).toMatch(/RCA 2×/);
    expect(lines).toMatch(/tool 3×/);
    expect(lines).toMatch(/stuck \| need-sweep \| prd-ambiguous \| gate-bug \| spec-conflict \| harness-bug \| feedback \| other/);
    expect(lines).toMatch(/--low\|medium\|high\|critical/);
  });
});
