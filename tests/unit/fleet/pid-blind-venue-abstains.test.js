/**
 * SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (FR-3a)
 *
 * scripts/stale-session-sweep.cjs runs every 5 minutes on ubuntu-latest via
 * .github/workflows/sweep-cron.yml. Its PID rung resolves through .claude/session-identity/pid-*.json
 * — host-local and gitignored, so it does not exist on a runner after actions/checkout. Every
 * scheduled run therefore resolved null for every row, produced hasPidAlive===false for every row,
 * and went on to render verdicts whose own stated meaning is "...AND no living PID".
 *
 * It never had a living-PID answer. It had no answer, and spent it as if it were a "no".
 *
 * These tests pin the distinction the fix turns on: ABSENT directory (blind — must abstain) vs
 * PRESENT-BUT-EMPTY directory (a real negative — may act). Same observation, opposite epistemic
 * status. The venue check must never be a CI sniff: a dev host with the directory removed is just
 * as blind as a runner, and sniffing process.env.CI would get that backwards.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const require = createRequire(import.meta.url);
const { pidVenueCapability, pidBlindNotice } = require('../../../lib/fleet/pid-venue.cjs');

let tmpRoot;
let presentDir;
let absentDir;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pid-venue-'));
  presentDir = path.join(tmpRoot, 'session-identity');
  fs.mkdirSync(presentDir);            // exists, but deliberately EMPTY
  absentDir = path.join(tmpRoot, 'never-created');
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('FR-3a venue capability', () => {
  it('an ABSENT marker directory is NOT capable — the runner case', () => {
    const v = pidVenueCapability({ markerDir: absentDir });
    expect(v.capable).toBe(false);
    expect(v.reason).toBe('marker_dir_absent');
  });

  it('a PRESENT-but-EMPTY directory is NOT capable — CORRECTED BY MEASUREMENT', () => {
    // THIS ASSERTION USED TO SAY THE OPPOSITE, and the original reasoning was wrong.
    // It argued that if the directory exists, "no marker for this session" is a real negative the
    // sweep may act on. Then the sweep was run from this SD's own worktree and printed:
    //   "PID venue OK ... Examined 9 row(s); 0 resolved to a live PID"
    // The directory existed, so the existence-only check passed — while the markers real sessions
    // had written lived in a different checkout entirely (main repo 12 markers, that worktree 1).
    // Markers are written per-checkout by capture-session-id.cjs:497 but describe host-wide
    // processes, so "directory exists" never implied "the answers are in it".
    // Zero markers is therefore the ABSENCE of any answer, not a negative one, and treating it as
    // "nobody is alive" across a very-stale population is a false-death vector.
    const v = pidVenueCapability({ markerDir: presentDir });
    expect(v.capable).toBe(false);
    expect(v.reason).toBe('marker_dir_empty');
  });

  it('THE CONTROL: a directory with markers IS capable, even when none match this session', () => {
    // This preserves the boundary the original test was reaching for. Where markers DO exist,
    // "no marker for you" is a real negative. Without this half the check could be satisfied by
    // something that always answers "blind", disabling the sweep everywhere rather than only
    // where it is genuinely blind.
    const populated = path.join(tmpRoot, 'populated');
    fs.mkdirSync(populated, { recursive: true });
    fs.writeFileSync(path.join(populated, 'pid-4242.json'), JSON.stringify({ cc_pid: 4242, session_id: 'someone-else' }));
    const v = pidVenueCapability({ markerDir: populated });
    expect(v.capable).toBe(true);
    expect(v.reason).toBe('marker_dir_present');
    expect(v.markerCount).toBe(1);
  });

  it('a FILE where the directory should be is not capable (unreadable == absent, fail to abstain)', () => {
    const asFile = path.join(tmpRoot, 'not-a-dir');
    fs.writeFileSync(asFile, 'x');
    expect(pidVenueCapability({ markerDir: asFile }).capable).toBe(false);
  });

  it('does NOT sniff CI — capability tracks the evidence, not the brand of machine', () => {
    // Comments are stripped first: the module DISCUSSES process.env.CI at length to explain why it
    // refuses to read it. The assertion is about the code, so it must not be satisfiable — or
    // broken — by prose.
    const src = fs
      .readFileSync(new URL('../../../lib/fleet/pid-venue.cjs', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ');
    expect(src).not.toMatch(/process\.env\.(CI|GITHUB_ACTIONS|GITHUB_RUN_ID)\b/);
  });
});

describe('FR-3a the notice says so explicitly', () => {
  it('names the venue, the row count, and that zero death verdicts were rendered', () => {
    const v = pidVenueCapability({ markerDir: absentDir });
    const msg = pidBlindNotice(v, { examined: 11 });
    expect(msg).toMatch(/PID-BLIND VENUE/);
    expect(msg).toMatch(/Examined 11 row\(s\)/);
    expect(msg).toMatch(/0 PID-dependent death verdicts/);
    // "NOT-ASKED, not NO" is the whole point — the operator reading CI logs must be able to tell
    // an abstention from a clean bill of health.
    expect(msg).toMatch(/NOT-ASKED, not NO/);
  });
});

describe('FR-3a the sweep consumes it (wiring, not just the helper)', () => {
  const sweepSrc = fs.readFileSync(
    new URL('../../../scripts/stale-session-sweep.cjs', import.meta.url),
    'utf8'
  );

  it('classification carries pidUnverifiable and it blocks the isStale death verdict', () => {
    expect(sweepSrc).toMatch(/const pidUnverifiable = !pidVenue\.capable;/);
    // The load-bearing line: without !pidUnverifiable here, a blind venue releases claims on
    // heartbeat staleness alone at cron cadence.
    expect(sweepSrc).toMatch(/isStale: isStale && !hasPidAlive && !pidUnverifiable/);
  });

  it('a blind venue reaches PID_UNVERIFIABLE and can never fall through to DEAD', () => {
    const statusBlock = sweepSrc.slice(
      sweepSrc.indexOf("status = 'ALIVE_NO_HEARTBEAT'"),
      sweepSrc.indexOf("status = 'STALE_UNKNOWN'")
    );
    // Ordering is the assertion: the abstention branch must come BEFORE the DEAD branch,
    // otherwise a very-stale row is declared dead before anyone asks whether we could see it.
    expect(statusBlock.indexOf('PID_UNVERIFIABLE')).toBeGreaterThan(-1);
    expect(statusBlock.indexOf('PID_UNVERIFIABLE')).toBeLessThan(statusBlock.indexOf("status = 'DEAD'"));
  });

  it('the sweep states its examined row count on BOTH branches', () => {
    expect(sweepSrc).toMatch(/pidBlindNotice\(pidVenue, \{ examined: classified\.length \}\)/);
    expect(sweepSrc).toMatch(/Examined \$\{classified\.length\} row\(s\)/);
  });
});
