/**
 * Post-Build Verdict Engine — artifact walk, completeness check, evidence-linking,
 * and disposition, writing durable rows to post_build_verdicts.
 *
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B. Chairman's honesty rule: could-not-verify
 * != built. Evidence-linking is a conservative HEURISTIC (keyword/path matching),
 * not semantic code understanding — ambiguous matches fail toward PARTIAL/MISSING,
 * never toward BUILT (FR-4).
 *
 * @module lib/eva/post-build-verdict-engine
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { readDeviations } from './deviation-ledger.js';

const DISPOSITIONS = Object.freeze({
  BUILT: 'BUILT',
  PARTIAL: 'PARTIAL',
  MISSING: 'MISSING',
  DEVIATED_WITH_DOCUMENTED_REASON: 'DEVIATED_WITH_DOCUMENTED_REASON',
  DEVIATED_UNDOCUMENTED: 'DEVIATED_UNDOCUMENTED',
});

const SCAN_IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.worktrees']);
const SCAN_MAX_FILES = 5000;
const SCAN_MAX_FILE_BYTES = 500_000;
const SCAN_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.sql', '.html', '.ejs']);

/**
 * Enumerate required artifact_types across stages 0..throughStage (inclusive),
 * deduplicated, from the live SSOT (venture_stages.required_artifacts — a
 * global, venture-independent registry, NOT the deprecated stage_artifact_requirements
 * mirror).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{throughStage?: number}} [opts]
 * @returns {Promise<Array<{artifactType: string, requiredAtStage: number}>>}
 */
export async function enumerateRequiredArtifacts(supabase, { throughStage = 19 } = {}) {
  const { data, error } = await supabase
    .from('venture_stages')
    .select('stage_number, required_artifacts')
    .lte('stage_number', throughStage)
    .order('stage_number', { ascending: true });
  if (error) {
    throw new Error(`[post-build-verdict-engine] enumerateRequiredArtifacts failed: ${error.message}`);
  }
  const seen = new Set();
  const result = [];
  for (const row of data || []) {
    for (const artifactType of row.required_artifacts || []) {
      if (seen.has(artifactType)) continue;
      seen.add(artifactType);
      result.push({ artifactType, requiredAtStage: row.stage_number });
    }
  }
  return result;
}

/**
 * Binary completeness precondition: does a CURRENT venture_artifacts row exist
 * for this artifact_type? MUST filter is_current=true — the opposite convention
 * from Child A's deliberately-unfiltered deviation-ledger reads (venture_artifacts
 * can carry stale is_current=false duplicates at some stages).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ventureId: string, artifactType: string}} opts
 * @returns {Promise<{present: boolean, artifactRow: object|null}>}
 */
export async function checkCompleteness(supabase, { ventureId, artifactType }) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('id, content, artifact_data, created_at')
    .eq('venture_id', ventureId)
    .eq('artifact_type', artifactType)
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`[post-build-verdict-engine] checkCompleteness failed: ${error.message}`);
  }
  return { present: Boolean(data), artifactRow: data || null };
}

/**
 * Resolve the venture's OWN repo path via applications.local_path (DB-first —
 * never accept a caller-supplied arbitrary path). Returns null if no application
 * with a local_path is linked to this venture.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ventureId: string}} opts
 * @returns {Promise<string|null>}
 */
export async function resolveVentureRepoPath(supabase, { ventureId }) {
  const { data, error } = await supabase
    .from('applications')
    .select('local_path')
    .eq('venture_id', ventureId)
    .not('local_path', 'is', null)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`[post-build-verdict-engine] resolveVentureRepoPath failed: ${error.message}`);
  }
  return data?.local_path || null;
}

/** Build a natural-language claim sentence from a single story object, trying
 *  every known field-naming convention this codebase's generators use. */
function storyToClaimText(item) {
  if (typeof item === 'string') return item.trim() || null;
  if (!item || typeof item !== 'object') return null;
  // Real shape confirmed live (MarketLens): {as_a, i_want_to, so_that, ...}.
  if (typeof item.i_want_to === 'string' && item.i_want_to.trim()) {
    const asA = item.as_a ? `As a ${item.as_a}, ` : '';
    const soThat = item.so_that ? ` so that ${item.so_that}` : '';
    return `${asA}I want to ${item.i_want_to}${soThat}`.trim();
  }
  const text = item.title || item.story || item.name || item.description;
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}

/**
 * Best-effort extraction of individual claim strings from a blueprint_user_story_pack
 * artifact row. Handles three known shapes, in order:
 *   1. Nested epics: artifact_data.epics[].stories[] (confirmed live shape —
 *      each story has {as_a, i_want_to, so_that, ...}).
 *   2. Flat array: artifact_data (or .stories / .user_stories) is itself an
 *      array of strings or {title|story|name|description} objects.
 *   3. Markdown bullet lines in `content`, as a last-resort fallback.
 * Returns an empty array (never throws) on unparseable content — an
 * artifact-level disposition is still possible even when per-claim
 * extraction fails.
 * @param {{content?: string, artifact_data?: any}} artifactRow
 * @returns {string[]}
 */
