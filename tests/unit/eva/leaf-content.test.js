/**
 * Unit tests for the leaf-content seam (template vs panel-enriched).
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 1 (FR-001 wiring seam)
 *
 * Verifies the seam is byte-identical to the legacy template with the flag OFF
 * (the safety contract), enriches with the flag ON + driver, and fails closed
 * (throws) when a required agent holds the leaf. Env is set/cleared per-test so
 * the flag's ambient absence (default-OFF) is exercised hermetically.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  computeLeafContent,
  templateLeafContent,
  isPrebuildPanelEnrichmentEnabled,
  buildDesignInputBlock,
} from '../../../lib/eva/bridge/leaf-content.js';

const LAYER = { key: 'api', label: 'API Layer', description: 'REST endpoints, request handling, validation' };
const CHILD = { title: 'Distillation Engine Worker' };
const TEMPLATE_DESC = 'REST endpoints, request handling, validation for "Distillation Engine Worker".';
const TEMPLATE_SCOPE = 'API Layer implementation for parent task.';
const TEMPLATE_SCOPE_UI = 'UI Layer implementation for parent task.';

const okDriver = { async runAgent({ agent }) { return { ok: true, section: `${agent.code} content` }; } };

afterEach(() => { delete process.env.PREBUILD_PANEL_ENRICHMENT; });

describe('flag default-OFF — byte-identical legacy behavior', () => {
  it('returns the exact legacy template when the flag is unset (even if a driver is present)', async () => {
    delete process.env.PREBUILD_PANEL_ENRICHMENT;
    const r = await computeLeafContent({ layer: LAYER, childPayload: CHILD, leafKey: 'K', ventureContext: { panelDriver: okDriver } });
    expect(r.description).toBe(TEMPLATE_DESC);
    expect(r.scope).toBe(TEMPLATE_SCOPE);
  });

  it('returns the template when the flag is ON but no driver is supplied', async () => {
    process.env.PREBUILD_PANEL_ENRICHMENT = 'true';
    const r = await computeLeafContent({ layer: LAYER, childPayload: CHILD, leafKey: 'K', ventureContext: {} });
    expect(r.description).toBe(TEMPLATE_DESC);
    expect(r.scope).toBe(TEMPLATE_SCOPE);
  });
});

describe('flag ON + driver — panel enrichment', () => {
  it('replaces the template with the panel-enriched description (scope retained)', async () => {
    process.env.PREBUILD_PANEL_ENRICHMENT = '1';
    const r = await computeLeafContent({
      layer: LAYER, childPayload: CHILD, leafKey: 'K',
      ventureContext: { panelDriver: okDriver, panelArtifactTypes: ['blueprint_data_model'], panelCriteriaOpts: { dataSensitive: true } },
    });
    expect(r.description).not.toBe(TEMPLATE_DESC);
    expect(r.description).not.toContain('REST endpoints, request handling, validation for');
    expect(r.description).toContain('DATABASE'); // an enriched agent section
    expect(r.scope).toBe(TEMPLATE_SCOPE);
  });

  it('throws PREBUILD_PANEL_HELD (fail-closed, no stub) when a required agent holds', async () => {
    process.env.PREBUILD_PANEL_ENRICHMENT = '1';
    const heldDriver = { async runAgent({ agent }) { return agent.code === 'DATABASE' ? { ok: false, error: 'no' } : { ok: true, section: 'x' }; } };
    await expect(computeLeafContent({
      layer: LAYER, childPayload: CHILD, leafKey: 'K',
      ventureContext: { panelDriver: heldDriver, panelArtifactTypes: ['blueprint_data_model'], panelCriteriaOpts: { dataSensitive: true } },
    })).rejects.toThrow(/PREBUILD_PANEL_HELD/);
  });
});

describe('HOLD observability (SD-LEO-INFRA-WIRE-PRE-BUILD-002 FR-6 / TS-6b)', () => {
  const heldDriver = { async runAgent({ agent }) { return agent.code === 'DATABASE' ? { ok: false, error: 'no' } : { ok: true, section: 'x' }; } };

  it('emits onHold({event, leafKey, heldOn, ventureId}) BEFORE the throw propagates', async () => {
    process.env.PREBUILD_PANEL_ENRICHMENT = '1';
    const events = [];
    const onHold = async (e) => { events.push(e); };
    await expect(computeLeafContent({
      layer: LAYER, childPayload: CHILD, leafKey: 'LEAF-1',
      ventureContext: { panelDriver: heldDriver, panelArtifactTypes: ['blueprint_data_model'], panelCriteriaOpts: { dataSensitive: true }, ventureId: 'v1', onHold },
    })).rejects.toThrow(/PREBUILD_PANEL_HELD/);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: 'PREBUILD_PANEL_HELD', leafKey: 'LEAF-1', heldOn: 'DATABASE', ventureId: 'v1' });
  });

  it('a failing onHold is best-effort — it NEVER swallows the fail-closed throw', async () => {
    process.env.PREBUILD_PANEL_ENRICHMENT = '1';
    const onHold = async () => { throw new Error('emit failed'); };
    await expect(computeLeafContent({
      layer: LAYER, childPayload: CHILD, leafKey: 'LEAF-2',
      ventureContext: { panelDriver: heldDriver, panelArtifactTypes: ['blueprint_data_model'], panelCriteriaOpts: { dataSensitive: true }, onHold },
    })).rejects.toThrow(/PREBUILD_PANEL_HELD/);
  });
});

// SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001 (FR-1/FR-2, TS-1/TS-2/TS-4)
const UI_LAYER = { key: 'ui', label: 'UI Layer', description: 'Components, pages, user interactions' };

describe('FR-1/FR-2: design-input routing (ui layer only)', () => {
  it('TS-2: no locked source at all -> byte-identical to the generic template (zero regression)', async () => {
    const r = await computeLeafContent({ layer: UI_LAYER, childPayload: CHILD, leafKey: 'K', ventureContext: {} });
    expect(r).toEqual(templateLeafContent(UI_LAYER, CHILD));
  });

  it('TS-1: a locked design-token source produces a payload, not the bare template', async () => {
    const tokens = { colors: ['#111'], typeScale: { heading: 'Inter' } };
    const r = await computeLeafContent({
      layer: UI_LAYER, childPayload: CHILD, leafKey: 'K',
      ventureContext: { designTokens: tokens },
    });
    expect(r.description).not.toBe(templateLeafContent(UI_LAYER, CHILD).description);
    expect(r.description).toContain('DESIGN TOKENS');
    expect(r.description).toContain('#111');
    expect(r.scope).toBe(TEMPLATE_SCOPE_UI); // scope untouched, per TR-2
  });

  it('TS-4: design_reference on childPayload reaches the build context (was a dead field)', async () => {
    const childWithRef = { ...CHILD, design_reference: { wireframe: 'hero+features+cta' } };
    const r = await computeLeafContent({ layer: UI_LAYER, childPayload: childWithRef, leafKey: 'K', ventureContext: {} });
    expect(r.description).toContain('DESIGN REFERENCE');
    expect(r.description).toContain('hero+features+cta');
  });

  it('a non-ui layer is never affected by design-input fields, even if present on ventureContext', async () => {
    const r = await computeLeafContent({
      layer: LAYER, childPayload: { ...CHILD, design_reference: { x: 1 } }, leafKey: 'K',
      ventureContext: { designTokens: { colors: ['#fff'] } },
    });
    expect(r).toEqual({ description: TEMPLATE_DESC, scope: TEMPLATE_SCOPE });
  });

  it('buildDesignInputBlock returns null when nothing is available (pure helper)', () => {
    expect(buildDesignInputBlock({})).toBeNull();
    expect(buildDesignInputBlock()).toBeNull();
  });

  it('buildDesignInputBlock composes all four inputs when present', () => {
    const block = buildDesignInputBlock({
      tokens: { colors: ['#000'] },
      motionGrammar: { entry_transition: 'fade' },
      designReference: { wireframe: 'x' },
      instructionBlock: 'CHECKLIST TEXT',
    });
    expect(block).toContain('DESIGN TOKENS');
    expect(block).toContain('MOTION GRAMMAR');
    expect(block).toContain('DESIGN REFERENCE');
    expect(block).toContain('CHECKLIST TEXT');
  });
});

describe('helpers', () => {
  it('templateLeafContent matches the legacy strings exactly', () => {
    expect(templateLeafContent(LAYER, CHILD)).toEqual({ description: TEMPLATE_DESC, scope: TEMPLATE_SCOPE });
  });

  it('isPrebuildPanelEnrichmentEnabled reads the env flag (1/true on, else off)', () => {
    delete process.env.PREBUILD_PANEL_ENRICHMENT;
    expect(isPrebuildPanelEnrichmentEnabled()).toBe(false);
    process.env.PREBUILD_PANEL_ENRICHMENT = 'true';
    expect(isPrebuildPanelEnrichmentEnabled()).toBe(true);
    process.env.PREBUILD_PANEL_ENRICHMENT = '1';
    expect(isPrebuildPanelEnrichmentEnabled()).toBe(true);
    process.env.PREBUILD_PANEL_ENRICHMENT = 'no';
    expect(isPrebuildPanelEnrichmentEnabled()).toBe(false);
  });
});
