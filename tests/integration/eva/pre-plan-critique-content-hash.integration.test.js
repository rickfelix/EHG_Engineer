/**
 * Real-DB integration coverage for FR-4/FR-5's content_hash override binding + cache-hit
 * optimization. SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001, TS-5/TS-6/TS-8/TS-9.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM THE MOCKED UNIT SUITE (testing-agent T8 routing note,
 * reaffirmed by EXEC-phase TESTING evidence finding #5): pre-plan-critique.test.js's mock
 * .eq()/.limit() chain is deliberately argument-blind (self-chaining, returns overrideRows
 * regardless of what was filtered on — see its own comment). It cannot prove Postgres's
 * content_hash EQUALITY FILTER actually discriminates between rows; only a real query against a
 * real table can. These scenarios are this SD's own originating incident (an override that could
 * never bind because findingsFingerprint changed between calls) — asserting the fix works only
 * against a mock that ignores its arguments would be exactly the kind of unearned confidence this
 * SD exists to eliminate.
 *
 * RUN: `npm run test:integration` (vitest --project db). Gated by tests/setup.db.js — skips
 * entirely (passWithNoTests) against an undesignated target; set VITEST_DB_ALLOW_REF to a
 * non-production Supabase project ref to actually run it. NEVER point it at production.
 *
 * PRE-MIGRATION NOTE: plan_critiques.metadata/content_hash are TR-3's staged columns
 * (database/chairman-gated/20260816_plan_critiques_add_metadata_and_content_hash.sql), not yet
 * live. Until ceremony N+1 applies that migration, EVERY test below fails LOUDLY with a real
 * PGRST204/42703 from Postgres/PostgREST — by design, matching FR-6's own "schema-missing fails
 * loud, never silent" philosophy. A designated non-production ref alone is not sufficient to make
 * this file green; the migration must also be applied there.
 *
 * Fixture rows reference THIS SD's own real sd_id/prd_id (plan_critiques.sd_id/prd_id are
 * NOT NULL FK columns — an arbitrary UUID would fail the FK, not the assertion), per TR-8's own
 * established "use this SD's own incident as an authentic fixture" convention. Every fixture row
 * carries a content_hash prefixed 'itest-' so cleanup only ever touches rows this file created.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSupabaseServiceClient } from '../../../lib/supabase-client.js';
import { critiquePlanProposal } from '../../../lib/eva/devils-advocate.js';

const SD_ID = '234928d8-f45b-4998-a1e6-28704e78cf6e'; // this SD's own real id (TR-8 convention)
const PRD_ID = 'PRD-SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001';
const HASH_PREFIX = 'itest-'; // every fixture row's content_hash starts with this — cleanup key

let supabase;
const insertedIds = [];

async function insertFixtureRow(overrides = {}) {
  const row = {
    sd_id: SD_ID,
    prd_id: PRD_ID,
    findings: [],
    overall_severity: 'block',
    content_hash: `${HASH_PREFIX}default`,
    ...overrides,
  };
  const { data, error } = await supabase.from('plan_critiques').insert(row).select('id').single();
  if (error) throw new Error(`fixture insert failed (expected until ceremony N+1 applies TR-3): ${error.code} ${error.message}`);
  insertedIds.push(data.id);
  return data.id;
}

beforeEach(() => {
  supabase = createSupabaseServiceClient();
});

afterEach(async () => {
  if (insertedIds.length === 0) return;
  await supabase.from('plan_critiques').delete().in('id', insertedIds);
  insertedIds.length = 0;
});

describe('findActiveOverride content_hash binding — real DB (TS-8)', () => {
  it('binds an override only to the row whose content_hash matches the current run — a differing hash never matches', async () => {
    const matchingHash = `${HASH_PREFIX}match-${Date.now()}`;
    const otherHash = `${HASH_PREFIX}other-${Date.now()}`;

    await insertFixtureRow({
      content_hash: matchingHash,
      override_reason: 'itest: excused for this exact content',
      override_by: 'integration-test',
    });
    await insertFixtureRow({
      content_hash: otherHash,
      override_reason: 'itest: excused for DIFFERENT content — must never bind to matchingHash',
      override_by: 'integration-test',
    });

    const { data: matched, error: matchErr } = await supabase
      .from('plan_critiques')
      .select('id, content_hash, override_reason')
      .eq('sd_id', SD_ID)
      .eq('overall_severity', 'block')
      .eq('content_hash', matchingHash)
      .not('override_reason', 'is', null)
      .not('override_by', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    expect(matchErr).toBeNull();
    expect(matched.length).toBeGreaterThanOrEqual(1);
    expect(matched.every((r) => r.content_hash === matchingHash)).toBe(true);
    expect(matched.some((r) => r.content_hash === otherHash)).toBe(false);
  });

  // TR-5: a stored content_hash IS NULL must never match a real hash value — Postgres's own
  // NULL semantics (NULL != NULL) should already guarantee this; this test proves it against
  // the real column, not just findActiveOverride's own defensive early-return guard.
  it('a stored row with content_hash IS NULL never matches a real content_hash filter (TR-5)', async () => {
    await insertFixtureRow({
      content_hash: null,
      override_reason: 'itest: stale null-hash override, predates content_hash existing',
      override_by: 'integration-test',
    });
    const realHash = `${HASH_PREFIX}real-${Date.now()}`;

    const { data, error } = await supabase
      .from('plan_critiques')
      .select('id, content_hash')
      .eq('sd_id', SD_ID)
      .eq('content_hash', realHash)
      .not('override_reason', 'is', null);

    expect(error).toBeNull();
    expect(data.length).toBe(0);
  });

  // TS-9 / FR-5 (VALIDATION VAL-3: this scenario was declared in the file header but had no
  // actual test — FR-5's own text says it exists "so it is deliberately tested, not an unverified
  // side effect of FR-4"). SDs are measured to have critique bursts up to 17 rows; a bare
  // .limit(10) with no content filter could push a matching override outside the window purely on
  // row count. The content_hash filter narrows the candidate set BEFORE .limit(10), so a matching
  // override survives regardless of how many non-matching rows sort ahead of it.
  it('a matching override survives past 10 non-matching rows because content_hash narrows before .limit(10) (TS-9/FR-5)', async () => {
    const matchingHash = `${HASH_PREFIX}burst-match-${Date.now()}`;
    // 12 newer, non-matching blocking rows (each with a distinct content_hash) inserted AFTER the
    // real override row below, so a bare created_at-DESC .limit(10) with no content filter would
    // push the real match outside the window.
    await insertFixtureRow({
      content_hash: matchingHash,
      override_reason: 'itest: TS-9 the real, matching override',
      override_by: 'integration-test',
    });
    for (let i = 0; i < 12; i++) {
      await insertFixtureRow({ content_hash: `${HASH_PREFIX}burst-noise-${i}-${Date.now()}` });
    }

    const { data, error } = await supabase
      .from('plan_critiques')
      .select('id, content_hash, override_reason')
      .eq('sd_id', SD_ID)
      .eq('overall_severity', 'block')
      .eq('content_hash', matchingHash)
      .not('override_reason', 'is', null)
      .not('override_by', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    expect(error).toBeNull();
    expect(data.length).toBe(1);
    expect(data[0].content_hash).toBe(matchingHash);
  });
});

describe('critiquePlanProposal cache-hit path — real DB (TS-5/TS-6)', () => {
  function mockAdapter() {
    return {
      apiKey: 'test-key',
      defaultModel: 'gpt-5.4-integration-test',
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({ findings: [{ severity: 'note', category: 'other', message: 'fresh call happened' }], overall_severity: 'note' }),
        model: 'gpt-5.4-integration-test',
      }),
    };
  }

  it('TS-5: a real cached row within the TTL is reused — the LLM is never called', async () => {
    const prdContent = { executive_summary: `itest cache-hit ${Date.now()}`, functional_requirements: [], acceptance_criteria: [], test_scenarios: [], risks: [] };
    const archContent = 'itest arch';
    const adapter = mockAdapter();

    // First call: real cache lookup (miss, empty table) -> real LLM call -> persist manually
    // (this test drives persistCritique's shape directly rather than importing the gate, to keep
    // the fixture footprint scoped to plan_critiques only).
    const first = await critiquePlanProposal(
      { prdContent, archContent, sdContext: { sd_id: SD_ID, sd_key: 'itest', title: 'itest' } },
      { adapter, supabase, logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() } }
    );
    expect(adapter.complete).toHaveBeenCalledTimes(1);
    expect(first.cacheHit).toBeUndefined();

    await insertFixtureRow({
      content_hash: first.contentHash,
      findings: first.findings,
      overall_severity: first.overall_severity,
      model_used: first.model_used,
      metadata: { llm_result: { findings: first.findings, overall_severity: first.overall_severity } },
    });

    // Second call, byte-identical content: must hit the real row just inserted and skip the LLM.
    const second = await critiquePlanProposal(
      { prdContent, archContent, sdContext: { sd_id: SD_ID, sd_key: 'itest', title: 'itest' } },
      { adapter, supabase, logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() } }
    );
    expect(adapter.complete).toHaveBeenCalledTimes(1); // still 1 — no second real call
    expect(second.cacheHit).toBe(true);
    expect(second.overall_severity).toBe(first.overall_severity);
    expect(second.findings).toEqual(first.findings);
  });

  it('TS-6: different content produces a cache miss — a fresh LLM call happens', async () => {
    const adapter = mockAdapter();
    const contentA = { executive_summary: `itest miss A ${Date.now()}`, functional_requirements: [], acceptance_criteria: [], test_scenarios: [], risks: [] };
    const contentB = { executive_summary: `itest miss B ${Date.now()}`, functional_requirements: [], acceptance_criteria: [], test_scenarios: [], risks: [] };

    const resultA = await critiquePlanProposal(
      { prdContent: contentA, archContent: '', sdContext: { sd_id: SD_ID, sd_key: 'itest', title: 'itest' } },
      { adapter, supabase, logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() } }
    );
    await insertFixtureRow({
      content_hash: resultA.contentHash,
      findings: resultA.findings,
      overall_severity: resultA.overall_severity,
      metadata: { llm_result: { findings: resultA.findings, overall_severity: resultA.overall_severity } },
    });

    const resultB = await critiquePlanProposal(
      { prdContent: contentB, archContent: '', sdContext: { sd_id: SD_ID, sd_key: 'itest', title: 'itest' } },
      { adapter, supabase, logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() } }
    );
    expect(resultA.contentHash).not.toBe(resultB.contentHash);
    expect(adapter.complete).toHaveBeenCalledTimes(2); // both were real calls — no false hit
    expect(resultB.cacheHit).toBeUndefined();
  });
});
