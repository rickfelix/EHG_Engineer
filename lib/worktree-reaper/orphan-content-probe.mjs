/**
 * Bounded content probe for orphan classification.
 * SD-LEO-INFRA-ORPHAN-SWEEP-HARD-001 (FR-2 / FR-3 / FR-3b).
 *
 * WHY THIS EXISTS: on 2026-08-01 the orphan sweep hard-deleted 601,021,494 bytes / 42,162 files
 * that two agents had refused to remove. Two guards were inapplicable BY CONSTRUCTION:
 *
 *   1. The recency guard stat'd the TOP-LEVEL directory inode (worktree-quota.js:265). Directory
 *      mtime advances on entry add/remove/rename only — never on nested-file modification — so a
 *      tree edited 3.5h earlier read as ancient. Structural blindness, not mis-tuning: no
 *      threshold fixes a measurement that cannot see the thing it measures.
 *   2. A missing .git short-circuited straight to reapable (worktree-quota.js:270), skipping the
 *      predicate entirely. The property that made the directory DANGEROUS to delete — unregistered,
 *      unattributed, contents never examined — was the property that made it unconditionally
 *      reapable. Absence of signal read as signal of absence.
 *
 * THE BOUND IS NOT A NICETY. dirSizeBytes (orphan-sweep.js:109-126) has no cap and no deadline,
 * and reclaimOrphans calls it BEFORE the dry-run short-circuit, so even a dry run walks the full
 * tree of every reapable orphan. A naive walk of the 45,877-file directory presently in .worktrees
 * exceeded a ten-minute budget and was killed. This repo's own prior answer to that exact class was
 * architectural avoidance, not a better walker: scripts/maintenance/Prune-WorktreeArchive.ps1 says
 * it never recursively walks to size a tree ("40M files = the thing that hung").
 *
 * FR-3b — THE FAILURE MODE THIS MODULE MUST NOT HAVE. FR-3 is itself an absence-read-as-signal
 * fix, and PAT-CONFLATION-RECURSES-ONE-LAYER-UP-001 predicts that such a fix reproduces the
 * conflation one layer out, authored by whoever just diagnosed it one layer down. The specific way
 * that happens here is treating an UNMEASURABLE directory as an EMPTY one. So every failure —
 * timeout, cap, unreadable dir, stat error — returns ok:false and the caller must REFUSE. A
 * directory whose walk we could not finish is the directory we know least about.
 *
 * PURITY: classifyContent() is pure. probeContent() is the only function that touches the
 * filesystem, and it takes fsImpl + a clock so both polarities are testable from fixtures without
 * locking files (locking is the mechanism that MANUFACTURES these orphans — never simulate it).
 */

/**
 * Content thresholds above which a .git-less directory is REFUSED rather than reaped.
 *
 * CHOSEN AGAINST THE ACTUAL FIXTURES, not by taste. The existing suites write:
 *   - tests/unit/worktree-reaper/orphan-sweep.test.js mkLeftover: 1 file of EXACTLY 100 bytes
 *   - tests/unit/worktree-quota-orphan-classify.test.js: an empty 'plain-leftover'
 *   - lib/worktree-quota.test.js addOrphanDirectory: 1 file of 6 bytes
 * A `> 1 file AND > 100 bytes` rule clears all three with ZERO MARGIN on both dimensions — one
 * extra byte in mkLeftover would flip four assertions in a suite nobody was editing. These values
 * keep real margin while still refusing anything resembling live work.
 */
export const CONTENT_REFUSE_MIN_FILES = 3;
export const CONTENT_REFUSE_MIN_BYTES = 4096;

/** Hard bounds. Exported so tests can assert a fixture sits BELOW the cap — see below. */
export const PROBE_MAX_FILES = 5000;
export const PROBE_MAX_MS = 4000;

/** Verdict reasons. Distinct strings by design — see classifyContent(). */
export const REASON = Object.freeze({
  HIGH_CONTENT: 'high_content',
  WALK_TIMEOUT: 'walk_timeout',
  WALK_ERROR: 'walk_error',
  CAP_EXCEEDED: 'cap_exceeded',
});

