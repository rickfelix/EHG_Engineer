/**
 * PRESERVE stage (SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001, FR-1a).
 *
 * A hard_keep-matched worktree (unpushed commits, dirty tracked files, a lock, or a
 * resident session -- lib/worktree-reaper/detectors.js hasHardKeep) is currently kept
 * FOREVER with no further disposition, even once its owner is dead. PRESERVE pushes
 * that content to a NEW origin ref before any removal is considered -- never destructive,
 * never a force-push, never onto the tree's own branch (a re-claim after restart may
 * already own that branch name on origin).
 *
 * Eligibility is intentionally WIDE (holder released, holder's tool clock frozen, or no
 * holder record at all) because the action itself is safe: worst case, a live owner's
 * tree gets pushed to a throwaway ref it never asked for, which costs nothing and blocks
 * nothing. RECLAIM (FR-1b, a later phase) is the narrow, destructive stage that actually
 * frees the slot.
 */
import { execFileSync } from 'node:child_process';
import { checkCriticalFindings } from '../ship/review-gate.js';
import { isKnownWedged } from '../fleet/genuine-worker.mjs';

/** Freeze-cut for PRESERVE eligibility. Deliberately narrower than RECLAIM's
 *  FREEZE_CUT_MINUTES (lib/fleet/genuine-worker.mjs, default 120min) -- PRESERVE is
 *  non-destructive, so it can afford to act sooner on a merely-stalled owner. */
export const PRESERVE_FREEZE_CUT_MINUTES = 30;

export const PRESERVE_VERDICT = Object.freeze({
  PUSHED: 'preserve_pushed',
  HELD_SECRET: 'preserve_held_secret',
  PUSH_FAILED: 'preserve_push_failed',
  VERIFY_FAILED: 'preserve_verify_failed',
});

/**
 * Pure: is this tree's owner dead enough to preserve? ANY of: no holder record, the
 * holder released its claim, or the holder's tool clock is frozen past the cut.
 * Reuses lib/fleet/genuine-worker.mjs's isKnownWedged (the existing last_tool_at
 * discriminant) rather than adding a new one -- see that module's own header on why a
 * sixth discriminant would be exactly the drift it exists to prevent.
 * @param {object|null} holder - a claude_sessions row, or null if none found
 * @param {number} [nowMs]
 * @param {number} [freezeCutMinutes]
 * @returns {{eligible: boolean, reason: string}}
 */
export function evaluatePreserveEligibility(holder, nowMs = Date.now(), freezeCutMinutes = PRESERVE_FREEZE_CUT_MINUTES) {
  if (!holder) return { eligible: true, reason: 'no_holder' };
  if (holder.released_at) return { eligible: true, reason: 'holder_released' };
  if (isKnownWedged(holder, nowMs, freezeCutMinutes)) return { eligible: true, reason: 'holder_frozen' };
  return { eligible: false, reason: 'holder_live' };
}

/**
 * Best-effort holder lookup by exact worktree_path match. FAILS OPEN (returns null on
 * any error) deliberately -- unlike the destructive removal-path guards elsewhere in
 * this package, an unknown holder here just means "treat as eligible", and PRESERVE's
 * own worst case (pushing a live owner's tree to a throwaway ref) is harmless.
 * @param {object|null} supabase
 * @param {string} wtPath
 * @param {{logger?: Function}} [opts]
 * @returns {Promise<object|null>}
 */
export async function findHolderSession(supabase, wtPath, opts = {}) {
  const { logger = () => {} } = opts;
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('session_id, released_at, last_tool_at, loop_state, metadata, heartbeat_at, worktree_path')
      .eq('worktree_path', wtPath)
      .order('heartbeat_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return data && data[0] ? data[0] : null;
  } catch (e) {
    logger(`[preserve-stage] holder lookup failed for ${wtPath} (${e?.message}) -- treating as no_holder`);
    return null;
  }
}

/** Pure: UTC timestamp token safe for a git ref segment (no ':' or '.'). */
export function preserveTimestamp(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().replace(/[:.]/g, '-');
}

