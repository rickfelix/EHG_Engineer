// SD-LEO-INFRA-MINUS-CARGO-INSTRUMENTS-001 — FR-6 DDL-tier demonstration.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN
//
// database/chairman-gated/20260823_eva_stage_gate_attempts.sql (the table + RPCs this file
// exercises) is CHAIRMAN-GATED and NOT YET APPLIED to the live database (confirmed live via a
// PostgREST PGRST205 on the table and PGRST202 on both RPCs). This file runs the SAME migration
// SQL against an ephemeral vanilla PostgreSQL 16 to prove the wiring — open_eva_gate_attempt(),
// finalize_eva_gate_attempt(), the finalize-immutability trigger, the attempt_number allocator —
// behaves correctly. It does NOT prove the migration has been applied live, and this SD's FR-4/
// FR-1/FR-3 evaluator/gate changes do not themselves depend on this table existing (they run
// entirely through checkThesisKillGate's own system_events + chairman_decisions path).
//
// toStage=21 is injected directly as a harness parameter throughout — this file never advances
// any real venture's lifecycle_stage. No production data is touched.
//
// FAIL-CLOSED, no skip branch: if this file cannot reach a database it fails loudly rather than
// silently passing (matches tests/ddl/*.db.test.js's established convention).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import pg from 'pg';

const MIGRATION_PATH = fileURLToPath(
  new URL('../../database/chairman-gated/20260823_eva_stage_gate_attempts.sql', import.meta.url),
);
// The migration file wraps itself in its own BEGIN/COMMIT (chairman-gated files apply via a
// different path than database/migrations/*, which apply-migration.js wraps externally) — safe
// to run verbatim inside this ephemeral DB.
const MIGRATION_SQL = fs.readFileSync(MIGRATION_PATH, 'utf8');

// TESTING F-EXEC-1 precedent (this session, venture-teardown-disposition-ddl.db.test.js): the
// shared-ephemeral-DDL-DB collision class. This file's name is deliberately chosen to sort
// between the existing `telegram-*` and `venture-*` prefixed files so it neither wins nor loses
// the CREATE TABLE race for `ventures` — it declares the SAME converged 4-sibling shape those
// files already agreed on, adding nothing of its own via ALTER (eva_stage_gate_attempts only
// needs ventures.id to exist for its FK).
const STUB_SCHEMA = `
CREATE TABLE IF NOT EXISTS public.ventures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  deleted_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);
`;

let client;
let ventureId;

beforeAll(async () => {
  client = new pg.Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'ddl_check',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
  });
  await client.connect();
  await client.query(STUB_SCHEMA);
  await client.query(MIGRATION_SQL);
  const { rows } = await client.query(
    'INSERT INTO public.ventures (name) VALUES ($1) RETURNING id',
    [`fixture ${Math.random().toString(36).slice(2)}`],
  );
  ventureId = rows[0].id;
}, 60_000);

afterAll(async () => {
  if (client) await client.end();
});

describe('the migration applied', () => {
  it('the table exists (asserted via information_schema, never a head:true/count:"exact" check — that pattern returns error=null,count=null against a missing table and is blind to absence)', async () => {
    const { rows } = await client.query(
      'SELECT 1 FROM information_schema.tables WHERE table_schema=\'public\' AND table_name=\'eva_stage_gate_attempts\'',
    );
    expect(rows).toHaveLength(1);
  });

  it('both RPCs exist with their documented signatures', async () => {
    const { rows } = await client.query(`
      SELECT proname, pronargs FROM pg_proc
      WHERE proname IN ('open_eva_gate_attempt', 'finalize_eva_gate_attempt')
        AND pronamespace = 'public'::regnamespace
      ORDER BY proname
    `);
    expect(rows).toEqual([
      { proname: 'finalize_eva_gate_attempt', pronargs: 6 },
      { proname: 'open_eva_gate_attempt', pronargs: 4 },
    ]);
  });
});

