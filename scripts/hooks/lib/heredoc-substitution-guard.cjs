'use strict';

/**
 * ENF-19 unquoted-heredoc-with-command-substitution detection (QF-20260912-632).
 *
 * THE INCIDENT THIS EXISTS FOR: role seats append their .claude/*-session-state-*.md records
 * through raw shell heredocs (no append helper existed at authoring time). An UNQUOTED heredoc
 * delimiter (`<<EOF`, `<<-EOF`, `<<TAG`) lets the shell expand backticks and `$(...)` inside the
 * body before it is written -- a pasted command line inside record TEXT becomes an EXECUTED one.
 * Measured 2026-09-12 on the Adam seat: three such expansions in one night, one issuing a live
 * single-use apply token with no chairman verbal (voided within 2 minutes, disclosed). A QUOTED
 * delimiter (`<<'EOF'` or `<<"EOF"`) disables ALL shell expansion inside the body -- the standard,
 * correct fix -- so this guard only ever fires on the unquoted form.
 *
 * Mirrors lib/one-off-bare-import.cjs (ENF-18) / force-push-operative.cjs (ENF-15): a pure,
 * unit-testable decision module. The hook (pre-tool-enforce.cjs) owns audit-logging and the
 * block/allow exit; this module owns detection only.
 *
 * SCOPE: `$VAR` / `${VAR}` expansion alone is LEFT ALONE (that is ordinary, expected heredoc
 * behavior, not the incident class) -- only a backtick or `$(` inside an UNQUOTED heredoc body
 * blocks. printf and plain (non-heredoc) commands are untouched. No bypass flag: a seat that
 * genuinely needs substitution inside the body composes the value with printf first, or quotes
 * the delimiter and forgoes substitution.
 *
 * KNOWN GAPS (documented, not silently claimed closed, matching ENF-18's own convention): this is
 * a line-based, regex/string detector, not a shell parser. It does not handle: multiple heredocs
 * on one command; a heredoc delimiter that itself contains characters requiring escaping; nested
 * heredocs; or a delimiter line indented with SPACES under `<<-` (only leading TABS are stripped,
 * per POSIX `<<-` semantics). Every gap degrades to today's (pre-ENF-19) status quo, never worse.
 */

// Matches a heredoc START at the end of a line: `<<` or `<<-`, optional whitespace, an optional
// single/double quote, a shell-identifier-shaped tag, the SAME quote char again (if any), then
// end of line. Capture group 1 is the quote char (empty string if unquoted) -- this is the whole
// discriminator between "shell expands the body" (unquoted) and "shell never touches it" (quoted).
const HEREDOC_START_RE = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_-]*)\1\s*$/;

/**
 * Split `cmd` into lines and collect every heredoc block: its tag, whether the delimiter was
 * quoted, and its body text (the lines between the opening `<<TAG` line and the terminator line).
 * @param {string} cmd
 * @returns {Array<{tag: string, quoted: boolean, body: string, terminatorFound: boolean}>}
 */
function findHeredocs(cmd) {
  const lines = String(cmd || '').split('\n');
  const heredocs = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEREDOC_START_RE);
    if (!m) continue;
    const quoted = m[1].length > 0;
    const tag = m[2];
    const bodyLines = [];
    let terminatorFound = false;
    let j = i + 1;
    for (; j < lines.length; j++) {
      // `<<-` strips leading TABS (never spaces) from the terminator line before comparing.
      const strippedForDash = lines[j].replace(/^\t+/, '');
      if (lines[j] === tag || strippedForDash === tag) { terminatorFound = true; break; }
      bodyLines.push(lines[j]);
    }
    heredocs.push({ tag, quoted, body: bodyLines.join('\n'), terminatorFound });
    i = j;
  }
  return heredocs;
}

/**
 * Decide whether `cmd` contains an operative violation: an UNQUOTED heredoc whose body contains
 * a backtick or a `$(` command-substitution open.
 * @param {string} cmd
 * @returns {{matched: false} | {matched: true, outcome: 'block', tag: string, reason: string, quotedForm: string}}
 */
function decideHeredocSubstitution(cmd) {
  for (const h of findHeredocs(cmd)) {
    if (h.quoted) continue; // quoted delimiter -- shell performs zero expansion in the body
    const hasBacktick = h.body.includes('`');
    const hasCmdSub = h.body.includes('$(');
    if (!hasBacktick && !hasCmdSub) continue;
    return {
      matched: true,
      outcome: 'block',
      tag: h.tag,
      reason: hasBacktick && hasCmdSub ? 'backtick_and_cmd_sub' : hasBacktick ? 'backtick' : 'cmd_sub',
      quotedForm: `<<'${h.tag}'`,
    };
  }
  return { matched: false };
}

module.exports = { HEREDOC_START_RE, findHeredocs, decideHeredocSubstitution };
