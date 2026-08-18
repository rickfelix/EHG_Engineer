// SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001 — SECURITY finding 2, WIRE≠ENDS follow-up.
//
// fr-delivery-classifier.test.js mocks lib/stories/e2e-path-guard.js at module scope (a
// pattern-match on the string "does-not-exist") so its ~35 pre-existing test_ref placeholder
// values ('x', 'tests/x.test.js:10') keep resolving without touching every call site. That
// proves the classifier's LOGIC around a resolved/unresolved test_ref is correct, but it never
// calls the REAL specFileExists() or touches a REAL filesystem — the fsDeps injection point
// (classifyFrDelivery's third-level option, threaded to resolveTestingEvidenceCoverage) was
// wired but never actually exercised end-to-end. This file does NOT mock e2e-path-guard.js, so
// every call here goes through the genuine specFileExists() against the real disk.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyFrDelivery, resolveTestingEvidenceCoverage } from '../../../../scripts/modules/handoff/gates/fr-delivery-classifier.js';

// A file that genuinely, stably exists in this repo (the module under test itself) and a path
// that genuinely does not — both repo-relative with a '/', matching specFileExists's own shape
// requirements (lib/stories/e2e-path-guard.js:36).
const REAL_FILE = 'scripts/modules/handoff/gates/fr-delivery-classifier.js';
const FAKE_FILE = 'tests/genuinely-does-not-exist-xyz123abc.test.js';

function testingRow({ id, phase, coverage }) {
  return { id, phase, metadata: { fr_coverage: coverage } };
}

function stub({ stories = [], testingRows = [] } = {}) {
  return {
    from(table) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        then(res) {
          if (table === 'user_stories') return Promise.resolve({ data: stories, error: null }).then(res);
          if (table === 'sub_agent_execution_results') return Promise.resolve({ data: testingRows, error: null }).then(res);
          return Promise.resolve({ data: [], error: null }).then(res);
        },
      };
      return chain;
    },
  };
}

describe('SECURITY finding 2: the real specFileExists() is genuinely reachable, not just the mock', () => {
  it('resolveTestingEvidenceCoverage level: a test_ref naming a real repo file, no fsDeps override (production default path), promotes', () => {
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: `${REAL_FILE}:1` }] })];
    const r = resolveTestingEvidenceCoverage(rows, [{ id: 'FR-1' }]);
    expect(r.matchedTestingCoverage).toEqual([{ fr_id: 'FR-1', status: 'delivered', test_ref: `${REAL_FILE}:1`, sub_agent_result_id: 'r1' }]);
    expect(r.unresolvedTestRefs).toEqual([]);
  });

  it('resolveTestingEvidenceCoverage level: a test_ref naming a genuinely nonexistent file is rejected against the REAL disk, not a mock', () => {
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: FAKE_FILE }] })];
    const r = resolveTestingEvidenceCoverage(rows, [{ id: 'FR-1' }]);
    expect(r.matchedTestingCoverage).toEqual([]);
    expect(r.unresolvedTestRefs).toEqual([{ fr_id: 'FR-1', test_ref: FAKE_FILE, sub_agent_result_id: 'r1' }]);
  });

  it('classifyFrDelivery level, end-to-end through the real gate-facing entry point: a genuinely-resolving test_ref promotes to delivered/testing_evidence', async () => {
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: REAL_FILE }] })];
    const c = await classifyFrDelivery(stub({ stories: [], testingRows: rows }), { sdId: 'sd-realfs', functionalRequirements: [{ id: 'FR-1' }] });
    expect(c.frs[0].status).toBe('delivered');
    expect(c.frs[0].delivery_basis).toBe('testing_evidence');
    expect(c.unresolved_test_refs).toEqual([]);
  });

  it('classifyFrDelivery level: a genuinely-nonexistent test_ref does NOT promote, even though it is schema-valid', async () => {
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: FAKE_FILE }] })];
    const c = await classifyFrDelivery(stub({ stories: [], testingRows: rows }), { sdId: 'sd-realfs-neg', functionalRequirements: [{ id: 'FR-1' }] });
    expect(c.frs[0].status).not.toBe('delivered');
    expect(c.unresolved_test_refs).toEqual([{ fr_id: 'FR-1', test_ref: FAKE_FILE, sub_agent_result_id: 'r1' }]);
  });

  it('explicit fsDeps override (custom repoRoot + injected existsSync) is honored, proving the injection point itself is wired, not just its default', () => {
    let calledWith = null;
    const fakeExistsSync = (p) => { calledWith = p; return p.endsWith('injected-marker.js'); };
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: 'some/injected-marker.js:1' }] })];
    const r = resolveTestingEvidenceCoverage(rows, [{ id: 'FR-1' }], { repoRoot: '/fake/root', existsSync: fakeExistsSync });
    expect(r.matchedTestingCoverage).toHaveLength(1);
    expect(calledWith).toContain('injected-marker.js');
    expect(calledWith).toContain('fake');
  });
});