export function extractUserStoryClaims(artifactRow) {
  const claims = [];
  const data = artifactRow?.artifact_data;

  if (Array.isArray(data?.epics)) {
    for (const epic of data.epics) {
      for (const story of epic?.stories || []) {
        const text = storyToClaimText(story);
        if (text) claims.push(text);
      }
    }
    if (claims.length) return claims;
  }

  const arr = Array.isArray(data) ? data : Array.isArray(data?.stories) ? data.stories : Array.isArray(data?.user_stories) ? data.user_stories : null;
  if (arr) {
    for (const item of arr) {
      const text = storyToClaimText(item);
      if (text) claims.push(text);
    }
    if (claims.length) return claims;
  }

  const content = artifactRow?.content;
  if (typeof content === 'string') {
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*[-*]\s+(.{5,})$/);
      if (m) claims.push(m[1].trim());
    }
  }
  return claims;
}

/** Extract meaningful (length >= 4, non-stopword) lowercase keywords from a claim string. */
function extractKeywords(claimText) {
  const STOPWORDS = new Set(['this', 'that', 'with', 'from', 'have', 'should', 'user', 'users', 'story', 'when', 'then', 'able', 'want', 'need', 'their', 'they']);
  return [...new Set(
    String(claimText)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
  )];
}

function walkFiles(rootPath) {
  const files = [];
  const stack = [rootPath];
  while (stack.length && files.length < SCAN_MAX_FILES) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (SCAN_IGNORE_DIRS.has(entry.name)) continue;
      // Never follow symlinks or Windows directory junctions: (1) a junction cycle
      // (e.g. a worktree's node_modules junction pointing back toward an ancestor)
      // would grow the directory stack unbounded — SCAN_MAX_FILES only caps the
      // discovered-FILES array, not pending directories; (2) a followed symlink
      // could resolve outside repoPath while evidenceRefs still records a
      // relative path that looks safely repo-contained. (Adversarial /ship review.)
      if (entry.isSymbolicLink()) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (SCAN_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
        files.push(full);
      }
      if (files.length >= SCAN_MAX_FILES) break;
    }
  }
  return files;
}

/**
 * Walk the repo once and materialize an in-memory index of {relPath, pathLower,
 * content} for every scannable file. Built ONCE per runArtifactWalk() call and
 * reused across every claim, instead of re-walking + re-reading the whole repo
 * tree per claim (adversarial /ship review: O(claims) redundant filesystem scans).
 * @param {string} repoPath
 * @returns {Array<{relPath: string, pathLower: string, content: string}>}
 */
function buildFileIndex(repoPath) {
  let rootStat;
  try {
    rootStat = statSync(repoPath);
  } catch {
    return [];
  }
  if (!rootStat.isDirectory()) return [];

  const files = walkFiles(repoPath);
  const index = [];
  for (const file of files) {
    const relPath = relative(repoPath, file).replace(/\\/g, '/');
    let content;
    try {
      const stat = statSync(file);
      if (stat.size > SCAN_MAX_FILE_BYTES) continue;
      content = readFileSync(file, 'utf8').toLowerCase();
    } catch {
      continue;
    }
    index.push({ relPath, pathLower: relPath.toLowerCase(), content });
  }
  return index;
}

/**
 * Conservative, keyword-based evidence search for a claim within the venture's
 * own repo. NOT semantic understanding — a heuristic that fails toward weaker
 * confidence on ambiguity (FR-4: could-not-verify != built).
 *
 * Confidence bands:
 *   STRONG — >=2 distinct keywords match in the SAME file (or one keyword
 *            matches a file/path NAME, a much stronger signal than body text).
 *   WEAK   — exactly 1 distinct keyword matches, only in file body text.
 *   NONE   — no match.
 *
 * Pass a pre-built `fileIndex` (via buildFileIndex()) to avoid re-walking the
 * repo on every call — runArtifactWalk() does this once per venture. Passing
 * `repoPath` alone (no fileIndex) builds the index internally, for callers
 * doing a single one-off lookup.
 * @param {{repoPath?: string, claimText: string, fileIndex?: Array<{relPath: string, pathLower: string, content: string}>}} opts
 * @returns {{confidence: 'STRONG'|'WEAK'|'NONE', evidenceRefs: Array<{path: string, line: number}>}}
 */
