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
      try {
        let prd = null;
        if (prdRepo?.getBySdUuid) {
          prd = await prdRepo.getBySdUuid(sdId);
        } else if (prdRepo?.getBySdId) {
          prd = await prdRepo.getBySdId(sdId);
        }

        if (!prd && supabase) {
          const { data } = await supabase
            .from('product_requirements_v2')
            .select('smoke_test_cmd')
            .eq('sd_id', sdId)
            .limit(1)
            .single();
          prd = data;
        }

        smokeTestCmd = prd?.smoke_test_cmd || null;
      } catch (err) {
        console.log(`   ⚠️  PRD lookup error: ${err.message}`);
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
