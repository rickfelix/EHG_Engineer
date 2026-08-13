/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — the JS constants and the SQL CHECKs must agree.
 *
 * Two vocabularies necessarily exist twice: once as a frozen JS array the code validates
 * against, and once as a CHECK constraint the database enforces. Nothing made them agree.
 *
 * WHY THAT IS A REAL DEFECT AND NOT TIDINESS. composeReport refuses an unknown cadence with the
 * comment "the column has a CHECK constraint; failing here names the problem instead of letting
 * the insert fail later with a constraint violation nobody can trace back to a caller." That
 * promise is worth exactly as much as the two lists matching — and if someone adds 'weekly' to
 * CADENCES, the guard cheerfully passes it through to an INSERT that dies in production. The
 * guard would be enforcing a rule it no longer knows.
 *
 * The lane vocabulary has the same exposure with a nastier failure: a lane the DB accepts but no
 * consumer recognises inserts CLEANLY, occupies its own UNIQUE(report_id, lane) slot, and reads
 * as "that lane never consumed the report". No error anywhere.
 *
 * So the migration is parsed and compared. Adding a value in one place and not the other fails
 * CI, which is the only arrangement where "they agree" is a fact rather than a hope.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CADENCES } from '../../../lib/drive-loop/compose-report.js';
import { DRIVE_REPORT_LANES, isDriveReportLane } from '../../../lib/drive-loop/lanes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(__dirname, '../../../database/migrations/20260803_drive_reports.sql');
const SQL = fs.readFileSync(MIGRATION, 'utf8');

// SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 FR-5/FR-7: a SECOND migration now ALTERs the cadence CHECK
// this file's original single-file parser could not see. Reading only 20260803_drive_reports.sql
// would keep asserting the OLD two-value list forever and falsely report drift the moment
// CADENCES is widened -- not because anything is actually out of sync, but because this test's
// own scope stayed narrower than the migration history. LATER-WINS FOLDING, not a second parallel
// list: any migration that re-defines a column's CHECK (via ALTER TABLE ... ADD CONSTRAINT ...
// CHECK) supersedes an earlier definition for that same column, mirroring how Postgres itself
// only ever has ONE live constraint by that name at a time.
const FOLDED_MIGRATIONS = [
  MIGRATION,
  path.resolve(__dirname, '../../../database/migrations/20260812_drive_reports_hourly_cadence.sql'),
].filter((p) => fs.existsSync(p));

/**
 * Pull the value list out of `CHECK (<column> IN ('a', 'b'))`, folding later migrations'
 * redefinitions over earlier ones for the same column. Returns null when NO migration in the
 * fold ever defines the constraint, so "the CHECK never existed" stays distinguishable from
 * "the CHECK is empty" — those are different failures and only one of them is a drift.
 */
function checkValues(column) {
  let found = null;
  for (const migrationPath of FOLDED_MIGRATIONS) {
    const raw = migrationPath === MIGRATION ? SQL : fs.readFileSync(migrationPath, 'utf8');
    // SQL line comments stripped before matching — a migration's own header prose (e.g. quoting
    // the PRE-widening value for documentation, as 20260812's does) can otherwise shadow the
    // real ADD CONSTRAINT statement further down, since a plain (non-global) match returns
    // whichever occurrence comes FIRST in the file regardless of which one is live SQL.
    const sql = raw.replace(/--[^\n]*/g, '');
    const m = sql.match(new RegExp(`CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(([^)]*)\\)`, 'i'));
    if (m) found = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean).sort();
  }
  return found;
}

describe('vocabulary drift — a JS constant and a SQL CHECK are two representations of one rule', () => {
  it('[CONTROL] the parser finds a known constraint and returns null for one that does not exist', () => {
    // Without this, a parser that silently returned null for everything would make every
    // assertion below vacuously "equal" against an empty set.
    expect(checkValues('cadence'), 'the cadence CHECK must be findable').not.toBeNull();
    expect(checkValues('no_such_column_anywhere'), 'a missing CHECK must be null, not []').toBeNull();
  });

  it('CADENCES matches the cadence CHECK exactly', () => {
    expect(checkValues('cadence')).toEqual([...CADENCES].sort());
  });

  it('DRIVE_REPORT_LANES matches the lane CHECK exactly', () => {
    expect(checkValues('lane')).toEqual([...DRIVE_REPORT_LANES].sort());
  });

  it('both vocabularies are frozen — a runtime push would desync them from the database', () => {
    expect(Object.isFrozen(CADENCES)).toBe(true);
    expect(Object.isFrozen(DRIVE_REPORT_LANES)).toBe(true);
  });

  it('isDriveReportLane accepts every declared lane and rejects near-misses', () => {
    // The near-misses are the realistic failure: a hyphen where the schema has an underscore
    // inserts cleanly and reads as "this lane never consumed the report".
    for (const lane of DRIVE_REPORT_LANES) expect(isDriveReportLane(lane)).toBe(true);
    for (const bad of ['chairman-brief', 'Coordinator', 'ADAM', '', null, undefined, 'chairman_brief ']) {
      expect(isDriveReportLane(bad), `${JSON.stringify(bad)} must not pass`).toBe(false);
    }
  });

  it('DRIVE_REPORT_LANES does not collide with the OTHER frozen LANES in this repo', () => {
    // lib/coordination/receipt-ledger.cjs exports a frozen LANES with a different vocabulary
    // (SIGNAL / WORK_ASSIGNMENT / ADVISORY) for a different receipt contract. Two constants
    // about "receipt lanes" meaning different things is a live import hazard, which is why this
    // one is DRIVE_REPORT_LANES rather than LANES.
    for (const foreign of ['SIGNAL', 'WORK_ASSIGNMENT', 'ADVISORY']) {
      expect(DRIVE_REPORT_LANES).not.toContain(foreign);
    }
  });
});

