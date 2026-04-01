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
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseServiceClient } from '../../supabase-client.js';
import { registerVentureResource } from '../../venture-resources.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REGISTRY_PATH = resolve(__dirname, '../../../applications/registry.json');
const ENGINEER_ROOT = resolve(__dirname, '../../..');

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/** Minimal fallback hook when the full template is missing */
const FALLBACK_HOOK = `#!/bin/bash
# Minimal pre-commit secret detection (fallback)
STAGED=$(git diff --cached --name-only --diff-filter=ACM)
[ -z "$STAGED" ] && exit 0
PATTERNS=('sk-[a-zA-Z0-9]{20,}' 'AKIA[A-Z0-9]{16}' 'ghp_[a-zA-Z0-9]{36}')
FOUND=0
for p in "\${PATTERNS[@]}"; do
  if echo "$STAGED" | xargs grep -lE "$p" 2>/dev/null; then
    echo "ERROR: Potential secret matching: $p"
    FOUND=1
  fi
done
[ $FOUND -ne 0 ] && echo "Commit blocked. Use --no-verify to override." && exit 1
exit 0
`;

/**
 * Default provisioning steps.
 * Each step has: name, check (is it already done?), execute (do it).
 * Steps are stubs — real implementations are wired by downstream SDs.
 */
/**
 * Resolve venture metadata from DB for provisioning context.
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<{name: string, repoName: string, localPath: string}|null>}
 */
async function resolveVentureMetadata(ventureId) {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('ventures')
    .select('name, metadata')
    .eq('id', ventureId)
    .single();
  if (!data) return null;
  // Normalize name to kebab-case for repo/directory naming
  const repoName = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const localPath = resolve(ENGINEER_ROOT, '..', repoName);
  return { name: data.name, repoName, localPath };
}

