/**
 * GATE_GRILL_CONVERGENCE — LEAD-TO-PLAN handoff gate (Child C of Pocock orchestrator).
 *
 * Blocks LEAD-TO-PLAN when strategic_directives_v2.metadata.open_questions_for_plan_phase is
 * non-empty and there is no fresh grill_convergence_artifacts row for the SD.
 *
 * Phase-1 (default): WARN — emit warning, return passed=true, score=70.
 * Phase-2 (env LEO_GRILL_HARD_FAIL=true): HARD-FAIL — passed=false, score=0.
 *
 * Bypass quota: 3 per SD, 10 per day globally (mirrors activation-invariant gate PR #3759).
 * Bypass via SD metadata.grill_bypass=true plus metadata.grill_bypass_reason text.
 *
 * SD: SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-C
 */

const HARD_FAIL_MODE = process.env.LEO_GRILL_HARD_FAIL === 'true';
const ARTIFACT_FRESHNESS_HOURS = 168; // 7 days
const BYPASS_QUOTA_PER_SD = 3;
const BYPASS_QUOTA_PER_DAY = 10;

export function createGrillConvergenceGate(supabase) {
  return {
    name: 'GATE_GRILL_CONVERGENCE',
    description: 'SDs with open_questions_for_plan_phase must have a fresh /grill convergence artifact before LEAD-TO-PLAN (phase-1 warn, phase-2 hard-fail)',
    threshold: 70,
    required: false,
    remediation: 'Run `node scripts/pocock/grill-runner.mjs --sd-id <SD-ID>` against open questions OR set metadata.grill_bypass=true with grill_bypass_reason (≥10 chars). Bypass quota: 3 per SD, 10 per day globally.',
    validator: async (ctx) => executeGrillConvergence(ctx.sd, supabase),
  };
}

