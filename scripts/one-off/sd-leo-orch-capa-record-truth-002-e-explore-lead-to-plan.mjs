#!/usr/bin/env node
/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E — Explore breadth search at LEAD-TO-PLAN.
 *
 * Confirms no duplicate migration exists for the proposed audit triggers/CHECK
 * constraints, and surfaces two PLAN-phase risks: (1) the raw-SQL trigger
 * fn_auto_close_quick_fixes_on_sd_completion sets status='cancelled' with zero
 * disposition fields, bypassing the JS single-writer choke point -- out of
 * scope for THIS SD's status='closed' constraint but a related gap if scope
 * ever widens to 'cancelled'; (2) the JS single-writer's Guard B
 * (transitionRequiresDisposition, lib/quick-fix/status-writer.cjs:51-57)
 * requires disposition_reason_code/disposed_by/disposed_at on closing
 * transitions but does NOT itself require the disposition enum column to be
 * non-null -- narrower than the new DB CHECK will be. No live gap found today
 * (no caller supplies the reason-code trio while omitting disposition), but
 * the two guards are not currently 1:1.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'PASS',
  confidence: 92,
  phase: 'LEAD',
  execution_time_ms: 0,
  summary: 'Confirmed via repo-wide search (scripts/, lib/, database/migrations/) that no existing migration or code adds the proposed audit triggers (audit_quick_fixes, audit_claude_sessions, audit_feedback, audit_chairman_ratifications) or CHECK constraints (quick_fixes_disposition_check pairing rules, status-closed-requires-disposition) -- zero matches for any of those identifiers outside this SD\'s own in-flight evidence file. The only writer that sets quick_fixes.status=\'closed\' anywhere in the codebase (scripts/coordinator-stale-qf-disposition-sweep.mjs, 3 helper functions) already sets a non-null disposition in the same call, so the proposed CHECK would not break it.',
  critical_issues: [],
  warnings: [
    {
      id: 'EXP-1',
      severity: 'LOW',
      issue: 'A related but out-of-scope writer bypasses disposition tracking entirely for a different status value',
      evidence: "database/migrations/20260525_auto_close_quick_fixes_on_sd_completion.sql's trigger fn_auto_close_quick_fixes_on_sd_completion does UPDATE quick_fixes SET status='cancelled' with zero disposition fields, bypassing lib/quick-fix/status-writer.cjs entirely (called out in the migration's own comments as a known gap). It targets status='cancelled', not 'closed', so it will NOT trip this SD's proposed CHECK. Flagged for PLAN awareness only, in case scope is ever widened to cover 'cancelled' too.",
      location: 'database/migrations/20260525_auto_close_quick_fixes_on_sd_completion.sql',
    },
    {
      id: 'EXP-2',
      severity: 'LOW',
      issue: 'JS single-writer Guard B is narrower than the proposed DB CHECK',
      evidence: "lib/quick-fix/status-writer.cjs:51-57 (transitionRequiresDisposition) requires disposition_reason_code + disposed_by + disposed_at on closing transitions, but does not itself require the disposition ENUM column to be non-null. No live caller gap found (nothing currently supplies the reason-code trio while omitting disposition), but the two guards are not currently 1:1 -- PLAN should note whether Guard B should be tightened to match the new DB constraint, or left as a narrower JS-level pre-check with the DB CHECK as the authoritative backstop.",
      location: 'lib/quick-fix/status-writer.cjs:51-57',
    },
  ],
  recommendations: [
    'PLAN: confirm no caller relies on writing status=closed via a path other than the two audited writers before enabling the new CHECK constraint.',
    'PLAN: decide whether Guard B (JS) should be tightened to mirror the new DB-level CHECK, or intentionally left narrower with the DB constraint as backstop.',
  ],
  detailed_analysis: {
    searched_identifiers: ['quick_fixes_disposition_check', 'audit_quick_fixes', 'audit_claude_sessions', 'audit_feedback', 'audit_chairman_ratifications', 'trg_audit_'],
    searched_paths: ['scripts/', 'lib/', 'database/migrations/', 'repo-wide grep'],
    governance_audit_log_hardcoded_table_list: 'none found -- no CHECK constraint or enumeration restricts table_name values; all references are either writers or readers filtered by unrelated table_name values',
  },
  metadata: {
    breadth_search: true,
    exhaustive: false,
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'EXPLORE',
  probeExistsRelative: 'scripts/one-off/sd-leo-orch-capa-record-truth-002-e-validation-lead-to-plan.mjs',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('EXPLORE', sdRow.id, { code: 'EXPLORE', name: 'Explore' }, results, {
  sdKey: SD_KEY,
  phase: 'LEAD',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
