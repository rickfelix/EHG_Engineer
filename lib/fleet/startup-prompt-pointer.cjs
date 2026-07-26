// SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-D FR-1 — POINTER-FILE STARTUP TRANSPORT.
//
// THE PROBLEM THIS SOLVES, MEASURED NOT ASSUMED. claude.cmd is a BATCH file, so cmd.exe is
// unavoidable in the launch chain, and cmd.exe TERMINATES A MULTI-LINE ARGUMENT AT THE FIRST LF.
// Measured from a live canary transcript: 97 characters / 1 line delivered against a 958-char,
// 6-line constant. The worker directive degraded to a /loop with ZERO steps, after which every
// worker falls back to CLAUDE.md and starts claiming DRAFT SDs unattended, fleet-wide.
//
// WHY A POINTER AND NOT A BIGGER/ESCAPED ARGUMENT (metadata.transport_decision): wt.exe is also in
// the chain (`wt.exe -w new new-tab -d <dir> -- <cmd> <args>`) and re-parses the commandline.
// Direct-CLI removes one KNOWN truncator and leaves a second UNVERIFIED one. A single-line pointer
// is immune BY CONSTRUCTION to every layer — cmd.exe, wt.exe, and any future shim.
//
// BOTH HOPS ARE NOW MEASURED (metadata.fr1_transport_hops_measured), because "immune by
// construction" is a prediction until someone runs it:
//   HOP A: a single-line positional arrives BYTE-INTACT through the real wt.exe -> cmd.exe chain.
//          Control arm: the same probe with a 3-line payload delivered only its first line, so the
//          probe could have said otherwise and it reproduces the original defect independently.
//   HOP B: Claude Code, given "Read the file X ... and follow it", READS the file and ACTS on its
//          contents — verified with a token that existed only inside the file, never in the prompt.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Pointer files live beside the other per-session spawn artifacts. Gitignored — see .gitignore. */
const PROMPT_DIR_REL = path.join('.claude', 'fleet-prompts');

/** Keep the N newest files, mirroring capture-session-id.cjs's retain-by-mtime sweep. */
const RETAIN_NEWEST = 5;

/**
 * MINIMUM AGE BEFORE A FILE IS ELIGIBLE FOR SWEEPING — this is NOT belt-and-braces, it is load
 * bearing, and retain-N ALONE IS UNSAFE HERE. The session-identity precedent sweeps markers written
 * by a session that has ALREADY started. A pointer file is the opposite: it is written BEFORE the
 * session exists and is read at its first turn, so there is a live window where the file must
 * survive. With a fleet of several workers, more than RETAIN_NEWEST spawns can easily occur inside
 * that window, and a pure retain-N sweep would delete a pending session's pointer out from under
 * it — producing exactly the dangling pointer this module exists to make safe.
 */
const MIN_SWEEP_AGE_MS = 15 * 60 * 1000;

/**
 * Build the SINGLE-LINE pointer that becomes the launcher's trailing positional.
 *
 * Two things are deliberate:
 *  1. It is ONE LINE. assertSingleLinePrompt is applied to the result by the caller so this can
 *     never silently regress into a multi-line value.
 *  2. IT CARRIES ITS OWN DANGLING-POINTER INSTRUCTION. If the file is missing, the session is told
 *     to IDLE rather than improvise. That direction matters: a session that improvises without its
 *     directive falls back to CLAUDE.md and starts claiming work — the exact fleet-wide hazard.
 *     Failing toward "do nothing" is always recoverable; failing toward "claim something" is not.
 */
function buildPointerLine(promptFilePath) {
  const p = String(promptFilePath).replace(/\\/g, '/');
  return `Read the file ${p} and follow the instructions in it exactly — it is your startup directive. `
    + 'If that file does not exist or is empty, do NOT improvise, do NOT read other instructions, and do '
    + 'NOT claim or start any work: report that the startup directive was missing and remain idle.';
}

/**
 * Write a session's startup prompt to its own pointer file.
 * @param {{repoRoot:string, sessionId:string, prompt:string}} spec
 * @returns {{promptFilePath:string, pointerLine:string}}
 */
function writeStartupPromptFile({ repoRoot, sessionId, prompt }) {
  if (typeof prompt !== 'string' || prompt.length === 0) {
    throw new Error('writeStartupPromptFile: prompt must be a non-empty string');
  }
  if (!sessionId || !/^[A-Za-z0-9._-]+$/.test(String(sessionId))) {
    // Guards path traversal: the id becomes a filename and is minted spawner-side, so a malformed
    // one is a bug worth failing on rather than sanitising into something silently different.
    throw new Error(`writeStartupPromptFile: unsafe sessionId ${JSON.stringify(sessionId)}`);
  }

  const dir = path.join(repoRoot, PROMPT_DIR_REL);
  fs.mkdirSync(dir, { recursive: true });
  const promptFilePath = path.join(dir, `${sessionId}.txt`);
  fs.writeFileSync(promptFilePath, prompt, 'utf8');

  // VERIFY THE WRITE LANDED before handing out a pointer to it. A pointer to a file that was never
  // written is precisely the dangling case, and it is cheap to rule out here rather than discover
  // it in a spawned session's first turn.
  if (!fs.existsSync(promptFilePath)) {
    throw new Error(`writeStartupPromptFile: wrote ${promptFilePath} but it does not exist`);
  }
  return { promptFilePath, pointerLine: buildPointerLine(promptFilePath) };
}

/**
 * Delete stale pointer files. Best-effort and never throws: a failed sweep must not fail a spawn.
 * @returns {{deleted:string[], kept:number}}
 */
function sweepStartupPromptFiles({ repoRoot, now = Date.now(), retain = RETAIN_NEWEST, minAgeMs = MIN_SWEEP_AGE_MS } = {}) {
  const dir = path.join(repoRoot, PROMPT_DIR_REL);
  const deleted = [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.txt'))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return { deleted, kept: 0 }; // no dir yet — nothing to sweep
  }

  entries.forEach((e, i) => {
    // BOTH conditions required. Older-than-retain alone would delete a pending session's pointer.
    if (i < retain) return;
    if (now - e.mtime < minAgeMs) return;
    try { fs.unlinkSync(path.join(dir, e.name)); deleted.push(e.name); } catch { /* best effort */ }
  });
  return { deleted, kept: entries.length - deleted.length };
}

module.exports = {
  buildPointerLine,
  writeStartupPromptFile,
  sweepStartupPromptFiles,
  PROMPT_DIR_REL,
  RETAIN_NEWEST,
  MIN_SWEEP_AGE_MS,
};
