// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-D (FR-1) — the Adam branch in session-role-orient.cjs.
//
// EVERY TEST HERE DRIVES decide() END-TO-END. None of them call adamLines() or isAdamSeat() to
// establish the behaviour under test, and that is deliberate rather than stylistic.
//
// THE FAILURE MODE THIS SUITE EXISTS TO CATCH: the Adam branch must sit ABOVE the general ROLE rung
// (`verdictFromMetadata(meta) === ROLE_VERDICT.ROLE`). That rung is a BROAD match which a live Adam
// seat satisfies, so a branch placed after it is UNREACHABLE — and it would be DEAD CODE THAT TESTS
// GREEN for any suite that calls the branch function directly. A test that exercises the unit
// cannot see that the path never arrives. So the unit is never the subject; decide() is.
//
// THE OTHER FAILURE MODE, measured rather than imagined: over 108 sessions with a 14d heartbeat,
// metadata.role is adam_retired:6, adam:1, solomon:1, coordinator:1. Retired seats OUTNUMBER the
// live one 6:1, so a predicate written the obvious way (startsWith('adam') / /adam/) passes the
// positive test while leaking Adam-only content to six dead seats. With one live Adam session in
// the whole fleet, the positive arm has a population of 1 — the NEGATIVE arm carries the proof.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const hook = require_('../../../scripts/hooks/session-role-orient.cjs');
const { decide, roleLines, SOLO, COORDINATOR, isAdamSeat } = hook;

const HEADLINE = 'Wave 3 gate blocked on chairman review';
const DRIVE_LINE = /\[ROLE\] DRIVE REPORT —/;

// No coordinator file and a session id that matches nothing: isolates the role axis so a test can
// never pass because it accidentally landed on the COORDINATOR or WORKER rung.
const run = (meta, headline = null) => decide('sess-under-test', meta, null, headline);

describe('FR-1 — the live Adam seat gets the Drive Report headline', () => {
  it('decide() routes an adam seat to Adam content, headline included', () => {
    const lines = run({ role: 'adam', non_fleet: true }, HEADLINE);
    expect(lines.join('\n')).toMatch(DRIVE_LINE);
    expect(lines.join('\n')).toContain(HEADLINE);
  });

  it('REACHABILITY — an adam seat does NOT fall through to the generic ROLE rung', () => {
    // THE PLACEMENT ASSERTION. If the Adam branch is moved below
    // `verdictFromMetadata(meta) === ROLE_VERDICT.ROLE`, decide() returns plain roleLines('adam')
    // and this goes red — while a test that called adamLines() directly would still pass.
    const lines = run({ role: 'adam', non_fleet: true }, HEADLINE);
    expect(lines).not.toEqual(roleLines('adam'));
    expect(lines.length).toBe(roleLines('adam').length + 1);
  });

  it('states the absence plainly when no headline is readable', () => {
    // Today this is the LIVE path: drive_reports does not exist until PR #6784 lands. A seat that
    // sees nothing cannot tell "no report today" from "the injection is broken", so the line is
    // emitted either way.
    const lines = run({ role: 'adam', non_fleet: true }, null);
    expect(lines.join('\n')).toMatch(DRIVE_LINE);
    expect(lines.join('\n')).toMatch(/unavailable this session/);
  });

  it('keeps the general role contract rather than replacing it', () => {
    // Adam IS a role seat. Everything roleLines says about a non-fleet seat is still true of him,
    // so a future edit to the role contract must not silently miss this seat.
    const lines = run({ role: 'adam', non_fleet: true }, HEADLINE);
    for (const l of roleLines('adam')) expect(lines).toContain(l);
  });
});

