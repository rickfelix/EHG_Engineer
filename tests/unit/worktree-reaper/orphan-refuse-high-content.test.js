/**
 * SD-LEO-INFRA-ORPHAN-SWEEP-HARD-001 — ACTIVATION TEST for FR-3.
 *
 * THE INCIDENT: on 2026-08-01T16:01:49Z the orphan sweep ran execute=true and hard-deleted
 * .worktrees/SD-FDBK-INFRA-CLAUDE-SOLOMON-EXCEEDS-001 — 42,162 files / 601,021,494 bytes — which
 * one agent had inspected and refused to remove and the coordinator had explicitly declined to
 * authorise ~34 minutes earlier. reclaimed_count=1, excluded_count=0, no archived copy.
 * (audit_log 0c9875ad, written by the reaper itself.)
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM THE HAPPY-PATH REPLAY — this is the whole point:
 * the originally-stated acceptance replayed the incident with "nested mtimes FRESH". FR-2's
 * recency guard excludes that on its own, so FR-3 never fires and the suite goes green with the
 * FR-3 branch DELETED. A replay that cannot fail when the requirement is removed measures nothing.
 *
 * Four ways this suite could still have false-passed, and what closes each:
 *   A. FR-2's file-count cap and "high file count" are the same dimension — a fixture built to
 *      mirror the incident trips the CAP first and FR-3 is never consulted.
 *      CLOSED BY: fixture sits provably below PROBE_MAX_FILES (asserted), and truncated===false.
 *   B. Bucket folding — asserting on `excluded` passes even if `refused` never ships.
 *      CLOSED BY: asserting refused contains it AND excluded/reapableDirs do not.
 *   C. An outer-layer size/age belt refuses while classifyOrphanDirs still says reapable.
 *      CLOSED BY: driving classifyOrphanDirs directly.
 *   D. Reason-string collision with FR-3b — a failed walk also refusing as 'high_content' would
 *      satisfy the assertion without the content branch running.
 *      CLOSED BY: asserting the failure reason DIFFERS from the content reason.
 *
 * THE DECIDING ASSERTION is the minAgeMs:0 rerun. With the recency guard fully disabled it
 * provably cannot be what refuses the directory, so a refusal there can only come from FR-3.
 *
 * MUTATION RECORD (required by the PRD, run 2026-08-03): commenting out the FR-3 content-refusal
 * branch in lib/worktree-quota.js turns this file RED. Failing titles recorded in the handoff.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { classifyOrphanDirs } from '../../../lib/worktree-quota.js';
import {
  probeContent, PROBE_MAX_FILES, REASON,
  CONTENT_REFUSE_MIN_FILES,
} from '../../../lib/worktree-reaper/orphan-content-probe.mjs';

/** The real probe, bound to the real fs. Never pointed at anything outside the sandbox (TR-3). */
const realProbe = (dir) => probeContent(dir, { fsImpl: fs, pathImpl: path });

let sandbox;
let worktreesDir;
beforeAll(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-fr3-'));
  worktreesDir = path.join(sandbox, '.worktrees');
  fs.mkdirSync(worktreesDir, { recursive: true });
});
afterAll(() => {
  try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { /* best effort */ }
});

/** Unregistered, no .git — the incident's shape. `age` ages EVERY descendant. */
const mkOrphan = (name, fileCount, bytesEach = 1, ageMs = 0) => {
  const root = path.join(worktreesDir, name);
  fs.mkdirSync(root, { recursive: true });
  for (let i = 0; i < fileCount; i++) {
    fs.writeFileSync(path.join(root, `f${i}.txt`), 'x'.repeat(bytesEach));
  }
  if (ageMs > 0) {
    const when = new Date(Date.now() - ageMs);
    for (const f of fs.readdirSync(root)) fs.utimesSync(path.join(root, f), when, when);
    fs.utimesSync(root, when, when);
  }
  return root;
};

const THIRTY_MIN = 30 * 60 * 1000;
const AGED = 38.2 * 60 * 60 * 1000; // the live exposure's actual age