describe('the superseded receipts column is GONE from the migration, not merely unused', () => {
  it('drive_reports declares no consumption_receipts column', () => {
    // A column that exists will eventually be written to — by a consumer built against the
    // superseded design, silently, with no error. Removal is the fix; deprecation is not.
    const createTable = SQL.match(/CREATE TABLE IF NOT EXISTS public\.drive_reports \(([\s\S]*?)\n\);/);
    expect(createTable, 'the drive_reports CREATE TABLE must be findable').not.toBeNull();
    expect(createTable[1]).not.toMatch(/^\s*consumption_receipts\s+jsonb/m);
  });

  it('the receipts table carries the unique constraint that IS the design', () => {
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS public\.drive_report_receipts/);
    expect(SQL).toMatch(/CONSTRAINT drive_report_receipts_report_lane_uniq UNIQUE \(report_id, lane\)/);
    expect(SQL, 'a receipt for a deleted report is a dangling claim').toMatch(/REFERENCES public\.drive_reports\(id\) ON DELETE CASCADE/);
  });
});

// TS-9 (SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-D) — THE SCAN. Specified in the PRD and, until now,
// never implemented; the VALIDATION sub-agent caught that both consumers were writing
// `lane: 'adam'` / `lane: 'chairman_brief'` at the call site while dutifully importing the constant
// for validation. FR-2 says NEVER inline the string, and nothing was checking.
//
// It scans the SOURCE rather than asserting on behaviour, because the property is about how the
// code is WRITTEN: a correct literal and a named constant behave identically today and diverge only
// on the day someone types the hyphen. Every prose message in this SD's coordination thread wrote
// 'chairman-brief'; the CHECK constraint rejects it at write time, which is loud at the database
// and silent at a fail-soft observer.
describe('TS-9 — no lane key is spelled outside lib/drive-loop/lanes.js', () => {
  const REPO = path.resolve(__dirname, '../../..');
  // The delivered consumers plus the shared writer. Not a repo-wide walk: this asserts a property
  // of THIS SD's surface, and a glob would silently start covering (or stop covering) files as the
  // tree moves, which makes a green run mean less over time.
  const FILES = [
    'scripts/hooks/session-role-orient.cjs',
    'lib/chairman/daily-review/roadmap-status-doc.js',
    'lib/consumption/drive-report-receipts.js',
    'scripts/coordinator-drive-report-consume.mjs',
  ];

  // SCOPED TO THE LANE ARGUMENT, NOT TO THE WORDS. My first cut forbade the lane strings anywhere
  // in these files and went red on both consumers — because 'coordinator' is an ordinary word here:
  // session-role-orient.cjs carries a SEAT token spelled 'coordinator' and pages of worker prose
  // about the coordinator role, none of it a lane. A scan that cannot be satisfied without
  // mangling unrelated code does not get obeyed, it gets deleted. What FR-2 actually forbids is
  // spelling the lane AT THE WRITE, so that is what this matches.
  const LANE_ARG = /\blane\s*[:=]\s*(['"`])([^'"`]+)\1/g;

  it('the matcher finds a lane argument when there is one — otherwise this proves nothing', () => {
    // POSITIVE CONTROL, on a DIFFERENT sample than the files under test: without it, a regex that
    // silently stopped matching anything would make every assertion below vacuously green.
    const found = [...'lane: \'adam\'\nlane = "chairman_brief"'.matchAll(LANE_ARG)].map((m) => m[2]);
    expect(found).toEqual(['adam', 'chairman_brief']);
  });

  for (const rel of FILES) {
    it(`${rel} names lanes through the constant, never as a literal`, () => {
      const abs = path.resolve(REPO, rel);
      if (!fs.existsSync(abs)) return; // a sibling leg's file may not have landed yet
      const src = fs.readFileSync(abs, 'utf8');
      // Comments are prose ABOUT the vocabulary — these files' own docs quote the hyphen to warn
      // about it — so they are stripped before the scan. Code is what ships.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

      const inlined = [...code.matchAll(LANE_ARG)].map((m) => m[2]);
      expect(inlined, `${rel} spells a lane at the write site — import DRIVE_REPORT_LANE instead`)
        .toEqual([]);

      // THE HYPHEN, checked separately and everywhere in the code: it is not a member of
      // DRIVE_REPORT_LANES, so no scan driven by that list can ever catch it. It is the exact
      // misspelling every prose message in this SD's coordination thread propagated, and the one
      // the CHECK constraint rejects at write time — loud at the database, silent at a fail-soft
      // observer.
      expect(code, `${rel} contains the hyphenated lane the CHECK constraint rejects`)
        .not.toMatch(/['"`]chairman-brief['"`]/);
    });
  }
});
