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

  // SECURITY evidence 00145217-33d6-458f-a7a7-63079e4afb1a (F1): a genuine DB/schema error
  // is NOT "not found" -- .maybeSingle() already returns {data:null,error:null} for a real
  // no-row result, so a returned `error` means the probe itself could not run (schema
  // drift, outage) and MUST propagate, so the caller (pipeline.js) can fail OPEN on infra
  // errors rather than silently hard-refusing the mint as if the token were unresolved.
  it('propagates a returned PostgREST error rather than treating it as "not found"', async () => {
    const supabase = {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (table === 'strategic_directives_v2') return { data: null, error: { message: 'schema drift' } };
              return { data: null, error: null };
            },
          }),
        }),
      }),
    };
    await expect(resolveArtifactOwner(supabase, 'tok-3')).rejects.toThrow(/strategic_directives_v2.*schema drift/);
  });

  it('propagates a thrown client exception (never silently falls through to the next table)', async () => {
    const supabase = {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (table === 'strategic_directives_v2') throw new Error('client threw: schema drift');
              return { data: { id: 'tok-3', sd_id: 'SD-FALLBACK-001' }, error: null };
            },
          }),
        }),
      }),
    };
    await expect(resolveArtifactOwner(supabase, 'tok-3')).rejects.toThrow(/client threw/);
  });

  it('a real row with a NULL owner column resolves (not "not found"), with ownerKey null', async () => {
    const supabase = makeSupabase({
      strategic_directives_v2: [{ id: 'tok-orphan', sd_key: null }],
    });
    const result = await resolveArtifactOwner(supabase, 'tok-orphan');
    expect(result).toEqual({ token: 'tok-orphan', resolved: true, table: 'strategic_directives_v2', ownerKey: null });
  });

  it('a real row with an EMPTY-STRING owner column resolves with ownerKey null, not the literal empty string', async () => {
    const supabase = makeSupabase({
      strategic_directives_v2: [{ id: 'tok-empty', sd_key: '' }],
    });
    const result = await resolveArtifactOwner(supabase, 'tok-empty');
    expect(result).toEqual({ token: 'tok-empty', resolved: true, table: 'strategic_directives_v2', ownerKey: null });
  });

  it('probes tables in the declared allowlist order', () => {
    expect(ARTIFACT_OWNER_ALLOWLIST.map((e) => e.table)).toEqual([
      'strategic_directives_v2', 'venture_artifacts', 'uat_test_runs',
    ]);
  });

  // SECURITY evidence 00145217-33d6-458f-a7a7-63079e4afb1a (F3): Object.freeze() on the
  // outer array alone left each entry object mutable -- an entry's idColumn/ownerColumn
  // could be reassigned at runtime to widen the columns actually read.
  it('every allowlist entry is itself frozen, not just the containing array', () => {
    expect(Object.isFrozen(ARTIFACT_OWNER_ALLOWLIST)).toBe(true);
    for (const entry of ARTIFACT_OWNER_ALLOWLIST) {
      expect(Object.isFrozen(entry)).toBe(true);
    }
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

  // SECURITY evidence 00145217-33d6-458f-a7a7-63079e4afb1a (F5): an unescaped ownerKey
  // could break annotation idempotency via a literal ')' (re-opening the "(owner: ...)"
  // group on a later pass, growing without bound) or carry control/ANSI characters into a
  // persisted SD field.
  it('strips parens from ownerKey so they cannot break the annotation group', () => {
    const t = 'aaaaaaaa-1111-2222-3333-444444444444';
    const text = `Fixture: ${t} is the source row.`;
    expect(annotateOwnerInText(text, t, 'SD-EVIL) rest of text('))
      .toBe(`Fixture: ${t} (owner: SD-EVIL rest of text) is the source row.`);
  });

  it('strips control characters (including CR/LF/tab) from ownerKey', () => {
    const t = 'aaaaaaaa-1111-2222-3333-444444444444';
    expect(annotateOwnerInText(`${t} here`, t, 'SD-A\r\n\tB\x1b[31m'))
      .toBe(`${t} (owner: SD-AB[31m) here`);
  });

  it('truncates an unbounded ownerKey to a bounded length', () => {
    const t = 'aaaaaaaa-1111-2222-3333-444444444444';
    const huge = 'X'.repeat(500);
    const result = annotateOwnerInText(`${t} here`, t, huge);
    expect(result).toContain(`${'X'.repeat(100)}…`);
    expect(result).not.toContain('X'.repeat(101)); // the 101st X would prove no truncation happened
  });

  it('idempotency: re-annotating with an owner value that itself contains ")" cannot re-open the group', () => {
    const t = 'aaaaaaaa-1111-2222-3333-444444444444';
    const once = annotateOwnerInText(`${t} here`, t, 'SD-EVIL)');
    const twice = annotateOwnerInText(once, t, 'SD-EVIL)');
    expect(twice).toBe(once); // stable under re-application, never grows
  });
});
