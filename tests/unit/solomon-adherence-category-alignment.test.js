/**
 * SD-FDBK-INFRA-SOLOMON-SCORECARD-MEASURES-001 — FR-4 (TS-15).
 *
 * The self-adherence loop wrote category='solomon_self_adherence'; the authoritative
 * contract (leo_protocol_sections id=611) mandates 'solomon_adherence_drift' three
 * times and never mentions the loop's spelling. The contract is the governing
 * representation, so the LOOP moved.
 *
 * The PRD asked for this as an AUTOMATED assertion rather than a manual grep step —
 * a check nobody runs is not a guard. FR-7 set the precedent of pinning a grep
 * result as a real test; this is the equivalent for the rename.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

const OLD = 'solomon_self_adherence';
const NEW = 'solomon_adherence_drift';

/** Walk a directory for source files, skipping node_modules and nested worktrees. */
function sourceFiles(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git' || name === '.worktrees') continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) sourceFiles(full, acc);
    else if (/\.(cjs|mjs|js|ts)$/.test(name)) acc.push(full);
  }
  return acc;
}

describe('the loop writes the category the contract mandates', () => {
  const loop = readFileSync(join(repoRoot, 'scripts', 'solomon-self-adherence-review.mjs'), 'utf8');

  it('the constant is the contract spelling', () => {
    expect(loop).toMatch(new RegExp(`SELF_ADHERENCE_CATEGORY = '${NEW}'`));
  });

  it('the loop no longer contains the drifted spelling anywhere', () => {
    // Including comments — a stale mention would mislead the next reader.
    const mentions = loop.split('\n').filter((l) => l.includes(OLD) && !l.includes('renamed from'));
    // The header comment legitimately explains the rename; allow only that framing.
    const bad = mentions.filter((l) => !/backfill|rename|drifted|from the contract/i.test(l));
    expect(bad).toEqual([]);
  });
});

describe('no production code still writes the old category', () => {
  it('scripts/ and lib/ carry zero live references to the drifted spelling', () => {
    const files = [
      ...sourceFiles(join(repoRoot, 'scripts')),
      ...sourceFiles(join(repoRoot, 'lib')),
    ];
    const offenders = [];
    for (const f of files) {
      // The backfill script names the old category by necessity — it is the thing
      // being migrated FROM. Exclude it explicitly rather than loosening the check.
      if (f.includes('backfill-solomon-adherence-category')) continue;
      let src;
      try { src = readFileSync(f, 'utf8'); } catch { continue; }
      if (src.includes(OLD)) offenders.push(f.replace(repoRoot, '').replace(/\\/g, '/'));
    }
    expect(offenders).toEqual([]);
  });
});
