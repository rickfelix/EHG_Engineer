/**
 * Activation Invariant Gate — LEAD-FINAL-APPROVAL handoff gate.
 *
 * SD-LEO-INFRA-REQUIRE-END-END-001 / FR-2.
 *
 * Blocks SD completion when an SD ships a schema+UI+worker chain but lacks
 * an end-to-end activation-invariant test asserting the chain works against
 * real data. Closes 26th writer-consumer asymmetry witness at SD-orchestration
 * scale (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001).
 *
 * Trigger heuristic (DUAL-SCAN): scripts/modules/activation-invariant/trigger-evaluator.js
 *
 * Pass conditions (ALL must hold for a triggered SD):
 *   - PRD.activation_test_id is non-empty
 *   - The referenced test file exists on disk
 *   - A TESTING sub-agent evidence row exists with verdict=PASS
 *     AND metadata.activation_invariant_verified=true
 *     AND created_at within 24h of the gate run
 *
 * Bypass: use existing --bypass-validation flag with reason-text
 * discriminator: --bypass-reason "ACTIV-CHAIN-DEFERRED:<ticket>". Per-SD
 * (3) and global (10/day) quotas enforced by handoff.js (unchanged).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateTrigger } from '../../../../activation-invariant/trigger-evaluator.js';
import { gradeProvenance, PRODUCER_ALLOWLIST } from '../../../../../../lib/sub-agent-executor/evidence-provenance.js';
import { safeQuery } from '../../../../../../lib/db/safe-query.mjs';
import { resolveSubagentEvidenceProvenanceMode } from '../../../gates/subagent-evidence-gate.js';

const GATE_NAME = 'GATE_ACTIVATION_INVARIANT';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// scripts/modules/handoff/executors/lead-final-approval/gates/ -> repo root is 6 levels up
const ROOT_DIR = path.resolve(__dirname, '../../../../../..');

const EVIDENCE_FRESHNESS_MS = 24 * 60 * 60 * 1000; // 24 hours
const BYPASS_TOKEN = 'ACTIV-CHAIN-DEFERRED';

// SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D2: no evidence-staleness check exists anywhere in
// the LEAD-FINAL-APPROVAL pipeline today -- subagent-evidence-gate.js's own staleness/freshness
// logic is wired only into LEAD-TO-PLAN/PLAN-TO-EXEC/EXEC-TO-PLAN/PLAN-TO-LEAD, never here. A
// naive port of that file's commit-SHA-equality check would be vacuous by construction at LFA
// (measured: sd.worktree_path is null/already-reaped for 57/60 of recently completed SDs, so it
// would silently no-op ~95% of the time). This check is deliberately DB-only (created_at vs. now
// -- NOT a hard created_at>=phase_started_at boundary, which was this SD's own original framing
// but would wedge most SDs: phase_started_at resolves to the immediately-prior PLAN-TO-LEAD
// acceptance, typically seconds/minutes before LEAD-FINAL-APPROVAL runs in the same session, and
// most real evidence predates that moment by design). An absolute age-from-now threshold matches
// the measured population exactly (trailing-30-day newest-evidence age: p90=2.7h, >72h=1/120=0.8%)
// and cannot be defeated by a reaped worktree.
const LFA_STALENESS_THRESHOLD_MS = 72 * 60 * 60 * 1000; // 72 hours
const STALENESS_KILL_SWITCH_ENV = 'LEO_DISABLE_LFA_STALENESS_CHECK';

function lfaStalenessCheckDisabled(env = process.env) {
  const v = env[STALENESS_KILL_SWITCH_ENV];
  return v === '1' || String(v).toLowerCase() === 'true';
}

/**
 * Newest sub_agent_execution_results row for the SD, any code -- "has anything relevant run
 * recently". SECURITY finding M2 (adversarial review, 2026-09-05): scoped to PRODUCER_ALLOWLIST
 * sources only -- an unfiltered query is trivially reset by any row from any code with any
 * content, including the 'manual' DB-default source that evidence-provenance.js's own module
 * doc explicitly excludes as "not a producer's own asserted identity."
 * Throws (does not swallow) on a genuine query error, so the caller's fail-open catch actually
 * fires and logs -- TESTING finding (adversarial review, 2026-09-05): the original destructure
 * discarded `error`, so a real DB/RLS failure silently looked identical to "no evidence found".
 */
