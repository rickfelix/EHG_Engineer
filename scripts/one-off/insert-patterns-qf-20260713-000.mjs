#!/usr/bin/env node
// QF-20260713-000: durably capture 2 high-priority retro action items as issue_patterns
// rows. The canonical path (scripts/auto-extract-patterns-from-retro.js ->
// IssueKnowledgeBase.createPattern()) is confirmed broken (RCA this session,
// deterministic PAT-001 collision since 2025-11-26, signaled harness-bug high).
// Mirrors the ALREADY-PROVEN-SAFE content-fingerprint id scheme from
// lib/rca/rca-orchestrator.js:291 (PAT-AUTO-<fingerprint8>) instead of the
// broken lexicographic read-max-and-increment generator.
import 'dotenv/config';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_ID = 'e46d99d4-9fb7-4a28-a364-a36dad1bc7b3'; // SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-D1
const RETRO_ID = 'e83976b0-9ba1-4abd-b7f4-aeb06db771a8';

const items = [
  {
    issue_summary: 'For any @cloudflare/vitest-pool-workers test that relies on vi.mock() to intercept a call inside the module-under-test\'s own internal import graph, add an assertion on the observed side effect (e.g. "the mocked forward function was actually called with these args") -- do not treat vi.isMockFunction()=true on the imported reference alone as proof the mock took effect in that sandbox.',
    category: 'testing',
    severity: 'medium',
    prevention_checklist: [
      'vi.mock() interception inside a workerd/vitest-pool-workers sandbox does not reliably propagate into a module\'s own internal import graph',
      'Assert the observed side effect (call args/count on the mocked fn), not just vi.isMockFunction() truthiness on the imported reference',
      'If the suite must prove end-to-end wiring, prefer the plain-Node pool for that specific test',
    ],
  },
  {
    issue_summary: 'Before writing "every X already passes through this ONE choke point" language into a PRD\'s functional requirements or system_architecture section, grep every call site of the claimed choke point and confirm none of them has its own internal try/catch that would prevent the error from reaching it.',
    category: 'process',
    severity: 'medium',
    prevention_checklist: [
      'A "single choke point" claim in a PRD is a testable assertion, not a design statement -- verify it by grepping every call site before PLAN sign-off',
      'Internal try/catch blocks at individual call sites are the most common way a stated choke point is silently bypassed',
      'Caught late (PLAN_VERIFICATION, not PLAN) in the SD that sourced this lesson -- 2 of 4 route handlers swallowed their own DB errors before reaching the new wiring',
    ],
  },
];

for (const item of items) {
  const fingerprint = crypto.createHash('sha256').update(item.issue_summary).digest('hex').slice(0, 8);
  const pattern_id = `PAT-AUTO-${fingerprint}`;

  const { data: existing } = await supabase
    .from('issue_patterns')
    .select('id, pattern_id')
    .eq('pattern_id', pattern_id)
    .maybeSingle();
  if (existing) {
    console.log(`SKIP (already exists): ${pattern_id}`);
    continue;
  }

  const { data, error } = await supabase
    .from('issue_patterns')
    .insert({
      pattern_id,
      category: item.category,
      severity: item.severity,
      issue_summary: item.issue_summary,
      occurrence_count: 1,
      first_seen_sd_id: SD_ID,
      last_seen_sd_id: SD_ID,
      prevention_checklist: item.prevention_checklist,
      status: 'active',
      source: 'retrospective',
      metadata: {
        retrospective_id: RETRO_ID,
        captured_via: 'scripts/one-off/insert-patterns-qf-20260713-000.mjs',
        reason: 'Canonical auto-extract-patterns-from-retro.js path confirmed broken this session (PAT-001 collision, RCA + harness-bug signal filed) -- manual capture using the proven-safe PAT-AUTO-<fingerprint> id scheme instead of the broken sequential generator.',
        source_qf: 'QF-20260713-000',
      },
    })
    .select('id, pattern_id')
    .single();

  if (error) {
    console.error(`INSERT FAIL (${pattern_id}):`, error.message);
    process.exit(1);
  }
  console.log(`CREATED: ${data.pattern_id} (${data.id})`);
}