/** Pure: the recovery ref name. Never the tree's own branch. */
export function buildPreserveRefName(key, utcTs) {
  return `wip/reclaim/${key}/${utcTs}`;
}

/** Wraps the /ship review gate's secret scanner, filtered to CRIT-001 only (per FR-1a --
 *  the wholesale `found` flag is too broad for this narrower use). */
export function scanStagedDiffForSecrets(diffContent) {
  const { findings } = checkCriticalFindings(diffContent || '');
  const crit001 = findings.filter((f) => f.id === 'CRIT-001');
  return { held: crit001.length > 0, findings: crit001 };
}

function defaultGitRunner(args, cwd) {
  try {
    const out = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout: out, stderr: '' };
  } catch (e) {
    return { code: typeof e?.status === 'number' ? e.status : 1, stdout: e?.stdout || '', stderr: e?.stderr || String(e?.message || e) };
  }
}

/**
 * Run the 6-step PRESERVE action for one eligible tree. Aborts untouched at the first
 * failure. Never `git add -A` (ignored files, e.g. .env snapshots, are excluded by
 * construction); never `--force` push; never commits or pushes onto the tree's own
 * branch.
 * @param {{wtPath: string, key: string, ownerSessionId: string|null}} target
 * @param {{gitRunner?: Function, nowMs?: number, logger?: Function}} [opts]
 * @returns {Promise<{verdict: string, ref: string|null, sha: string|null, pushed: boolean, findings?: Array, error?: string}>}
 */