async function loadNewestEvidence({ supabase, sdId }) {
  if (!supabase || !sdId) return null;
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('id, created_at')
    .eq('sd_id', sdId)
    .in('source', PRODUCER_ALLOWLIST)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`loadNewestEvidence query failed: ${error.message}`);
  return data || null;
}

function logEvent(payload) {
  // Mirror existing [GATE_LOG] convention.
  console.log(`[GATE_LOG] ${JSON.stringify({ event: GATE_NAME, ...payload })}`);
}

/**
 * Look up the PRD for an SD via prdRepo if available, else direct Supabase query.
 */
async function loadPRD({ supabase, prdRepo, sdId }) {
  if (prdRepo?.getBySdUuid) {
    const prd = await prdRepo.getBySdUuid(sdId);
    if (prd) return prd;
  }
  if (prdRepo?.getBySdId) {
    const prd = await prdRepo.getBySdId(sdId);
    if (prd) return prd;
  }
  if (!supabase) return null;
  const data = await safeQuery(
    supabase
      .from('product_requirements_v2')
      .select('id, sd_id, activation_test_id')
      .eq('sd_id', sdId)
      .limit(1)
      .maybeSingle(),
    { site: 'activation-invariant-gate:prd_lookup' }
  );
  return data || null;
}

/**
 * Check for TESTING evidence row with activation_invariant_verified=true
 * within EVIDENCE_FRESHNESS_MS. phase is 'LEAD-FINAL-APPROVAL' exactly to
 * match the existing convention used by other gates.
 */
async function loadTestingEvidence({ supabase, sdId }) {
  if (!supabase) return null;
  const cutoff = new Date(Date.now() - EVIDENCE_FRESHNESS_MS).toISOString();
  // SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-A: widened to add source, invocation_id, and the columns
  // computeContentHash() needs to re-derive a row's content hash for provenance grading.
  const data = await safeQuery(
    supabase
      .from('sub_agent_execution_results')
      .select('id, verdict, confidence, metadata, created_at, phase, source, invocation_id, critical_issues, warnings, recommendations, detailed_analysis, summary')
      .eq('sd_id', sdId)
      .eq('sub_agent_code', 'TESTING')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    { site: 'activation-invariant-gate:testing_evidence' }
  );
  return data || null;
}

/**
 * Build the canonical {passed, score, max_score, issues, warnings, details}
 * gate result for a non-triggered SD. Always a 100% pass.
 */
function notTriggered(triggerResult) {
  return {
    passed: true,
    score: 100,
    max_score: 100,
    issues: [],
    warnings: [],
    details: {
      triggered: false,
      reason: triggerResult.reason,
      lane1: triggerResult.lane1,
      lane2: triggerResult.lane2,
    },
  };
}

/**
 * Build a remediation message for a failed gate. Tagged for grep + actionable.
 */
function buildRemediation({ missingComponent, prdId, testPath }) {
  const lines = [
    '[ACTIVATION_INVARIANT_AUDIT] FAIL',
    '',
    `Missing component: ${missingComponent}`,
    '',
    'Fix steps:',
    '  1. Write an end-to-end test asserting the schema -> worker -> UI chain works.',
    '     Real (or migration-applied test) DB. Assert non-trivial DOM/state outcome.',
    '  2. Populate product_requirements_v2.activation_test_id with the relative test path.',
    `     (PRD id: ${prdId || '(missing — create PRD first)'})`,
    '  3. Run testing-agent — its result must include metadata.activation_invariant_verified=true.',
    '  4. Re-run: node scripts/handoff.js execute LEAD-FINAL-APPROVAL <SD-ID>',
    '',
    'Emergency bypass (rate-limited 3/SD, 10/day, logged to audit_log):',
    `  node scripts/handoff.js execute LEAD-FINAL-APPROVAL <SD-ID> --bypass-validation --bypass-reason "${BYPASS_TOKEN}:<ticket>"`,
  ];
  if (testPath) lines.splice(3, 0, `Referenced test path: ${testPath}`);
  return lines.join('\n');
}

