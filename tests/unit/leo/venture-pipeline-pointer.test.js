/**
 * Tests for lib/leo/venture-pipeline-pointer.js
 * SD-LEO-INFRA-VENTURE-LIFECYCLE-PIPELINE-001 (FR-4 / TS-3, TS-4, TS-5).
 */
import { describe, it, expect } from 'vitest';
import {
  shouldShowVenturePipelinePointer,
  VENTURE_PIPELINE_POINTER,
} from '../../../lib/leo/venture-pipeline-pointer.js';

describe('shouldShowVenturePipelinePointer', () => {
  it('TS-3: true for an orchestrator SD', () => {
    expect(shouldShowVenturePipelinePointer({ sd_type: 'orchestrator' })).toBe(true);
  });

  it('TS-4: true for a venture SD (venture_id set)', () => {
    expect(shouldShowVenturePipelinePointer({ sd_type: 'infrastructure', venture_id: 'abc-123' })).toBe(true);
  });

  it('true when metadata.is_parent', () => {
    expect(shouldShowVenturePipelinePointer({ sd_type: 'feature', metadata: { is_parent: true } })).toBe(true);
  });

  it('TS-5: false for an ordinary non-venture infrastructure SD (no noise)', () => {
    expect(shouldShowVenturePipelinePointer({ sd_type: 'infrastructure', venture_id: null, metadata: {} })).toBe(false);
  });

  it('false for a plain feature SD', () => {
    expect(shouldShowVenturePipelinePointer({ sd_type: 'feature' })).toBe(false);
  });

  it('false for null / non-object', () => {
    expect(shouldShowVenturePipelinePointer(null)).toBe(false);
    expect(shouldShowVenturePipelinePointer(undefined)).toBe(false);
    expect(shouldShowVenturePipelinePointer('SD-X')).toBe(false);
  });
});

describe('VENTURE_PIPELINE_POINTER', () => {
  it('points to the CLAUDE_LEAD.md section and names the circuit-breaker rule', () => {
    expect(VENTURE_PIPELINE_POINTER).toContain('Venture Lifecycle Pipeline');
    expect(VENTURE_PIPELINE_POINTER).toContain('CIRCUIT-BREAKER');
    expect(VENTURE_PIPELINE_POINTER).toContain('brainstorm');
    expect(VENTURE_PIPELINE_POINTER).toMatch(/do NOT redesign/i);
  });
});
