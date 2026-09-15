/**
 * SD-LEARN-FIX-ADDRESS-PAT-LES-012: integration_operationalization must never land or
 * stay NULL through any of prd-creator.js's 3 write paths, and the default written must
 * be gate-verdict-neutral -- never fabricated content like the prior ad-hoc backfill
 * (scripts/archive/one-time/backfill-prd-integration.js, 707 rows corrupted; see
 * tests/unit/backfill-prd-integration.test.js, retired by this SD's FR-6).
 *
 * This is the anti-fabrication regression suite: a future change that reintroduces
 * fabricated content (or an empty-array/empty-object shape that inflates the EVA quality
 * scorer -- sub_agent_execution_results 8ba5e6c0/a0b168bb) should fail TS-3 here.
 */
import { describe, it, expect } from 'vitest';
import {
  createPRDWithValidatedContent,
  updatePRDWithLLMContent,
  buildDefaultIntegrationOperationalization,
} from '../../../scripts/prd/prd-creator.js';
import {
  REQUIRED_SUBSECTIONS,
  isSubsectionEmpty,
  validateIntegrationContent,
} from '../../../scripts/modules/handoff/executors/plan-to-exec/gates/integration-section-validation.js';

const UUID_ID = 'a80ffadc-990f-4492-ab63-63a82f2680f7';

// Satisfies validatePRDFields' 7 required fields (min 3 array items / 50 char strings)
// so these tests exercise the integration_operationalization default-builder specifically,
// not an unrelated pre-validation gate.
const goodContent = {
  executive_summary: 'x'.repeat(60),
  functional_requirements: [
    { id: 'FR-1', title: 'something', requirement: 'x'.repeat(20) },
    { id: 'FR-2', title: 'something else', requirement: 'y'.repeat(20) },
    { id: 'FR-3', title: 'a third thing', requirement: 'z'.repeat(20) },
  ],
  system_architecture: { overview: 'x'.repeat(60) },
  acceptance_criteria: ['a'.repeat(20), 'b'.repeat(20), 'c'.repeat(20)],
  test_scenarios: [
    { id: 'TS-1', scenario: 'x'.repeat(20) },
    { id: 'TS-2', scenario: 'y'.repeat(20) },
    { id: 'TS-3', scenario: 'z'.repeat(20) },
  ],
  implementation_approach: { overview: 'x'.repeat(60) },
  risks: [
    { risk: 'x'.repeat(20) },
    { risk: 'y'.repeat(20) },
    { risk: 'z'.repeat(20) },
  ],
};

const realIntegrationContent = {
  consumers: [{ name: 'Real Consumer', interaction: 'reads data', frequency: 'daily' }],
  dependencies: [{ name: 'Real Dep', type: 'upstream', contract: 'x', failure_handling: 'retry' }],
  data_contracts: [{ contract_name: 'x', schema: 'x', validation: 'x', versioning: 'x' }],
  runtime_config: { environment_variables: ['X'], feature_flags: [], deployment_considerations: 'none' },
  observability_rollout: { monitoring: ['x'], alerts: ['x'], rollout_strategy: 'x', rollback_trigger: 'x', rollback_procedure: 'x' },
};

/**
 * Fake Supabase client covering strategic_directives_v2 existence lookups (both
 * createPRDWithValidatedContent's own check and resolveExecChecklist's) plus
 * product_requirements_v2 pre-check/insert/update, with captured payloads for assertion.
 *
 * @param {object} opts
 * @param {string|null} opts.existingId - the sd_id/uuid that "exists" in strategic_directives_v2
 * @param {string} opts.sdType - sd_type returned for that row
 * @param {object|null} opts.existingPRD - a pre-existing PRD row (triggers the UPDATE-existing branch), or null for INSERT
 */
function makeSupabase({ existingId = UUID_ID, sdType = 'infrastructure', existingPRD = null } = {}) {
  const capture = { inserted: null, updated: null };
  return {
    capture,
    from(table) {
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: (_col, v) => ({
              maybeSingle: async () => ({
                data: v === existingId ? { id: v, sd_type: sdType } : null,
                error: null,
              }),
            }),
          }),
        };
      }
      // product_requirements_v2
      return {
        select: (_cols) => ({
          eq: (_col, _v) => ({
            limit: () => ({
              maybeSingle: async () => ({ data: existingPRD, error: null }),
            }),
          }),
        }),
        insert: (rec) => {
          capture.inserted = rec;
          return { select: () => ({ single: async () => ({ data: { id: 'new-prd', ...rec }, error: null }) }) };
        },
        update: (rec) => {
          capture.updated = rec;
          return {
            eq: () => ({
              select: () => ({ single: async () => ({ data: { id: existingPRD?.id || 'updated-prd', ...rec }, error: null }) }),
            }),
          };
        },
      };
    },
  };
}

