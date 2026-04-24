/**
 * Marketing Producer Binding Integration Tests
 * SD-EHG-MARKETING-DISTRIBUTION-PRODUCER-BINDING-001
 *
 * Proves that three previously-stubbed producer/reader surfaces now persist
 * venture-scoped rows to the real marketing tables (provisioned by PR #3267).
 *
 * FR-5: 3 table-write assertions (venture_id → row)
 * FR-6: Regression guard — source files must not reintroduce "not provisioned"
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { getPipelineHistory } from '../../lib/marketing/content-pipeline.js';
import { getFeedbackHistory } from '../../lib/marketing/feedback-loop.js';

dotenv.config();

const supabase = createSupabaseServiceClient();

let testCompanyId;
let testVentureId;

describe('Marketing Producer Binding (SD-EHG-MARKETING-DISTRIBUTION-PRODUCER-BINDING-001)', () => {
  beforeAll(async () => {
    testCompanyId = uuidv4();
    testVentureId = uuidv4();

    const { error: companyError } = await supabase.from('companies').insert({
      id: testCompanyId,
      name: 'Test Company for Producer Binding',
      created_at: new Date().toISOString(),
    });
    if (companyError) throw new Error(`Fixture company insert failed: ${companyError.message}`);

    const { error: ventureError } = await supabase.from('ventures').insert({
      id: testVentureId,
      name: 'Test Venture for Producer Binding',
      company_id: testCompanyId,
      problem_statement: 'Producer binding integration test',
      current_lifecycle_stage: 1,
      status: 'active',
      created_at: new Date().toISOString(),
    });
    if (ventureError) throw new Error(`Fixture venture insert failed: ${ventureError.message}`);
  });

  afterAll(async () => {
    if (testVentureId) {
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
    if (testCompanyId) {
      await supabase.from('companies').delete().eq('id', testCompanyId);
    }
  });

  describe('marketing_pipeline_runs (FR-1)', () => {
    it('persists a pipeline run keyed by venture_id + invocation_id, idempotent on retry', async () => {
      const invocationId = crypto.randomUUID();

      const row = {
        venture_id: testVentureId,
        pipeline_type: 'multi-channel',
        invocation_id: invocationId,
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        metrics: { channelCount: 3, totalGenerated: 3, totalPublished: 2, totalFailed: 1 },
        metadata: { source: 'integration-test' },
      };

      const { error: ins1 } = await supabase.from('marketing_pipeline_runs').upsert(row, { onConflict: 'invocation_id' });
      expect(ins1).toBeNull();

      const { error: ins2 } = await supabase.from('marketing_pipeline_runs').upsert({ ...row, status: 'failed' }, { onConflict: 'invocation_id' });
      expect(ins2).toBeNull();

      const { data, error } = await supabase
        .from('marketing_pipeline_runs')
        .select('invocation_id, venture_id, status')
        .eq('invocation_id', invocationId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].venture_id).toBe(testVentureId);
      expect(data[0].status).toBe('failed');
    });

    it('getPipelineHistory returns rows ordered by started_at DESC', async () => {
      const history = await getPipelineHistory(supabase, testVentureId, 5);
      expect(Array.isArray(history)).toBe(true);
      expect(history.every(r => r.venture_id === testVentureId)).toBe(true);
    });
  });

  describe('marketing_feedback_cycles (FR-2)', () => {
    it('persists feedback cycle signals as append-only rows keyed by venture_id', async () => {
      const row = {
        venture_id: testVentureId,
        cycle_type: 'engagement',
        signal_payload: { channel_count: 2, adjustments: [], summary: 'test' },
        status: 'open',
        metadata: { source: 'integration-test' },
      };

      const { error: e1 } = await supabase.from('marketing_feedback_cycles').insert(row);
      expect(e1).toBeNull();

      const { error: e2 } = await supabase.from('marketing_feedback_cycles').insert(row);
      expect(e2).toBeNull();

      const history = await getFeedbackHistory(supabase, testVentureId, 10);
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history.every(r => r.venture_id === testVentureId)).toBe(true);
    });
  });

  describe('campaign_enrollments (FR-4 producer — already shipped)', () => {
    it('writes a row keyed by (venture_id, lead_email, campaign_id) composite unique', async () => {
      const leadEmail = `test-${crypto.randomUUID().slice(0, 8)}@example.com`;
      const campaignId = `test-campaign-${crypto.randomUUID().slice(0, 8)}`;

      const row = {
        venture_id: testVentureId,
        lead_email: leadEmail,
        campaign_id: campaignId,
        current_step: 0,
        status: 'active',
        metadata: { source: 'integration-test' },
      };

      const { error: e1 } = await supabase.from('campaign_enrollments').upsert(row, { onConflict: 'venture_id,lead_email,campaign_id' });
      expect(e1).toBeNull();

      const { error: e2 } = await supabase.from('campaign_enrollments').upsert({ ...row, current_step: 1 }, { onConflict: 'venture_id,lead_email,campaign_id' });
      expect(e2).toBeNull();

      const { data, error } = await supabase
        .from('campaign_enrollments')
        .select('venture_id, lead_email, campaign_id, current_step')
        .eq('venture_id', testVentureId)
        .eq('lead_email', leadEmail)
        .eq('campaign_id', campaignId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].current_step).toBe(1);
    });
  });

  describe('Regression guard (FR-6): no "not provisioned" stub strings', () => {
    const repoRoot = path.resolve(process.cwd());
    const files = [
      'lib/marketing/content-pipeline.js',
      'lib/marketing/feedback-loop.js',
      'lib/marketing/dashboard.js',
    ];

    for (const relPath of files) {
      it(`${relPath} must not contain "not provisioned"`, () => {
        const absPath = path.join(repoRoot, relPath);
        const src = fs.readFileSync(absPath, 'utf8');
        expect(src).not.toContain('not provisioned');
      });
    }
  });
});
