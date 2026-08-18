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

// Round 5's root comes ONLY from an explicit fsDeps.repoRoot override or the expectedRepoRoots
// map (never row.metadata.repo_path, which is no longer read at all). Direct
// resolveTestingEvidenceCoverage() calls that don't care about root-resolution itself use this
// so canResolve stays true and they keep exercising specFileExists's own behavior.
const CWD_FS_DEPS = { repoRoot: process.cwd() };

function testingRow({ id, phase, coverage }) {
  return { id, phase, metadata: { fr_coverage: coverage } };
}

// complianceRows defaults to "every testingRows id resolves to process.cwd()" (the common
// same-repo case), matching fr-delivery-classifier.test.js's stubWithTesting default — so
// classifyFrDelivery-level tests that aren't specifically about cross-repo resolution don't need
// to configure it explicitly. Tests that ARE about root resolution pass an explicit override.
function stub({ stories = [], testingRows = [], complianceRows = null, complianceError = null } = {}) {
  const effectiveComplianceRows = complianceRows ?? testingRows.map((r) => ({ id: r.id, expected_repo_path: process.cwd() }));
  return {
    from(table) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        then(res) {
          if (table === 'user_stories') return Promise.resolve({ data: stories, error: null }).then(res);
          if (table === 'sub_agent_execution_results') return Promise.resolve({ data: testingRows, error: null }).then(res);
          if (table === 'v_sub_agent_repo_compliance') {
            return Promise.resolve(complianceError ? { data: null, error: complianceError } : { data: effectiveComplianceRows, error: null }).then(res);
          }
          return Promise.resolve({ data: [], error: null }).then(res);
        },
      };
      return chain;
    },
  };
}

describe('SECURITY finding 2: the real specFileExists() is genuinely reachable, not just the mock', () => {
  it('resolveTestingEvidenceCoverage level: a test_ref naming a real repo file promotes against the real disk', () => {
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: `${REAL_FILE}:1` }] })];
    const r = resolveTestingEvidenceCoverage(rows, [{ id: 'FR-1' }], CWD_FS_DEPS);
    expect(r.matchedTestingCoverage).toEqual([{ fr_id: 'FR-1', status: 'delivered', test_ref: `${REAL_FILE}:1`, sub_agent_result_id: 'r1' }]);
    expect(r.unresolvedTestRefs).toEqual([]);
  });

  it('resolveTestingEvidenceCoverage level: a test_ref naming a genuinely nonexistent file is rejected against the REAL disk, not a mock', () => {
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: FAKE_FILE }] })];
    const r = resolveTestingEvidenceCoverage(rows, [{ id: 'FR-1' }], CWD_FS_DEPS);
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

  // S7 (closes: fr-delivery-classifier.test.js mocks specFileExists wholesale, so the real
  // traversal guard was only ever proven by SECURITY's own direct probe of e2e-path-guard.js in
  // isolation -- never through THIS classifier's actual wiring. A regression that swapped
  // specFileExists for a naive existsSync would be undetectable in the mocked suite.)
  it('S7: traversal/absolute-path test_ref attempts are rejected through the REAL classifier wiring, not just specFileExists in isolation', () => {
    const attempts = ['../../../etc/passwd', '/etc/passwd', 'C:/Windows/win.ini', 'tests/../../../etc/passwd', '..\\..\\Windows\\win.ini'];
    for (const attempt of attempts) {
      const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: attempt }] })];
      const r = resolveTestingEvidenceCoverage(rows, [{ id: 'FR-1' }], CWD_FS_DEPS);
      expect(r.matchedTestingCoverage).toEqual([]);
    }
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

