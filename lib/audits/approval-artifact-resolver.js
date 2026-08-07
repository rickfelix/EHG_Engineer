/**
 * approval-artifact-resolver — resolve a chairman approval to the ARTIFACT a live probe can be
 * compared against. SD-FDBK-INFRA-LIVE-PROBE-DDL-001 FR-5.
 *
 * Implements the contract decided in docs/reference/ddl-approval-record-definition.md (FR-1):
 *
 *   - Approval IDENTITY comes from the approval record (chairman_decisions, or the SD/QF/feedback
 *     metadata the sweep already collects). That is the caller's input here.
 *   - Approved CONTENT comes from the migration FILE on disk — a genuinely DIFFERENT origin.
 *   - Object IDENTITY comes from PARSING that file, never from regex-scraping approval prose.
 *     Prose scraping is what fabricated a nonexistent filename twice
 *     (chairman-apply-sweep.js:333-345, chairman-apply-collectors.js:42-48).
 *
 * WHY THE TWO-ORIGIN RULE IS LOAD-BEARING, not bookkeeping: chairman-apply-collectors.js:199-205
 * hardcodes provenanceIndependent:false and warns, verbatim, that "21 rows would reach hasApproval
 * with provenance never established the moment a live prober lands" — because the approval text and
 * the artifact path are extracted from THE SAME STRING. Comparing those is a string compared
 * against itself, reported as verification. This module only reports provenanceIndependent when the
 * content actually came from the filesystem, which is the second origin that claim requires.
 *
 * FAIL DIRECTION: every unresolvable case returns resolved:false with a reason, so the caller keeps
 * the item UNVERIFIABLE. It never returns a partial or inferred artifact. Every existing fail-open
 * in this area errs toward APPLIED; repeating that would make the sweep confidently wrong where it
 * is currently honestly silent.
 */
import path from 'path';
import fs from 'fs';
import { parseDeclaredObjects } from '../../scripts/lib/migration-object-parser.js';
import { approvedArtifactHash } from '../../scripts/lib/approved-artifact-hash.js';

/** Reasons a resolution can fail. Each maps to UNVERIFIABLE, never to APPLIED. */
export const UNRESOLVED = Object.freeze({
  NO_PATH: 'no_artifact_path_in_approval',
  OUTSIDE_REPO: 'artifact_path_escapes_repo_root',
  MISSING: 'artifact_file_not_found',
  UNREADABLE: 'artifact_file_unreadable',
  NO_OBJECTS: 'artifact_declares_no_objects',
});

/**
 * @param {object} opts
 * @param {string|null} opts.artifactPath - path named by the approval (may be absolute or relative)
 * @param {string} opts.repoRoot - repository root; the artifact must resolve inside it
 * @param {object} [deps] - injectable fs for tests
 * @returns {{resolved: boolean, reason?: string, path?: string, content?: string,
 *            contentHash?: string, objects?: Array, provenanceIndependent?: boolean}}
 */
export function resolveApprovedArtifact({ artifactPath, repoRoot }, deps = {}) {
  const io = deps.fs || fs;
  if (!artifactPath || typeof artifactPath !== 'string') {
    return { resolved: false, reason: UNRESOLVED.NO_PATH };
  }

  // The approval names a path we did not author. Resolve it and confirm it stays inside the repo:
  // an approval is not authorisation to read arbitrary filesystem locations.
  const abs = path.resolve(repoRoot, artifactPath);
  const rootAbs = path.resolve(repoRoot);
  const rel = path.relative(rootAbs, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { resolved: false, reason: UNRESOLVED.OUTSIDE_REPO, path: abs };
  }

  if (!io.existsSync(abs)) {
    // A named-but-absent artifact is the case that historically got fabricated. Absent is a real,
    // reportable answer — the approval references something this checkout does not have.
    return { resolved: false, reason: UNRESOLVED.MISSING, path: abs };
  }

  let content;
  try {
    content = io.readFileSync(abs, 'utf8');
  } catch {
    return { resolved: false, reason: UNRESOLVED.UNREADABLE, path: abs };
  }

  const objects = parseDeclaredObjects(content);
  if (!objects.length) {
    // The file exists but declares nothing this system can probe. Honest UNVERIFIABLE, not APPLIED.
    return { resolved: false, reason: UNRESOLVED.NO_OBJECTS, path: abs, content };
  }

  return {
    resolved: true,
    path: abs,
    content,
    contentHash: approvedArtifactHash(content),
    objects,
    // TRUE only here: the content was read from the FILESYSTEM, a different origin from the
    // approval prose that named it. That is precisely what collectors:199-205 requires before a
    // comparison counts as verification rather than self-comparison.
    provenanceIndependent: true,
  };
}
