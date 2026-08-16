/**
 * SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 — FR-1 / TR-3 / TS-6: the DDL is STAGED, not applied.
 *
 * ── WHAT THIS FILE CAN AND CANNOT PROVE, SAID UP FRONT ────────────────────────────────────────
 * It reads files. It CANNOT prove the table is absent from the live database — that requires a
 * connection, and these are unit tests. The live half of TS-6 was run separately against the live
 * project and is recorded in the commit message with its result and its control.
 *
 * That live probe is worth describing, because the obvious version of it is BLIND. The first
 * attempt used a head-count:
 *     supabase.from('belt_capacity_verdicts').select('id', { count: 'exact', head: true })
 * which returned {count: null, error: null} — NO ERROR AT ALL for a table that does not exist.
 * Narrating that null as 0 would have reported the table as present-and-empty, which is the exact
 * opposite of the finding, and it would have looked like a clean pass. The working probe issues a
 * column select (which errors PGRST205) and pairs it with a positive control against a table known
 * to exist — because a probe that errored on everything would report ABSENT for a table that is
 * present, and one that errored on nothing would report PRESENT for one that is missing.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPACITY_VERDICT_TABLE, UNAVAILABLE_VERDICT } from '../../scripts/lib/capacity-verdict-store.mjs';
import { VERDICTS } from '../../lib/drive-loop/score/leg4-capacity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GATED_DIR = path.resolve(__dirname, '../../database/chairman-gated');
const UP = path.join(GATED_DIR, '20260807_belt_capacity_verdicts.sql');
const DOWN = path.join(GATED_DIR, '20260807_belt_capacity_verdicts_DOWN.sql');
const ALTER_UP = path.join(GATED_DIR, '20260816_belt_capacity_verdicts_unavailable_sentinel.sql');
const ALTER_DOWN = path.join(GATED_DIR, '20260816_belt_capacity_verdicts_unavailable_sentinel_DOWN.sql');

const upSql = () => fs.readFileSync(UP, 'utf8');
const downSql = () => fs.readFileSync(DOWN, 'utf8');
const alterUpSql = () => fs.readFileSync(ALTER_UP, 'utf8');
const alterDownSql = () => fs.readFileSync(ALTER_DOWN, 'utf8');

describe('FR-1 — the migration ships staged, under the chairman gate, with a paired _DOWN', () => {
  it('lives under database/chairman-gated/, which is what makes it gated at all', () => {
    expect(fs.existsSync(UP), `missing staged DDL: ${UP}`).toBe(true);
    expect(UP.replace(/\\/g, '/')).toMatch(/database\/chairman-gated\//);
  });

  it('has a paired _DOWN', () => {
    expect(fs.existsSync(DOWN), 'a gated apply with no rollback is a one-way door').toBe(true);
  });

  it('the _DOWN warns what rolling back RESTORES, not merely what it drops', () => {
    // The precedent this follows (20260804_ai_quality_tuning_symmetric_guards_DOWN.sql): a rollback
    // note that only says "drops the table" lets someone run it without learning that the verdict
    // history is unrecoverable — the inputs are not retained anywhere, so it cannot be recomputed.
    const sql = downSql();
    expect(sql).toMatch(/DESTROYED|cannot be recomputed/i);
    expect(sql, 'it must tell the operator to take a copy first').toMatch(/belt_capacity_verdicts_backup|CREATE TABLE .*backup/i);
    expect(sql, 'and what happens to leg4').toMatch(/leg4/i);
  });

  it('states the no-self-apply boundary, including the rolled-back-transaction framing', () => {
    // TR-3. The framing matters: "I only tested it inside a transaction I rolled back" is the
    // specific rationalisation this line exists to pre-empt, and it is invisible in a diff.
    expect(upSql()).toMatch(/rolled back/i);
    expect(upSql()).toMatch(/CHAIRMAN-GATED/);
  });
});

describe('the DDL and the application code cannot drift apart silently', () => {
  it('creates the table the writer targets, by the SAME name the writer exports', () => {
    // Not a string literal repeated in a test — the constant the writer actually inserts into.
    expect(upSql()).toContain(`CREATE TABLE public.${CAPACITY_VERDICT_TABLE}`);
    expect(CAPACITY_VERDICT_TABLE).toBe('belt_capacity_verdicts');
  });

  it('the verdict CHECK is EXACTLY the reader\'s frozen four', () => {
    // If leg4 ever adds or removes a verdict, this fails rather than leaving the database
    // accepting a value the reader throws on (or rejecting one it now expects).
    const sql = upSql();
    for (const v of VERDICTS) {
      expect(sql, `the CHECK is missing ${v}`).toContain(`'${v}'`);
    }
    const checkLine = sql.match(/CHECK \(verdict IN \(([^)]*)\)\)/);
    expect(checkLine, 'the verdict column must carry a CHECK constraint').not.toBeNull();
    const listed = checkLine[1].match(/'([^']+)'/g).map((s) => s.replace(/'/g, ''));
    expect(listed, 'the CHECK must be the frozen set — no more, no less').toEqual([...VERDICTS]);
  });

  it('OK-CORPUS-GATED is NOT accepted by the table', () => {
    // The live hazard, not a hypothetical: classifyCorpusGatedDeficit really does put that value in
    // the forecast's rendered verdict binding. It belongs in detail, never in the graded column.
    const checkLine = upSql().match(/CHECK \(verdict IN \(([^)]*)\)\)/)[1];
    expect(checkLine).not.toContain('OK-CORPUS-GATED');
  });

  it('the measurement columns are NOT NULL — a verdict with no measurement reads as measured', () => {
    for (const col of ['belt_depth', 'demand_soon', 'deficit']) {
      expect(upSql()).toMatch(new RegExp(`${col}\\s+INTEGER NOT NULL`));
    }
  });

  it('asserts its own claim in-transaction rather than exiting green on a partial apply', () => {
    const sql = upSql();
    expect(sql).toMatch(/POSTCONDITION FAILED/);
    expect(sql, 'a pre-condition must refuse to adopt a table it did not create').toMatch(/PRECONDITION FAILED/);
    // Matched as a STATEMENT (the trailing `public.`), not as a mention: the precondition's own
    // RAISE text names the anti-pattern in order to forbid it, and a scan that cannot tell the
    // warning from the act would fire on the file that heeds it. Same read-vs-perform narrowing the
    // FR-7 propose-only guard already earned — narrowed to the act, not deleted.
    expect(sql, 'CREATE TABLE IF NOT EXISTS would turn a real conflict into a silent no-op')
      .not.toMatch(/CREATE TABLE\s+IF NOT EXISTS\s+public\./);
    expect(sql, '[CONTROL] and the plain CREATE TABLE statement must actually be there')
      .toMatch(/CREATE TABLE\s+public\.belt_capacity_verdicts\s*\(/);
  });
});

describe('SD-LEO-FIX-BELT-CAPACITY-VERDICTS-001 FR-4/FR-1/TS-5 — the ALTER file, composed with the original', () => {
  // This block reads ONLY the new 20260816 alter file, never the original 20260807 file above —
  // per FR-4's own finding (validation-agent, evidence a3e53f13-f1ca-4a01-88ed-024acd6fc24c), the
  // original file's assertions stay true of that unmodified file forever, which is exactly why they
  // cannot observe a drift that lives in a SEPARATE, additive file. This block is the composed check.

  it('lives under database/chairman-gated/, matching the table\'s own established gated convention', () => {
    expect(fs.existsSync(ALTER_UP), `missing staged ALTER: ${ALTER_UP}`).toBe(true);
    expect(ALTER_UP.replace(/\\/g, '/')).toMatch(/database\/chairman-gated\//);
  });

  it('has a paired _DOWN', () => {
    expect(fs.existsSync(ALTER_DOWN), 'a gated apply with no rollback is a one-way door').toBe(true);
  });

  it('does NOT edit the original file — additive only, same convention as every other family here', () => {
    expect(alterUpSql()).not.toMatch(/CREATE TABLE\s+public\.belt_capacity_verdicts\s*\(/);
  });

  it('widens the verdict CHECK to admit UNAVAILABLE_VERDICT (imported constant, not a literal) IN ADDITION to the original frozen four', () => {
    const sql = alterUpSql();
    for (const v of [...VERDICTS, UNAVAILABLE_VERDICT]) {
      expect(sql, `the widened CHECK is missing ${v}`).toContain(`'${v}'`);
    }
    const checkLine = sql.match(/CHECK \(verdict IN \(([^)]*)\)\)/);
    expect(checkLine, 'the alter file must recreate the verdict CHECK constraint').not.toBeNull();
    const listed = checkLine[1].match(/'([^']+)'/g).map((s) => s.replace(/'/g, ''));
    expect(listed, 'the widened CHECK must be exactly the original four plus the sentinel — no more, no less')
      .toEqual([...VERDICTS, UNAVAILABLE_VERDICT]);
  });

  it('drops NOT NULL on belt_depth, demand_soon, deficit — a read-failure run has no measurement to report', () => {
    const sql = alterUpSql();
    for (const col of ['belt_depth', 'demand_soon', 'deficit']) {
      expect(sql, `${col} must have its NOT NULL dropped`).toMatch(new RegExp(`ALTER COLUMN\\s+${col}\\s+DROP NOT NULL`));
    }
  });

  it('adds read_failed boolean NOT NULL DEFAULT false — every pre-existing row backfills to a real measured run', () => {
    expect(alterUpSql()).toMatch(/ADD COLUMN\s+read_failed\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i);
  });

  it('asserts its own claim in-transaction rather than exiting green on a partial apply', () => {
    const sql = alterUpSql();
    expect(sql).toMatch(/POSTCONDITION FAILED/);
    expect(sql, 'a pre-condition must refuse to adopt a table this migration did not expect').toMatch(/PRECONDITION FAILED/);
  });

  it('the _DOWN warns rollback is destructive to sentinel/null-measurement rows and cannot be recomputed', () => {
    const sql = alterDownSql();
    expect(sql).toMatch(/DESTROYED|cannot be recomputed/i);
    expect(sql, 'it must tell the operator to back up sentinel rows first').toMatch(/backup/i);
  });

  it('if this file is later edited to NOT widen the CHECK or NOT drop the NOT NULL constraints, this test fails', () => {
    // Not a real edit — a same-invariant CONTROL restating the point of every assertion above: this
    // file's own text is what the assertions above depend on, not a separately-tracked expectation.
    const sql = alterUpSql();
    expect(sql).toContain(`'${UNAVAILABLE_VERDICT}'`);
    expect(sql).toMatch(/ALTER COLUMN\s+belt_depth\s+DROP NOT NULL/);
  });
});
