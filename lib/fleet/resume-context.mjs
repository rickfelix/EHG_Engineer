/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-3 — restart that carries the conversation.
 *
 * THE RESUME TOKEN IS claude_sessions.session_id. NOT metadata.resume_uuid, which is populated
 * on 1 of 13,025 rows — anything reading it silently cold-starts on essentially every seat.
 * resolveResumePlan never consults it, and a test pins that.
 *
 * TWO PATHS THAT MUST NOT BE CONFLATED — this is the subtle half of FR-3:
 *
 *   launch_cwd     WHERE THE RESUMED SEAT RUNS. A worktree-launched seat must come back up in
 *                  ITS worktree. There is no launch_cwd persisted today, and resume appears to
 *                  work only by coincidence because every seat currently sits in the main tree.
 *                  Without it a worktree seat resumes into the wrong directory and finds
 *                  nothing — silently.
 *
 *   transcript dir WHERE THE CONVERSATION FILE LIVES: ~/.claude/projects/<slug>/<id>.jsonl,
 *                  where <slug> is derived from the MAIN repo root — NOT from the seat's cwd.
 *                  attribute-tokens.mjs states it outright: "worktree cwds derive a different —
 *                  wrong — project dir". Derive the slug from a worktree path and the existence
 *                  check looks in a directory that never exists, reports "no transcript", and
 *                  cold-starts EVERY worktree seat forever while looking correct.
 *
 * So the same restart needs the worktree path for cwd and the main-tree path for the transcript.
 * Passing one where the other belongs fails silently in both directions.
 *
 * VERIFY BEFORE PROMISING. A missing transcript means cold start, and the caller must SAY SO.
 * Reporting a resume that did not happen is worse than the cold start itself: the operator
 * believes the context survived and acts on that belief.
 */

import path from 'node:path';
import os from 'node:os';

/** Claude Code project-dir name: every non-alphanumeric char becomes '-'. */
export function projectDirName(repoPath) {
  return String(repoPath).replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Absolute transcript path for a session.
 * @param {{sessionId:string, mainRepoRoot:string, homeDir?:string}} o
 *   mainRepoRoot MUST be the main worktree root (git rev-parse --git-common-dir), never a
 *   .worktrees/<id> path — see the header.
 */
export function transcriptPathFor({ sessionId, mainRepoRoot, homeDir = os.homedir() }) {
  if (!sessionId || !mainRepoRoot) return null;
  return path.join(homeDir, '.claude', 'projects', projectDirName(mainRepoRoot), `${sessionId}.jsonl`);
}

/** A worktree path is never a valid transcript-slug source. Cheap, explicit guard. */
export function looksLikeWorktreePath(p) {
  return typeof p === 'string' && /[\\/]\.worktrees[\\/]/.test(p);
}

/**
 * Decide how a restart should launch. Pure — all IO is done by the caller and passed in.
 *
 * @param {{
 *   sessionId: string,
 *   transcriptExists: boolean,
 *   launchCwd: string|null,
 *   newSessionId: string,          // freshly minted id for the FORK
 *   mainRepoRoot?: string,
 * }} o
 * @returns {{mode:'fork'|'cold', resumeUuid:string|null, sessionId:string, cwd:string|null,
 *           carriesContext:boolean, report:string, warnings:string[]}}
 */
export function resolveResumePlan({ sessionId, transcriptExists, launchCwd, newSessionId, mainRepoRoot }) {
  const warnings = [];

  if (mainRepoRoot && looksLikeWorktreePath(mainRepoRoot)) {
    // Loud, because the failure it causes is silent: every worktree seat would cold-start.
    warnings.push(
      `mainRepoRoot looks like a worktree path (${mainRepoRoot}); the transcript slug must come ` +
      'from the MAIN repo root or the existence check searches a directory that never exists'
    );
  }
  if (!launchCwd) {
    warnings.push('no launch_cwd recorded — the replacement will start in the default directory, which is wrong for any worktree-launched seat');
  }

  if (!sessionId) {
    return {
      mode: 'cold', resumeUuid: null, sessionId: newSessionId, cwd: launchCwd || null,
      carriesContext: false, report: 'COLD START: no session id to resume from.', warnings,
    };
  }

  if (!transcriptExists) {
    return {
      mode: 'cold', resumeUuid: null, sessionId: newSessionId, cwd: launchCwd || null,
      carriesContext: false,
      // Said out loud on purpose: a silent cold start lets the operator believe context survived.
      report: `COLD START: no transcript file for ${sessionId} — the conversation could NOT be carried over.`,
      warnings,
    };
  }

  return {
    // FORK, not re-register. Re-registering under the OLD id would let a health check pass
    // against the old row's still-warm heartbeat, so a dead seat would look alive.
    mode: 'fork',
    resumeUuid: sessionId,
    sessionId: newSessionId,
    cwd: launchCwd || null,
    carriesContext: true,
    report: `RESUME: forking ${sessionId} into ${newSessionId} against a verified transcript.`,
    warnings,
  };
}

/**
 * Launch flags for a plan. A fork carries BOTH --resume (the conversation) and a fresh
 * --session-id (the new identity) — that pairing is what makes it a fork rather than the
 * mutually-exclusive resume-in-place buildSessionLaunch documents.
 */
export function resumeLaunchFlags(plan) {
  if (!plan || plan.mode !== 'fork') return [];
  return ['--fork-session', '--resume', plan.resumeUuid, '--session-id', plan.sessionId];
}
