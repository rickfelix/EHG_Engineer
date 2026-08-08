/**
 * BLOCKING REGRESSION on the creator path — found independently by VALIDATION (72db4226) and
 * REGRESSION (a54189e3), both by measuring HEAD against origin/main rather than by reading.
 * SD-LEO-INFRA-VERIFY-CONSUMER-HANDOFF-001
 *
 * Closing hole A was right, but it landed on the BLOCKING creator path too: whenever
 * createdTables is empty — every FLAG and DETECTOR creator — the CONSUMER leg became
 * UNSATISFIABLE. Measured PASS -> FAIL on a required:true gate on the shared PLAN-TO-LEAD
 * pipeline, outside the warn-first flag, with a waiver as the only exit. A gate that cannot be
 * satisfied by doing the right thing does not get obeyed; it gets bypassed.
 *
 * No fixture for a flag/detector creator existed, which is why the whole suite stayed green
 * through the regression.
 */
import { describe, it, expect } from 'vitest';
import { resolveOperatorContract } from '../harness-adapter.js';

const REGISTRY = [{ process_key: 'my-flag', currently_expected_active: true, expected_interval_seconds: 3600, last_fired_at: new Date().toISOString() }];
const supabase = { from: () => ({ select: async () => ({ data: REGISTRY, error: null }) }) };

/** A FLAG creator: inserts into leo_feature_flags, creates NO table. */
const flagCreatorDiff = (extra = []) => ({
  changedFiles: [
    { path: 'scripts/add-flag.js', added: "await supabase.from('leo_feature_flags').insert({ key: 'my-flag' })" },
    ...extra,
  ],
  migrations: [], createdTables: [],
});

const meta = (m = {}) => ({ metadata: { operator_capability_keys: ['my-flag'], ...m } });
const run = (diff, sd) => resolveOperatorContract({ sd, appPath: '.', supabase, diff });

describe('a FLAG creator that ships a reader is NOT blocked', () => {
  it('a cited consumer satisfies the leg (this returned missing:[consumer] before the fix)', async () => {
    const res = await run(
      flagCreatorDiff(),
      meta({ consumer_evidence: [{ consumer: 'lib/runtime/flag-reader.js:42', observed_read: 'reads my-flag; returned enabled=true', artifact: 'query_result' }] }),
    );
    expect(res.missing || []).not.toContain('consumer');
    expect(res.verdict).toBe('pass');
  });

  it('the reader may live OUTSIDE the diff — a flag consumer usually predates the flag', async () => {
    const res = await run(
      flagCreatorDiff(),
      meta({ consumer_evidence: [{ consumer: 'lib/elsewhere/never-in-this-diff.js:7', observed_read: 'gates behaviour on my-flag', artifact: 'query_result' }] }),
    );
    expect(res.missing || []).not.toContain('consumer');
  });

  it('STILL BLOCKS with no citation — the fix must not re-open hole A', async () => {
    // Two-sided. If this passes, the regression fix has simply restored the false-PASS that
    // hole A existed to remove, and the whole SD is a round trip.
    const res = await run(flagCreatorDiff(), meta());
    expect(res.missing).toContain('consumer');
  });

  it('STILL rejects producer-side evidence on the creator path', async () => {
    const res = await run(
      flagCreatorDiff(),
      meta({ consumer_evidence: [{ consumer: 'scripts/add-flag.js:1', observed_read: 'the flag was inserted', artifact: 'run_log' }] }),
    );
    expect(res.missing).toContain('consumer');
  });
});

describe('the miss classes ride on the verdict that most needs them', () => {
  it('a non-creator, non-wired, non-orphan diff STILL carries its miss classes', async () => {
    // This early-return path is the ONE place `wired:false` could be misread as "verified
    // unwired" — and it was the one path that dropped the list. Same shape as the D1 defect.
    const res = await run({ changedFiles: [{ path: 'lib/util.js', added: 'export const noop = () => {};' }], migrations: [], createdTables: [] }, { metadata: {} });
    expect(res.wiring_miss_classes).toContain('rpc_indirection');
    expect(res.wiring_miss_classes).toContain('dynamic_dispatch');
  });
});

describe('unreadable files reach the verdict (they had zero readers)', () => {
  it('an unreadable file is carried through, not absorbed', async () => {
    const res = await run(
      { changedFiles: [], migrations: [], createdTables: [], unreadable: [{ path: 'huge.js', error: 'ENOBUFS' }] },
      { metadata: {} },
    );
    expect(res.unreadable_files).toEqual([{ path: 'huge.js', error: 'ENOBUFS' }]);
  });
});

describe('a test fixture is not a creator (this SD blocked ITSELF on it)', () => {
  it('creator-shaped strings inside a test file do NOT make an SD a creator', async () => {
    // Dogfood failure: this SD's own PLAN-TO-LEAD failed OPERATOR_CONTRACT_INCOMPLETE because a
    // fixture string in __tests__ was read as real flag creation, so the gate demanded an armed
    // cadence and a reaper for a flag that does not exist. detectWiring and validateConsumer both
    // excluded test paths; detectCreator did not.
    const { detectCreator } = await import('../index.js');
    for (const path of [
      'lib/gates/operator-contract/__tests__/creator-path-regression.test.js',
      'tests/unit/x.js',
      'lib/y.spec.js',
    ]) {
      const res = detectCreator({ changedFiles: [{ path, added: "await supabase.from('leo_feature_flags').insert({ key: 'my-flag' })" }] });
      expect(res.is_creator, path).toBe(false);
    }
  });

  it('a REAL flag insert in production code is still a creator — two-sided', async () => {
    const { detectCreator } = await import('../index.js');
    const res = detectCreator({ changedFiles: [{ path: 'scripts/add-flag.js', added: "await supabase.from('leo_feature_flags').insert({ key: 'my-flag' })" }] });
    expect(res.is_creator).toBe(true);
    expect(res.creator_kinds).toContain('flag');
  });
});

describe('detectCreator does not scan comment prose (this SD blocked itself on its OWN comment)', () => {
  it('a creator-shaped string inside a comment is NOT a creation', async () => {
    const { detectCreator } = await import('../index.js');
    for (const added of [
      "// the string supabase.from('leo_feature_flags').insert(...) was read as real flag creation",
      "/* discusses supabase.from('leo_feature_flags').insert(row) in prose */",
      ' * a JSDoc continuation mentioning leo_feature_flags and .insert( together',
    ]) {
      expect(detectCreator({ changedFiles: [{ path: 'lib/real.js', added }] }).is_creator, added.slice(0, 40)).toBe(false);
    }
  });

  it('a REAL flag insert in the same file as a comment mentioning it IS still detected', async () => {
    // Two-sided. Stripping comments must not blind the rule to live code beside the prose.
    const { detectCreator } = await import('../index.js');
    const added = "// we insert into leo_feature_flags below\nawait supabase.from('leo_feature_flags').insert({ key: 'k' })";
    expect(detectCreator({ changedFiles: [{ path: 'lib/real.js', added }] }).is_creator).toBe(true);
  });
});
