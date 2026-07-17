/**
 * Legal-doc producer activation-invariant test.
 * SD-FDBK-FIX-BUILD-LEGAL-DOC-001 (V5)
 *
 * Proves the full schema -> worker -> consumer chain this SD ships works
 * end-to-end against the REAL, migration-applied database (GATE_ACTIVATION_INVARIANT,
 * SD-LEO-INFRA-REQUIRE-END-END-001 FR-2):
 *
 *   legal_templates/venture_legal_overrides (schema, migration
 *   20260713_legal_doc_producer_schema.sql + hardening)
 *     -> lib/eva/legal-doc-producer.js (worker: generateLegalDocsForVenture)
 *       -> lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js
 *          (consumer: checkRequiredLegalDocs)
 *
 * Scoped to the legal-producer/gate chain this SD adds -- not the full
 * Stage-23 pipeline (S20-S22 upstream preflight is out of this SD's scope
 * and would require fixturing unrelated venture_artifacts rows).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { generateLegalDocsForVenture } from '../../lib/eva/legal-doc-producer.js';
import { checkRequiredLegalDocs } from '../../lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js';

dotenv.config();

const supabase = createSupabaseServiceClient();

let testCompanyId;
let testVentureId;

// Gate on a real database (SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001 CAPA CA-1 pattern).
const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

const silentLogger = { info: () => {}, warn: () => {} };

describe.skipIf(!HAS_REAL_DB)('Legal-doc producer activation invariant (SD-FDBK-FIX-BUILD-LEGAL-DOC-001)', () => {
  beforeAll(async () => {
    testCompanyId = uuidv4();
    testVentureId = uuidv4();

    const { error: companyError } = await supabase.from('companies').insert({
      id: testCompanyId,
      name: 'Activation Invariant Test Co',
      website: 'https://activation-invariant-test.example.com/about',
      created_at: new Date().toISOString(),
    });
    if (companyError) throw new Error(`Fixture company insert failed: ${companyError.message}`);

    const { error: ventureError } = await supabase.from('ventures').insert({
      id: testVentureId,
      name: 'Activation Invariant Test Venture',
      is_demo: true, // SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-002: fixture flagged at creation
      company_id: testCompanyId,
      problem_statement: 'legal-doc-producer activation invariant integration test',
      value_proposition: 'Proves the schema-worker-consumer chain end to end',
      current_lifecycle_stage: 1,
      status: 'active',
      created_at: new Date().toISOString(),
    });
    if (ventureError) throw new Error(`Fixture venture insert failed: ${ventureError.message}`);
  });

  afterAll(async () => {
    if (testVentureId) {
      // venture_legal_overrides.venture_id is ON DELETE CASCADE (unchanged by
      // the hardening migration, which only tightened template_id) so this
      // cascades cleanup of any rows the producer wrote during the test.
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
    if (testCompanyId) {
      await supabase.from('companies').delete().eq('id', testCompanyId);
    }
  });

  it('BEFORE the producer runs, the Stage-23 consumer sees the legal gate as unsatisfied', async () => {
    const result = await checkRequiredLegalDocs({ supabase, ventureId: testVentureId, logger: silentLogger });
    expect(result.hasRequired).toBe(false);
  });

  it('the worker (generateLegalDocsForVenture) writes real rows to venture_legal_overrides', async () => {
    const result = await generateLegalDocsForVenture({ supabase, ventureId: testVentureId, logger: silentLogger });
    expect(result.ok).toBe(true);
    expect(result.generated).toHaveLength(2);

    const { data: rows, error } = await supabase
      .from('venture_legal_overrides')
      .select('generated_content, generated_at, is_active')
      .eq('venture_id', testVentureId);
    expect(error).toBeNull();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.is_active).toBe(true);
      expect(row.generated_at).toBeTruthy();
      expect(row.generated_content).toContain('Activation Invariant Test Co');
      expect(row.generated_content).toContain('activation-invariant-test.example.com');
      expect(row.generated_content).toContain('IT IS NOT LEGAL ADVICE');
      expect(row.generated_content).not.toContain('{{'); // no leftover substitution markers
    }
  });

  it('AFTER the producer runs, the Stage-23 consumer sees the legal gate as satisfied (end-to-end chain proven)', async () => {
    const result = await checkRequiredLegalDocs({ supabase, ventureId: testVentureId, logger: silentLogger });
    expect(result.hasRequired).toBe(true);
    expect(result.presentTypes.has('terms_of_service')).toBe(true);
    expect(result.presentTypes.has('privacy_policy')).toBe(true);
  });

  it('RLS: an anon-key client cannot write to venture_legal_overrides (hardening migration verification)', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!anonKey) {
      // Environment doesn't expose an anon key to this test runner -- skip
      // rather than false-pass/false-fail on an unrelated env gap.
      return;
    }
    const anonClient = createClient(process.env.SUPABASE_URL, anonKey);
    const { error } = await anonClient.from('venture_legal_overrides').insert({
      venture_id: testVentureId,
      template_id: uuidv4(),
      generated_content: 'self-certification attempt',
      generated_at: new Date().toISOString(),
    });
    // Anon (unauthenticated) role is not even in the `authenticated` policy
    // target, so this must fail regardless of fn_user_has_venture_access.
    expect(error).not.toBeNull();
  });
});