const DEFAULT_STEPS = [
  {
    name: 'repo_created',
    check: async (ctx) => {
      if (ctx.stepsCompleted.includes('repo_created')) return true;
      // Also check if GitHub repo already exists
      if (!ctx.venture) return false;
      try {
        execFileSync('gh', ['repo', 'view', `rickfelix/${ctx.venture.repoName}`, '--json', 'name'], { stdio: 'pipe', encoding: 'utf8' });
        return true;
      } catch { return false; }
    },
    execute: async (ctx) => {
      if (!ctx.venture) {
        ctx.venture = await resolveVentureMetadata(ctx.ventureId);
      }
      if (!ctx.venture) throw new Error(`Venture ${ctx.ventureId} not found in ventures table`);
      const { repoName } = ctx.venture;

      // Create GitHub repo via gh CLI
      ctx.log(`[repo_created] Creating GitHub repo: rickfelix/${repoName}`);
      execFileSync('gh', ['repo', 'create', `rickfelix/${repoName}`, '--private', '--description', `EHG Venture: ${ctx.venture.name}`], {
        stdio: 'pipe', encoding: 'utf8', timeout: 30000
      });

      // Clone locally and scaffold if needed
      if (!existsSync(ctx.venture.localPath)) {
        ctx.log(`[repo_created] Cloning to ${ctx.venture.localPath}`);
        execFileSync('git', ['clone', `https://github.com/rickfelix/${repoName}.git`, ctx.venture.localPath], {
          stdio: 'pipe', encoding: 'utf8', timeout: 60000
        });
      }
      ctx.ventureRepoPath = ctx.venture.localPath;
      ctx.log(`[repo_created] GitHub repo created: rickfelix/${repoName}`);

      // Register resource in venture_resources registry
      try {
        await registerVentureResource(ctx.ventureId, 'github_repo', `rickfelix/${repoName}`, 'github', { url: `https://github.com/rickfelix/${repoName}` });
        await registerVentureResource(ctx.ventureId, 'local_directory', ctx.venture.localPath, 'local');
        ctx.log('[repo_created] Resources registered in venture_resources');
      } catch (regErr) { ctx.log(`[repo_created] Resource registration non-fatal: ${regErr.message}`); }
    },
  },
  {
    name: 'registry_updated',
    check: async (ctx) => {
      if (ctx.stepsCompleted.includes('registry_updated')) return true;
      if (!ctx.venture) return false;
      try {
        const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
        return Object.values(registry.applications || {}).some(
          a => a.name?.toLowerCase() === ctx.venture.repoName.toLowerCase()
        );
      } catch { return false; }
    },
    execute: async (ctx) => {
      if (!ctx.venture) {
        ctx.venture = await resolveVentureMetadata(ctx.ventureId);
      }
      if (!ctx.venture) throw new Error(`Venture ${ctx.ventureId} not found`);

      const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
      const apps = registry.applications || {};

      // Find next APP ID
      const existingIds = Object.keys(apps).map(k => parseInt(k.replace('APP', ''), 10)).filter(n => !isNaN(n));
      const nextId = `APP${String(Math.max(0, ...existingIds) + 1).padStart(3, '0')}`;

      apps[nextId] = {
        id: nextId,
        name: ctx.venture.repoName,
        github_repo: `rickfelix/${ctx.venture.repoName}`,
        supabase_project_id: 'pending',
        supabase_url: 'pending',
        status: 'active',
        environment: 'development',
        registered_at: new Date().toISOString(),
        registered_by: 'venture-provisioner',
        local_path: ctx.venture.localPath.replace(/\\/g, '/')
      };

      registry.applications = apps;
      registry.metadata.total_apps = Object.keys(apps).length;
      registry.metadata.active_apps = Object.values(apps).filter(a => a.status === 'active').length;
      registry.metadata.last_updated = new Date().toISOString();

      writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');
      ctx.log(`[registry_updated] Added ${nextId}: ${ctx.venture.repoName} to registry`);
    },
  },
  {
    name: 'schema_created',
    check: async (ctx) => ctx.stepsCompleted.includes('schema_created'),
    execute: async (ctx) => {
      // Default: use shared/consolidated DB (same as EHG_Engineer)
      // Separate Supabase projects deferred until ventures reach production (per CFO/CISO board decision)
      if (!ctx.venture) ctx.venture = await resolveVentureMetadata(ctx.ventureId);
      ctx.log('[schema_created] Using consolidated DB pattern (shared Supabase project)');
      ctx.log(`[schema_created] Venture ${ctx.venture?.repoName || ctx.ventureId} will use EHG_Engineer Supabase until production`);

      // Update registry entry with consolidated DB URL if registry was already updated
      try {
        const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
        for (const app of Object.values(registry.applications || {})) {
          if (app.name === ctx.venture?.repoName && app.supabase_url === 'pending') {
            app.supabase_url = process.env.SUPABASE_URL || 'consolidated';
            app.supabase_project_id = process.env.SUPABASE_PROJECT_ID || 'consolidated';
            app.note = 'CONSOLIDATED: Uses same DB as EHG_Engineer until production';
            writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');
            ctx.log('[schema_created] Registry updated with consolidated DB reference');
            break;
          }
        }
      } catch { /* Non-fatal */ }
    },
  },
  {
    name: 'cicd_configured',
    check: async (ctx) => {
      if (ctx.stepsCompleted.includes('cicd_configured')) return true;
      // Check if CI workflow exists in local repo
      const repoPath = ctx.ventureRepoPath || ctx.venture?.localPath;
      if (!repoPath) return false;
      return existsSync(join(repoPath, '.github', 'workflows', 'ci.yml'));
    },
    execute: async (ctx) => {
      const repoPath = ctx.ventureRepoPath || ctx.venture?.localPath;
      if (!repoPath || !existsSync(repoPath)) {
        ctx.log('[cicd_configured] No local repo path — skipping CI/CD generation');
        return;
      }
      const workflowDir = join(repoPath, '.github', 'workflows');
      if (!existsSync(workflowDir)) {
        mkdirSync(workflowDir, { recursive: true });
      }
      // Generate minimal CI workflow
      const ciYml = `name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm test
`;
      writeFileSync(join(workflowDir, 'ci.yml'), ciYml);
      ctx.log('[cicd_configured] Generated .github/workflows/ci.yml');
    },
  },
  {
    name: 'docker_compose_created',
    check: async (ctx) => {
      if (ctx.stepsCompleted.includes('docker_compose_created')) return true;
      const repoPath = ctx.ventureRepoPath || ctx.venture?.localPath;
      if (!repoPath) return false;
      return existsSync(join(repoPath, 'docker-compose.yml'));
    },
    execute: async (ctx) => {
      const repoPath = ctx.ventureRepoPath || ctx.venture?.localPath;
      if (!repoPath || !existsSync(repoPath)) {
        ctx.log('[docker_compose_created] No local repo path — skipping');
        return;
      }
      const composePath = join(repoPath, 'docker-compose.yml');
      if (existsSync(composePath)) {
        ctx.log('[docker_compose_created] docker-compose.yml already exists — skipping');
        return;
      }
      const repoName = ctx.venture?.repoName || 'venture-app';
      const composeContent = `version: "3.8"
services:
  app:
    build: .
    container_name: ${repoName}-app
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped
`;
      writeFileSync(composePath, composeContent);
      ctx.log('[docker_compose_created] Generated docker-compose.yml with app service for ' + repoName);
    },
  },
  {
    name: 'hooks_installed',
    check: async (ctx) => {
      if (ctx.stepsCompleted.includes('hooks_installed')) return true;
      const repoPath = ctx.ventureRepoPath || ctx.venture?.localPath;
      if (!repoPath) return false;
      return existsSync(join(repoPath, '.githooks', 'pre-commit'))
          || existsSync(join(repoPath, '.husky', 'pre-commit'));
    },
    execute: async (ctx) => {
      const repoPath = ctx.ventureRepoPath || ctx.venture?.localPath;
      if (!repoPath || !existsSync(repoPath)) {
        ctx.log('[hooks_installed] No local repo path — skipping hook installation');
        return;
      }
      const hooksDir = join(repoPath, '.githooks');
      if (!existsSync(hooksDir)) {
        mkdirSync(hooksDir, { recursive: true });
      }
      const templatePath = resolve(ENGINEER_ROOT, 'templates', 'venture-pre-commit-hook.sh');
      let hookContent;
      if (existsSync(templatePath)) {
        hookContent = readFileSync(templatePath, 'utf8');
      } else {
        ctx.log('[hooks_installed] Template not found — using fallback hook');
        hookContent = FALLBACK_HOOK;
      }
      const hookPath = join(hooksDir, 'pre-commit');
      writeFileSync(hookPath, hookContent, { mode: 0o755 });
      execFileSync('git', ['-C', repoPath, 'config', 'core.hooksPath', '.githooks'], {
        stdio: 'pipe', encoding: 'utf8', timeout: 10000
      });
      ctx.log('[hooks_installed] Pre-commit hook installed and core.hooksPath configured');
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
  {
    name: 'monitoring_baseline',
    check: async (ctx) => {
      if (ctx.stepsCompleted.includes('monitoring_baseline')) return true;
      // Check if venture metadata already has sentry config
      if (!ctx.venture) return false;
      const supabase = createSupabaseServiceClient();
      const { data } = await supabase
        .from('ventures')
        .select('metadata')
        .eq('id', ctx.ventureId)
        .single();
      return !!(data?.metadata?.sentry?.org);
    },
    execute: async (ctx) => {
      if (!ctx.venture) {
        ctx.venture = await resolveVentureMetadata(ctx.ventureId);
      }
      if (!ctx.venture) throw new Error(`Venture ${ctx.ventureId} not found`);

      ctx.log('[monitoring_baseline] Configuring Sentry monitoring baseline...');

      // Store Sentry config in venture metadata
      // Actual Sentry project creation is manual (org-level setup)
      // This step registers the config so poll-errors.js can pick it up
      const supabase = createSupabaseServiceClient();
      const { data: current } = await supabase
        .from('ventures')
        .select('metadata')
        .eq('id', ctx.ventureId)
        .single();

      const existingMetadata = current?.metadata || {};
      const sentryConfig = existingMetadata.sentry || {
        org: process.env.SENTRY_ORG || 'ehg',
        project: ctx.venture.repoName,
        token: process.env.SENTRY_AUTH_TOKEN || 'pending-manual-setup',
        lastPollAt: null
      };

      await supabase
        .from('ventures')
        .update({
          metadata: { ...existingMetadata, sentry: sentryConfig }
        })
        .eq('id', ctx.ventureId);

      // Initialize guardrail state for this venture
      await supabase
        .from('factory_guardrail_state')
        .upsert({
          venture_id: ctx.ventureId,
          corrections_today: 0,
          kill_switch_active: false,
          last_correction_at: null,
          canary_expires_at: null
        }, { onConflict: 'venture_id' });

      ctx.log(`[monitoring_baseline] Sentry config registered for ${ctx.venture.repoName}`);
      ctx.log('[monitoring_baseline] Guardrail state initialized');
      ctx.log('[monitoring_baseline] Note: Sentry project creation and DSN setup requires manual org-level configuration');
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

  // SD-LEO-INFRA-WIRE-VENTURE-PROVISIONER-001: Pre-resolve venture metadata for steps
  const venture = await resolveVentureMetadata(ventureId);
  const ctx = { ventureId, venture, ventureRepoPath: options.ventureRepoPath || venture?.localPath || null, stepsCompleted: stateData.stepsCompleted, log };

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
