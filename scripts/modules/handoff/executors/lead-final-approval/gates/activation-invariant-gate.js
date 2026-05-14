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

const GATE_NAME = 'GATE_ACTIVATION_INVARIANT';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// scripts/modules/handoff/executors/lead-final-approval/gates/ -> repo root is 6 levels up
const ROOT_DIR = path.resolve(__dirname, '../../../../../..');

const EVIDENCE_FRESHNESS_MS = 24 * 60 * 60 * 1000; // 24 hours
const BYPASS_TOKEN = 'ACTIV-CHAIN-DEFERRED';

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
  const { data } = await supabase
    .from('product_requirements_v2')
    .select('id, sd_id, activation_test_id')
    .eq('sd_id', sdId)
    .limit(1)
    .maybeSingle();
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
  const { data } = await supabase
    .from('sub_agent_execution_results')
    .select('id, verdict, confidence, metadata, created_at, phase')
    .eq('sd_id', sdId)
    .eq('sub_agent_code', 'TESTING')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
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

      // Step 1: bypass via existing --bypass-validation reason-text discriminator.
      const bypassReason = sd?.metadata?.governance_metadata?.bypass_reason || '';
      if (typeof bypassReason === 'string' && bypassReason.includes(BYPASS_TOKEN)) {
        console.log(`   ⚠️  Bypass active via reason-text "${BYPASS_TOKEN}"`);
        logEvent({ sd_id: sdId, verdict: 'BYPASS', bypass_reason: bypassReason });
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`Activation invariant bypassed via reason-text ${BYPASS_TOKEN}: ${bypassReason}`],
          details: { bypassed: true, bypass_reason: bypassReason },
        };
      }

      // Step 2: evaluate trigger heuristic.
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
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        details: {
          triggered: true,
          prd_id: prd.id,
          activation_test_id: activationTestId,
          evidence_id: evidence.id,
          evidence_confidence: evidence.confidence,
        },
      };
    },
    required: true,
  };
}
