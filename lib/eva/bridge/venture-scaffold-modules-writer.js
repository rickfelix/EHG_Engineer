/**
 * Venture Scaffold Modules Writer
 * SD-LEO-INFRA-VENTURE-SCAFFOLD-CODE-001 (FR-2/FR-3)
 *
 * One pure content-generation function (templates/venture-scaffold/scaffold.js's
 * MODULE_REGISTRY) plus one thin write adapter here, called from BOTH provisioning
 * entry points: leo_bridge's provisionVenture() DEFAULT_STEPS ('scaffold_modules_stamped'
 * step in venture-provisioner.js) and seeded_repo's seedRepo() (replit-repo-seeder.js,
 * before its git add/commit/push). Mirrors the "one write path, two callers" precedent
 * already established by ensureLeoBridgeScaffold() (leo-bridge-scaffold-writer.js).
 *
 * repoPath must already exist on disk as a git clone -- true for both the leo_bridge
 * persistent clone and seedRepo()'s ephemeral clone at the point this is called.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { MODULE_REGISTRY } from '../../../templates/venture-scaffold/scaffold.js';

// The 3 new modules this SD adds. testing/ci-cd remain CLI-only (their own SD's
// scope, SD-LEO-TESTING-STRATEGY-REDESIGN-ORCH-001-E) -- not auto-stamped here to
// avoid introducing a new mandatory Playwright dependency into every future venture
// and to avoid any collision risk with a venture's own tests/ or CI setup.
export const DEFAULT_SCAFFOLD_MODULES = ['deploy', 'stack-scan', 'feedback'];

export function manifestPathFor(repoPath) {
  return join(repoPath, 'scaffold-manifest.json');
}

/**
 * FR-3 build-gate predicate. Modeled on scripts/check-claude-md-drift.cjs's
 * existsSync-based no_manifest/bad_manifest hard-block pattern (an explicit hard
 * check, NOT the 80%-score-thresholded conformance gate, which could stay green
 * on a manifest-absent repo) -- shared by both entry points and by
 * applyVentureScaffoldModules()'s own post-write self-verification.
 * @param {string} repoPath
 * @returns {{ok: boolean, reason?: string, manifestPath: string, manifest?: object}}
 */
export function checkScaffoldManifest(repoPath) {
  const manifestPath = manifestPathFor(repoPath);
  if (!existsSync(manifestPath)) {
    return { ok: false, reason: 'scaffold-manifest.json missing', manifestPath };
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch {
    return { ok: false, reason: 'scaffold-manifest.json unparseable', manifestPath };
  }
  if (!manifest.generated_at || !Array.isArray(manifest.modules) || manifest.modules.length === 0) {
    return { ok: false, reason: 'scaffold-manifest.json missing generated_at or modules[]', manifestPath, manifest };
  }
  return { ok: true, manifestPath, manifest };
}

/**
 * Stamp the given MODULE_REGISTRY modules (default: deploy/stack-scan/feedback) into
 * repoPath, then write the FR-3 manifest naming each stamped module + its pinned
 * version + generated_at, in this SAME call. Throws (fails loud) if the manifest
 * doesn't verify immediately after write, rather than silently leaving a broken
 * manifest that only surfaces later.
 * @param {string} ventureName
 * @param {string} repoPath - absolute path to an existing git clone
 * @param {object} [opts]
 * @param {string[]} [opts.modules]
 * @param {object} [opts.moduleOptions] - forwarded to each module's generate()
 * @param {(msg: string) => void} [opts.logger]
 * @returns {{written: string[], stamped: {module: string, version: string}[], manifestPath: string}}
 */
export function applyVentureScaffoldModules(ventureName, repoPath, opts = {}) {
  const modules = opts.modules || DEFAULT_SCAFFOLD_MODULES;
  const log = opts.logger || (() => {});
  const written = [];
  const stamped = [];

  for (const key of modules) {
    const mod = MODULE_REGISTRY[key];
    if (!mod) {
      log(`[scaffold_modules] Unknown module: ${key} (skipping)`);
      continue;
    }
    const files = mod.generate(ventureName, repoPath, opts.moduleOptions || {});
    for (const file of files) {
      const dir = dirname(file.path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(file.path, file.content, 'utf-8');
      written.push(file.path);
    }
    stamped.push({ module: key, version: mod.version });
  }

  const manifestPath = manifestPathFor(repoPath);
  const manifest = { generated_at: new Date().toISOString(), modules: stamped };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  written.push(manifestPath);

  const verdict = checkScaffoldManifest(repoPath);
  if (!verdict.ok) {
    throw new Error(`[scaffold_modules] manifest self-check failed immediately after write: ${verdict.reason}`);
  }

  log(`[scaffold_modules] Stamped ${stamped.length} modules, ${written.length} files, manifest at ${manifestPath}`);
  return { written, stamped, manifestPath };
}
