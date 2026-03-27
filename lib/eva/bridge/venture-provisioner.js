/**
 * Venture Provisioner — Idempotent State Machine
 * SD-LEO-INFRA-VENTURE-LEO-BUILD-001-C
 *
 * Orchestrates the full venture provisioning lifecycle:
 * repo creation, registry entry, schema setup, CI/CD config.
 * Each step is idempotent — safe to re-run after failures.
 */

import { getState, updateStep, markComplete, markFailed } from './provisioning-state.js';
import { evaluateConformance, buildConformanceMetadata } from './conformance-integration.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Default provisioning steps.
 * Each step has: name, check (is it already done?), execute (do it).
 * Steps are stubs — real implementations are wired by downstream SDs.
 */
const DEFAULT_STEPS = [
  {
    name: 'repo_created',
    check: async (ctx) => ctx.stepsCompleted.includes('repo_created'),
    execute: async (ctx) => {
      // Stub: Real implementation in SD-F (CI/CD Template Generation)
      // Would call: gh repo create <owner>/<venture-name> --template <template>
      ctx.log(`[repo_created] Stub: Would create GitHub repo for venture ${ctx.ventureId}`);
    },
  },
  {
    name: 'registry_updated',
    check: async (ctx) => ctx.stepsCompleted.includes('registry_updated'),
    execute: async (ctx) => {
      // Stub: Real implementation adds entry to applications/registry.json
      ctx.log(`[registry_updated] Stub: Would update application registry for venture ${ctx.ventureId}`);
    },
  },
  {
    name: 'schema_created',
    check: async (ctx) => ctx.stepsCompleted.includes('schema_created'),
    execute: async (ctx) => {
      // Stub: Real implementation creates Supabase schema for venture
      ctx.log(`[schema_created] Stub: Would create Supabase schema for venture ${ctx.ventureId}`);
    },
  },
  {
    name: 'cicd_configured',
    check: async (ctx) => ctx.stepsCompleted.includes('cicd_configured'),
    execute: async (ctx) => {
      // Stub: Real implementation in SD-F (CI/CD Template Generation)
      ctx.log(`[cicd_configured] Stub: Would configure CI/CD for venture ${ctx.ventureId}`);
    },
  },
  {
    name: 'conformance_checked',
    check: async (ctx) => ctx.stepsCompleted.includes('conformance_checked'),
    execute: async (ctx) => {
      const repoPath = ctx.ventureRepoPath;
      if (!repoPath) {
        ctx.log('[conformance_checked] No repo path available — skipping conformance check');
        return { status: 'completed', skipped: true };
      }
      const result = await evaluateConformance(repoPath, { logger: ctx.log });
      ctx.conformanceResult = result;
      if (!result.passed) {
        return {
          status: 'failed',
          error: `Conformance score ${result.score}/${result.threshold} — ${result.failing} checks failed`,
        };
      }
      ctx.log(`[conformance_checked] Passed: ${result.score}/${result.threshold} (${result.passing}/${result.total} checks)`);
    },
  },
];

/**
 * Sleep with exponential backoff.
 * @param {number} attempt - Current attempt (0-indexed)
 */
function backoffDelay(attempt) {
  const delay = BASE_DELAY_MS * Math.pow(2, attempt);
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Execute a single step with retry logic.
 * @param {object} step - Step definition { name, check, execute }
 * @param {object} ctx - Execution context
 * @returns {Promise<{ status: 'completed'|'skipped'|'failed', error: string|null }>}
 */
async function executeStepWithRetry(step, ctx) {
  // Check if already done (idempotent)
  const alreadyDone = await step.check(ctx);
  if (alreadyDone) return { status: 'skipped', error: null };

  // Execute with retries
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await step.execute(ctx);
      return { status: 'completed', error: null };
    } catch (err) {
      ctx.log(`[${step.name}] Attempt ${attempt + 1}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES - 1) {
        await backoffDelay(attempt);
      } else {
        return { status: 'failed', error: `${step.name} failed after ${MAX_RETRIES} attempts: ${err.message}` };
      }
    }
  }

  return { status: 'failed', error: `${step.name} exhausted retries` };
}

/**
 * Provision a venture through the full lifecycle.
 * Idempotent: safe to call multiple times on the same venture.
 *
 * @param {string} ventureId - Venture UUID
 * @param {object} [options]
 * @param {object[]} [options.steps] - Custom steps (defaults to DEFAULT_STEPS)
 * @param {boolean} [options.skipStateTracking=false] - Skip database state updates (for testing)
 * @param {function} [options.logger] - Custom logger function
 * @returns {Promise<{ success: boolean, stepsCompleted: string[], stepsSkipped: string[], error: string|null }>}
 */
export async function provisionVenture(ventureId, options = {}) {
  const { steps = DEFAULT_STEPS, skipStateTracking = false, logger = console.log } = options;
  const stepsCompleted = [];
  const stepsSkipped = [];
  const log = logger;

  // Get or create provisioning state
  let stateData = { stepsCompleted: [] };
  if (!skipStateTracking) {
    const { data, error } = await getState(ventureId);
    if (error) return { success: false, stepsCompleted: [], stepsSkipped: [], error };

    // Guard against concurrent runs
    if (data.status === 'in_progress') {
      return { success: false, stepsCompleted: [], stepsSkipped: [], error: 'Provisioning already in progress for this venture' };
    }

    // Already completed — no-op
    if (data.status === 'completed') {
      return { success: true, stepsCompleted: [], stepsSkipped: steps.map(s => s.name), error: null };
    }

    stateData = { stepsCompleted: data.steps_completed || [] };

    // Mark as in_progress
    await updateStep(ventureId, steps[0].name, 'in_progress');
  }

  const ctx = { ventureId, ventureRepoPath: options.ventureRepoPath || null, stepsCompleted: stateData.stepsCompleted, log };

  // Execute each step
  for (const step of steps) {
    if (!skipStateTracking) {
      await updateStep(ventureId, step.name, 'in_progress');
    }

    const result = await executeStepWithRetry(step, ctx);

    if (result.status === 'completed') {
      stepsCompleted.push(step.name);
      ctx.stepsCompleted.push(step.name);
      if (!skipStateTracking) {
        const stepOpts = { markStepDone: true };
        if (step.name === 'conformance_checked' && ctx.conformanceResult) {
          stepOpts.metadata = buildConformanceMetadata(ctx.conformanceResult);
        }
        await updateStep(ventureId, step.name, 'in_progress', stepOpts);
      }
    } else if (result.status === 'skipped') {
      stepsSkipped.push(step.name);
    } else {
      // Failed
      if (!skipStateTracking) {
        await markFailed(ventureId, result.error);
      }
      return { success: false, stepsCompleted, stepsSkipped, error: result.error };
    }
  }

  // All steps done
  if (!skipStateTracking) {
    await markComplete(ventureId);
  }

  return { success: true, stepsCompleted, stepsSkipped, error: null };
}