/**
 * Decide whether a probe result means REFUSE, and why. PURE — no fs, no clock, no I/O.
 *
 * The reason strings for a content refusal and for a failed walk are DELIBERATELY DIFFERENT.
 * If a failed walk also refused as 'high_content', a test asserting reason==='high_content'
 * would be satisfied by the failure path and could no longer prove the content branch ran at
 * all. Distinct reasons keep those two claims independently checkable.
 *
 * @param {{ok:boolean, files?:number, bytes?:number, truncated?:boolean, reason?:string}} probe
 * @returns {{refuse:boolean, reason:string|null}}
 */
export function classifyContent(probe) {
  if (!probe || probe.ok !== true) {
    // FR-3b: unmeasurable is NOT empty. Refuse, carrying the failure's own reason.
    return { refuse: true, reason: probe?.reason || REASON.WALK_ERROR };
  }
  if (probe.truncated === true) return { refuse: true, reason: REASON.CAP_EXCEEDED };
  const files = probe.files || 0;
  const bytes = probe.bytes || 0;
  if (files >= CONTENT_REFUSE_MIN_FILES || bytes > CONTENT_REFUSE_MIN_BYTES) {
    return { refuse: true, reason: REASON.HIGH_CONTENT };
  }
  return { refuse: false, reason: null };
}

/**
 * Walk `dir` under a hard file-count cap and deadline, collecting file count, byte total and the
 * newest DESCENDANT mtime.
 *
 * Never traverses a symlink or junction: a link counts as 0 files / 0 bytes. That mirrors
 * dirSizeBytes:116 and is load-bearing — following a node_modules junction would walk (and could
 * later delete through) the shared store.
 *
 * @param {string} dir
 * @param {{fsImpl?:object, pathImpl?:object, maxFiles?:number, maxMs?:number, now?:function}} [opts]
 * @returns {{ok:true, files:number, bytes:number, newestMtimeMs:number, truncated:boolean}
 *          |{ok:false, reason:string, files:number}}
 */
export function probeContent(dir, opts = {}) {
  const {
    fsImpl,
    pathImpl,
    maxFiles = PROBE_MAX_FILES,
    maxMs = PROBE_MAX_MS,
    now = Date.now,
  } = opts;
  if (!fsImpl || !pathImpl) throw new Error('probeContent requires fsImpl and pathImpl (injection seam)');

  const deadline = now() + maxMs;
  let files = 0;
  let bytes = 0;
  let newestMtimeMs = 0;
  const stack = [dir];

  while (stack.length) {
    if (now() > deadline) return { ok: false, reason: REASON.WALK_TIMEOUT, files };
    const cur = stack.pop();
    let st;
    try {
      st = fsImpl.lstatSync(cur);
    } catch {
      // A node we cannot stat. Skipping it silently is exactly how safeRecursiveCp truncates an
      // archive while reporting success — so this is a HARD FAILURE, not a continue.
      return { ok: false, reason: REASON.WALK_ERROR, files };
    }
    if (st.isSymbolicLink()) continue; // 0 files, 0 bytes, never traversed
    if (st.isDirectory()) {
      let entries;
      try {
        entries = fsImpl.readdirSync(cur);
      } catch {
        return { ok: false, reason: REASON.WALK_ERROR, files };
      }
      for (const e of entries) stack.push(pathImpl.join(cur, e));
      continue;
    }
    files += 1;
    bytes += st.size || 0;
    if (st.mtimeMs > newestMtimeMs) newestMtimeMs = st.mtimeMs;
    if (files >= maxFiles) {
      // Cap hit. Report truncated rather than a partial count the caller might trust as complete.
      // `>=` not `>`: the contract is "never walk more than maxFiles", and `>` let one extra file
      // through. The original test asserted `files <= maxFiles + 1`, which ACCOMMODATED the
      // off-by-one instead of pinning the contract — an assertion written around the behaviour
      // rather than around the requirement.
      return { ok: true, files, bytes, newestMtimeMs, truncated: true };
    }
  }
  return { ok: true, files, bytes, newestMtimeMs, truncated: false };
}
