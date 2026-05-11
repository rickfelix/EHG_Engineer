// FR-1 RCA evidence write: insert sub_agent_execution_results row.

import { createDatabaseClient } from '../lib/supabase-connection.js';
import { randomUUID } from 'crypto';

const SD_ID = '9d966989-c8d8-47f4-9eba-ee8056a829d1';
const SD_KEY = 'SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001';

const detailedAnalysis = `
FR-1 RCA: PATH D EMPIRICALLY CONFIRMED via controlled reproduction.

================================================================
ROOT CAUSE
================================================================
Trigger: sync_is_working_on_with_session
Table:   claude_sessions (AFTER UPDATE)
Body:    CREATE OR REPLACE FUNCTION public.sync_is_working_on_with_session()
         (security_definer=false, language=plpgsql)

The trigger has TWO branches. The pertinent (clearing) branch:

  IF TG_OP = 'UPDATE' AND (
    (OLD.sd_key IS NOT NULL AND NEW.sd_key IS NULL) OR
    (OLD.status = 'active' AND NEW.status != 'active' AND OLD.sd_key IS NOT NULL)
  ) THEN
    UPDATE strategic_directives_v2
    SET is_working_on = false,
        active_session_id = NULL,
        updated_at = NOW()
    WHERE sd_key = OLD.sd_key
      AND active_session_id = OLD.session_id;
    RETURN NEW;
  END IF;

CRITICAL: clears is_working_on + active_session_id. Does NOT clear claiming_session_id.
This matches live evidence (10:44:51 UTC stale flip in this very session).

================================================================
TRIGGER MECHANISM
================================================================
1. Long-running operation (sub-agent call > 120s) causes heartbeat staleness
2. cleanup_stale_sessions cron (or manual UPDATE) sets claude_sessions.status='stale'
3. AFTER UPDATE trigger fires sync_is_working_on_with_session
4. Trigger UPDATEs sd_v2 SET is_working_on=false, active_session_id=NULL

The operator perceives this as ".update() on sd_v2 cleared claim cols" because
the timing aligns with their own UPDATE attempt. Empirical truth: their UPDATE
was a coincident witness; the cron+trigger is the actual writer.

================================================================
REPRODUCTION (RCA-2)
================================================================
Two synthetic SDs + sessions inserted. Two probes run:

PROBE RCA-2-1 (PATH A test): Direct UPDATE on sd_v2 with LEAD-enrichment style
fields (description, scope, risks, metadata). Result:
  - claiming_session_id_preserved: TRUE
  - is_working_on_preserved:       TRUE
  - active_session_id_preserved:   TRUE
PATH A DISPROVEN: direct sd_v2 UPDATE does NOT clear claim cols.

PROBE RCA-2-2 (PATH D test): UPDATE claude_sessions.status active->stale.
Result:
  - is_working_on_was_cleared:       TRUE (true -> false)
  - active_session_id_was_cleared:   TRUE (set -> NULL)
  - claiming_session_id_preserved:   TRUE (preserved)
PATH D CONFIRMED: claude_sessions stale flip cascades to sd_v2 via trigger.

================================================================
TRIGGER ENUMERATION SUMMARY
================================================================
strategic_directives_v2: 47 triggers
  None directly clear claim cols on UPDATE.
  enforce_progress_on_completion (BEFORE UPDATE) only blocks completion if progress<100.
  notify_working_sd_change (AFTER UPDATE) only emits notify, no UPDATE side-effect.
  All 47 triggers reviewed — none implement the claim-clearing.

product_requirements_v2: 7 triggers (none touch claim cols)
sd_phase_handoffs:       9 triggers (none touch claim cols)
claude_sessions:         1 trigger — sync_is_working_on_trigger (THE CULPRIT)

================================================================
FUNCTION DEPENDENCY MAP
================================================================
Functions that reference claim/is_working columns (16 total):
  - auto_validate_handoff (trigger fn — touches is_working_on for handoff blockage)
  - claim_sd (writes claim cols on takeover/new claim — sec_def)
  - cleanup_stale_sessions (cron writer — block 3 explicitly clears all 3 claim cols
    on released_reason=STALE_CLEANUP, ALSO triggers PATH D via UPDATE claude_sessions)
  - complete_orchestrator_sd (writes is_working_on=false on completion — sec_def)
  - create_or_replace_session (session lifecycle)
  - enforce_completed_phase_alignment (validation only)
  - enforce_is_working_on_for_handoffs (BEFORE INSERT trigger on sd_phase_handoffs)
  - fn_check_sd_claim (read-only check — sec_def)
  - get_working_sd (read-only)
  - notify_working_sd_change (notify-only AFTER UPDATE trigger on sd_v2)
  - release_sd (sec_def — clears all 3 claim cols on caller's claim)
  - release_session (clears all 3 claim cols on caller's session)
  - report_pid_validation_failure (clears all 3 claim cols when PID-not-found)
  - set_working_sd (sets is_working_on)
  - switch_sd_claim (sec_def — claim-switch path)
  - sync_is_working_on_with_session (THE CULPRIT TRIGGER FN)

================================================================
CLEANUP_STALE_SESSIONS BEHAVIOR (CONFIRMED)
================================================================
BLOCK 1: Marks active sessions stale if heartbeat_at < NOW() - 120s
  -> AT THIS POINT, the AFTER UPDATE trigger fires for each row, calling
     sync_is_working_on_with_session, which clears sd_v2 is_working_on +
     active_session_id (PATH D cascade).
BLOCK 2: After 30s grace, transitions stale->released, clearing sd_key.
BLOCK 3: Final UPDATE on sd_v2 explicitly clears all 3 claim cols
  (active_session_id, claiming_session_id, is_working_on) for any SD whose
  active_session_id OR claiming_session_id matches a recently-released session.

So the FULL cascade for a long-running sub-agent operation:
  T+0s:    operation starts, heartbeat fresh
  T+120s:  cron fires, sets status='stale' -> trigger clears is_working_on +
           active_session_id (claiming_session_id PRESERVED)
  T+150s:  cron fires again, sets status='released' (clears sd_key)
           -> Block 3 ALSO clears claiming_session_id (now ALL THREE blank)
  T+155s:  operator's UPDATE on sd_v2 lands; observes blank cols and (wrongly)
           attributes to their own UPDATE.

================================================================
PG_CRON STATUS
================================================================
pg_cron extension is NOT installed in this database (cron.job does not exist).
The cleanup_stale_sessions function therefore must be invoked by an external
scheduler (likely scripts/lib/lifecycle/sd-claim-reaper.mjs background process,
or a Supabase Edge Function with cron). Trigger-level fix covers ALL invokers.

================================================================
PATH SELECTION (FR-1.5 GATE)
================================================================
PATH SELECTED: D (with B as a downstream follow-on)
CONFIDENCE: HIGH (98%) — empirical reproduction, cleanup completed, two
controlled probes corroborate.

PATH A (sd_v2 BEFORE UPDATE trigger overreach):  DISPROVEN empirically (RCA-2-1)
PATH B (cleanup_stale_sessions clearing block):  CONFIRMED as a SECOND clearer
                                                  (further along in the cascade)
PATH C (release_sd race from other worker):      NOT NEEDED to explain the bug
PATH D (sync_is_working_on_with_session):        CONFIRMED ROOT CAUSE
PATH E (cannot reproduce):                       N/A — reproduced cleanly

================================================================
RECOMMENDED FR-2 FIX SURFACE
================================================================

OPTION 1 (PREFERRED — SURGICAL): Modify sync_is_working_on_with_session
to NOT clear claim cols when transition is into 'stale' (recoverable) — only
clear on 'released' or 'completed' (irrevocable). 30-second grace window
already provided by cleanup_stale_sessions Block 2/3 for sessions that truly
fail to recover.

  Migration sketch (CREATE OR REPLACE FUNCTION):
    -- Make the second branch state-aware: only clear if status indicates
    -- session has TERMINATED (NEW.status IN released/completed) — NOT
    -- on transient 'stale' status which can be reverted by a heartbeat refresh.
    IF TG_OP = 'UPDATE' AND (
      (OLD.sd_key IS NOT NULL AND NEW.sd_key IS NULL) OR
      (OLD.status = 'active' AND NEW.status IN ('released', 'completed') AND OLD.sd_key IS NOT NULL)
    ) THEN
      UPDATE strategic_directives_v2
      SET is_working_on = false,
          active_session_id = NULL,
          updated_at = NOW()
      WHERE sd_key = OLD.sd_key
        AND active_session_id = OLD.session_id;
      RETURN NEW;
    END IF;

  Rationale: 'stale' is a recoverable state (a heartbeat refresh CAN restore
  the session). Clearing is_working_on/active_session_id on every transient
  stale flip is overreach. Holding off until 'released' (the irrevocable
  state) gives the natural 30-second grace window without exposing the SD to
  partial-state visibility from concurrent handoff.js calls.

OPTION 2 (DEFENSIVE — CALLER-SIDE): Add a 'claim refresh' helper to
handoff.js that re-asserts is_working_on=true + active_session_id=<session>
immediately before issuing the canonical handoff, IF the trigger has cleared.
  Pros: no schema migration risk
  Cons: race-prone — between refresh and handoff INSERT another stale-flip
        could occur. Doesn't fix the root cause.

OPTION 3 (PREVENTIVE — CALLER-SIDE): Have sd-start.js launch a heartbeat
keep-alive subprocess that pings heartbeat_at every 60s for the duration of
the LEO session. Combined with Option 1 trigger fix, eliminates ALL window
of missed heartbeat -> stale -> trigger.
  Pros: proactive — also helps PATH B (Block 3 final cleanup)
  Cons: adds OS-level process complexity; does not eliminate root cause

RECOMMENDED COMBO: Option 1 (root cause) + Option 3 (defense in depth).

================================================================
BACKWARD-COMPAT AUDIT
================================================================
Callers depending on the CURRENT trigger behavior (i.e., assuming stale flip
clears claim cols):
  - cleanup_stale_sessions itself: Block 1 transitions active->stale; Block 3
    explicitly clears all 3 claim cols on released_reason=STALE_CLEANUP.
    Block 1 SHOULD work fine if Option 1 narrows the trigger — Block 1 doesn't
    READ claim cols, only writes. Block 3 will still clear after a 30s grace.
    => COMPATIBLE.
  - sd:next / sd:status: read claim cols to display "active session". Will see
    is_working_on=true for an extra 30s after stale flip. => MINOR UX (still
    truthful — session might still recover via heartbeat).
  - handoff.js / leo-orchestrator: enforce_is_working_on_for_handoffs trigger
    on sd_phase_handoffs INSERT requires is_working_on=true. Currently FAILS
    after stale flip; with Option 1 will SUCCEED (trigger waits for released).
    => CORRECTLY FIXES the witnessed bug.
  - notify_working_sd_change AFTER UPDATE trigger: reads is_working_on to
    decide notification. Frequency drops slightly. => HARMLESS.
  - process_validity / monitor scripts: read status='stale' as an indicator
    to investigate. Behavior unchanged. => COMPATIBLE.

CALLERS NEEDING UPDATE (NONE): no caller has been found that depends on the
trigger explicitly clearing is_working_on at the 'stale' transition (vs the
'released' transition) — the 30-second grace is widely understood as recovery
window in cleanup_stale_sessions itself.

CONCLUSION: Option 1 is backward-compatible. The cleanup_stale_sessions Block 3
already provides the canonical clear-all-3 behavior 30s later for sessions that
fail to recover. Option 1 narrows the trigger to align with this existing grace.
`;

