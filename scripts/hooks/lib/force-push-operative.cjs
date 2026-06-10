'use strict';

/**
 * ENF-15 operative force-push detection (QF-20260610-541, feedback 00934869).
 *
 * FORCE_PUSH_RE keeps a literal newline in its boundary class (QF-20260525-345 verified
 * that dropping it false-negatives a real `git push --force` on its own line of a
 * multi-line block). But that same newline made a line INSIDE a `git commit -m` quoted
 * body or a heredoc body look like an operative command — a commit message that merely
 * DOCUMENTS a force-push was blocked with reason=bare_force_disallowed.
 *
 * Fix: strip documentary content BEFORE matching, leave the regex untouched:
 *   - quoted strings attached to message-bearing flags (-m/-F/-c + long forms / --body),
 *     including multi-line quoted bodies;
 *   - heredoc bodies — UNLESS the heredoc start line mentions a shell interpreter
 *     (`bash <<EOF`, `cat <<EOF | sh`), whose body IS executed and must keep matching.
 * Pure module (mirrors supabase-operative.cjs) so it is unit-testable — the hook runs
 * main() at load.
 */

// Verbatim ENF-15 regex from pre-tool-enforce.cjs (QF-20260525-345 boundary class:
// start-of-command or true shell separator; no bare space, no backtick; newline KEPT).
const FORCE_PUSH_RE = /(?:^|[;&|(\n]|&&|\|\|)\s*git\s+push\b[^\n]*--force\b/;

// Quoted payloads of message/content flags. Double-quoted bodies may span newlines and
// contain escaped quotes; single-quoted bodies span newlines (POSIX). Replaced with "".
const FLAG_STRING_RE = /(\s(?:-m|-F|-c|--message|--file|--body)(?:=|\s+))("(?:[^"\\]|\\[\s\S])*"|'[^']*')/g;

const HEREDOC_START_RE = /<<(-)?\s*(["']?)([A-Za-z_][A-Za-z0-9_]*)\2/;
// A shell interpreter anywhere on the heredoc start line means the body is EXECUTED
// (`bash <<EOF`, `cat <<EOF | sh`) — fail toward keeping the gate: do not strip it.
const SHELL_RUNNER_RE = /(?:^|[\s;&|(])(?:bash|sh|zsh|dash|ksh|pwsh|powershell)(?:\.exe)?\b/i;

function stripFlagStrings(text) {
  return text.replace(FLAG_STRING_RE, '$1""');
}

function stripHeredocBodies(text) {
  const lines = text.split('\n');
  const out = [];
  let term = null;
  let allowIndent = false;
  for (const line of lines) {
    if (term !== null) {
      const probe = (allowIndent ? line.replace(/^\t+/, '') : line).replace(/\r$/, '');
      if (probe === term) term = null;
      continue; // body + terminator dropped
    }
    const m = line.match(HEREDOC_START_RE);
    if (m && !SHELL_RUNNER_RE.test(line)) {
      term = m[3];
      allowIndent = m[1] === '-';
    }
    out.push(line); // the start line itself stays (it is the operative part)
  }
  return out.join('\n');
}

/** `cmd` with documentary content removed; what ENF-15 should actually match against. */
function stripDocumentaryContent(cmd) {
  return stripHeredocBodies(stripFlagStrings(cmd));
}

/** True when `cmd` contains an OPERATIVE `git push … --force` (not a quoted mention). */
function isOperativeForcePush(cmd) {
  if (typeof cmd !== 'string' || cmd.length === 0) return false;
  return FORCE_PUSH_RE.test(stripDocumentaryContent(cmd));
}

module.exports = { FORCE_PUSH_RE, stripDocumentaryContent, isOperativeForcePush };
