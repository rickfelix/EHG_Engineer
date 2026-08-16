// SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001 TS-1 (corrected) / TS-8. Fixture-driven unit tests
// for the anon/PUBLIC-axis verifier's core comparison LOGIC (evaluateBucketCompliance /
// findUndeclaredExposures), extracted from scripts/audit-rpc-execute-grants.mjs's
// runBucketsAxisCheck() specifically so this logic is testable without a live database — feed it
// synthetic before/after ACL fixtures and assert it discriminates, per TESTING sub-agent's TS-1
// correction (this is the permanent regression test of the verifier's LOGIC, not a pin of
// today's ephemeral live-catalog fact — that one-shot measurement lives separately in
// scripts/one-off/exec-live-baseline-close-remaining-security-001.mjs).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { evaluateBucketCompliance, findUndeclaredExposures } from '../../scripts/audit-rpc-execute-grants.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(path.join(__dirname, '../../scripts/audit-rpc-execute-grants-buckets.json'), 'utf8')
);

describe('evaluateBucketCompliance — TS-1: discriminates an exposed function from a closed one', () => {
  it('Bucket A function still carrying anon/auth/public EXECUTE (exposed, pre-fix state) FAILS', () => {
    const failures = evaluateBucketCompliance('public.foo()', 'A', { anon_exec: true, auth_exec: true, public_exec: true });
    expect(failures).toHaveLength(3);
    expect(failures.join(' ')).toMatch(/anon_exec=true/);
    expect(failures.join(' ')).toMatch(/auth_exec=true/);
    expect(failures.join(' ')).toMatch(/public_exec=true/);
  });

  it('Bucket A function with anon/auth/public all revoked (closed, post-fix state) PASSES', () => {
    const failures = evaluateBucketCompliance('public.foo()', 'A', { anon_exec: false, auth_exec: false, public_exec: false });
    expect(failures).toEqual([]);
  });

  it('Bucket B function still carrying anon/public EXECUTE (exposed) FAILS', () => {
    const failures = evaluateBucketCompliance('public.bar()', 'B', { anon_exec: true, auth_exec: true, public_exec: true });
    expect(failures.some((f) => f.includes('anon_exec=true'))).toBe(true);
    expect(failures.some((f) => f.includes('public_exec=true'))).toBe(true);
  });

  it('Bucket B function correctly closed (anon/public false, authenticated preserved) PASSES', () => {
    const failures = evaluateBucketCompliance('public.bar()', 'B', { anon_exec: false, auth_exec: true, public_exec: false });
    expect(failures).toEqual([]);
  });

  it('Bucket B function that lost its authenticated grant entirely is flagged as a REGRESSION, not silently ignored', () => {
    const failures = evaluateBucketCompliance('public.bar()', 'B', { anon_exec: false, auth_exec: false, public_exec: false });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/auth_exec=false.*regression/);
  });

  it('a function absent from the live catalog query result is reported as NOT FOUND, not silently skipped', () => {
    const failures = evaluateBucketCompliance('public.missing()', 'A', undefined);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/NOT FOUND in live catalog/);
  });

  it('Bucket C is never asserted on by this function (the migration verify block owns that axis)', () => {
    const failures = evaluateBucketCompliance('public.baz()', 'C', { anon_exec: true, auth_exec: true, public_exec: true });
    expect(failures).toEqual([]);
  });
});

describe('findUndeclaredExposures — TS-8: the completeness gate catches a function outside every declared bucket', () => {
  it('a live anon/PUBLIC-executable function absent from the manifest is reported as undeclared', () => {
    const declared = new Map([['public.known()', 'A']]);
    const undeclared = findUndeclaredExposures(['public.known()', 'public.surprise_new_function()'], declared);
    expect(undeclared).toEqual(['public.surprise_new_function()']);
  });

  it('when every exposed function is declared somewhere, reports zero undeclared', () => {
    const declared = new Map([['public.known()', 'A'], ['public.also_known()', 'B']]);
    const undeclared = findUndeclaredExposures(['public.known()', 'public.also_known()'], declared);
    expect(undeclared).toEqual([]);
  });

  it('accepts a plain Set as well as a Map for the declared collection', () => {
    const declared = new Set(['public.known()']);
    const undeclared = findUndeclaredExposures(['public.known()', 'public.rogue()'], declared);
    expect(undeclared).toEqual(['public.rogue()']);
  });
});

// SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001 FR-2/FR-5: the manifest gained 3 Bucket C entries for the
// binding-KEEP functions VALIDATION/Explore found undeclared. These tests read the REAL manifest
// file (not a synthetic fixture) so a future edit that removes or misclassifies one of the 3
// entries fails a test, not just a live gate run.
describe('scripts/audit-rpc-execute-grants-buckets.json — binding-KEEP manifest coverage (FR-2)', () => {
  const BINDING_KEEP_SIGNATURES = [
    'public.fn_submit_venture_user_feedback(p_venture_id uuid, p_ingest_secret text, p_feedback_type text, p_title text, p_description text)',
    'public.fn_submit_venture_feedback(p_venture_id uuid, p_ingest_secret text, p_source_type text, p_severity text, p_category text, p_message text)',
    'public.fn_submit_venture_error(p_venture_id uuid, p_ingest_secret text, p_error_hash text, p_message text, p_context jsonb)',
  ];

  it('all 3 binding-KEEP signatures are present in Bucket C', () => {
    const bucketCSignatures = manifest.buckets.C.functions.map((f) => f.signature);
    for (const sig of BINDING_KEEP_SIGNATURES) {
      expect(bucketCSignatures).toContain(sig);
    }
  });

  it('none of the binding-KEEP signatures is present in Bucket A or B (they must never be revoked)', () => {
    const revokeSignatures = new Set([
      ...manifest.buckets.A.functions.map((f) => f.signature),
      ...manifest.buckets.B.functions.map((f) => f.signature),
    ]);
    for (const sig of BINDING_KEEP_SIGNATURES) {
      expect(revokeSignatures.has(sig)).toBe(false);
    }
  });

  it('manifest grew from 27 to 30 total declared entries (no accidental duplicate or drop)', () => {
    const total = Object.values(manifest.buckets).reduce((sum, b) => sum + b.functions.length, 0);
    expect(total).toBe(30);
  });

  it('every declared signature is unique across all buckets (no function double-classified)', () => {
    const all = Object.values(manifest.buckets).flatMap((b) => b.functions.map((f) => f.signature));
    expect(new Set(all).size).toBe(all.length);
  });
});

// SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001 FR-5: mutation test at manifest scale, proving the
// completeness gate actually discriminates rather than being vacuously green — run over the
// REAL manifest's full signature set (30 entries), not a 2-entry toy fixture.
describe('findUndeclaredExposures — FR-5 mutation test at manifest scale', () => {
  it('a synthetic snapshot matching every declared signature reports zero undeclared', () => {
    const declared = new Map(
      Object.entries(manifest.buckets).flatMap(([bucket, { functions }]) =>
        functions.map((f) => [f.signature, bucket])
      )
    );
    const exposed = [...declared.keys()]; // every declared signature is "live-exposed" in this fixture
    expect(findUndeclaredExposures(exposed, declared)).toEqual([]);
  });

  it('injecting one undeclared anon-EXEC signature into the exposed set is caught, not silently absorbed', () => {
    const declared = new Map(
      Object.entries(manifest.buckets).flatMap(([bucket, { functions }]) =>
        functions.map((f) => [f.signature, bucket])
      )
    );
    const mutatedExposed = [...declared.keys(), 'public.fn_never_triaged_regression()'];
    const undeclared = findUndeclaredExposures(mutatedExposed, declared);
    expect(undeclared).toEqual(['public.fn_never_triaged_regression()']);
  });

  it('reverting the mutation returns to zero undeclared (proves the test fixture itself is sound, not permanently red)', () => {
    const declared = new Map(
      Object.entries(manifest.buckets).flatMap(([bucket, { functions }]) =>
        functions.map((f) => [f.signature, bucket])
      )
    );
    const exposed = [...declared.keys()];
    expect(findUndeclaredExposures(exposed, declared)).toEqual([]);
  });
});