describe('FR-6: one full evaluation produces a persisted evidence row', () => {
  it('open -> finalize(cannot_evaluate) persists a row with passed=NULL and finalized_at set', async () => {
    const { rows: opened } = await client.query(
      'SELECT * FROM open_eva_gate_attempt($1, $2, $3, $4)',
      [ventureId, 21, 'kill', 'thesis-kill-gate'],
    );
    expect(opened).toHaveLength(1);
    const { attempt_id: attemptId, attempt_number: attemptNumber } = opened[0];
    expect(attemptNumber).toBe(1);

    const { rows: finalized } = await client.query(
      'SELECT finalize_eva_gate_attempt($1, $2, $3, $4, $5, $6) AS ok',
      [attemptId, 'cannot_evaluate', null, 'K1-K3 evaluated at toStage=21; no gauges configured in this fixture', JSON.stringify({ venture_id: ventureId, evaluated_criteria: 3 }), JSON.stringify({ toStage: 21 })],
    );
    expect(finalized[0].ok).toBe(true);

    const { rows: persisted } = await client.query(
      'SELECT venture_id, stage_number, gate_type, resolved_outcome, passed, finalized_at FROM eva_stage_gate_attempts WHERE attempt_id = $1',
      [attemptId],
    );
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      venture_id: ventureId,
      stage_number: 21,
      gate_type: 'kill',
      resolved_outcome: 'cannot_evaluate',
      passed: null,
    });
    expect(persisted[0].finalized_at).not.toBeNull();
  });

  it('a second finalize on the same attempt_id is rejected — evidence rows are immutable once resolved', async () => {
    const { rows: opened } = await client.query(
      'SELECT * FROM open_eva_gate_attempt($1, $2, $3, $4)',
      [ventureId, 21, 'kill', 'thesis-kill-gate'],
    );
    const attemptId = opened[0].attempt_id;
    await client.query('SELECT finalize_eva_gate_attempt($1, $2, $3, $4, $5, $6)', [attemptId, 'cannot_evaluate', null, null, null, null]);

    // finalize_eva_gate_attempt's own WHERE clause is a no-op fast path against an already-
    // resolved row (returns false, no error) — the actual enforcement is the freeze TRIGGER on
    // any raw UPDATE, proven directly below.
    const { rows: secondFinalize } = await client.query('SELECT finalize_eva_gate_attempt($1, $2, $3, $4, $5, $6) AS ok', [attemptId, 'machine_pass', true, 'tampering attempt', null, null]);
    expect(secondFinalize[0].ok).toBe(false);

    await expect(
      client.query('UPDATE eva_stage_gate_attempts SET reasoning = \'tampered\' WHERE attempt_id = $1', [attemptId]),
    ).rejects.toThrow(/immutable once finalized/);
  });

  it('a re-open for the same (venture, stage, gate_type) allocates attempt_number server-side, never client-computed', async () => {
    const { rows: firstOpen } = await client.query('SELECT * FROM open_eva_gate_attempt($1, $2, $3, $4)', [ventureId, 22, 'kill', 'thesis-kill-gate']);
    const { rows: secondOpen } = await client.query('SELECT * FROM open_eva_gate_attempt($1, $2, $3, $4)', [ventureId, 22, 'kill', 'thesis-kill-gate']);
    expect(secondOpen[0].attempt_number).toBe(firstOpen[0].attempt_number + 1);
  });

  it('no UPDATE ever touches the ventures table — the demonstration harness injects toStage without mutating venture state', async () => {
    const before = await client.query('SELECT metadata FROM public.ventures WHERE id = $1', [ventureId]);
    await client.query('SELECT * FROM open_eva_gate_attempt($1, $2, $3, $4)', [ventureId, 21, 'kill', 'thesis-kill-gate']);
    const after = await client.query('SELECT metadata FROM public.ventures WHERE id = $1', [ventureId]);
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});
