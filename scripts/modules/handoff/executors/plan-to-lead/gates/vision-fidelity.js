/**
 * VISION_FIDELITY_GATE — PLAN-TO-LEAD pipeline gate (FR-2).
 *
 * Wraps the vision-fidelity sub-agent (lib/sub-agents/vision-fidelity/index.js,
 * shipped in PR-2) and translates its verdict into the gate result shape
 * {passed, score, max_score, issues, warnings, details}.
 *
 * Fail-soft: If the sub-agent throws or no SD context is available, the gate
 * returns advisory-pass with a warning rather than blocking the handoff. This
 * matches FR-2 ("ADVISORY warning, not block") and the existing behavior of
 * sibling gates (vision-completion-score advisory pattern).
 */
import { executeVisionFidelity } from '../../../../../../lib/sub-agents/vision-fidelity/index.js';

const GATE_NAME = 'VISION_FIDELITY_GATE';
const SUBAGENT_TIMEOUT_MS = 90_000;

export function createVisionFidelityGate(supabase, options = {}) {
  const executor = options.executor || executeVisionFidelity;
  const timeoutMs = options.timeoutMs ?? SUBAGENT_TIMEOUT_MS;

  return {
    name: GATE_NAME,
    required: true,
    validator: async (ctx) => {
      console.log('\n🎯 VISION FIDELITY GATE');
      console.log('-'.repeat(50));

      const sdId = ctx?.sd?.id || ctx?.sdId;
      if (!sdId) {
        const msg = 'No SD context — vision-fidelity gate cannot run';
        console.log(`   ⚠️  ${msg} (advisory pass)`);
        return advisoryPass({ msg, details: { skipped: true, reason: 'no_sd_context' } });
      }

      let result;
      try {
        result = await executor({ sdId, supabase, dryRun: false, timeoutMs });
      } catch (err) {
        const msg = `vision-fidelity sub-agent failed: ${err.message}`;
        console.log(`   ⚠️  ${msg} (advisory pass)`);
        return advisoryPass({ msg, details: { error: err.message, sd_id: sdId } });
      }

      const score = scoreFromCoverage(result?.details?.vision_coverage_pct);
      const passed = result?.passed === true;
      const verdict = result?.verdict || 'PENDING';

      logVerdictBanner(verdict, result);

      return {
        passed,
        score,
        max_score: 100,
        issues: Array.isArray(result?.issues) ? result.issues : [],
        warnings: Array.isArray(result?.warnings) ? result.warnings : [],
        details: {
          ...(result?.details || {}),
          verdict,
          gate: GATE_NAME
        }
      };
    }
  };
}

function scoreFromCoverage(coveragePct) {
  if (coveragePct === null || coveragePct === undefined) return 100;
  const score = Math.round(coveragePct * 100);
  return Math.max(0, Math.min(100, score));
}

function advisoryPass({ msg, details = {} }) {
  return {
    passed: true,
    score: 100,
    max_score: 100,
    issues: [],
    warnings: [msg],
    details: { advisory: true, gate: GATE_NAME, ...details }
  };
}

function logVerdictBanner(verdict, result) {
  const summary = [
    `delivered=${result?.details?.delivered_count ?? '?'}`,
    `partial=${result?.details?.partial_count ?? '?'}`,
    `missing=${result?.details?.missing_count ?? '?'}`,
    `scope_creep=${result?.details?.scope_creep_count ?? '?'}`,
    `coverage=${formatPct(result?.details?.vision_coverage_pct)}`
  ].join(' | ');

  const emoji = verdict === 'PASS' ? '✅' : verdict === 'FAIL' ? '🚫' : verdict === 'WARNING' ? '⚠️' : 'ℹ️';
  console.log(`   ${emoji} verdict=${verdict} | ${summary}`);
}

function formatPct(p) {
  if (p === null || p === undefined) return 'n/a';
  return `${Math.round(p * 100)}%`;
}
