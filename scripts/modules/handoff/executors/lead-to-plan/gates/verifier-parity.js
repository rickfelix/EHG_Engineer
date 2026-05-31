/**
 * Verifier-Parity Gate (PRECHECK-ONLY) for LEAD-TO-PLAN
 * SD-LEO-INFRA-HANDOFF-INTEGRITY-RECONCILE-001
 *
 * PROBLEM: The LEAD-TO-PLAN handoff is gated by TWO engines. Engine #1 is the
 * gate chain (getRequiredGates) — the only thing `handoff.js precheck` runs.
 * Engine #2 is the LeadToPlanVerifier (scripts/verify-l2p/index.js), invoked
 * ONLY inside executeSpecific() during `handoff.js execute`, AFTER the gate
 * chain. The verifier applies blocking checks the gate chain does NOT
 * (validateStrategicDirective completeness vs SD-type-aware effectiveMinScore,
 * validateFeasibility, checkEnvironmentReadiness, VALID_SD_STATUSES). So an SD
 * can PASS precheck but FAIL execute — a handoff-integrity defect.
 *
 * FIX (additive, fleet-safe): this gate re-evaluates the verifier's PURE
 * blocking checks so precheck PREDICTS execute. It runs ONLY during precheck
 * (condition: ctx.precheckMode === true) and is SKIPPED at execute, so the
 * execute path stays byte-identical (the verifier remains the sole execute-time
 * enforcer). The gate reuses the verifier's OWN pure functions and performs NO
 * DB writes — it NEVER calls verifier.verifyHandoff() (which writes
 * createHandoffExecution / updateSdStatusAfterHandoff / rejectHandoff).
 *
 * Precedent: SD-FDBK-INFRA-PLAN-LEAD-PRECHECK-001 (HandoffOrchestrator.js:343-349)
 * already surfaces execute-only checks in advisory precheckMode.
 *
 * Deliberately OUT OF SCOPE: the subagent-evidence gate's fleet-wide inertness
 * (handoffType missing from precheck AND execute contexts) is a separate,
 * high-blast-radius concern deferred to a coordinated quiet-window SD.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { validateStrategicDirective, validateFeasibility } from '../../../../../verify-l2p/sd-validation.js';
import { checkEnvironmentReadiness } from '../../../../../verify-l2p/environment.js';
import { SD_REQUIREMENTS, SD_TYPE_OVERRIDES, VALID_SD_STATUSES } from '../../../../../verify-l2p/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// gates → lead-to-plan → executors → handoff → modules → scripts → <repo root>
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '../../../../../..');

/**
 * Resolve the SD-type-aware completeness threshold EXACTLY as the verifier does
 * (verify-l2p/index.js:105-109): SD_TYPE_OVERRIDES[type].minimumScore, else
 * SD_REQUIREMENTS.minimumScore. IR-2 (threshold parity).
 * @param {Object} sd
 * @returns {number}
 */
export function resolveEffectiveMinScore(sd) {
  const sdType = (sd?.sd_type || '').toLowerCase();
  const typeOverrides = SD_TYPE_OVERRIDES[sdType] || {};
  return typeOverrides.minimumScore ?? SD_REQUIREMENTS.minimumScore;
}

/**
 * Evaluate the verifier's blocking checks WITHOUT side effects. Mirrors the
 * blocking sequence of LeadToPlanVerifier.verifyHandoff (SD_INCOMPLETE,
 * SD_STATUS, FEASIBILITY, ENV_NOT_READY) but aggregates all failures (better
 * diagnostics) instead of returning on the first.
 *
 * @param {Object} sd - Strategic Directive row (already loaded into ctx.sd)
 * @param {Object} supabase - Supabase client (read-only use)
 * @returns {Promise<Object>} { passed, score, max_score, issues, warnings, details }
 */
