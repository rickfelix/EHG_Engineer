/**
 * Unit tests for the legal-doc producer.
 * SD: SD-FDBK-FIX-BUILD-LEGAL-DOC-001 (V5, chairman-ratified 2026-07-12)
 *
 * Covers PRD test scenarios TS-1 (happy path), TS-2 (missing context), and the
 * deterministic-substitution / no-LLM-call requirement (NFR-1, NFR-2, TR-2).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  generateLegalDocsForVenture,
  substituteMarkers,
  NOT_LEGAL_ADVICE_DISCLAIMER,
  REQUIRED_TEMPLATE_TYPES,
} from '../../../lib/eva/legal-doc-producer.js';

const silentLogger = { info: () => {}, warn: () => {} };

const ACTIVE_TEMPLATES = [
  { id: 'tpl-tos', template_type: 'terms_of_service', content: '{{COMPANY_NAME}} at {{COMPANY_DOMAIN}}: {{SERVICE_DESCRIPTION}} — {{CONTACT_EMAIL}} — {{EFFECTIVE_DATE}}' },
  { id: 'tpl-privacy', template_type: 'privacy_policy', content: '{{COMPANY_NAME}} privacy at {{COMPANY_DOMAIN}}' },
];

const VENTURE_ROW = {
  id: 'v1',
  name: 'Alt Text Compliance',
  description: 'Image alt-text generator',
  value_proposition: 'EU-accessibility-compliant alt text generation for e-commerce',
  solution_approach: null,
  company_id: 'c1',
};

const COMPANY_ROW = { id: 'c1', name: 'Alt Text Compliance Inc', description: null, website: 'alttextcompliance.com' };

function makeSupabase({
  ventureRow = VENTURE_ROW,
  companyRow = COMPANY_ROW,
  templates = ACTIVE_TEMPLATES,
  existingOverride = null,
  insertShouldFail = false,
} = {}) {
  const inserted = [];
  const eventsInserted = [];
  return {
    _inserted: inserted,
    _eventsInserted: eventsInserted,
    from(table) {
      if (table === 'ventures') {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: () => Promise.resolve({ data: ventureRow, error: null }),
        };
      }
      if (table === 'companies') {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: () => Promise.resolve({ data: companyRow, error: null }),
        };
      }
      if (table === 'legal_templates') {
        return {
          select() { return this; },
          eq() { return this; },
          in: () => Promise.resolve({ data: templates, error: null }),
        };
      }
      if (table === 'venture_legal_overrides') {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: () => Promise.resolve({ data: existingOverride, error: null }),
          update() { return this; },
          insert(row) {
            if (insertShouldFail) {
              return { select() { return this; }, single: () => Promise.resolve({ data: null, error: { message: 'insert failed' } }) };
            }
            inserted.push(row);
            return { select() { return this; }, single: () => Promise.resolve({ data: { id: `override-${inserted.length}` }, error: null }) };
          },
        };
      }
      if (table === 'eva_orchestration_events') {
        return { insert: (row) => { eventsInserted.push(row); return Promise.resolve({ data: null, error: null }); } };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe('substituteMarkers', () => {
  it('deterministically replaces all markers with no leftover tokens', () => {
    const result = substituteMarkers('Hi {{COMPANY_NAME}}, visit {{COMPANY_NAME}}.com', { '{{COMPANY_NAME}}': 'Acme' });
    expect(result).toBe('Hi Acme, visit Acme.com');
    expect(result).not.toContain('{{');
  });

  it('is pure/repeatable: same inputs produce byte-identical output (NFR-1)', () => {
    const a = substituteMarkers('{{X}}-{{Y}}', { '{{X}}': '1', '{{Y}}': '2' });
    const b = substituteMarkers('{{X}}-{{Y}}', { '{{X}}': '1', '{{Y}}': '2' });
    expect(a).toBe(b);
  });

  it('adversarial-review fix: a substituted value containing a marker-like token is NOT re-substituted (injection guard)', () => {
    // Single-pass replace: the template's {{CONTACT_EMAIL}} is filled with a value that
    // itself looks like a different marker. A sequential split/join implementation would
    // re-scan and replace that literal text on a later pass; single-pass regex replace
    // must not, since String.replace never re-matches its own replacement output.
    const result = substituteMarkers('Contact: {{CONTACT_EMAIL}} / Effective: {{EFFECTIVE_DATE}}', {
      '{{CONTACT_EMAIL}}': '{{EFFECTIVE_DATE}}',
      '{{EFFECTIVE_DATE}}': '2026-07-13',
    });
    expect(result).toBe('Contact: {{EFFECTIVE_DATE}} / Effective: 2026-07-13');
  });
});

describe('generateLegalDocsForVenture — TS-1 happy path', () => {
  it('creates venture_legal_overrides rows for both required types with substituted content and the disclaimer', async () => {
    const supabase = makeSupabase();
    const result = await generateLegalDocsForVenture({ supabase, ventureId: 'v1', logger: silentLogger });

    expect(result.ok).toBe(true);
    expect(result.generated.map((g) => g.templateType).sort()).toEqual([...REQUIRED_TEMPLATE_TYPES].sort());
    expect(supabase._inserted).toHaveLength(2);
    for (const row of supabase._inserted) {
      expect(row.generated_content).toContain('Alt Text Compliance Inc');
      expect(row.generated_content).toContain('alttextcompliance.com');
      expect(row.generated_content).toContain(NOT_LEGAL_ADVICE_DISCLAIMER);
      expect(row.generated_content).not.toContain('{{'); // no leftover markers
      expect(row.generated_at).toBeTruthy();
    }
    expect(supabase._eventsInserted).toHaveLength(0); // no failure event on happy path
  });

  it('updates (not duplicates) an existing override on regeneration', async () => {
    const supabase = makeSupabase({ existingOverride: { id: 'existing-override-1' } });
    const result = await generateLegalDocsForVenture({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result.ok).toBe(true);
    expect(supabase._inserted).toHaveLength(0); // updated, not inserted
    expect(result.generated.every((g) => g.overrideId === 'existing-override-1')).toBe(true);
  });

  it('adversarial-review fix: strips protocol from a full-URL website value so CONTACT_EMAIL is a well-formed address', async () => {
    const supabase = makeSupabase({ companyRow: { ...COMPANY_ROW, website: 'https://alttextcompliance.com/about' } });
    const result = await generateLegalDocsForVenture({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result.ok).toBe(true);
    // Only the terms_of_service template (ACTIVE_TEMPLATES[0]) references {{CONTACT_EMAIL}}.
    const tosRow = supabase._inserted.find((r) => r.template_id === 'tpl-tos');
    expect(tosRow.generated_content).toContain('legal@alttextcompliance.com');
    expect(tosRow.generated_content).not.toContain('legal@https://');
    for (const row of supabase._inserted) {
      expect(row.generated_content).not.toContain('https://'); // COMPANY_DOMAIN itself is also stripped
    }
  });
});

describe('generateLegalDocsForVenture — adversarial review: TOCTOU race handling', () => {
  it('treats a 23505 unique-violation on insert as a concurrent-winner race, not a failure (no spurious chairman alert)', async () => {
    let selectCallCount = 0;
    const eventsInserted = [];
    const supabase = {
      from(table) {
        if (table === 'ventures') return { select() { return this; }, eq() { return this; }, maybeSingle: () => Promise.resolve({ data: VENTURE_ROW, error: null }) };
        if (table === 'companies') return { select() { return this; }, eq() { return this; }, maybeSingle: () => Promise.resolve({ data: COMPANY_ROW, error: null }) };
        if (table === 'legal_templates') return { select() { return this; }, eq() { return this; }, in: () => Promise.resolve({ data: ACTIVE_TEMPLATES, error: null }) };
        if (table === 'venture_legal_overrides') {
          return {
            select() { return this; },
            eq() { return this; },
            maybeSingle: () => {
              selectCallCount += 1;
              // Per template: 1st (odd) select is the pre-insert "existing?" check -> null.
              // 2nd (even) select is the post-23505 re-query, simulating the concurrent
              // winner's row that was inserted between the two selects -> the raced row.
              return Promise.resolve({ data: selectCallCount % 2 === 1 ? null : { id: 'raced-row-id' }, error: null });
            },
            update() { return this; },
            insert: () => ({
              select() { return this; },
              single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "unique_venture_template"' } }),
            }),
          };
        }
        if (table === 'eva_orchestration_events') return { insert: (row) => { eventsInserted.push(row); return Promise.resolve({ data: null, error: null }); } };
        throw new Error(`unexpected table ${table}`);
      },
    };

    const result = await generateLegalDocsForVenture({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result.ok).toBe(true);
    expect(result.generated.every((g) => g.overrideId === 'raced-row-id')).toBe(true);
    expect(eventsInserted).toHaveLength(0); // no false partial_write_failure alert
  });
});

describe('generateLegalDocsForVenture — TS-2 edge case: missing context', () => {
  it('does not throw and emits a chairman-flagged event when venture context is insufficient', async () => {
    const supabase = makeSupabase({ ventureRow: { ...VENTURE_ROW, value_proposition: null, solution_approach: null, description: null }, companyRow: { ...COMPANY_ROW, website: null } });
    const result = await generateLegalDocsForVenture({ supabase, ventureId: 'v1', logger: silentLogger });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient_context');
    expect(supabase._inserted).toHaveLength(0); // no partial/corrupt row
    expect(supabase._eventsInserted).toHaveLength(1);
    expect(supabase._eventsInserted[0].chairman_flagged).toBe(true);
    expect(supabase._eventsInserted[0].event_data.subtype).toBe('legal_producer_failed');
  });

  it('emits a chairman-flagged event when required templates are missing/inactive', async () => {
    const supabase = makeSupabase({ templates: [ACTIVE_TEMPLATES[0]] }); // only ToS active, privacy_policy missing
    const result = await generateLegalDocsForVenture({ supabase, ventureId: 'v1', logger: silentLogger });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_templates');
    expect(supabase._eventsInserted).toHaveLength(1);
    expect(supabase._eventsInserted[0].event_data.missing_fields).toContain('privacy_policy');
  });

  it('does not throw when ventureId or supabase is missing', async () => {
    await expect(generateLegalDocsForVenture({ supabase: null, ventureId: 'v1' })).resolves.toEqual({ ok: false, reason: 'missing_supabase_or_ventureId' });
    await expect(generateLegalDocsForVenture({ supabase: makeSupabase(), ventureId: null })).resolves.toEqual({ ok: false, reason: 'missing_supabase_or_ventureId' });
  });
});

describe('no LLM API usage (TR-2)', () => {
  it('the producer module source contains no LLM client imports', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(__dirname, '../../../lib/eva/legal-doc-producer.js'), 'utf8');
    expect(src).not.toMatch(/openai|anthropic|@google\/generative-ai|gemini/i);
  });
});