export async function runPreserveStage({ wtPath, key, ownerSessionId }, opts = {}) {
  const { gitRunner = defaultGitRunner, nowMs = Date.now(), logger = () => {} } = opts;
  const ts = preserveTimestamp(nowMs);
  const ref = buildPreserveRefName(key, ts);
  const run = (args) => gitRunner(args, wtPath);

  // 1. Stage: tracked modifications, plus an EXPLICIT list of untracked non-ignored
  // files -- never `git add -A`.
  run(['add', '-u']);
  const untracked = run(['ls-files', '--others', '--exclude-standard']);
  const untrackedFiles = String(untracked.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (untrackedFiles.length > 0) run(['add', '--', ...untrackedFiles]);

  const stagedProbe = run(['diff', '--cached', '--quiet']);
  const hasStagedChanges = stagedProbe.code !== 0;

  if (hasStagedChanges) {
    // 2. Secret scan over the staged diff -- a hit holds the tree and never pushes.
    const diff = run(['diff', '--cached']);
    const scan = scanStagedDiffForSecrets(diff.stdout);
    if (scan.held) {
      run(['reset']); // leave the tree exactly as found -- never push a secret hit.
      return { verdict: PRESERVE_VERDICT.HELD_SECRET, ref: null, sha: null, pushed: false, findings: scan.findings };
    }

    // 3. Commit, with owner session + worktree path as trailers.
    const message = [
      `wip(reaper-preserve): ${key} ${ts}`,
      '',
      `Reaper-Preserve-Owner-Session: ${ownerSessionId || 'unknown'}`,
      `Reaper-Preserve-Worktree-Path: ${wtPath}`,
    ].join('\n');
    const commit = run(['commit', '-m', message]);
    if (commit.code !== 0) {
      logger(`[preserve-stage] commit failed for ${wtPath}: ${commit.stderr || commit.stdout}`);
      return { verdict: PRESERVE_VERDICT.PUSH_FAILED, ref: null, sha: null, pushed: false, error: commit.stderr || 'commit_failed' };
    }
  }

  // 4. Push (never --force) to the NEW ref.
  const push = run(['push', 'origin', `HEAD:refs/heads/${ref}`]);
  if (push.code !== 0) {
    logger(`[preserve-stage] push failed for ${wtPath} -> ${ref}: ${push.stderr || push.stdout}`);
    return { verdict: PRESERVE_VERDICT.PUSH_FAILED, ref, sha: null, pushed: false, error: push.stderr || push.stdout || 'push_failed' };
  }

  // 5. Verify: the pushed ref's remote sha equals local HEAD.
  const headRes = run(['rev-parse', 'HEAD']);
  const localSha = String(headRes.stdout || '').trim();
  const remoteRes = run(['ls-remote', 'origin', `refs/heads/${ref}`]);
  const remoteSha = String(remoteRes.stdout || '').trim().split(/\s+/)[0] || null;
  if (!remoteSha || remoteSha !== localSha) {
    logger(`[preserve-stage] verify mismatch for ${wtPath} -> ${ref}: local=${localSha} remote=${remoteSha}`);
    return { verdict: PRESERVE_VERDICT.VERIFY_FAILED, ref, sha: localSha, pushed: true, error: 'ls_remote_sha_mismatch' };
  }

  return { verdict: PRESERVE_VERDICT.PUSHED, ref, sha: localSha, pushed: true };
}

const MAX_APPEND_RETRIES = 5;

/**
 * Append-only, concurrency-safe recovery-pointer write to the owning row's
 * metadata.reaper_preserved[] (FR-1a step 6). Optimistic-concurrency retry keyed on
 * `updated_at` (the "read-modify-write with retry" option FR-1a's description names as
 * an alternative to a dedicated RPC) -- never a blind overwrite of the whole metadata
 * column, since that would lose a concurrent writer's changes outright.
 *
 * quick_fixes has NO metadata column today (confirmed against
 * database/schema-reference-snapshot.json -- a discrepancy from the PRD's stated
 * "existing ... metadata JSONB column", signaled to the coordinator as prd-ambiguous).
 * For a QF-owned tree this is a no-op by design: the audit_log row (FR-3) remains the
 * sole, authoritative recovery record, matching this SD's own metadata-race risk
 * mitigation ("a lost metadata pointer degrades convenience, not data safety").
 * @param {object|null} supabase
 * @param {{key: string, isQf: boolean}} owner
 * @param {object} pointer - {ref, sha, worktree_path, owner_session, preserved_at, contains_migration_files}
 * @param {{logger?: Function}} [opts]
 */
export async function appendReaperPreservedPointer(supabase, { key, isQf }, pointer, opts = {}) {
  const { logger = () => {} } = opts;
  if (isQf) {
    logger(`[preserve-stage] quick_fixes has no metadata column -- skipping row-level pointer for ${key}, audit_log remains authoritative`);
    return { ok: false, skipped: true, reason: 'quick_fixes_no_metadata_column' };
  }
  if (!supabase) return { ok: false, skipped: true, reason: 'no_supabase_client' };

  for (let attempt = 0; attempt < MAX_APPEND_RETRIES; attempt++) {
    const { data: row, error: readError } = await supabase
      .from('strategic_directives_v2')
      .select('id, metadata, updated_at')
      .eq('sd_key', key)
      .single();
    if (readError || !row) {
      logger(`[preserve-stage] metadata read failed for ${key}: ${readError?.message || 'no row'}`);
      return { ok: false, error: readError?.message || 'no_row' };
    }
    const existing = Array.isArray(row.metadata?.reaper_preserved) ? row.metadata.reaper_preserved : [];
    const nextMetadata = { ...(row.metadata || {}), reaper_preserved: [...existing, pointer] };
    const { data: updated, error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata: nextMetadata })
      .eq('id', row.id)
      .eq('updated_at', row.updated_at)
      .select('id');
    if (!updateError && updated && updated.length > 0) {
      return { ok: true, attempt };
    }
    if (updateError) logger(`[preserve-stage] metadata update attempt ${attempt} failed for ${key}: ${updateError.message}`);
  }
  return { ok: false, error: 'max_retries_exceeded' };
}

export default {
  PRESERVE_FREEZE_CUT_MINUTES,
  PRESERVE_VERDICT,
  evaluatePreserveEligibility,
  findHolderSession,
  preserveTimestamp,
  buildPreserveRefName,
  scanStagedDiffForSecrets,
  runPreserveStage,
  appendReaperPreservedPointer,
};
