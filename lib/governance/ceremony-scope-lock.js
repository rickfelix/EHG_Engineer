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
]);

// QF-20260830-283 (chairman ratification 0daf3bd8, item iii): .claude/settings.json moved off the
// blanket PATH_BAN onto a content-level check -- hook command strings are worker-editable; the
// Stop-hook array and the completion/post-completion enforcement entries stay chairman-locked.
export const SETTINGS_JSON_PATH = '.claude/settings.json';
const PROTECTED_HOOK_EVENT = 'Stop';
const PROTECTED_COMMAND_PATTERN = /post-completion-tail-enforcement\.cjs|stop-subagent-enforcement/;
// Only "hooks" may differ at all -- env/statusLine/permissions/any future top-level key must be
// byte-identical, or the change is refused naming that key (fail closed on the unknown case too).
const EDITABLE_TOP_KEYS = new Set(['hooks']);

export const WITNESS_CONTENT_FILE = 'scripts/capture-completion-flags.js';
const WITNESS_MARKER = /completion_flag_witness/;

/**
 * Content-level verdict for a .claude/settings.json change (ratification 0daf3bd8/iii).
 * ALLOWS command-string-only edits to non-protected hook entries; REFUSES everything else,
 * naming the protected key it tripped on (parameterized-guard rule).
 * @param {string} oldText raw settings.json text at base
 * @param {string} newText raw settings.json text at HEAD
 * @returns {{ pass: boolean, protectedKey: string|null }}
 */
export function evaluateSettingsJsonChange(oldText, newText) {
  let oldObj, newObj;
  try {
    oldObj = JSON.parse(oldText);
    newObj = JSON.parse(newText);
  } catch {
    return { pass: false, protectedKey: 'settings.json (unparseable)' };
  }

  for (const key of new Set([...Object.keys(oldObj), ...Object.keys(newObj)])) {
    if (!EDITABLE_TOP_KEYS.has(key) && JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
      return { pass: false, protectedKey: key };
    }
  }

  const oldHooks = oldObj.hooks || {};
  const newHooks = newObj.hooks || {};
  for (const event of new Set([...Object.keys(oldHooks), ...Object.keys(newHooks)])) {
    const oldGroups = oldHooks[event] || [];
    const newGroups = newHooks[event] || [];
    if (event === PROTECTED_HOOK_EVENT) {
      if (JSON.stringify(oldGroups) !== JSON.stringify(newGroups)) {
        return { pass: false, protectedKey: `hooks.${event}` };
      }
      continue;
    }
    const oldFlat = oldGroups.flatMap((g) => g.hooks || []);
    const newFlat = newGroups.flatMap((g) => g.hooks || []);
    if (oldFlat.length !== newFlat.length) {
      return { pass: false, protectedKey: `hooks.${event} (hook entry added/removed)` };
    }
    for (let i = 0; i < oldFlat.length; i += 1) {
      const { command: aCmd, ...aRest } = oldFlat[i];
      const { command: bCmd, ...bRest } = newFlat[i];
      if (JSON.stringify(aRest) !== JSON.stringify(bRest)) {
        return { pass: false, protectedKey: `hooks.${event}[${i}] (non-command field changed)` };
      }
      if ((PROTECTED_COMMAND_PATTERN.test(aCmd) || PROTECTED_COMMAND_PATTERN.test(bCmd)) && aCmd !== bCmd) {
        return { pass: false, protectedKey: `hooks.${event}[${i}].command (protected enforcement hook)` };
      }
    }
  }
  return { pass: true, protectedKey: null };
}

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
 * @param {{oldText: string, newText: string}|null} [settingsJsonTexts] base/HEAD text for
 *   SETTINGS_JSON_PATH when it's in changedFiles; a fetch failure must be passed as null, which
 *   fails closed (a real diff we can't resolve is treated as a protected-key violation).
 * @returns {{ pass: boolean, bannedTouches: string[], witnessMarkerLost: boolean, settingsJsonProtectedKey: string|null }}
 */
export function evaluateCeremonyScopeLock(changedFiles, witnessDiffText, settingsJsonTexts) {
  const bannedTouches = findBannedTouches(changedFiles);
  const witnessMarkerLost = witnessDiffText != null && hasNetWitnessMarkerLoss(witnessDiffText);

  let settingsJsonProtectedKey = null;
  const files = Array.isArray(changedFiles) ? changedFiles : [];
  if (files.includes(SETTINGS_JSON_PATH)) {
    if (!settingsJsonTexts) {
      settingsJsonProtectedKey = 'settings.json (diff unresolvable)';
    } else {
      const result = evaluateSettingsJsonChange(settingsJsonTexts.oldText, settingsJsonTexts.newText);
      if (!result.pass) settingsJsonProtectedKey = result.protectedKey;
    }
  }

  return {
    pass: bannedTouches.length === 0 && !witnessMarkerLost && !settingsJsonProtectedKey,
    bannedTouches,
    witnessMarkerLost,
    settingsJsonProtectedKey,
  };
}
