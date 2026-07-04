/**
 * SD-LEO-INFRA-009-LEAF-FORMALIZE-001 (C-009 leaf 2, FR-1): the canonical
 * closeIssuePatterns() gate — a pattern cannot reach status='resolved' without a
 * named prevention artifact (a non-empty prevention_checklist) once enforcement is
 * flipped ON via chairman_dashboard_config; enforcement defaults OFF (fail-open,
 * today's behavior preserved).
 */
import { describe, it, expect } from 'vitest';
import {
  hasValidPreventionArtifact,
  isPreventionRequiredEnforced,
  closeIssuePatterns,
} from '../../../lib/governance/pattern-closure.js';

describe('hasValidPreventionArtifact', () => {
  it('false for null/undefined/empty-array prevention_checklist', () => {
    expect(hasValidPreventionArtifact(null)).toBe(false);
    expect(hasValidPreventionArtifact({})).toBe(false);
    expect(hasValidPreventionArtifact({ prevention_checklist: null })).toBe(false);
    expect(hasValidPreventionArtifact({ prevention_checklist: [] })).toBe(false);
  });

  it('true for a non-empty prevention_checklist array', () => {
    expect(hasValidPreventionArtifact({ prevention_checklist: ['guard: lib/x.js'] })).toBe(true);
  });
});

describe('isPreventionRequiredEnforced', () => {
  it('fails open (false) on a query error', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: new Error('boom') }) }) }) }) };
    expect(await isPreventionRequiredEnforced(supabase)).toBe(false);
  });

  it('fails open (false) when the config row/key is absent', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { metadata: {} }, error: null }) }) }) }) };
    expect(await isPreventionRequiredEnforced(supabase)).toBe(false);
  });

  it('true only when explicitly set true', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { metadata: { pattern_registry_enforce_prevention_required: true } }, error: null }),
          }),
        }),
      }),
    };
    expect(await isPreventionRequiredEnforced(supabase)).toBe(true);
  });
});

/** Minimal chainable supabase stub covering exactly the query shapes closeIssuePatterns() uses. */
function makeSupabase({ enforced, candidates, updateError = null, raceDropped = [] }) {
  const updateCalls = [];
  return {
    _updateCalls: updateCalls,
    from(table) {
      if (table === 'chairman_dashboard_config') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { metadata: { pattern_registry_enforce_prevention_required: enforced } }, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => {
          const builder = {
            _filters: {},
            in(col, vals) {
              this._filters[col] = vals;
              return this;
            },
            eq(col, val) {
              this._filters[col] = val;
              return this;
            },
            then(resolve) {
              resolve({ data: candidates, error: null });
            },
          };
          return builder;
        },
        update(payload) {
          updateCalls.push(payload);
          const filters = {};
          const chain = {
            in(col, vals) {
              filters[col] = vals;
              return chain;
            },
            eq(col, val) {
              filters[col] = val;
              return chain;
            },
            select(col) {
              return {
                then(resolve) {
                  const rows = updateError
                    ? null
                    : (filters.pattern_id || [])
                        .filter((id) => !raceDropped.includes(id))
                        .map((id) => ({ [col]: id }));
                  resolve({ data: rows, error: updateError });
                },
              };
            },
            then(resolve) {
              resolve({ error: updateError });
            },
          };
          return chain;
        },
      };
    },
  };
}

describe('closeIssuePatterns', () => {
  const candidates = [
    { pattern_id: 'PAT-A', prevention_checklist: ['guard: lib/a.js'] },
    { pattern_id: 'PAT-B', prevention_checklist: [] },
  ];

  it('enforcement OFF: resolves ALL candidates (today\'s behavior preserved), even ones missing a prevention artifact', async () => {
    const supabase = makeSupabase({ enforced: false, candidates });
    const result = await closeIssuePatterns(supabase, { sdId: 'SD-X', resolutionNotes: 'test' });
    expect(result.resolved.sort()).toEqual(['PAT-A', 'PAT-B']);
    expect(result.deferred).toEqual([]);
  });

  it('enforcement ON: resolves only the eligible candidate, defers the one missing a prevention artifact', async () => {
    const supabase = makeSupabase({ enforced: true, candidates });
    const result = await closeIssuePatterns(supabase, { sdId: 'SD-X', resolutionNotes: 'test' });
    expect(result.resolved).toEqual(['PAT-A']);
    expect(result.deferred).toHaveLength(1);
    expect(result.deferred[0].pattern_id).toBe('PAT-B');
    expect(result.deferred[0].reason).toMatch(/prevention/i);
  });

  it('returns empty result when there are no candidates', async () => {
    const supabase = makeSupabase({ enforced: true, candidates: [] });
    const result = await closeIssuePatterns(supabase, { sdId: 'SD-X', resolutionNotes: 'test' });
    expect(result).toEqual({ resolved: [], deferred: [] });
  });

  it('race guard: only reports pattern_ids the UPDATE actually matched, not every id it attempted', async () => {
    // PAT-A drops out of the UPDATE's WHERE clause between the SELECT and the UPDATE
    // (e.g. a concurrent status change) -- must NOT be reported as resolved.
    const supabase = makeSupabase({ enforced: false, candidates, raceDropped: ['PAT-A'] });
    const result = await closeIssuePatterns(supabase, { sdId: 'SD-X', resolutionNotes: 'test' });
    expect(result.resolved).toEqual(['PAT-B']);
  });
});