describe('FR-1 negative controls — the arm that actually carries the proof', () => {
  it('adam_retired gets the GENERIC role lines and NO Drive Report', () => {
    // THE LOAD-BEARING TEST. adam_retired satisfies the same broad ROLE verdict as adam, and there
    // are SIX of them against one live seat. startsWith('adam') and /adam/ both pass the positive
    // test above and FAIL here — leaking Adam-only content to dead seats.
    const lines = run({ role: 'adam_retired', non_fleet: true }, HEADLINE);
    expect(lines).toEqual(roleLines('adam_retired'));
    expect(lines.join('\n')).not.toMatch(DRIVE_LINE);
    expect(lines.join('\n')).not.toContain(HEADLINE);
  });

  it('solomon is byte-identical to its pre-change output', () => {
    // Solomon shares the very ROLE rung this change inserts into, which makes it the most likely
    // collateral of the edit. Asserted here, on the leg actively changing the ladder, rather than
    // appended to a completed SD's shipped surface.
    const lines = run({ role: 'solomon', non_fleet: true }, HEADLINE);
    expect(lines).toEqual(roleLines('solomon'));
    expect(lines.join('\n')).not.toMatch(DRIVE_LINE);
  });

  it('coordinator and SOLO seats are untouched', () => {
    expect(decide('s', { is_coordinator: true, role: 'adam' }, null, HEADLINE)).toEqual(COORDINATOR);
    expect(run(null, HEADLINE)).toEqual(SOLO);
  });

  it('a worker seat still reaches the worker rung', () => {
    const lines = decide('sess-worker', { callsign: 'Alpha-9' }, { session_id: 'coord-1' }, HEADLINE);
    expect(lines.join('\n')).toMatch(/\[ROLE\] WORKER/);
    expect(lines.join('\n')).not.toMatch(DRIVE_LINE);
  });

  it('the headline never leaks to a non-adam seat even when one is supplied', () => {
    // Two-sided: the fetch is gated on isAdamSeat in main(), but decide() must not depend on the
    // caller having gated correctly.
    for (const meta of [{ role: 'adam_retired' }, { role: 'solomon' }, { callsign: 'x' }, null]) {
      expect(decide('s', meta, { session_id: 'c' }, HEADLINE).join('\n')).not.toContain(HEADLINE);
    }
  });
});

