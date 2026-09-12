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
import fs from 'node:fs';
import path from 'node:path';
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
  const { logger = () => {}, key = null } = opts;
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('session_id, released_at, last_tool_at, loop_state, metadata, heartbeat_at, worktree_path')
      .eq('worktree_path', wtPath)
      .order('heartbeat_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    if (data && data[0]) return data[0];
  } catch (e) {
    logger(`[preserve-stage] holder lookup failed for ${wtPath} (${e?.message}) -- treating as no_holder`);
    return null;
  }

  // QF-20260904-596: worktree_path is an EXACT-match column. A tree reused via the
  // slot-free reuse path (a new branch checked out inside an old, differently-named
  // worktree directory -- e.g. a completed QF's directory reused for an unrelated
  // SD's branch) has a claude_sessions.worktree_path that no longer matches its
  // actual filesystem path, so the lookup above misses a genuinely live holder and
  // this incorrectly falls through to no_holder. Fall back to the claim keyed on the
  // tree's OWN checked-out branch -- `key` here is the SAME branch-derived key the
  // caller already computes (worktree-reaper.mjs's keyFromWorktree(): prefers the
  // checked-out branch's feat|qf|fix|chore|hotfix/<KEY> pattern, falling back to the
  // directory basename only when the branch doesn't match) -- before concluding
  // no_holder. A tree whose branch key has a live claim is a HOLDER, never no_holder.
  if (!key) return null;
  try {
    const isQf = key.startsWith('QF-');
    const table = isQf ? 'quick_fixes' : 'strategic_directives_v2';
    const keyCol = isQf ? 'id' : 'sd_key';
    const { data: row, error } = await supabase
      .from(table)
      .select('claiming_session_id')
      .eq(keyCol, key)
      .maybeSingle();
    if (error || !row?.claiming_session_id) return null;
    const { data: sessionRows, error: sErr } = await supabase
      .from('claude_sessions')
      .select('session_id, released_at, last_tool_at, loop_state, metadata, heartbeat_at, worktree_path')
      .eq('session_id', row.claiming_session_id)
      .limit(1);
    if (sErr) throw sErr;
    return sessionRows && sessionRows[0] ? sessionRows[0] : null;
  } catch (e) {
    logger(`[preserve-stage] branch-derived holder fallback failed for key=${key} (${e?.message}) -- treating as no_holder`);
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

/**
 * QF-20260911-379: per-host identity/state files the preserve must NEVER stage, even when a
 * repo's .gitignore does not (yet) list them -- the reaper pushed .account-identity-last.json
 * (account email, org name, OS username) to three PUBLIC wip/reclaim refs on 2026-09-06/07.
 * Matched against each untracked path ls-files returns, by path segment, case-insensitive.
 */
export const PRESERVE_UNTRACKED_DENYLIST = Object.freeze([
  /(^|\/)[^/]*account-identity[^/]*$/i,
  /(^|\/)[^/]*identity-last[^/]*$/i,
  /(^|\/)\.env(\.[^/]*)?$/i,
  /\.(pem|key|p12|pfx|ppk)$/i,
  /(^|\/)\.(ehg|claude)-session[^/]*\.json$/i,
  /(^|\/)[^/]*(host|machine)-state[^/]*\.json$/i,
]);

export function isDenylistedUntrackedPath(p) {
  const norm = String(p || '').replace(/\\/g, '/');
  if (/[.-](example|template)$/i.test(norm)) return false; // placeholder files (.env.example, .env.project-template) -- same exception as .gitignore
  return PRESERVE_UNTRACKED_DENYLIST.some((re) => re.test(norm));
}

/** QF-20260911-379 (b): identity-shaped PII the CRIT-001 key scanner never classified. Checked on
 *  ADDED lines only. Fail-closed: a hit HOLDS the preserve exactly like a key hit.
 *  QF-20260912-495 adds DB-CONN-STRING: a live DB connection string with an embedded
 *  username/password (mirrors .husky/pre-commit's own SECRET_PATTERNS entry exactly,
 *  see that file's own connection-string pattern) -- test-evidence JSON
 *  files print these from the environment, which this scanner never classified either,
 *  so a matching file passed this check and then failed husky's hook at the commit step. */
const PII_HOLD_PATTERNS = Object.freeze([
  { id: 'PII-EMAIL', name: 'email_address', re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { id: 'PII-HOST-IDENTITY', name: 'host_identity_field',
    re: /"(?:os_?user(?:name)?|user_?name|host_?name|account_?email|org_?name)"\s*:\s*"[^"<>]+"/i },
  { id: 'DB-CONN-STRING', name: 'db_connection_string_with_password', re: /postgresql:\/\/[^:]+:[^@]+@/i },
]);

/** Wraps the /ship review gate's secret scanner, filtered to CRIT-001 only (per FR-1a --
 *  the wholesale `found` flag is too broad for this narrower use), plus the PII hold classes. */
export function scanStagedDiffForSecrets(diffContent) {
  const { findings } = checkCriticalFindings(diffContent || '');
  const held = findings.filter((f) => f.id === 'CRIT-001');
  const added = String(diffContent || '').split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  for (const p of PII_HOLD_PATTERNS) {
    const n = added.filter((l) => p.re.test(l)).length; // category only, never the excerpt
    if (n > 0) held.push({ id: p.id, name: p.name, matches: Array(n).fill(`Line match: ${p.name} pattern detected`) });
  }
  return { held: held.length > 0, findings: held };
}

/**
 * Split a `git diff --cached` (always a plain two-way diff against the index -- never
 * a combined/merge-commit diff, so no width tracking is needed here) into per-file
 * segments on `diff --git a/... b/...` boundaries.
 * @param {string} diffContent
 * @returns {Array<{path: string, body: string}>}
 */
export function splitCachedDiffByFile(diffContent) {
  const segments = [];
  let currentPath = null;
  let body = [];
  const flush = () => { if (currentPath) segments.push({ path: currentPath, body: body.join('\n') }); };
  for (const line of String(diffContent || '').split('\n')) {
    const header = line.match(/^diff --git a\/.+ b\/([^\r\n]+)/);
    if (header) { flush(); currentPath = header[1]; body = []; continue; }
    if (currentPath) body.push(line);
  }
  flush();
  // No `diff --git` header found at all (e.g. test fixtures that pass a bare content
  // snippet) -- fall back to ONE unpathed segment rather than silently scanning zero
  // files, matching lib/ship/review-gate.js's splitDiffByFile's own fallback convention.
  return segments.length ? segments : [{ path: null, body: String(diffContent || '') }];
}

/**
 * Per-file secret/credential scan over a staged diff (QF-20260912-495). The prior
 * whole-diff scanStagedDiffForSecrets() call held the ENTIRE tree on one matching
 * file, even when every other staged file was clean. Splits on file boundaries
 * (reusing scanStagedDiffForSecrets unchanged, once per file) so only the actual
 * matching file(s) need withholding.
 * @param {string} cachedDiff - `git diff --cached` output (the whole staged set)
 * @returns {Array<{path: string, held: boolean, findings: Array}>}
 */
export function scanStagedFilesForSecrets(cachedDiff) {
  return splitCachedDiffByFile(cachedDiff).map((seg) => {
    const { held, findings } = scanStagedDiffForSecrets(seg.body);
    return { path: seg.path, held, findings };
  });
}

/**
 * Move each held file's CURRENT working-tree content to the reaper audit sink
 * (mirrors scripts/worktree-reaper.mjs's own preserveUntrackedFiles naming
 * convention: scratch/preserved-from-<basename>/), mode 600, never a branch --
 * then delete it from the tree so it no longer reads dirty. All-or-nothing: if
 * relocating any file fails, the caller falls back to holding the whole tree
 * (never risks committing a secret that could not be safely moved aside).
 * @returns {{withheld: Array<{path, pattern}>, failed: Array<string>}}
 */
export function withholdMatchedFiles({ wtPath, heldFiles, repoRoot, ts, logger = () => {} }) {
  const basename = path.basename(wtPath);
  const sinkDir = path.join(repoRoot, 'scratch', `preserved-from-${basename}`, 'withheld', ts);
  const withheld = [];
  const failed = [];
  for (const f of heldFiles) {
    if (!f.path) {
      // No file boundary could be identified (e.g. a diff fixture/shape without a
      // `diff --git` header) -- cannot relocate a file we cannot name. Fail-closed.
      logger('[preserve-stage] held content with no identifiable file path -- falling back to whole-tree hold');
      failed.push(String(f.path));
      continue;
    }
    const src = path.join(wtPath, f.path);
    const dest = path.join(sinkDir, f.path);
    const pattern = f.findings.map((x) => x.name).join(',');
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      try { fs.chmodSync(dest, 0o600); } catch { /* best-effort -- not all platforms honor unix modes */ }
      fs.rmSync(src, { force: true });
      withheld.push({ path: f.path, pattern });
      logger(`[preserve-stage] withheld ${f.path} (matched: ${pattern}) -> ${dest}`);
    } catch (e) {
      logger(`[preserve-stage] withhold FAILED for ${f.path} (${e?.message || e}) -- falling back to whole-tree hold`);
      failed.push(f.path);
    }
  }
  return { withheld, failed };
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
 * construction); never `--force` push. A stash-commit (when one is made) is
 * immediately reset off the checked-out branch before the push, so it never becomes
 * reachable from -- or an ancestor of -- the tree's own branch (QF-20260904-596).
 * @param {{wtPath: string, key: string, ownerSessionId: string|null}} target
 * @param {{gitRunner?: Function, nowMs?: number, logger?: Function}} [opts]
 * @returns {Promise<{verdict: string, ref: string|null, sha: string|null, pushed: boolean, findings?: Array, error?: string}>}
 */
export async function runPreserveStage({ wtPath, key, ownerSessionId }, opts = {}) {
  const { gitRunner = defaultGitRunner, nowMs = Date.now(), logger = () => {} } = opts;
  const run = (args) => gitRunner(args, wtPath);

  // QF-20260904-693: before touching anything, check whether an existing
  // wip/reclaim/<key>/* ref already points at this tree's current HEAD -- an
  // unchanged tip was pushing a fresh timestamped ref on every --execute run
  // (measured: 7 identical refs/tree across 7 runs, inflating the unrouted-branches
  // audit). Only matches the "nothing to commit" case below: a run with genuinely
  // new staged changes always commits a new, distinct sha, so it is never skipped.
  const headSha = String(run(['rev-parse', 'HEAD']).stdout || '').trim();
  const existingLine = String(run(['ls-remote', '--heads', 'origin', `wip/reclaim/${key}/*`]).stdout || '')
    .split('\n').map((l) => l.trim()).find((l) => l.startsWith(headSha));
  if (existingLine) {
    const existingRef = existingLine.split(/\s+/)[1]?.replace('refs/heads/', '');
    if (existingRef) {
      logger(`[preserve-stage] skip push for ${wtPath} -- ${existingRef} already points at HEAD (${headSha})`);
      return { verdict: PRESERVE_VERDICT.PUSHED, ref: existingRef, sha: headSha, pushed: false };
    }
  }

  const ts = preserveTimestamp(nowMs);
  const ref = buildPreserveRefName(key, ts);

  // 1. Stage: tracked modifications, plus an EXPLICIT list of untracked non-ignored
  // files -- never `git add -A`.
  run(['add', '-u']);
  const untracked = run(['ls-files', '--others', '--exclude-standard']);
  const untrackedFiles = String(untracked.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean)
    .filter((f) => {
      if (!isDenylistedUntrackedPath(f)) return true;
      logger(`[preserve-stage] refusing to stage denylisted per-host file in ${wtPath}: ${f} (QF-20260911-379)`);
      return false;
    });
  if (untrackedFiles.length > 0) run(['add', '--', ...untrackedFiles]);

  const stagedProbe = run(['diff', '--cached', '--quiet']);
  let hasStagedChanges = stagedProbe.code !== 0;
  let withheld = [];

  if (hasStagedChanges) {
    // 2. Secret/credential scan, PER FILE (QF-20260912-495): the prior whole-diff
    // scan held the ENTIRE tree on one matching file (e.g. a test-evidence JSON that
    // printed a live DB connection string), even when every other staged file was
    // clean, and separately, husky's own pre-commit hook refuses the commit over the
    // same class of content the whole-diff scanStagedDiffForSecrets check did not
    // cover until now (a DB connection string with an embedded password) -- so these
    // trees never reached scan.held at all, they failed at the commit step below
    // as PUSH_FAILED. Both
    // cases now withhold just the matching file(s) to the reaper audit sink instead
    // of holding the whole tree.
    const diff = run(['diff', '--cached']);
    const perFile = scanStagedFilesForSecrets(diff.stdout);
    const heldFiles = perFile.filter((f) => f.held);
    if (heldFiles.length > 0) {
      const outcome = withholdMatchedFiles({ wtPath, heldFiles, repoRoot: opts.repoRoot || process.cwd(), ts, logger });
      if (outcome.failed.length > 0) {
        // Fail-closed: could not safely relocate every matching file -- never risk
        // committing a secret, fall back to holding the whole tree exactly as before.
        run(['reset']);
        return { verdict: PRESERVE_VERDICT.HELD_SECRET, ref: null, sha: null, pushed: false, findings: heldFiles.flatMap((f) => f.findings) };
      }
      withheld = outcome.withheld;
      run(['reset', '--', ...heldFiles.map((f) => f.path)]); // unstage the (now-relocated) matches
      hasStagedChanges = run(['diff', '--cached', '--quiet']).code !== 0; // withholding may have emptied the staged set
    }
  }

  if (hasStagedChanges) {
    // 3. Commit, with owner session + worktree path as trailers. The tree's OWN
    // pre-commit tip was already captured above (headSha, before any staging touched
    // the index) -- QF-20260904-596: this commit must never become reachable from the
    // tree's checked-out branch (that is the whole bug this fixes: a stash-commit here
    // previously became an ancestor of the worker's own next commit/push on this exact
    // branch, and rode along into that worker's own PR).
    const originalHead = headSha;

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

    const committedRes = run(['rev-parse', 'HEAD']);
    const committedSha = String(committedRes.stdout || '').trim();

    // Restore the tree's own branch to its pre-preserve tip IMMEDIATELY, before the
    // push below -- so a push failure can never leave this commit sitting on the
    // worker's own branch either. The commit object itself stays fully intact (a
    // mixed reset never touches the working tree or the commit graph, only the
    // branch ref + index) and remains reachable via the push that follows.
    run(['reset', originalHead]);

    // 4. Push (never --force) the CAPTURED commit -- never the bare "HEAD" token,
    // since HEAD was just reset back to originalHead above.
    const push = run(['push', 'origin', `${committedSha}:refs/heads/${ref}`]);
    if (push.code !== 0) {
      logger(`[preserve-stage] push failed for ${wtPath} -> ${ref}: ${push.stderr || push.stdout}`);
      return { verdict: PRESERVE_VERDICT.PUSH_FAILED, ref, sha: null, pushed: false, error: push.stderr || push.stdout || 'push_failed' };
    }

    // 5. Verify: the pushed ref's remote sha equals the captured commit sha.
    const remoteRes = run(['ls-remote', 'origin', `refs/heads/${ref}`]);
    const remoteSha = String(remoteRes.stdout || '').trim().split(/\s+/)[0] || null;
    if (!remoteSha || remoteSha !== committedSha) {
      logger(`[preserve-stage] verify mismatch for ${wtPath} -> ${ref}: local=${committedSha} remote=${remoteSha}`);
      return { verdict: PRESERVE_VERDICT.VERIFY_FAILED, ref, sha: committedSha, pushed: true, error: 'ls_remote_sha_mismatch' };
    }

    return { verdict: PRESERVE_VERDICT.PUSHED, ref, sha: committedSha, pushed: true, withheld: withheld.length ? withheld : undefined };
  }

  // No staged changes at all -- either the tree carries only already-committed,
  // unpushed work (the original case), OR withholding above relocated every staged
  // file and left nothing to commit (QF-20260912-495: a tree whose only dirty
  // content was unsafe evidence now reaches this SAME "clean" push-HEAD path, which
  // is what lets it classify reclaimable -- verdict PUSHED satisfies
  // evaluateReclaimEligibilityPreAudit's contentSafe check downstream in
  // worktree-reaper.mjs with no change needed there). Nothing to commit or reset,
  // push the tree's current HEAD unchanged.
  const push = run(['push', 'origin', `HEAD:refs/heads/${ref}`]);
  if (push.code !== 0) {
    logger(`[preserve-stage] push failed for ${wtPath} -> ${ref}: ${push.stderr || push.stdout}`);
    return { verdict: PRESERVE_VERDICT.PUSH_FAILED, ref, sha: null, pushed: false, error: push.stderr || push.stdout || 'push_failed' };
  }

  // Nothing committed since headSha was captured above -- reuse it rather than a
  // redundant second rev-parse HEAD call.
  const localSha = headSha;
  const remoteRes = run(['ls-remote', 'origin', `refs/heads/${ref}`]);
  const remoteSha = String(remoteRes.stdout || '').trim().split(/\s+/)[0] || null;
  if (!remoteSha || remoteSha !== localSha) {
    logger(`[preserve-stage] verify mismatch for ${wtPath} -> ${ref}: local=${localSha} remote=${remoteSha}`);
    return { verdict: PRESERVE_VERDICT.VERIFY_FAILED, ref, sha: localSha, pushed: true, error: 'ls_remote_sha_mismatch' };
  }

  return { verdict: PRESERVE_VERDICT.PUSHED, ref, sha: localSha, pushed: true, withheld: withheld.length ? withheld : undefined };
}

const MAX_APPEND_RETRIES = 5;

/**
 * Append-only, concurrency-safe recovery-pointer write to the owning row's
 * metadata.reaper_preserved[] (FR-1a step 6). SD rows use optimistic-concurrency retry keyed
 * on `updated_at` -- never a blind overwrite of the whole metadata column, since that would
 * lose a concurrent writer's changes outright.
 *
 * quick_fixes has a metadata jsonb column (SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E) but NO
 * updated_at column, so the SD-row retry above does not port over. QF-20260904-652: a QF-owned
 * tree gets a single best-effort read-then-write instead of a retry loop, consistent with this
 * function's own established risk tolerance ("a lost metadata pointer degrades convenience, not
 * data safety") -- the audit_log row (FR-3) remains the authoritative recovery record either
 * way. Fails soft on Postgres 42703 (undefined_column) for defense-in-depth, matching
 * lib/fleet/qf-metadata-merge.mjs's documented fail-soft contract for this same column.
 * @param {object|null} supabase
 * @param {{key: string, isQf: boolean}} owner
 * @param {object} pointer - {ref, sha, worktree_path, owner_session, preserved_at, contains_migration_files}
 * @param {{logger?: Function}} [opts]
 */
export async function appendReaperPreservedPointer(supabase, { key, isQf }, pointer, opts = {}) {
  const { logger = () => {} } = opts;
  if (!supabase) return { ok: false, skipped: true, reason: 'no_supabase_client' };

  if (isQf) {
    const { data: row, error: readError } = await supabase
      .from('quick_fixes')
      .select('id, metadata')
      .eq('id', key)
      .maybeSingle();
    if (readError) {
      if (readError.code === '42703') {
        logger(`[preserve-stage] quick_fixes.metadata column absent -- skipping row-level pointer for ${key}, audit_log remains authoritative`);
        return { ok: false, skipped: true, reason: 'column_absent' };
      }
      logger(`[preserve-stage] metadata read failed for QF ${key}: ${readError.message}`);
      return { ok: false, error: readError.message };
    }
    if (!row) {
      logger(`[preserve-stage] no quick_fixes row found for ${key} -- skipping row-level pointer`);
      return { ok: false, skipped: true, reason: 'no_matching_qf_id' };
    }
    const existingQf = Array.isArray(row.metadata?.reaper_preserved) ? row.metadata.reaper_preserved : [];
    const nextQfMetadata = { ...(row.metadata || {}), reaper_preserved: [...existingQf, pointer] };
    const { error: updateError } = await supabase
      .from('quick_fixes')
      .update({ metadata: nextQfMetadata })
      .eq('id', row.id);
    if (updateError) {
      if (updateError.code === '42703') {
        logger(`[preserve-stage] quick_fixes.metadata column absent -- skipping row-level pointer for ${key}, audit_log remains authoritative`);
        return { ok: false, skipped: true, reason: 'column_absent' };
      }
      logger(`[preserve-stage] metadata update failed for QF ${key}: ${updateError.message}`);
      return { ok: false, error: updateError.message };
    }
    return { ok: true };
  }

  for (let attempt = 0; attempt < MAX_APPEND_RETRIES; attempt++) {
    const { data: row, error: readError } = await supabase
      .from('strategic_directives_v2')
      .select('id, metadata, updated_at')
      .eq('sd_key', key)
      .maybeSingle();
    if (readError) {
      logger(`[preserve-stage] metadata read failed for ${key}: ${readError.message}`);
      return { ok: false, error: readError.message };
    }
    if (!row) {
      logger(`[preserve-stage] no strategic_directives_v2 row found for sd_key=${key} -- skipping row-level pointer (key is likely not a real sd_key, e.g. a PR-suffixed or adhoc branch name)`);
      return { ok: false, skipped: true, reason: 'no_matching_sd_key' };
    }
    const existing = Array.isArray(row.metadata?.reaper_preserved) ? row.metadata.reaper_preserved : [];
    const nextMetadata = { ...(row.metadata || {}), reaper_preserved: [...existing, pointer] };
    // .maybeSingle(): the .eq('id', ...) above already scopes this to at most one row —
    // bounded by primary-key equality, not by an unbounded read (count-truncation-diff-lint).
    const { data: updated, error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata: nextMetadata })
      .eq('id', row.id)
      .eq('updated_at', row.updated_at)
      .select('id')
      .maybeSingle();
    if (!updateError && updated) {
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
  splitCachedDiffByFile,
  scanStagedFilesForSecrets,
  withholdMatchedFiles,
  isDenylistedUntrackedPath,
  PRESERVE_UNTRACKED_DENYLIST,
  runPreserveStage,
  appendReaperPreservedPointer,
};