// SECURITY finding (2nd EXEC-phase round): repoRoot previously defaulted globally to
// process.cwd() (this harness's own repo). Measured: 16% of TESTING rows carry
// metadata.repo_path pointing at a DIFFERENT repo entirely. Defaulting to cwd for those checks
// the wrong filesystem -- these tests use REAL temp directories (not mocks) to prove the fix.
describe('SECURITY finding (round 3): per-row repoRoot resolved from metadata.repo_path, not a global cwd default', () => {
  function makeOtherRepo(prefix) {
    const root = mkdtempSync(join(tmpdir(), prefix));
    mkdirSync(join(root, 'sub'));
    return root;
  }

  it('a row with metadata.repo_path resolves test_ref relative to THAT repo, not process.cwd()', () => {
    const otherRepoRoot = makeOtherRepo('fr-delivery-other-repo-');
    try {
      writeFileSync(join(otherRepoRoot, 'sub', 'marker.js'), '// exists only in the other repo\n');
      const rows = [{ id: 'r1', phase: 'EXEC', metadata: { repo_path: otherRepoRoot, fr_coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: 'sub/marker.js' }] } }];
      const r = resolveTestingEvidenceCoverage(rows, [{ id: 'FR-1' }]);
      expect(r.matchedTestingCoverage).toHaveLength(1); // resolves against otherRepoRoot, not process.cwd()
    } finally {
      rmSync(otherRepoRoot, { recursive: true, force: true });
    }
  });

  it('THE SPECIFIC VULNERABILITY: a ref naming a file that exists in this harness repo but not in the row\'s own repo is rejected, not falsely promoted', () => {
    const otherRepoRoot = makeOtherRepo('fr-delivery-other-repo-empty-'); // no such file written here
    try {
      // REAL_FILE genuinely exists at process.cwd() (this repo) — pre-fix, this promoted for
      // EVERY row regardless of which repo it actually belonged to.
      const rows = [{ id: 'r1', phase: 'EXEC', metadata: { repo_path: otherRepoRoot, fr_coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: REAL_FILE }] } }];
      const r = resolveTestingEvidenceCoverage(rows, [{ id: 'FR-1' }]);
      expect(r.matchedTestingCoverage).toEqual([]);
      expect(r.unresolvedTestRefs).toHaveLength(1);
    } finally {
      rmSync(otherRepoRoot, { recursive: true, force: true });
    }
  });

  it('a row lacking metadata.repo_path falls back to process.cwd() (the pre-fix default, still correct for same-repo SDs)', () => {
    const rows = [{ id: 'r1', phase: 'EXEC', metadata: { fr_coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: REAL_FILE }] } }]; // no repo_path
    const r = resolveTestingEvidenceCoverage(rows, [{ id: 'FR-1' }]);
    expect(r.matchedTestingCoverage).toHaveLength(1);
  });

  it('an explicit fsDeps.repoRoot override still wins over a row\'s own metadata.repo_path (test determinism preserved)', () => {
    const otherRepoRoot = makeOtherRepo('fr-delivery-other-repo-override-');
    try {
      const rows = [{ id: 'r1', phase: 'EXEC', metadata: { repo_path: otherRepoRoot, fr_coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: REAL_FILE }] } }];
      const r = resolveTestingEvidenceCoverage(rows, [{ id: 'FR-1' }], { repoRoot: process.cwd() });
      expect(r.matchedTestingCoverage).toHaveLength(1); // explicit override wins, resolves against cwd despite metadata pointing elsewhere
    } finally {
      rmSync(otherRepoRoot, { recursive: true, force: true });
    }
  });
});