describe('isAdamSeat — exact equality, and the near-misses that must not match', () => {
  it('matches only the exact role string', () => {
    expect(isAdamSeat({ role: 'adam' })).toBe(true);
    for (const role of ['adam_retired', 'ADAM', 'adam ', 'adam-2', 'adamant', 'solomon', '', null, undefined]) {
      expect(isAdamSeat({ role })).toBe(false);
    }
    expect(isAdamSeat(null)).toBe(false);
    expect(isAdamSeat({})).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// FR-2 WIRING — does the hook actually CALL the receipt writer?
//
// THIS IS THE ASSERTION THE SD FAMILY HAS MISSED TWICE. A test that calls stampAdamReceipt() or
// writeConsumptionReceipt() directly proves the WRITER works and proves nothing about whether
// anything invokes it. Both prior instances tested green with the wiring absent: once caught only
// by a drop-the-call mutation on QF-20260803-422, once specified as TS-9 and never implemented.
//
// So these drive orient() — the real control flow main() runs — with injected fakes, and assert on
// the CALL. The dependencies are parameters precisely so this can be checked without a live table,
// which matters because drive_report_receipts does not exist: the migration is chairman-gated and
// unapplied. Nothing below is integration evidence.
describe('FR-2 wiring — orient() invokes the receipt writer for the Adam seat', () => {
  const ADAM = { role: 'adam', non_fleet: true };
  const REPORT = { id: 'rep-1', headline: 'Wave 3 gate blocked' };
  const mk = () => { const lines = [], stamped = []; return { lines, stamped, log: (l) => lines.push(l) }; };

  it('stamps a receipt against the report it just injected', async () => {
    const t = mk();
    await hook.orient({
      sessionId: 's', meta: ADAM, coordFile: null,
      fetchReport: async () => REPORT,
      stamp: async (id) => { t.stamped.push(id); return { written: true, lane: 'adam' }; },
      log: t.log,
    });
    // The call happened, and it named the SAME report whose headline was emitted.
    expect(t.stamped).toEqual(['rep-1']);
    expect(t.lines.join('\n')).toContain('Wave 3 gate blocked');
  });

  it('does NOT stamp for a non-adam seat — no receipt without a delivery', async () => {
    for (const meta of [{ role: 'adam_retired' }, { role: 'solomon' }, { callsign: 'x' }, null]) {
      const t = mk();
      await hook.orient({
        sessionId: 's', meta, coordFile: { session_id: 'c' },
        fetchReport: async () => REPORT,
        stamp: async (id) => { t.stamped.push(id); return { written: true }; },
        log: t.log,
      });
      expect(t.stamped).toEqual([]);
    }
  });

  it('SURFACES a refused receipt instead of swallowing it', async () => {
    const t = mk();
    await hook.orient({
      sessionId: 's', meta: ADAM, coordFile: null,
      fetchReport: async () => REPORT,
      stamp: async () => ({ written: false, reason: 'write_refused', lane: 'adam', error: 'relation does not exist' }),
      log: t.log,
      describe: (v) => `receipt: NOT WRITTEN for lane ${v.lane} — ${v.reason}`,
    });
    expect(t.lines.join('\n')).toMatch(/NOT WRITTEN/);
    expect(t.lines.join('\n')).toMatch(/lane adam/);
  });

  it('treats a NULL verdict as not-written rather than as nothing to say', async () => {
    const t = mk();
    await hook.orient({
      sessionId: 's', meta: ADAM, coordFile: null,
      fetchReport: async () => REPORT,
      stamp: async () => null,
      log: t.log,
      describe: () => 'receipt: NOT WRITTEN for lane adam',
    });
    expect(t.lines.join('\n')).toMatch(/NOT WRITTEN/);
  });

  it('stays SILENT on success — the row is the evidence, not a log line', async () => {
    const t = mk();
    await hook.orient({
      sessionId: 's', meta: ADAM, coordFile: null,
      fetchReport: async () => REPORT,
      stamp: async () => ({ written: true, lane: 'adam' }),
      log: t.log,
      describe: () => 'SHOULD NOT APPEAR',
    });
    expect(t.lines.join('\n')).not.toMatch(/NOT WRITTEN|SHOULD NOT APPEAR/);
  });

  it('no report means no receipt — a receipt may only claim an actual delivery', async () => {
    const t = mk();
    const v = await hook.orient({
      sessionId: 's', meta: ADAM, coordFile: null,
      fetchReport: async () => null,
      stamp: async (id) => { t.stamped.push(id); return { written: true }; },
      log: t.log,
    });
    expect(t.stamped).toEqual([]);
    expect(v).toBeNull();
    // The seat is still oriented and still told the report is unavailable.
    expect(t.lines.join('\n')).toMatch(/unavailable this session/);
  });

  // THE COORDINATOR-FLAGGED ADAM SEAT. Found by the SECURITY sub-agent driving orient() rather than
  // reading it. decide() checks both coordinator rungs BEFORE the adam rung, but orient() used to
  // gate its fetch and its stamp on isAdamSeat(meta) alone — so this seat was shown COORDINATOR
  // lines, no headline, and stamped a receipt claiming it had consumed the report anyway.
  //
  // A receipt that can attest to a delivery that did not happen is worse than no receipt: it is
  // indistinguishable in the table from a real one, so it corrupts the very measurement this SD
  // family exists to produce. Both arms are asserted together on purpose — "no drive line" and
  // "no receipt" are the two halves of one claim, and a fix that restored the content while leaving
  // the stamp (or vice versa) would still be wrong.
  for (const [name, seat] of [
    ['is_coordinator flag', { meta: { role: 'adam', is_coordinator: true }, coordFile: null }],
    ['holds the coordinator pointer', { meta: { role: 'adam' }, coordFile: { session_id: 's' } }],
  ]) {
    it(`an adam seat that is ALSO the coordinator (${name}) gets no drive line AND no receipt`, async () => {
      const t = mk();
      const v = await hook.orient({
        sessionId: 's', meta: seat.meta, coordFile: seat.coordFile,
        fetchReport: async () => REPORT,
        stamp: async (id) => { t.stamped.push(id); return { written: true, lane: 'adam' }; },
        log: t.log,
      });
      expect(t.lines.join('\n')).not.toMatch(DRIVE_LINE);
      expect(t.stamped).toEqual([]);
      expect(v).toBeNull();
      // Not merely "no adam content" — it received the coordinator orientation it was owed.
      expect(t.lines).toEqual(COORDINATOR);
    });
  }

  // TR-2's kill switch. The env-gate half of the "env-gated + fail-open" contract was claimed by
  // the PRD and absent from the code until the SECURITY sub-agent measured it.
  describe('TR-2 — LEO_DRIVE_REPORT_INJECT=off', () => {
    const withEnv = async (value, fn) => {
      const prior = process.env.LEO_DRIVE_REPORT_INJECT;
      if (value === undefined) delete process.env.LEO_DRIVE_REPORT_INJECT;
      else process.env.LEO_DRIVE_REPORT_INJECT = value;
      try { return await fn(); } finally {
        if (prior === undefined) delete process.env.LEO_DRIVE_REPORT_INJECT;
        else process.env.LEO_DRIVE_REPORT_INJECT = prior;
      }
    };

    it('suppresses the fetch and the receipt without breaking the seat', async () => {
      const t = mk(); const fetched = [];
      await withEnv('off', () => hook.orient({
        sessionId: 's', meta: ADAM, coordFile: null,
        fetchReport: async () => { fetched.push(1); return REPORT; },
        stamp: async (id) => { t.stamped.push(id); return { written: true }; },
        log: t.log,
      }));
      expect(fetched).toEqual([]);
      expect(t.stamped).toEqual([]);
      // The seat is STILL oriented — the switch kills the Drive Report injection, not the hook.
      // Gating the whole hook off would tell every worker in the fleet it was SOLO.
      expect(t.lines.slice(0, 3)).toEqual(roleLines('adam'));
    });

    it('DEFAULT ON — unset and any other value still inject', async () => {
      for (const value of [undefined, '', 'on', 'true', 'anything']) {
        const t = mk();
        await withEnv(value, () => hook.orient({
          sessionId: 's', meta: ADAM, coordFile: null,
          fetchReport: async () => REPORT,
          stamp: async (id) => { t.stamped.push(id); return { written: true }; },
          log: t.log,
        }));
        expect(t.stamped).toEqual(['rep-1']);
      }
    });
  });
});

// FR-1 — WHAT THE HOOK ACTUALLY ASKS THE DATABASE FOR.
//
// This shipped as `select=id,headline`. There is no headline column: drive_reports is
// (id, generated_at, run_id, cadence, sections, drive_score, schema_version, metadata). PostgREST
// answers a phantom column with 400/42703 across the WHOLE projection — so the read failed, pgGet
// returned null, and FR-1 and FR-2 were both permanently dead while the seat's "unavailable" line
// and the code's own comments explained the silence away as waiting on the gated migration.
//
// Asserted against the MIGRATION rather than a hand-copied column list, so the day a column is
// renamed this test fails instead of agreeing with a stale copy of the schema.
describe('FR-1 — the drive_reports read names only columns that exist', () => {
  const hookSrc = fs.readFileSync(path.join(root, 'scripts/hooks/session-role-orient.cjs'), 'utf8');
  const ddl = fs.readFileSync(path.join(root, 'database/migrations/20260803_drive_reports.sql'), 'utf8');

  it('every column in the select exists in the drive_reports DDL', () => {
    const select = hookSrc.match(/drive_reports\?select=([^&']+)/);
    expect(select, 'the hook must still read drive_reports').not.toBeNull();

    const createTable = ddl.match(/CREATE TABLE IF NOT EXISTS public\.drive_reports \(([\s\S]*?)\n\);/);
    expect(createTable, 'the drive_reports CREATE TABLE must be parseable').not.toBeNull();
    const columns = createTable[1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('--'))
      .map((l) => l.split(/\s+/)[0].replace(/[^a-z_]/gi, ''))
      .filter(Boolean);

    expect(columns).toContain('drive_score');   // the parse itself must be working
    expect(columns).not.toContain('headline');  // and it must agree that this one is absent

    for (const col of select[1].split(',').map((c) => c.trim())) {
      expect(columns, `select names a column absent from drive_reports: ${col}`).toContain(col);
    }
  });
});
