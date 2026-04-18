/**
 * Integration Smoke Test Gate for PLAN-TO-LEAD
 * SD: SD-MAN-INFRA-FIX-ORCHESTRATOR-CHILD-001-A
 *
 * Executes the PRD-declared smoke_test_cmd and blocks completion on non-zero exit.
 * If no smoke_test_cmd is declared, returns a justified pass (not a failure).
 *
 * Part of the orchestrator completion validation gates that verify behavioral
 * correctness, not just structural completeness.
 */

import { execSync } from 'node:child_process';

const GATE_KEY = 'GATE_INTEGRATION_SMOKE_TEST';
const TIMEOUT_MS = 30_000;

/**
 * @param {object} context - Gate context from handoff system
 * @param {string} context.sdKey - SD key
 * @param {string} context.sdId - SD UUID
 * @param {object} context.supabase - Supabase client
 * @returns {Promise<{passed: boolean, score: number, max_score: number, issues: string[], details: object}>}
 */
async function run(context) {
  const { sdId, supabase } = context;

  // Fetch smoke_test_cmd from PRD
  const { data: prd, error: prdErr } = await supabase
    .from('product_requirements_v2')
    .select('smoke_test_cmd')
    .or(`directive_id.eq.${sdId},sd_id.eq.${sdId}`)
    .limit(1)
    .single();

  if (prdErr || !prd) {
    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      details: { reason: 'no PRD found — skipped', gate: GATE_KEY },
    };
  }

  const cmd = prd.smoke_test_cmd;

  if (!cmd || cmd.trim() === '') {
    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      details: { reason: 'no smoke_test_cmd declared — skipped', gate: GATE_KEY },
    };
  }

  // Execute the command
  try {
    const stdout = execSync(cmd, {
      timeout: TIMEOUT_MS,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      details: {
        gate: GATE_KEY,
        command: cmd,
        exitCode: 0,
        stdout: (stdout || '').slice(0, 500),
      },
    };
  } catch (err) {
    const isTimeout = err.killed || /ETIMEDOUT|timed?\s*out/i.test(err.message);
    const exitCode = err.status ?? 1;
    const stderr = (err.stderr || err.message || '').slice(0, 500);

    return {
      passed: false,
      score: 0,
      max_score: 100,
      issues: [
        isTimeout
          ? `smoke_test_cmd timed out after ${TIMEOUT_MS / 1000}s: ${cmd}`
          : `smoke_test_cmd exited ${exitCode}: ${stderr}`,
      ],
      details: {
        gate: GATE_KEY,
        command: cmd,
        exitCode,
        timeout: isTimeout,
        stderr,
      },
    };
  }
}

export function createIntegrationSmokeTestGate() {
  return {
    name: GATE_KEY,
    description: 'Executes PRD smoke_test_cmd and blocks on non-zero exit',
    category: 'completion',
    run,
  };
}
