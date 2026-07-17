/**
 * Schema-shape regression test for 20260717_foresight_board_phase1_schemas.sql
 * (SD-LEO-INFRA-EHG-VENTURE-FORESIGHT-001-B, FR-1/FR-2/FR-3).
 *
 * Verifies the 4 Foresight Board Phase-1 tables (forecast_records,
 * specialist_assessments, council_adjudications, venture_decision_dossiers) exist,
 * have RLS enabled with a service_role policy, and accept a representative insert
 * matching the documented field shape (spec sections 8.5/8.8/8.9/8.10 + the
 * forecast_records chaining-option delta).
 *
 * ZERO-LEAK contract: every insert runs inside a transaction that is ROLLED BACK
 * in afterEach, so no test row is ever committed to the shared live database.
 * Routed to the opt-in `db` vitest project via the `.db.test.js` suffix, so a
 * no-DB `npm test` run skips it cleanly.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { HAS_REAL_DB } from '../../../helpers/db-available.js';
import { createDatabaseClient } from '../../../../scripts/lib/supabase-connection.js';

const describeDb = describe.skipIf(!HAS_REAL_DB);

const TABLES = ['forecast_records', 'specialist_assessments', 'council_adjudications', 'venture_decision_dossiers'];

describeDb('Foresight Board Phase-1 schemas (FR-1/FR-2/FR-3)', () => {
  let client;

  beforeAll(async () => {
    client = await createDatabaseClient('engineer', { verify: false });
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await client.query('BEGIN');
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
  });

  it.each(TABLES)('%s exists with RLS enabled', async (table) => {
    const { rows } = await client.query('SELECT relrowsecurity FROM pg_class WHERE relname = $1', [table]);
    expect(rows).toHaveLength(1);
    expect(rows[0].relrowsecurity).toBe(true);
  });

  it.each(TABLES)('%s has a service_role policy', async (table) => {
    const { rows } = await client.query(
      'SELECT policyname FROM pg_policies WHERE tablename = $1 AND \'service_role\' = ANY(roles)',
      [table],
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('forecast_records accepts a row matching spec 8.5 + the chaining-option delta', async () => {
    const { rows } = await client.query(
      `INSERT INTO forecast_records
         (perspective_id, forecast_text, forecast_target_date, probability, measurable_condition,
          source_id, current_status, outcome_score, adjudication_notes,
          venture_a, venture_b, capability_edge, trigger, review_at, decay_at)
       VALUES
         (gen_random_uuid(), 'AI agents will handle 80% of support volume within 6mo', CURRENT_DATE + 180,
          0.65, 'support ticket AI-resolution rate >= 80%', gen_random_uuid(), 'open', NULL,
          NULL, gen_random_uuid(), gen_random_uuid(), 'shared support-agent stack', 'venture A ships support bot',
          now() + interval '30 days', now() + interval '180 days')
       RETURNING forecast_id, current_status`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].current_status).toBe('open');
  });

  it('specialist_assessments accepts a row matching spec 8.8, dissent_flags defaults to []', async () => {
    const { rows } = await client.query(
      `INSERT INTO specialist_assessments
         (venture_candidate_id, council_id, perspective_id, evidence_reviewed, findings,
          opportunities, risks, assumptions, confidence, recommended_action, prompt_version, model_version)
       VALUES
         (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), '["source-1"]'::jsonb, '["finding-1"]'::jsonb,
          '["opportunity-1"]'::jsonb, '["risk-1"]'::jsonb, '["assumption-1"]'::jsonb, 0.7, 'validate', 'v1', 'v1')
       RETURNING assessment_id, dissent_flags`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].dissent_flags).toEqual([]);
  });

  it('council_adjudications accepts a row matching spec 8.9, minority_view defaults to empty string', async () => {
    const { rows } = await client.query(
      `INSERT INTO council_adjudications
         (venture_candidate_id, council_id, adjudicator_perspective_id, consensus_summary,
          disagreement_summary, evidence_quality, council_confidence, recommendation,
          recommended_experiments, monitoring_triggers, kill_conditions)
       VALUES
         (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'broad agreement to proceed',
          'disagreement on timeline', 'strong', 0.8, 'prototype',
          '["10 paid design-partner conversations"]'::jsonb, '["CAC exceeds $200"]'::jsonb, '["3 consecutive failed pilots"]'::jsonb)
       RETURNING adjudication_id, minority_view`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].minority_view).toBe('');
  });

  it('venture_decision_dossiers accepts a row matching spec 8.10, council_adjudication_ids is a UUID array (not FK)', async () => {
    const { rows: adjRows } = await client.query(
      'INSERT INTO council_adjudications (venture_candidate_id) VALUES (gen_random_uuid()) RETURNING adjudication_id',
    );
    const adjudicationId = adjRows[0].adjudication_id;

    const { rows } = await client.query(
      `INSERT INTO venture_decision_dossiers
         (venture_candidate_id, council_adjudication_ids, overall_score, overall_confidence,
          key_assumptions, major_disagreements, recommended_posture, next_experiment,
          experiment_budget, expected_information_gain, cost_of_waiting, reversibility, rick_decision_required)
       VALUES
         (gen_random_uuid(), ARRAY[$1]::uuid[], 45, 0.55, '["customer willingness to pay"]'::jsonb,
          '[]'::jsonb, 'incubate cautiously', 'ten paid design-partner conversations', 5000,
          'high -- resolves the primary uncertainty', 'low -- market moves slowly', 'high -- easy to unwind', true)
       RETURNING dossier_id, council_adjudication_ids`,
      [adjudicationId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].council_adjudication_ids).toEqual([adjudicationId]);
  });

  it('venture_decision_dossiers.council_adjudication_ids tolerates a non-existent UUID (no hard FK)', async () => {
    const phantomId = '00000000-0000-4000-8000-000000000000';
    const { rows } = await client.query(
      `INSERT INTO venture_decision_dossiers (venture_candidate_id, council_adjudication_ids)
       VALUES (gen_random_uuid(), ARRAY[$1]::uuid[])
       RETURNING dossier_id`,
      [phantomId],
    );
    expect(rows).toHaveLength(1);
  });
});
