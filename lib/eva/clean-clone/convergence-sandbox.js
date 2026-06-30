/**
 * SD-LEO-INFRA-CONVERGENCE-SUBJECT-LIFECYCLE-001-B — convergence SANDBOX GITHUB REPO lifecycle +
 * DETERMINISTIC TEARDOWN for the throwaway "convergence subject" sibling Child A creates via
 * launchNonCloneDummy. This module provisions a PRIVATE sandbox repo (recording its identity on the
 * convergence ledger run's sandbox_repo column) and tears it down deterministically/idempotently.
 *
 * Every irreversible gh operation goes through an INJECTABLE `run` exec seam (deps.run, default
 * execFileSync — NEVER a shell), mirroring lib/eva/bridge/ensure-venture-clone.js, so unit tests inject
 * a spy and real gh is NEVER called in CI. The destructive guards are REUSED from lib/deleteVentureFully.js
 * (parseRepoSlug / isProtectedRepo / PROTECTED_REPOS) so the protected-set + injection-safe slug regex
 * have a single source of truth and cannot drift.
 */
import { execFileSync } from 'child_process';
import { parseRepoSlug, isProtectedRepo } from '../../deleteVentureFully.js';
import { startRun, getActiveRun, endRun } from '../../coordinator/convergence-ledger.js';

const GH_TIMEOUT_MS = 30000;
const REPO_VISIBILITY = '--private'; // fixed — a convergence sandbox repo is NEVER public

/** Default exec seam: execFileSync (no shell), matching ensure-venture-clone.js. */
const defaultRun = (cmd, args) => execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', timeout: GH_TIMEOUT_MS });

/** A gh/git result is "already gone" when the repo does not exist (idempotent teardown -> success). */
function isAlreadyGone(err) {
  const msg = String((err && (err.stderr || err.message)) || err || '').toLowerCase();
  return err?.code === 'ENOENT'
    || msg.includes('not found')
    || msg.includes('could not resolve')
    || msg.includes('does not exist')
    || msg.includes('no such repository');
}

/**
 * FR-1: provision a PRIVATE sandbox repo for the convergence subject and record it on the ledger.
 * @param {{ventureId?:string, repoName?:string, slug?:string, dryRun?:boolean}} params
 * @param {{run?:Function, log?:Function, supabase?:object}} deps
 * @returns {Promise<{ok:boolean, stage:string, dryRun:boolean, slug?:string, runId?:string, reason?:string}>}
 */
export async function provisionSandboxRepo(params = {}, deps = {}) {
  const { ventureId = null, repoName = null, slug: explicitSlug = null, dryRun = true } = params;
  const run = deps.run || defaultRun;
  const log = deps.log || (() => {});
  const supabase = deps.supabase || null;

  // Resolve + validate the owner/repo slug via the canonical guard (reused, never re-declared).
  const rawSlug = explicitSlug || repoName;
  const { slug, valid } = parseRepoSlug(rawSlug || '');
  if (!valid) {
    log(`provision refused: invalid slug ${JSON.stringify(rawSlug)}`);
    return { ok: false, stage: 'validate_slug', dryRun, reason: 'invalid_slug' };
  }
  // A provision must NEVER target a protected repo (defense-in-depth; a sandbox is always throwaway).
  if (isProtectedRepo(slug)) {
    log(`provision refused: protected repo ${slug}`);
    return { ok: false, stage: 'guard_refused', dryRun, slug, reason: 'protected_repo' };
  }

  if (dryRun) {
    log(`[dry-run] would create private sandbox repo ${slug}`);
    return { ok: true, stage: 'provisioned', dryRun: true, slug };
  }

  run('gh', ['repo', 'create', slug, REPO_VISIBILITY, '--description', `convergence sandbox (${ventureId || 'subject'})`]);
  log(`created private sandbox repo ${slug}`);

  // Record the sandbox repo identity on the convergence ledger so deterministic teardown can find it.
  let runId;
  if (supabase) {
    const started = await startRun(supabase, { subject_venture_id: ventureId, dummy_kind: 'non_clone', sandbox_repo: slug });
    runId = started.run_id;
  }
  return { ok: true, stage: 'provisioned', dryRun: false, slug, runId };
}

/**
 * FR-2: deterministically + idempotently tear down the convergence sandbox repo.
 * Resolves the slug from params or the active ledger run, HARD-GUARDS against protected/malformed slugs
 * (fail-loud, no delete), deletes via the injected run, classifies already-gone as success, closes the run.
 * @param {{ventureId?:string, repoSlug?:string, dryRun?:boolean}} params
 * @param {{run?:Function, log?:Function, supabase?:object}} deps
 * @returns {Promise<{ok:boolean, stage:string, dryRun:boolean, slug?:string, reason?:string}>}
 */
export async function teardownSandboxRepo(params = {}, deps = {}) {
  const { repoSlug = null, dryRun = true } = params;
  const run = deps.run || defaultRun;
  const log = deps.log || (() => {});
  const supabase = deps.supabase || null;

  // Resolve the slug: explicit param wins, else read sandbox_repo off the active ledger run.
  let rawSlug = repoSlug;
  let activeRun = null;
  if (!rawSlug && supabase) {
    activeRun = await getActiveRun(supabase);
    rawSlug = activeRun && activeRun.sandbox_repo;
  }
  if (!rawSlug) {
    log('teardown skipped: no sandbox repo on the active run');
    return { ok: false, stage: 'no_sandbox', dryRun, reason: 'no_sandbox_repo' };
  }

  // HARD GUARD (fail-loud, NO delete): a malformed/unsafe slug or a protected repo must never be deleted.
  const { slug, valid } = parseRepoSlug(rawSlug);
  if (!valid) {
    log(`teardown REFUSED: invalid/unsafe slug ${JSON.stringify(rawSlug)}`);
    return { ok: false, stage: 'guard_refused', dryRun, reason: 'invalid_slug' };
  }
  if (isProtectedRepo(slug)) {
    log(`teardown REFUSED: protected repo ${slug}`);
    return { ok: false, stage: 'guard_refused', dryRun, slug, reason: 'protected_repo' };
  }

  if (dryRun) {
    log(`[dry-run] would delete sandbox repo ${slug}`);
    return { ok: true, stage: 'torn_down', dryRun: true, slug };
  }

  let stage = 'torn_down';
  try {
    run('gh', ['repo', 'delete', '--yes', '--', slug]);
    log(`deleted sandbox repo ${slug}`);
  } catch (err) {
    if (isAlreadyGone(err)) {
      stage = 'already_gone'; // idempotent: an already-deleted repo is a successful teardown
      log(`sandbox repo ${slug} already gone (idempotent success)`);
    } else {
      log(`teardown FAILED for ${slug}: ${err && err.message}`);
      return { ok: false, stage: 'delete_failed', dryRun: false, slug, reason: (err && err.message) || 'delete_failed' };
    }
  }

  // Close the ledger run (the sandbox is gone; the run is complete).
  if (supabase) {
    const runId = activeRun ? activeRun.run_id : (await getActiveRun(supabase))?.run_id;
    if (runId) await endRun(supabase, runId, 'clean');
  }
  return { ok: true, stage, dryRun: false, slug };
}

export default { provisionSandboxRepo, teardownSandboxRepo };
