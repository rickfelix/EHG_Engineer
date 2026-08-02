// SD-LEO-INFRA-ROADMAP-WAVES-PROGRESS-001 — the field must stay unreadable, not merely be unread today.
//
// roadmap_waves.progress_pct is a RUNG-level value stored on a PER-WAVE row: rung-progress-rollup
// assigned one computeBuildGauge to every wave of a build rung, so 23 waves held three distinct
// values ({0 x17, 20 x2, 71 x4}) and the six non-zero ones were stamped in a single pass. Consumers
// then read it as per-wave — correctly, as the column name promises, and wrongly, as the data means.
//
// THIS WAS CORRECTED ONCE BEFORE AND CAME BACK. QF-20260719-275 fixed one caller and left the field
// standing; ten days later new consumers were reading it again. The SD is explicit that an acceptance
// test which passes while the field is still readable HAS NOT closed this — so these assertions are
// about what a FUTURE reader can do, not about today's callers being clean.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const SCAN_DIRS = ['lib', 'scripts'];
const CODE_RE = /\.(js|mjs|cjs)$/;
const SKIP_RE = /(^|[\\/])(node_modules|\.git|dist|build|coverage)([\\/]|$)/;

// The ONE legitimate mention: the rollup computes rung-level values into in-memory rows whose field
// happens to be named progress_pct. It is the derivation path the SD acceptance carves out — but it
// must not touch the STORED column, which the read/write assertions below enforce independently.
const DERIVATION_PATH = 'lib/vision/rung-progress-rollup.mjs';

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (SKIP_RE.test(p)) continue;
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (CODE_RE.test(p)) out.push(p);
  }
  return out;
}

const FILES = SCAN_DIRS.flatMap((d) => walk(join(REPO, d))).map((p) => ({
  rel: relative(REPO, p).replace(/\\/g, '/'),
  src: (() => { try { return readFileSync(p, 'utf8'); } catch { return ''; } })(),
}));

/** Files that query roadmap_waves AND name `field` inside a .select(...) string. */
function selectsFieldFromWaves(field) {
  const re = new RegExp(`\\.select\\(\\s*['"\`][^'"\`]*\\b${field}\\b[^'"\`]*['"\`]`);
  return FILES.filter((f) => f.src.includes("from('roadmap_waves')") && re.test(f.src)).map((f) => f.rel);
}

describe('roadmap_waves.progress_pct is not readable as a per-wave measure', () => {
  // THE SCAN IS ONLY MEANINGFUL IF IT CAN FIND THINGS. A zero result from a broken or mis-scoped
  // walker is indistinguishable from a clean tree, so prove the instrument works on the same
  // predicate, over the same files, before trusting any zero it reports.
  it('CONTROL: the scanner finds files and finds OTHER roadmap_waves fields being selected', () => {
    expect(FILES.length).toBeGreaterThan(500);
    const wavesReaders = FILES.filter((f) => f.src.includes("from('roadmap_waves')"));
    expect(wavesReaders.length).toBeGreaterThan(3);
    // The identical predicate, a different column — if this is empty the detector is broken.
    expect(selectsFieldFromWaves('sequence_rank').length).toBeGreaterThan(0);
  });

  // Acceptance (i). This is the assertion that outlives the current callers.
  it('no file SELECTs progress_pct from roadmap_waves', () => {
    expect(selectsFieldFromWaves('progress_pct')).toEqual([]);
  });

  it('no file WRITES progress_pct back to roadmap_waves', () => {
    const writers = FILES.filter((f) => /update\(\s*\{\s*progress_pct/.test(f.src)).map((f) => f.rel);
    expect(writers).toEqual([]);
  });

  it('even the derivation path does not touch the stored column', () => {
    const f = FILES.find((x) => x.rel === DERIVATION_PATH);
    expect(f, `${DERIVATION_PATH} must exist — if it moved, this whole file is scanning nothing`).toBeTruthy();
    expect(/\.select\(\s*['"`][^'"`]*progress_pct/.test(f.src)).toBe(false);
    expect(/update\(\s*\{\s*progress_pct/.test(f.src)).toBe(false);
  });
});
