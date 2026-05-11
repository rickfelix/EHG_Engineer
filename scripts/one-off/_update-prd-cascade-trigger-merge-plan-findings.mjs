/**
 * Update PRD for SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001 with PLAN sub-agent v2 findings.
 *
 * RISK v2 (80a1ffce, MEDIUM/WARNING @ 86): 6 NEW risks, 2 BLOCKER-class:
 * - R-11 BLOCKER: session_lifecycle_events ALREADY EXISTS, schema uses 'metadata' (not 'payload')
 * - R-13 BLOCKER: Original trigger has 3 branches (SET/CLEAR/fall-through). Preserve SET branch verbatim.
 * - R-12 RESCOPE: lib/heartbeat-manager.mjs::startHeartbeat exists. sd-start.js doesn't call it. ~5 LOC fix.
 *
 * TESTING (942ae278, APPROVE-WITH-CONCERNS @ 86): C-1 FR-8 needs TS-13, C-3 TS-3 sandbox-infeasible split, C-4 glob pattern.
 *
 * After UPDATE, restore claim cols (cascade-trigger workaround eat-our-own-dogfood).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-9d966989-c8d8-47f4-9eba-ee8056a829d1';
const SD_ID = '9d966989-c8d8-47f4-9eba-ee8056a829d1';
const SESSION = process.env.CLAUDE_SESSION_ID;

if (!SESSION) {
  console.error('CLAUDE_SESSION_ID required');
  process.exit(2);
}

// Load existing PRD to update specific fields
const { data: prd, error: fe } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, system_architecture, acceptance_criteria, test_scenarios, risks, implementation_approach, executive_summary')
  .eq('id', PRD_ID)
  .single();

if (fe) {
  console.error('PRD fetch:', fe);
  process.exit(1);
}

console.log('Loaded existing PRD with', prd.functional_requirements?.length || 0, 'FRs,',
  prd.test_scenarios?.length || 0, 'TS,',
  prd.risks?.length || 0, 'risks');

// ===== FR UPDATES =====

// R-11 + R-13: Update FR-2 (preserve SET branch + SECURITY INVOKER)
// R-12: Rescope FR-3 to ~5 LOC sd-start.js change
// R-11: Update FR-5 to use existing session_lifecycle_events table
const updatedFRs = prd.functional_requirements.map(fr => {
  if (fr.id === 'FR-2') {
    return {
      ...fr,
      title: 'Surgical CREATE OR REPLACE on sync_is_working_on_with_session — preserve all 3 branches, narrow CLEAR only',
      description: 'Modify the AFTER UPDATE trigger function on claude_sessions. **Original function has THREE branches** (SET on claim acquisition, CLEAR on release, fall-through) per database-agent FR-1 evidence (rca-fr1-out.clean.json L763). Migration MUST preserve SET branch verbatim (IF OLD.sd_key IS NULL AND NEW.sd_key IS NOT NULL AND NEW.status=active flips is_working_on=true on sd_v2). The CLEAR branch is the ONLY one being narrowed: from "any status change" to "irrevocable transitions only" (sd_key→NULL OR status→released/completed). Function MUST preserve SECURITY INVOKER attribute (NOT SECURITY DEFINER per R-14). NOTIFY pgrst, reload schema in same transaction.',
      acceptance_criteria: [
        'Migration file at database/migrations/<date>_sync_is_working_on_preserve_recoverable_stale.sql exists',
        'CREATE OR REPLACE FUNCTION public.sync_is_working_on_with_session() (idempotent, exact name match)',
        'SET branch preserved verbatim: IF OLD.sd_key IS NULL AND NEW.sd_key IS NOT NULL AND NEW.status=active flips is_working_on=true (per database-agent rca-fr1-out.clean.json L763 original body)',
        'CLEAR branch narrowed: only fires on (OLD.sd_key NOT NULL AND NEW.sd_key IS NULL) OR (OLD.status=active AND NEW.status IN (released, completed))',
        'CAS guard: UPDATE WHERE active_session_id = OLD.session_id (cross-session safety)',
        'SECURITY INVOKER preserved (no SECURITY DEFINER), no SET search_path change',
        'Migration ends with NOTIFY pgrst, reload schema in same transaction',
        'Backward-compat: UPDATE status=released still clears claim cols (irrevocable transition)',
        'cleanup_stale_sessions Block 3 (30s grace) still works post-fix'
      ]
    };
  }
  if (fr.id === 'FR-3') {
    return {
      ...fr,
      title: 'Wire startHeartbeat into sd-start.js (RESCOPED — use existing lib/heartbeat-manager.mjs)',
      description: '**RESCOPED per PLAN risk-agent v2 R-12**: lib/heartbeat-manager.mjs::startHeartbeat() ALREADY EXISTS with 30s setInterval, graceful-release, exit handlers, retry logic, ownership-mode support. Already wired into add-prd-to-database.js + handoff.js + phase-preflight.js + BaseExecutor.js. **Real gap**: scripts/sd-start.js does NOT call startHeartbeat after successful claim_sd RPC. Fix: ~5 LOC import + invocation in sd-start.js (after claim verification, before printing the SD summary). ownershipMode=cooperative (per existing pattern). EXEC must inspect lib/heartbeat-manager.mjs sendHeartbeat() function — if it does NOT include status=active in UPDATE alongside heartbeat_at, EXEC must add it (per R-7 race mitigation). Eliminates ~150 LOC vs original FR-3 (no new file scripts/lib/heartbeat-keepalive.mjs).',
      acceptance_criteria: [
        'scripts/sd-start.js imports startHeartbeat from lib/heartbeat-manager.mjs',
        'startHeartbeat(CLAUDE_SESSION_ID, {ownershipMode: cooperative}) called after successful claim_sd RPC + verification',
        'EXEC verifies lib/heartbeat-manager.mjs sendHeartbeat() UPDATE includes BOTH heartbeat_at AND status=active (R-7 mitigation). If missing, EXEC adds status=active to the UPDATE payload.',
        'Empirical test (post-merge integration): claim SD via sd-start, wait 150s without external refresh, claude_sessions.status STILL active (not stale)',
        'Re-run sd-start: existing heartbeat-manager exit handlers handle graceful re-entry',
        'NO new file scripts/lib/heartbeat-keepalive.mjs created (per R-12 rescope; reuse existing infra)'
      ]
    };
  }
  if (fr.id === 'FR-4') {
    return {
      ...fr,
      description: 'Add tests/unit/migrations/sync-is-working-on-trigger-static-pin.test.js that GLOB-resolves the migration file via fs.readdirSync + filter for filename match (suffix `_sync_is_working_on_preserve_recoverable_stale.sql`) — NOT hardcoded date prefix per testing-agent C-4. Then fs.readFileSync + 5 regex assertions: (a) IF block contains released AND completed (CLEAR branch narrowing), (b) SET branch preserved (regex for original IF OLD.sd_key IS NULL AND NEW.sd_key IS NOT NULL), (c) UPDATE has CAS active_session_id = OLD.session_id, (d) NOTIFY pgrst at end, (e) function name `public.sync_is_working_on_with_session` exact match (no plural-typo per testing-agent W-4).',
      acceptance_criteria: [
        'tests/unit/migrations/sync-is-working-on-trigger-static-pin.test.js exists',
        'Glob-by-suffix pattern: fs.readdirSync(database/migrations) + filter for *_sync_is_working_on_preserve_recoverable_stale.sql (NOT hardcoded date)',
        '5 regex assertions: (a) released+completed in CLEAR, (b) SET branch preserved, (c) CAS guard, (d) NOTIFY pgrst, (e) exact function name',
        'Test PASSES on FR-2 migration as written',
        'Inject regression (e.g., remove SET branch) → test FAILS with clear message',
        'Run via vitest in CI'
      ]
    };
  }
  if (fr.id === 'FR-5') {
    return {
      ...fr,
      title: 'Audit trail to EXISTING session_lifecycle_events table (R-11 corrected)',
      description: '**R-11 CORRECTION per PLAN risk-agent v2**: session_lifecycle_events table ALREADY EXISTS with schema (id uuid, event_type text, session_id text, machine_id text, terminal_id text, pid integer, reason text, latency_ms integer, **metadata jsonb** (NOT payload), created_at timestamptz). claim_sd already INSERTs CLAIM_TAKEOVER, CLAIM_AUTO_RECLAIM, SESSION_CREATED rows. FR-2 trigger MUST use existing schema — INSERT INTO session_lifecycle_events with event_type=SESSION_STATUS_TRANSITION, session_id=NEW.session_id, reason=concat(OLD.status, ->, NEW.status), metadata=jsonb_build_object(old_status, OLD.status, new_status, NEW.status, sd_key, OLD.sd_key, claim_cleared, <bool>). Per testing-agent R-16, narrow audit-INSERT predicate to fire only when sd_key OR status changed (skip pure heartbeat-only updates) — reduces volume ~99%.',
      acceptance_criteria: [
        'session_lifecycle_events table NOT created (already exists; do NOT add CREATE TABLE in migration)',
        'Trigger uses metadata jsonb column (NOT payload — column does not exist)',
        'Trigger uses event_type=SESSION_STATUS_TRANSITION (matches existing claim_sd writers vocabulary)',
        'Audit-INSERT predicate narrowed: only fires when (OLD.sd_key IS DISTINCT FROM NEW.sd_key) OR (OLD.status IS DISTINCT FROM NEW.status) — skips heartbeat-only updates per R-16',
        'metadata.claim_cleared accurately reflects which branch ran',
        'Empirical test: trigger fire on status flip → row appears in session_lifecycle_events with correct metadata; trigger fire on heartbeat-only update → NO new row'
      ]
    };
  }
  if (fr.id === 'FR-8') {
    return {
      ...fr,
      acceptance_criteria: [
        ...fr.acceptance_criteria,
        'Audit marker emitted on BOTH success AND degraded paths (pattern source PR #3691 [LFA_GRACEFUL_DEGRADE_TO_ACCEPTED])',
        'Failure-recovery path documented: if smoke fails, re-apply original body from rca-fr1-out.clean.json L763 + verify SELECT prosrc FROM pg_proc + re-run smoke; if still failing, file QF and rollback'
      ]
    };
  }
  return fr;
});

// ===== TEST SCENARIO UPDATES =====

const updatedTS = [
  ...prd.test_scenarios.filter(ts => ts.id !== 'TS-3'),
  // Replace TS-3 with TS-3a (unit, fast) + TS-3b (integration, post-merge only) per C-3
  {
    id: 'TS-3a',
    name: 'Heartbeat keep-alive setInterval scheduled correctly (unit, fast — sandbox-feasible)',
    given: 'sd-start.js calls startHeartbeat with CLAUDE_SESSION_ID',
    when: 'Mocked supabase tracks UPDATE calls on claude_sessions',
    then: 'setInterval scheduled with HEARTBEAT_INTERVAL_MS (30000); fake-timers advance 65000ms shows ≥2 UPDATE calls each with heartbeat_at field set',
    type: 'unit'
  },
  {
    id: 'TS-3b',
    name: 'FR-3 keep-alive prevents stale flip in real DB (integration, .skip in CI — runs in post-merge per FR-8)',
    given: 'sd-start.js claims probe SD, real Supabase, no external heartbeat refresh',
    when: 'Wait 150s',
    then: 'claude_sessions.status STILL active (not stale)',
    type: 'integration_post_merge_only'
  },
  // R-13 + new TS-14: SET branch preservation
  {
    id: 'TS-14',
    name: 'FR-2 SET branch preserved: claim acquisition still flips is_working_on=true (integration)',
    given: 'FR-2 migration applied; probe sd_v2 with sd_key=null, is_working_on=false; probe claude_sessions row',
    when: 'UPDATE claude_sessions SET sd_key=probe_sd_key, status=active WHERE session_id=probe_session_id',
    then: 'SELECT sd_v2 → is_working_on=true (SET branch fires; if narrowed away accidentally, this stays false). Pre-rewrite: same result. Post-rewrite: same result. Regression check.',
    type: 'integration'
  },
  // R-7 + W-2: keep-alive payload includes status='active'
  {
    id: 'TS-15',
    name: 'FR-3 keep-alive UPDATE payload includes BOTH heartbeat_at AND status=active (unit, R-7 mitigation)',
    given: 'Mocked supabase, lib/heartbeat-manager.mjs sendHeartbeat invocation',
    when: 'Spy on UPDATE call payload',
    then: 'payload contains BOTH {heartbeat_at: <ISO>, status: "active"} — catches R-7 race where cron flipped status mid-tick',
    type: 'unit'
  },
  // C-1 + new TS-13: FR-8 audit marker
  {
    id: 'TS-13',
    name: 'FR-8 smoke runner emits correct audit marker on success AND degraded paths (integration)',
    given: 'FR-8 smoke runner exists',
    when: 'Run smoke with FR-2 migration applied',
    then: 'stdout contains [SD_CLAIM_COL_PRESERVATION_VERIFIED] (success) OR [SD_CLAIM_COL_PRESERVATION_DEGRADED] (FR-2 absent). Probe rows cleaned up in finally block (verified via SELECT count after run = 0).',
    type: 'integration'
  }
];

// ===== RISK UPDATES =====
// Add 6 new risks from PLAN risk-agent v2 + 4 from PLAN testing-agent
const additionalRisks = [
  {id: 'R-11', description: 'BLOCKER (PLAN risk-agent v2 80a1ffce): session_lifecycle_events ALREADY EXISTS — original PRD assumed CREATE TABLE IF NOT EXISTS. Schema uses metadata (jsonb) NOT payload. claim_sd already INSERTs to it.', impact: 'high', likelihood: 'eliminated by R-11 fix in PRD', mitigation: 'PRD FR-5 description + AC corrected to use existing schema + metadata column. EXEC reads corrected PRD.'},
  {id: 'R-12', description: 'RESCOPE (PLAN risk-agent v2 80a1ffce): lib/heartbeat-manager.mjs::startHeartbeat ALREADY EXISTS + wired into 4 callers, scripts/session-tick.cjs ALREADY runs as detached subprocess (different col: process_alive_at). Real gap = sd-start.js doesnt call startHeartbeat — ~5 LOC fix.', impact: 'medium (scope-creep avoided)', likelihood: 'eliminated by R-12 rescope in PRD', mitigation: 'PRD FR-3 RESCOPED to ~5 LOC sd-start.js change. NO new file. ~150 LOC saved.'},
  {id: 'R-13', description: 'BLOCKER (PLAN risk-agent v2 80a1ffce): Original sync_is_working_on_with_session function has THREE branches (SET/CLEAR/fall-through). Original PRD Option 1 SQL only showed CLEAR branch — EXEC reading literally would write a failing migration that breaks claim acquisition.', impact: 'critical (would break claim_sd acquisition)', likelihood: 'eliminated by R-13 fix in PRD', mitigation: 'PRD FR-2 description + AC corrected to require preservation of SET branch verbatim. New AC: SET branch preserved per rca-fr1-out.clean.json L763.'},
  {id: 'R-14', description: 'Original function is SECURITY INVOKER (not DEFINER), no SET search_path. Migration must preserve.', impact: 'medium (silent privilege escalation if violated)', likelihood: 'low', mitigation: 'PRD FR-2 AC adds explicit SECURITY INVOKER preservation requirement. Static-pin guard test FR-4 case (e) verifies.'},
  {id: 'R-15', description: 'PLAN risk-agent v2 + testing-agent: TS-3 (150s wait) sandbox-infeasible. CI has 5-10min timeout but 150s wait is flaky.', impact: 'medium', likelihood: 'high', mitigation: 'Split into TS-3a (unit, fast, mocked timers) + TS-3b (integration, .skip in CI, runs in post-merge per FR-8).'},
  {id: 'R-16', description: 'PLAN risk-agent v2: FR-5 audit fires on EVERY trigger fire (heartbeat-only updates included). At 30s × N sessions = thousands of rows/day.', impact: 'low (long-term storage)', likelihood: 'high', mitigation: 'Narrow trigger audit-INSERT predicate: fire only when (OLD.sd_key IS DISTINCT FROM NEW.sd_key) OR (OLD.status IS DISTINCT FROM NEW.status). Reduces volume ~99%. PRD FR-5 AC updated.'},
  {id: 'R-17', description: 'PLAN testing-agent C-1: FR-8 has zero test scenarios — only AC-10 workflow-file-existence check.', impact: 'medium (smoke runner could fail silently)', likelihood: 'medium', mitigation: 'New TS-13: FR-8 smoke runner emits correct audit marker on success AND degraded paths.'},
  {id: 'R-18', description: 'PLAN testing-agent W-1: Missing FR-2 multi-field UPDATE (sd_key→NULL AND status=stale) edge case.', impact: 'low', likelihood: 'low', mitigation: 'New TS-15 (or extension of TS-1) covers multi-field UPDATE. The OR semantics in CLEAR branch handle this correctly — sd_key→NULL is irrevocable, fires CLEAR regardless of status.'}
];

const updatedRisks = [...prd.risks, ...additionalRisks];

// ===== UPDATE PRD =====

const newExecSummary = prd.executive_summary +
  ' [PLAN sub-agents v2 review (2026-05-11): Two BLOCKER-class spec defects corrected ' +
  '(R-11 session_lifecycle_events table exists with metadata col not payload; R-13 trigger has ' +
  '3 branches not 1, preserve SET branch verbatim). Defense-in-depth FR-3 rescoped per R-12 to ' +
  '~5 LOC sd-start.js fix using existing lib/heartbeat-manager.mjs::startHeartbeat (drops ~150 LOC, ' +
  'avoids duplicate infra). Test plan expanded to ≥17 scenarios (TS-13 FR-8 audit marker, TS-3a/b ' +
  'split for sandbox-infeasibility, TS-14 SET branch preservation, TS-15 keep-alive R-7 mitigation). ' +
  '6 new risks tracked (R-11..R-16). Risk-agent v2 evidence: 80a1ffce-1333-4a8e-8f66-fa68840cd2ea ' +
  'WARNING @ 86. Testing-agent: 942ae278-accb-4a71-b465-fdcc9623d70d APPROVE-WITH-CONCERNS @ 86.]';

const { error: ue } = await supabase
  .from('product_requirements_v2')
  .update({
    functional_requirements: updatedFRs,
    test_scenarios: updatedTS,
    risks: updatedRisks,
    executive_summary: newExecSummary,
    updated_at: new Date().toISOString(),
    metadata: {
      ...((prd.metadata || {})),
      plan_subagent_v2_evidence: {
        risk_v2_id: '80a1ffce-1333-4a8e-8f66-fa68840cd2ea',
        testing_id: '942ae278-accb-4a71-b465-fdcc9623d70d',
        database_id: 'fabb2c47-011e-4c17-a017-83c313554d1b',
        applied_at: new Date().toISOString(),
        blocker_class_corrections: ['R-11 (session_lifecycle_events table exists)', 'R-13 (preserve SET branch)']
      }
    }
  })
  .eq('id', PRD_ID);

if (ue) {
  console.error('PRD update:', ue);
  process.exit(1);
}

console.log('PRD updated. FRs:', updatedFRs.length, '| TS:', updatedTS.length, '| risks:', updatedRisks.length);

// ===== RESTORE CLAIM (cascade-trigger workaround eat-our-own-dogfood) =====
console.log('\n=== Restoring claim columns ===');
await supabase.from('claude_sessions').update({ status: 'active', stale_reason: null, stale_at: null, heartbeat_at: new Date().toISOString() }).eq('session_id', SESSION);
await supabase.from('strategic_directives_v2').update({ claiming_session_id: SESSION, is_working_on: true, active_session_id: SESSION }).eq('id', SD_ID);

// Verify
const { data: vas } = await supabase.from('v_active_sessions').select('computed_status').eq('session_id', SESSION).single();
const { data: sd } = await supabase.from('strategic_directives_v2').select('claiming_session_id, is_working_on, current_phase').eq('id', SD_ID).single();
console.log('session:', vas, '| SD:', sd);
