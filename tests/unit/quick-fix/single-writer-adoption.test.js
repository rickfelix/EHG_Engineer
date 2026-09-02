/**
 * SD-LEO-INFRA-SINGLE-ESCALATION-WRITER-001 -- cross-cutting adoption proofs that don't
 * belong to any one migrated file's own test suite.
 *
 * TS-9: per-site inventory -- each of the 7 named call sites calls setQuickFixStatus
 *   (the PRIMARY proof; grep is secondary/supplementary here).
 * TS-11: single-representation anti-drift -- FR-3/FR-4/FR-5's three isNeedsSdRow consumers
 *   all import from the SAME resolved file, not three independently hand-rolled copies.
 * TS-13: behavioral verification -- classify-quick-fix.js, verification.js (both branches),
 *   and markPromoted() pass status='open'+routing_tier=3 (never 'escalated') as the literal
 *   argument to setQuickFixStatus, closing the gap TS-9 alone leaves open (TS-9 proves the
 *   call routes through the writer at all; it would still pass if a caller incorrectly
 *   passed status='escalated' and the writer only threw at runtime).
 *
 * Hermetic source-assertions (no DB, no supabase mock), matching this repo's established
 * "route through the shared contract" idiom (see tests/unit/database/trigger-guard-pack.test.js,
 * tests/unit/scripts/orphan-qf-reaper-force-completed.test.js).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
function load(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

// TS-9: the 7 named call sites, one entry per site (verification.js and
// coordinator-stale-qf-disposition-sweep.mjs each contribute 2 sites named in FR-2).
const SITES = [
  { label: '(1) classify-quick-fix.js', file: 'scripts/classify-quick-fix.js' },
  { label: '(2) lib/sd-creation/source-adapters/qf.js', file: 'lib/sd-creation/source-adapters/qf.js' },
  { label: '(3) complete-quick-fix/verification.js', file: 'scripts/modules/complete-quick-fix/verification.js' },
  { label: '(4) defer-quick-fix.js --reopen', file: 'scripts/defer-quick-fix.js' },
  { label: '(5) coordinator-stale-qf-disposition-sweep.mjs', file: 'scripts/coordinator-stale-qf-disposition-sweep.mjs' },
  { label: '(6) qf-link-resolution.mjs', file: 'scripts/qf-link-resolution.mjs' },
  { label: '(7) orphan-qf-reaper.mjs', file: 'scripts/orphan-qf-reaper.mjs' },
];

describe('TS-9: all 7 named call sites route through setQuickFixStatus', () => {
  for (const { label, file } of SITES) {
    it(`${label} imports and calls setQuickFixStatus`, () => {
      const src = load(file);
      expect(src, `${file} does not import setQuickFixStatus`).toMatch(/setQuickFixStatus/);
      expect(src, `${file} does not import from status-writer.cjs`).toMatch(/status-writer\.cjs/);
    });
  }

  it('verification.js calls setQuickFixStatus from BOTH branches (normal + CHECK-rejection fallback)', () => {
    const src = load('scripts/modules/complete-quick-fix/verification.js');
    const occurrences = (src.match(/setQuickFixStatus\(/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('coordinator-stale-qf-disposition-sweep.mjs calls setQuickFixStatus from markPromoted + all 3 close* siblings', () => {
    const src = load('scripts/coordinator-stale-qf-disposition-sweep.mjs');
    const occurrences = (src.match(/setQuickFixStatus\(/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(4);
  });

  it('orphan-qf-reaper.mjs calls setQuickFixStatus from BOTH reconcile sites (pr_url path + branch-derived path)', () => {
    const src = load('scripts/orphan-qf-reaper.mjs');
    const occurrences = (src.match(/setQuickFixStatus\(/g) || []).length;
    expect(occurrences).toBe(2);
  });

  it('secondary heuristic: no remaining direct .from(\'quick_fixes\').update({...status...}) call outside status-writer.cjs among the 7 named files', () => {
    // Deliberately narrow to the 7 named files (not a full repo grep) -- files this SD did
    // not migrate (e.g. markReVerified, which never changes status) legitimately still call
    // .update() directly and are out of scope for this check.
    for (const { file } of SITES) {
      const src = load(file);
      // A literal `.update({` block containing `status:` as a top-level key, NOT preceded
      // immediately by `setQuickFixStatus(` call syntax.
      const rawStatusUpdates = src.match(/\.update\(\{[^}]*\bstatus\s*:/g) || [];
      expect(rawStatusUpdates, `${file} has a raw .update({status:...}) call outside setQuickFixStatus`).toEqual([]);
    }
  });
});

describe('TS-11: single-representation anti-drift -- FR-3/FR-4/FR-5 import isNeedsSdRow from the SAME resolved file', () => {
  const CONSUMERS = [
    { label: 'FR-3: coordinator-stale-qf-disposition-sweep.mjs', file: 'scripts/coordinator-stale-qf-disposition-sweep.mjs' },
    { label: 'FR-4: qf-link-resolution.mjs', file: 'scripts/qf-link-resolution.mjs' },
    { label: 'FR-5: rank-items.js', file: 'scripts/modules/sd-next/rank-items.js' },
  ];

  it('all 3 consumers import isNeedsSdRow, and their import specifiers resolve to the identical absolute file', () => {
    const resolvedPaths = new Set();
    for (const { label, file } of CONSUMERS) {
      const src = load(file);
      const m = src.match(/import\s*\{[^}]*\bisNeedsSdRow\b[^}]*\}\s*from\s*['"]([^'"]+)['"]/);
      expect(m, `${label} (${file}) does not import isNeedsSdRow`).not.toBeNull();
      const specifier = m[1];
      const resolved = path.resolve(path.dirname(path.join(ROOT, file)), specifier);
      resolvedPaths.add(resolved);
    }
    expect(resolvedPaths.size, 'all 3 specifiers must resolve to exactly one file (no drift, no fork)').toBe(1);
    const [only] = [...resolvedPaths];
    expect(only).toBe(path.resolve(ROOT, 'lib/quick-fix/status-writer.cjs'));
  });

  it('each consumer CALLS isNeedsSdRow at its exclusion site (imported but unused would still drift)', () => {
    const sweepSrc = load('scripts/coordinator-stale-qf-disposition-sweep.mjs');
    const fenceStart = sweepSrc.indexOf('function fetchPastFenceCandidates');
    expect(fenceStart).toBeGreaterThanOrEqual(0);
    expect(sweepSrc.slice(fenceStart, fenceStart + 2000)).toContain('isNeedsSdRow(');

    const linkSrc = load('scripts/qf-link-resolution.mjs');
    expect(linkSrc).toContain('isNeedsSdRow(qf)');

    const rankSrc = load('scripts/modules/sd-next/rank-items.js');
    const rankFnStart = rankSrc.indexOf('function rankQF(');
    expect(rankFnStart).toBeGreaterThanOrEqual(0);
    expect(rankSrc.slice(rankFnStart, rankFnStart + 1000)).toContain('isNeedsSdRow(qf)');
  });
});

describe('TS-13: FR-2 behavioral verification -- migrated callers pass status=open+routing_tier=3, never escalated', () => {
  function callBlock(src, marker) {
    const start = src.indexOf(marker);
    expect(start, `marker not found: ${marker}`).toBeGreaterThanOrEqual(0);
    const openIdx = src.indexOf('{', start);
    let depth = 1;
    let i = openIdx + 1;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') depth -= 1;
      i += 1;
    }
    return src.slice(start, i);
  }

  it('classify-quick-fix.js: fresh Tier-3 hit calls setQuickFixStatus with status=open, routing_tier=3', () => {
    const src = load('scripts/classify-quick-fix.js');
    const block = callBlock(src, 'await setQuickFixStatus(supabase, qfId, {');
    expect(block).toMatch(/status:\s*'open'/);
    expect(block).toMatch(/routing_tier:\s*3/);
    expect(block).not.toMatch(/status:\s*'escalated'/);
  });

  it('verification.js: BOTH branches call setQuickFixStatus with status=open, routing_tier=3', () => {
    const src = load('scripts/modules/complete-quick-fix/verification.js');
    const blocks = [];
    let cursor = 0;
    while (true) {
      const idx = src.indexOf('await setQuickFixStatus(supabase, qfId, {', cursor);
      if (idx === -1) break;
      blocks.push(callBlock(src.slice(idx), 'await setQuickFixStatus(supabase, qfId, {'));
      cursor = idx + 1;
    }
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const [i, block] of blocks.entries()) {
      expect(block, `branch #${i + 1}`).toMatch(/status:\s*'open'/);
      expect(block, `branch #${i + 1}`).toMatch(/routing_tier:\s*3/);
      expect(block, `branch #${i + 1}`).not.toMatch(/status:\s*'escalated'/);
    }
  });

  it('markPromoted(): calls setQuickFixStatus with status=open, routing_tier=3 (the root-cause fix site)', () => {
    const src = load('scripts/coordinator-stale-qf-disposition-sweep.mjs');
    const fnStart = src.indexOf('function markPromoted');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnBody = src.slice(fnStart, fnStart + 2500);
    const block = callBlock(fnBody, 'await setQuickFixStatus(supabase, qf.id, {');
    expect(block).toMatch(/status:\s*'open'/);
    expect(block).toMatch(/routing_tier:\s*3/);
    expect(block).not.toMatch(/status:\s*'escalated'/);
  });

  it('lib/sd-creation/source-adapters/qf.js (--from-qf): DOES write status=escalated (it already has escalated_to_sd_id -- the one legitimate escalation site)', () => {
    const src = load('lib/sd-creation/source-adapters/qf.js');
    const block = callBlock(src, 'await setQuickFixStatus(supabase, qf.id, {');
    expect(block).toMatch(/status:\s*'escalated'/);
    expect(block).toMatch(/escalated_to_sd_id/);
  });
});
