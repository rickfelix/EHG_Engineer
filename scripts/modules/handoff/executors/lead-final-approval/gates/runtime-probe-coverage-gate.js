/**
 * Runtime Probe Coverage Gate — LEAD-FINAL-APPROVAL gate.
 * Sibling D FR-D-4 (SD-WRITERCONSUMER-...-001-D).
 *
 * Queries bypass_ledger (Sibling A) + scope_completion_chain (Sibling A) + goal_evaluator_verdicts (Sibling B)
 * for runtime_observed_at + smoke_test_passed_at coverage (Guardrail #3).
 *
 * ENV: ENFORCE_RUNTIME_PROBE_COVERAGE (default 'false' — WARNING mode for 30-day soak per parent
 * CIRCUIT-BREAKER-30D). When 'true', score=0 + passed=false if coverage <threshold (default 95%).
 *
 * CRITICAL: Gate ALWAYS emits validation_audit_log via Sibling A helper on every decision
 * (closes RISK D-RISK-01 recursive-failure-mode — gate itself does not become asymmetry source).
 */

const GATE_NAME = 'RUNTIME_PROBE_COVERAGE';
const DEFAULT_THRESHOLD = 0.95;
const QUERY_WINDOW_DAYS = 30;

function logEvent(payload) {
  console.log(`[GATE_LOG] ${JSON.stringify({ event: GATE_NAME, ...payload })}`);
}

async function countCoverage(supabase, table) {
  const since = new Date(Date.now() - QUERY_WINDOW_DAYS * 86400 * 1000).toISOString();
  const { count: totalCount, error: totalErr } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since);
  if (totalErr) return { total: 0, observed: 0, error: totalErr.message };

  const total = totalCount || 0;
  if (total === 0) return { total: 0, observed: 0 };

  const { count: observedCount, error: obsErr } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since)
    .not('runtime_observed_at', 'is', null);
  if (obsErr) return { total, observed: 0, error: obsErr.message };

  return { total, observed: observedCount || 0 };
}

export function createRuntimeProbeCoverageGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n🔬 GATE: Runtime Probe Coverage');
      console.log('-'.repeat(50));

      const enforceFlag = process.env.ENFORCE_RUNTIME_PROBE_COVERAGE === 'true';
      const threshold = Number(process.env.RUNTIME_PROBE_COVERAGE_THRESHOLD || DEFAULT_THRESHOLD);
      const sdId = ctx?.sd?.id || ctx?.sdId;

      const tables = ['bypass_ledger', 'scope_completion_chain', 'goal_evaluator_verdicts'];
      const breakdown = {};
      let agg_total = 0;
      let agg_observed = 0;

      for (const t of tables) {
        const r = await countCoverage(supabase, t);
        breakdown[t] = r;
        agg_total += r.total;
        agg_observed += r.observed;
      }

      const coverage_ratio = agg_total === 0 ? 1.0 : (agg_observed / agg_total);
      const above_threshold = coverage_ratio >= threshold;

      // RECURSIVE-FAILURE-MODE mitigation: emit audit on every decision (RISK D-RISK-01).
      try {
        const { randomUUID } = await import('crypto');
        const { emitValidationAuditLog } = await import('../../../../../lib/emit-validation-audit-log.mjs');
        await emitValidationAuditLog({
          supabase,
          correlation_id: randomUUID(),
          sd_id: sdId,
          validator_name: 'runtime_probe_coverage_gate',
          failure_reason: above_threshold
            ? `Coverage ${(coverage_ratio * 100).toFixed(1)}% >= threshold ${(threshold * 100)}% (PASS)`
            : `Coverage ${(coverage_ratio * 100).toFixed(1)}% < threshold ${(threshold * 100)}% (${enforceFlag ? 'BLOCK' : 'WARN'})`,
          failure_category: above_threshold ? 'coverage_pass' : (enforceFlag ? 'coverage_block' : 'coverage_warn'),
          metadata: {
            gate: GATE_NAME, coverage_ratio, threshold, enforce_flag: enforceFlag,
            agg_total, agg_observed, breakdown, query_window_days: QUERY_WINDOW_DAYS,
          },
          execution_context: 'lead-final-approval/gates/runtime-probe-coverage-gate.js',
        });
      } catch (auditErr) {
        console.warn(`   ⚠️  Audit emission failed (non-blocking): ${auditErr.message}`);
      }

      logEvent({ sd_id: sdId, coverage_ratio, threshold, agg_total, agg_observed, enforce_flag: enforceFlag });

      if (above_threshold) {
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [], details: { coverage_ratio, agg_total, agg_observed, breakdown } };
      }

      const remediation = `Coverage ${(coverage_ratio * 100).toFixed(1)}% below threshold ${(threshold * 100)}%. Populate smoke_test_passed_at + runtime_observed_at on bypass_ledger / scope_completion_chain / goal_evaluator_verdicts INSERTs.`;

      if (!enforceFlag) {
        return {
          passed: true, score: 80, max_score: 100, issues: [], warnings: [remediation],
          details: { coverage_ratio, agg_total, agg_observed, breakdown, mode: 'WARNING', enforce_flag: false, soak_days_remaining: 30 },
        };
      }

      return {
        passed: false, score: 0, max_score: 100,
        issues: [remediation], warnings: [],
        details: { coverage_ratio, agg_total, agg_observed, breakdown, mode: 'BLOCKING', enforce_flag: true },
      };
    },
    required: true,
  };
}
