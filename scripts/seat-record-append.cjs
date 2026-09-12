#!/usr/bin/env node
'use strict';

/**
 * QF-20260912-632 — safe append for a role seat's session-state record.
 *
 *   node scripts/seat-record-append.cjs <role|path> --text @<file> [--section <heading>]
 *
 * THE INCIDENT THIS EXISTS FOR: every role seat previously appended its
 * .claude/*-session-state-*.md record through the Bash tool via a heredoc or printf -- the ONLY
 * path on which a pasted command line inside record TEXT becomes an EXECUTED one (an unquoted
 * heredoc lets the shell expand backticks / $( ) in the body first). This helper never invokes a
 * shell: fs.appendFileSync writes the text as literal bytes, so a body containing a backtick or
 * $( ) is stored verbatim and never runs, no matter what it contains.
 *
 * --text takes @<file> rather than an inline string for the SAME reason role-capture-gate.mjs's
 * --text does (its own header comment): a record body containing quotes, apostrophes, backticks
 * or newlines does not survive shell quoting -- reading it from a file sidesteps the shell
 * entirely on the way in, matching this script's guarantee on the way out.
 *
 * <role|path>: either a bare role name (adam|coordinator|solomon|chairman) -- resolved to the
 * newest matching .claude/<role>-session-state-*.md by mtime (the "live seat" convention already
 * used fleet-wide) -- or an explicit path. Either way the RESOLVED path is validated against
 * SESSION_STATE_RE before any write: this script only ever appends to a real session-state file,
 * never an arbitrary path a caller might pass.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSION_STATE_RE = /^\.claude[\\/][a-z]+-session-state-[0-9a-f]+\.md$/;

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function readTextArg(raw) {
  if (!raw) return null;
  return raw.startsWith('@') ? fs.readFileSync(raw.slice(1), 'utf8') : raw;
}

/** Bare role name -> the newest matching .claude/<role>-session-state-*.md by mtime, or null. */
function resolveByRole(role, claudeDir) {
  let entries;
  try { entries = fs.readdirSync(claudeDir); } catch { return null; }
  const re = new RegExp(`^${role}-session-state-[0-9a-f]+\\.md$`);
  const matches = entries.filter((f) => re.test(f));
  if (matches.length === 0) return null;
  const withMtime = matches.map((f) => {
    const full = path.join(claudeDir, f);
    let mtimeMs = 0;
    try { mtimeMs = fs.statSync(full).mtimeMs; } catch { /* keep 0 -- sorts last */ }
    return { file: f, mtimeMs };
  });
  withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return path.join('.claude', withMtime[0].file);
}

function main() {
  const target = process.argv[2];
  const section = arg('--section');
  const text = readTextArg(arg('--text'));

  if (!target || !text) {
    console.log('Usage: node scripts/seat-record-append.cjs <role|path> --text @<file> [--section <heading>]');
    process.exitCode = 1;
    return;
  }

  const claudeDir = path.resolve(process.cwd(), '.claude');
  const isBareRole = /^[a-z]+$/.test(target);
  const resolved = isBareRole ? resolveByRole(target, claudeDir) : target;

  if (!resolved) {
    console.log(`SEAT_RECORD_APPEND=? state=NOT_FOUND role=${target}`);
    process.exitCode = 1;
    return;
  }

  const normalized = resolved.split(path.sep).join('/');
  if (!SESSION_STATE_RE.test(normalized)) {
    console.log(`SEAT_RECORD_APPEND=? state=REJECTED reason=not_a_session_state_path path=${normalized}`);
    process.exitCode = 1;
    return;
  }

  const absPath = path.resolve(process.cwd(), resolved);
  if (!fs.existsSync(absPath)) {
    console.log(`SEAT_RECORD_APPEND=? state=NOT_FOUND path=${normalized}`);
    process.exitCode = 1;
    return;
  }

  const heading = section ? `\n## ${section}\n\n` : '\n';
  fs.appendFileSync(absPath, heading + text.replace(/\r\n/g, '\n').replace(/\n$/, '') + os.EOL, 'utf8');
  console.log(`SEAT_RECORD_APPEND=${normalized} state=APPENDED bytes=${Buffer.byteLength(text, 'utf8')}`);
}

if (require.main === module) main();

module.exports = { SESSION_STATE_RE, readTextArg, resolveByRole, main };
