/**
 * Execution Helper Functions for Handoff CLI
 *
 * Helper functions for execute command processing.
 * Extracted from cli-main.js for modularization.
 *
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

import { execSync } from 'child_process';
import { createSupabaseServiceClient } from '../../../../lib/supabase-client.js';
import { normalizeSDId } from '../../sd-id-normalizer.js';
import { CANONICAL_WRITER_STAMP } from '../lib/canonical-writer-stamp.js';
import { createTaskHydrator } from '../../../../lib/tasks/index.js';
import { validateBypassReason, extractBypassedGate } from '../bypass-rubric.js';
import { resolveAutoProceed } from '../auto-proceed-resolver.js';

/**
 * SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 followup: post-handoff state
 * reconciliation. The per-executor state-transitions.js modules are
 * authoritative setters, but silent failures have been observed (SD stays
 * at status='draft' phase='LEAD' after an accepted LEAD-TO-PLAN). This
 * helper re-queries the SD and force-updates status/phase when drift is
 * detected. Fail-soft: any error is logged but does not fail the handoff.
 *
 * Expected post-handoff SD state per handoff type. Each entry MUST equal what that
 * handoff's authoritative setter actually writes — this table does not decide the
 * vocabulary, it mirrors it.
 *
 * *** THIS COMMENT USED TO SAY THE TABLE MATCHED THE EXECUTORS. IT DID NOT. ***
 * SD-LEO-INFRA-STATUS-VOCABULARY-SCHISM-001. From the 2026-04-24 reconciler commit
 * (0af429eaf52) until this fix, PLAN-TO-EXEC and EXEC-TO-PLAN were listed here as
 * 'in_progress' while their setters write 'active' — plan-to-exec/state-transitions.js:133
 * and fn_atomic_exec_to_plan_transition. The drift branch below therefore fired on EVERY
 * one of those handoffs and overwrote the setter milliseconds later in the same process,
 * so 'active' stopped being written at all: the audit pre_active series ran 2026-04:125,
 * 05:5, 06:12, 07:ZERO, with the collapse landing exactly on that commit.
 *
 * The false comment is why it survived three months of review — the file asserted its own
 * correctness, so anyone checking read the claim instead of the executors. If you change a
 * value here, change it because you read the setter, not because this comment says so.
 *
 * VERIFY AT THE CITED LINE: plan-to-exec/state-transitions.js has an EARLIER status write
 * at :87 setting 'in_progress'. A grep that stops at the first hit reads the file as
 * agreeing with this table and concludes there is no schism.
 */
const POST_HANDOFF_SD_STATE = {
  'LEAD-TO-PLAN': { status: 'in_progress', current_phase: 'PLAN_PRD' },       // lead-to-plan/state-transitions.js:104
  'PLAN-TO-EXEC': { status: 'active', current_phase: 'EXEC' },                // plan-to-exec/state-transitions.js:133
  'EXEC-TO-PLAN': { status: 'active', current_phase: 'PLAN_VERIFICATION' },   // fn_atomic_exec_to_plan_transition
  'PLAN-TO-LEAD': { status: 'pending_approval', current_phase: 'LEAD_FINAL' },
  'LEAD-FINAL-APPROVAL': { status: 'completed', current_phase: 'COMPLETED' },
};

async function reconcileSDStateAfterHandoff(handoffType, sdId, supabase) {
  const expected = POST_HANDOFF_SD_STATE[handoffType.toUpperCase()];
  if (!expected || !sdId) return;

  try {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);
    const queryField = isUUID ? 'id' : 'sd_key';

    const { data: sd, error: readErr } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, current_phase')
      .eq(queryField, sdId)
      .maybeSingle();

    if (readErr || !sd) {
      // Silent skip — the handoff already succeeded; a read failure here
      // doesn't justify louder noise. Log only in debug mode.
      if (process.env.LEO_TELEMETRY_DEBUG === '1') {
        console.log(`[reconcile-sd-state] read failed for ${sdId}: ${readErr?.message || 'no row'}`);
      }
      return;
    }

    const drift = sd.status !== expected.status || sd.current_phase !== expected.current_phase;
    if (!drift) return;

    const { error: updErr } = await supabase
      .from('strategic_directives_v2')
      .update({
        status: expected.status,
        current_phase: expected.current_phase,
        lifecycle_write_token: CANONICAL_WRITER_STAMP,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sd.id);

    if (updErr) {
      console.log(`   ⚠️  Post-handoff state reconciliation failed: ${updErr.message}`);
    } else {
      console.log(`   🔧 Post-handoff state reconciled: ${sd.status}/${sd.current_phase} → ${expected.status}/${expected.current_phase}`);
    }
  } catch (e) {
    if (process.env.LEO_TELEMETRY_DEBUG === '1') {
      console.log(`[reconcile-sd-state] error: ${e?.message || e}`);
    }
  }
}

