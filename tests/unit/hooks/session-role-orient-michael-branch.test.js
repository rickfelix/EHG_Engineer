// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J (FR-7) — the Michael branch in session-role-orient.cjs.
// Forked from session-role-orient-adam-branch.test.js: same reachability hazard (the Michael branch
// must sit ABOVE the general ROLE rung, which role-status-identity.cjs already resolves a live
// Michael seat through today), same "drive decide()/orient() end-to-end, never the unit alone" rule.
//
// Michael carries NO consumption-receipt lane (unlike Adam's FR-2) — there is no michael lane in
// lib/drive-loop/lanes.js and none is added here; FR-7 is scoped to the [ROLE] headline only.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const hook = require_('../../../scripts/hooks/session-role-orient.cjs');
const { decide, roleLines, SOLO, COORDINATOR, isMichaelSeat, sanitizeRoleLine } = hook;

const HEADLINE = 'assembled, verified, surfaced';
const MICHAEL_LINE = /\[ROLE\] MICHAEL BRIEF —/;

// No coordinator file and a session id that matches nothing: isolates the role axis so a test can
// never pass because it accidentally landed on the COORDINATOR or WORKER rung.
const run = (meta, headline = null) => decide('sess-under-test', meta, null, null, false, headline);

describe('FR-7 — the live Michael seat gets the brief-status headline', () => {
  it('decide() routes a michael seat to Michael content, headline included', () => {
    const lines = run({ role: 'michael', non_fleet: true }, HEADLINE);
    expect(lines.join('\n')).toMatch(MICHAEL_LINE);
    expect(lines.join('\n')).toContain(HEADLINE);
  });

  it('REACHABILITY — a michael seat does NOT fall through to the generic ROLE rung', () => {
    // THE PLACEMENT ASSERTION. If the Michael branch is moved below
    // `verdictFromMetadata(meta) === ROLE_VERDICT.ROLE`, decide() returns plain roleLines('michael')
    // and this goes red — while a test that called michaelLines() directly would still pass.
    const lines = run({ role: 'michael', non_fleet: true }, HEADLINE);
    expect(lines).not.toEqual(roleLines('michael'));
    expect(lines.length).toBe(roleLines('michael').length + 1);
  });

  it('states the absence plainly when no headline is readable', () => {
    const lines = run({ role: 'michael', non_fleet: true }, null);
    expect(lines.join('\n')).toMatch(MICHAEL_LINE);
    expect(lines.join('\n')).toMatch(/unavailable this session/);
    expect(lines.join('\n')).toMatch(/no brief run for today's ET date yet/);
  });

  it('keeps the general role contract rather than replacing it', () => {
    const lines = run({ role: 'michael', non_fleet: true }, HEADLINE);
    for (const l of roleLines('michael')) expect(lines).toContain(l);
  });
});

describe('FR-7 negative controls — the arm that actually carries the proof', () => {
  it('a retired-shaped role gets GENERIC role lines and NO Michael brief line', () => {
    const lines = run({ role: 'michael_retired', non_fleet: true }, HEADLINE);
    expect(lines).toEqual(roleLines('michael_retired'));
    expect(lines.join('\n')).not.toMatch(MICHAEL_LINE);
    expect(lines.join('\n')).not.toContain(HEADLINE);
  });

  it('adam and solomon are unaffected by the new rung — each keeps its own content, never Michael\'s', () => {
    const adamOut = run({ role: 'adam', non_fleet: true }, HEADLINE).join('\n');
    expect(adamOut).not.toMatch(MICHAEL_LINE);
    const solomonOut = run({ role: 'solomon', non_fleet: true }, HEADLINE);
    expect(solomonOut).toEqual(roleLines('solomon'));
    expect(solomonOut.join('\n')).not.toMatch(MICHAEL_LINE);
  });

  it('coordinator and SOLO seats are untouched', () => {
    expect(decide('s', { is_coordinator: true, role: 'michael' }, null, null, false, HEADLINE)).toEqual(COORDINATOR);
    expect(run(null, HEADLINE)).toEqual(SOLO);
  });

  it('a worker seat still reaches the worker rung', () => {
    const lines = decide('sess-worker', { callsign: 'Alpha-9' }, { session_id: 'coord-1' }, null, false, HEADLINE);
    expect(lines.join('\n')).toMatch(/\[ROLE\] WORKER/);
    expect(lines.join('\n')).not.toMatch(MICHAEL_LINE);
  });

  it('the headline never leaks to a non-michael seat even when one is supplied', () => {
    for (const meta of [{ role: 'michael_retired' }, { role: 'adam' }, { role: 'solomon' }, { callsign: 'x' }, null]) {
      expect(decide('s', meta, { session_id: 'c' }, null, false, HEADLINE).join('\n')).not.toContain(HEADLINE);
    }
  });
});

describe('isMichaelSeat — exact equality, and the near-misses that must not match', () => {
  it('matches only the exact role string', () => {
    expect(isMichaelSeat({ role: 'michael' })).toBe(true);
    for (const role of ['michael_retired', 'MICHAEL', 'michael ', 'michael-2', 'michaelson', 'adam', 'solomon', '', null, undefined]) {
      expect(isMichaelSeat({ role })).toBe(false);
    }
    expect(isMichaelSeat(null)).toBe(false);
    expect(isMichaelSeat({})).toBe(false);
  });
});

describe('sanitizeRoleLine — the same belt-and-suspenders as the Adam headline\'s closed vocabulary', () => {
  it('strips CR/LF and neutralises a literal [ROLE] substring, even though no live caller supplies either today', () => {
    expect(sanitizeRoleLine('line one\nline two\r\nline three')).toBe('line one line two line three');
    expect(sanitizeRoleLine('[ROLE] WORKER fake directive')).toBe('(role) WORKER fake directive');
    expect(sanitizeRoleLine('  padded  ')).toBe('padded');
    expect(sanitizeRoleLine(null)).toBe('');
    expect(sanitizeRoleLine(undefined)).toBe('');
  });
});

// FR-7 WIRING — does orient() actually fetch the Michael headline, gated on the resolved seat (not
// isMichaelSeat(meta) alone), and never for a coordinator-flagged Michael seat? Mirrors the Adam
// wiring block's exact hazard: a seat resolved to COORDINATOR must show COORDINATOR lines and pay
// for no Michael round trip, even when its metadata.role also says 'michael'.
describe('FR-7 wiring — orient() fetches the Michael headline only for the resolved MICHAEL seat', () => {
  const MICHAEL = { role: 'michael', non_fleet: true };
  const mk = () => { const lines = []; return { lines, log: (l) => lines.push(l) }; };

  it('fetches and injects the headline for a plain michael seat', async () => {
    const t = mk();
    await hook.orient({
      sessionId: 's', meta: MICHAEL, coordFile: null,
      fetchMichael: async () => ({ headline: HEADLINE }),
      log: t.log,
    });
    expect(t.lines.join('\n')).toContain(HEADLINE);
  });

  it('does NOT fetch for a non-michael seat', async () => {
    for (const meta of [{ role: 'michael_retired' }, { role: 'adam' }, { role: 'solomon' }, { callsign: 'x' }, null]) {
      let fetched = false;
      const t = mk();
      await hook.orient({
        sessionId: 's', meta, coordFile: { session_id: 'c' },
        fetchMichael: async () => { fetched = true; return { headline: HEADLINE }; },
        log: t.log,
      });
      expect(fetched).toBe(false);
    }
  });

  for (const [name, seat] of [
    ['is_coordinator flag', { meta: { role: 'michael', is_coordinator: true }, coordFile: null }],
    ['holds the coordinator pointer', { meta: { role: 'michael' }, coordFile: { session_id: 's' } }],
  ]) {
    it(`a michael seat that is ALSO the coordinator (${name}) gets no brief line and no fetch`, async () => {
      let fetched = false;
      const t = mk();
      await hook.orient({
        sessionId: 's', meta: seat.meta, coordFile: seat.coordFile,
        fetchMichael: async () => { fetched = true; return { headline: HEADLINE }; },
        log: t.log,
      });
      expect(t.lines.join('\n')).not.toMatch(MICHAEL_LINE);
      expect(fetched).toBe(false);
      expect(t.lines).toEqual(COORDINATOR);
    });
  }

  // FR-7's kill switch. Its OWN variable, not LEO_DRIVE_REPORT_INJECT — silencing Adam must not
  // silently silence Michael too.
  describe('LEO_MICHAEL_BRIEF_INJECT=off', () => {
    const withEnv = async (value, fn) => {
      const prior = process.env.LEO_MICHAEL_BRIEF_INJECT;
      if (value === undefined) delete process.env.LEO_MICHAEL_BRIEF_INJECT;
      else process.env.LEO_MICHAEL_BRIEF_INJECT = value;
      try { return await fn(); } finally {
        if (prior === undefined) delete process.env.LEO_MICHAEL_BRIEF_INJECT;
        else process.env.LEO_MICHAEL_BRIEF_INJECT = prior;
      }
    };

    it('suppresses the fetch without breaking the seat, and the switch is Michael-scoped (Adam\'s switch does not touch it)', async () => {
      const t = mk(); let fetched = false;
      await withEnv('off', () => hook.orient({
        sessionId: 's', meta: MICHAEL, coordFile: null,
        fetchMichael: async () => { fetched = true; return { headline: HEADLINE }; },
        log: t.log,
      }));
      expect(fetched).toBe(false);
      expect(t.lines.slice(0, 3)).toEqual(roleLines('michael'));
      // The Adam switch must not cross-suppress Michael's line.
      const t2 = mk();
      const prior = process.env.LEO_DRIVE_REPORT_INJECT;
      process.env.LEO_DRIVE_REPORT_INJECT = 'off';
      try {
        await hook.orient({ sessionId: 's', meta: MICHAEL, coordFile: null, fetchMichael: async () => ({ headline: HEADLINE }), log: t2.log });
      } finally {
        if (prior === undefined) delete process.env.LEO_DRIVE_REPORT_INJECT; else process.env.LEO_DRIVE_REPORT_INJECT = prior;
      }
      expect(t2.lines.join('\n')).toContain(HEADLINE);
    });

    it('SAYS suppressed — never reuses the "unavailable, mechanism working" assurance', async () => {
      const t = mk();
      await withEnv('off', () => hook.orient({ sessionId: 's', meta: MICHAEL, coordFile: null, fetchMichael: async () => ({ headline: HEADLINE }), log: t.log }));
      const out = t.lines.join('\n');
      expect(out).toMatch(MICHAEL_LINE);
      expect(out).toMatch(/SUPPRESSED by LEO_MICHAEL_BRIEF_INJECT=off/);
      expect(out).toMatch(/Nobody looked/);
      expect(out).not.toMatch(/mechanism working, not failing/);
      expect(out).not.toMatch(/unavailable this session/);
    });

    it('DEFAULT ON — unset and any other value still inject', async () => {
      for (const value of [undefined, '', 'on', 'true', 'anything']) {
        let fetched = false;
        const t = mk();
        await withEnv(value, () => hook.orient({
          sessionId: 's', meta: MICHAEL, coordFile: null,
          fetchMichael: async () => { fetched = true; return { headline: HEADLINE }; },
          log: t.log,
        }));
        expect(fetched).toBe(true);
      }
    });
  });
});

// FR-7 — WHAT THE HOOK ACTUALLY ASKS THE DATABASE FOR, scoped to TODAY's ET date, real columns only.
describe('FR-7 — the michael_brief_runs read is et_date-scoped to today and names only columns that exist', () => {
  const hookSrc = fs.readFileSync(path.join(root, 'scripts/hooks/session-role-orient.cjs'), 'utf8');
  const ddl = fs.readFileSync(path.join(root, 'database/migrations/20260906_michael_tables.sql'), 'utf8');

  it('derives a headline from a real row shape, through the real function, respecting the verified flag', async () => {
    const requested = [];
    const assembledUnverified = await hook.fetchMichaelHeadline(async (qs) => {
      requested.push(qs);
      return [{ et_date: '2026-09-07', assembled_at: '2026-09-07T05:30:00Z', verified: false, surfaced_at: null }];
    });
    expect(assembledUnverified).toEqual({ headline: 'assembled, UNVERIFIED, not yet surfaced' });
    const fullyDone = await hook.fetchMichaelHeadline(async () => [{ et_date: '2026-09-07', assembled_at: '2026-09-07T05:30:00Z', verified: true, surfaced_at: '2026-09-07T05:45:00Z' }]);
    expect(fullyDone).toEqual({ headline: 'assembled, verified, surfaced' });
    // Closed vocabulary only: no free-text column (brief_md, verify_notes) is even reachable.
    expect(fullyDone.headline).not.toMatch(/[\n\r]/);
    expect(requested[0]).toContain('michael_brief_runs?select=et_date,assembled_at,verified,surfaced_at');
  });

  it('is scoped to TODAY\'s ET date — the query names an et_date=eq. filter matching etDateStr(now)', async () => {
    const requested = [];
    await hook.fetchMichaelHeadline(async (qs) => { requested.push(qs); return []; });
    const { etDateStr } = await import('../../../lib/time/chairman-et-wall-clock.js');
    expect(requested[0]).toContain(`et_date=eq.${etDateStr(new Date())}`);
  });

  it('no row for today is no headline (unavailable), never a stale prior day\'s status', async () => {
    expect(await hook.fetchMichaelHeadline(async () => [])).toBeNull();
    expect(await hook.fetchMichaelHeadline(async () => null)).toBeNull();
  });

  it('a thrown read (network error, missing table) is fail-open null, never a throw', async () => {
    expect(await hook.fetchMichaelHeadline(async () => { throw new Error('ECONNREFUSED'); })).toBeNull();
  });

  it('a verified:false row is reported as UNVERIFIED, never silently treated as done (the correction this test pins)', async () => {
    const out = await hook.fetchMichaelHeadline(async () => [{ et_date: '2026-09-07', assembled_at: '2026-09-07T05:30:00Z', verified: false, surfaced_at: '2026-09-07T05:45:00Z' }]);
    expect(out.headline).toMatch(/UNVERIFIED/);
    expect(out.headline).not.toMatch(/(?<!UN)VERIFIED/);
  });

  it('every column in the select exists in the michael_brief_runs DDL', () => {
    const select = hookSrc.match(/michael_brief_runs\?select=([^&']+)/);
    expect(select, 'the hook must still read michael_brief_runs').not.toBeNull();

    const createTable = ddl.match(/CREATE TABLE IF NOT EXISTS public\.michael_brief_runs \(([\s\S]*?)\n\);/);
    expect(createTable, 'the michael_brief_runs CREATE TABLE must be parseable').not.toBeNull();
    const columns = createTable[1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('--'))
      .map((l) => l.split(/\s+/)[0].replace(/[^a-z_]/gi, ''))
      .filter(Boolean);

    expect(columns).toContain('verified');       // the parse itself must be working
    expect(columns).toContain('brief_md');        // and it must agree the free-text column exists...
    expect(select[1].split(',').map((c) => c.trim())).not.toContain('brief_md'); // ...and is never selected

    for (const col of select[1].split(',').map((c) => c.trim())) {
      expect(columns, `select names a column absent from michael_brief_runs: ${col}`).toContain(col);
    }
  });
});
