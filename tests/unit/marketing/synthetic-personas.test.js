/**
 * SD-LEO-INFRA-DEMAND-ENGINE-PART-001 US-006 — synthetic persona + AltifyAI content
 * authoring, stamped with mock-run provenance.
 */
import { describe, it, expect, vi } from 'vitest';
import { ALTIFYAI_PERSONA_TEMPLATES, authorSyntheticPersona, authorMockContent } from '../../../lib/marketing/synthetic-personas.js';

function makeSupabase() {
  const rows = { mock_outreach_personas: [], marketing_content: [] };
  const from = vi.fn((table) => ({
    insert: (payload) => ({
      select: () => ({
        single: async () => {
          const row = { id: `${table}-${rows[table].length + 1}`, ...payload, created_at: '2026-09-13T00:00:00Z' };
          rows[table].push(row);
          return { data: row, error: null };
        },
      }),
    }),
  }));
  return { from, _rows: rows };
}

describe('authorSyntheticPersona', () => {
  it('registers a persona stamped with mock_run_id + persona_template provenance', async () => {
    const supabase = makeSupabase();
    const result = await authorSyntheticPersona({
      supabase, mockRunId: 'run-1', ventureId: 'v1',
      personaTemplate: ALTIFYAI_PERSONA_TEMPLATES[0],
      displayName: 'Jordan Synth',
      attributes: { role: 'technical_founder' },
    });

    expect(result.ok).toBe(true);
    expect(result.persona).toMatchObject({ mock_run_id: 'run-1', persona_template: ALTIFYAI_PERSONA_TEMPLATES[0], display_name: 'Jordan Synth' });
    expect(supabase._rows.mock_outreach_personas).toHaveLength(1);
  });

  it('refuses without a mock_run_id', async () => {
    const supabase = makeSupabase();
    const result = await authorSyntheticPersona({ supabase, mockRunId: undefined, personaTemplate: 'x', displayName: 'n' });
    expect(result).toEqual({ ok: false, error: 'MOCK_RUN_ID_REQUIRED' });
  });

  it('refuses without a persona_template', async () => {
    const supabase = makeSupabase();
    const result = await authorSyntheticPersona({ supabase, mockRunId: 'run-1', personaTemplate: undefined, displayName: 'n' });
    expect(result).toEqual({ ok: false, error: 'PERSONA_TEMPLATE_REQUIRED' });
  });
});

describe('authorMockContent', () => {
  it('authors AltifyAI thesis content stamped with the same provenance in marketing_content.metadata', async () => {
    const supabase = makeSupabase();
    const result = await authorMockContent({
      supabase, ventureId: 'v1', mockRunId: 'run-1', personaTemplate: ALTIFYAI_PERSONA_TEMPLATES[1],
      body: 'AltifyAI helps portfolio operators ship faster.',
    });

    expect(result.ok).toBe(true);
    expect(result.content.metadata).toMatchObject({
      mock_run_id: 'run-1', persona_template: ALTIFYAI_PERSONA_TEMPLATES[1], source: 'mock-first-stranger-run',
      body: 'AltifyAI helps portfolio operators ship faster.',
    });
  });

  it('refuses an empty body (never author blank/fabricated-looking content)', async () => {
    const supabase = makeSupabase();
    const result = await authorMockContent({ supabase, ventureId: 'v1', mockRunId: 'run-1', personaTemplate: 'x', body: '   ' });
    expect(result).toEqual({ ok: false, error: 'BODY_REQUIRED' });
  });
});
