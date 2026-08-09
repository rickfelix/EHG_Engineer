/**
 * REBUILD CHURN — SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001.
 *
 * STARVE-1's remediation rebuilds a content-unverified source tree instead of refusing, because
 * refusing on any stray gitignored artifact re-opened the pre-SD starvation. Right for a ONE-OFF.
 * But a reviewer raised — explicitly as an UNMEASURED hypothesis — that an artifact which
 * REAPPEARS makes the tree unverified again next tick, so the guard deletes and recreates the tree
 * hourly, forever, while only LOGGING. A subsystem churning quietly while looking healthy is the
 * exact failure this SD exists to make visible.
 *
 * WHAT I MEASURED BEFORE BUILDING THIS: the reviewer's most likely candidate — a node_modules
 * junction inside the source tree — is NOT reachable at the default path. Nothing provisions
 * node_modules into a source tree, and the default path sits inside repoRoot, so node resolution
 * walks up and finds the ROOT's copy. Neither source tree exists on this host yet.
 *
 * So the specific case was refuted and the general one is closed anyway: the remediation gets its
 * own alarm rather than inheriting silence. The counter is tick-relative and resets on any tick
 * that did not rebuild, so a legitimate one-off never accumulates.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const {
  detectReaperRebuildChurn, detectReaperNotInvoked, detectReaperStarvation,
  REAPER_REBUILD_CHURN_THRESHOLD,
} = require_('../../../lib/coordinator/coordination-events.cjs');
const { readState, writeState } = require_('../../../scripts/fleet/worktree-reaper-tick.cjs');

const T = REAPER_REBUILD_CHURN_THRESHOLD;

describe('a rebuilding source tree cannot churn silently', () => {
  it('MATCHES at the threshold, under its own distinct kind', () => {
    const r = detectReaperRebuildChurn({ consecutiveRebuilds: T });
    expect(r.matched).toBe(true);
    expect(r.alertKind).toBe('reaper_rebuild_churn_alert');
    expect(r.evidence.consecutive_rebuilds).toBe(T);
  });

  it('a ONE-OFF rebuild does not alarm — that is the remediation working', () => {
    // Anti-cries-wolf. STARVE-1 exists so a single stray artifact self-heals; alarming on that
    // would re-create the noise the empty-pool control was written to prevent.
    expect(detectReaperRebuildChurn({ consecutiveRebuilds: 1 }).matched).toBe(false);
    expect(detectReaperRebuildChurn({ consecutiveRebuilds: T - 1 }).matched).toBe(false);
  });

  it('THE GAP, as a test: no other detector can see a churning tree', () => {
    // A churning tree still SPAWNS the reaper every tick, so it has no refusal streak and no
    // not-invoked streak. Both existing detectors report nothing. That is why churn is checked on
    // the invoked path and needed its own counter rather than a branch inside either of them.
    const churning = { consecutiveRefusals: 0, consecutiveNotInvoked: 0, pool: { used: 27, cap: 28, percent: 96 } };
    expect(detectReaperStarvation(churning).matched).toBe(false);
    expect(detectReaperNotInvoked(churning).matched).toBe(false);
    expect(detectReaperRebuildChurn({ consecutiveRebuilds: T }).matched).toBe(true);
  });

  it('all FOUR alarm kinds are mutually distinct, so none can de-dupe another away', () => {
    const kinds = new Set([
      detectReaperRebuildChurn({ consecutiveRebuilds: T }).alertKind,
      detectReaperNotInvoked({ consecutiveNotInvoked: 99 }).alertKind,
      detectReaperStarvation({ consecutiveRefusals: 99, pool: { used: 22, cap: 28 } }).alertKind,
      detectReaperStarvation({ consecutiveRefusals: 99, pool: { used: null, cap: 28 } }).alertKind,
    ]);
    expect(kinds.size).toBe(4);
  });

  it('degrades to no-alarm on missing/garbage input rather than throwing', () => {
    expect(detectReaperRebuildChurn().matched).toBe(false);
    expect(detectReaperRebuildChurn({}).matched).toBe(false);
    expect(detectReaperRebuildChurn({ consecutiveRebuilds: 'many' }).matched).toBe(false);
  });
});

describe('the churn counter survives a state round-trip', () => {
  let tmp;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-churn-')); });
  afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } });

  it('consecutive_rebuilds is on readState\'s whitelist', () => {
    // Load-bearing for the same reason as the other two counters: readState rebuilds the object
    // field-by-field, so a key missing from that list is SILENTLY DROPPED on every read and the
    // streak can never reach any threshold.
    const p = path.join(tmp, 'state.json');
    writeState(p, { schema_version: 1, sweep_counter: 4, consecutive_rebuilds: 3 });
    expect(readState(p).consecutive_rebuilds).toBe(3);
  });

  it('an old state file without the key reads as 0, not undefined', () => {
    const p = path.join(tmp, 'old.json');
    fs.writeFileSync(p, JSON.stringify({ schema_version: 1, sweep_counter: 2 }));
    expect(readState(p).consecutive_rebuilds).toBe(0);
  });
});
