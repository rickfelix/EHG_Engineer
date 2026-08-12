/**
 * Regression test for fn_stage_artifact_precondition -- the BUILD_DEVIATION_RECORD
 * case-mismatch fix (QF-20260812-376,
 * 20260812_fix_build_deviation_record_case_mismatch.sql).
 *
 * BUG BEING FIXED: the LIVE function compares artifact_type =
 * 'BUILD_DEVIATION_RECORD' (uppercase). All live venture_artifacts rows of
 * this type are lowercase ('build_deviation_record'), so the deviation
 * escape hatch -- the only documented way to unblock a stage advance without
 * the real required artifact -- has never matched anything and is dead code.
 *
 * The migration is chairman-gated (mirrors the sibling trigger migration's
 * own convention) and MUST NOT be applied to production by this suite. To
 * prove the fix without touching the live definition, this test applies the
 * migration's CREATE OR REPLACE FUNCTION inside the outer transaction
 * (rolled back in afterAll), tests behavior against that transaction-local
 * definition, then discards it entirely on rollback.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HAS_REAL_DB } from '../../../helpers/db-available.js';

const describeDb = describe.skipIf(!HAS_REAL_DB);

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = readFileSync(
  join(__dirname, '../../../../database/migrations/20260812_fix_build_deviation_record_case_mismatch.sql'),
  'utf8',
);

const RUN_ID = 'DEVCASE-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
const REQUIRED_STAGE = 21; // Stage 21: Build Review

let rawClient;
let spCounter = 0;
let companyId;

async function seedVenture(stage) {
  await rawClient.query("SET LOCAL leo.stage0_bypass = 'true'");
  const { rows } = await rawClient.query(
    `INSERT INTO ventures (name, problem_statement, current_lifecycle_stage, company_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [RUN_ID + ' venture', 'Case-mismatch fixture ' + RUN_ID, stage, companyId],
  );
  return rows[0].id;
}

async function seedDeviationRecord(ventureId, artifactRef, lowercase) {
  const artifactType = lowercase ? 'build_deviation_record' : 'BUILD_DEVIATION_RECORD';
  await rawClient.query(
    `INSERT INTO venture_artifacts (id, venture_id, lifecycle_stage, artifact_type, title, is_current, artifact_data)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, true, $5)`,
    [ventureId, REQUIRED_STAGE, artifactType, RUN_ID + ' deviation record', JSON.stringify({ artifact_ref: artifactRef })],
  );
}

describeDb('fn_stage_artifact_precondition -- BUILD_DEVIATION_RECORD case-mismatch fix (live DB, transaction-local migration apply, savepoint-isolated)', () => {
  beforeAll(async () => {
    const { createDatabaseClient } = await import('../../../../lib/supabase-connection.js');
    rawClient = await createDatabaseClient('engineer');
    await rawClient.query('BEGIN');

    const { rows: companies } = await rawClient.query('SELECT id FROM companies LIMIT 1');
    expect(companies.length).toBe(1);
    companyId = companies[0].id;

    const { rows: preFix } = await rawClient.query(
      "SELECT pg_get_functiondef('public.fn_stage_artifact_precondition(uuid,integer)'::regprocedure) AS def",
    );
    expect(preFix[0].def).toMatch(/artifact_type = 'BUILD_DEVIATION_RECORD'/);
    expect(preFix[0].def).not.toMatch(/UPPER\(artifact_type\) = 'BUILD_DEVIATION_RECORD'/);

    await rawClient.query(MIGRATION_SQL);
  });

  afterAll(async () => {
    if (rawClient) {
      await rawClient.query('ROLLBACK');
      const { rows } = await rawClient.query(
        'SELECT count(*)::int AS n FROM ventures WHERE name = $1',
        [RUN_ID + ' venture'],
      );
      expect(rows[0].n).toBe(0);
      await rawClient.end();
    }
  });

  let testSp;
  beforeEach(async () => {
    testSp = 'sp_devcase_' + (++spCounter);
    await rawClient.query(`SAVEPOINT ${testSp}`);
    return async () => {
      await rawClient.query(`ROLLBACK TO SAVEPOINT ${testSp}`);
      await rawClient.query(`RELEASE SAVEPOINT ${testSp}`);
    };
  });

  it('a lowercase build_deviation_record now unblocks the missing artifact it references (bug fixed)', async () => {
    const ventureId = await seedVenture(REQUIRED_STAGE);
    const { rows: cfg } = await rawClient.query(
      'SELECT required_artifacts FROM venture_stages WHERE stage_number = $1',
      [REQUIRED_STAGE],
    );
    const missingArtifact = cfg[0].required_artifacts[0];
    await seedDeviationRecord(ventureId, missingArtifact, true);

    const { rows } = await rawClient.query(
      'SELECT fn_stage_artifact_precondition($1, $2) AS result',
      [ventureId, REQUIRED_STAGE],
    );
    const result = rows[0].result;
    expect(result.blocked).toBe(false);
    expect(result.deviated_artifacts).toContain(missingArtifact);
    expect(result.missing_artifacts).not.toContain(missingArtifact);
  });

  it('an uppercase BUILD_DEVIATION_RECORD (legacy-shape data, if any) still works too (case-insensitive both directions)', async () => {
    const ventureId = await seedVenture(REQUIRED_STAGE);
    const { rows: cfg } = await rawClient.query(
      'SELECT required_artifacts FROM venture_stages WHERE stage_number = $1',
      [REQUIRED_STAGE],
    );
    const missingArtifact = cfg[0].required_artifacts[0];
    await seedDeviationRecord(ventureId, missingArtifact, false);

    const { rows } = await rawClient.query(
      'SELECT fn_stage_artifact_precondition($1, $2) AS result',
      [ventureId, REQUIRED_STAGE],
    );
    const result = rows[0].result;
    expect(result.blocked).toBe(false);
    expect(result.deviated_artifacts).toContain(missingArtifact);
  });

  it('a venture with NO deviation record and a missing artifact is still correctly blocked (no regression)', async () => {
    const ventureId = await seedVenture(REQUIRED_STAGE);

    const { rows } = await rawClient.query(
      'SELECT fn_stage_artifact_precondition($1, $2) AS result',
      [ventureId, REQUIRED_STAGE],
    );
    const result = rows[0].result;
    expect(result.blocked).toBe(true);
    expect(result.missing_artifacts.length).toBeGreaterThan(0);
    expect(result.deviated_artifacts.length).toBe(0);
  });

  it('STRUCTURAL guard: the case-insensitive comparison landed and nothing else in the function changed', async () => {
    const { rows } = await rawClient.query(
      "SELECT pg_get_functiondef('public.fn_stage_artifact_precondition(uuid,integer)'::regprocedure) AS def",
    );
    const def = rows[0].def;

    expect(def).toMatch(/UPPER\(artifact_type\) = 'BUILD_DEVIATION_RECORD'/);
    expect(def).toMatch(/canonical_with_fallback_available/);
    expect(def).toMatch(/legacy_fallback/);
    expect(def).toMatch(/bypass_s22_legacy_skipped/);
  });
});
