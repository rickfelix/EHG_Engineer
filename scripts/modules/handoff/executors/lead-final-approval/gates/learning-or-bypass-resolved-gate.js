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
