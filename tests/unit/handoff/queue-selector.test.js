/**
 * Unit tests for queue-selector.js's selectNextSD (SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001, FR-1).
 *
 * BACKGROUND: selectNextSD is the PRIMARY cascade picker (reached via executeAutoChain
 * whenever a session context exists). Before this SD, it selected NO eligibility-relevant
 * columns and called NO eligibility check at all -- an SD explicitly marked
 * metadata.requires_human_action=true could be auto-cascaded into.
 *
 * TESTING sub-agent (LEAD/PLAN reviews) found the general classifier (classifyDispatchIneligibility)
 * is UNSAFE here: its orchestratorParent axis reads row.sd_type==='orchestrator' and fires FIRST
 * in the axis table -- live-measured 3/20 real candidates wrongly refused when sd_type was
 * included, because this function's orchestratorsOnly mode exists SPECIFICALLY to find
 * orchestrator-type rows. The fix uses classifyAllDispatchIneligibility + the narrower
 * CLAIM_WRITE_FENCE_AXES set (which never includes orchestrator_parent), and sd_type is
 * deliberately never added to the select().
 */

import { describe, it, expect, vi } from 'vitest';
import { selectNextSD } from '../../../scripts/modules/handoff/queue-selector.js';

/**
 * Every real Supabase query builder method used across the picker + claimed-sessions
 * queries returns `this` (chainable) and the chain itself is awaitable (thenable),
 * resolving to `terminalValue`. This is deliberately more permissive than hand-nesting
 * literal mock objects: TESTING's F7 finding was that a mock missing ONE chained method
 * (e.g. .range()) silently fails open (the real code's try/catch swallows the resulting
 * TypeError and proceeds as if nothing were claimed) -- making the assertion vacuous
 * without any test failure to reveal it. A universally-chainable, universally-thenable
 * mock cannot have that specific blind spot: every method the real code could call
 * exists and resolves correctly regardless of exact chain shape.
 */
function makeChainableQuery(terminalValue) {
  const methods = ['select', 'in', 'is', 'neq', 'not', 'order', 'range', 'eq', 'limit'];
  const chain = {};
  for (const m of methods) chain[m] = vi.fn(() => chain);
  chain.then = (resolve) => resolve(terminalValue);
  return chain;
}

/**
 * @param {object[]} candidates - rows strategic_directives_v2 query resolves to
 * @param {object[]} [claimedSessions] - rows claude_sessions query resolves to
 */
function mockSupabase(candidates, claimedSessions = []) {
  return {
    from: vi.fn((table) => {
      if (table === 'strategic_directives_v2') {
        return makeChainableQuery({ data: candidates, error: null });
      }
      if (table === 'claude_sessions') {
        return makeChainableQuery({ data: claimedSessions, error: null });
      }
      throw new Error(`unexpected table in test: ${table}`);
    }),
  };
}

const FENCED = { id: 'fenced-uuid', sd_key: 'SD-FENCED-001', title: 'Fenced', status: 'draft', priority: 'high', parent_sd_id: null, sd_type: 'infrastructure', metadata: { requires_human_action: true } };
const NORMAL = { id: 'normal-uuid', sd_key: 'SD-NORMAL-001', title: 'Normal', status: 'draft', priority: 'medium', parent_sd_id: null, sd_type: 'infrastructure', metadata: {} };

describe('selectNextSD (FR-1) — authority fence', () => {
  it('TS-1 — a requires_human_action=TRUE top candidate is never returned; a lower-priority normal candidate is returned instead', async () => {
    const supabase = mockSupabase([FENCED, NORMAL]);
    const result = await selectNextSD(supabase);

    expect(result.sd?.sd_key, 'the fenced candidate must never be selected').not.toBe('SD-FENCED-001');
    expect(result.sd?.sd_key).toBe('SD-NORMAL-001');
    expect(result.candidates.map((c) => c.sd_key)).not.toContain('SD-FENCED-001');
  });

  it('returns the documented no-candidate result when every candidate is fenced', async () => {
    const supabase = mockSupabase([FENCED]);
    const result = await selectNextSD(supabase);

    expect(result.sd).toBeNull();
    expect(result.reason).toMatch(/authority-fenced/);
  });

  it('[STATIC] never adds sd_type to the eligibility-relevant select — the general classifier would refuse this function\'s own legitimate orchestrator-type targets', () => {
    // selectNextSD has MULTIPLE .select(...) calls (the candidate query AND a separate
    // claimed-sessions query) — a plain .match() takes whichever occurs FIRST in source
    // order, which is not guaranteed to be the eligibility-relevant one (it happened to be
    // here, but that's an ordering accident, not a property of the source). Scan every
    // .select(...) call and assert on the one that actually selects metadata.
    const src = selectNextSD.toString();
    const selectCalls = [...src.matchAll(/\.select\(\s*(['"`])([^'"`]*)\1/g)].map((m) => m[2]);
    expect(selectCalls.length, 'selectNextSD must have at least one literal .select(...) call').toBeGreaterThan(0);
    const candidateSelect = selectCalls.find((cols) => cols.split(',').map((s) => s.trim()).includes('metadata'));
    expect(candidateSelect, `expected one .select(...) call to include metadata; found: ${JSON.stringify(selectCalls)}`).toBeDefined();
    expect(candidateSelect.split(',').map((s) => s.trim())).not.toContain('sd_type');
  });

  it('TS-3 (selectNextSD half) — regression pin: a normal candidate set selects the SAME candidate id as it would have before this fix (no fenced rows present)', async () => {
    const OTHER_NORMAL = { id: 'other-normal-uuid', sd_key: 'SD-OTHER-001', title: 'Other', status: 'draft', priority: 'low', parent_sd_id: null, sd_type: 'infrastructure', metadata: {} };
    const supabase = mockSupabase([NORMAL, OTHER_NORMAL]);
    const result = await selectNextSD(supabase);

    // Same id/sd_key as pre-fix, NOT byte-identical row (the widened select legitimately
    // adds a metadata field to the returned shape).
    expect(result.sd.id).toBe('normal-uuid');
    expect(result.sd.sd_key).toBe('SD-NORMAL-001');
  });

  it('a candidate with requires_human_action=false (or metadata absent entirely) is treated as eligible', async () => {
    const noMetadata = { id: 'no-meta-uuid', sd_key: 'SD-NOMETA-001', title: 'No metadata', status: 'draft', priority: 'high', parent_sd_id: null };
    const supabase = mockSupabase([noMetadata]);
    const result = await selectNextSD(supabase);

    expect(result.sd?.sd_key).toBe('SD-NOMETA-001');
  });

  it('composes correctly with the existing claimed-SD exclusion — a claimed, non-fenced candidate is still excluded', async () => {
    const claimed = { id: 'claimed-uuid', sd_key: 'SD-CLAIMED-001', title: 'Claimed', status: 'draft', priority: 'high', parent_sd_id: null, metadata: {} };
    const supabase = mockSupabase([claimed, NORMAL], [{ sd_key: 'SD-CLAIMED-001', id: 'session-1' }]);
    const result = await selectNextSD(supabase);

    expect(result.sd?.sd_key).toBe('SD-NORMAL-001');
  });
});
