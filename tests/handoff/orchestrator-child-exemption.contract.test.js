/**
 * Contract Test: Orchestrator-Child Exemption
 * SD: SD-LEO-INFRA-FIX-ORCHESTRATOR-CHILD-001
 *
 * Verifies that isOrchestratorChild() correctly classifies SDs and that
 * gate consumers use it instead of inline metadata checks.
 *
 * Prevents contract drift between SD producers (leo-create-sd) and
 * gate consumers (vision-score, translation-fidelity, exec-to-plan, etc.).
 */

import { describe, it, expect } from 'vitest';
import { isOrchestratorChild, getParentIdentifier } from '../../scripts/modules/handoff/lib/sd-classification.js';

// --- isOrchestratorChild unit tests ---

describe('isOrchestratorChild', () => {
  it('returns true when parent_sd_id is set (FK signal)', () => {
    const sd = { parent_sd_id: 'abc-123', metadata: {} };
    expect(isOrchestratorChild(sd)).toBe(true);
  });

  it('returns true for legacy metadata.parent_orchestrator fallback', () => {
    const sd = { parent_sd_id: null, metadata: { parent_orchestrator: 'SD-ORCH-001' } };
    expect(isOrchestratorChild(sd)).toBe(true);
  });

  it('returns true for legacy metadata.auto_generated fallback', () => {
    const sd = { parent_sd_id: null, metadata: { auto_generated: true } };
    expect(isOrchestratorChild(sd)).toBe(true);
  });

  it('returns false for standalone SD (null parent_sd_id, no metadata keys)', () => {
    const sd = { parent_sd_id: null, metadata: {} };
    expect(isOrchestratorChild(sd)).toBe(false);
  });

  it('returns false for standalone SD with unrelated metadata', () => {
    const sd = { parent_sd_id: null, metadata: { source: 'rca', some_key: 'value' } };
    expect(isOrchestratorChild(sd)).toBe(false);
  });

  it('returns false for null/undefined input', () => {
    expect(isOrchestratorChild(null)).toBe(false);
    expect(isOrchestratorChild(undefined)).toBe(false);
  });

  it('returns false when metadata is undefined', () => {
    const sd = { parent_sd_id: null };
    expect(isOrchestratorChild(sd)).toBe(false);
  });

  it('prioritizes parent_sd_id over metadata keys', () => {
    // Even if metadata keys are absent, parent_sd_id alone suffices
    const sd = { parent_sd_id: 'uuid-here', metadata: {} };
    expect(isOrchestratorChild(sd)).toBe(true);
  });
});

// --- getParentIdentifier unit tests ---

describe('getParentIdentifier', () => {
  it('returns parent_sd_id when available', () => {
    const sd = { parent_sd_id: 'abc-123', metadata: { parent_orchestrator: 'SD-ORCH' } };
    expect(getParentIdentifier(sd)).toBe('abc-123');
  });

  it('falls back to metadata.parent_orchestrator', () => {
    const sd = { parent_sd_id: null, metadata: { parent_orchestrator: 'SD-ORCH-001' } };
    expect(getParentIdentifier(sd)).toBe('SD-ORCH-001');
  });

  it('falls back to auto_generated string', () => {
    const sd = { parent_sd_id: null, metadata: { auto_generated: true } };
    expect(getParentIdentifier(sd)).toBe('auto_generated');
  });

  it('returns unknown for standalone SD', () => {
    const sd = { parent_sd_id: null, metadata: {} };
    expect(getParentIdentifier(sd)).toBe('unknown');
  });
});

// --- Contract: gate files import from sd-classification.js ---

describe('Gate consumer contract', () => {
  it('vision-score.js imports isOrchestratorChild from sd-classification', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(
      import.meta.dirname, '../../scripts/modules/handoff/executors/lead-to-plan/gates/vision-score.js'
    );
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain("from '../../../lib/sd-classification.js'");
    expect(content).toContain('isOrchestratorChild');
    // Must NOT contain the old inline pattern
    expect(content).not.toMatch(/sd\.metadata\?\.parent_orchestrator\s*\|\|\s*sd\.metadata\?\.auto_generated/);
  });

  it('translation-fidelity.js (lead-to-plan) imports isOrchestratorChild', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(
      import.meta.dirname, '../../scripts/modules/handoff/executors/lead-to-plan/gates/translation-fidelity.js'
    );
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain("from '../../../lib/sd-classification.js'");
    expect(content).toContain('isOrchestratorChild');
    expect(content).not.toMatch(/sd\?\.\s*metadata\?\.parent_orchestrator\s*\|\|\s*sd\?\.\s*metadata\?\.auto_generated/);
  });

  it('exec-to-plan/index.js imports isOrchestratorChild', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(
      import.meta.dirname, '../../scripts/modules/handoff/executors/exec-to-plan/index.js'
    );
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain("from '../../lib/sd-classification.js'");
    expect(content).toContain('isOrchestratorChild');
    expect(content).not.toMatch(/sd\?\.\s*metadata\?\.parent_orchestrator\s*\|\|\s*sd\?\.\s*metadata\?\.auto_generated/);
  });
});
