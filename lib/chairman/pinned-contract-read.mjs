/**
 * pinned-contract-read — read a rendered contract from an IMMUTABLE source instead of the
 * working tree. SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-B (W2 child B), PR1.
 *
 * WHY THIS EXISTS
 * lib/chairman/ratification-writer.mjs:23 builds DEFAULT_REPO_ROOT from import.meta.url and reads
 * the target file from that working tree (:42, :49). A checkout that lags main therefore fails
 * marks that are actually valid -- the file simply does not yet contain the clause on disk. The
 * same working-tree dependency exists in the regression gauge at scripts/adam-quiet-tick.mjs:814
 * and :836, so gating where those findings are ROUTED does not make them TRUE.
 *
 * WHY THREE TIERS AND NOT ONE
 * The obvious design -- "read the file at the ratification's cited manifest_hash" -- is NOT
 * uniformly executable. Measured 2026-09-03 with `git cat-file -t` over all 15 distinct
 * encoded_ref.manifest_hash values in the live ledger, and independently reproduced:
 *
 *     length  distinct  rows  git object?
 *     11      6         29    commit  (f096e4e2500 x9, 2c238e89ff0 x9, eae8b58c404 x4,
 *                                      98ef8a34b3e x4, 605e656cbd7 x2, 18a22530a73 x1)
 *     16      8         18    no
 *     64      1          2    no
 *
 * So a commit pin exists for 29 of 49 rows only. The 16-char values are almost certainly
 * section_digests.global/byId from SUPERSEDED manifests (right shape -- sha256().substring(0,16)
 * per claude-md-generator/index.js:753,761 -- wrong generation); the 64-char value is a full
 * sha256 matching nothing's format. encoded_ref carries no discriminator field, and NOTHING in
 * the repo maps a manifest_hash to a commit.
 *
 * DISCRIMINATE BY OBJECT LOOKUP, NEVER BY LENGTH. Length is currently a perfect correlate, but a
 * 16-hex string is a syntactically valid short sha that merely does not exist as an object;
 * encoding that coincidence as a production predicate would re-seed the very class of defect this
 * workstream closes. `git cat-file -t` is the only honest test.
 *
 * TIERS ANSWER DIFFERENT QUESTIONS, so the verdict must record which one produced it:
 *   1 exact      - the row's own manifest_hash IS a commit; read the file there.
 *   2 approximate- no commit pin; use the last commit touching that file at or before
 *                  encoded_at. Labelled approximate; it is a reconstruction, not the row's pin.
 *   3 db         - no usable commit at all; the caller must read leo_protocol_sections.content
 *                  (tree-independent but section-scoped, not file-scoped).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const DEFAULT_REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Matches adam-quiet-tick.mjs:824/:847, which already run these reads in production. */
const GIT_TIMEOUT_MS = 5000;
const GIT_MAX_BUFFER = 8 * 1024 * 1024;

/** Abbreviated shas are 7-40 hex; anything outside that cannot be an object name at all, so we
 *  skip the subprocess. This is a CHEAP PRE-FILTER on syntax, never the kind decision itself --
 *  a value passing it is still only a pin if `git cat-file -t` says `commit`. */
const HEX_OBJECT_NAME = /^[0-9a-f]{7,40}$/i;

export const TIER = Object.freeze({
  EXACT: 'exact_commit_pin',
  APPROXIMATE: 'approximate_encoded_at_pin',
  DB: 'db_section_content',
});

export class PinnedReadError extends Error {
  constructor(message, { code = 'PINNED_READ_FAILED', ...rest } = {}) {
    super(message);
    this.name = 'PinnedReadError';
    this.code = code;
    Object.assign(this, rest);
  }
}

async function git(args, repoRoot) {
  return execFileAsync('git', args, {
    cwd: repoRoot,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER,
    windowsHide: true,
  });
}

/**
 * Is `commitish` a real commit object in this repo?
 * Returns false for a syntactically-valid-but-absent name, and for any git failure -- callers
 * treat false as "no pin here, fall through", never as an error to swallow silently.
 */
