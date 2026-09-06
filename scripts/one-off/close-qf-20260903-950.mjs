#!/usr/bin/env node
/**
 * Close QF-20260903-950 (sync-deliverables-from-git.js's evidence model was
 * crash-as-zero, discarded-branch-blind, and structurally squash-merge-blind).
 * Fixed with 3 commits on fix/QF-20260903-950, merged as PR #8172, coordinator-ACK'd
 * (reply 9f5d76b8). Closing via the canonical setQuickFixStatus writer (never a raw
 * .update()).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { setQuickFixStatus } = require('../../lib/quick-fix/status-writer.cjs');

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const now = new Date().toISOString();
const PR_URL = 'https://github.com/rickfelix/EHG_Engineer/pull/8172';
const MERGE_SHA = '3dc43d01efe59c132841051e1279cf2150d8cd2d';

const result = await setQuickFixStatus(supabase, 'QF-20260903-950', {
  status: 'completed',
  branch_name: 'fix/QF-20260903-950',
  commit_sha: MERGE_SHA,
  pr_url: PR_URL,
  tests_passing: true,
  uat_verified: true,
  verified_by: 'Hotel (autonomous fleet worker, session ccce0874-7b5f-48e1-b7b5-365682f7a678)',
  verification_notes: `Fixed sync-deliverables-from-git.js's evidence model in 3 commits: (1) replaced execSync+shell-redirect with runHardenedGit (argv array, shell:false) so a crash surfaces as a thrown error instead of silently reading as zero commits; (2) diffed against the resolved ref instead of ambient HEAD so a discarded/renamed branch can't silently pass; (3) structural squash-merge-blindness fix -- reused lib/drive-loop/score/leg1-landed-alocal.js's chairman-ratified anchoredKeyPattern/LANDED_LOG_MAX_BUFFER_BYTES to scan every commit subject on main instead of a branch-vs-main diff (a branch-diff model reads zero commits once the feature branch is gone post-squash-merge, even though the work is plainly on main). New test tests/unit/sync-deliverables-squash-blindness.test.js (4 tests) exercises real git plumbing against this repo's own live history. Merged PR: ${PR_URL} at ${MERGE_SHA}.`,
  completed_at: now,
  started_at: now,
  disposition: 'premise_resolved',
  disposition_reason_code: 'fix_shipped; genuine 3-commit fix authored and merged this session, coordinator-ACK\'d (reply 9f5d76b8); unblocks Golf-3\'s SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-B at LEAD_FINAL',
  disposed_by: 'Hotel (autonomous fleet worker, session ccce0874-7b5f-48e1-b7b5-365682f7a678)',
  disposed_at: now,
}, { logger: console, fromStatus: 'open' });

console.log('CLOSED:', JSON.stringify(result));
