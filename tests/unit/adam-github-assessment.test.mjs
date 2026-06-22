/**
 * SD-LEO-INFRA-REGISTER-TWO-EVERY-001 (DUTY 2) — github-assessment pure-function tests.
 * The script's IO (DB + gh CLI) runs only in main(); the PURE summarizePrs / rankGithubHealth are
 * unit-tested here without any IO.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizePrs, rankGithubHealth } from '../../scripts/adam-github-assessment.mjs';

const NOW = new Date('2026-06-21T00:00:00Z').getTime();
const daysAgo = (d) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();

test('summarizePrs counts open/stale/oversized/conflicts and excludes drafts', () => {
  const prs = [
    { createdAt: daysAgo(20), additions: 10, deletions: 5, mergeable: 'MERGEABLE' },       // stale
    { createdAt: daysAgo(2), additions: 300, deletions: 200, mergeable: 'CONFLICTING' },   // oversized + conflict
    { createdAt: daysAgo(1), additions: 5, deletions: 1, mergeable: 'MERGEABLE', isDraft: true }, // draft -> excluded
  ];
  const s = summarizePrs(prs, { nowMs: NOW });
  assert.equal(s.open, 2);
  assert.equal(s.stale, 1);
  assert.equal(s.oversized, 1);
  assert.equal(s.conflicts, 1);
});

test('summarizePrs is TOTAL on odd input', () => {
  assert.deepEqual(summarizePrs(null), { open: 0, stale: 0, oversized: 0, conflicts: 0 });
  assert.deepEqual(summarizePrs(undefined), { open: 0, stale: 0, oversized: 0, conflicts: 0 });
});

test('rankGithubHealth: clean facts => clean=true (caller stays silent)', () => {
  const r = rankGithubHealth({ ciRedOnMain: 0, prOpen: 3, prStale: 0, failedRuns: 0, alertsDependabot: 0 });
  assert.equal(r.clean, true);
  assert.match(r.summary, /all clear/);
});

test('rankGithubHealth: null facts are omitted (no fabricated alarm)', () => {
  const r = rankGithubHealth({});
  assert.equal(r.clean, true);
  assert.equal(r.findings.length, 0);
});

test('rankGithubHealth: severity-orders findings (high before low) and summarizes', () => {
  const r = rankGithubHealth({ ciRedOnMain: 4, prStale: 2, alertsDependabot: 1, failedRuns: 9 });
  assert.equal(r.clean, false);
  // first finding must be a high-severity one (ci red or dependabot), last a low (stale PR)
  assert.equal(r.findings[0].severity, 'high');
  assert.equal(r.findings[r.findings.length - 1].severity, 'low');
  assert.match(r.summary, /GitHub health \(\d+ items?\)/);
});
