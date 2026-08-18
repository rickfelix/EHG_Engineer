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
