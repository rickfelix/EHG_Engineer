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
    // SD-LEO-INFRA-SILENT-TRUNCATION-ONE-001 FR-1: this assertion previously pinned
    // `session=coord-uu.` — the 8-character truncation — and so ENCODED the defect. A worker
    // addressing the coordinator builds target_session from this line, and an 8-char prefix stores,
    // prints success, and threads to nothing. The assertion is updated because the behaviour was
    // deliberately changed, not to chase a test green.
    const out = decide('worker-uuid', { callsign: 'Bravo' }, { session_id: 'coord-uuid-12345678' });
    expect(out[0]).toMatch(/WORKER \(callsign: Bravo\) under coordinator session=coord-uuid-12345678\./);
    // The negative half is the one that matters: the full id must not be accompanied by a
    // copyable abbreviation of itself.
    expect(out[0]).not.toMatch(/coord-uu[^i]/);
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
  // SD-LEO-FIX-ENF-TRUSTS-FILE-001: sourced from the hook's own exported COORD_FILE (VITEST-gated,
  // per-PID tmpdir path) rather than independently recomputed — an independent copy would silently
  // diverge from the hook's redirected constant and this describe block would read/write the real
  // .claude/active-coordinator.json while readCoordFile() reads the isolated fixture path.
  const COORD_PATH = loadHook().COORD_FILE;

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

  // QF-20260727-391 — the regression that mattered. These are VALID JSON, so the pre-fix
  // `JSON.parse` inside try/catch returned them happily; the bare string in particular is TRUTHY,
  // which made `if (!coordFile && sessionId)` false in main(), skipped findActiveCoord() entirely,
  // and left decide() reading `undefined` off a string — so every starting session was told SOLO
  // while a coordinator was live. A corrupt CACHE must degrade to the AUTHORITY, never override it,
  // and returning null is precisely what re-enables the DB fallback.
  it('returns null for a bare JSON string — truthy, valid JSON, and NOT a pointer', () => {
    fs.mkdirSync(path.dirname(COORD_PATH), { recursive: true });
    fs.writeFileSync(COORD_PATH, JSON.stringify('a59441f4-da45-4505-bb29-2b0d00cc70e1'));
    // Sanity: this parses to a truthy value, which is exactly why the old reader was fooled.
    expect(JSON.parse(fs.readFileSync(COORD_PATH, 'utf8'))).toBeTruthy();
    expect(readCoordFile()).toBeNull();
  });

  it('returns null for other truthy-but-shapeless payloads (number, array, object without session_id)', () => {
    fs.mkdirSync(path.dirname(COORD_PATH), { recursive: true });
    for (const payload of [42, ['a59441f4'], { started_at: 'now', host: 'h' }, { session_id: 123 }]) {
      fs.writeFileSync(COORD_PATH, JSON.stringify(payload));
      expect(readCoordFile(), `${JSON.stringify(payload)} must read as ABSENT`).toBeNull();
    }
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

  it('WORKER block surfaces the per-iteration coordinator check-in (poll inbox + ACK comms-check)', () => {
    const lines = workerLines('Bravo', 'abc12345').join('\n');
    expect(lines).toMatch(/check-in EVERY \/loop iteration/);
    expect(lines).toMatch(/fleet-dashboard\.cjs inbox/);
    expect(lines).toMatch(/WORK_ASSIGNMENT/);
    expect(lines).toMatch(/comms-check ack/);
    expect(lines).toMatch(/fleet-worker-loop-directive\.md/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// SD-LEO-INFRA-ROLE-BLIND-SESSION-001 FR-3 — decide() reads metadata.role before falling through
// to the worker directive. Two-sided: the role seat must LOSE the worker doctrine and the worker
// seat must KEEP it, because a fix that quiets a worker guard is worse than the noise it removes.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('FR-3 role-aware SessionStart', () => {
  // Same load pattern as the rest of this suite: the hook is .cjs and exports its pure
  // helpers, so we require() with a cache bust rather than importing at module scope.
  const { decide, workerLines, COORDINATOR } = loadHook();
  const COORD = { session_id: 'coord-abc' };
  // Match worker INSTRUCTIONS, not worker WORDS. The first version of this regex included
  // /belt|no callsign/ and failed on correct code, because the role lines legitimately say
  // "no claim, no belt, no callsign" — i.e. they name those things in order to DISCLAIM them.
  // Asserting the absence of a word is not the same as asserting the absence of a directive.
  const workerDoctrine = /SAME-TURN NEXT-CLAIM|WIND-DOWN HANDSHAKE|Coordinator check-in EVERY|\[ROLE\] WORKER \(/;

  it('a SOLOMON seat gets role lines, not the worker directive', () => {
    const out = decide('sess-solomon', { role: 'solomon' }, COORD).join('\n');
    expect(out).toMatch(/SOLOMON session \(non_fleet\)/);
    expect(out).not.toMatch(workerDoctrine);
  });

  it('an ADAM seat gets role lines — two distinct roles, so the axis is metadata.role not one name', () => {
    // Success criterion 5: a solomon-only test would admit a solomon-keyed implementation.
    const out = decide('sess-adam', { role: 'adam' }, COORD).join('\n');
    expect(out).toMatch(/ADAM session \(non_fleet\)/);
    expect(out).not.toMatch(workerDoctrine);
  });

  it('TWO-SIDED: a WORKER seat still gets the full worker directive, unchanged', () => {
    // The half that matters most. If this ever passes because the worker branch went quiet, the
    // fix has broken the guard it was supposed to preserve.
    const out = decide('sess-worker', { callsign: 'Alpha' }, COORD).join('\n');
    expect(out).toMatch(/WORKER \(callsign: Alpha\)/);
    expect(out).toMatch(/SAME-TURN NEXT-CLAIM/);
    expect(out).toMatch(/WIND-DOWN HANDSHAKE/);
  });

  it('an UNRECOGNISED role still gets the worker directive — the predicate gates on known roles', () => {
    const out = decide('sess-x', { role: 'gardener', callsign: 'Bravo' }, COORD).join('\n');
    expect(out).toMatch(/WORKER \(callsign: Bravo\)/);
  });

  it('the coordinator branch still wins, and still keys on its own signal', () => {
    // Pre-existing behaviour: coordinator is detected via is_coordinator, a DIFFERENT signal from
    // metadata.role. Pinning it so the new role branch cannot shadow it.
    expect(decide('c', { is_coordinator: true }, COORD)).toEqual(COORDINATOR);
  });

  it('CONTROL: the role assertions fail against the pre-fix behaviour', () => {
    // Without this, "role seat has no worker doctrine" would be satisfied by any output that
    // simply lacks those words — including an empty array. This proves the worker directive
    // really does contain what we assert its absence of.
    const preFix = workerLines('Alpha', COORD.session_id).join('\n');
    expect(preFix).toMatch(workerDoctrine);          // the doctrine is genuinely present...
    const roleOut = decide('sess-solomon', { role: 'solomon' }, COORD).join('\n');
    expect(roleOut).not.toBe(preFix);                // ...and the role path genuinely differs
  });
});