async function executeGrillConvergence(sd, supabase) {
  {
      const openQuestions = sd?.metadata?.open_questions_for_plan_phase || [];
      const sdKey = sd?.sd_key || sd?.id;

      // No open questions → gate not applicable
      if (!Array.isArray(openQuestions) || openQuestions.length === 0) {
        return {
          name: 'GATE_GRILL_CONVERGENCE',
          score: 100,
          passed: true,
          message: 'No open_questions_for_plan_phase — gate not applicable',
          warnings: [],
          details: { skipped: true, reason: 'no_open_questions' },
        };
      }

      // Bypass requested?
      const bypassRequested = sd?.metadata?.grill_bypass === true;
      const bypassReason = sd?.metadata?.grill_bypass_reason || null;
      if (bypassRequested) {
        if (!bypassReason || String(bypassReason).trim().length < 10) {
          return {
            name: 'GATE_GRILL_CONVERGENCE',
            score: 0,
            passed: false,
            message: 'Bypass requested but metadata.grill_bypass_reason missing or <10 chars',
            warnings: [],
            details: { bypass_attempted: true, bypass_rejected: 'missing_reason' },
          };
        }

        // Per-SD quota: count prior bypass audit rows for this SD
        const { count: sdBypassCount } = await supabase
          .from('audit_log')
          .select('id', { count: 'exact', head: true })
          .eq('entity_type', 'strategic_directives_v2')
          .eq('event_type', 'grill_bypass')
          .eq('entity_id', sd.id);
        if ((sdBypassCount || 0) >= BYPASS_QUOTA_PER_SD) {
          return {
            name: 'GATE_GRILL_CONVERGENCE',
            score: 0,
            passed: false,
            message: `Bypass quota exhausted for SD (${sdBypassCount}/${BYPASS_QUOTA_PER_SD}) — hard-fail restored`,
            warnings: [],
            details: { bypass_attempted: true, bypass_rejected: 'sd_quota', sd_bypass_count: sdBypassCount },
          };
        }

        // Per-day quota
        const dayStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: dayBypassCount } = await supabase
          .from('audit_log')
          .select('id', { count: 'exact', head: true })
          .eq('event_type', 'grill_bypass')
          .gte('created_at', dayStart);
        if ((dayBypassCount || 0) >= BYPASS_QUOTA_PER_DAY) {
          return {
            name: 'GATE_GRILL_CONVERGENCE',
            score: 0,
            passed: false,
            message: `Daily bypass quota exhausted (${dayBypassCount}/${BYPASS_QUOTA_PER_DAY}) — hard-fail restored`,
            warnings: [],
            details: { bypass_attempted: true, bypass_rejected: 'day_quota', day_bypass_count: dayBypassCount },
          };
        }

        // Quota OK — record bypass and allow
        try {
          await supabase.from('audit_log').insert({
            event_type: 'grill_bypass',
            entity_type: 'strategic_directives_v2',
            entity_id: sd.id,
            metadata: { reason: bypassReason, open_questions_count: openQuestions.length },
          });
        } catch (_) {
          // non-fatal; gate proceeds
        }
        return {
          name: 'GATE_GRILL_CONVERGENCE',
          score: 100,
          passed: true,
          message: `Bypass accepted (reason recorded): ${bypassReason.slice(0, 80)}`,
          warnings: [`Grill convergence bypassed for ${sdKey} with reason: ${bypassReason}`],
          details: { bypass_attempted: true, bypass_accepted: true, reason: bypassReason },
        };
      }

      // Look for a fresh convergence artifact
      const freshSince = new Date(Date.now() - ARTIFACT_FRESHNESS_HOURS * 60 * 60 * 1000).toISOString();
      const { data: artifacts, error: artErr } = await supabase
        .from('grill_convergence_artifacts')
        .select('id, converged, total_llm_calls, ended_at, sd_id, fixture_id')
        .eq('sd_id', sd.id)
        .gte('ended_at', freshSince)
        .order('ended_at', { ascending: false })
        .limit(5);

      if (artErr) {
        // Table missing or RLS issue: phase-1 warn, phase-2 still hard-fail
        const msg = `grill_convergence_artifacts query failed: ${artErr.message}`;
        if (HARD_FAIL_MODE) {
          return {
            name: 'GATE_GRILL_CONVERGENCE',
            score: 0,
            passed: false,
            message: `Phase-2 hard-fail: ${msg}`,
            warnings: [],
            details: { phase: 'hard_fail', error: artErr.message },
          };
        }
        return {
          name: 'GATE_GRILL_CONVERGENCE',
          score: 70,
          passed: true,
          message: `Phase-1 warn: ${msg}`,
          warnings: [msg],
          details: { phase: 'warn_only', error: artErr.message },
        };
      }

      const hasFreshConverged = (artifacts || []).some(a => a.converged === true);

      if (hasFreshConverged) {
        return {
          name: 'GATE_GRILL_CONVERGENCE',
          score: 100,
          passed: true,
          message: `Fresh /grill convergence artifact found (${artifacts.length} artifact(s) in last ${ARTIFACT_FRESHNESS_HOURS}h)`,
          warnings: [],
          details: { artifact_count: artifacts.length, converged_count: artifacts.filter(a => a.converged).length },
        };
      }

      // No fresh convergence: emit feedback row (phase-1 warn) or hard-fail (phase-2)
      try {
        await supabase.from('feedback').insert({
          title: `SD ${sdKey} missing /grill convergence artifact for LEAD-TO-PLAN`,
          description: [
            `SD has ${openQuestions.length} open_questions_for_plan_phase but no fresh grill_convergence_artifacts row.`,
            `Run: node scripts/pocock/grill-runner.mjs --sd-id ${sd.id}`,
            `Or bypass with metadata.grill_bypass=true and grill_bypass_reason text (≥10 chars).`,
          ].join('\n'),
          severity: HARD_FAIL_MODE ? 'high' : 'medium',
          category: 'grill_convergence_missing',
          component: 'leo-handoff-lead-to-plan',
          status: 'new',
        });
      } catch (_) {
        // non-fatal
      }

      if (HARD_FAIL_MODE) {
        return {
          name: 'GATE_GRILL_CONVERGENCE',
          score: 0,
          passed: false,
          message: `Phase-2 hard-fail: GRILL_CONVERGENCE_MISSING (${openQuestions.length} open question(s), no fresh artifact)`,
          warnings: [],
          details: {
            phase: 'hard_fail',
            open_questions_count: openQuestions.length,
            artifact_count: (artifacts || []).length,
          },
        };
      }

      return {
        name: 'GATE_GRILL_CONVERGENCE',
        score: 70,
        passed: true,
        message: `Phase-1 warn: ${openQuestions.length} open question(s) without fresh /grill convergence artifact`,
        warnings: [
          `Run grill-runner --sd-id ${sd.id} or set metadata.grill_bypass=true with grill_bypass_reason`,
        ],
        details: {
          phase: 'warn_only',
          open_questions_count: openQuestions.length,
          artifact_count: (artifacts || []).length,
        },
      };
  }
}

export default createGrillConvergenceGate;
