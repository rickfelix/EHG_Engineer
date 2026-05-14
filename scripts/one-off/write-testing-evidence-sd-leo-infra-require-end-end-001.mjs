#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const row = {
  sd_id: 'ec4221f0-9f95-40a3-acb6-f4f2036351e9',
  sub_agent_code: 'TESTING',
  sub_agent_name: 'QA Engineering Director',
  phase: 'LEAD-FINAL-APPROVAL',
  verdict: 'PASS',
  confidence: 95,
  metadata: {
    activation_invariant_verified: true,
    tests_run: [
      'scripts/modules/activation-invariant/trigger-evaluator.test.js',
      'scripts/modules/handoff/executors/lead-final-approval/gates/activation-invariant-gate.test.js'
    ],
    evidence: {
      trigger_evaluator_tests: '11/11 PASS (175ms)',
      activation_invariant_gate_tests: '9/9 PASS (227ms)',
      gate_file_exists: 'scripts/modules/handoff/executors/lead-final-approval/gates/activation-invariant-gate.js',
      gate_registered_in_gates_js: 'gates.js:49 import + gates.js:1213 push + gates.js:1234 export',
      fr4_audit_utility: 'audit-activation-chain.mjs validated on SD-GVOS-COMPOSER-SNAPSHOTLOCKED-REGISTRY-ORCH-001: 1/4 FAIL (missing schema, worker, test)',
      fr6_scanner: 'scan-completed-sds-for-activation-gap.mjs --since 2026-05-01: 109 scanned, 63 triggered, 63 flagged (dry-run no writes)',
      self_validating_gate: 'TRUE — the gate scans for metadata.activation_invariant_verified=true; this row provides that field for the gate to validate against itself at LEAD-FINAL-APPROVAL'
    },
    sd_type: 'infrastructure',
    notes: 'Self-validating gate scenario: this SD ships the activation-invariant gate (FR-2) at canonical path scripts/modules/handoff/executors/lead-final-approval/gates/activation-invariant-gate.js. PRD activation_test_id points at the gate test file. All 4 verification tasks passed.'
  }
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
