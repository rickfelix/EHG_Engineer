/**
 * SD-LEO-INFRA-COMPOUNDING-CAPTURE-FORWARD-001 — capture-forward: lower the extract gate (26->15),
 * tag pre-outcome extractions provenance='unvalidated', and EXCLUDE them from the application path
 * (collect-but-don't-promote). The application half stays deferred to venture-2+.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DEFAULT_MIN_EXTRACT_STAGE, resolveMinExtractStage, extractTemplate } from '../../../lib/eva/template-extractor.js';

// A chainable supabase stub: ventures.single() -> the venture; venture_revenue_entries count head ->
// revenueCount; venture_templates select/single -> no existing version; insert -> captures the row.
function makeSb({ venture, revenueCount = 0 }) {
  let inserted = null;
  const sb = {
    inserted: () => inserted,
    from(table) {
      // Fully-chainable builder: every non-terminal method returns the builder; awaiting it (then) or
      // .single() resolves the table's data. Covers the 5 extract-helper queries (.limit/.gte/.in/etc.).
      const result = () => {
        if (table === 'venture_revenue_entries') return { count: revenueCount, data: [], error: null };
        return { data: [], error: null };
      };
      const b = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'single') return async () => (table === 'ventures' ? { data: venture, error: null } : { data: null, error: null });
          if (prop === 'maybeSingle') return async () => ({ data: null, error: null });
          if (prop === 'then') return (res, rej) => Promise.resolve(result()).then(res, rej);
          if (prop === 'insert') return (row) => { inserted = row; return { select: () => ({ single: async () => ({ data: { id: 't1', template_name: row.template_name, template_version: row.template_version }, error: null }) }) }; };
          if (prop === 'update') return () => b;
          return () => b; // select/eq/order/limit/gte/in/not/or/... all chain
        },
      });
      return b;
    },
  };
  return sb;
}
const activeVenture = { id: 'v1', name: 'V1', status: 'active', current_lifecycle_stage: 16 };

describe('FR-1 extract-stage lowered', () => {
  it('default min extract stage is 15 (was 26)', () => {
    expect(DEFAULT_MIN_EXTRACT_STAGE).toBe(15);
    expect(resolveMinExtractStage({}, {})).toBe(15);
  });
  it('env LEO_TEMPLATE_EXTRACT_MIN_STAGE still overrides the default', () => {
    expect(resolveMinExtractStage({}, { LEO_TEMPLATE_EXTRACT_MIN_STAGE: '20' })).toBe(20);
  });
  it('opts.minStage overrides env + default', () => {
    expect(resolveMinExtractStage({ minStage: 18 }, { LEO_TEMPLATE_EXTRACT_MIN_STAGE: '20' })).toBe(18);
  });
});

describe('FR-2 provenance tag', () => {
  it('a NOT-outcome-resolved source (active, no first-revenue) -> provenance=unvalidated', async () => {
    const sb = makeSb({ venture: activeVenture, revenueCount: 0 });
    await extractTemplate(sb, 'v1');
    expect(sb.inserted().template_data.provenance).toBe('unvalidated');
    expect(sb.inserted().template_data.provenance_basis).toBe('pre_outcome');
  });
  it('a KILLED source -> provenance=validated (not unvalidated)', async () => {
    const sb = makeSb({ venture: { ...activeVenture, status: 'cancelled' }, revenueCount: 0 });
    await extractTemplate(sb, 'v1');
    expect(sb.inserted().template_data.provenance).toBe('validated');
    expect(sb.inserted().template_data.provenance_basis).toBe('killed');
  });
  it('a FIRST-REVENUE source -> provenance=validated', async () => {
    const sb = makeSb({ venture: activeVenture, revenueCount: 3 });
    await extractTemplate(sb, 'v1');
    expect(sb.inserted().template_data.provenance).toBe('validated');
    expect(sb.inserted().template_data.provenance_basis).toBe('first_revenue');
  });
});

describe('FR-3 application path excludes unvalidated', () => {
  it('the applier discovery query filters out provenance=unvalidated (keeps NULL/legacy)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../../../lib/eva/template-applier.js'), 'utf8');
    expect(src).toMatch(/template_data->>provenance\.is\.null,template_data->>provenance\.neq\.unvalidated/);
  });
  it('the knowledge-retriever does NOT query venture_templates (no exclusion needed there)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../../../lib/eva/utils/knowledge-retriever.js'), 'utf8');
    expect(src).not.toMatch(/venture_templates/);
  });
});
