/**
 * Static-pin regression guard for lib/cadence/pre-claim-gate.mjs and its
 * consumers. Verifies that the unlock_gate vocabulary discriminator is wired
 * via the literal CADENCE_REFUSAL_TYPES Set and that consumers branch on
 * state.source rather than only state.active.
 *
 * SD-FDBK-ENH-CADENCE-VOCAB-DISCRIMINATOR-001 TS-7
 *
 * Pattern: fs.readFileSync + scoped slice between explicit function anchors
 * (NOT whole-file regex) to avoid false-matches against JSDoc or unrelated
 * code. Mirrors the lesson learned in SD-FDBK-INFRA-ORCHESTRATOR-ROUTING-PHASE-001
 * where static-pin tests required scoping to a helperRegion slice.
 *
 * Dual-anchor strategy (testing-agent R-2):
 *  (a) whole-file regex for top-level CADENCE_REFUSAL_TYPES Object.freeze
 *      declaration (a module-level export, not inside a function)
 *  (b) scoped slice for the unlock_gate.type usage inside computeGateState
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

const GATE_PATH = path.join(PROJECT_ROOT, 'lib', 'cadence', 'pre-claim-gate.mjs');
const SELECTOR_PATH = path.join(PROJECT_ROOT, 'scripts', 'modules', 'handoff', 'child-sd-selector.js');
const STATUS_HELPERS_PATH = path.join(PROJECT_ROOT, 'scripts', 'modules', 'sd-next', 'status-helpers.js');

function readSource(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function sliceBetweenAnchors(src, startAnchor, endAnchor) {
  const startIdx = src.indexOf(startAnchor);
  if (startIdx === -1) {
    throw new Error(`Start anchor not found: ${startAnchor}`);
  }
  const endIdx = src.indexOf(endAnchor, startIdx + startAnchor.length);
  if (endIdx === -1) {
    throw new Error(`End anchor not found: ${endAnchor} (after ${startAnchor})`);
  }
  return src.slice(startIdx, endIdx);
}

describe('static-pin: lib/cadence/pre-claim-gate.mjs', () => {
  const src = readSource(GATE_PATH);

  it('exports CADENCE_REFUSAL_TYPES as Object.freeze(new Set([...])) at module level (anchor a)', () => {
    expect(src).toMatch(/export const CADENCE_REFUSAL_TYPES = Object\.freeze\(new Set\(\[/);
  });

  it('CADENCE_REFUSAL_TYPES contains pr_cadence and time_window string literals', () => {
    // Whole-file search OK here — Set membership is a single, unique location
    expect(src).toMatch(/['"]pr_cadence['"]/);
    expect(src).toMatch(/['"]time_window['"]/);
  });

  it('computeGateState helper region uses CADENCE_REFUSAL_TYPES.has(unlock_gate.type) (anchor b — scoped)', () => {
    // Scoped slice: from 'export function computeGateState' to next 'function buildGateState'
    const helperRegion = sliceBetweenAnchors(
      src,
      'export function computeGateState',
      'function buildGateState'
    );
    expect(helperRegion).toMatch(/CADENCE_REFUSAL_TYPES\.has\(/);
    expect(helperRegion).toMatch(/unlock_gate_advisory/);
  });

  it('helper region returns source:\'unlock_gate_advisory\' string literal in advisory branch', () => {
    const helperRegion = sliceBetweenAnchors(
      src,
      'export function computeGateState',
      'function buildGateState'
    );
    expect(helperRegion).toMatch(/source:\s*['"]unlock_gate_advisory['"]/);
  });

  it('GateState JSDoc typedef enumerates unlock_gate_advisory as valid source value', () => {
    expect(src).toMatch(/unlock_gate_advisory.*next_workable_after.*derived_from_session_log.*none/s);
  });
});

describe('static-pin: scripts/modules/handoff/child-sd-selector.js cadence filter (FR-3)', () => {
  const src = readSource(SELECTOR_PATH);

  it('cadenceCleared filter region branches on state.source === unlock_gate_advisory', () => {
    // Scope to the cadenceCleared filter (between its declaration and next blank stanza)
    const filterRegion = sliceBetweenAnchors(
      src,
      'const cadenceCleared = unblocked.filter',
      'const withUrgency'
    );
    expect(filterRegion).toMatch(/state\.source\s*===\s*['"]unlock_gate_advisory['"]/);
  });

  it('cadenceCleared advisory branch logs the canonical phrase from child-sd-preflight.js', () => {
    const filterRegion = sliceBetweenAnchors(
      src,
      'const cadenceCleared = unblocked.filter',
      'const withUrgency'
    );
    // em-dash (—) literal — the canonical informational marker from child-sd-preflight.js:315
    expect(filterRegion).toMatch(/\(informational\s+—\s+does not affect verdict\)/);
  });
});

describe('static-pin: scripts/modules/sd-next/status-helpers.js (FR-4)', () => {
  const src = readSource(STATUS_HELPERS_PATH);

  it('getCadenceBadge region suppresses badge for advisory source', () => {
    const helperRegion = sliceBetweenAnchors(
      src,
      'export function getCadenceBadge',
      'export function getCadenceReason'
    );
    expect(helperRegion).toMatch(/source\s*===\s*['"]unlock_gate_advisory['"]/);
    expect(helperRegion).toMatch(/return\s+['"]['"]\s*;?\s*\n/);
  });

  it('getCadenceReason region suppresses reason text for advisory source', () => {
    const startIdx = src.indexOf('export function getCadenceReason');
    expect(startIdx).toBeGreaterThan(-1);
    // Scope to ~end of file (whichever comes first): another export or end-of-file
    const nextExportIdx = src.indexOf('\nexport function', startIdx + 'export function getCadenceReason'.length);
    const slice = src.slice(startIdx, nextExportIdx === -1 ? undefined : nextExportIdx);
    expect(slice).toMatch(/source\s*===\s*['"]unlock_gate_advisory['"]/);
  });
});
