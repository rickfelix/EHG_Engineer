/**
 * SD-LEO-INFRA-DRIVE-STATE-OBSERVABILITY-001 — TS-6 and TS-9, the shape proven against real postgres.
 *
 * THE FILENAME IS *.db.test.js ON PURPOSE AND IT IS NOT THE HAZARD. vitest.ddl.config.mjs:36
 * includes exactly tests/ddl/ ** /*.db.test.js and is run with an explicit --config, so this file
 * IS collected. The hazard is a file matching DB_INCLUDE that is reachable ONLY by the DEFAULT
 * config — that file belongs to zero projects and reports green while never running. An earlier
 * draft of this SD's acceptance criterion banned the filename outright and would have blocked the
 * very tier it mandated; the rule is about REACHABILITY, not the name.
 *
 * A CHECK constraint cannot be asserted from the unit tier — the unit test parses the migration
 * TEXT, which proves what we wrote, not what postgres accepted. This proves postgres enforces it.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const MIGRATION = path.resolve(process.cwd(), 'database/migrations/20260808_drive_state_verdicts.sql');
const CONN = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';

let client;

const SOUND = {
  run_id: 'run-a', axis: 'fleet_health', state: 'CLEAR',
  citation: 'checked', action_taken: 'NONE',
};
const insert = (over = {}) => {
  const row = { ...SOUND, ...over };
  return client.query(
    'INSERT INTO public.drive_state_verdicts (run_id, axis, state, citation, reason, action_taken, action_citation) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [row.run_id, row.axis, row.state, row.citation, row.reason ?? null, row.action_taken, row.action_citation ?? null]
  );
};

beforeAll(async () => {
  client = new pg.Client({ connectionString: CONN });
  await client.connect();
  await client.query(fs.readFileSync(MIGRATION, 'utf8'));
});
afterAll(async () => { if (client) await client.end(); });

describe('[CONTROL, asserted first] a sound row is ACCEPTED', () => {
  it('accepts a well-formed verdict row', async () => {
    await expect(insert({ run_id: 'ctl-1' })).resolves.toBeTruthy();
  });
});

describe('the closed vocabularies are enforced BY POSTGRES, not just by our prose', () => {
  it('rejects an axis outside the frozen six', async () => {
    await expect(insert({ run_id: 'r1', axis: 'rogue_axis' })).rejects.toThrow();
  });
  it('rejects a state outside CLEAR / STALLED / UNMEASURABLE', async () => {
    await expect(insert({ run_id: 'r2', state: 'FINE' })).rejects.toThrow();
  });
  it('rejects an action_taken outside NONE / RECORDED / UNVERIFIABLE', async () => {
    await expect(insert({ run_id: 'r3', action_taken: 'DONE' })).rejects.toThrow();
  });
});

describe('the row-level contract rules', () => {
  it('rejects UNMEASURABLE with no reason', async () => {
    await expect(insert({ run_id: 'r4', state: 'UNMEASURABLE', reason: null })).rejects.toThrow();
  });
  it('accepts UNMEASURABLE WITH a reason — the two-sided half', async () => {
    await expect(insert({ run_id: 'r5', state: 'UNMEASURABLE', reason: 'no_cohort' })).resolves.toBeTruthy();
  });
  it('rejects action_taken=RECORDED with no action_citation', async () => {
    await expect(insert({ run_id: 'r6', action_taken: 'RECORDED' })).rejects.toThrow();
  });
  it('requires a citation on EVERY state', async () => {
    await expect(insert({ run_id: 'r7', citation: null })).rejects.toThrow();
  });
});

describe('[TS-9] UNIQUE (run_id, axis) — a retry cannot write twelve rows', () => {
  it('rejects the same (run_id, axis) twice, and ACCEPTS the same axis under a different run', async () => {
    await insert({ run_id: 'dup-1' });
    await expect(insert({ run_id: 'dup-1' })).rejects.toThrow();
    // The other direction: the constraint must not block the next run's reading of the same axis.
    await expect(insert({ run_id: 'dup-2' })).resolves.toBeTruthy();
  });
});

describe('[TS-6] the shape carries no field that could collapse the three states', () => {
  it('has no boolean and no numeric health column, scoped to non-key columns', async () => {
    const { rows } = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'drive_state_verdicts'"
    );
    const nonKey = rows.filter((r) => r.column_name !== 'id');
    expect(nonKey.some((r) => r.data_type === 'boolean')).toBe(false);
    expect(nonKey.some((r) => ['numeric', 'integer', 'real', 'double precision'].includes(r.data_type))).toBe(false);
    // And the column a duration depends on is defaulted by the DATABASE, not the writer.
    const recordedAt = rows.find((r) => r.column_name === 'recorded_at');
    expect(recordedAt).toBeTruthy();
    const { rows: def } = await client.query(
      "SELECT column_default FROM information_schema.columns WHERE table_name='drive_state_verdicts' AND column_name='recorded_at'"
    );
    expect(String(def[0].column_default || '')).toMatch(/now\(\)/i);
  });
});
