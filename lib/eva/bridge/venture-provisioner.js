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
import { normalizeAppName, getRepoRoot } from '../../repo-paths.js';
import { ensureVentureClone } from './ensure-venture-clone.js';
// SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-B FR-2: stakes-based DB routing.
import { routeDbProvider } from '../../venture-deploy/stakes-router.js';
// SD-LEO-INFRA-LEO-BRIDGE-MODEL-001 (FR-1): Claude-Code-ready scaffold for leo_bridge
// ventures. buildReplitConfig is shared with the Stitch/Lovable/Replit seedRepo() path
// (its stack-descriptor dispatch is generic); the CLAUDE.md/build-tasks.md builders are
// leo_bridge-specific (see leo-bridge-scaffold-writer.js header for why they are NOT
// shared with claude-md-writer.js / build-tasks-writer.js).
import { buildLeoBridgeClaudeMd, buildLeoBridgeBuildTasks } from './leo-bridge-scaffold-writer.js';
import { buildReplitConfig } from './replit-config-writer.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REGISTRY_PATH = resolve(__dirname, '../../../applications/registry.json');
const ENGINEER_ROOT = resolve(__dirname, '../../..');

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// SAFETY: All venture repos MUST be private. NEVER change this visibility.
const REPO_VISIBILITY = '--private';

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
  // FR-3 (G-B): canonical main root (getRepoRoot strips any `.worktrees/<sd>` suffix) so the venture
  // sibling-clone path is `_EHG/<repoName>` whether provisioning runs from main or a worktree.
  const localPath = resolve(getRepoRoot(), '..', repoName);
  return { name: data.name, repoName, localPath };
}

