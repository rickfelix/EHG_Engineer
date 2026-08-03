/**
 * SD-LEO-INFRA-ORPHAN-SWEEP-HARD-001 — bounded content probe (FR-2 / FR-3 / FR-3b).
 *
 * THE FAILURE BEING PINNED: the orphan sweep hard-deleted 601MB/42,162 files because the recency
 * guard stat'd the top-level inode (blind to nested edits) and a missing .git short-circuited to
 * reapable without any content check.
 *
 * THE FAILURE THIS SUITE IS ITSELF GUARDING AGAINST: FR-3 is an absence-read-as-signal fix, and
 * PAT-CONFLATION-RECURSES-ONE-LAYER-UP-001 predicts such fixes reproduce the conflation one layer
 * out. Here that means treating an UNMEASURABLE directory as an EMPTY one. Every failed-walk test
 * below exists for that specific recurrence.
 *
 * Fixtures use a real mkdtemp sandbox (no vi.mock of node:fs) for the succeeding path, and an
 * injected fsImpl for the failure paths. Locking a file to simulate failure is DELIBERATELY not
 * used: a lock is the mechanism that manufactures these orphans, and a test whose cleanup fails
 * would create one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  probeContent, classifyContent,
  CONTENT_REFUSE_MIN_FILES, CONTENT_REFUSE_MIN_BYTES,
  PROBE_MAX_FILES, REASON,
} from '../../../lib/worktree-reaper/orphan-content-probe.mjs';

let sandbox;
beforeAll(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-probe-'));
});
afterAll(() => {
  try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { /* best effort */ }
});

const mk = (name, files) => {
  const root = path.join(sandbox, name);
  fs.mkdirSync(root, { recursive: true });
  for (const [rel, content] of files) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return root;
};

describe('the probe measures CONTENT, not the container', () => {
  it('counts nested files at depth, which the old top-level stat could not see', () => {
    const root = mk('nested', [['a.txt', 'x'], ['d1/b.txt', 'yy'], ['d1/d2/c.txt', 'zzz']]);
    const r = probeContent(root, { fsImpl: fs, pathImpl: path });
    expect(r.ok).toBe(true);
    expect(r.files).toBe(3);
    expect(r.bytes).toBe(6);
    expect(r.truncated).toBe(false);
  });

  it('reports the newest DESCENDANT mtime, not the directory mtime', () => {
    const root = mk('mtimes', [['old.txt', 'a'], ['deep/new.txt', 'b']]);
    const target = path.join(root, 'deep/new.txt');
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(target, future, future);
    const r = probeContent(root, { fsImpl: fs, pathImpl: path });
    expect(r.ok).toBe(true);
    // The nested file is the newest thing in the tree; a top-level stat would never see it.
    expect(r.newestMtimeMs).toBeGreaterThan(fs.statSync(root).mtimeMs);
  });

  it('CONTROL: the succeeding path runs against a REAL filesystem', () => {
    // Without this, the probe would only ever be proven against an injected fake.
    const root = mk('control', [['only.txt', 'hello']]);
    const r = probeContent(root, { fsImpl: fs, pathImpl: path });
    expect(r.ok).toBe(true);
    expect(r.files).toBe(1);
    expect(r.bytes).toBe(5);
  });
});

describe('junctions and symlinks are never traversed', () => {
  it('a link counts as zero files and zero bytes', () => {
    const target = mk('link-target', [['big1.txt', 'x'.repeat(50)], ['big2.txt', 'y'.repeat(50)]]);
    const root = mk('with-link', [['real.txt', 'z']]);
    let linked = false;
    try {
      fs.symlinkSync(target, path.join(root, 'node_modules'), 'junction');
      linked = true;
    } catch { /* junction creation unavailable — assertion below is then vacuous, so skip */ }
    if (!linked) return;
    const r = probeContent(root, { fsImpl: fs, pathImpl: path });
    expect(r.ok).toBe(true);
    // 1 real file only. Following the junction would have counted the target's 2 files / 100 bytes.
    expect(r.files).toBe(1);
    expect(r.bytes).toBe(1);
  });
});

describe('FR-3b — an UNMEASURABLE directory is never treated as an EMPTY one', () => {
  const throwingFs = (on) => ({
    lstatSync: (p) => { if (on === 'lstat') throw new Error('EPERM'); return fs.lstatSync(p); },
    readdirSync: (p) => { if (on === 'readdir') throw new Error('EPERM'); return fs.readdirSync(p); },
  });

  it('a stat failure returns ok:false, not an empty measurement', () => {
    const root = mk('stat-fail', [['a.txt', 'x']]);
    const r = probeContent(root, { fsImpl: throwingFs('lstat'), pathImpl: path });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(REASON.WALK_ERROR);
  });

  it('a readdir failure returns ok:false, not an empty measurement', () => {
    const root = mk('readdir-fail', [['a.txt', 'x']]);
    const r = probeContent(root, { fsImpl: throwingFs('readdir'), pathImpl: path });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(REASON.WALK_ERROR);
  });

  it('a timeout returns ok:false with its own reason', () => {
    const root = mk('timeout', [['a.txt', 'x'], ['b/c.txt', 'y']]);
    let t = 1000;
    const r = probeContent(root, { fsImpl: fs, pathImpl: path, maxMs: 5, now: () => (t += 10) });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(REASON.WALK_TIMEOUT);
  });

  it('EVERY failure mode classifies as REFUSE — this is the whole point of FR-3b', () => {
    for (const probe of [
      { ok: false, reason: REASON.WALK_ERROR },
      { ok: false, reason: REASON.WALK_TIMEOUT },
      null,
      undefined,
    ]) {
      expect(classifyContent(probe).refuse).toBe(true);
    }
  });

  it('a failed walk does NOT reuse the high_content reason', () => {
    // If it did, a test asserting reason==='high_content' would be satisfied by the failure path
    // and could no longer prove the content branch ran. Distinct strings keep the two claims
    // independently checkable.
    expect(classifyContent({ ok: false, reason: REASON.WALK_ERROR }).reason).not.toBe(REASON.HIGH_CONTENT);
    expect(classifyContent({ ok: false, reason: REASON.WALK_TIMEOUT }).reason).not.toBe(REASON.HIGH_CONTENT);
    expect(REASON.WALK_ERROR).not.toBe(REASON.HIGH_CONTENT);
    expect(REASON.WALK_TIMEOUT).not.toBe(REASON.HIGH_CONTENT);
    expect(REASON.CAP_EXCEEDED).not.toBe(REASON.HIGH_CONTENT);
  });
});