describe('SD-LEARN-FIX-ADDRESS-PAT-LES-012: buildDefaultIntegrationOperationalization (anti-fabrication)', () => {
  it('TS-3: returns exactly the 5 canonical keys, each value null', () => {
    const result = buildDefaultIntegrationOperationalization();
    expect(Object.keys(result).sort()).toEqual([...REQUIRED_SUBSECTIONS].sort());
    for (const key of REQUIRED_SUBSECTIONS) {
      expect(result[key]).toBeNull();
    }
  });

  it('TS-3: anti-fabrication invariant -- presentSubsections.length === 0, completenessScore === 0', () => {
    const validation = validateIntegrationContent(buildDefaultIntegrationOperationalization());
    expect(validation.presentSubsections).toEqual([]);
    expect(validation.completenessScore).toBe(0);
    expect(validation.emptySubsections.sort()).toEqual([...REQUIRED_SUBSECTIONS].sort());
    expect(validation.missingSubsections).toEqual([]);
  });

  it('TS-3: every subsection is empty per the gate\'s own isSubsectionEmpty predicate', () => {
    const result = buildDefaultIntegrationOperationalization();
    for (const key of REQUIRED_SUBSECTIONS) {
      expect(isSubsectionEmpty(result[key])).toBe(true);
    }
  });

  it('TS-3: carries no key outside the 5 canonical subsections (trigger-legality guard)', () => {
    const result = buildDefaultIntegrationOperationalization();
    expect(Object.keys(result).length).toBe(REQUIRED_SUBSECTIONS.length);
  });
});

describe('SD-LEARN-FIX-ADDRESS-PAT-LES-012: write-path 1 -- INSERT (createPRDWithValidatedContent, new PRD)', () => {
  it('TS-1: applies the default when llmContent omits integration_operationalization', async () => {
    const sb = makeSupabase({ existingPRD: null });
    await createPRDWithValidatedContent(sb, 'PRD-X', 'SD-KEY', UUID_ID, 'T', { sd_type: 'infrastructure' }, goodContent);
    expect(sb.capture.inserted.integration_operationalization).toEqual(buildDefaultIntegrationOperationalization());
  });

  it('TS-2: passes through real authored content unchanged', async () => {
    const sb = makeSupabase({ existingPRD: null });
    await createPRDWithValidatedContent(sb, 'PRD-X', 'SD-KEY', UUID_ID, 'T', { sd_type: 'infrastructure' }, { ...goodContent, integration_operationalization: realIntegrationContent });
    expect(sb.capture.inserted.integration_operationalization).toEqual(realIntegrationContent);
  });

  it('never lands null for any sd_type, not just feature/bugfix', async () => {
    for (const sd_type of ['infrastructure', 'documentation', 'orchestrator', 'feature', 'bugfix']) {
      const sb = makeSupabase({ existingPRD: null });
      await createPRDWithValidatedContent(sb, 'PRD-X', 'SD-KEY', UUID_ID, 'T', { sd_type }, goodContent);
      expect(sb.capture.inserted.integration_operationalization, `sd_type=${sd_type}`).not.toBeNull();
    }
  });
});

describe('SD-LEARN-FIX-ADDRESS-PAT-LES-016: FR-1 -- fresh PRD insert always lands status=approved', () => {
  // PAT-LES-2116dd961204 claimed add-prd-to-database.js creates PRDs in status='draft' by
  // default, silently blocking PLAN-TO-EXEC (which requires 'approved'). LEAD-phase
  // investigation refuted this against current main -- createPRDWithValidatedContent()'s
  // INSERT branch (scripts/prd/prd-creator.js:460) has set status='approved' unconditionally
  // since commit a09c4e48 (2026-02-05). The write-path-1 describe block above already
  // exercises this exact INSERT branch (existingPRD: null) but never asserted on `status` --
  // this test closes that specific, previously-unasserted gap.
  it('TS-1: sets status=approved on a fresh insert with no existing PRD', async () => {
    const sb = makeSupabase({ existingPRD: null });
    await createPRDWithValidatedContent(sb, 'PRD-X', 'SD-KEY', UUID_ID, 'T', { sd_type: 'infrastructure' }, goodContent);
    expect(sb.capture.inserted.status).toBe('approved');
  });

  it('TS-1: status=approved holds for every sd_type, not just infrastructure', async () => {
    for (const sd_type of ['infrastructure', 'documentation', 'orchestrator', 'feature', 'bugfix']) {
      const sb = makeSupabase({ existingPRD: null });
      await createPRDWithValidatedContent(sb, 'PRD-X', 'SD-KEY', UUID_ID, 'T', { sd_type }, goodContent);
      expect(sb.capture.inserted.status, `sd_type=${sd_type}`).toBe('approved');
    }
  });
});

