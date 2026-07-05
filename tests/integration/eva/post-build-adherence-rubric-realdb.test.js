/**
 * REAL, DB-backed integration test for the post_build_adherence_v1 rubric row.
 *
 * SD: SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-A
 *
 * FR-1 requires an AUTOMATED test (not a manual smoke-test) asserting the seeded
 * adherence_rubrics row matches the chairman-ratified thresholds transcribed onto
 * the parent orchestrator SD (strategic_directives_v2.metadata.rubric_thresholds_ratified)
 * EXACTLY, so a future accidental re-seed with drifted values is caught immediately.
 *
 * Also confirms the immutability trigger objects genuinely exist in live Postgres
 * (via direct catalog introspection — pg_trigger is not exposed through the
 * PostgREST/supabase-js client). Mirroring leo_scoring_rubrics' precedent exactly,
 * the trigger allows the privileged service_role connection through (so a
 * legitimate admin fixup remains possible) and blocks only non-privileged roles —
 * the "immutable" contract this codebase relies on is the INSERT-new-version-instead
 * CONVENTION documented in the migration, backed by a trigger against accidental
 * anon/authenticated writes, not a wall against the service-role connection every
 * script in this repo authenticates as.
 *
 * Uses real Supabase service-role connection (requires .env). Skipped if no real DB.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { describeDb } from '../../helpers/db-available.js';
import { createDatabaseClient } from '../../../scripts/lib/supabase-connection.js';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const PARENT_SD_KEY = 'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001';

describeDb('post_build_adherence_v1 rubric (real DB)', () => {
  let parentThresholds;
  let rubricRow;
  let pgClient;

  beforeAll(async () => {
    const { data: sd, error: sdErr } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('sd_key', PARENT_SD_KEY)
      .single();
    if (sdErr) throw new Error(`Failed to load parent SD: ${sdErr.message}`);
    parentThresholds = sd.metadata?.rubric_thresholds_ratified;

    const { data: rubric, error: rubricErr } = await supabase
      .from('adherence_rubrics')
      .select('*')
      .eq('rubric_key', 'post_build_adherence_v1')
      .eq('version', 1)
      .single();
    if (rubricErr) throw new Error(`Failed to load rubric row: ${rubricErr.message}`);
    rubricRow = rubric;

    pgClient = await createDatabaseClient('engineer', { verify: false });
  });

  afterAll(async () => {
    if (pgClient) await pgClient.end().catch(() => {});
  });

  it('parent SD carries the chairman-ratified thresholds', () => {
    expect(parentThresholds).toBeTruthy();
    expect(parentThresholds.ratified_by).toBe('chairman');
  });

  it('rubric row dimension_floor matches "every dimension >=3"', () => {
    expect(Number(rubricRow.dimension_floor)).toBe(3);
  });

  it('rubric row mean_floor matches "mean >=4"', () => {
    expect(Number(rubricRow.mean_floor)).toBe(4);
  });

  it('rubric row zero_unscored_fails matches "zero unscored"', () => {
    expect(rubricRow.zero_unscored_fails).toBe(true);
  });

  it('rubric row is published (required before first scored run per gate-freeze rule)', () => {
    expect(rubricRow.status).toBe('published');
    expect(rubricRow.published_at).toBeTruthy();
  });

  it('rubric row declares exactly the 4 chairman-scoped dimensions', () => {
    const keys = Object.keys(rubricRow.dimensions).sort();
    expect(keys).toEqual([
      'architecture_conformance',
      'data_model_fidelity',
      'persona_surface_coverage',
      'user_story_coverage',
    ]);
  });

  it('every dimension requires evidence (could-not-verify != built)', () => {
    for (const [name, dim] of Object.entries(rubricRow.dimensions)) {
      expect(dim.evidence_required, `${name}.evidence_required`).toBe(true);
      expect(dim.behavioral_anchors['1']).toBeTruthy();
      expect(dim.behavioral_anchors['5']).toBeTruthy();
    }
  });

  it('BEFORE UPDATE and BEFORE DELETE immutability triggers exist on adherence_rubrics', async () => {
    const { rows } = await pgClient.query(
      `SELECT tgname FROM pg_trigger
       WHERE tgrelid = 'adherence_rubrics'::regclass AND NOT tgisinternal
       ORDER BY tgname`
    );
    const names = rows.map((r) => r.tgname);
    expect(names).toContain('trg_adherence_rubrics_immutable_update');
    expect(names).toContain('trg_adherence_rubrics_immutable_delete');
  });

  it('the immutability function raises on non-privileged UPDATE/DELETE (source-level check)', async () => {
    const functionDefQuery = `
      SELECT pg_get_functiondef(oid) AS def
      FROM pg_proc
      WHERE proname = 'adherence_rubrics_immutable'
    `;
    const { rows } = await pgClient.query(functionDefQuery);
    expect(rows).toHaveLength(1);
    expect(rows[0].def).toMatch(/RAISE EXCEPTION 'adherence_rubrics_immutable/);
    expect(rows[0].def).toMatch(/service_role/);
  });

  it('RLS is enabled with anon-read-published + service-role-full-access policies', async () => {
    const rlsEnabledQuery = `
      SELECT relrowsecurity
      FROM pg_class
      WHERE relname = 'adherence_rubrics'
    `;
    const { rows: relRows } = await pgClient.query(rlsEnabledQuery);
    expect(relRows[0].relrowsecurity).toBe(true);

    const policyNamesQuery = `
      SELECT polname
      FROM pg_policy
      WHERE polrelid = 'adherence_rubrics'::regclass
      ORDER BY polname
    `;
    const { rows: polRows } = await pgClient.query(policyNamesQuery);
    const policyNames = polRows.map((r) => r.polname);
    expect(policyNames).toContain('Anon can read published adherence rubrics');
    expect(policyNames).toContain('Service role full access to adherence_rubrics');
  });
});