export function findEvidenceForClaim({ repoPath, claimText, fileIndex }) {
  const keywords = extractKeywords(claimText);
  if (!keywords.length) return { confidence: 'NONE', evidenceRefs: [] };

  const index = fileIndex || (repoPath ? buildFileIndex(repoPath) : []);
  if (!index.length) return { confidence: 'NONE', evidenceRefs: [] };

  let bestConfidence = 'NONE';
  const evidenceRefs = [];

  for (const { relPath, pathLower, content } of index) {
    const pathHit = keywords.some((kw) => pathLower.includes(kw));
    const matchedKeywords = keywords.filter((kw) => content.includes(kw));

    if (pathHit || matchedKeywords.length > 0) {
      const lines = content.split('\n');
      const lineIdx = lines.findIndex((l) => matchedKeywords.some((kw) => l.includes(kw)));
      evidenceRefs.push({ path: relPath, line: lineIdx >= 0 ? lineIdx + 1 : 1 });
    }

    if (pathHit || matchedKeywords.length >= 2) {
      bestConfidence = 'STRONG';
    } else if (matchedKeywords.length === 1 && bestConfidence !== 'STRONG') {
      bestConfidence = 'WEAK';
    }
    if (bestConfidence === 'STRONG' && evidenceRefs.length >= 5) break;
  }

  return { confidence: bestConfidence, evidenceRefs: evidenceRefs.slice(0, 5) };
}

const DEVIATION_REASON_MIN_LENGTH = 15;

/**
 * The single source of truth for "does this deviation record's reason count as
 * substantive" — shared by computeDisposition() and runArtifactWalk()'s
 * deviation_artifact_id attribution, so the two can never silently drift apart.
 * Returns the FIRST qualifying record (chronological, per readDeviations()
 * ordering), or null if none qualify.
 * @param {Array<{id?: string, why: string}>} deviationRecords
 * @returns {{id?: string, why: string}|null}
 */
function findQualifyingDeviation(deviationRecords) {
  return (deviationRecords || []).find((d) => d.why && d.why.trim().length >= DEVIATION_REASON_MIN_LENGTH) || null;
}

/**
 * Combine completeness + evidence-linking confidence + Child-A deviation-ledger
 * reads into exactly one of the 5 disposition values. Ambiguous evidence fails
 * toward PARTIAL/MISSING, never BUILT (FR-4).
 * @param {{present: boolean, evidenceConfidence: 'STRONG'|'WEAK'|'NONE', deviationRecords: Array<{why: string}>}} opts
 * @returns {string} one of DISPOSITIONS
 */
export function computeDisposition({ present, evidenceConfidence, deviationRecords }) {
  if (!present) return DISPOSITIONS.MISSING;
  if (evidenceConfidence === 'STRONG') return DISPOSITIONS.BUILT;
  if (evidenceConfidence === 'WEAK') return DISPOSITIONS.PARTIAL;
  // No evidence found at all — check whether a deviation was documented.
  if (deviationRecords && deviationRecords.length > 0) {
    return findQualifyingDeviation(deviationRecords) ? DISPOSITIONS.DEVIATED_WITH_DOCUMENTED_REASON : DISPOSITIONS.DEVIATED_UNDOCUMENTED;
  }
  return DISPOSITIONS.MISSING;
}

/**
 * Upsert one verdict row. Safe to call repeatedly for the same
 * (venture_id, artifact_type, claim_ref) — updates in place, never collides,
 * by construction (uq_post_build_verdicts_item + explicit ON CONFLICT).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ventureId: string, artifactType: string, claimRef: string, disposition: string, evidenceRefs?: Array, deviationArtifactId?: string|null, claimDescription?: string|null}} opts
 * @returns {Promise<string>} the verdict row id
 */
export async function upsertVerdict(supabase, opts = {}) {
  const { ventureId, artifactType, claimRef, disposition, evidenceRefs = [], deviationArtifactId = null, claimDescription = null } = opts;
  if (!ventureId) throw new Error('[post-build-verdict-engine] upsertVerdict requires ventureId');
  if (!artifactType) throw new Error('[post-build-verdict-engine] upsertVerdict requires artifactType');
  if (!claimRef) throw new Error('[post-build-verdict-engine] upsertVerdict requires claimRef');
  if (!Object.values(DISPOSITIONS).includes(disposition)) {
    throw new Error(`[post-build-verdict-engine] upsertVerdict requires a valid disposition, got: ${JSON.stringify(disposition)}`);
  }

  const { data, error } = await supabase
    .from('post_build_verdicts')
    .upsert(
      {
        venture_id: ventureId,
        artifact_type: artifactType,
        claim_ref: claimRef,
        disposition,
        evidence_refs: evidenceRefs,
        deviation_artifact_id: deviationArtifactId,
        claim_description: claimDescription,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'venture_id,artifact_type,claim_ref' }
    )
    .select('id')
    .single();

  if (error) {
    throw new Error(`[post-build-verdict-engine] upsertVerdict failed: ${error.message}`);
  }
  return data.id;
}