// SECURITY finding, round 5 (the converged design after rounds 2-4 each closed part of the gap,
// and a 2nd re-verification of round 4 measured the remaining ~24% non-compliant-row exposure
// live): the root now comes EXCLUSIVELY from v_sub_agent_repo_compliance.expected_repo_path
// (this SD's registered applications.local_path) or an explicit fsDeps override — NEVER from
// row.metadata.repo_path, which is not read for this purpose at all anymore. This closes the
// writer-controlled-root class entirely (not just for the "compliant" subset), the staleness
// class (a registered app path doesn't go stale the way a worktree path can), AND structurally
// eliminates the non-string-crash class (the map can only ever contain validated strings — see
// the typeof filter around this query in classifyFrDelivery). These tests use real temp
// directories (not mocks) to prove the mechanism, matching every prior round's methodology.
describe('SECURITY finding (round 5): the root is resolved EXCLUSIVELY from expectedRepoRoots, row.metadata.repo_path is never read', () => {
  function makeOtherRepo(prefix) {
    const root = mkdtempSync(join(tmpdir(), prefix));
    mkdirSync(join(root, 'sub'));
    return root;
  }

  it('a row with a known expectedRepoRoots entry resolves test_ref relative to THAT repo, not process.cwd()', () => {
    const otherRepoRoot = makeOtherRepo('fr-delivery-round5-known-');
    try {
      writeFileSync(join(otherRepoRoot, 'sub', 'marker.js'), '// exists only in the other repo\n');
      const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: 'sub/marker.js' }] })];
      const r = resolveTestingEvidenceCoverage(rows, [{ id: 'FR-1' }], {}, new Map([['r1', otherRepoRoot]]));
      expect(r.matchedTestingCoverage).toHaveLength(1);
    } finally {
      rmSync(otherRepoRoot, { recursive: true, force: true });
    }
  });

  it('THE VULNERABILITY THIS FULLY CLOSES: row.metadata.repo_path is not read at all — a row CLAIMING a root via metadata is ignored entirely, whether or not that claim happens to be true', () => {
    const otherRepoRoot = makeOtherRepo('fr-delivery-round5-ignored-claim-');
    try {
      writeFileSync(join(otherRepoRoot, 'sub', 'marker.js'), '// this row METADATA claims this root, but that claim is never consulted\n');
      // The row's own metadata.repo_path points at otherRepoRoot (where the file genuinely
      // exists) — pre-round-5, a "compliant" verdict would have trusted this metadata field
      // directly. Round 5 never reads row.metadata.repo_path for root resolution at all: with NO
      // expectedRepoRoots entry for this row's id, resolution must fail regardless of what the
      // row's own metadata claims.
      const rows = [{ id: 'r1', phase: 'EXEC', metadata: { repo_path: otherRepoRoot, fr_coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: 'sub/marker.js' }] } }];
      const r = resolveTestingEvidenceCoverage(rows, [{ id: 'FR-1' }], {}, new Map()); // no entry for 'r1'
      expect(r.matchedTestingCoverage).toEqual([]);
      expect(r.unresolvedTestRefs).toHaveLength(1);
    } finally {
      rmSync(otherRepoRoot, { recursive: true, force: true });
    }
  });

  it('a row with NO expectedRepoRoots entry and no fsDeps override is UNRESOLVED — it does NOT fall back to cwd (that fallback is exactly how the writer-controlled-root class re-opened in round 3)', () => {
    // REAL_FILE genuinely exists at process.cwd() — if this fell back to cwd, it would promote,
    // silently reproducing the exact cross-repo false-promote this whole mechanism exists to
    // close for any SD whose target_application isn't registered.
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: REAL_FILE }] })];
    const r = resolveTestingEvidenceCoverage(rows, [{ id: 'FR-1' }], {}, new Map());
    expect(r.matchedTestingCoverage).toEqual([]);
    expect(r.unresolvedTestRefs).toEqual([{ fr_id: 'FR-1', test_ref: REAL_FILE, sub_agent_result_id: 'r1' }]);
  });

  it('an explicit fsDeps.repoRoot override still wins over expectedRepoRoots (test determinism preserved)', () => {
    const otherRepoRoot = makeOtherRepo('fr-delivery-round5-override-');
    try {
      const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: REAL_FILE }] })];
      // expectedRepoRoots says otherRepoRoot (which does NOT have REAL_FILE); the explicit
      // override says cwd (which DOES) — the override must win.
      const r = resolveTestingEvidenceCoverage(rows, [{ id: 'FR-1' }], { repoRoot: process.cwd() }, new Map([['r1', otherRepoRoot]]));
      expect(r.matchedTestingCoverage).toHaveLength(1);
    } finally {
      rmSync(otherRepoRoot, { recursive: true, force: true });
    }
  });

  it('classifyFrDelivery level: a row whose SD resolves to a known application root promotes against that repo, end to end', async () => {
    const otherRepoRoot = makeOtherRepo('fr-delivery-round5-e2e-known-');
    try {
      writeFileSync(join(otherRepoRoot, 'sub', 'marker.js'), '// only in the other repo\n');
      const rows = [testingRow({ id: 'row-known', phase: 'EXEC', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: 'sub/marker.js' }] })];
      const c = await classifyFrDelivery(
        stub({ testingRows: rows, complianceRows: [{ id: 'row-known', expected_repo_path: otherRepoRoot }] }),
        { sdId: 'sd-round5-known', functionalRequirements: [{ id: 'FR-1' }] },
      );
      expect(c.frs[0].status).toBe('delivered');
      expect(c.frs[0].delivery_basis).toBe('testing_evidence');
    } finally {
      rmSync(otherRepoRoot, { recursive: true, force: true });
    }
  });

  it('classifyFrDelivery level: a row whose SD has no known application (expected_repo_path null, e.g. unknown_application) does NOT fall back to cwd', async () => {
    const rows = [testingRow({ id: 'row-unknown', phase: 'EXEC', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: REAL_FILE }] })];
    const c = await classifyFrDelivery(
      stub({ testingRows: rows, complianceRows: [{ id: 'row-unknown', expected_repo_path: null }] }),
      { sdId: 'sd-round5-unknown', functionalRequirements: [{ id: 'FR-1' }] },
    );
    expect(c.frs[0].status).not.toBe('delivered');
    expect(c.unresolved_test_refs).toEqual([{ fr_id: 'FR-1', test_ref: REAL_FILE, sub_agent_result_id: 'row-unknown' }]);
  });

  it('classifyFrDelivery level: a compliance-query error fails CLOSED — nothing is trusted, not accidentally trusted', async () => {
    const rows = [testingRow({ id: 'row-err', phase: 'EXEC', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: REAL_FILE }] })];
    const c = await classifyFrDelivery(
      stub({ testingRows: rows, complianceError: { message: 'connection reset' } }),
      { sdId: 'sd-round5-error', functionalRequirements: [{ id: 'FR-1' }] },
    );
    expect(c.frs[0].status).not.toBe('delivered');
    // SECURITY LOW finding (round 5 follow-up): failing closed made an instrument outage
    // indistinguishable from "nothing was built" -- surfaced as a diagnostic so a downstream
    // UNDELIVERED verdict can be read in its true context rather than as confirmed absence.
    expect(c.compliance_lookup_failed).toBe(true);
  });

  it('classifyFrDelivery level: a SUCCESSFUL compliance lookup reports compliance_lookup_failed=false', async () => {
    const rows = [testingRow({ id: 'row-ok', phase: 'EXEC', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: REAL_FILE }] })];
    const c = await classifyFrDelivery(stub({ testingRows: rows }), { sdId: 'sd-round5-ok', functionalRequirements: [{ id: 'FR-1' }] });
    expect(c.compliance_lookup_failed).toBe(false);
  });

  // Structurally eliminated, not just defended-in-depth: expectedRepoRoots can only ever contain
  // typeof==='string' values (filtered in classifyFrDelivery when the map is built), so a
  // non-string expected_repo_path from a corrupted view result is excluded from the map entirely
  // -- it can never reach path.join(), and it can never silently fall back to cwd either.
  it('SECURITY finding B (structurally eliminated in round 5): a non-string expected_repo_path is excluded from the map, never reaches path.join, and never falls back to cwd', async () => {
    const nonStringValues = [123, {}, [], true];
    for (const badExpectedPath of nonStringValues) {
      const rows = [
        testingRow({ id: 'row-good-1', phase: 'EXEC', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: REAL_FILE }] }),
        testingRow({ id: 'row-poisoned', phase: 'EXEC', coverage: [{ fr_id: 'FR-2', status: 'delivered', test_ref: FAKE_FILE }] }),
      ];
      const c = await classifyFrDelivery(
        stub({
          testingRows: rows,
          complianceRows: [
            { id: 'row-good-1', expected_repo_path: process.cwd() },
            { id: 'row-poisoned', expected_repo_path: badExpectedPath },
          ],
        }),
        { sdId: 'sd-round5-poisoned', functionalRequirements: [{ id: 'FR-1' }, { id: 'FR-2' }] },
      );
      expect(c.frs.find((f) => f.id === 'FR-1').status).toBe('delivered'); // unaffected by its sibling's poisoned entry -- no throw took down the whole gate
      expect(c.frs.find((f) => f.id === 'FR-2').delivery_basis).not.toBe('testing_evidence'); // excluded from the map -> unresolved, never a cwd fallback either
    }
  });
});
