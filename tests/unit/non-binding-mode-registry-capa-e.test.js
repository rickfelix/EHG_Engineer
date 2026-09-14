/**
 * Unit tests for SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-E (FR-1/FR-2/FR-3): the
 * non-binding-mode registry, its curated-list lint, and the digest's additive
 * reporting section. Mirrors the verification method a prospective TESTING review
 * used on this SD's own PRD (sub_agent_execution_results 9d4f650f/60585e01) --
 * calling classifyFlag() directly against the exact row shape this SD persists,
 * rather than trusting the design on paper.
 */
import { describe, it, expect } from 'vitest';
import { classifyFlag } from '../../lib/feature-flags/governance-review.js';
import { NON_BINDING_MODES, findUnregistered, runLint } from '../../scripts/lint/non-binding-mode-registry-lint.mjs';
import { listNonBindingModes, formatNonBindingModesSection } from '../../scripts/flag-governance-review.mjs';

const NOW = Date.parse('2026-09-13T00:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 24 * 3600 * 1000).toISOString();

// The exact shape FR-1's migration persists for each of the 4 rows.
function archivedRow(flagKey) {
  return {
    flag_key: flagKey,
    is_enabled: false,
    lifecycle_state: 'archived',
    last_reviewed_at: daysAgo(0),
    gates_what: 'some venture-quality surface',
    enablement_criteria: 'DOCUMENTATION ONLY -- no live reader',
    owner_type: 'team',
    owner_id: 'coordinator',
  };
}

describe('TS-3: classifyFlag() returns null for all 4 FR-1 rows at any age (terminal lifecycle short-circuit)', () => {
  for (const mode of NON_BINDING_MODES) {
    it(`${mode.flagKey}: null at insertion time and at +400 days, with hostile opts`, () => {
      const fresh = archivedRow(mode.flagKey);
      const aged = { ...fresh, last_reviewed_at: null, created_at: daysAgo(500), rolled_out_at: daysAgo(90), expiry_at: daysAgo(10) };
      const hostileOpts = {
        env: { [mode.flagKey]: 'on' },
        hasLiveReaders: () => true,
        isGraduatedInCode: () => true,
      };
      expect(classifyFlag(fresh, NOW)).toBeNull();
      expect(classifyFlag(fresh, NOW + 400 * 24 * 3600 * 1000)).toBeNull();
      expect(classifyFlag(aged, NOW, hostileOpts)).toBeNull();
    });
  }
});

describe('TS-1/TS-2: non-binding-mode-registry-lint curated-list check', () => {
  it('findUnregistered returns empty when every curated entry has a matching flag_key', () => {
    const registered = new Set(NON_BINDING_MODES.map((m) => m.flagKey));
    expect(findUnregistered(NON_BINDING_MODES, registered)).toEqual([]);
  });

  it('TS-2: a fixture entry with no matching registry row is detected as unregistered (the SD\'s own smoke test step 2, via an explicit curated-list addition)', () => {
    const fixtureList = [...NON_BINDING_MODES, { flagKey: 'FIXTURE_NOT_REGISTERED', file: 'tests/fixture.js', lineAnchor: 1 }];
    const registered = new Set(NON_BINDING_MODES.map((m) => m.flagKey)); // fixture deliberately absent
    const unregistered = findUnregistered(fixtureList, registered);
    expect(unregistered).toHaveLength(1);
    expect(unregistered[0].flagKey).toBe('FIXTURE_NOT_REGISTERED');
  });

  it('runLint: ok=true when the DB reports all 4 flag_keys present', async () => {
    const rows = NON_BINDING_MODES.map((m) => ({ flag_key: m.flagKey }));
    const supabase = { from: () => ({ select: () => ({ in: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }) };
    const result = await runLint(supabase);
    expect(result).toEqual({ ok: true, unregistered: [], dbUnreachable: false });
  });

  it('runLint: ok=false when one known flag_key is missing from the DB', async () => {
    const present = NON_BINDING_MODES.slice(1).map((m) => ({ flag_key: m.flagKey })); // omit the first
    const supabase = { from: () => ({ select: () => ({ in: () => ({ limit: async () => ({ data: present, error: null }) }) }) }) };
    const result = await runLint(supabase);
    expect(result.ok).toBe(false);
    expect(result.unregistered).toEqual([NON_BINDING_MODES[0]]);
  });

  it('FAIL-CLOSED (TESTING finding F11): a DB error is reported as dbUnreachable, never a silent pass', async () => {
    const supabase = { from: () => ({ select: () => ({ in: () => ({ limit: async () => ({ data: null, error: { message: 'connection refused' } }) }) }) }) };
    const result = await runLint(supabase);
    expect(result.ok).toBe(false);
    expect(result.dbUnreachable).toBe(true);
    expect(result.error).toContain('connection refused');
  });
});

describe('TS-4: listNonBindingModes (FR-3 additive digest section)', () => {
  it('returns exactly the rows matching both the known flag_keys AND lifecycle_state=archived (conjunctive filter)', async () => {
    const rows = NON_BINDING_MODES.map((m) => ({ flag_key: m.flagKey, gates_what: 'x', enablement_criteria: 'y', lifecycle_state: 'archived' }));
    let capturedFilters = {};
    const supabase = {
      from: () => ({
        select: () => ({
          in: (col, vals) => {
            capturedFilters.in = { col, vals };
            return {
              eq: (col2, val2) => {
                capturedFilters.eq = { col: col2, val: val2 };
                return { limit: async (n) => { capturedFilters.limit = n; return { data: rows, error: null }; } };
              },
            };
          },
        }),
      }),
    };
    const result = await listNonBindingModes(supabase);
    expect(result).toEqual(rows);
    expect(capturedFilters.in.col).toBe('flag_key');
    expect(capturedFilters.in.vals).toEqual(NON_BINDING_MODES.map((m) => m.flagKey));
    expect(capturedFilters.eq).toEqual({ col: 'lifecycle_state', val: 'archived' });
    expect(capturedFilters.limit).toBe(4);
  });

  it('a query error is handled gracefully (returns empty, does not throw)', async () => {
    const supabase = { from: () => ({ select: () => ({ in: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) }) };
    await expect(listNonBindingModes(supabase)).resolves.toEqual([]);
  });
});

describe('formatNonBindingModesSection', () => {
  it('renders each row with flag_key, lifecycle_state, and gates_what', () => {
    const text = formatNonBindingModesSection([{ flag_key: 'X', lifecycle_state: 'archived', gates_what: 'stage 20' }]);
    expect(text).toContain('X [archived] -- stage 20');
  });

  it('returns an empty string for zero rows (no section header printed)', () => {
    expect(formatNonBindingModesSection([])).toBe('');
  });
});