// Exported (SD-LEO-INFRA-LEO-BRIDGE-MODEL-001) so individual step behavior — notably
// scaffold_seeded's check()/execute() — is directly unit-testable, matching the pattern
// already used to inject synthetic steps into provisionVenture() in this file's tests.
export const DEFAULT_STEPS = [
  {
    name: 'repo_created',
    check: async (ctx) => {
      if (ctx.stepsCompleted.includes('repo_created')) return true;
      if (!ctx.venture) return false;
      // SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 FR-3: "done" requires BOTH the GitHub repo AND
      // the local clone. A pre-existing GitHub repo (operator-created, or the S17 design repo)
      // with no local clone must NOT skip this step — otherwise ensureVentureClone never runs
      // and the leo_bridge EXEC loop has no clone to route per-SD worktrees into.
      if (!existsSync(join(ctx.venture.localPath, '.git'))) return false;
      try {
        execFileSync('gh', ['repo', 'view', `rickfelix/${ctx.venture.repoName}`, '--json', 'name'], { stdio: 'pipe', encoding: 'utf8' });
        return true;
      } catch { return false; }
    },
    execute: async (ctx) => {
      if (!ctx.venture) {
        ctx.venture = await resolveVentureMetadata(ctx.ventureId);
      }
      if (!ctx.venture) {
        ctx.log(`[repo_created] No venture metadata for ${ctx.ventureId} — skipping`);
        return;
      }
      const { repoName } = ctx.venture;

      // FR-3: create the GitHub repo only if it does not already exist (idempotent — the repo
      // may be operator-created or be the S17 design repo). Then ALWAYS ensure the local clone.
      let repoExists = false;
      try {
        execFileSync('gh', ['repo', 'view', `rickfelix/${repoName}`, '--json', 'name'], { stdio: 'pipe', encoding: 'utf8' });
        repoExists = true;
      } catch { /* not found — create below */ }
      if (repoExists) {
        ctx.log(`[repo_created] GitHub repo rickfelix/${repoName} already exists — ensuring local clone`);
      } else {
        ctx.log(`[repo_created] Creating GitHub repo: rickfelix/${repoName}`);
        execFileSync('gh', ['repo', 'create', `rickfelix/${repoName}`, REPO_VISIBILITY, '--description', `EHG Venture: ${ctx.venture.name}`], {
          stdio: 'pipe', encoding: 'utf8', timeout: 30000
        });
      }

      // SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 FR-3: ensure the persistent local clone
      // exists AND is current — clone-if-missing / refresh-if-present, NEVER delete.
      // The per-SD EXEC worktree is later created INSIDE this clone off the venture
      // origin/main (resolve-sd-workdir routes repoRoot to local_path when .git is
      // present), and pushes target the venture remote rickfelix/<repoName>.
      const cloneResult = ensureVentureClone(
        `https://github.com/rickfelix/${repoName}`,
        ctx.venture.localPath,
        { log: (m) => ctx.log(`[repo_created] ${m}`) },
      );
      ctx.ventureRepoPath = ctx.venture.localPath;
      ctx.log(
        `[repo_created] GitHub repo ready: rickfelix/${repoName} — clone ${cloneResult.action}` +
        `${cloneResult.reason ? ` (${cloneResult.reason})` : ''} at ${ctx.venture.localPath}`
      );

      // Register resource in venture_resources registry
      try {
        await registerVentureResource(ctx.ventureId, 'github_repo', `rickfelix/${repoName}`, 'github', { url: `https://github.com/rickfelix/${repoName}` });
        await registerVentureResource(ctx.ventureId, 'local_directory', ctx.venture.localPath, 'local');
        ctx.log('[repo_created] Resources registered in venture_resources');
      } catch (regErr) { ctx.log(`[repo_created] Resource registration non-fatal: ${regErr.message}`); }
    },
  },
  {
    // SD-LEO-INFRA-LEO-BRIDGE-MODEL-001 (FR-1): leo_bridge ventures never call
    // replit-repo-seeder.js::seedRepo() (that path is exclusive to build_model=
    // 'seeded_repo' — see stage-execution-worker.js::_runS19Bridge's resolveBuildModel
    // dispatch), so they were missing CLAUDE.md / docs/build-tasks.md / .replit
    // entirely. This step closes that gap at the ONE point every leo_bridge venture's
    // repo already passes through: provisionVenture(), called by
    // _verifyAndProvisionVenture() before every S19 bridge run. Positioned after
    // 'repo_created' so ctx.ventureRepoPath is populated (a local clone exists).
    name: 'scaffold_seeded',
    check: async (ctx) => {
      if (ctx.stepsCompleted.includes('scaffold_seeded')) return true;
      const repoPath = ctx.ventureRepoPath || ctx.venture?.localPath;
      if (!repoPath || !existsSync(repoPath)) return false;
      return existsSync(join(repoPath, 'CLAUDE.md'))
        && existsSync(join(repoPath, 'docs', 'build-tasks.md'))
        && existsSync(join(repoPath, '.replit'));
    },
    execute: async (ctx) => {
      const repoPath = ctx.ventureRepoPath || ctx.venture?.localPath;
      if (!repoPath || !existsSync(repoPath)) {
        ctx.log('[scaffold_seeded] No local repo path — skipping scaffold generation');
        return;
      }
      if (!ctx.venture) {
        ctx.venture = await resolveVentureMetadata(ctx.ventureId);
      }

      // Fresh read (not reused from ctx) — this step runs before 'schema_created',
      // which is the step that seeds a default stack_descriptor when none exists.
      const sb = createSupabaseServiceClient();
      const { data: vRow } = await sb
        .from('ventures')
        .select('stack_descriptor')
        .eq('id', ctx.ventureId)
        .maybeSingle();
      const stackDescriptor = (vRow?.stack_descriptor && typeof vRow.stack_descriptor === 'object')
        ? vRow.stack_descriptor
        : null;
      const scaffoldCtx = { name: ctx.venture?.name, stackDescriptor };

      const docsDir = join(repoPath, 'docs');
      if (!existsSync(docsDir)) mkdirSync(docsDir, { recursive: true });

      // CLAUDE.md and .replit are preserved if the repo already ships its own
      // (same rule seedRepo() uses for the Stitch/Lovable/Replit path); build-tasks.md
      // is always (re)written — it is a point-in-time export, not hand-tuned content.
      const claudeMdPath = join(repoPath, 'CLAUDE.md');
      if (!existsSync(claudeMdPath)) {
        writeFileSync(claudeMdPath, buildLeoBridgeClaudeMd(scaffoldCtx));
        ctx.log('[scaffold_seeded] Wrote CLAUDE.md');
      } else {
        ctx.log('[scaffold_seeded] CLAUDE.md preserved — repo shipped its own');
      }

      writeFileSync(join(docsDir, 'build-tasks.md'), buildLeoBridgeBuildTasks(scaffoldCtx));
      ctx.log('[scaffold_seeded] Wrote docs/build-tasks.md');

      const replitConfigPath = join(repoPath, '.replit');
      if (!existsSync(replitConfigPath)) {
        writeFileSync(replitConfigPath, buildReplitConfig(scaffoldCtx));
        ctx.log('[scaffold_seeded] Wrote .replit');
      } else {
        ctx.log('[scaffold_seeded] .replit preserved — repo shipped its own');
      }
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
      if (!ctx.venture) {
        ctx.log(`[registry_updated] No venture metadata for ${ctx.ventureId} — skipping`);
        return;
      }

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

      // SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 FR-2: write-through the path to the
      // authoritative DB column applications.local_path so the DB-first resolver
      // (resolveRepoPathDbFirst) and vw_venture_registry stop reading NULL. The
      // registry.json write above is the sync/fallback tier; this keeps the two in
      // lockstep. NON-FATAL: registry.json already succeeded, so a DB hiccup leaves
      // the fallback intact rather than failing provisioning (per FR-2 rollback plan).
      try {
        const sb = createSupabaseServiceClient();
        const dbLocalPath = ctx.venture.localPath.replace(/\\/g, '/');
        const { data: appRows } = await sb.from('applications').select('id, name').eq('status', 'active');
        const needle = normalizeAppName(ctx.venture.name);
        const match = (appRows || []).find((a) => normalizeAppName(a.name) === needle);
        if (match) {
          const { error: upErr } = await sb.from('applications').update({ local_path: dbLocalPath }).eq('id', match.id);
          if (upErr) ctx.log(`[registry_updated] WARN: applications.local_path write-through failed: ${upErr.message}`);
          else ctx.log(`[registry_updated] applications.local_path written for "${ctx.venture.name}" -> ${dbLocalPath}`);
        } else {
          ctx.log(`[registry_updated] WARN: no active applications row matches "${ctx.venture.name}" — DB local_path not written (registry.json updated)`);
        }
      } catch (dbErr) {
        ctx.log(`[registry_updated] WARN: applications.local_path write-through error: ${dbErr.message}`);
      }
    },
  },
  {
    name: 'schema_created',
    check: async (ctx) => ctx.stepsCompleted.includes('schema_created'),
    execute: async (ctx) => {
      if (!ctx.venture) ctx.venture = await resolveVentureMetadata(ctx.ventureId);

      // SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-B FR-2: stakes-based DB routing.
      // Read child A's stack descriptor and decide the effective DB provider.
      const sb = createSupabaseServiceClient();
      const { data: vRow, error: vErr } = await sb
        .from('ventures')
        .select('stack_descriptor')
        .eq('id', ctx.ventureId)
        .single();
      // SD-LEO-INFRA-S19-BRIDGE-UNBLOCK-SCHEMA-DRIFT-001 FR-2: the stack_descriptor column is OPTIONAL
      // (stakes-routing is a later-stage enhancement). When the column has not been migrated onto the
      // live DB yet, the select returns Postgres 42703 (undefined_column). A fail-loud throw here
      // WEDGED provisioning -> the S19 bridge mislabelled it vision_pending and hard-looped every 30s.
      // DEGRADE to the legacy no-descriptor path on 42703 instead of throwing; still fail-loud on any
      // other (genuine) read error.
      let stackDescriptorColumnAbsent = false;
      if (vErr && (vErr.code === '42703' || /column .*stack_descriptor.* does not exist/i.test(vErr.message || ''))) {
        stackDescriptorColumnAbsent = true;
        ctx.log('[schema_created] WARN: ventures.stack_descriptor column absent (unapplied migration) — DEGRADING to legacy no-descriptor path (stakes-routing skipped)');
      } else if (vErr) {
        // fail-loud: cannot read the venture row to make a DB decision.
        throw new Error(`[schema_created] cannot read ventures.stack_descriptor: ${vErr.message}`);
      }
      let descriptor = vRow?.stack_descriptor;
      let hasDescriptor = descriptor && typeof descriptor === 'object' && !Array.isArray(descriptor)
        && Object.keys(descriptor).length > 0;

      // SD-LEO-INFRA-VENTURE-CLOUDFLARE-DEFAULT-001-C (FR-3): seed the Cloudflare-default
      // stack_descriptor for a NEW venture that has none yet, so the stakes-router yields
      // D1-default→Neon-graduate automatically and the descriptor-aware writers take the
      // Cloudflare path. This is cleaner + safer than flipping deployTargetFamily()'s
      // invalid-descriptor fail-safe (which stays the genuinely-malformed guard). Skipped
      // when the column is absent (cannot persist) — that path stays legacy. Fail-soft:
      // a seed write error never breaks provisioning.
      if (!hasDescriptor && !stackDescriptorColumnAbsent) {
        const seeded = { db_provider: 'd1', deployment_target: 'cloudflare-pages', storage: 'r2' };
        const { error: seedErr } = await sb
          .from('ventures')
          .update({ stack_descriptor: seeded })
          .eq('id', ctx.ventureId);
        if (seedErr) {
          ctx.log(`[schema_created] WARN: failed to seed default Cloudflare stack_descriptor: ${seedErr.message} — falling back to legacy path`);
        } else {
          descriptor = seeded;
          hasDescriptor = true;
          ctx.log('[schema_created] Seeded default Cloudflare stack_descriptor {d1, cloudflare-pages, r2} (D1-default→Neon-graduate)');
        }
      }

      if (!hasDescriptor) {
        // Backward-compat: legacy ventures predate the Cloudflare retarget. Stakes-
        // routing requires A's descriptor; without one, retain the legacy
        // consolidated-DB path. Logged LOUDLY — never a silent skip.
        ctx.log('[schema_created] WARN: no stack_descriptor on venture — stakes-routing SKIPPED; using legacy consolidated DB pattern');
        ctx.log(`[schema_created] Venture ${ctx.venture?.repoName || ctx.ventureId} will use EHG_Engineer Supabase until production`);
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
        return;
      }

      // Descriptor present: route via the stakes-router (THROWS fail-loud on a
      // malformed descriptor — a wrong DB decision is a stakes/cost/data error).
      const route = routeDbProvider(descriptor);
      ctx.log(`[schema_created] stakes-router → ${route.provider} (${route.reason})`);

      // Record the routed provider + a per-venture secret REFERENCE (never a
      // literal credential — the actual secret lives in venture_db_secrets, FR-4,
      // and the real D1/Neon resource provisioning is performed by sibling D).
      const connection = {
        provider: route.provider,
        triggers_fired: route.triggersFired,
        secret_ref: `venture_db_secrets:${ctx.ventureId}`,
        routed_at: new Date().toISOString(),
      };
      const nextDescriptor = { ...descriptor, connection };
      const { error: upErr } = await sb
        .from('ventures')
        .update({ stack_descriptor: nextDescriptor })
        .eq('id', ctx.ventureId);
      if (upErr) {
        throw new Error(`[schema_created] failed to write stack_descriptor.connection: ${upErr.message}`);
      }
      ctx.log(`[schema_created] wrote stack_descriptor.connection (provider=${route.provider}, secret_ref set, per-venture isolated)`);
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
      if (!ctx.venture) {
        ctx.log(`[monitoring_baseline] No venture metadata for ${ctx.ventureId} — skipping`);
        return;
      }

      ctx.log('[monitoring_baseline] Configuring Sentry monitoring baseline...');

      const supabase = createSupabaseServiceClient();
      const { data: current } = await supabase
        .from('ventures')
        .select('metadata')
        .eq('id', ctx.ventureId)
        .single();

      const existingMetadata = current?.metadata || {};
      const sentryOrg = process.env.SENTRY_ORG || 'ehg-3v';
      const sentryToken = process.env.SENTRY_AUTH_TOKEN;
      const sentryBaseUrl = process.env.SENTRY_BASE_URL || 'https://de.sentry.io';
      const projectSlug = ctx.venture.repoName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

      // Attempt auto-creation of Sentry project via API
      let sentryDsn = null;
      if (sentryToken) {
        try {
          // List teams to find the default team
          const teamsRes = await fetch(`${sentryBaseUrl}/api/0/organizations/${sentryOrg}/teams/`, {
            headers: { 'Authorization': `Bearer ${sentryToken}` },
            signal: AbortSignal.timeout(10000)
          });

          let teamSlug = sentryOrg; // fallback
          if (teamsRes.ok) {
            const teams = await teamsRes.json();
            if (teams.length > 0) teamSlug = teams[0].slug;
          }

          // Create Sentry project
          const createRes = await fetch(`${sentryBaseUrl}/api/0/teams/${sentryOrg}/${teamSlug}/projects/`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${sentryToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: ctx.venture.repoName, slug: projectSlug, platform: 'node' }),
            signal: AbortSignal.timeout(10000)
          });

          if (createRes.ok) {
            const project = await createRes.json();
            // Fetch DSN from project keys
            const keysRes = await fetch(`${sentryBaseUrl}/api/0/projects/${sentryOrg}/${projectSlug}/keys/`, {
              headers: { 'Authorization': `Bearer ${sentryToken}` },
              signal: AbortSignal.timeout(10000)
            });
            if (keysRes.ok) {
              const keys = await keysRes.json();
              sentryDsn = keys[0]?.dsn?.public || null;
            }
            ctx.log(`[monitoring_baseline] Sentry project created: ${projectSlug}`);
            if (sentryDsn) ctx.log(`[monitoring_baseline] DSN obtained: ${sentryDsn.slice(0, 30)}...`);
          } else if (createRes.status === 409) {
            // Project already exists — fetch its DSN
            ctx.log(`[monitoring_baseline] Sentry project already exists: ${projectSlug}`);
            const keysRes = await fetch(`${sentryBaseUrl}/api/0/projects/${sentryOrg}/${projectSlug}/keys/`, {
              headers: { 'Authorization': `Bearer ${sentryToken}` },
              signal: AbortSignal.timeout(10000)
            });
            if (keysRes.ok) {
              const keys = await keysRes.json();
              sentryDsn = keys[0]?.dsn?.public || null;
            }
          } else {
            const errBody = await createRes.text();
            ctx.log(`[monitoring_baseline] Sentry project creation failed (${createRes.status}): ${errBody.slice(0, 200)}`);
            ctx.log('[monitoring_baseline] Sentry project creation failed — check SENTRY_AUTH_TOKEN has project:write scope');
          }
        } catch (err) {
          ctx.log(`[monitoring_baseline] Sentry API error: ${err.message}`);
        }
      }

      const sentryConfig = existingMetadata.sentry || {
        org: sentryOrg,
        project: projectSlug,
        token: sentryToken,
        baseUrl: sentryBaseUrl,
        dsn: sentryDsn,
        lastPollAt: null
      };
      // Update DSN if we just obtained it
      if (sentryDsn && !sentryConfig.dsn) sentryConfig.dsn = sentryDsn;

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

      // Also store VITE_SENTRY_DSN for Vite/React ventures (harmless for non-Vite)
      if (sentryDsn) {
        sentryConfig.vite_dsn = sentryDsn;
        ctx.log('[monitoring_baseline] VITE_SENTRY_DSN provisioned for client-side Vite apps');
      }

      ctx.log(`[monitoring_baseline] Sentry config registered for ${ctx.venture.repoName}`);
      ctx.log('[monitoring_baseline] Guardrail state initialized');
      if (!sentryDsn) ctx.log('[monitoring_baseline] Warning: DSN not obtained — Sentry project may need investigation');
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