describe('the bound is real — a cap hit is truncated, not a trusted partial count', () => {
  it('stops at the cap and reports truncated', () => {
    const files = Array.from({ length: 12 }, (_, i) => [`f${i}.txt`, 'x']);
    const root = mk('capped', files);
    const r = probeContent(root, { fsImpl: fs, pathImpl: path, maxFiles: 5 });
    expect(r.truncated).toBe(true);
    // Assert the CONTRACT ("never walk more than maxFiles"), not the observed behaviour.
    // This previously read `toBeLessThanOrEqual(6)` with maxFiles=5 — an assertion shaped around
    // an off-by-one rather than around the requirement, so it passed while the bound was wrong.
    expect(r.files).toBe(5);
  });

  it('a truncated probe REFUSES rather than judging on a partial count', () => {
    const c = classifyContent({ ok: true, files: 2, bytes: 10, truncated: true });
    expect(c.refuse).toBe(true);
    expect(c.reason).toBe(REASON.CAP_EXCEEDED);
  });

  it('an untruncated probe under the thresholds does NOT refuse', () => {
    // Opposite polarity: if everything refused, the sweep would stop working entirely.
    const c = classifyContent({ ok: true, files: 1, bytes: 100, truncated: false });
    expect(c.refuse).toBe(false);
    expect(c.reason).toBeNull();
  });
});

describe('thresholds keep real margin against the EXISTING fixtures', () => {
  it('the 100-byte / 1-file fixture used by orphan-sweep.test.js does NOT refuse', () => {
    // mkLeftover (:29-35) writes exactly one 100-byte file into every fixture. A
    // `>1 file AND >100 bytes` rule would clear it with ZERO margin on both dimensions —
    // one extra byte there would flip four assertions in a suite nobody was editing.
    expect(classifyContent({ ok: true, files: 1, bytes: 100, truncated: false }).refuse).toBe(false);
  });

  it('the 6-byte README fixture used by lib/worktree-quota.test.js does NOT refuse', () => {
    expect(classifyContent({ ok: true, files: 1, bytes: 6, truncated: false }).refuse).toBe(false);
  });

  it('the empty plain-leftover fixture does NOT refuse', () => {
    expect(classifyContent({ ok: true, files: 0, bytes: 0, truncated: false }).refuse).toBe(false);
  });

  it('boundary pair: at-threshold refuses, one-under does not', () => {
    expect(classifyContent({ ok: true, files: CONTENT_REFUSE_MIN_FILES, bytes: 0, truncated: false }).refuse).toBe(true);
    expect(classifyContent({ ok: true, files: CONTENT_REFUSE_MIN_FILES - 1, bytes: 0, truncated: false }).refuse).toBe(false);
    expect(classifyContent({ ok: true, files: 0, bytes: CONTENT_REFUSE_MIN_BYTES + 1, truncated: false }).refuse).toBe(true);
    expect(classifyContent({ ok: true, files: 0, bytes: CONTENT_REFUSE_MIN_BYTES, truncated: false }).refuse).toBe(false);
  });

  it('a tree the size of the incident refuses on content', () => {
    const c = classifyContent({ ok: true, files: 42162, bytes: 601021494, truncated: false });
    expect(c.refuse).toBe(true);
    expect(c.reason).toBe(REASON.HIGH_CONTENT);
  });

  it('thresholds and caps are exported constants, not inline literals', () => {
    // So a test can assert a fixture sits BELOW the cap and remove the bound as a possible
    // cause of a refusal — otherwise a content refusal and a cap refusal are indistinguishable.
    expect(typeof CONTENT_REFUSE_MIN_FILES).toBe('number');
    expect(typeof CONTENT_REFUSE_MIN_BYTES).toBe('number');
    expect(PROBE_MAX_FILES).toBeGreaterThan(CONTENT_REFUSE_MIN_FILES);
  });
});

describe('the injection seam is mandatory', () => {
  it('refuses to run without fsImpl — no silent module-scope fs fallback', () => {
    // A default fs would make the failure paths untestable and let a caller walk the real tree
    // by accident. TR-3: no test may point this at a path under the real repo root.
    expect(() => probeContent('/anywhere', {})).toThrow(/injection seam/);
    expect(() => probeContent('/anywhere', { fsImpl: fs })).toThrow(/injection seam/);
  });
});
