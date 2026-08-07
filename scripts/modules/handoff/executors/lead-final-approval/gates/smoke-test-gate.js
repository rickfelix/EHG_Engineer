/**
 * SMOKE_TEST_GATE — Orchestrator Completion Validation
 * SD-ORCHESTRATOR-COMPLETION-VALIDATION-GATES-ORCH-001-A
 *
 * Reads smoke_test_cmd from the PRD linked to the current SD.
 * If present, executes the command and checks exit code.
 *
 * Phase: LEAD-FINAL-APPROVAL
 */

import { execSync } from 'child_process';
// SD-LEO-INFRA-SWALLOWED-POSTGREST-ERROR-001 FR-1: query-error discipline, so a rejected PRD
// lookup cannot masquerade as "no smoke test configured".
import { safeQuery } from '../../../../../../lib/db/safe-query.mjs';

const GATE_NAME = 'SMOKE_TEST_GATE';
const TIMEOUT_MS = 30_000;

/**
 * Create the smoke test execution gate.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [prdRepo] - PRDRepository instance (optional; falls back to direct query)
 * @returns {Object} Gate definition
 */
export function createSmokeTestGate(supabase, prdRepo) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n🧪 GATE: Smoke Test Execution');
      console.log('-'.repeat(50));

      const sdId = ctx.sd?.id || ctx.sdId;

      // Resolve PRD to get smoke_test_cmd
      let smokeTestCmd = null;
      // SD-LEO-INFRA-SWALLOWED-POSTGREST-ERROR-001 / FR-3: a FAILED LOOKUP IS NOT AN ABSENT
      // COMMAND. Before this, the query below bound only `data`, so a rejected query (bad column,
      // missing relation) yielded null, `prd` stayed null, `smokeTestCmd` stayed null, and control
      // reached the "No smoke_test_cmd configured — advisory pass" branch below. A BROKEN QUERY
      // MADE THIS GATE PASS, reporting a benign reason that sounds like normal operation.
      //
      // Routing the query through safeQuery is NOT sufficient on its own: this try/catch would
      // have swallowed the throw and fallen through to the same advisory pass. The catch had to
      // record the fault so the advisory-pass branch becomes unreachable after one.
      let lookupFault = null;
      try {
        let prd = null;
        if (prdRepo?.getBySdUuid) {
          prd = await prdRepo.getBySdUuid(sdId);
        } else if (prdRepo?.getBySdId) {
          prd = await prdRepo.getBySdId(sdId);
        }

        if (!prd && supabase) {
          // safeQuery returns null for PGRST116 (.single() matched no rows — a genuine absence,
          // and the correct path to an advisory pass) and THROWS for anything else.
          prd = await safeQuery(
            supabase
              .from('product_requirements_v2')
              .select('smoke_test_cmd')
              .eq('sd_id', sdId)
              .limit(1)
              .single(),
            { site: 'smoke-test-gate:prd-lookup' }
          );
        }

        smokeTestCmd = prd?.smoke_test_cmd || null;
      } catch (err) {
        lookupFault = err;
        console.log(`   ⚠️  PRD lookup error: ${err.message}`);
      }

      // A lookup that COULD NOT ANSWER must not be reported as "nothing configured".
      if (lookupFault) {
        console.log('   ❌ PRD lookup failed — cannot determine whether a smoke test is configured');
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [
            `SMOKE_TEST_GATE could not read the PRD: ${lookupFault.message}. `
            + 'This is a query fault, not an absent smoke test — the gate refuses to advisory-pass on an unanswerable lookup '
            + '(SD-LEO-INFRA-SWALLOWED-POSTGREST-ERROR-001 FR-3).',
          ],
          warnings: [],
        };
      }

      // No command configured — advisory pass
      if (!smokeTestCmd || smokeTestCmd.trim() === '') {
        console.log('   ℹ️  No smoke_test_cmd configured in PRD — advisory pass');
        return {
          passed: true,
          score: 80,
          max_score: 100,
          issues: [],
          warnings: ['No smoke test configured — add smoke_test_cmd to PRD for automated verification'],
        };
      }

      console.log(`   Command: ${smokeTestCmd}`);

      // Execute the command
      try {
        execSync(smokeTestCmd, {
          timeout: TIMEOUT_MS,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        console.log('   ✅ Smoke test passed (exit 0)');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { command: smokeTestCmd },
        };
      } catch (execError) {
        // Timeout
        if (execError.killed || execError.signal === 'SIGTERM') {
          console.log(`   ⚠️  Smoke test timed out after ${TIMEOUT_MS / 1000}s`);
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [`Smoke test timed out after ${TIMEOUT_MS / 1000}s: ${smokeTestCmd}`],
            warnings: [],
            details: { command: smokeTestCmd, timeout: true },
          };
        }

        // Command not found (ENOENT or shell 127)
        const isNotFound =
          execError.code === 'ENOENT' ||
          (execError.status === 127);

        if (isNotFound) {
          console.log('   ⚠️  Command not found — advisory pass');
          return {
            passed: true,
            score: 50,
            max_score: 100,
            issues: [],
            warnings: [`Smoke test command not found: ${smokeTestCmd}`],
            details: { command: smokeTestCmd, notFound: true },
          };
        }

        // Non-zero exit
        const stderr = (execError.stderr || '').trim().slice(0, 500);
        console.log(`   ❌ Smoke test failed (exit ${execError.status})`);
        if (stderr) console.log(`   Stderr: ${stderr.slice(0, 200)}`);

        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [
            `Smoke test failed (exit ${execError.status}): ${smokeTestCmd}`,
            ...(stderr ? [`Stderr: ${stderr}`] : []),
          ],
          warnings: [],
          details: { command: smokeTestCmd, exitCode: execError.status, stderr },
        };
      }
    },
    required: false, // Advisory initially — becomes required after stabilization
  };
}
