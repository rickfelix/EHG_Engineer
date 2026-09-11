#!/usr/bin/env node
// PLAN-TO-LEAD SCOPE_AUDIT gate for SD-LEO-FIX-PRE-COMMIT-SECRET-001: mark the 3 remaining
// sd_scope_deliverables rows (FR-1, FR-2, FR-3) completed. Only the FR-4 (test suite) row
// auto-completed via the TESTING sub-agent trigger; these three are the actual code changes,
// independently confirmed by TESTING (b6035ffe, direct inspection of .husky/pre-commit lines
// 269-335), REGRESSION (1d785f8f, non-merge equivalence + no naming collision), and SECURITY
// (31065390, SECRET_PATTERNS byte-identical + no fail-open path found across 6 probes).
// Worker Golf, session 81425e08-c5b5-4fde-bafc-f0b9d5e9c349.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '5cb177fc-6627-44b5-9bfe-0ebc531fbb29';

const IDS = [
  '82532bbd-7b38-4f78-a8d6-53e2781ee499', // FR-1
  'b660b8e9-4c95-4f58-b8ca-322ac0b0414f', // FR-2
  '315b6f0e-794c-455c-bb4d-e3a15e6e54d4', // FR-3
];

// verified_by is CHECK-constrained to ('EXEC','PLAN','LEAD','QA_DIRECTOR','DATABASE_ARCHITECT',
// 'DESIGN_AGENT') per leo_protocol_enforcement_001_scope_deliverables.sql:48 — 'PLAN' matches
// this SD's current phase (PLAN_VERIFICATION); the worker identity is recorded in metadata.
const VERIFIER = 'PLAN';
const now = new Date().toISOString();

async function main() {
  const { data, error } = await supabase
    .from('sd_scope_deliverables')
    .update({
      completion_status: 'completed',
      completion_evidence: 'Shipped in commit 67b4bd8a91f (.husky/pre-commit lines 269-335); independently verified by TESTING (b6035ffe-e611-46c9-9765-179bef0b0424, PASS 95%), REGRESSION (1d785f8f-4b61-4ab5-baa1-fa959d8484f2, PASS 92%), and SECURITY (31065390-2932-4d56-8f6e-8dcee15d99e3, PASS 93%).',
      verified_by: VERIFIER,
      verified_at: now,
      completed_at: now,
      metadata: {
        producer: 'exec_worker_verified',
        verified_evidence_ids: {
          testing: 'b6035ffe-e611-46c9-9765-179bef0b0424',
          regression: '1d785f8f-4b61-4ab5-baa1-fa959d8484f2',
          security: '31065390-2932-4d56-8f6e-8dcee15d99e3',
        },
        commit_sha: '67b4bd8a91f',
        verified_by_worker: 'Golf',
        verified_by_session: '81425e08-c5b5-4fde-bafc-f0b9d5e9c349',
      },
    })
    .eq('sd_id', SD_ID)
    .in('id', IDS)
    .select('id, deliverable_name, completion_status');
  if (error) throw error;
  if (!data || data.length !== IDS.length) {
    throw new Error(`Expected ${IDS.length} rows updated, got ${data ? data.length : 0}`);
  }
  console.log('OK updated', JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  });
}