/**
 * Check bypass rate limits and log to audit
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {string} handoffType - Type of handoff
 * @param {string} bypassReason - Reason for bypass
 * @returns {Promise<Object>} Result with success boolean
 */
export async function checkBypassRateLimits(sdId, handoffType, bypassReason) {
  const supabase = createSupabaseServiceClient();

  // CONST-015: Validate bypass reason against rubric before proceeding
  const rubricResult = validateBypassReason(bypassReason);
  if (!rubricResult.allowed) {
    console.error('');
    console.error('❌ BYPASS REJECTED (CONST-015 Bypass Rubric)');
    console.error(`   Category: ${rubricResult.category}`);
    console.error(`   Rule: ${rubricResult.matchedRule}`);
    console.error(`   ${rubricResult.explanation}`);
    console.error('');
    return { success: false, rejected: true, rubricResult };
  }

  if (rubricResult.category === 'UNCLASSIFIED') {
    console.log('');
    console.log('⚠️  BYPASS REASON UNCLASSIFIED — allowed but flagged for review');
    console.log(`   Reason: ${bypassReason}`);
  }

  const canonicalSdId = await normalizeSDId(supabase, sdId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Count bypasses for this SD (audit metadata only, no enforcement)
  // Count/truncation discipline (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6):
  // exact head-count — rows.length was capped at 1000 by PostgREST, which made the
  // 2000/day global threshold below UNREACHABLE (enforcement was silently dead).
  const { count: sdBypassCount, error: _sdError } = await supabase
    .from('validation_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('failure_category', 'bypass')
    .eq('sd_id', canonicalSdId || sdId)
    .gte('created_at', today.toISOString());

  // Check global bypasses today (exact head-count — see FR-6 note above)
  const { count: globalBypassCount, error: globalError } = await supabase
    .from('validation_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('failure_category', 'bypass')
    .gte('created_at', today.toISOString());

  // SD-LEO-FIX-ID-FORMAT-001: User approved bypass rate limit increase on 2026-01-26
  // Original limit was 10, increased to 2000 to accommodate high-volume automation
  // Error policy preserved: on count error the limit check is skipped (fail-open).
  if (!globalError && typeof globalBypassCount === 'number' && globalBypassCount >= 2000) {
    console.error('');
    console.error('❌ BYPASS RATE LIMIT: Max 2000 global bypasses per day reached');
    console.error(`   ${globalBypassCount} bypasses have been used today`);
    console.error('');
    return { success: false };
  }

  // SD-LEO-INFRA-GATE-FALSE-POSITIVE-001: attribute the bypass to the NAMED gate
  // it targeted (derived from the reason) so the self-improvement loop can surface
  // chronically false-positive named gates. Pure + non-throwing; degrades to null.
  let bypassedGate = null;
  try {
    bypassedGate = extractBypassedGate(bypassReason);
  } catch (_e) {
    bypassedGate = null; // never block a bypass on attribution
  }

  // Log bypass to validation_audit_log
  const correlationId = `bypass-${Date.now()}`;
  const { error: logError } = await supabase
    .from('validation_audit_log')
    .insert({
      correlation_id: correlationId,
      sd_id: canonicalSdId || sdId,
      validator_name: 'handoff_bypass',
      failure_reason: `Bypass validation for ${handoffType} handoff: ${bypassReason}`,
      failure_category: 'bypass',
      metadata: {
        handoff_type: handoffType,
        original_sd_id: sdId,
        canonical_sd_id: canonicalSdId,
        bypass_reason: bypassReason,
        bypassed_gate: bypassedGate,
        rubric_category: rubricResult.category,
        rubric_matched_rule: rubricResult.matchedRule,
        sd_bypasses_today: (sdBypassCount ?? 0) + 1,
        global_bypasses_today: (globalBypassCount ?? 0) + 1
      },
      execution_context: 'cli'
    });

  if (logError) {
    console.warn(`   ⚠️  Could not log bypass to validation_audit_log: ${logError.message}`);
  } else {
    console.log('');
    console.log('⚠️  BYPASS MODE ENABLED (SD-LEARN-010:US-005)');
    console.log('─'.repeat(50));
    console.log(`   Reason: ${bypassReason}`);
    console.log(`   SD Bypasses Today: ${(sdBypassCount ?? 0) + 1}`);
    console.log(`   Global Bypasses Today: ${(globalBypassCount ?? 0) + 1}/2000`);
    console.log('   ⚠️  Bypass logged to validation_audit_log for review');
    console.log('─'.repeat(50));
  }

  return { success: true };
}

/**
 * Hydrate and output tasks for the next phase
 * This outputs tasks in a format that Claude will read and create via TaskCreate
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {string} currentHandoff - Current handoff type (e.g., 'LEAD-TO-PLAN')
 * @param {Object} supabase - Supabase client
 */
async function hydrateAndOutputTasks(sdId, currentHandoff, supabase) {
  // Map handoff types to their target phases
  const handoffToPhase = {
    'LEAD-TO-PLAN': 'PLAN',
    'PLAN-TO-EXEC': 'EXEC',
    'EXEC-TO-PLAN': 'VERIFY',  // Or FINAL depending on track
    'PLAN-TO-LEAD': 'FINAL'
  };

  const targetPhase = handoffToPhase[currentHandoff.toUpperCase()];
  if (!targetPhase) {
    return; // No task hydration for LEAD-FINAL-APPROVAL
  }

  try {
    const hydrator = createTaskHydrator(supabase);
    const result = await hydrator.hydratePhase(sdId, targetPhase);

    if (!result.tasks || result.tasks.length === 0) {
      console.log('');
      console.log('   ℹ️  No tasks to hydrate for this phase');
      return;
    }

    // Output tasks in a format Claude can process
    console.log('');
    console.log('═'.repeat(60));
    console.log('🎯 CLAUDE_TASK_HYDRATION: Tasks for next phase');
    console.log('═'.repeat(60));
    console.log(`   Track: ${result.track}`);
    console.log(`   Phase: ${targetPhase}`);
    console.log(`   Tasks: ${result.tasks.length}`);
    console.log('');
    console.log('   INSTRUCTION: Claude MUST call TaskCreate for each task below.');
    console.log('   Use TaskUpdate to set blockedBy dependencies after creation.');
    console.log('');
    console.log('   ⚠️  IMPORTANT: These are TASKS, not handoffs!');
    console.log('      • DO NOT execute these with handoff.js');
    console.log('      • Use TaskCreate tool to create these tasks');
    console.log('');
    console.log('   Valid HANDOFF types (for handoff.js execute):');
    console.log('      LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN,');
    console.log('      PLAN-TO-LEAD, LEAD-FINAL-APPROVAL');
    console.log('');
    console.log('───────────────────────────────────────────────────────────');

    for (const task of result.tasks) {
      console.log(`   📋 TASK: ${task.id}`);
      console.log(`      Subject: ${task.subject}`);
      console.log(`      ActiveForm: ${task.activeForm}`);
      console.log(`      Description: ${task.description}`);
      if (task.blockedBy && task.blockedBy.length > 0) {
        console.log(`      BlockedBy: ${task.blockedBy.join(', ')}`);
      }
      console.log('');
    }

    console.log('═'.repeat(60));
    console.log('END_CLAUDE_TASK_HYDRATION');
    console.log('═'.repeat(60));

    // Record hydration event
    console.log('');
    console.log(`   ✅ Task hydration recorded (${result.tasks.length} tasks for ${targetPhase})`);

  } catch (err) {
    console.log('');
    console.log(`   ⚠️  Task hydration skipped: ${err.message}`);
    // Non-blocking - handoff continues even if hydration fails
  }
}

/**
 * Display execution result
 *
 * @param {Object} result - Execution result
 * @param {string} handoffType - Type of handoff
 * @param {string} sdId - Strategic Directive ID
 */
export async function displayExecutionResult(result, handoffType, sdId) {
  if (result.success) {
    console.log('');
    console.log('✅ HANDOFF SUCCESSFUL');
    console.log('='.repeat(50));
    console.log(`   Type: ${handoffType.toUpperCase()}`);
    console.log(`   SD: ${sdId}`);

    const displayScore = result.normalizedScore ?? result.qualityScore ?? Math.round((result.totalScore / result.maxScore) * 100) ?? 'N/A';
    console.log(`   Score: ${displayScore}%`);
    console.log('');
    console.log('   ⚠️  IMPORTANT: Follow the LEO protocol diligently.');

    if (result.gateResults && Object.keys(result.gateResults).length > 0) {
      console.log(`   Gates: ${Object.keys(result.gateResults).length} evaluated`);
      for (const [gateName, gateResult] of Object.entries(result.gateResults)) {
        const gatePercent = gateResult.maxScore > 0 ? Math.round((gateResult.score / gateResult.maxScore) * 100) : 0;
        const status = gateResult.passed ? '✓' : '✗';
        console.log(`      ${status} ${gateName}: ${gatePercent}%`);
      }
    }

    if (result.warnings?.length > 0) {
      console.log(`   Warnings: ${result.warnings.length}`);
    }

    // Show next step in workflow
    const nextStepMap = {
      'LEAD-TO-PLAN': { next: 'PLAN-TO-EXEC', status: 'planning', message: 'Create PRD, then run PLAN-TO-EXEC' },
      'PLAN-TO-EXEC': { next: 'EXEC-TO-PLAN', status: 'in_progress', message: 'Implement features, then run EXEC-TO-PLAN' },
      'EXEC-TO-PLAN': { next: 'PLAN-TO-LEAD', status: 'review', message: 'Verify implementation, then run PLAN-TO-LEAD' },
      'PLAN-TO-LEAD': { next: 'LEAD-FINAL-APPROVAL', status: 'pending_approval', message: '⚠️  SD is NOT complete! Run LEAD-FINAL-APPROVAL to finish' },
      'LEAD-FINAL-APPROVAL': { next: null, status: 'completed', message: '🎉 SD is now COMPLETE!' }
    };

    const nextStep = nextStepMap[handoffType.toUpperCase()];
    if (nextStep) {
      // RCA-FIX: Removed status write — the executor's state-transitions.js is the
      // authoritative state setter. This display function was overwriting the executor's
      // status (e.g., 'in_progress' → 'planning'), which then blocked subsequent handoffs
      // because verify-l2p rejects 'planning'. See PAT-HANDOFF-STATUS-OVERWRITE-001.
      const supabase = createSupabaseServiceClient();
      const canonicalId = await normalizeSDId(supabase, sdId);

      if (canonicalId && sdId !== canonicalId) {
        console.log(`   ℹ️  ID normalized: "${sdId}" -> "${canonicalId}"`);
      }

      console.log('');
      console.log('─'.repeat(50));
      console.log(`   📍 SD Status: ${nextStep.status.toUpperCase()}`);
      if (nextStep.next) {
        console.log(`   ➡️  NEXT STEP: ${nextStep.next}`);
        console.log(`      ${nextStep.message}`);
        console.log('');
        console.log('   ⚠️  DO NOT claim completion until LEAD-FINAL-APPROVAL is done');

        // SD-MAN-FEAT-CORRECTIVE-VISION-GAP-072 US-002: Machine-readable next command
        // Enables auto-chaining in CLI workflows (modeled after HEAL_NEXT_CMD pattern)
        console.log('');
        console.log(`HANDOFF_NEXT_CMD=node scripts/handoff.js execute ${nextStep.next} ${sdId}`);
      } else {
        console.log(`   ${nextStep.message}`);
      }

      // LEO 5.0: Hydrate tasks for next phase
      await hydrateAndOutputTasks(sdId, handoffType, supabase);

      // SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 followup (2026-04-24):
      // Defensive reconciliation for the "SD status stays at 'draft' after
      // accepted handoffs" drift. Each executor's state-transitions.js is
      // the authoritative setter, but silent failures have been observed
      // (e.g., atomic RPC unavailable AND legacy fallback's .update() returns
      // no error yet doesn't persist — root cause unclear; defense-in-depth
      // instead of chasing it). Re-queries the SD post-handoff and
      // force-updates status/phase when they don't match the expected
      // post-handoff values. Fail-soft — any error here is logged but doesn't
      // fail the handoff (which already succeeded).
      await reconcileSDStateAfterHandoff(handoffType, canonicalId || sdId, supabase);
    }

    // SD-LEO-INFRA-HANDOFF-RESULT-SUMMARY-001: Machine-readable result summary
    // Emitted LAST so grep/tail can always find it regardless of output size
    //
    // SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001 (FR-3): extracted to
    // printHandoffResultLines() below, reused verbatim by cli-main.js's cascade
    // reprint -- so the original SD's terminal lines can be safely re-emitted after a
    // cascade attempt without duplicating (or drifting from) this call site's format.
    await printHandoffResultLines(result, handoffType, sdId);
  } else {
    console.log('');
    console.log('❌ HANDOFF FAILED');
    console.log('='.repeat(50));
    console.log('');
    console.log('   ⚠️  IMPORTANT: Follow the LEO protocol diligently.');
    console.log('');
    console.log(`   Reason: ${result.reasonCode || 'VALIDATION_FAILED'}`);
    console.log(`   Message: ${result.message || 'See details above'}`);
    if (result.remediation) {
      console.log('');
      console.log('   REMEDIATION:');
      result.remediation.split('\n').forEach(line => {
        console.log(`   ${line}`);
      });
    }
    // Auto-suggest precheck command for batch gate evaluation
    if (handoffType && sdId) {
      console.log('');
      console.log('   💡 TIP: Run precheck to see ALL gate failures at once:');
      console.log(`      node scripts/handoff.js precheck ${handoffType} ${sdId}`);
    }

    // SD-LEO-INFRA-HANDOFF-RESULT-SUMMARY-001: Machine-readable result summary
    // SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001 (FR-3): same extraction as the
    // success branch above.
    await printHandoffResultLines(result, handoffType, sdId);
  }
}

/**
 * Print the terminal, machine-readable lines for a handoff result: HANDOFF_RESULT=...
 * always, and (success + LEAD-FINAL-APPROVAL + auto-proceed + pending commits)
 * HANDOFF_POST_ACTION=ship after it, in that order.
 *
 * SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001 (FR-3): extracted from
 * displayExecutionResult so it can be safely called a SECOND time by cli-main.js's
 * cascade reprint (FR-3) without re-running that function's DB-WRITING side effects
 * (reconcileSDStateAfterHandoff, hydrateAndOutputTasks) a second time for the same
 * result. This function itself only READS (auto-proceed config, git log) -- safe to
 * call repeatedly -- and both the original print call site and the reprint use this
 * SAME function, so the two can never drift into different output formats.
 *
 * @param {Object} result - Execution result (same shape displayExecutionResult takes)
 * @param {string} handoffType
 * @param {string} sdId
 */
export async function printHandoffResultLines(result, handoffType, sdId) {
  if (result.success) {
    const passDisplayScore = result.normalizedScore ?? result.qualityScore ?? Math.round((result.totalScore / result.maxScore) * 100) ?? 0;
    console.log(`\nHANDOFF_RESULT=PASS SD=${sdId} SCORE=${passDisplayScore} PHASE=${handoffType.toUpperCase()}`);

    // SD-AUTOPROCEED-SHIP-ENFORCEMENT-ORCH-001: Emit post-action directive for LEAD-FINAL-APPROVAL
    // When auto-proceed is ON and commits exist on branch, emit HANDOFF_POST_ACTION=ship
    // so Claude treats /ship as a deterministic obligation, not a context-dependent suggestion.
    if (handoffType.toUpperCase() === 'LEAD-FINAL-APPROVAL') {
      try {
        const supabase = createSupabaseServiceClient();
        const autoProceedResult = await resolveAutoProceed({ supabase, verbose: false });
        if (autoProceedResult.enabled) {
          const commitOutput = execSync('git log origin/main..HEAD --oneline 2>/dev/null || true', { encoding: 'utf-8' }).trim();
          if (commitOutput.length > 0) {
            console.log('\nHANDOFF_POST_ACTION=ship');
          }
        }
      } catch (e) {
        // Non-blocking: if post-action check fails, handoff still succeeded
        console.debug(`[post-action] Could not resolve post-action: ${e.message}`);
      }
    }
  } else {
    const failScore = result.normalizedScore ?? result.qualityScore ?? Math.round(((result.totalScore || 0) / (result.maxScore || 100)) * 100) ?? 0;
    const reasonCode = result.reasonCode || 'VALIDATION_FAILED';
    console.log(`\nHANDOFF_RESULT=FAIL SD=${sdId} SCORE=${failScore} PHASE=${handoffType.toUpperCase()} REASON=${reasonCode}`);
  }
}

/**
 * Run `body`, guaranteeing `reprintFn` runs afterward regardless of how `body` exits:
 * normal completion, an early `return` inside `body` (JS `finally` semantics fire before
 * the return actually completes), or a thrown exception.
 *
 * SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001 (FR-3): extracted as its own function so
 * the reprint GUARANTEE is unit-testable in isolation, by injecting a fake `body`/
 * `reprintFn` -- neither needs to call the real handleExecuteCommand, which cannot be
 * vi.mock'd from inside cli-main.js's own lexical scope (a same-module direct call).
 * cli-main.js's chaining loop is the real `body`; its `parallelExecution` early return
 * (a `return` statement inside the loop) is covered by the same finally guarantee as a
 * thrown exception -- no special-casing needed.
 *
 * @param {() => Promise<any>} body
 * @param {() => Promise<void>} reprintFn
 * @returns {Promise<any>} whatever `body` returns
 */
export async function runWithGuaranteedReprint(body, reprintFn) {
  try {
    return await body();
  } finally {
    await reprintFn();
  }
}