// Using template literals to avoid escape-quote pain
const FR4_DETAIL = `Add tests/regression that runs pg_get_functiondef on sync_is_working_on_with_session and asserts the body contains the literal phrase: NEW.status IN ('released', 'completed') -- NOT the looser NEW.status != 'active'. This static-pins Option 1 against accidental reversion.`;

const FR5_DETAIL = `Modify the cleared branch to also INSERT into session_lifecycle_events with event_type='CLAIM_AUTO_CLEARED_BY_RELEASE' and metadata including OLD.session_id, OLD.status, NEW.status, OLD.heartbeat_at. Provides forensic visibility for any future diagnoses.`;

const SQL_SKETCH = `CREATE OR REPLACE FUNCTION public.sync_is_working_on_with_session()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.sd_key IS NULL AND NEW.sd_key IS NOT NULL AND NEW.status = 'active' THEN
    UPDATE strategic_directives_v2
    SET is_working_on = true, active_session_id = NEW.session_id, updated_at = NOW()
    WHERE sd_key = NEW.sd_key;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND (
    (OLD.sd_key IS NOT NULL AND NEW.sd_key IS NULL) OR
    (OLD.status = 'active' AND NEW.status IN ('released', 'completed') AND OLD.sd_key IS NOT NULL)
  ) THEN
    UPDATE strategic_directives_v2
    SET is_working_on = false, active_session_id = NULL, updated_at = NOW()
    WHERE sd_key = OLD.sd_key
      AND active_session_id = OLD.session_id;
    RETURN NEW;
  END IF;
  RETURN NEW;
END; $$;`;

