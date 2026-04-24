/**
 * cross-sd-overlap -- Shared helpers for CROSS_SD_FILE_OVERLAP_TEMPORAL_* gates.
 * SD-LEO-INFRA-CROSS-FILE-OVERLAP-001 (FR-1, FR-3, FR-5).
 *
 * Responsibilities:
 *   - Query recently-shipped SDs within a configurable window (windowMs)
 *   - Resolve each recent SD's file-set via PRD target_files (PLAN oracle) or
 *     git diff against its merge commit (SHIP oracle)
 *   - Compare against the current SD's file-set, classifying overlaps as
 *     high-risk (registry-matched) or medium-risk
 *   - Parse `--acknowledge-cross-sd-overlap` + `--ack-reason` CLI flags
 *   - Append a structured FR-5 metadata entry to sd_phase_handoffs.metadata
 */
import { execSync } from 'node:child_process';
import { minimatch } from 'minimatch';
import { extractTargetFiles } from '../scripts/modules/cross-sd-consistency-validation.js';
import { getHighRiskPatterns, getWindowMs } from './config/cross-sd-config.js';

// Regex split: SD-/QF-/PAT- anchored on word boundaries; #\d+ anchored on
// non-digit-prefix instead of \b (since `#` is non-word, \b doesn't anchor it).
const TICKET_REF_RE = /\b(?:SD|QF|PAT)-[A-Z0-9-]+\b|(?:^|[^\d])#\d+/i;

/**
 * Validate that a PRD object can be safely passed to extractTargetFiles.
 * The orphaned module silently swallows null/undefined inputs; this surfaces
 * problems explicitly so a caller can decide whether to skip or error.
 *
 * @param {*} prd
 * @returns {{valid: boolean, reason?: string}}
 */
export function validatePrdShape(prd) {
  if (prd == null) return { valid: false, reason: 'PRD is null/undefined' };
  if (typeof prd !== 'object') return { valid: false, reason: `PRD is ${typeof prd}, expected object` };
  // Empty PRD is technically valid — extractor will return an empty Set
  return { valid: true };
}

/**
 * Extract changed file paths from a `git diff --name-only` payload (or
 * equivalent newline-separated string). Empty lines are dropped.
 *
 * @param {string} gitDiffOutput
 * @returns {string[]}
 */
export function extractChangedFiles(gitDiffOutput) {
  if (!gitDiffOutput || typeof gitDiffOutput !== 'string') return [];
  return gitDiffOutput
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Get the file-set shipped by a single merge commit.
 * Uses `git diff <sha>^..<sha> --name-only` (handles squash merges and merges).
 * For root commits the parent ref is unavailable — returns [] in that case.
 *
 * @param {string} sha - merge commit SHA
 * @param {{cwd?: string}} [opts]
 * @returns {string[]}
 */
export function getDiffForCommit(sha, opts = {}) {
  if (!sha || typeof sha !== 'string') return [];
  const execOpts = { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] };
  if (opts.cwd) execOpts.cwd = opts.cwd;
  try {
    const out = execSync(`git diff --name-only ${sha}^..${sha}`, execOpts);
    return extractChangedFiles(out);
  } catch {
    // Root commit, missing ref, or shallow clone — surface as empty
    return [];
  }
}

/**
 * Match a path against any glob pattern from the high-risk registry.
 *
 * @param {string} filePath
 * @param {string[]} [patterns]
 * @returns {boolean}
 */
export function isHighRisk(filePath, patterns) {
  const list = patterns ?? getHighRiskPatterns();
  return list.some(p => minimatch(filePath, p, { dot: true, matchBase: false }));
}

/**
 * Classify an array of overlapping files into high-risk vs medium-risk buckets.
 *
 * @param {string[]} overlapFiles
 * @param {string[]} [patterns]
 * @returns {{high: string[], medium: string[]}}
 */
export function classifyOverlap(overlapFiles, patterns) {
  const high = [];
  const medium = [];
  for (const f of overlapFiles) {
    if (isHighRisk(f, patterns)) high.push(f);
    else medium.push(f);
  }
  return { high, medium };
}

/**
 * Parse CLI argv for `--acknowledge-cross-sd-overlap` and `--ack-reason`.
 * Mutates nothing. Designed to be called inside handoff.js arg parsing.
 *
 * Returns:
 *   acknowledged: true if both the flag and a non-empty reason are present
 *   reason:       the trimmed reason string (or null)
 *   ticketRefValid: true when reason cites an SD/QF/PAT/#issue identifier
 *
 * @param {string[]} argv
 */
