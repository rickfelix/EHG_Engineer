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

/**
 * Pull the value list out of `CHECK (<column> IN ('a', 'b'))`. Returns null when the constraint
 * is absent, so "the CHECK vanished" is distinguishable from "the CHECK is empty" — those are
 * different failures and only one of them is a drift.
 */
function checkValues(column) {
  const m = SQL.match(new RegExp(`CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(([^)]*)\\)`, 'i'));
  if (!m) return null;
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean).sort();
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
