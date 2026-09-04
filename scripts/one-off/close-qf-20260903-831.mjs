#!/usr/bin/env node
/**
 * Close QF-20260903-831. The fix already shipped as commit b1d4781abf1
 * "fix(QF-20260903-831): idle-QF hint population no longer requires prior claim history"
 * in PR #8152, merged before this QF was picked up. Confirmed live on origin/main:
 * lib/fleet/session-predicates.mjs's liveDispatchableFleetMembers/isDispatchableFleetMember
 * deliberately does NOT require everClaimed, scripts/coordinator-idle-qf-hint.mjs uses it, and
 * tests/unit/coordinator/idle-qf-hint.test.js's "counts and hints a freshly-spawned,
 * never-claimed live seat past its spin-up grace" test passes. Reconciling the stale open row
 * via the canonical status writer (never a raw update), then releasing this session's claim.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { setQuickFixStatus } = require('../../lib/quick-fix/status-writer.cjs');
const { bestEffortReleaseSdByKey } = require('../../lib/fleet/best-effort-release.mjs');

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sessionId = process.env.CLAUDE_SESSION_ID;

const now = new Date().toISOString();
const result = await setQuickFixStatus(supabase, 'QF-20260903-831', {
  status: 'completed',
  branch_name: 'qf/QF-20260903-831',
  commit_sha: 'b1d4781abf1',
  pr_url: 'https://github.com/rickfelix/EHG_Engineer/pull/8152',
  tests_passing: true,
  uat_verified: true,
  verified_by: 'Hotel (autonomous fleet worker, session ' + sessionId + ')',
  verification_notes: 'Fix already shipped: commit b1d4781abf1 "fix(QF-20260903-831): idle-QF hint population no longer requires prior claim history", merged in PR #8152. lib/fleet/session-predicates.mjs isDispatchableFleetMember/liveDispatchableFleetMembers deliberately does NOT require everClaimed (see its own docblock, which cites this QF). scripts/coordinator-idle-qf-hint.mjs:272 uses liveDispatchableFleetMembers instead of liveFleetWorkers for exactly this reason. Live-verified on origin/main: tests/unit/coordinator/idle-qf-hint.test.js "counts and hints a freshly-spawned, never-claimed live seat past its spin-up grace" passes (1/1). This QF row was claimed and reconciled without a new code change -- the fix landed via a prior, separately-merged QF PR before this row was picked up.',
  completed_at: now,
  disposition: 're_verified',
  disposition_reason_code: 'fix_shipped_elsewhere_reconciled; fix already merged in PR #8152 (commit b1d4781abf1) before this row was claimed; live-verified test passes on origin/main; claimed via checkin claim path 2026-09-04',
  disposed_by: 'Hotel (autonomous fleet worker, session ' + sessionId + ')',
  disposed_at: now,
}, { logger: console });

console.log('CLOSED:', JSON.stringify(result));

const release = await bestEffortReleaseSdByKey(supabase, sessionId, 'QF-20260903-831', 'completed_reconciled', console.error);
console.log('RELEASE:', JSON.stringify(release));