export function parseAckFlags(argv) {
  const out = { acknowledged: false, reason: null, ticketRefValid: false };
  if (!Array.isArray(argv)) return out;
  const flagIdx = argv.indexOf('--acknowledge-cross-sd-overlap');
  if (flagIdx === -1) return out;
  out.acknowledged = true;
  const reasonIdx = argv.indexOf('--ack-reason');
  if (reasonIdx !== -1 && argv[reasonIdx + 1]) {
    const raw = String(argv[reasonIdx + 1]).trim();
    if (raw.length > 0) {
      out.reason = raw;
      out.ticketRefValid = TICKET_REF_RE.test(raw);
    }
  }
  return out;
}

/**
 * Query SDs that completed within the temporal window. Excludes self.
 *
 * @param {Object} supabase
 * @param {string} currentSdUuid - UUID of the SD whose handoff is running
 * @param {number} [windowMs] - lookback window in milliseconds (defaults to env-driven config)
 * @returns {Promise<Array<{id: string, sd_key: string, completed_at: string, status: string, title: string, metadata: object|null}>>}
 */
export async function listRecentShippedSds(supabase, currentSdUuid, windowMs) {
  const ms = Number.isFinite(windowMs) ? windowMs : getWindowMs();
  if (ms <= 0) return [];
  const since = new Date(Date.now() - ms).toISOString();
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, completed_at, status, title, metadata')
    .in('status', ['completed', 'shipped'])
    .gte('completed_at', since)
    .neq('id', currentSdUuid);
  if (error) return [];
  return data || [];
}

/**
 * Append an FR-5 metadata entry to sd_phase_handoffs.metadata.cross_sd_overlap[].
 * Always non-blocking — gate result is preserved even if persistence fails.
 *
 * @param {Object} supabase
 * @param {string} handoffId - sd_phase_handoffs.id of the handoff being executed
 * @param {Object} entry - structured per FR-5
 */
export async function appendOverlapMetadata(supabase, handoffId, entry) {
  if (!supabase || !handoffId || !entry) return;
  try {
    const { data: existing } = await supabase
      .from('sd_phase_handoffs')
      .select('metadata')
      .eq('id', handoffId)
      .single();
    const metadata = existing?.metadata && typeof existing.metadata === 'object' ? { ...existing.metadata } : {};
    const list = Array.isArray(metadata.cross_sd_overlap) ? [...metadata.cross_sd_overlap] : [];
    list.push({ ...entry, checked_at: entry.checked_at || new Date().toISOString() });
    metadata.cross_sd_overlap = list;
    await supabase.from('sd_phase_handoffs').update({ metadata }).eq('id', handoffId);
  } catch {
    // Telemetry-only path; never block the gate
  }
}

/**
 * Build a structured FR-5 entry for a single colliding-SD detection.
 *
 * @param {Object} args
 * @param {'PLAN-TO-EXEC'|'LEAD-FINAL-APPROVAL'} args.phase
 * @param {string} args.collidingSdKey
 * @param {string[]} args.overlappingFiles
 * @param {'high'|'medium'|'low'|'none'} args.riskTier
 * @param {'PASS'|'WARN'|'FAIL'} args.verdict
 * @param {string|null} [args.acknowledgedAt]
 * @param {string|null} [args.ackReason]
 */
export function buildOverlapEntry({ phase, collidingSdKey, overlappingFiles, riskTier, verdict, acknowledgedAt = null, ackReason = null }) {
  return {
    phase,
    colliding_sd_key: collidingSdKey,
    overlapping_files: overlappingFiles,
    risk_tier: riskTier,
    verdict,
    acknowledged_at: acknowledgedAt,
    ack_reason: ackReason,
    checked_at: new Date().toISOString(),
  };
}

/**
 * Determine the overall gate verdict given per-SD overlap classifications and
 * acknowledgment state.
 *
 * Rules:
 *   - Any high-risk overlap        => FAIL (no bypass; FR-4)
 *   - Medium-risk + acknowledged   => PASS-WITH-ACK (FR-3)
 *   - Medium-risk + not ack'd      => WARN (block until ack provided)
 *   - No overlap                   => PASS
 */
export function decideVerdict(overlapEntries, ackState) {
  if (!overlapEntries || overlapEntries.length === 0) {
    return { verdict: 'PASS', risk_tier: 'none' };
  }
  const anyHigh = overlapEntries.some(e => e.risk_tier === 'high');
  if (anyHigh) return { verdict: 'FAIL', risk_tier: 'high' };
  if (ackState && ackState.acknowledged && ackState.reason && ackState.ticketRefValid) {
    return { verdict: 'PASS', risk_tier: 'medium' };
  }
  return { verdict: 'WARN', risk_tier: 'medium' };
}

/**
 * Re-export FR-1 extractor so consumers don't need a second import.
 */
export { extractTargetFiles };