export async function isCommitObject(commitish, { repoRoot = DEFAULT_REPO_ROOT } = {}) {
  if (typeof commitish !== 'string' || !HEX_OBJECT_NAME.test(commitish.trim())) return false;
  try {
    const { stdout } = await git(['cat-file', '-t', commitish.trim()], repoRoot);
    return stdout.trim() === 'commit';
  } catch {
    return false;
  }
}

/**
 * Read one repo-relative file at a commit. Never touches the working tree.
 * THROWS on failure -- a missing file at a pinned commit is a real answer ("the clause was not
 * there"), and swallowing it would reproduce the fail-open shape being removed.
 */
export async function readContractAtCommit(commitish, relPath, { repoRoot = DEFAULT_REPO_ROOT } = {}) {
  if (typeof commitish !== 'string' || commitish.trim() === '') {
    throw new PinnedReadError('commitish must be a non-empty string', { code: 'PINNED_READ_BAD_ARG' });
  }
  if (typeof relPath !== 'string' || relPath.trim() === '') {
    throw new PinnedReadError('relPath must be a non-empty string', { code: 'PINNED_READ_BAD_ARG' });
  }
  // git show wants forward slashes regardless of platform.
  const spec = `${commitish.trim()}:${relPath.trim().split('\\').join('/')}`;
  try {
    const { stdout } = await git(['show', spec], repoRoot);
    return stdout;
  } catch (err) {
    throw new PinnedReadError(`git show ${spec} failed: ${err.message}`, {
      code: 'PINNED_READ_UNAVAILABLE',
      commitish: commitish.trim(),
      relPath,
    });
  }
}

/**
 * Last commit touching `relPath` at or before `whenIso`. Used only for the approximate tier.
 * Returns null when git yields nothing (a file created after that instant, or an unknown path).
 */
export async function lastCommitTouchingBefore(relPath, whenIso, { repoRoot = DEFAULT_REPO_ROOT } = {}) {
  if (!relPath || !whenIso) return null;
  try {
    const { stdout } = await git(
      ['log', '--format=%H', '--before', String(whenIso), '-n', '1', '--', relPath],
      repoRoot
    );
    const sha = stdout.trim();
    return sha === '' ? null : sha;
  } catch {
    return null;
  }
}

/**
 * Decide WHERE a ratification row's contract content should be read from.
 *
 * Returns a discriminated verdict; the caller must branch on `tier` and must carry `tier` into
 * whatever it records, because tier 2 and tier 3 are materially weaker evidence than tier 1 and a
 * reader cannot otherwise tell them apart.
 *
 *   { tier: 'exact_commit_pin',            commit, approximate: false }
 *   { tier: 'approximate_encoded_at_pin',  commit, approximate: true, reason }
 *   { tier: 'db_section_content',          commit: null, approximate: false, reason }
 *
 * @param {{encoded_ref?: {manifest_hash?: string}, encoded_at?: string}} row
 * @param {{repoRoot?: string, relPath?: string}} [opts] - relPath enables the tier-2 lookup
 */
export async function resolveEncodeCommit(row, { repoRoot = DEFAULT_REPO_ROOT, relPath = null } = {}) {
  const manifestHash = row && row.encoded_ref && row.encoded_ref.manifest_hash;

  if (await isCommitObject(manifestHash, { repoRoot })) {
    return { tier: TIER.EXACT, commit: String(manifestHash).trim(), approximate: false };
  }

  const encodedAt = row && row.encoded_at;
  if (relPath && encodedAt) {
    const sha = await lastCommitTouchingBefore(relPath, encodedAt, { repoRoot });
    if (sha) {
      return {
        tier: TIER.APPROXIMATE,
        commit: sha,
        approximate: true,
        reason:
          `manifest_hash ${manifestHash ? `'${manifestHash}'` : '(absent)'} is not a commit object; ` +
          `reconstructed from the last commit touching ${relPath} at or before ${encodedAt}. ` +
          'This is a RECONSTRUCTION, not the row\'s own pin.',
      };
    }
  }

  return {
    tier: TIER.DB,
    commit: null,
    approximate: false,
    reason:
      `no commit pin available (manifest_hash ${manifestHash ? `'${manifestHash}'` : '(absent)'} ` +
      'is not a commit object and no commit was found at or before encoded_at); ' +
      'read leo_protocol_sections.content instead -- tree-independent but section-scoped.',
  };
}
