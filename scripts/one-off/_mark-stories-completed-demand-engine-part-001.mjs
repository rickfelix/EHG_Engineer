#!/usr/bin/env node
// SD-LEO-INFRA-DEMAND-ENGINE-PART-001: per-criterion-verified user story completion.
// US-007 is deliberately EXCLUDED -- its AC ("a mock-tracked autonomy row CAN graduate") is
// directly contradicted by the verified, shipped behavior of evaluateGraduation() (the per-row
// execution_mode==='mock' break is unconditional). Spec-conflict signaled to the coordinator
// (signal_id 62ea5f9b-9db9-4476-a4e5-6cebf28a1a68); US-007 stays 'ready' pending a ruling.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const COMPLETIONS = [
  {
    id: 'c85e2d66-b9bf-47bc-954d-440f0fbfb048', // US-001
    evidence: "declareMockRun() (lib/marketing/mock-outreach-executor.js) returns a fresh UUID; runMockOutreachSend() only enters mock mode when the caller passes that mockRunId -- no env var/caller-option substitute exists. Verified: tests/unit/marketing/mock-outreach-executor.test.js 'declareMockRun (US-001)' + the US-004 refusal test (no mock path entered without mockRunId).",
  },
  {
    id: 'c9f2dfbf-3580-4487-a340-ad4d4bc4ad6e', // US-002
    evidence: "runMockOutreachSend() destructures assertOutreachAuthorized()'s result to exactly { authorized, reason, snapshot } -- `mode` is never bound as a local name. Verified: tests/unit/marketing/mock-outreach-executor.test.js 'never forwards the wrapper-internal mode field to the caller's buildSend or the result'.",
  },
  {
    id: '0f2dc3b8-d80f-4ea4-84b2-cc1e2721c477', // US-003
    evidence: "mock-outreach-executor.js has zero import of any adapter/Resend module (structural guarantee, not a runtime check). Verified: tests/unit/marketing/mock-outreach-executor.test.js (mock pipeline) + tests/unit/marketing/mock-outreach-ci-negative.test.js static import-line check.",
  },
  {
    id: 'ad37b2cc-35a3-497f-8dde-363b42af19b4', // US-004
    evidence: "authorized=false + no mockRunId returns { executed:false, ledgerEntryId:null } with zero supabase.insert() calls. Verified: tests/unit/marketing/mock-outreach-executor.test.js 'runMockOutreachSend — clean refusal (US-004)'.",
  },
  {
    id: 'cb3f32a3-620a-4ff2-a110-8e45dae07218', // US-005
    evidence: "insertLedgerRowSelfHealing() stamps execution_mode='mock' for the mock branch and 'live' for the authorized branch on every write path; no branch omits the stamp. Verified: tests/unit/marketing/mock-outreach-executor.test.js 'execution_mode stamping (US-005)' (3 tests: mock, live, never-unstamped).",
  },
  {
    id: 'eaefada5-9a0a-4b05-9432-30a10efd9e7c', // US-006
    evidence: "New mock_outreach_personas table (migration database/migrations/20260913_mock_outreach_personas.sql, applied live) stamps mock_run_id+persona_template on every persona; authorMockContent() stamps the same provenance into marketing_content.metadata. Verified: tests/unit/marketing/synthetic-personas.test.js (5 tests).",
  },
  {
    id: '3d62c8e3-1d7a-4d35-883b-4703529545ac', // US-008
    evidence: "CI negative test runs with RESEND_API_KEY set to a real-shaped fake value and a below-go-live venture, exercises BOTH the mock-run-declared and no-mock-run-declared paths in one run, asserts zero fetch() calls and zero execution_mode='live' ledger rows. Verified: tests/unit/marketing/mock-outreach-ci-negative.test.js.",
  },
  {
    id: '2ef2464d-c9bd-43f4-a9b7-e6d90abf5883', // US-009
    evidence: "lib/marketing/mock-graduation-transcript.js imports and calls the REAL evaluateGraduation() from lib/marketing/autonomy-gate.js (no parallel/duplicated mock-only implementation) -- the identical code path a live channel's outcomes run through. Verified: tests/unit/marketing/mock-graduation-transcript.test.js (3 tests exercising the real function).",
  },
];

let updated = 0;
for (const { id, evidence } of COMPLETIONS) {
  const { data: existing, error: fetchErr } = await supabase.from('user_stories').select('metadata').eq('id', id).maybeSingle();
  if (fetchErr || !existing) {
    console.error(`SKIP ${id}: fetch failed (${fetchErr?.message || 'not found'})`);
    continue;
  }
  const { error } = await supabase
    .from('user_stories')
    .update({
      status: 'completed',
      validation_status: 'validated',
      completed_at: new Date().toISOString(),
      completed_by: 'EXEC (session 64728de4)',
      metadata: { ...(existing.metadata || {}), completion_evidence: evidence },
    })
    .eq('id', id);
  if (error) {
    console.error(`FAILED ${id}: ${error.message}`);
  } else {
    console.log(`OK ${id}`);
    updated += 1;
  }
}
console.log(`\nUpdated ${updated}/${COMPLETIONS.length} stories. US-007 deliberately left at 'ready' pending spec-conflict ruling.`);
process.exit(0);
