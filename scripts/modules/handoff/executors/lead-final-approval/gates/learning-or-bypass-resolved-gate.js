/**
 * LEARNING_OR_BYPASS_RESOLVED_GATE — LEAD-FINAL-APPROVAL completion safeguard
 * SD-LEARN-FIX-ADDRESS-PAT-AGENT-001
 *
 * At LEAD-FINAL-APPROVAL, require either:
 *   (a) A learning_runs row exists for this SD (completed status), indicating /learn was
 *       actually executed for the SD's work, OR
 *   (b) Zero unresolved bypass entries in audit_log / validation_audit_log for this SD
 *       (no bypass was used, or all bypasses have matching follow-up records).
 *
 * Rationale: PAT-AGENT-BYPASS-WITHOUT-RCA documented that completion-bias routes around
 * advisory protocol rules. If --bypass-validation was used during the SD's lifecycle, the
 * agent must either run /learn (which creates a learning_runs row) or link a follow-up SD
 * via --followup-sd-key (captured by the bypass shape gate). This gate verifies that
 * completion is not claimed while bypass obligations remain unresolved.
 *
 * Gated by env var ENFORCE_LEARNING_GATE. Default false (warn-only). Flip to true after
 * 48h soak per rollout plan.
 *
 * Phase: LEAD-FINAL-APPROVAL
 */

const GATE_NAME = 'LEARNING_OR_BYPASS_RESOLVED';

/**
 * SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 (FR-4): independent per-SD check, deliberately kept
 * separate from the validator_name-based validation_audit_log check below so the two bypass
 * signals (audit-log entries vs the sd_phase_handoffs.metadata.bypass stamp FR-2 introduces)
 * are never conflated into one conditional.
 *
 * Reads every sd_phase_handoffs row for the SD carrying metadata.bypass (stamped by
 * HandoffRecorder whenever BaseExecutor's bypass fall-through fired) and REFUSES completion --
 * a real failure, never warn-only -- unless every such bypass carries a linked follow-up
 * (pattern_id or followup_sd_key, captured at bypass time by bypass-rubric.js's
 * validateBypassShape and threaded through by this SD's own FR-4 changes).
 *
 * @param {object} supabase
 * @param {string} sdId
 * @returns {Promise<{ unresolved: Array<object>, total: number }>}
 */
async function findUnresolvedPhaseChainBypasses(supabase, sdId) {
  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .select('id, handoff_type, metadata')
    .eq('sd_id', sdId)
    .limit(200);

  if (error) {
    // Fail-closed is the wrong call here (a DB hiccup should not itself block every
    // completion) — but silence is also wrong, so this is surfaced by the caller as a
    // warning, never as a silent pass.
    return { unresolved: [], total: 0, queryError: error.message };
  }

  const bypassed = (data || []).filter((row) => row?.metadata?.bypass);
  const unresolved = bypassed.filter((row) => {
    const b = row.metadata.bypass;
    return !b.pattern_id && !b.followup_sd_key;
  });

  return {
    unresolved: unresolved.map((row) => ({
      handoff_id: row.id,
      handoff_type: row.handoff_type,
      reason: row.metadata.bypass.reason || null,
      gates: row.metadata.bypass.gates || null,
    })),
    total: bypassed.length,
  };
}

/**
 * Create the learning-or-bypass-resolved gate.
 *
 * @param {object} supabase - Supabase client (required — gate queries audit tables)
 * @returns {Object} Gate definition
 */
export function createLearningOrBypassResolvedGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n📚 GATE: Learning-or-Bypass-Resolved');
      console.log('-'.repeat(50));

      const enforceFlag = process.env.ENFORCE_LEARNING_GATE === 'true';
      const warnOnly = !enforceFlag;
      const sdId = ctx?.sd?.id || ctx?.sdId;

      if (!sdId) {
        return {
          passed: true,
          score: 80,
          max_score: 100,
          issues: [],
          warnings: ['No sd_id in context — gate skipped'],
        };
      }

      // SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 (FR-4): checked FIRST and independently. Unlike the
      // existing check below (which honours ENFORCE_LEARNING_GATE's warn-only default), an
      // unresolved phase-chain bypass is a hard failure on every route -- this is precisely the
      // class of false completion (run 1a1b3087 / SD-LEO-FIX-HUMAN-ACTION-FENCES-001) this SD
      // exists to close, so it is never negotiable via the learning-gate soak flag.
      const phaseChainCheck = await findUnresolvedPhaseChainBypasses(supabase, sdId);
      if (phaseChainCheck.unresolved.length > 0) {
        const summary = phaseChainCheck.unresolved
          .map((u) => `${u.handoff_type} (gates: ${(u.gates || []).join(', ') || 'unknown'})`)
          .join('; ');
        const message = `${phaseChainCheck.unresolved.length} bypassed handoff(s) in this SD's phase chain have no linked follow-up (--pattern-id/--followup-sd-key): ${summary}. Completion is refused while a bypass in the chain is unresolved -- link each via a follow-up SD/pattern, or genuinely fix the underlying gate and re-run without --bypass-validation.`;
        console.log(`   ❌ BLOCK (unconditional): ${message}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [message],
          warnings: [],
          details: {
            reason: 'UNRESOLVED_PHASE_CHAIN_BYPASS',
            unresolved_bypasses: phaseChainCheck.unresolved,
            total_bypasses_in_chain: phaseChainCheck.total,
          },
        };
      }
      if (phaseChainCheck.queryError) {
        console.log(`   ⚠️  phase-chain bypass check could not query sd_phase_handoffs: ${phaseChainCheck.queryError} — continuing to the existing audit-log check`);
      }

      // (b) Check audit_log for bypass entries tied to this SD
      const [auditRes, learningRes] = await Promise.all([
        supabase
          .from('validation_audit_log')
          .select('correlation_id, metadata, failure_category, created_at')
          .eq('sd_id', sdId)
          .in('validator_name', ['bypass_rubric', 'bypass_shape'])
          .limit(50),
        supabase
          .from('learning_runs')
          .select('id, status, completed_at')
          .eq('sd_id', sdId)
          .in('status', ['completed', 'success'])
          .limit(1)
          .maybeSingle(),
      ]);

      const auditEntries = auditRes.data || [];
      const learningRun = learningRes.error ? null : learningRes.data;
      const bypassUsed = auditEntries.length > 0;
      const learningRan = !!learningRun;

      // Case A: No bypass used — gate passes trivially
      if (!bypassUsed) {
        console.log('   No bypass entries found for this SD — gate auto-passes');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { bypass_count: 0, learning_ran: learningRan },
        };
      }

      // Case B: Bypass used AND /learn ran — gate passes
      if (learningRan) {
        console.log(`   Bypass used (${auditEntries.length} entries) AND /learn executed — gate passes`);
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { bypass_count: auditEntries.length, learning_ran: true, learning_run_id: learningRun.id },
        };
      }

      // Case C: Bypass used but NO /learn — potential violation
      const message = `${auditEntries.length} bypass entries found for this SD with no corresponding /learn execution. Resolve via one of: (1) run /learn to create a learning_runs row, or (2) link each bypass to a follow-up SD via --followup-sd-key and mark the follow-up SD status=completed.`;

      console.log(`   ${warnOnly ? '⚠️  WARN' : '❌ BLOCK'}: ${message}`);

      // SD-WRITERCONSUMER-ASYMMETRY-...-001-A FR-A-6: emit validation_audit_log entry on bypass branch
      // (Same gate consuming bypass entries also produces a witness entry for the parity check.)
      try {
        const { randomUUID } = await import('crypto');
        const { emitValidationAuditLog } = await import('../../../../../lib/emit-validation-audit-log.mjs');
        await emitValidationAuditLog({
          supabase,
          correlation_id: randomUUID(),
          sd_id: sdId,
          validator_name: 'learning_or_bypass_resolved_gate',
          failure_reason: message,
          failure_category: warnOnly ? 'bypass_warning' : 'bypass_rejected',
          metadata: { gate: GATE_NAME, bypass_count: auditEntries.length, enforce_flag: enforceFlag, learning_ran: false },
          execution_context: 'lead-final-approval/gates/learning-or-bypass-resolved-gate.js',
        });
      } catch (auditErr) {
        // Gate diagnostic emission is best-effort — do not change gate verdict if audit fails.
        console.warn(`   ⚠️  Gate audit emission failed (non-blocking): ${auditErr.message}`);
      }

      return {
        passed: warnOnly,
        score: warnOnly ? 60 : 0,
        max_score: 100,
        issues: warnOnly ? [] : [message],
        warnings: warnOnly ? [message] : [],
        details: {
          bypass_count: auditEntries.length,
          learning_ran: false,
          enforce_flag: enforceFlag,
          remediation: 'Run /learn OR link follow-up SDs via --followup-sd-key',
        },
      };
    },
    required: true, // Registered as blocking; feature flag controls actual enforcement
  };
}
