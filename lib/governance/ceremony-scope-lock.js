/**
 * Capture-channel ceremony scope-lock — pure core (SD-LEO-INFRA-CAPTURE-CHANNEL-DISPOSITION-001 FR-5)
 *
 * Pure by design so the diff-parsing logic is unit-testable without shelling out to git for every
 * case (mirrors lib/governance/drain-inventory.js's pure-core/IO-shell split). All IO (running
 * `git diff`) lives in the CLI (scripts/lint/capture-channel-ceremony-scope-lock-lint.mjs).
 */

export const PATH_BAN = Object.freeze([
  'scripts/hooks/post-completion-tail-enforcement.cjs',
  'scripts/hooks/stop-subagent-enforcement/post-completion-validator.js',
  'scripts/hooks/stop-subagent-enforcement.js',
  '.claude/settings.json',
]);

export const WITNESS_CONTENT_FILE = 'scripts/capture-completion-flags.js';
const WITNESS_MARKER = /completion_flag_witness/;

/** Which of the banned ceremony paths appear in a changed-files list. */
export function findBannedTouches(changedFiles) {
  const files = Array.isArray(changedFiles) ? changedFiles : [];
  return files.filter((f) => PATH_BAN.includes(f));
}

/**
 * True when a unified diff for WITNESS_CONTENT_FILE shows a NET LOSS of the completion_flag_witness
 * marker string (more removed occurrences than added). Editing the file for unrelated reasons while
 * the marker count stays even (or grows) is not a finding — only a net loss is.
 *
 * @param {string} diffText raw `git diff -U0` output for WITNESS_CONTENT_FILE
 * @returns {boolean}
 */
export function hasNetWitnessMarkerLoss(diffText) {
  if (!diffText) return false;
  let removed = 0;
  let added = 0;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('-') && !line.startsWith('---') && WITNESS_MARKER.test(line)) removed += 1;
    if (line.startsWith('+') && !line.startsWith('+++') && WITNESS_MARKER.test(line)) added += 1;
  }
  return removed > added;
}

/**
 * Full verdict given the changed-file list and (if WITNESS_CONTENT_FILE changed) its diff text.
 * @param {string[]} changedFiles
 * @param {string|null} witnessDiffText diff text for WITNESS_CONTENT_FILE, or null if untouched
 * @returns {{ pass: boolean, bannedTouches: string[], witnessMarkerLost: boolean }}
 */
export function evaluateCeremonyScopeLock(changedFiles, witnessDiffText) {
  const bannedTouches = findBannedTouches(changedFiles);
  const witnessMarkerLost = witnessDiffText != null && hasNetWitnessMarkerLoss(witnessDiffText);
  return { pass: bannedTouches.length === 0 && !witnessMarkerLost, bannedTouches, witnessMarkerLost };
}
