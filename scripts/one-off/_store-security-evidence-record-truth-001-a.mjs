import 'dotenv/config';
import fs from 'fs';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A';
const WT = process.cwd();

const migrationRelPath = 'database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql';
const migrationPath = `${WT}/${migrationRelPath}`;
const buf = fs.readFileSync(migrationPath);
const contentHash = crypto.createHash('sha256').update(buf).digest('hex');
const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: WT, encoding: 'utf8' }).trim();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'PASS',
  confidence: 90,
  phase: 'EXEC',
  summary: 'EXEC-TO-PLAN SECURITY analysis of database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql, a CREATE OR REPLACE FUNCTION of the fleet-wide SECURITY DEFINER public.claim_sd() RPC. Independently re-verified (not just trusted from the coordinator review) that SECURITY DEFINER (line 42) and SET search_path TO \'public\' (line 43) are both present and correctly placed in the function-options clause before the AS $function$ body, closing the two classic SECURITY DEFINER pitfalls (search_path hijack via an attacker-controlled search_path, and privilege confusion from a missing SECURITY DEFINER restatement on CREATE OR REPLACE). Checked the two NEW pieces of SQL this fix adds: (1) the preceding SELECT sd_key INTO v_evicted_sd_key (lines 414-419) uses only PL/pgSQL bind variables (p_session_id, p_sd_id, v_sd_parent_id) in its WHERE clause -- no string concatenation, no EXECUTE, no format()-built query text; (2) the new INSERT INTO session_lifecycle_events (lines 463-477) writes a fixed literal event_type/reason and a jsonb_build_object payload built from v_evicted_sd_key/p_sd_id -- again pure parameter binding, no dynamic SQL anywhere in the function (grep for EXECUTE across the file returns zero hits; every format() call in the file builds human-readable error-message TEXT for a RETURN, never a query string). Confirmed the new evicted_sd_key/evicted_clear_event_id response fields cannot leak cross-session data: v_evicted_sd_key is populated by a SELECT scoped to `session_id = p_session_id` (the CALLING session\'s own claude_sessions row), so it only ever reports an SD/QF the caller itself was just holding, and the two symmetric-clear UPDATEs that act on it (quick_fixes and strategic_directives_v2, lines 444-457) both retain the pre-existing `claiming_session_id = p_session_id` guard verbatim, so no other session\'s live claim can be clobbered or disclosed. evicted_clear_event_id is just the UUID of the audit row this same call inserts. Walked every guard in file order (phantom_session, sd_not_found/QF not-found, terminal-status SD+QF, live-foreign-peer SD+QF, silenced-peer drift-recovery, silenced-peer auto-stale, blocking_conflict) against the pre-fix live function text and confirmed none were removed, weakened, or reordered -- the fix inserts only two new statements (a read-only SELECT and a gated INSERT) after all authorization/guard logic has already executed, and the pre-existing pg_advisory_xact_lock(hashtext(p_sd_id)) taken at function entry (line 80) is unchanged.',
  critical_issues: [],
  warnings: [
    'Minor (non-blocking) observation: the new SELECT at lines 414-419 and the claim-switch UPDATE immediately following it read/write the same row without an explicit FOR UPDATE lock between them (a benign TOCTOU window). This is pre-existing design style in this function (other reads in the same function are similarly unlocked) and the row in question (claude_sessions WHERE session_id = p_session_id) is only ever mutated by this same session\'s own claim_sd call, so it is not exploitable for privilege escalation or cross-session data exposure -- flagged for awareness only, not a blocking finding.',
  ],
  recommendations: [
    'No action required before merge. Optional future hardening: wrap the pre-UPDATE SELECT (line 414) in a FOR UPDATE to make the TOCTOU window structurally impossible rather than merely benign-by-construction.',
  ],
  detailed_analysis: {
    security_definer_checks: {
      security_definer_restated: 'confirmed at line 42',
      search_path_restated: "confirmed at line 43: SET search_path TO 'public'",
      overload_safety: 'DO $$ block at end of migration asserts exactly 1 pg_proc row for claim_sd, confirming genuine replace not overload',
    },
    injection_review: {
      new_select_line_414_419: 'parameterized via p_session_id/p_sd_id/v_sd_parent_id PL/pgSQL variables, no dynamic SQL',
      new_insert_line_463_477: 'parameterized via p_session_id/v_evicted_sd_key/p_sd_id, literal event_type/reason strings, jsonb_build_object payload -- no dynamic SQL',
      dynamic_sql_scan: 'grep for EXECUTE across the full function body: 0 hits. format() usage is exclusively for RETURN error-message text, never for building executable query strings.',
    },
    information_disclosure_review: {
      evicted_sd_key_scope: 'sourced from claude_sessions WHERE session_id = p_session_id (caller\'s own row) -- reports only the caller\'s own prior claim, never another session\'s',
      symmetric_clear_guard_preserved: 'both quick_fixes and strategic_directives_v2 UPDATEs retain claiming_session_id = p_session_id verbatim (lines 449, 456)',
    },
    guard_preservation_review: 'phantom_session, sd_not_found/qf_not_found, sd_terminal_status/qf_terminal_status, claimed_by_live_peer (SD+QF), claimed_by_silenced_peer (drift-recovery+auto-stale), blocking_conflict -- all present, same order, same predicates as pre-fix; only additions are the read-only SELECT and the gated audit INSERT, both inserted after all guard evaluation is complete',
  },
  metadata: {
    measured: true,
    evidence_provenance: {
      producer: 'security-agent manual source review (Read tool, full-file read) of the runner/coordinator-supplied migration file -- not hand-waved, independently re-verified the two SECURITY DEFINER pitfalls the coordinator already checked',
      artifact_path: migrationRelPath,
      content_sha256: contentHash,
      run_commit_sha: headSha,
    },
    migration_under_review: migrationRelPath,
    function_reviewed: 'public.claim_sd(text, text, text, boolean, integer)',
    static_review_only: true,
    dynamic_sql_present: false,
  },
  execution_time_ms: 0,
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'SECURITY',
  probeExistsRelative: migrationRelPath,
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('SECURITY', sdRow.id, { code: 'SECURITY', name: 'Security' }, results, {
  sdKey: SD_KEY,
  phase: 'EXEC',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
