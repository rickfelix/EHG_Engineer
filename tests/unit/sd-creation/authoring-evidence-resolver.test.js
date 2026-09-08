/**
 * SD-LEO-FIX-AUTHORING-TIME-EVIDENCE-001: unit tests for the authoring-time evidence-artifact
 * resolver (lib/sd-creation/authoring-evidence-resolver.js).
 *
 * Confirmed by VALIDATION (evidence 3aedc8bd-7e2e-4b90-9fa0-582fadaa3790) that
 * acceptance-artifact-gate.js's validateDeclaration/evaluateSatisfied cannot be reused for
 * free-text prose scanning ("NOT a prose parser") -- this is a genuinely NEW, standalone
 * module, tested in isolation here; tests/unit/sd-creation/authoring-evidence-resolver-
 * pipeline-wiring.test.js covers the createSD() integration point.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  extractUuidTokens,
  resolveArtifactOwner,
  resolveArtifactOwnersInFields,
  annotateOwnerInText,
  ARTIFACT_OWNER_ALLOWLIST,
} from '../../../lib/sd-creation/authoring-evidence-resolver.js';

describe('extractUuidTokens', () => {
  it('returns an empty array for text with no uuid-shaped tokens', () => {
    expect(extractUuidTokens('nothing here')).toEqual([]);
    expect(extractUuidTokens('')).toEqual([]);
    expect(extractUuidTokens(null)).toEqual([]);
    expect(extractUuidTokens(undefined)).toEqual([]);
  });

  it('extracts a single uuid-shaped token, lowercased', () => {
    expect(extractUuidTokens('cites row 8FD20429-1234-5678-9ABC-DEF012345678 as a fixture'))
      .toEqual(['8fd20429-1234-5678-9abc-def012345678']);
  });

  it('dedupes repeated tokens, preserving first-seen order', () => {
    const t = 'aaaaaaaa-1111-2222-3333-444444444444';
    expect(extractUuidTokens(`${t} again ${t} and once more ${t}`)).toEqual([t]);
  });

  it('extracts multiple distinct tokens in first-seen order', () => {
    const a = 'aaaaaaaa-1111-2222-3333-444444444444';
    const b = 'bbbbbbbb-1111-2222-3333-444444444444';
    expect(extractUuidTokens(`first ${b} then ${a}`)).toEqual([b, a]);
  });

  it('is cap-bounded (default cap 10) against unbounded scanning', () => {
    const tokens = Array.from({ length: 15 }, (_, i) =>
      `${String(i).padStart(8, '0')}-1111-2222-3333-444444444444`);
    expect(extractUuidTokens(tokens.join(' '))).toHaveLength(10);
  });

  it('respects an explicit lower cap', () => {
    const a = 'aaaaaaaa-1111-2222-3333-444444444444';
    const b = 'bbbbbbbb-1111-2222-3333-444444444444';
    expect(extractUuidTokens(`${a} ${b}`, 1)).toEqual([a]);
  });

  it('does not match a malformed/short hex string', () => {
    expect(extractUuidTokens('123e4567-e89b-12d3-a456-42661417400')).toEqual([]); // one char short
  });
});

function makeSupabase(tableRows) {
  return {
    from: (table) => ({
      select: () => ({
        eq: (col, val) => ({
          maybeSingle: async () => {
            const rows = tableRows[table] || [];
            const row = rows.find((r) => r.id === val);
            return { data: row || null, error: null };
          },
        }),
      }),
    }),
  };
}

describe('resolveArtifactOwner', () => {
  it('resolves a token present in the first allowlisted table it matches', async () => {
    const supabase = makeSupabase({
      strategic_directives_v2: [{ id: 'tok-1', sd_key: 'SD-REAL-001' }],
    });
    const result = await resolveArtifactOwner(supabase, 'tok-1');
    expect(result).toEqual({ token: 'tok-1', resolved: true, table: 'strategic_directives_v2', ownerKey: 'SD-REAL-001' });
  });

  it('falls through to a later allowlisted table when earlier ones do not match', async () => {
    const supabase = makeSupabase({
      venture_artifacts: [{ id: 'tok-2', venture_id: 'VENTURE-9' }],
    });
    const result = await resolveArtifactOwner(supabase, 'tok-2');
    expect(result).toEqual({ token: 'tok-2', resolved: true, table: 'venture_artifacts', ownerKey: 'VENTURE-9' });
  });

  it('returns unresolved when the token matches no allowlisted table', async () => {
    const supabase = makeSupabase({});
    const result = await resolveArtifactOwner(supabase, 'tok-nowhere');
    expect(result).toEqual({ token: 'tok-nowhere', resolved: false });
  });

  it('treats a per-table error as "not found on that table", trying the next table rather than aborting', async () => {
    const supabase = {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (table === 'strategic_directives_v2') throw new Error('boom');
              if (table === 'uat_test_runs') return { data: { id: 'tok-3', sd_id: 'SD-FALLBACK-001' }, error: null };
              return { data: null, error: null };
            },
          }),
        }),
      }),
    };
    const result = await resolveArtifactOwner(supabase, 'tok-3');
    expect(result).toEqual({ token: 'tok-3', resolved: true, table: 'uat_test_runs', ownerKey: 'SD-FALLBACK-001' });
  });

  it('probes tables in the declared allowlist order', () => {
    expect(ARTIFACT_OWNER_ALLOWLIST.map((e) => e.table)).toEqual([
      'strategic_directives_v2', 'venture_artifacts', 'uat_test_runs',
    ]);
  });
});

describe('resolveArtifactOwnersInFields', () => {
  it('resolves tokens across multiple fields and reports zero unresolved when all resolve', async () => {
    const supabase = makeSupabase({ strategic_directives_v2: [{ id: 'aaaaaaaa-1111-2222-3333-444444444444', sd_key: 'SD-REAL-001' }] });
    const { resolutions, unresolved } = await resolveArtifactOwnersInFields(supabase, [
      'description citing aaaaaaaa-1111-2222-3333-444444444444',
      null,
      'scope text with no uuid',
    ]);
    expect(resolutions).toHaveLength(1);
    expect(unresolved).toEqual([]);
  });

  it('reports unresolved tokens explicitly, never silently dropping them', async () => {
    const supabase = makeSupabase({});
    const { unresolved } = await resolveArtifactOwnersInFields(supabase, [
      'description citing bbbbbbbb-1111-2222-3333-444444444444',
    ]);
    expect(unresolved).toEqual(['bbbbbbbb-1111-2222-3333-444444444444']);
  });

  it('returns empty resolutions/unresolved for prose with no tokens at all (zero live impact)', async () => {
    const supabase = makeSupabase({});
    const { resolutions, unresolved } = await resolveArtifactOwnersInFields(supabase, ['plain prose, no ids']);
    expect(resolutions).toEqual([]);
    expect(unresolved).toEqual([]);
  });
});

describe('annotateOwnerInText', () => {
  it('appends an owner annotation immediately beside the matched token', () => {
    const text = 'Fixture: aaaaaaaa-1111-2222-3333-444444444444 is the source row.';
    expect(annotateOwnerInText(text, 'aaaaaaaa-1111-2222-3333-444444444444', 'SD-REAL-001'))
      .toBe('Fixture: aaaaaaaa-1111-2222-3333-444444444444 (owner: SD-REAL-001) is the source row.');
  });

  it('REPLACES a stale existing owner annotation rather than duplicating it -- the row always wins', () => {
    const text = 'Fixture: aaaaaaaa-1111-2222-3333-444444444444 (owner: SD-WRONG-GUESS) is the source row.';
    expect(annotateOwnerInText(text, 'aaaaaaaa-1111-2222-3333-444444444444', 'SD-REAL-001'))
      .toBe('Fixture: aaaaaaaa-1111-2222-3333-444444444444 (owner: SD-REAL-001) is the source row.');
  });

  it('is a no-op passthrough for non-string input', () => {
    expect(annotateOwnerInText(null, 'x', 'y')).toBeNull();
    expect(annotateOwnerInText(undefined, 'x', 'y')).toBeUndefined();
  });

  it('annotates every occurrence of a repeated token', () => {
    const t = 'aaaaaaaa-1111-2222-3333-444444444444';
    const text = `${t} appears twice: ${t}`;
    expect(annotateOwnerInText(text, t, 'SD-REAL-001')).toBe(`${t} (owner: SD-REAL-001) appears twice: ${t} (owner: SD-REAL-001)`);
  });
});
