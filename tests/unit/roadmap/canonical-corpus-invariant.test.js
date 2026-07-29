/**
 * SD-LEO-INFRA-ROADMAP-REGENERATION-DUPLICATES-001 FR-6 — the corpus-wide invariant.
 *
 * Every individual fix in this SD removes one instance. This removes the CLASS: no reader may
 * pick a roadmap by recency without constraining status.
 *
 * *** THIS GUARD EARNED ITS KEEP BEFORE IT WAS EVEN COMMITTED. *** Written to lock in the four
 * known instances, it immediately surfaced TWO MORE that neither sub-agent had examined — and
 * one of them, scripts/eva-intake-refine.js, was resolving to the ARCHIVED roadmap 8ffa7fdf on
 * live data, via the SAME root cause the SD documents (a current_baseline_version > 0 predicate
 * that excludes the real roadmap, falling through to an unscoped "any draft" fallback).
 *
 * WHAT IT DETECTS, deliberately narrow: a strategic_roadmaps statement that orders by created_at
 * without any status predicate — the "newest wins" shape. That is precise enough to have almost
 * no false positives and is exactly the shape that caused this incident. It does NOT try to
 * police every unscoped read; a broader rule would flag legitimate listings and would be
 * silenced within a week, which is worse than a narrow rule that holds.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Statements that legitimately order roadmaps by recency with no status filter.
 * Each entry states WHY. An allowlist without reasons decays into a mute button.
 */
const ALLOWLIST = {
  'scripts/roadmap-status.js':
    'Operator status display: deliberately ENUMERATES every roadmap, archived included, newest ' +
    'first. It reports the corpus rather than resolving a canonical one, so a status filter ' +
    'would hide exactly what the tool exists to show.',
  'scripts/one-off/archive-duplicate-roadmaps.mjs':
    'The duplicate-cleanup one-off. Its whole purpose is to enumerate NON-canonical roadmaps, ' +
    'and it is separately fenced by a hardcoded id allowlist plus a fail-closed referrer check.',
  'scripts/archive/one-time/roadmap-baseline.js':
    'Retired one-time script under scripts/archive/. Not on any live path; left unmodified ' +
    'rather than touched, since editing dead code to satisfy a linter adds risk and no value.',
};

function walk(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.worktrees') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(js|mjs|cjs)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/** Extract each strategic_roadmaps statement with a little leading context (the chain head). */
export function findRoadmapStatements(source) {
  const lines = source.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    if (!/from\(\s*['"]strategic_roadmaps['"]\s*\)/.test(line)) return;
    const back = lines.slice(Math.max(0, i - 3), i).join('\n');
    let stmt = '';
    for (let j = i; j < Math.min(i + 10, lines.length); j++) {
      stmt += lines[j] + '\n';
      if (/;\s*$/.test(lines[j])) break;
    }
    out.push({ line: i + 1, text: `${back}\n${stmt}` });
  });
  return out;
}

/** The defect shape: picks by recency, constrains nothing about status. */
export function isNewestWinsWithoutStatus(text) {
  const ordersByRecency = /\.order\(\s*['"]created_at['"]/.test(text);
  const hasStatusPredicate = /\.(eq|in|neq)\(\s*['"]status['"]/.test(text);
  const isWrite = /\.(update|insert|upsert|delete)\s*\(/.test(text);
  return ordersByRecency && !hasStatusPredicate && !isWrite;
}

describe('FR-6: no roadmap reader picks by recency without constraining status', () => {
  const files = ['lib', 'scripts', 'server'].flatMap((d) => walk(path.join(ROOT, d)));

  it('scans a non-trivial corpus (guards against a vacuous pass)', () => {
    // If the walk silently returned nothing, every assertion below would pass while checking
    // nothing at all — the exact failure mode this SD is about.
    const withRoadmapReads = files.filter((f) => fs.readFileSync(f, 'utf8').includes("from('strategic_roadmaps')"));
    expect(files.length).toBeGreaterThan(200);
    expect(withRoadmapReads.length).toBeGreaterThanOrEqual(10);
  });

  it('finds no unallowlisted newest-wins reader', () => {
    const violations = [];
    for (const file of files) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      if (ALLOWLIST[rel]) continue;
      const src = fs.readFileSync(file, 'utf8');
      if (!src.includes("from('strategic_roadmaps')")) continue;
      for (const stmt of findRoadmapStatements(src)) {
        if (isNewestWinsWithoutStatus(stmt.text)) violations.push(`${rel}:${stmt.line}`);
      }
    }
    expect(violations, `Roadmap readers selecting by recency with no status predicate:\n  ${violations.join('\n  ')}\n\nResolve through lib/roadmap/canonical-roadmap.js resolveCanonicalRoadmap(), or add a reasoned ALLOWLIST entry.`).toEqual([]);
  });

  it('NEGATIVE CONTROL: the detector fires on the exact shape that shipped', () => {
    // Verbatim from chairman-morning-review-sweep.mjs before this SD. If this stops failing,
    // the detector has been weakened and the test above is decorative.
    const shipped = `
      const { data: roadmaps } = await supabase.from('strategic_roadmaps')
        .select('id, status, created_at').order('created_at', { ascending: false }).limit(1);
    `;
    expect(isNewestWinsWithoutStatus(shipped)).toBe(true);
  });

  it('NEGATIVE CONTROL: the detector does NOT fire on correctly-scoped or write statements', () => {
    const scoped = 'await supabase.from(\'strategic_roadmaps\').select(\'id\').eq(\'status\', \'active\').order(\'created_at\');';
    const write = 'await supabase.from(\'strategic_roadmaps\').update({ status: \'archived\' }).order(\'created_at\');';
    expect(isNewestWinsWithoutStatus(scoped)).toBe(false);
    expect(isNewestWinsWithoutStatus(write)).toBe(false);
  });

  it('every allowlist entry names a real file and gives a reason', () => {
    // A stale allowlist entry silently re-opens the hole it was excusing.
    for (const [rel, reason] of Object.entries(ALLOWLIST)) {
      expect(fs.existsSync(path.join(ROOT, rel)), `allowlisted file no longer exists: ${rel}`).toBe(true);
      expect(reason.length, `allowlist entry needs a real reason: ${rel}`).toBeGreaterThan(40);
    }
  });
});
