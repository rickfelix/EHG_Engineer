/**
 * Structured SD functional-requirements derivation — regression tests
 * SD-LEO-INFRA-STRUCTURED-SD-FR-FIELD-001 (FR-1..FR-5)
 */
import { describe, it, expect } from 'vitest';
import { deriveSdFunctionalRequirements } from './derive-functional-requirements.js';
import { buildPRDGenerationContext } from '../../scripts/prd/llm-generator.js';
import { extractSdFrs } from '../../scripts/modules/handoff/executors/plan-to-exec/gates/sd-prd-drift.js';

const SD_PROSE = {
  description:
    'FR-1 the detector compares SD and PRD. It flags any drift. ' +
    'FR-2 false-positive guard via identity match. ' +
    'FR-3 actionable output naming missing FRs.',
  scope: 'FR-4 governance precondition enforcement before the handoff passes.',
};

describe('FR-1 deriveSdFunctionalRequirements — prose -> structured', () => {
  it('extracts FR-N markers from description + scope into structured objects', () => {
    const frs = deriveSdFunctionalRequirements(SD_PROSE);
    expect(frs.map((f) => f.id)).toEqual(['FR-1', 'FR-2', 'FR-3', 'FR-4']);
    expect(frs[0].title).toMatch(/compares SD and PRD/);
  });

  it('splits the first sentence into title and the rest into description (round-trip text)', () => {
    const fr = deriveSdFunctionalRequirements(SD_PROSE).find((f) => f.id === 'FR-1');
    expect(fr.title).toBe('the detector compares SD and PRD.');
    expect(fr.description).toMatch(/flags any drift/);
    // Joined title+description reconstructs the original prose (parity with extractSdFrs).
    expect([fr.title, fr.description].join(' ')).toContain('It flags any drift');
  });

  it('FR-4: returns [] when the prose carries no FR-N markers', () => {
    expect(deriveSdFunctionalRequirements({ description: 'no markers here', scope: '' })).toEqual([]);
    expect(deriveSdFunctionalRequirements(null)).toEqual([]);
  });

  it('emits canonical uppercase FR-N ids (cheap key-match path for the drift gate)', () => {
    const frs = deriveSdFunctionalRequirements({ description: 'fr-7 lowercase marker text here.' });
    expect(frs[0].id).toBe('FR-7');
  });

  it('omits an empty description rather than writing a blank field', () => {
    const frs = deriveSdFunctionalRequirements({ description: 'FR-1 short single clause' });
    expect(frs[0]).toEqual({ id: 'FR-1', title: 'FR-1 short single clause'.replace('FR-1 ', '') });
    expect('description' in frs[0]).toBe(false);
  });
});

describe('FR-5 drift-gate shape consumption (structured<->structured parity)', () => {
  it('extractSdFrs consumes the derived shape and yields matching FR ids', () => {
    const derived = deriveSdFunctionalRequirements(SD_PROSE);
    const sdViaStructured = extractSdFrs({ metadata: { functional_requirements: derived } });
    expect(sdViaStructured.map((f) => f.id)).toEqual(['FR-1', 'FR-2', 'FR-3', 'FR-4']);
    // The structured-branch text (title+description joined) carries the FR prose.
    expect(sdViaStructured[0].text).toMatch(/compares SD and PRD/);
  });

  it('structured path and prose-fallback path agree on FR ids', () => {
    const derived = deriveSdFunctionalRequirements(SD_PROSE);
    const viaStructured = extractSdFrs({ metadata: { functional_requirements: derived } }).map((f) => f.id);
    const viaProse = extractSdFrs(SD_PROSE).map((f) => f.id);
    expect(viaStructured).toEqual(viaProse);
  });
});

describe('FR-3 PRD context builder reads the structured source', () => {
  it('renders a Structured Functional Requirements section when present', () => {
    const ctx = buildPRDGenerationContext({
      sd_key: 'SD-X', title: 'X', description: 'd',
      metadata: { functional_requirements: deriveSdFunctionalRequirements(SD_PROSE) },
    });
    expect(ctx).toMatch(/Structured Functional Requirements/);
    expect(ctx).toMatch(/\*\*FR-1\*\*/);
    expect(ctx).toMatch(/\*\*FR-4\*\*/);
  });

  it('FR-4: omits the section entirely when the SD has no structured FRs', () => {
    const ctx = buildPRDGenerationContext({ sd_key: 'SD-X', title: 'X', description: 'd', metadata: {} });
    expect(ctx).not.toMatch(/Structured Functional Requirements/);
  });
});

describe('FR-2 gap-fill-not-overwrite semantics (helper layer guard)', () => {
  // The createSD call-site only derives when metadata.functional_requirements is absent/empty.
  // This asserts the invariant at the layer a unit test can exercise: a supplied array is the
  // authoritative source and derivation is never asked to overwrite it.
  it('a supplied structured array is preserved by extractSdFrs verbatim (no re-derive)', () => {
    const supplied = [{ id: 'FR-99', title: 'authoritative', description: 'kept as-is' }];
    const out = extractSdFrs({ metadata: { functional_requirements: supplied }, description: 'FR-1 prose that must NOT win' });
    expect(out.map((f) => f.id)).toEqual(['FR-99']);
  });
});
