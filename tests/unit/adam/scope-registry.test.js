/**
 * SD-LEO-INFRA-ADAM-OPPORTUNITY-SCAN-001 — scope registry.
 * DB-free: a tiny thenable mock stands in for the supabase-js query builder.
 */
import { describe, it, expect } from 'vitest';
import {
  enumerateScopes,
  selectScopeForTick,
  resolveScopeArg,
  countLiveVentures,
} from '../../../lib/adam/scope-registry.js';

function thenable(rows) {
  return {
    select() { return this; },
    eq() { return this; },
    is() { return this; },
    order() { return this; },
    limit() { return this; },
    then(onF, onR) { return Promise.resolve({ data: rows, error: null }).then(onF, onR); },
  };
}
function mockClient({ apps, ventures }) {
  return {
    from(t) {
      if (t === 'applications') return thenable(apps);
      if (t === 'ventures') return thenable(ventures);
      return thenable([]);
    },
  };
}

const APPS = [
  { id: 'a1', name: 'EHG_Engineer', kind: 'platform', local_path: '/p/eng', venture_id: null },
  { id: 'a2', name: 'EHG', kind: 'platform', local_path: '/p/ehg', venture_id: null },
  { id: 'a3', name: 'CronGenius', kind: 'venture', local_path: '/p/cg', venture_id: 'V1' },
  { id: 'a4', name: 'DataDistill', kind: 'venture', local_path: '/p/dd', venture_id: 'V2' },
  { id: 'a5', name: 'Synthetic NoVenture', kind: 'venture', local_path: '/p/sn', venture_id: null },
  { id: 'a6', name: 'LinkedToCancelled', kind: 'venture', local_path: '/p/lc', venture_id: 'V3' },
];
const VENTURES = [
  { id: 'V1', name: 'CronGenius' },
  { id: 'V2', name: 'DataDistill' },
]; // V3 is cancelled => not returned by the active+non-demo query

describe('enumerateScopes', () => {
  it('returns harness + platform + exactly the 2 live ventures', async () => {
    const scopes = await enumerateScopes(mockClient({ apps: APPS, ventures: VENTURES }));
    expect(scopes.map((s) => s.scope_key)).toEqual(['harness', 'platform', 'venture:V1', 'venture:V2']);
  });

  it('excludes a venture-kind app with NULL venture_id and one linked to a non-live venture', async () => {
    const scopes = await enumerateScopes(mockClient({ apps: APPS, ventures: VENTURES }));
    const ventureKeys = scopes.filter((s) => s.kind === 'venture').map((s) => s.scope_key);
    expect(ventureKeys).not.toContain('venture:V3');
    expect(scopes.some((s) => s.app_name === 'Synthetic NoVenture')).toBe(false);
  });

  it('classifies EHG_Engineer as harness and EHG as platform', async () => {
    const scopes = await enumerateScopes(mockClient({ apps: APPS, ventures: VENTURES }));
    expect(scopes.find((s) => s.scope_key === 'harness').app_name).toBe('EHG_Engineer');
    expect(scopes.find((s) => s.scope_key === 'platform').app_name).toBe('EHG');
    expect(countLiveVentures(scopes)).toBe(2);
  });

  it('throws when the applications query errors', async () => {
    const bad = { from: () => ({ select() { return this; }, eq() { return this; }, is() { return this; }, then(f) { return Promise.resolve({ data: null, error: { message: 'boom' } }).then(f); } }) };
    await expect(enumerateScopes(bad)).rejects.toThrow(/applications query failed/);
  });
});

describe('selectScopeForTick (weighted round-robin, deterministic)', () => {
  const scopes = [
    { scope_key: 'harness', kind: 'platform' },
    { scope_key: 'platform', kind: 'platform' },
    { scope_key: 'venture:V1', kind: 'venture' },
    { scope_key: 'venture:V2', kind: 'venture' },
  ];
  it('weights platform scopes double and is replayable by tick index', () => {
    // weighted slots: [harness,harness,platform,platform,venture:V1,venture:V2]
    expect(selectScopeForTick(scopes, 0).scope_key).toBe('harness');
    expect(selectScopeForTick(scopes, 2).scope_key).toBe('platform');
    expect(selectScopeForTick(scopes, 4).scope_key).toBe('venture:V1');
    expect(selectScopeForTick(scopes, 6).scope_key).toBe('harness'); // wraps
  });
  it('returns null for an empty scope list', () => {
    expect(selectScopeForTick([], 0)).toBeNull();
  });
});

describe('resolveScopeArg', () => {
  const scopes = [
    { scope_key: 'harness', kind: 'platform' },
    { scope_key: 'venture:V1', kind: 'venture', venture_id: 'V1' },
  ];
  it('resolves an explicit key, auto, and returns null for an unknown scope', () => {
    expect(resolveScopeArg(scopes, 'venture:V1').venture_id).toBe('V1');
    expect(resolveScopeArg(scopes, 'auto', 0)).toBeTruthy();
    expect(resolveScopeArg(scopes, 'bogus')).toBeNull();
  });
});
