/**
 * Tests for vision gap insights injection
 * SD-LEO-INFRA-VISION-PROTOCOL-FEEDBACK-001
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock all heavy dependencies before importing
vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));
vi.mock('fs', () => ({ default: { existsSync: vi.fn(() => true), readFileSync: vi.fn(() => '{}'), writeFileSync: vi.fn() }, existsSync: vi.fn(() => true), readFileSync: vi.fn(() => '{}'), writeFileSync: vi.fn() }));
vi.mock('child_process', () => ({ execSync: vi.fn(() => 'abc12345') }));

let generateLead, generateExec;

beforeAll(async () => {
  const mod = await import('../../../scripts/modules/claude-md-generator/file-generators.js');
  generateLead = mod.generateLead;
  generateExec = mod.generateExec;
});

const MOCK_DATA_BASE = {
  protocol: {
    id: 'p1', version: '4.3.3',
    sections: [],
    updated_at: '2026-02-19T00:00:00Z',
    name: 'LEO'
  },
  autonomousDirectives: [],
  schemaConstraints: [],
  processScripts: [],
  agents: [],
  subAgents: [],
};

const MOCK_GAPS = [
  { pattern_id: 'VGAP-A04', issue_summary: 'event_rounds_priority_queue_work_routing', category: 'infrastructure', severity: 'high' },
  { pattern_id: 'VGAP-V05', issue_summary: 'cross_stage_data_contracts', category: 'infrastructure', severity: 'critical' },
];

describe('generateLead — vision gap injection', () => {
  it('injects Current Vision Gaps section when visionGapInsights has entries', () => {
    const output = generateLead({ ...MOCK_DATA_BASE, visionGapInsights: MOCK_GAPS }, {});
    expect(output).toContain('Current Vision Gaps');
    expect(output).toContain('VGAP-A04');
    expect(output).toContain('VGAP-V05');
    expect(output).toContain('HIGH');
    expect(output).toContain('CRITICAL');
  });

  it('omits Current Vision Gaps section when visionGapInsights is empty', () => {
    const output = generateLead({ ...MOCK_DATA_BASE, visionGapInsights: [] }, {});
    expect(output).not.toContain('Current Vision Gaps');
    expect(output).not.toContain('VGAP-');
  });

  it('omits section when visionGapInsights is absent (backward compat)', () => {
    const output = generateLead({ ...MOCK_DATA_BASE }, {});
    expect(output).not.toContain('Current Vision Gaps');
  });

  it('contains standard LEAD header fields regardless of gaps', () => {
    const output = generateLead({ ...MOCK_DATA_BASE, visionGapInsights: MOCK_GAPS }, {});
    expect(output).toContain('CLAUDE_LEAD.md - LEAD Phase Operations');
    expect(output).toContain('LEO 4.3.3');
  });
});

describe('generateExec — implementation reminders injection', () => {
  it('injects Implementation Reminders section when visionGapInsights has entries', () => {
    const output = generateExec({ ...MOCK_DATA_BASE, visionGapInsights: MOCK_GAPS }, {});
    expect(output).toContain('Implementation Reminders');
    expect(output).toContain('VGAP-A04');
    expect(output).toContain('event_rounds_priority_queue_work_routing');
  });

  it('omits Implementation Reminders section when visionGapInsights is empty', () => {
    const output = generateExec({ ...MOCK_DATA_BASE, visionGapInsights: [] }, {});
    expect(output).not.toContain('Implementation Reminders');
  });

  it('omits section when visionGapInsights is absent (backward compat)', () => {
    const output = generateExec({ ...MOCK_DATA_BASE }, {});
    expect(output).not.toContain('Implementation Reminders');
  });

  it('contains standard EXEC header fields regardless of gaps', () => {
    const output = generateExec({ ...MOCK_DATA_BASE, visionGapInsights: MOCK_GAPS }, {});
    expect(output).toContain('CLAUDE_EXEC.md - EXEC Phase Operations');
    expect(output).toContain('LEO 4.3.3');
  });
});