const FR2_DETAIL = `CREATE OR REPLACE FUNCTION public.sync_is_working_on_with_session() so the clearing branch fires only when NEW.status IN ('released', 'completed') -- not on transient 'stale' transitions. Stale is recoverable via heartbeat refresh; cleanup_stale_sessions Block 3 still provides the irrevocable 3-column clear after the 30-second grace.`;

const recommendations = [
  {
    priority: 'P1',
    title: 'PRD FR-2 Option 1: narrow sync_is_working_on_with_session trigger',
    detail: FR2_DETAIL,
    sql_sketch: SQL_SKETCH,
  },
  {
    priority: 'P2',
    title: 'PRD FR-3 Option 3 (defense in depth): heartbeat keep-alive in sd-start.js',
    detail: `Spawn a detached subprocess that pings claude_sessions.heartbeat_at every 60 seconds for the LEO session lifetime. Eliminates the 120-second heartbeat-timeout window for active LEO sessions, so cleanup_stale_sessions never marks them stale.`,
  },
  {
    priority: 'P3',
    title: 'PRD FR-4 (regression-pin): static guard test for trigger body',
    detail: FR4_DETAIL,
  },
  {
    priority: 'P3',
    title: 'PRD FR-5 (audit trail): log every is_working_on=false transition',
    detail: FR5_DETAIL,
  },
];