export function createActivationInvariantGate(supabase, prdRepo) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n🔗 GATE: Activation Invariant');
      console.log('-'.repeat(50));

      const sd = ctx?.sd || null;
      const sdId = sd?.id || ctx?.sdId;

      // Step 1 (FR-D2): evidence-staleness check, unconditional -- runs FIRST, before the
      // activation-chain bypass below and regardless of whether this SD triggers the
      // schema+UI+worker heuristic further down, since staleness is a property of every
      // LEAD-FINAL-APPROVAL handoff, not just chain-triggered or chain-bypassed ones.
      //
      // SECURITY finding H1 (adversarial review, 2026-09-05): this check originally ran AFTER the
      // ACTIV-CHAIN-DEFERRED bypass-reason branch, which is self-attested SD metadata with no
      // ledger row, no quota consumption, and no disclosure that it was ALSO silently widened to
      // cover an unrelated concern (evidence freshness) -- a gate-evidence-provenance violation
      // per this repo's own ratified rule. Moved above that branch so staleness has exactly ONE
      // bypass path: the kill switch below, which IS now audited (see the else branch).
      //
      // Fails OPEN on a lookup error (consistent with subagent-evidence-gate.js's own cache-probe
      // convention: "any probe error falls open to a normal run") -- a transient DB hiccup
      // fetching evidence should not itself become a new denial-of-completion vector; only an
      // actual, positively-confirmed stale-evidence finding blocks.
      if (!lfaStalenessCheckDisabled()) {
        try {
          const newestEvidence = await loadNewestEvidence({ supabase, sdId });
          if (newestEvidence?.created_at) {
            const ageMs = Date.now() - new Date(newestEvidence.created_at).getTime();
            if (ageMs > LFA_STALENESS_THRESHOLD_MS) {
              const ageHours = Math.round(ageMs / 3600000);
              const issue = `SUBAGENT_EVIDENCE_STALE: newest sub-agent evidence for this SD (row ${newestEvidence.id}) is ${ageHours}h old (threshold ${Math.round(LFA_STALENESS_THRESHOLD_MS / 3600000)}h) -- no fresh evidence recorded close to completion`;
              console.log(`   ❌ ${issue}`);
              logEvent({ sd_id: sdId, verdict: 'FAIL', missing: 'fresh_evidence', evidence_id: newestEvidence.id, age_hours: ageHours });
              return {
                passed: false,
                score: 0,
                max_score: 100,
                issues: [issue],
                warnings: [],
                details: {
                  staleness_check: true,
                  evidence_id: newestEvidence.id,
                  age_hours: ageHours,
                  remediation: `[ACTIVATION_INVARIANT_STALENESS] FAIL\n\nNewest sub-agent evidence for this SD is ${ageHours}h old (threshold ${Math.round(LFA_STALENESS_THRESHOLD_MS / 3600000)}h).\n\nFix: run any sub-agent for this SD (e.g. node scripts/execute-subagent.js --code VALIDATION --sd-id <SD-ID>) to refresh the clock, then re-run LEAD-FINAL-APPROVAL.\n\nEmergency bypass (audited, non-quota-consuming): ${STALENESS_KILL_SWITCH_ENV}=1`,
                },
              };
            }
          }
        } catch (err) {
          console.log(`   ⚠️  Evidence-staleness check error (non-blocking, fails open): ${err.message}`);
        }
      } else {
        console.log(`   ⚠️  ${STALENESS_KILL_SWITCH_ENV} active — staleness check bypassed`);
        // SECURITY finding M5 (adversarial review, 2026-09-05): the kill switch previously left no
        // durable trace, unlike every other bypass path in this file. Audit it the same way.
        try {
          const { randomUUID } = await import('crypto');
          const { emitValidationAuditLog } = await import('../../../../../lib/emit-validation-audit-log.mjs');
          await emitValidationAuditLog({
            supabase,
            correlation_id: randomUUID(),
            sd_id: sdId,
            validator_name: 'activation_invariant_gate',
            failure_reason: `Evidence-staleness check bypassed via ${STALENESS_KILL_SWITCH_ENV}`,
            failure_category: 'bypass',
            metadata: { gate: GATE_NAME, kill_switch: STALENESS_KILL_SWITCH_ENV },
            execution_context: 'lead-final-approval/gates/activation-invariant-gate.js',
          });
        } catch (auditErr) {
          console.warn(`   ⚠️  Staleness kill-switch audit emission failed (non-blocking): ${auditErr.message}`);
        }
      }

      // Step 2: bypass via existing --bypass-validation reason-text discriminator (activation
      // chain only -- does NOT cover the staleness check above, which already ran).
      const bypassReason = sd?.metadata?.governance_metadata?.bypass_reason || '';
      if (typeof bypassReason === 'string' && bypassReason.includes(BYPASS_TOKEN)) {
        console.log(`   ⚠️  Bypass active via reason-text "${BYPASS_TOKEN}"`);
        logEvent({ sd_id: sdId, verdict: 'BYPASS', bypass_reason: bypassReason });

        // SD-WRITERCONSUMER-ASYMMETRY-...-001-A FR-A-6: emit validation_audit_log on bypass branch.
        try {
          const { randomUUID } = await import('crypto');
          const { emitValidationAuditLog } = await import('../../../../../lib/emit-validation-audit-log.mjs');
          await emitValidationAuditLog({
            supabase,
            correlation_id: randomUUID(),
            sd_id: sdId,
            validator_name: 'activation_invariant_gate',
            failure_reason: `Activation invariant bypassed via ${BYPASS_TOKEN}: ${bypassReason}`,
            failure_category: 'bypass',
            metadata: { gate: GATE_NAME, bypass_token: BYPASS_TOKEN, bypass_reason: bypassReason },
            execution_context: 'lead-final-approval/gates/activation-invariant-gate.js',
          });
        } catch (auditErr) {
          console.warn(`   ⚠️  Activation invariant bypass audit emission failed (non-blocking): ${auditErr.message}`);
        }

        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`Activation invariant bypassed via reason-text ${BYPASS_TOKEN}: ${bypassReason}`],
          details: { bypassed: true, bypass_reason: bypassReason },
        };
      }

      // Step 3: evaluate trigger heuristic.
      const triggerResult = evaluateTrigger(sd);
      if (!triggerResult.triggered) {
        console.log(`   ℹ️  Not triggered (${triggerResult.reason}) — SD does not ship schema+UI+worker chain`);
        logEvent({ sd_id: sdId, verdict: 'NOT_TRIGGERED', reason: triggerResult.reason });
        return notTriggered(triggerResult);
      }
      console.log('   📋 Triggered — SD ships schema+UI+worker chain; activation test required.');

      // Step 3: load PRD + read activation_test_id.
      let prd;
      try {
        prd = await loadPRD({ supabase, prdRepo, sdId });
      } catch (err) {
        console.log(`   ⚠️  PRD lookup error: ${err.message}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`PRD lookup failed for sd_id=${sdId}: ${err.message}`],
          warnings: [],
          details: { triggered: true, prd_lookup_error: err.message },
        };
      }
      if (!prd) {
        const issue = `No PRD found for SD ${sdId} — required for activation invariant verification`;
        console.log(`   ❌ ${issue}`);
        logEvent({ sd_id: sdId, verdict: 'FAIL', missing: 'prd' });
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [issue],
          warnings: [],
          details: { triggered: true, prd_missing: true, remediation: buildRemediation({ missingComponent: 'PRD', prdId: null }) },
        };
      }
      const activationTestId = prd.activation_test_id;
      if (!activationTestId || activationTestId.trim() === '') {
        const issue = 'PRD.activation_test_id is empty — activation-invariant test path required';
        console.log(`   ❌ ${issue}`);
        logEvent({ sd_id: sdId, verdict: 'FAIL', missing: 'activation_test_id', prd_id: prd.id });
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [issue],
          warnings: [],
          details: {
            triggered: true,
            prd_id: prd.id,
            activation_test_id: null,
            remediation: buildRemediation({ missingComponent: 'PRD.activation_test_id (declare test path)', prdId: prd.id }),
          },
        };
      }

      // Step 4: verify test file exists on disk.
      const absTestPath = path.resolve(ROOT_DIR, activationTestId);
      if (!fs.existsSync(absTestPath)) {
        const issue = `activation_test_id points at non-existent file: ${activationTestId}`;
        console.log(`   ❌ ${issue}`);
        logEvent({ sd_id: sdId, verdict: 'FAIL', missing: 'test_file', activation_test_id: activationTestId });
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [issue],
          warnings: [],
          details: {
            triggered: true,
            prd_id: prd.id,
            activation_test_id: activationTestId,
            absolute_path: absTestPath,
            remediation: buildRemediation({ missingComponent: 'activation test file on disk', prdId: prd.id, testPath: activationTestId }),
          },
        };
      }

      // Step 5: verify TESTING evidence row exists, fresh, verified.
      let evidence;
      try {
        evidence = await loadTestingEvidence({ supabase, sdId });
      } catch (err) {
        console.log(`   ⚠️  Evidence lookup error: ${err.message}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`TESTING evidence lookup failed: ${err.message}`],
          warnings: [],
          details: { triggered: true, evidence_lookup_error: err.message },
        };
      }
      if (!evidence) {
        const issue = 'No TESTING sub-agent evidence row within 24h — run testing-agent for this SD';
        console.log(`   ❌ ${issue}`);
        logEvent({ sd_id: sdId, verdict: 'FAIL', missing: 'testing_evidence', activation_test_id: activationTestId });
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [issue],
          warnings: [],
          details: {
            triggered: true,
            prd_id: prd.id,
            activation_test_id: activationTestId,
            remediation: buildRemediation({ missingComponent: 'fresh TESTING evidence row (run testing-agent)', prdId: prd.id, testPath: activationTestId }),
          },
        };
      }
      const verified = Boolean(evidence?.metadata?.activation_invariant_verified);
      if (evidence.verdict !== 'PASS' || !verified) {
        const issue = `TESTING evidence row ${evidence.id} verdict=${evidence.verdict}, activation_invariant_verified=${verified} — both must hold`;
        console.log(`   ❌ ${issue}`);
        logEvent({ sd_id: sdId, verdict: 'FAIL', missing: 'verified_evidence', evidence_id: evidence.id, evidence_verdict: evidence.verdict });
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [issue],
          warnings: [],
          details: {
            triggered: true,
            prd_id: prd.id,
            activation_test_id: activationTestId,
            evidence_id: evidence.id,
            evidence_verdict: evidence.verdict,
            activation_invariant_verified: verified,
            remediation: buildRemediation({ missingComponent: 'TESTING verdict=PASS with metadata.activation_invariant_verified=true', prdId: prd.id, testPath: activationTestId }),
          },
        };
      }

      // PASS — all conditions hold.
      console.log(`   ✅ Activation invariant verified (evidence row: ${evidence.id})`);
      logEvent({ sd_id: sdId, verdict: 'PASS', evidence_id: evidence.id, activation_test_id: activationTestId });

      // SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-A: provenance grading, advisory-only by default
      // (shared SUBAGENT_EVIDENCE_PROVENANCE_MODE flag, same as subagent-evidence-gate.js).
      // session_id/content_hash come from the already-selected `metadata` object here, unlike
      // subagent-evidence-gate.js's aliased projection — flattened onto a shallow copy so
      // gradeProvenance's contract (flat top-level fields) stays identical across both callers.
      const provenanceGrade = gradeProvenance(
        { ...evidence, session_id: evidence.metadata?.session_id, content_hash: evidence.metadata?.content_hash }
      );
      const provenanceMode = resolveSubagentEvidenceProvenanceMode();
      const provenanceWarnings = [];
      if (provenanceGrade.absent) {
        const msg = `[ADVISORY] SUBAGENT_EVIDENCE_PROVENANCE_ABSENT: TESTING evidence row ${evidence.id} is missing ${provenanceGrade.missingField} — treated as absent provenance, not weak. `
          + `${provenanceMode === 'block' ? 'Blocking' : 'Non-blocking (advisory)'} per SUBAGENT_EVIDENCE_PROVENANCE_MODE=${provenanceMode}.`;
        console.log(`   ⚠️  ${msg}`);
        provenanceWarnings.push(msg);
        if (provenanceMode === 'block') {
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [`SUBAGENT_EVIDENCE_PROVENANCE_ABSENT: TESTING evidence row ${evidence.id} missing ${provenanceGrade.missingField}`],
            warnings: [],
            details: {
              triggered: true,
              prd_id: prd.id,
              activation_test_id: activationTestId,
              evidence_id: evidence.id,
              provenance_absent: provenanceGrade,
            },
          };
        }
      }

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: provenanceWarnings,
        details: {
          triggered: true,
          prd_id: prd.id,
          activation_test_id: activationTestId,
          evidence_id: evidence.id,
          evidence_confidence: evidence.confidence,
          provenance_absent: provenanceGrade.absent ? provenanceGrade : null,
        },
      };
    },
    required: true,
  };
}
