// QF-20260903-936: shared by lib/claim/release-claim-both-surfaces.mjs and
// lib/fleet/best-effort-release.mjs. Neither release path (nor the release_sd /
// release_sd_by_key RPCs they call) touch the filesystem or the git worktree registration for a
// worktree already provisioned against the claim being released -- a claim-then-release cycle
// with zero work done silently leaks a full worktree pool slot, with nothing in the DB pointing
// back at the orphaned tree.
//
// Best-effort, deduped (via recordFinding's own subject-keyed window), never blocks or throws:
// replaces the interim "releasing seat must remember to name the path in a manual /signal"
// control with an automatic one, so discovery no longer depends on the releasing worker's
// memory. Deliberately does NOT remove the worktree itself here -- a prior incident (a worktree
// removed inline at release time, then reclaimed moments later by a different seat) is why this
// fleet's standing rule is signal+reaper only, never a hand-rolled removal.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Looked up per-call (not destructured at module load) so a test can monkeypatch
// sink.recordFinding on the shared CJS module.exports object.
const sink = require('./sweep-findings-sink.cjs');

export function recordOrphanedWorktree(sb, { sdKey, holder, worktreePath, worktreeBranch, reason }) {
  if (!worktreePath) return;
  sink.recordFinding(sb, {
    findingClass: 'released_claim_worktree_orphan',
    subject: worktreePath,
    summary: `Claim on ${sdKey} released (holder ${holder}, reason=${reason}) but its worktree ` +
      `at ${worktreePath} (branch ${worktreeBranch || 'unknown'}) was not removed -- verify it ` +
      `carries no unique commits before reclaiming via the reaper.`,
    severity: 'low',
  }).catch(() => { /* fail-soft: recording must never affect the release outcome */ });
}
