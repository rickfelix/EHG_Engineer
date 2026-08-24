/**
 * SD-LEO-INFRA-EXECUTOR-120S-1800S-001, FR-4 / TS-6 / TS-7.
 */
import { describe, it, expect } from 'vitest';
import { matchesPreFixFingerprint, remediate } from '../../../scripts/one-off/remediate-executor-manual-required-corruption-001.mjs';

const MISSING_MODULE_RECS = [
  'Read the instructions above',
  'Perform analysis according to sub-agent description',
  'Create lib/sub-agents/docmon.js for automation',
];

function preFixRow(overrides = {}) {
  return {
    id: 'row-1',
    verdict: 'MANUAL_REQUIRED',
    recommendations: MISSING_MODULE_RECS,
    metadata: {},
    ...overrides,
  };
}

describe('matchesPreFixFingerprint', () => {
  it('matches a pre-fix row: recommendations text present, no failure_cause key at all', () => {
    const row = preFixRow({ metadata: {} });
    expect(matchesPreFixFingerprint(row)).toBe(true);
  });

  it('matches a pre-fix row where metadata.error/stack are present-but-null (TR-2)', () => {
    const row = preFixRow({ metadata: { error: null, stack: null } });
    expect(matchesPreFixFingerprint(row)).toBe(true);
  });

  it('N1: does NOT match a genuinely correct post-fix missing_module row -- same recommendations text, but failure_cause populated', () => {
    const row = preFixRow({ metadata: { failure_cause: 'missing_module', error: 'Sub-agent CLAIM failed', stack: 'Error: ...' } });
    expect(matchesPreFixFingerprint(row)).toBe(false);
  });

  it('does not match a genuine_error row (different recommendations text entirely)', () => {
    const row = preFixRow({
      recommendations: ['Investigate the thrown error captured in metadata.error/metadata.stack', 'Perform analysis according to sub-agent description'],
      metadata: { failure_cause: 'genuine_error' },
    });
    expect(matchesPreFixFingerprint(row)).toBe(false);
  });

  it('does not match text containing "for automation" WITHOUT the "Create lib/sub-agents/" phrase (TESTING finding: both substrings must be required, not just one)', () => {
    const row = preFixRow({
      recommendations: ['This is unrelated guidance about test automation, nothing to do with a missing module'],
    });
    expect(matchesPreFixFingerprint(row)).toBe(false);
  });

  it('does not match a non-MANUAL_REQUIRED verdict', () => {
    const row = preFixRow({ verdict: 'PASS' });
    expect(matchesPreFixFingerprint(row)).toBe(false);
  });

  it('does not match a MANUAL_REQUIRED row whose recommendations lack the fingerprint text', () => {
    const row = preFixRow({ recommendations: ['Some unrelated recommendation'] });
    expect(matchesPreFixFingerprint(row)).toBe(false);
  });
});

/** Minimal in-memory fake for sub_agent_execution_results, supporting exactly the query shapes
 * remediate() issues: .eq('verdict',...).limit(), and .eq('id',...).maybeSingle(), plus .update().
 *
 * onAfterBatchFetch (TESTING retrospective finding): fires exactly once, AFTER the initial
 * .limit() batch snapshot has already been captured/resolved but BEFORE remediate() issues its
 * per-row .maybeSingle() re-fetch -- simulating a genuine concurrent write landing in the real
 * race window between the two queries, so the re-fetch (unlike the stale batch snapshot) sees
 * the mutated row. A test that mutates the store BEFORE calling remediate() at all only ever
 * exercises the batch filter and never reaches this window. */
function makeFakeTable(rows, { onAfterBatchFetch } = {}) {
  const store = new Map(rows.map((r) => [r.id, structuredClone(r)]));
  let batchFetchFired = false;
  return {
    store,
    from(table) {
      if (table !== 'sub_agent_execution_results') throw new Error(`unexpected table: ${table}`);
      let pendingEq = null;
      const builder = {
        select() { return this; },
        eq(col, val) { pendingEq = { col, val }; return this; },
        limit() {
          const all = [...store.values()].filter((r) => !pendingEq || r[pendingEq.col] === pendingEq.val);
          const snapshot = all.map((r) => structuredClone(r));
          if (!batchFetchFired && onAfterBatchFetch) {
            batchFetchFired = true;
            onAfterBatchFetch(store);
          }
          return Promise.resolve({ data: snapshot, error: null });
        },
        maybeSingle() {
          const all = [...store.values()].filter((r) => !pendingEq || r[pendingEq.col] === pendingEq.val);
          return Promise.resolve({ data: all[0] ? structuredClone(all[0]) : null, error: null });
        },
        update(patch) {
          const targetId = pendingEq?.val;
          return {
            eq(col2, val2) {
              const row = store.get(val2);
              if (!row) return Promise.resolve({ data: null, error: { message: 'not found' } });
              Object.assign(row, patch);
              return Promise.resolve({ data: structuredClone(row), error: null });
            },
          };
        },
      };
      return builder;
    },
  };
}

