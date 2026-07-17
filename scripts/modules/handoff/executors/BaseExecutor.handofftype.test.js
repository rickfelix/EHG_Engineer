/**
 * SD-FDBK-INFRA-FIX-GATE-SUBAGENT-001 (FR-1): BaseExecutor.execute()'s validationContext
 * (passed to validationOrchestrator.buildGatesFromRules -> validateGates ->
 * subagent-evidence-gate.js) must include handoffType: this.handoffType, or
 * REQUIRED_SUBAGENTS[ctx.handoffType] silently resolves to [] (fail-open) regardless
 * of the actual handoff type.
 *
 * execute() is a ~700-line template method with 10+ dynamic-import dependencies
 * (claim validity, claim-eligibility fencing, migration checks, gate-policy
 * resolution, telemetry) that must all be traversed before validationContext is
 * built. A full mocked execute() integration test would require ~10 vi.mock()
 * targets plus ~6 vi.spyOn() instance-method stubs to reach this one object
 * literal -- disproportionate to a one-line fix and independently verified by two
 * sub-agents (validation-agent 5498d47a, risk-agent eec31685) via direct code
 * inspection. A structural assertion on the source directly guards the exact
 * regression class (the field being dropped again) without that fragility, and
 * subagent-evidence-gate.test.js already exhaustively covers the downstream gate
 * logic once ctx.handoffType is populated.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const source = readFileSync(path.join(__dirname, 'BaseExecutor.js'), 'utf8');

describe('BaseExecutor.js execute() validationContext includes handoffType', () => {
  it('the object literal passed into buildGatesFromRules sets handoffType: this.handoffType', () => {
    const literalStart = source.indexOf('const validationContext = {');
    expect(literalStart).toBeGreaterThan(-1);
    const literalEnd = source.indexOf('\n      };', literalStart);
    expect(literalEnd).toBeGreaterThan(literalStart);
    const literal = source.slice(literalStart, literalEnd);

    expect(literal).toMatch(/handoffType:\s*this\.handoffType/);
    // Sanity check we grabbed the right literal (same one gitContext/sdId live in),
    // not some other unrelated object.
    expect(literal).toContain('gitContext');
    expect(literal).toContain('sdId,');
  });

  it('the literal is actually threaded into buildGatesFromRules (not a dead field)', () => {
    const literalStart = source.indexOf('const validationContext = {');
    const buildCallIdx = source.indexOf('buildGatesFromRules(', literalStart);
    expect(buildCallIdx).toBeGreaterThan(literalStart);
    const callSlice = source.slice(buildCallIdx, buildCallIdx + 200);
    expect(callSlice).toContain('validationContext');
  });
});