describe('FR-3 — a .git-less directory holding real content is REFUSED, not reaped', () => {
  it('the AGED high-content shape is refused with reason=high_content', () => {
    // THE SHAPE THE ORIGINAL ACCEPTANCE MISSED. Content is 38.2h old — far past any defensible
    // recency window — so FR-2 cannot save it. This is the live 707MB exposure's exact shape.
    mkOrphan('aged-heavy', 10, 600, AGED);
    const r = classifyOrphanDirs(worktreesDir, [], { minAgeMs: THIRTY_MIN, probe: realProbe });

    const hit = r.refused.find((x) => x.dir === 'aged-heavy');
    expect(hit).toBeDefined();
    expect(hit.reason).toBe(REASON.HIGH_CONTENT);          // toBe, not toMatch — vector D
    expect(hit.files).toBe(10);
    // Vector B: it must be in `refused`, and in NEITHER other bucket.
    expect(r.reapableDirs.find((x) => x.dir === 'aged-heavy')).toBeUndefined();
    expect(r.excluded.find((x) => x.dir === 'aged-heavy')).toBeUndefined();
  });

  it('THE DECIDING ASSERTION — still refused with minAgeMs:0, so recency cannot be the decider', () => {
    // With the recency guard fully disabled, a refusal can only come from the FR-3 content branch.
    // Without this, vector A stands: a big fixture could be refused by FR-2's bound and this file
    // would stay green with FR-3 deleted.
    const r = classifyOrphanDirs(worktreesDir, [], { minAgeMs: 0, probe: realProbe });
    const hit = r.refused.find((x) => x.dir === 'aged-heavy');
    expect(hit).toBeDefined();
    expect(hit.reason).toBe(REASON.HIGH_CONTENT);
    expect(r.excluded.find((x) => x.dir === 'aged-heavy')).toBeUndefined();
  });

  it('CONTROL — the fixture sits BELOW the probe cap, so the bound cannot be the cause', () => {
    // Removes vector A conclusively: a cap-driven refusal reports CAP_EXCEEDED, not HIGH_CONTENT,
    // and this fixture never reaches the cap at all.
    const p = realProbe(path.join(worktreesDir, 'aged-heavy'));
    expect(p.ok).toBe(true);
    expect(p.truncated).toBe(false);
    expect(p.files).toBeLessThan(PROBE_MAX_FILES);
    expect(p.files).toBeGreaterThanOrEqual(CONTENT_REFUSE_MIN_FILES);
  });
});

describe('opposite polarity — the sweep must still do its job', () => {
  it('an EMPTY .git-less dir of the same age is still REAPABLE', () => {
    // If everything became refused, the orphan sweep would stop working and the fix would be
    // indistinguishable from disabling it.
    mkOrphan('aged-empty', 0, 0, AGED);
    const r = classifyOrphanDirs(worktreesDir, [], { minAgeMs: THIRTY_MIN, probe: realProbe });
    expect(r.reapableDirs.find((x) => x.dir === 'aged-empty')).toBeDefined();
    expect(r.refused.find((x) => x.dir === 'aged-empty')).toBeUndefined();
  });

  it('a FRESH high-content dir is excluded by RECENCY, not by content — FR-2 still owns that case', () => {
    // Pins the evaluation order: recency runs before content refusal. If FR-3 were evaluated
    // first this flips to refused and this assertion fails.
    mkOrphan('fresh-heavy', 10, 600, 0);
    const r = classifyOrphanDirs(worktreesDir, [], { minAgeMs: THIRTY_MIN, probe: realProbe });
    const ex = r.excluded.find((x) => x.dir === 'fresh-heavy');
    expect(ex).toBeDefined();
    expect(ex.reason).toBe('too_recent');
    expect(r.refused.find((x) => x.dir === 'fresh-heavy')).toBeUndefined();
  });

  it('the legacy no-probe path is unchanged — no refused bucket populated', () => {
    // Byte-identical behaviour for every existing caller, including the worktree-quota hot path
    // that runs on every `git worktree add`.
    const r = classifyOrphanDirs(worktreesDir, [], { minAgeMs: THIRTY_MIN });
    expect(r.refused).toEqual([]);
    expect(r.reapableDirs.find((x) => x.dir === 'aged-heavy')).toBeDefined();
  });
});

describe('FR-3b — an unmeasurable directory refuses with a DISTINCT reason', () => {
  it('a failing probe refuses, and not as high_content', () => {
    // Vector D: if the failure path reused 'high_content', the assertions above could be
    // satisfied without the content branch ever running.
    const failingProbe = () => ({ ok: false, reason: REASON.WALK_ERROR });
    const r = classifyOrphanDirs(worktreesDir, [], { minAgeMs: THIRTY_MIN, probe: failingProbe });
    const hit = r.refused.find((x) => x.dir === 'aged-heavy');
    expect(hit).toBeDefined();
    expect(hit.reason).toBe(REASON.WALK_ERROR);
    expect(hit.reason).not.toBe(REASON.HIGH_CONTENT);
  });

  it('even an EMPTY dir refuses when its walk fails — unmeasurable is not empty', () => {
    const failingProbe = () => ({ ok: false, reason: REASON.WALK_TIMEOUT });
    const r = classifyOrphanDirs(worktreesDir, [], { minAgeMs: THIRTY_MIN, probe: failingProbe });
    const hit = r.refused.find((x) => x.dir === 'aged-empty');
    expect(hit).toBeDefined();
    expect(hit.reason).toBe(REASON.WALK_TIMEOUT);
    expect(r.reapableDirs.find((x) => x.dir === 'aged-empty')).toBeUndefined();
  });
});

describe('the probe never runs on the worktree-creation hot path', () => {
  it('classifyOrphanDirs performs ZERO probe calls when no probe is supplied', () => {
    // enforceWorktreeQuota reaches this with no minAgeMs and no probe on every `git worktree add`.
    // A probe there would walk the live .worktrees — which currently holds a 45,877-file tree whose
    // naive walk exceeded ten minutes.
    let calls = 0;
    const counting = (d) => { calls += 1; return realProbe(d); };
    classifyOrphanDirs(worktreesDir, [], {});                       // the hot-path shape
    expect(calls).toBe(0);
    classifyOrphanDirs(worktreesDir, [], { probe: counting });      // the sweep shape
    expect(calls).toBeGreaterThan(0);
  });
});
