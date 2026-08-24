#!/usr/bin/env node
/**
 * Fleet Commit Trailer (QF-20260703-311)
 *
 * All fleet worker sessions commit under the same git author identity, so a
 * worker seeing a peer's commit on a shared/moved-claim branch reads it as an
 * unattributed background actor. Appends a trailer identifying the current
 * session's fleet callsign so peer commits are attributable at a glance.
 * Author identity is left unchanged for GitHub attribution — trailer-only.
 *
 * SD-LEO-INFRA-STALE-INDEX-LOCK-001: this script previously queried Supabase
 * directly (a Promise.race against a 2000ms setTimeout guard), which was the
 * measured root cause of a recurring Windows libuv UV_HANDLE_CLOSING
 * assertion crash on process.exit(0) — the same defect class already fixed
 * once in lib/heartbeat-manager.mjs's armUnrefInterval() for a ref'd
 * setInterval, here caused by the Supabase client's own handle plus an
 * uncleared setTimeout. Measured: replacing process.exit(0) with
 * process.exitCode+return (the pattern proven safe in a CRON context,
 * scripts/cron/index-jam-detector.mjs:158-163) converts the intermittent
 * crash into a deterministic ~50s hang on every interactive `git commit`,
 * because the abandoned in-flight fetch — not the timer — keeps the event
 * loop open for the network stall the timeout guard existed to survive.
 *
 * Fix: retire the network dependency entirely. The coordinator already
 * maintains a local, always-current fleet-identity cache
 * (scripts/hooks/coordination-inbox.cjs writes fleet-identity-<sessionId>.json
 * on every SET_IDENTITY message) — read that synchronously instead of
 * querying Supabase. No client, no timer, no race, no async handle to leak.
 *
 * Usage: node scripts/append-fleet-commit-trailer.js <commit-msg-file>
 *
 * Fail-open: any missing env var, missing/unreadable/malformed identity
 * file, or missing callsign exits 0 silently — this is cosmetic metadata,
 * never a reason to block a commit.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

/**
 * Resolve the shared repo root, correct whether invoked from the shared
 * checkout OR a worktree. `git rev-parse --git-common-dir` always points at
 * the real (shared) .git directory, even from a worktree whose own .git is a
 * pointer file — unlike a naive `path.resolve(__dirname, '../../.claude')`,
 * which resolves relative to THIS SCRIPT's own location and silently lands
 * on the invoking worktree's own (empty) .claude/ directory instead of the
 * shared root's. CLAUDE_PROJECT_DIR is not a substitute: it is empty in a
 * git-hook execution context (measured).
 *
 * @param {string} cwd - directory to resolve from
 * @returns {string} absolute path to the shared repo root
 */
export function resolveSharedRoot(cwd) {
  const gitCommonDir = execFileSync(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  ).trim();
  return path.dirname(gitCommonDir);
}

/**
 * Read the coordinator-maintained fleet-identity cache for this session and
 * extract its callsign. Returns null on ANY failure (missing file, unreadable,
 * malformed JSON, no callsign field) — the caller fails open identically for
 * all of these, matching the original script's fail-open contract. Stamps
 * whatever callsign is present regardless of session type (worker or
 * role-seat, e.g. "Coordinator") — behavior-preserving with the original
 * script, which never special-cased role sessions either.
 *
 * @param {string} sharedRoot - absolute path to the shared repo root
 * @param {string} sessionId
 * @returns {string|null}
 */
export function readCallsign(sharedRoot, sessionId) {
  try {
    const identityFile = path.join(sharedRoot, '.claude', `fleet-identity-${sessionId}.json`);
    const raw = fs.readFileSync(identityFile, 'utf8');
    const identity = JSON.parse(raw);
    return identity?.callsign || null;
  } catch {
    return null;
  }
}

function main() {
  const msgFile = process.argv[2];
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!msgFile || !sessionId) return;

  try {
    const sharedRoot = resolveSharedRoot(process.cwd());
    const callsign = readCallsign(sharedRoot, sessionId);
    if (!callsign) return;

    const message = fs.readFileSync(msgFile, 'utf8');
    if (message.includes('Fleet-Worker:')) return; // already stamped (amend/retry)

    const trailer = `Fleet-Worker: ${callsign}\nClaude-Session: ${sessionId}`;
    fs.writeFileSync(msgFile, `${message.replace(/\s*$/, '')}\n\n${trailer}\n`);
  } catch {
    // Fail-open — never block a commit over attribution metadata.
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
