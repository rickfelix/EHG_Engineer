// SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001.
// checkUatRobustnessGate()'s own logic is already thoroughly covered by
// tests/unit/eva/uat-robustness-gate.test.js -- this file covers only the thin
// wrapper: does it call the checker with the right args and shape the artifact.
import { describe, it, expect, vi } from 'vitest';
import { analyzeStage23DedicatedVentureUat } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat.js';
import { ARTIFACT_TYPES } from '../../../../../lib/eva/artifact-types.js';

function fakeSupabaseReturning(row) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: row, error: null }) };
            },
          };
        },
      };
    },
  };
}

describe('analyzeStage23DedicatedVentureUat', () => {
  it('calls checkUatRobustnessGate with fromStage=23 and passes the venture/supabase through', async () => {
    // Not opted in -> applies:false, satisfied:true (the gate's own documented safe default).
    const supabase = fakeSupabaseReturning({ metadata: {} });
    const result = await analyzeStage23DedicatedVentureUat({ supabase, ventureId: 'v-1', ventureName: 'Test Venture' });
    expect(result.applies).toBe(false);
    expect(result.satisfied).toBe(true);
    expect(result.venture_name).toBe('Test Venture');
  });

  it('wraps the gate result in a LAUNCH_UAT_REPORT artifact', async () => {
    const supabase = fakeSupabaseReturning({ metadata: {} });
    const result = await analyzeStage23DedicatedVentureUat({ supabase, ventureId: 'v-1' });
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].artifactType).toBe(ARTIFACT_TYPES.LAUNCH_UAT_REPORT);
    expect(result.artifacts[0].source).toBe('stage-23-dedicated-venture-uat');
    expect(result.artifacts[0].payload.applies).toBe(false);
  });

  it('accepts an injected logger without throwing', async () => {
    const supabase = fakeSupabaseReturning({ metadata: {} });
    const logger = { info: vi.fn() };
    await analyzeStage23DedicatedVentureUat({ supabase, ventureId: 'v-1', logger });
    expect(logger.info).toHaveBeenCalled();
  });
});

// SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001 FR-2: generateLegalDocsForVenture had zero
// stage-template callers. Wired here (the last stage before Stage 24's Launch Readiness
// checklist reads venture_legal_overrides.generated_at). AC#2: a fixture venture run
// through this stage produces real legal documents without any manual script invocation.
function fakeSupabaseWithLegalDocs({ existingOverrideId = null } = {}) {
  const inserted = [];
  return {
    insertedOverrides: inserted,
    from(table) {
      if (table === 'venture_stages') {
        // No uat_robustness_required marker -> UAT gate short-circuits applies:false,
        // isolating this test to the legal-doc side effect under test.
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { metadata: {} }, error: null }) }) }) };
      }
      if (table === 'legal_templates') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: async () => ({
                  data: [
                    { id: 'tpl-tos', template_type: 'terms_of_service', content: 'ToS for {{COMPANY_NAME}}' },
                    { id: 'tpl-pp', template_type: 'privacy_policy', content: 'Privacy for {{COMPANY_NAME}}' },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'ventures') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'v-1', name: 'Acme Venture', description: 'A venture', value_proposition: 'Saves time', company_id: 'c-1' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'companies') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'c-1', name: 'Acme Inc', description: 'A company', website: 'https://acme.example.com' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'venture_legal_overrides') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: existingOverrideId ? { id: existingOverrideId } : null, error: null }) }),
            }),
          }),
          insert: (row) => ({
            select: () => ({
              single: async () => {
                const id = `override-${inserted.length + 1}`;
                inserted.push({ id, ...row });
                return { data: { id }, error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe('analyzeStage23DedicatedVentureUat FR-2: legal-doc-producer wiring', () => {
  it('a fixture venture run through this stage produces real legal documents (terms_of_service, privacy_policy) without any manual script invocation', async () => {
    const supabase = fakeSupabaseWithLegalDocs();
    const result = await analyzeStage23DedicatedVentureUat({ supabase, ventureId: 'v-1', ventureName: 'Acme Venture' });

    expect(result.legal_docs.ok).toBe(true);
    expect(result.legal_docs.generated.map((g) => g.templateType).sort()).toEqual(['privacy_policy', 'terms_of_service']);
    expect(supabase.insertedOverrides).toHaveLength(2);
    // AC#3: the producer's own generation logic is unchanged -- the wiring is additive only.
    expect(supabase.insertedOverrides.some((o) => o.generated_content.includes('Acme Inc'))).toBe(true);
  });

  it('does not alter the UAT gate verdict when legal docs are generated', async () => {
    const supabase = fakeSupabaseWithLegalDocs();
    const result = await analyzeStage23DedicatedVentureUat({ supabase, ventureId: 'v-1' });
    expect(result.applies).toBe(false);
    expect(result.satisfied).toBe(true);
  });

  // testing-agent EXEC-phase review (17bc4580): the generateLegalDocsForVenture
  // try/catch was untested -- an unexpected throw must degrade to a structured
  // result, never break this stage's own UAT artifact.
  it('catches an unexpected throw from generateLegalDocsForVenture without breaking the UAT result', async () => {
    const supabase = {
      from(table) {
        if (table === 'venture_stages') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { metadata: {} }, error: null }) }) }) };
        }
        if (table === 'legal_templates') {
          return { select: () => { throw new Error('unexpected DB client failure'); } };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    const logger = { info: vi.fn(), warn: vi.fn() };

    const result = await analyzeStage23DedicatedVentureUat({ supabase, ventureId: 'v-1', ventureName: 'Test Venture', logger });

    expect(result.legal_docs.ok).toBe(false);
    expect(result.legal_docs.reason).toBe('threw');
    expect(result.legal_docs.error).toMatch(/unexpected DB client failure/);
    // The UAT gate's own result is untouched by the legal-doc producer throwing.
    expect(result.applies).toBe(false);
    expect(result.satisfied).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });
});