const warnings = [
  {
    type: 'PATH_A_REVISION',
    message: `Original LEAD framing (scripts that .update() sd_v2 silently clear cols) was empirically incorrect. PRD FR-2 surface MUST be SQL trigger / function (PATH D), NOT app-side enrichment script audit. Bug attribution was a coincident-timing illusion: cron+trigger fires concurrently with operator UPDATE, creating false correlation.`,
  },
  {
    type: 'CRON_LOCATION_UNCONFIRMED',
    message: `pg_cron extension is NOT installed (cron.job table missing). cleanup_stale_sessions is invoked by an external scheduler (likely scripts/lib/lifecycle/sd-claim-reaper.mjs or a Supabase Edge Function). Trigger-level fix (Option 1) covers ALL invokers; if PRD chooses caller-side fix instead, must inventory ALL invokers.`,
  },
  {
    type: 'PATH_B_FOLLOW_ON',
    message: `After stale->released transition (30-second grace), cleanup_stale_sessions Block 3 ALSO clears claiming_session_id. Option 1 trigger fix only protects the 30-second grace window. For sessions truly dead (no recovery), the 3-col clearing is correct. PRD must decide: (a) keep Block 3 unchanged (recommended -- provides canonical irrevocable clear), or (b) introduce a configurable retention window for orchestrator/long-running ops.`,
  },
];

const criticalIssues = [
  {
    severity: 'high',
    title: 'sync_is_working_on_with_session trigger overreach on transient stale',
    description: `AFTER UPDATE trigger on claude_sessions clears sd_v2.is_working_on + active_session_id when status flips active->stale, even though stale is recoverable via heartbeat refresh. This causes handoff.js to fail with "Cannot create handoff for SD without active session claim" during long-running operations (sub-agent calls > 120 seconds).`,
    path: 'D',
    file: 'database (CREATE OR REPLACE FUNCTION migration required)',
    fn: 'public.sync_is_working_on_with_session()',
    line_in_body: 'Second IF branch: WHEN OLD.status=active AND NEW.status != active',
  },
];

