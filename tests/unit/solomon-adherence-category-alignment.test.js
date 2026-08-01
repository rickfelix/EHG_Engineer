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
  it('scripts/ and lib/ carry zero live CODE references to the drifted spelling', () => {
    // STRIP COMMENTS FIRST — the same rule FR-5's parity check had to learn twice.
    // A comment explaining the rename (or the defect that motivated it) is not a live
    // reference, and counting it would make this check impossible to satisfy without
    // deleting the explanation. Documentation must not vote on whether the code it
    // documents is correct — in either direction.
    const files = [
      ...sourceFiles(join(repoRoot, 'scripts')),
      ...sourceFiles(join(repoRoot, 'lib')),
    ];
    const offenders = [];
    for (const f of files) {
      // scripts/one-off/ holds HISTORICAL ARTIFACTS — migration and retrospective
      // scripts that name the old category BY NECESSITY, because they are the record
      // OF the rename rather than code that performs it. The backfill script must say
      // what it migrated FROM; the retro must describe what changed. Neither is a live
      // write path, which is what this check is about.
      //
      // This started as an ad-hoc exclusion for the backfill script alone, and the
      // retro script then tripped it for the identical reason — so the rule is stated
      // as the directory-level principle it always was, rather than accumulating one
      // filename exception per artifact.
      if (f.replace(/\\/g, '/').includes('/scripts/one-off/')) continue;
      let src;
      try { src = readFileSync(f, 'utf8'); } catch { continue; }
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      if (code.includes(OLD)) offenders.push(f.replace(repoRoot, '').replace(/\\/g, '/'));
    }
    expect(offenders).toEqual([]);
  });
});
