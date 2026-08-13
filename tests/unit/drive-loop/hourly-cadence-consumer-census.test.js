// SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 FR-4, TS-7.
//
// Census-pinning test: enumerates every production query shape against drive_reports that
// resolves "the current/latest report" and asserts each one filters to cadence='scheduled'.
// Covers BOTH query forms found in this codebase: JS .eq()/.order() method chains, and raw
// PostgREST query strings (session-role-orient.cjs is a SessionStart hook that queries via a URL
// string, not a JS method call -- a naive grep for `.order('generated_at'` would silently miss
// it, which is exactly the gap this test closes).
//
// Includes a POSITIVE CONTROL: a deliberately unguarded site is seeded into the census and the
// test asserts it fails, proving this test can actually detect a missing guard rather than
// passing vacuously on a wrong pattern.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// The 4 "newest row" sites this SD's FR-4 covers with a cadence filter. Two further sites
// (drive-report-sweep.mjs's daily findExisting probe and drive-report-hourly-sweep.mjs's own)
// are deliberately excluded here -- both query by EXACT run_id equality, not "newest row", so
// they are safe by construction (disjoint windowKey()/hourlyWindowKey() schemes) rather than by
// a cadence filter; that disjointness is covered by hourlyWindowKey's own property tests in
// tests/unit/cron/drive-report-hourly-sweep.test.js and by the FR-4 AC-5 block in
// tests/unit/cron/drive-report-sweep.test.js.
const GUARDED_SITES = [
  { file: 'scripts/coordinator-drive-report-consume.mjs', kind: 'js' },
  { file: 'scripts/cron/drive-report-sms-sweep.mjs', kind: 'js' },
  { file: 'lib/chairman/daily-review/roadmap-status-doc.js', kind: 'js' },
  { file: 'scripts/hooks/session-role-orient.cjs', kind: 'url' },
];

/**
 * A query "resolves the current/latest report" if it orders by generated_at descending (JS form)
 * or contains order=generated_at.desc (raw PostgREST URL form), in either case scoped to
 * drive_reports.
 */
function findsLatestReportQueries(source) {
  const jsPattern = /from\(['"]drive_reports['"]\)[\s\S]{0,800}?\.order\(\s*['"]generated_at['"]/g;
  const urlPattern = /drive_reports\?[^'"`]*order=generated_at\.desc/g;
  return [...(source.match(jsPattern) || []), ...(source.match(urlPattern) || [])];
}

/** A cadence filter, in either query form. */
function hasCadenceFilter(queryText) {
  return /\.eq\(\s*['"]cadence['"]\s*,\s*['"]scheduled['"]\s*\)/.test(queryText)
    || /cadence=eq\.scheduled/.test(queryText);
}

describe('drive_reports consumer census (SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 FR-4/TS-7)', () => {
  for (const site of GUARDED_SITES) {
    it(`${site.file} filters to cadence='scheduled' when resolving the current report`, () => {
      const source = readFileSync(join(ROOT, site.file), 'utf8');
      const queries = findsLatestReportQueries(source);
      expect(queries.length, `expected at least one "latest report" query in ${site.file}`).toBeGreaterThan(0);
      for (const q of queries) {
        // The cadence filter may sit just before/after the order clause within the same chain;
        // search a window around the match rather than requiring it inside the matched substring
        // itself (JS chains can place .eq() before .order() or vice versa).
        const idx = source.indexOf(q);
        const window = source.slice(Math.max(0, idx - 300), idx + q.length + 300);
        expect(hasCadenceFilter(window), `${site.file}: found a "latest report" query with no cadence='scheduled' filter nearby:\n${q}`).toBe(true);
      }
    });
  }

  it('POSITIVE CONTROL: a deliberately unguarded query fails this census (proves the census is not vacuous)', () => {
    const unguardedSource = "supabase.from('drive_reports').select('id').order('generated_at', { ascending: false }).limit(1)";
    const queries = findsLatestReportQueries(unguardedSource);
    expect(queries.length).toBeGreaterThan(0);
    expect(hasCadenceFilter(queries[0])).toBe(false);
  });

  it('POSITIVE CONTROL: a deliberately unguarded raw URL query also fails this census', () => {
    const unguardedUrl = 'drive_reports?select=id,drive_score&order=generated_at.desc&limit=1';
    const queries = findsLatestReportQueries(unguardedUrl);
    expect(queries.length).toBeGreaterThan(0);
    expect(hasCadenceFilter(queries[0])).toBe(false);
  });
});
