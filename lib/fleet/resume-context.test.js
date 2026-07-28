// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-3 — resume context resolution.

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  transcriptPathFor,
  projectDirName,
  looksLikeWorktreePath,
  resolveResumePlan,
  resumeLaunchFlags,
} from './resume-context.mjs';

const MAIN = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer';
const WT = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-X';
const HOME = 'C:/Users/rickf';

describe('FR3-PATH: the transcript slug comes from the MAIN root, never a worktree', () => {
  it('derives the documented slug shape', () => {
    // Verified against real disk: ~/.claude/projects/C--Users-rickf-Projects--EHG-EHG-Engineer
    expect(projectDirName(MAIN)).toBe('C--Users-rickf-Projects--EHG-EHG-Engineer');
  });

  it('builds the transcript path under the main-root slug', () => {
    const p = transcriptPathFor({ sessionId: 'abc', mainRepoRoot: MAIN, homeDir: HOME });
    expect(p).toBe(path.join(HOME, '.claude', 'projects', 'C--Users-rickf-Projects--EHG-EHG-Engineer', 'abc.jsonl'));
  });

  it('a WORKTREE root yields a DIFFERENT slug — which is why it must not be used', () => {
    // This is the silent failure: the derived directory never exists, so the existence check
    // reports "no transcript" and cold-starts every worktree seat while looking correct.
    expect(projectDirName(WT)).not.toBe(projectDirName(MAIN));
    expect(looksLikeWorktreePath(WT)).toBe(true);
    expect(looksLikeWorktreePath(MAIN)).toBe(false);
  });

  it('warns loudly when handed a worktree path as the slug source', () => {
    const plan = resolveResumePlan({
      sessionId: 'abc', transcriptExists: true, launchCwd: WT, newSessionId: 'new', mainRepoRoot: WT,
    });
    expect(plan.warnings.join(' ')).toMatch(/must come from the MAIN repo root/);
  });
});

describe('FR3-VERIFY: a missing transcript cold-starts AND says so', () => {
  it('cold-starts when the transcript is absent', () => {
    const plan = resolveResumePlan({ sessionId: 'abc', transcriptExists: false, launchCwd: WT, newSessionId: 'new' });
    expect(plan.mode).toBe('cold');
    expect(plan.carriesContext).toBe(false);
    expect(plan.resumeUuid).toBeNull();
  });

  it('SAYS it cold-started — silence would let the operator believe context survived', () => {
    const plan = resolveResumePlan({ sessionId: 'abc', transcriptExists: false, launchCwd: WT, newSessionId: 'new' });
    expect(plan.report).toMatch(/COLD START/);
    expect(plan.report).toMatch(/could NOT be carried over/);
  });

  it('never promises carry-over it did not verify', () => {
    const plan = resolveResumePlan({ sessionId: 'abc', transcriptExists: false, launchCwd: WT, newSessionId: 'new' });
    expect(plan.report).not.toMatch(/RESUME:/);
  });
});

describe('FR3-FORK: fork rather than re-register under the old id', () => {
  it('forks the verified transcript into a FRESH session id', () => {
    const plan = resolveResumePlan({ sessionId: 'old', transcriptExists: true, launchCwd: WT, newSessionId: 'fresh', mainRepoRoot: MAIN });
    expect(plan.mode).toBe('fork');
    expect(plan.resumeUuid).toBe('old');   // the conversation
    expect(plan.sessionId).toBe('fresh');  // the identity
    expect(plan.carriesContext).toBe(true);
  });

  it('emits --fork-session with BOTH the old conversation and the new identity', () => {
    const plan = resolveResumePlan({ sessionId: 'old', transcriptExists: true, launchCwd: WT, newSessionId: 'fresh', mainRepoRoot: MAIN });
    expect(resumeLaunchFlags(plan)).toEqual(['--fork-session', '--resume', 'old', '--session-id', 'fresh']);
  });

  it('a cold start carries no resume flags at all', () => {
    const plan = resolveResumePlan({ sessionId: 'old', transcriptExists: false, launchCwd: WT, newSessionId: 'fresh' });
    expect(resumeLaunchFlags(plan)).toEqual([]);
  });
});

describe('FR3-CWD: launch_cwd is the worktree, and its absence is surfaced', () => {
  it('carries the worktree path through as the launch cwd', () => {
    const plan = resolveResumePlan({ sessionId: 'old', transcriptExists: true, launchCwd: WT, newSessionId: 'fresh', mainRepoRoot: MAIN });
    expect(plan.cwd).toBe(WT); // the SEAT runs in its worktree, even though the transcript slug is the main root
  });

  it('warns when no launch_cwd was recorded — today there is none, and resume works by coincidence', () => {
    const plan = resolveResumePlan({ sessionId: 'old', transcriptExists: true, launchCwd: null, newSessionId: 'fresh', mainRepoRoot: MAIN });
    expect(plan.warnings.join(' ')).toMatch(/no launch_cwd recorded/);
  });
});

describe('FR3-TOKEN: metadata.resume_uuid is never consulted', () => {
  it('ignores a resume_uuid even when one is supplied alongside', () => {
    // Populated on 1 of 13,025 rows — anything reading it silently cold-starts.
    const plan = resolveResumePlan({
      sessionId: 'session-token', transcriptExists: true, launchCwd: WT, newSessionId: 'fresh',
      mainRepoRoot: MAIN, resume_uuid: 'DO-NOT-USE-ME',
    });
    expect(plan.resumeUuid).toBe('session-token');
    expect(JSON.stringify(plan)).not.toMatch(/DO-NOT-USE-ME/);
  });

  it('the module CODE contains no read of metadata.resume_uuid', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const raw = readFileSync(fileURLToPath(new URL('./resume-context.mjs', import.meta.url)), 'utf8');
    // Strip comments first: the header explains WHY resume_uuid must not be read, so scanning
    // the raw source would fail on its own rationale — the same trap as searching for a flag
    // NAME instead of its USE.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/metadata\s*[.[]\s*['"]?resume_uuid/);
  });
});