describe('remediate (TS-6/TS-7)', () => {
  it('TS-6: marks a pre-fix row via read-merge-write, preserving other metadata keys', async () => {
    const fake = makeFakeTable([
      preFixRow({ id: 'a', metadata: { repo_path: '/x', error: null, stack: null } }),
    ]);
    const result = await remediate(fake, { log: () => {} });
    expect(result.marked).toBe(1);
    const row = fake.store.get('a');
    expect(row.metadata.pre_fix_corrupted).toBe(true);
    expect(row.metadata.repo_path, 'read-merge-write must preserve pre-existing metadata keys').toBe('/x');
    expect(row.metadata.error).toBe(null);
  });

  it('TS-7a: idempotent -- running twice produces the same final state, no error, no double marking', async () => {
    const fake = makeFakeTable([preFixRow({ id: 'a' })]);
    const first = await remediate(fake, { log: () => {} });
    expect(first.marked).toBe(1);
    const second = await remediate(fake, { log: () => {} });
    expect(second.marked).toBe(0);
    expect(second.alreadyMarked).toBe(1);
    expect(fake.store.get('a').metadata.pre_fix_corrupted).toBe(true);
  });

  it('TS-7b: a newly-appeared pre-fix row (simulating a live timeout) is picked up on re-run', async () => {
    const fake = makeFakeTable([preFixRow({ id: 'a' })]);
    await remediate(fake, { log: () => {} });
    // Simulate DOCMON producing a new pre-fix-shaped row between runs.
    fake.store.set('b', preFixRow({ id: 'b' }));
    const second = await remediate(fake, { log: () => {} });
    expect(second.marked).toBe(1);
    expect(fake.store.get('b').metadata.pre_fix_corrupted).toBe(true);
  });

  it('TS-7c / N1: a correct post-fix missing_module row is NEVER marked, including on re-run after FR-1 ships', async () => {
    const fake = makeFakeTable([
      preFixRow({ id: 'old', metadata: {} }), // genuine pre-fix row
      preFixRow({ id: 'new', metadata: { failure_cause: 'missing_module', error: 'x', stack: 'y' } }), // correct post-fix row, same recs text
    ]);
    const result = await remediate(fake, { log: () => {} });
    expect(result.marked).toBe(1);
    expect(fake.store.get('old').metadata.pre_fix_corrupted).toBe(true);
    expect(fake.store.get('new').metadata.pre_fix_corrupted, 'a genuinely correct post-fix row must never be marked corrupted').toBeUndefined();

    // Re-run again -- still must not touch the post-fix row.
    const second = await remediate(fake, { log: () => {} });
    expect(second.marked).toBe(0);
    expect(fake.store.get('new').metadata.pre_fix_corrupted).toBeUndefined();
  });

  it('TS-7d: a row still matching the STALE batch snapshot but raced to a post-fix shape before the re-fetch is excluded, not marked', async () => {
    // Genuinely exercises the read-merge-write re-check (TESTING retrospective finding): the
    // batch .limit() call captures a pre-fix snapshot, THEN (via onAfterBatchFetch, simulating
    // a real concurrent write landing in that exact window) the row is mutated to a correct
    // post-fix shape, and ONLY THEN does remediate() issue its per-row re-fetch. A prior version
    // of this test mutated the row before calling remediate() at all, which only exercised the
    // batch filter (matchesPreFixFingerprint on the initial query) and never reached the re-fetch
    // path -- deleting the entire re-fetch/re-check block left it green.
    const fake = makeFakeTable([preFixRow({ id: 'a' })], {
      onAfterBatchFetch: (store) => {
        const row = store.get('a');
        row.metadata = { failure_cause: 'genuine_error', error: 'raced', stack: 'x' };
        row.recommendations = ['Investigate the thrown error captured in metadata.error/metadata.stack'];
      },
    });
    const result = await remediate(fake, { log: () => {} });
    expect(result.fingerprintMatched, 'the STALE batch snapshot still matched -- proving this test reaches the batch/candidate stage').toBe(1);
    expect(result.marked, 'the re-fetch must see the raced row and refuse to mark it').toBe(0);
    expect(result.skippedRace, 'the race must be observably reported as a skip, not silently absorbed').toBeGreaterThan(0);
    expect(fake.store.get('a').metadata.pre_fix_corrupted, 'a row that raced to a correct post-fix shape must never be marked corrupted').toBeUndefined();
  });
});
