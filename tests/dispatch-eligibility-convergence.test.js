// SD-FDBK-INFRA-CONVERGE-WORK-ASSIGNMENT-001 — converge SD-dispatch eligibility onto one predicate.
//
// Coverage:
//  (A) classifyDispatchIneligibility — the PURE shared gate all three dispatch consumers call
//      (every reason + the eligible/null case + word-boundary false-positives).
//  (B) evaluateDispatchEligibility delegates its non-dep checks to the pure gate (mock client) —
//      proves the baselined PULL path + the sweep CLAIM_FIX path inherit the new reasons.
//  (C) Static wiring pins: the sweep available-set filter and the worker-checkin draft self_claim
//      path both invoke classifyDispatchIneligibility — proves FR-2/FR-3 are wired (cheap, deterministic,
//      avoids fragile full-sweep mocking; the gate's own behavior is covered by (A)/(B)).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const { classifyDispatchIneligibility, evaluateDispatchEligibility, TEST_FIXTURE_KEY_RE } =
  require(path.join(ROOT, 'lib', 'fleet', 'claim-eligibility.cjs'));

describe('(A) classifyDispatchIneligibility — pure shared gate', () => {
  it('returns null for an ordinary eligible SD', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-LEO-INFRA-X', sd_type: 'infrastructure' })).toBe(null);
  });

  it("flags orchestrator parents as 'orchestrator_parent'", () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-LEO-ORCH-Y', sd_type: 'orchestrator' })).toBe('orchestrator_parent');
  });

  it("flags test-fixture keys (SD-DEMO-* / SD-TEST-*) as 'test_fixture_key'", () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-DEMO-RACE' })).toBe('test_fixture_key');
    expect(classifyDispatchIneligibility({ sd_key: 'SD-TEST-FOO' })).toBe('test_fixture_key');
  });

  it('does NOT flag real keys that merely START with TEST/DEMO letters (word-boundary anchor)', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-TESTABLE-REAL' })).toBe(null);
    expect(classifyDispatchIneligibility({ sd_key: 'SD-DEMONSTRATE-VALUE' })).toBe(null);
    // sanity: the exported regex itself encodes the boundary
    expect(TEST_FIXTURE_KEY_RE.test('SD-TEST-X')).toBe(true);
    expect(TEST_FIXTURE_KEY_RE.test('SD-TESTABLE-X')).toBe(false);
  });

  it("flags requires_human_action SDs as 'human_action_required'", () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', metadata: { requires_human_action: true } })).toBe('human_action_required');
  });

  it('treats absent/falsey requires_human_action as eligible', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', metadata: {} })).toBe(null);
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', metadata: { requires_human_action: false } })).toBe(null);
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X' })).toBe(null);
  });

  it('is null-safe on a missing/empty row', () => {
    expect(classifyDispatchIneligibility(undefined)).toBe(null);
    expect(classifyDispatchIneligibility({})).toBe(null);
  });

  it('orchestrator takes precedence, then fixture, then human-action (deterministic order)', () => {
    // an orchestrator that is also a fixture key reports orchestrator first
    expect(classifyDispatchIneligibility({ sd_key: 'SD-TEST-ORCH', sd_type: 'orchestrator' })).toBe('orchestrator_parent');
  });
});

// Minimal chainable mock of the supabase query builder used by evaluateDispatchEligibility:
//   sb.from(t).select(c).eq('sd_key', k).maybeSingle()  and  .in('sd_key', keys) for deps.
function mockClient(rowsByKey) {
  return {
    from() {
      const ctx = { _eqKey: null, _inKeys: null };
      const builder = {
        select() { return builder; },
        eq(_col, val) { ctx._eqKey = val; return builder; },
        in(_col, vals) { ctx._inKeys = vals; return builder; },
        async maybeSingle() { return { data: rowsByKey[ctx._eqKey] || null, error: null }; },
        then(resolve) { // the dep query awaits the builder directly (.in(...))
          const data = (ctx._inKeys || []).map(k => rowsByKey[k]).filter(Boolean).map(r => ({ sd_key: r.sd_key, status: r.status }));
          return resolve({ data, error: null });
        },
      };
      return builder;
    },
  };
}

describe('(B) evaluateDispatchEligibility delegates non-dep checks to the shared gate', () => {
  it('returns sd_not_found for an absent SD', async () => {
    const sb = mockClient({});
    expect(await evaluateDispatchEligibility(sb, 'SD-MISSING')).toEqual({ eligible: false, reason: 'sd_not_found' });
  });

  it('inherits test_fixture_key from the pure gate', async () => {
    const sb = mockClient({ 'SD-DEMO-RACE': { sd_key: 'SD-DEMO-RACE', sd_type: 'infrastructure', dependencies: [] } });
    expect(await evaluateDispatchEligibility(sb, 'SD-DEMO-RACE')).toEqual({ eligible: false, reason: 'test_fixture_key' });
  });

  it('inherits human_action_required from the pure gate', async () => {
    const sb = mockClient({ 'SD-H': { sd_key: 'SD-H', sd_type: 'infrastructure', dependencies: [], metadata: { requires_human_action: true } } });
    expect(await evaluateDispatchEligibility(sb, 'SD-H')).toEqual({ eligible: false, reason: 'human_action_required' });
  });

  it('still reports orchestrator_parent and eligible:true correctly', async () => {
    const orch = mockClient({ 'SD-O': { sd_key: 'SD-O', sd_type: 'orchestrator', dependencies: [] } });
    expect(await evaluateDispatchEligibility(orch, 'SD-O')).toEqual({ eligible: false, reason: 'orchestrator_parent' });
    const ok = mockClient({ 'SD-OK': { sd_key: 'SD-OK', sd_type: 'infrastructure', dependencies: [] } });
    expect(await evaluateDispatchEligibility(ok, 'SD-OK')).toEqual({ eligible: true });
  });
});

describe('(C) wiring pins — all push/pull consumers call the shared gate', () => {
  it('sweep available-set filter invokes classifyDispatchIneligibility (fail-soft)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'stale-session-sweep.cjs'), 'utf8');
    expect(src).toMatch(/classifyDispatchIneligibility/);
    // imported from the shared module, not re-implemented
    expect(src).toMatch(/require\(['"]\.\.\/lib\/fleet\/claim-eligibility\.cjs['"]\)/);
    // the available batch query was enriched so the synchronous gate has sd_type + metadata
    expect(src).toMatch(/sd_type, metadata/);
  });

  it('worker-checkin draft self_claim path invokes classifyDispatchIneligibility', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'worker-checkin.cjs'), 'utf8');
    expect(src).toMatch(/classifyDispatchIneligibility\(d\)\s*!==\s*null/);
  });
});