export async function evaluateVerifierParity(sd, supabase) {
  // IR-1 (orchestrator parity): the verifier routes orchestrator SDs to
  // _handleOrchestratorSd (auto-pass via child completion) BEFORE the four pure
  // blocking checks run, so it never rejects an orchestrator on them. Mirror
  // that by auto-passing here — otherwise precheck would falsely block
  // orchestrators that execute auto-passes.
  if ((sd?.sd_type || '').toLowerCase() === 'orchestrator') {
    return {
      passed: true,
      pass: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: [],
      details: { orchestrator_auto_pass: true }
    };
  }

  const issues = [];
  const warnings = [];

  // 1. Completeness (verifier: SD_INCOMPLETE when !valid || percentage < effectiveMinScore)
  const effectiveMinScore = resolveEffectiveMinScore(sd);
  const sdValidation = validateStrategicDirective(sd);
  if (!sdValidation.valid || sdValidation.percentage < effectiveMinScore) {
    issues.push(
      `SD_INCOMPLETE: completeness ${sdValidation.percentage}% < required ${effectiveMinScore}% ` +
      `(type: ${(sd?.sd_type || 'default').toLowerCase()})` +
      (sdValidation.errors?.length ? ` — ${sdValidation.errors.slice(0, 5).join('; ')}` : '')
    );
  }

  // 2. Status (verifier: SD_STATUS when status not in VALID_SD_STATUSES)
  if (!VALID_SD_STATUSES.includes(sd?.status)) {
    issues.push(`SD_STATUS: status '${sd?.status}' not in [${VALID_SD_STATUSES.join(', ')}]`);
  }

  // 3. Feasibility (verifier: FEASIBILITY when !passed)
  const feasibility = validateFeasibility(sd);
  if (!feasibility.passed) {
    issues.push(`FEASIBILITY: ${feasibility.issues.join('; ') || 'feasibility concerns'}`);
  }

  // 4. Environment readiness (verifier: ENV_NOT_READY when !ready). Read-only.
  const env = await checkEnvironmentReadiness(supabase, sd, EHG_ENGINEER_ROOT);
  if (!env.ready) {
    issues.push(`ENV_NOT_READY: ${env.issues.join('; ') || 'environment not ready'}`);
  }

  const passed = issues.length === 0;
  return {
    passed,
    pass: passed,
    score: passed ? 100 : 0,
    max_score: 100,
    issues,
    warnings,
    details: {
      completeness_percentage: sdValidation.percentage,
      effective_min_score: effectiveMinScore,
      status: sd?.status,
      predicts: 'execute LeadToPlanVerifier blocking verdict'
    }
  };
}

/**
 * Create the precheck-only verifier-parity gate.
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createVerifierParityGate(supabase) {
  return {
    name: 'GATE_VERIFIER_PARITY_PRECHECK',
    // PRECHECK-ONLY: skipped at execute so the execute path is byte-identical.
    condition: (ctx) => ctx?.precheckMode === true,
    validator: async (ctx) => {
      console.log('\n🔍 GATE: Verifier Parity (precheck-only — predicts execute)');
      console.log('-'.repeat(50));
      try {
        const result = await evaluateVerifierParity(ctx.sd, supabase);
        console.log(`   Completeness: ${result.details?.completeness_percentage}% (min ${result.details?.effective_min_score}%) | Result: ${result.passed ? '✅ PASS' : '❌ WOULD FAIL AT EXECUTE'}`);
        if (!result.passed) result.issues.forEach(i => console.log(`   ❌ ${i}`));
        return result;
      } catch (error) {
        // Fail-OPEN: precheck is advisory and execute remains the real enforcer.
        // A bug in the parity helper must not crash/false-block precheck.
        console.log(`   ⚠️  Verifier-parity check skipped (error): ${error?.message || error}`);
        return {
          passed: true,
          pass: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`Verifier-parity precheck skipped due to error: ${error?.message || error}`],
          details: { errored: true }
        };
      }
    },
    required: true,
    remediation:
      'precheck predicts that `handoff.js execute LEAD-TO-PLAN` will reject this SD. ' +
      'Fix the reported blocker(s) (completeness/status/feasibility/environment) before running execute.'
  };
}

export default createVerifierParityGate;
