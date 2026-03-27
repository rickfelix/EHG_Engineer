/**
 * Cross-Child Integration Gate — Unit Tests
 * SD-LEO-INFRA-CROSS-CHILD-INTEGRATION-001
 *
 * Tests contract extraction from deliverables_manifest and
 * cross-sibling mismatch detection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const MODULE_PATH = '../../../scripts/modules/handoff/executors/exec-to-plan/gates/cross-child-integration-gate.js';

describe('Cross-Child Integration Gate', () => {
  let extractContracts;
  let detectMismatches;
  let createCrossChildIntegrationGate;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const mod = await import(MODULE_PATH);
    extractContracts = mod.extractContracts;
    detectMismatches = mod.detectMismatches;
    createCrossChildIntegrationGate = mod.createCrossChildIntegrationGate;
  });

  describe('extractContracts', () => {
    it('extracts table names from SQL-like references', () => {
      const manifest = `
        - Deliverables: INSERT INTO eva_vision_documents
        - SELECT FROM eva_architecture_plans WHERE venture_id = ...
        - Updated strategic_directives_v2 status
      `;
      const result = extractContracts(manifest, 'SD-CHILD-A');
      expect(result.childKey).toBe('SD-CHILD-A');
      expect(result.tables.length).toBeGreaterThan(0);
      const tableNames = result.tables.map(t => t.name);
      expect(tableNames).toContain('eva_vision_documents');
      expect(tableNames).toContain('eva_architecture_plans');
      expect(tableNames).toContain('strategic_directives_v2');
    });

    it('extracts table names from prose references', () => {
      const manifest = `
        - Wrote records to sd_phase_handoffs table
        - Read from retrospectives table
      `;
      const result = extractContracts(manifest, 'SD-CHILD-B');
      const tableNames = result.tables.map(t => t.name);
      expect(tableNames).toContain('sd_phase_handoffs');
    });

    it('extracts column references', () => {
      const manifest = `
        - SET lifecycle_stage = 'S17'
        - WHERE venture_id = 123
      `;
      const result = extractContracts(manifest, 'SD-CHILD-C');
      const colNames = result.columns.map(c => c.column);
      expect(colNames).toContain('lifecycle_stage');
      expect(colNames).toContain('venture_id');
    });

    it('returns empty arrays for null/empty manifest', () => {
      expect(extractContracts(null, 'X').tables).toEqual([]);
      expect(extractContracts('', 'X').tables).toEqual([]);
      expect(extractContracts(undefined, 'X').tables).toEqual([]);
    });

    it('skips false positive short words', () => {
      const manifest = 'SET the all for and not';
      const result = extractContracts(manifest, 'X');
      const tableNames = result.tables.map(t => t.name);
      expect(tableNames).not.toContain('the');
      expect(tableNames).not.toContain('all');
      expect(tableNames).not.toContain('for');
    });

    it('infers write operation from INSERT context', () => {
      const manifest = 'INSERT INTO eva_vision_documents (venture_id, content)';
      const result = extractContracts(manifest, 'SD-W');
      const table = result.tables.find(t => t.name === 'eva_vision_documents');
      expect(table).toBeTruthy();
      expect(table.operations).toContain('write');
    });

    it('infers read operation from SELECT context', () => {
      const manifest = 'SELECT FROM eva_architecture_plans WHERE status = active';
      const result = extractContracts(manifest, 'SD-R');
      const table = result.tables.find(t => t.name === 'eva_architecture_plans');
      expect(table).toBeTruthy();
      expect(table.operations).toContain('read');
    });
  });

  describe('detectMismatches', () => {
    it('returns empty array for single child', () => {
      const contracts = [{ childKey: 'A', tables: [{ name: 'foo', operations: ['write'] }], columns: [{ column: 'bar', mentions: 1 }] }];
      expect(detectMismatches(contracts)).toEqual([]);
    });

    it('returns empty array for empty input', () => {
      expect(detectMismatches([])).toEqual([]);
    });

    it('detects multiple writers to same table', () => {
      const contracts = [
        { childKey: 'SD-A', tables: [{ name: 'eva_vision_documents', operations: ['write'] }], columns: [] },
        { childKey: 'SD-B', tables: [{ name: 'eva_vision_documents', operations: ['write'] }], columns: [] },
      ];
      const mismatches = detectMismatches(contracts);
      const multiWriter = mismatches.find(m => m.type === 'MULTIPLE_WRITERS');
      expect(multiWriter).toBeTruthy();
      expect(multiWriter.table).toBe('eva_vision_documents');
      expect(multiWriter.children).toContain('SD-A');
      expect(multiWriter.children).toContain('SD-B');
    });

    it('detects cross-child table dependency (writer + reader)', () => {
      const contracts = [
        { childKey: 'SD-A', tables: [{ name: 'eva_vision_documents', operations: ['write'] }], columns: [] },
        { childKey: 'SD-B', tables: [{ name: 'eva_vision_documents', operations: ['read'] }], columns: [] },
      ];
      const mismatches = detectMismatches(contracts);
      const dep = mismatches.find(m => m.type === 'CROSS_CHILD_TABLE_DEPENDENCY');
      expect(dep).toBeTruthy();
      expect(dep.writers).toContain('SD-A');
      expect(dep.readers).toContain('SD-B');
    });

    it('detects column name mismatch (canonical S17/S19 scenario)', () => {
      const contracts = [
        {
          childKey: 'SD-S17',
          tables: [{ name: 'eva_vision_documents', operations: ['write'] }],
          columns: [{ column: 'lifecycle_stage', mentions: 1 }],
        },
        {
          childKey: 'SD-S19',
          tables: [{ name: 'eva_vision_documents', operations: ['read'] }],
          columns: [{ column: 'stage_number', mentions: 1 }],
        },
      ];
      const mismatches = detectMismatches(contracts);
      const colMismatch = mismatches.find(m => m.type === 'COLUMN_NAME_MISMATCH');
      expect(colMismatch).toBeTruthy();
      expect(colMismatch.table).toBe('eva_vision_documents');
      expect(colMismatch.sharedWords).toContain('stage');
      expect(colMismatch.details).toContain('lifecycle_stage');
      expect(colMismatch.details).toContain('stage_number');
    });

    it('does not flag identical column names as mismatches', () => {
      const contracts = [
        {
          childKey: 'SD-A',
          tables: [{ name: 'test_table', operations: ['write'] }],
          columns: [{ column: 'venture_id', mentions: 1 }],
        },
        {
          childKey: 'SD-B',
          tables: [{ name: 'test_table', operations: ['read'] }],
          columns: [{ column: 'venture_id', mentions: 1 }],
        },
      ];
      const mismatches = detectMismatches(contracts);
      const colMismatch = mismatches.find(m => m.type === 'COLUMN_NAME_MISMATCH');
      expect(colMismatch).toBeUndefined();
    });

    it('handles 3+ children correctly', () => {
      const contracts = [
        { childKey: 'A', tables: [{ name: 'shared_table', operations: ['write'] }], columns: [{ column: 'col_name', mentions: 1 }] },
        { childKey: 'B', tables: [{ name: 'shared_table', operations: ['read'] }], columns: [{ column: 'col_name', mentions: 1 }] },
        { childKey: 'C', tables: [{ name: 'shared_table', operations: ['read'] }], columns: [{ column: 'col_name', mentions: 1 }] },
      ];
      const mismatches = detectMismatches(contracts);
      // Should not crash with 3 children; dependency detected
      expect(Array.isArray(mismatches)).toBe(true);
    });
  });

  describe('createCrossChildIntegrationGate', () => {
    it('returns gate with correct interface', () => {
      const mockSupabase = {};
      const gate = createCrossChildIntegrationGate(mockSupabase);
      expect(gate.name).toBe('CROSS_CHILD_INTEGRATION');
      expect(gate.required).toBe(false);
      expect(typeof gate.validator).toBe('function');
      expect(typeof gate.weight).toBe('number');
    });

    it('skips for non-orchestrator SD (no children)', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      };
      const gate = createCrossChildIntegrationGate(mockSupabase);
      const result = await gate.validator({ sd: { id: 'test-id', sd_key: 'SD-TEST' } });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.details.skipped).toBe(true);
    });
  });
});
