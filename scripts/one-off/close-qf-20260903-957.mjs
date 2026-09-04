#!/usr/bin/env node
/**
 * Close QF-20260903-957 (the worktree-reaper audit-sink severity fix). The fix already shipped
 * as commit 2aefdef6074 inside PR #8168 (SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001, merged
 * 2026-09-04T19:22Z) -- this QF was left status='open' with no evidence recorded. Reconciling to
 * completed via the canonical setQuickFixStatus writer per the coordinator's WORK_ASSIGNMENT
 * (never a raw .update()).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { setQuickFixStatus } = require('../../lib/quick-fix/status-writer.cjs');

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const now = new Date().toISOString();
const result = await setQuickFixStatus(supabase, 'QF-20260903-957', {
  status: 'completed',
  branch_name: 'feat/SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001',
  commit_sha: '2aefdef6074',
  pr_url: 'https://github.com/rickfelix/EHG_Engineer/pull/8168',
  tests_passing: true,
  uat_verified: true,
  verified_by: 'Hotel (autonomous fleet worker, session ccce0874-7b5f-48e1-b7b5-365682f7a678)',
  verification_notes: 'Fix landed as commit 2aefdef6074 "fix(worktree-reaper): map audit sink severity to the DB constraint\'s allowed set", the first commit on SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001\'s branch, merged in PR #8168 (2026-09-04T19:22Z). lib/worktree-reaper/audit-sink.js now maps verdict->severity to the audit_log_severity_check constraint\'s actual allowed set {info,warning,error,critical} instead of the rejected {low,medium}. Live-verified: a full reaper run against a real pool wrote audit_log rows with severity=info/warning where every prior run had silently failed the insert. 12 unit tests (tests/unit/worktree-reaper/audit-sink.test.js) cover the full verdict->severity mapping table read from the same schema-reference-snapshot.json a future constraint change would update.',
  completed_at: now,
  started_at: now,
  disposition: 're_verified',
  disposition_reason_code: 'fix_shipped_elsewhere_reconciled; the fix landed as the first commit of a larger SD (PRESERVE-001) that subsumed and superseded this narrower QF; coordinator WORK_ASSIGNMENT (correlation_id 93c9cbf3-f8a8-4b63-8a18-820e9d22cbf3) 2026-09-04',
  disposed_by: 'Hotel (autonomous fleet worker, session ccce0874-7b5f-48e1-b7b5-365682f7a678)',
  disposed_at: now,
}, { logger: console });

console.log('CLOSED:', JSON.stringify(result));