/**
 * Full artifact walk for one venture: enumerate required artifacts, check
 * completeness, evidence-link present artifacts (with per-story granularity
 * for blueprint_user_story_pack, artifact-level for everything else),
 * disposition, and upsert every verdict row. 100% coverage — every enumerated
 * artifact gets at least one verdict row.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ventureId: string, throughStage?: number}} opts
 * @returns {Promise<Array<{artifactType: string, claimRef: string, disposition: string}>>}
 */
export async function runArtifactWalk(supabase, { ventureId, throughStage = 19 } = {}) {
  if (!ventureId) throw new Error('[post-build-verdict-engine] runArtifactWalk requires ventureId');

  const required = await enumerateRequiredArtifacts(supabase, { throughStage });
  const repoPath = await resolveVentureRepoPath(supabase, { ventureId });
  const results = [];
  // Built once, lazily, on first claim that needs evidence-linking — not once
  // per claim (adversarial /ship review: avoids O(claims) redundant full
  // filesystem re-scans of the same repo).
  let fileIndex = null;

  for (const { artifactType } of required) {
    const { present, artifactRow } = await checkCompleteness(supabase, { ventureId, artifactType });

    if (!present) {
      await upsertVerdict(supabase, { ventureId, artifactType, claimRef: artifactType, disposition: DISPOSITIONS.MISSING });
      results.push({ artifactType, claimRef: artifactType, disposition: DISPOSITIONS.MISSING });
      continue;
    }

    const claims = artifactType === 'blueprint_user_story_pack'
      ? extractUserStoryClaims(artifactRow)
      : [artifactType];

    const claimList = claims.length ? claims : [artifactType];

    // Per-claim decomposition can produce a DIFFERENT SET of claimRefs across walks
    // (stories added/removed/reordered — claimRef is index-derived). Without this,
    // a claim no longer present in the current snapshot leaves its old verdict row
    // as a permanent orphan nothing ever revisits. Clear this artifact type's prior
    // claim-level rows before writing the current pass's fresh set — safe because
    // post_build_verdicts is an explicitly CURRENT-SNAPSHOT-ONLY table by design
    // (see migration comment), never a historical audit log. The artifact-level
    // singleton case (claims.length === 0) has exactly one stable claimRef and
    // needs no clearing — plain upsert already has zero orphan risk there.
    // (Adversarial /ship review re-review finding.)
    if (claims.length > 0) {
      const { error: staleDeleteError } = await supabase
        .from('post_build_verdicts')
        .delete()
        .eq('venture_id', ventureId)
        .eq('artifact_type', artifactType);
      if (staleDeleteError) {
        throw new Error(`[post-build-verdict-engine] runArtifactWalk failed to clear stale claim-level verdicts: ${staleDeleteError.message}`);
      }
    }

    for (const [claimIndex, claimText] of claimList.entries()) {
      // Index-disambiguated: two distinct claims sharing an identical truncated
      // prefix must never collide on the upsert key (adversarial /ship review).
      const claimRef = claimText === artifactType ? artifactType : `${artifactType}:${claimIndex}:${claimText.slice(0, 60)}`;
      let evidence = { confidence: 'NONE', evidenceRefs: [] };
      if (repoPath) {
        if (fileIndex === null) fileIndex = buildFileIndex(repoPath);
        evidence = findEvidenceForClaim({ claimText, fileIndex });
      }
      const deviationRecords = await readDeviations(supabase, { ventureId, artifactRef: claimRef });
      const verdictDisposition = computeDisposition({
        present: true,
        evidenceConfidence: evidence.confidence,
        deviationRecords,
      });
      // Attribute to the record that actually QUALIFIES (same predicate
      // computeDisposition used), never blindly the chronologically-first one
      // (adversarial /ship review: misattributed audit trail).
      const deviationArtifactId = verdictDisposition === DISPOSITIONS.DEVIATED_WITH_DOCUMENTED_REASON
        ? findQualifyingDeviation(deviationRecords)?.id ?? null
        : null;

      await upsertVerdict(supabase, {
        ventureId,
        artifactType,
        claimRef,
        disposition: verdictDisposition,
        evidenceRefs: evidence.evidenceRefs,
        deviationArtifactId,
        claimDescription: claimText === artifactType ? null : claimText,
      });
      results.push({ artifactType, claimRef, disposition: verdictDisposition });
    }
  }

  return results;
}

export default {
  DISPOSITIONS,
  enumerateRequiredArtifacts,
  checkCompleteness,
  resolveVentureRepoPath,
  extractUserStoryClaims,
  findEvidenceForClaim,
  computeDisposition,
  upsertVerdict,
  runArtifactWalk,
};