const conditions = [
  `PATH D root cause empirically reproduced via 2 synthetic-probe runs (RCA-2-1 disproves PATH A; RCA-2-2 confirms PATH D)`,
  `Cleanup completed without leaving orphan probe rows`,
  `47 triggers on strategic_directives_v2 enumerated; NONE clear claim cols on UPDATE -- confirms LEAD risk-agent finding (PATH A LOW likelihood)`,
  `16 functions that reference claim cols enumerated and bodies inspected for cascade analysis`,
  `pg_cron NOT installed; external scheduler invokes cleanup_stale_sessions -- trigger-level fix covers all invokers`,
  `Backward-compat audit: NO callers depend on stale-transition clearing; cleanup_stale_sessions Block 3 still provides irrevocable clear after 30-second grace`,
];

const metadata = {
  fr: 'FR-1',
  sd_key: SD_KEY,
  generated_via: 'scripts/one-off/_db-agent-fr1-rca-trigger-enumeration.mjs + _db-agent-fr1-rca-reproduce-bug-2.mjs',
  evidence_files: [
    'scripts/one-off/_db-agent-fr1-rca-trigger-enumeration.mjs',
    'scripts/one-off/_db-agent-fr1-rca-reproduce-bug.mjs',
    'scripts/one-off/_db-agent-fr1-rca-reproduce-bug-2.mjs',
    'rca-fr1-out.clean.json (~78KB raw enumeration)',
  ],
  trigger_counts: { strategic_directives_v2: 47, product_requirements_v2: 7, sd_phase_handoffs: 9, claude_sessions: 1 },
  function_overloads: { release_sd: 1, release_session: 1, cleanup_stale_sessions: 1, sync_is_working_on_with_session: 1, claim_sd: 1, report_pid_validation_failure: 1, enforce_progress_on_completion: 1, check_handoff_bypass: 1, complete_orchestrator_sd: 1 },
  path_selection: 'D',
  path_disproven: ['A'],
  path_follow_ons: ['B'],
  reproduction_status: 'CONFIRMED',
  recommended_fix: 'Option 1 (SQL trigger CREATE OR REPLACE FUNCTION) + Option 3 (heartbeat keep-alive) -- defense in depth',
  risk_to_existing_callers: 'NONE',
  closes_pattern: 'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (18-witness, claim-column-loss variant)',
  empirical_evidence: {
    RCA_2_1_path_a_disproven: { claiming_session_id_preserved: true, is_working_on_preserved: true, active_session_id_preserved: true },
    RCA_2_2_path_d_confirmed: { is_working_on_was_cleared: true, active_session_id_was_cleared: true, claiming_session_id_preserved: true },
  },
};

const client = await createDatabaseClient('engineer', { verify: false });
try {
  const r = await client.query(`
    INSERT INTO sub_agent_execution_results (
      id, sd_id, sub_agent_code, sub_agent_name, verdict, confidence,
      critical_issues, warnings, recommendations, conditions,
      detailed_analysis, summary, phase, source, validation_mode,
      metadata, created_at
    ) VALUES (
      $1, $2, 'DATABASE', 'database-agent', 'PASS', 92,
      $3, $4, $5, $6,
      $7, $8, 'PLAN', 'database-agent', 'prospective',
      $9, NOW()
    ) RETURNING id, sd_id, verdict, confidence
  `, [
    randomUUID(),
    SD_ID,
    JSON.stringify(criticalIssues),
    JSON.stringify(warnings),
    JSON.stringify(recommendations),
    JSON.stringify(conditions),
    detailedAnalysis,
    'FR-1 RCA: PATH D confirmed via empirical reproduction. sync_is_working_on_with_session AFTER UPDATE trigger on claude_sessions clears sd_v2.is_working_on + active_session_id when status flips active->stale. PATH A (direct sd_v2 UPDATE) disproven. Recommend Option 1 (narrow trigger to NEW.status IN released/completed) + Option 3 (heartbeat keep-alive). Backward-compat audit: ZERO callers depend on current behavior.',
    JSON.stringify(metadata),
  ]);
  console.log('INSERTED row:', JSON.stringify(r.rows[0], null, 2));
} finally {
  await client.end();
}
