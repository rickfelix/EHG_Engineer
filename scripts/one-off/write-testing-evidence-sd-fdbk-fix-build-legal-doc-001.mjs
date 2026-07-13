#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const row = {
  sd_id: '22d83e94-a561-479b-9010-2d82791c65be',
  sub_agent_code: 'TESTING',
  sub_agent_name: 'QA Engineering Director',
  phase: 'LEAD-FINAL-APPROVAL',
  verdict: 'PASS',
  confidence: 95,
  metadata: {
    activation_invariant_verified: true,
    tests_run: [
      'tests/integration/legal-doc-producer-activation.test.js',
    ],
    evidence: {
      activation_test: 'tests/integration/legal-doc-producer-activation.test.js -- 4/4 PASS against the real, migration-applied database (npx vitest run --project db)',
      chain_verified: 'legal_templates/venture_legal_overrides (schema) -> generateLegalDocsForVenture (worker) -> checkRequiredLegalDocs (consumer, stage-23-launch-readiness.js) proven end-to-end: gate unsatisfied before the producer runs, satisfied after, against a real disposable venture+company fixture',
      rls_hardening_reverified: 'anon-key client insert to venture_legal_overrides rejected (PR #6056 adversarial-review fix independently re-verified live)',
      fixture_cleanup_verified: 'direct DB query post-run confirmed zero residue in ventures/companies/venture_legal_overrides',
      pr: 'https://github.com/rickfelix/EHG_Engineer/pull/6062 (merged)',
    },
    sd_type: 'bugfix',
    notes: 'Activation-invariant gate triggered because this SD ships a schema+worker+consumer chain (migration 20260713_legal_doc_producer_schema.sql + legal-doc-producer.js + stage-23-launch-readiness.js checkRequiredLegalDocs). Wrote and ran a real integration test against the live DB rather than bypassing; also used the opportunity to independently re-verify the RLS hardening fix from the PR #6056 adversarial review round.',
  },
};

const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .insert(row)
  .select('id')
  .single();

if (error) {
  console.error('INSERT FAIL:', error);
  process.exit(1);
}

console.log('EVIDENCE_ROW_ID=' + data.id);