describe('SD-LEARN-FIX-ADDRESS-PAT-LES-012: write-path 2 -- UPDATE-existing branch (createPRDWithValidatedContent, PRD already exists)', () => {
  it('TS-1: applies the default when the existing row is genuinely NULL and llmContent omits it', async () => {
    const sb = makeSupabase({ existingPRD: { id: 'existing-prd', status: 'approved', integration_operationalization: null } });
    await createPRDWithValidatedContent(sb, 'PRD-X', 'SD-KEY', UUID_ID, 'T', { sd_type: 'infrastructure' }, goodContent);
    expect(sb.capture.updated.integration_operationalization).toEqual(buildDefaultIntegrationOperationalization());
  });

  it('does NOT clobber real content already in the row when llmContent omits the field', async () => {
    const sb = makeSupabase({ existingPRD: { id: 'existing-prd', status: 'approved', integration_operationalization: realIntegrationContent } });
    await createPRDWithValidatedContent(sb, 'PRD-X', 'SD-KEY', UUID_ID, 'T', { sd_type: 'infrastructure' }, goodContent);
    expect(sb.capture.updated.integration_operationalization).toEqual(realIntegrationContent);
  });

  it('TS-2: passes through new real content even when the existing row already has (different) real content', async () => {
    const newContent = { ...realIntegrationContent, consumers: [{ name: 'Updated Consumer', interaction: 'x', frequency: 'x' }] };
    const sb = makeSupabase({ existingPRD: { id: 'existing-prd', status: 'approved', integration_operationalization: realIntegrationContent } });
    await createPRDWithValidatedContent(sb, 'PRD-X', 'SD-KEY', UUID_ID, 'T', { sd_type: 'infrastructure' }, { ...goodContent, integration_operationalization: newContent });
    expect(sb.capture.updated.integration_operationalization).toEqual(newContent);
  });
});

describe('SD-LEARN-FIX-ADDRESS-PAT-LES-012: write-path 3 -- updatePRDWithLLMContent', () => {
  function makeUpdateOnlySupabase(currentIntegrationOp) {
    const capture = { updated: null };
    return {
      capture,
      from(_table) {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { integration_operationalization: currentIntegrationOp }, error: null }),
            }),
          }),
          update: (rec) => {
            capture.updated = rec;
            return { eq: async () => ({ error: null }) };
          },
        };
      },
    };
  }

  it('TS-1: applies the default when the current row is NULL and llmContent omits the field', async () => {
    const sb = makeUpdateOnlySupabase(null);
    await updatePRDWithLLMContent(sb, 'prd-id', 'SD-KEY', { sd_type: 'infrastructure' }, { executive_summary: 'x'.repeat(60) });
    expect(sb.capture.updated.integration_operationalization).toEqual(buildDefaultIntegrationOperationalization());
  });

  it('does NOT clobber real content already in the row when llmContent omits the field', async () => {
    const sb = makeUpdateOnlySupabase(realIntegrationContent);
    await updatePRDWithLLMContent(sb, 'prd-id', 'SD-KEY', { sd_type: 'infrastructure' }, { executive_summary: 'x'.repeat(60) });
    expect(sb.capture.updated.integration_operationalization).toBeUndefined();
  });

  it('TS-2: passes through real content when llmContent supplies it, without an extra current-row lookup', async () => {
    const sb = makeUpdateOnlySupabase('should-not-be-read');
    await updatePRDWithLLMContent(sb, 'prd-id', 'SD-KEY', { sd_type: 'infrastructure' }, { executive_summary: 'x'.repeat(60), integration_operationalization: realIntegrationContent });
    expect(sb.capture.updated.integration_operationalization).toEqual(realIntegrationContent);
  });

  it('F6 (TESTING evidence db25c91d): an errored pre-write read must NOT be treated as absence -- leaves the field untouched rather than writing the default over unseen real content', async () => {
    const capture = { updated: null };
    const sb = {
      capture,
      from(_table) {
        return {
          select: () => ({
            eq: () => ({
              // Simulates a transient read failure: `data` is null AND `error` is set.
              // The pre-fix code destructured only `data`, so this looked identical to
              // "row genuinely has no integration_operationalization" and would have
              // written the placeholder over whatever real content actually exists.
              maybeSingle: async () => ({ data: null, error: { message: 'transient read failure' } }),
            }),
          }),
          update: (rec) => {
            capture.updated = rec;
            return { eq: async () => ({ error: null }) };
          },
        };
      },
    };
    await updatePRDWithLLMContent(sb, 'prd-id', 'SD-KEY', { sd_type: 'infrastructure' }, { executive_summary: 'x'.repeat(60) });
    expect(sb.capture.updated.integration_operationalization).toBeUndefined();
  });
});

describe('SD-LEARN-FIX-ADDRESS-PAT-LES-012 (FR-3): naming-drift fix, warn-list uses "bugfix" not "fix"', () => {
  it('TS-8: fires the authoring-time warning for a real bugfix PRD missing the section', async () => {
    const sb = makeSupabase({ sdType: 'bugfix', existingPRD: null });
    const warnSpy = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnSpy.push(args.join(' '));
    try {
      await createPRDWithValidatedContent(sb, 'PRD-X', 'SD-KEY', UUID_ID, 'T', { sd_type: 'bugfix' }, goodContent);
    } finally {
      console.warn = originalWarn;
    }
    // The warning fires on hasIntegrationSection being false pre-default; since goodContent
    // omits integration_operationalization, hasIntegrationSection is false and sd_type=bugfix
    // is in the (fixed) warn-list.
    expect(warnSpy.some((m) => m.includes('missing integration_operationalization'))).toBe(true);
  });
});
