/**
 * Tests for Pipeline Flow Verifier
 * Part of SD-LEO-INFRA-INTEGRATION-AWARE-PRD-001 (FR-3, FR-4, FR-5)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  extractExports,
  extractImports,
  buildExportGraph,
  traceReachable,
  computeCoverage,
  verifyPipelineFlow,
  requiresPipelineFlowVerification,
  getEffectiveThreshold
} from '../../lib/pipeline-flow-verifier.js';

describe('Pipeline Flow Verifier', () => {
  describe('extractExports', () => {
    it('extracts named exports from a real file', () => {
      const testFile = path.join(process.cwd(), 'lib/eva/stage-zero/interfaces.js');
      if (!fs.existsSync(testFile)) return; // Skip if file doesn't exist

      const exports = extractExports(testFile);
      expect(exports).toContain('validatePathOutput');
      expect(exports).toContain('validateSynthesisInput');
      expect(exports).toContain('validateVentureBrief');
      expect(exports).toContain('createPathOutput');
    });

    it('returns empty array for non-existent file', () => {
      const exports = extractExports('/nonexistent/file.js');
      expect(exports).toEqual([]);
    });

    it('extracts default exports', () => {
      const tmpFile = path.join(process.cwd(), 'test/.tmp-export-test.js');
      fs.writeFileSync(tmpFile, 'export default function main() {}');
      try {
        const exports = extractExports(tmpFile);
        expect(exports).toContain('default');
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it('extracts re-exports', () => {
      const tmpFile = path.join(process.cwd(), 'test/.tmp-reexport-test.js');
      fs.writeFileSync(tmpFile, "export { foo, bar } from './module.js';\nexport * from './other.js';");
      try {
        const exports = extractExports(tmpFile);
        expect(exports).toContain('foo');
        expect(exports).toContain('bar');
        expect(exports.some(e => e.startsWith('*:'))).toBe(true);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });
  });

  describe('extractImports', () => {
    it('extracts named imports', () => {
      const tmpFile = path.join(process.cwd(), 'test/.tmp-import-test.js');
      fs.writeFileSync(tmpFile, "import { createClient } from '@supabase/supabase-js';\nimport { foo, bar } from './local.js';");
      try {
        const imports = extractImports(tmpFile);
        // Should find the local import
        const localImport = imports.find(i => i.module === './local.js');
        expect(localImport).toBeDefined();
        expect(localImport.names).toContain('foo');
        expect(localImport.names).toContain('bar');
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it('returns empty for non-existent file', () => {
      expect(extractImports('/nonexistent.js')).toEqual([]);
    });
  });

  describe('buildExportGraph', () => {
    it('builds a graph from real codebase files', () => {
      const files = [
        'lib/eva/stage-zero/index.js',
        'lib/eva/stage-zero/interfaces.js',
        'lib/eva/stage-zero/stage-zero-orchestrator.js'
      ];

      const graph = buildExportGraph(files, process.cwd());
      expect(graph.nodes.size).toBe(3);
      expect(graph.edges.length).toBeGreaterThanOrEqual(0);
    });

    it('handles empty file list', () => {
      const graph = buildExportGraph([], process.cwd());
      expect(graph.nodes.size).toBe(0);
      expect(graph.edges).toEqual([]);
    });
  });

  describe('traceReachable', () => {
    it('traces from entry point through imports', () => {
      const graph = {
        nodes: new Map([
          ['a.js', { exports: ['foo'], importedBy: [], isTestFile: false }],
          ['b.js', { exports: ['bar'], importedBy: ['a.js'], isTestFile: false }],
          ['c.js', { exports: ['baz'], importedBy: [], isTestFile: false }]
        ]),
        edges: [
          { from: 'a.js', to: 'b.js', names: ['bar'], type: 'static' }
        ]
      };

      const reachable = traceReachable(['a.js'], graph);
      expect(reachable.has('a.js')).toBe(true);
      expect(reachable.has('b.js')).toBe(true);
      expect(reachable.has('c.js')).toBe(false); // Not reachable from a.js
    });

    it('handles circular imports', () => {
      const graph = {
        nodes: new Map([
          ['a.js', { exports: ['foo'], importedBy: ['b.js'] }],
          ['b.js', { exports: ['bar'], importedBy: ['a.js'] }]
        ]),
        edges: [
          { from: 'a.js', to: 'b.js', names: ['bar'], type: 'static' },
          { from: 'b.js', to: 'a.js', names: ['foo'], type: 'static' }
        ]
      };

      const reachable = traceReachable(['a.js'], graph);
      expect(reachable.has('a.js')).toBe(true);
      expect(reachable.has('b.js')).toBe(true);
    });
  });

  describe('computeCoverage', () => {
    it('computes 100% for fully reachable graph', () => {
      const graph = {
        nodes: new Map([
          ['a.js', { exports: ['foo'], importedBy: [], isTestFile: false, isTypeOnly: false }],
          ['b.js', { exports: ['bar'], importedBy: ['a.js'], isTestFile: false, isTypeOnly: false }]
        ])
      };

      const reachable = new Set(['a.js', 'b.js']);
      const coverage = computeCoverage(graph, reachable);

      expect(coverage.coverage_score).toBe(1);
      expect(coverage.total_exports).toBe(2);
      expect(coverage.reachable_exports_count).toBe(2);
      expect(coverage.unreachable_exports).toEqual([]);
    });

    it('computes partial coverage', () => {
      const graph = {
        nodes: new Map([
          ['a.js', { exports: ['foo'], importedBy: [], isTestFile: false, isTypeOnly: false }],
          ['b.js', { exports: ['bar'], importedBy: [], isTestFile: false, isTypeOnly: false }]
        ])
      };

      const reachable = new Set(['a.js']);
      const coverage = computeCoverage(graph, reachable);

      expect(coverage.coverage_score).toBe(0.5);
      expect(coverage.unreachable_exports).toHaveLength(1);
      expect(coverage.unreachable_exports[0]).toEqual({ file: 'b.js', symbol: 'bar' });
    });

    it('excludes test files from coverage', () => {
      const graph = {
        nodes: new Map([
          ['a.js', { exports: ['foo'], importedBy: [], isTestFile: false, isTypeOnly: false }],
          ['a.test.js', { exports: ['testFoo'], importedBy: [], isTestFile: true, isTypeOnly: false }]
        ])
      };

      const reachable = new Set(['a.js']);
      const coverage = computeCoverage(graph, reachable);

      expect(coverage.total_exports).toBe(1); // Only a.js counted
      expect(coverage.coverage_score).toBe(1);
      expect(coverage.excluded_exports).toHaveLength(1);
    });

    it('excludes type-only files', () => {
      const graph = {
        nodes: new Map([
          ['a.js', { exports: ['foo'], importedBy: [], isTestFile: false, isTypeOnly: false }],
          ['a.d.ts', { exports: ['Foo'], importedBy: [], isTestFile: false, isTypeOnly: true }]
        ])
      };

      const reachable = new Set(['a.js']);
      const coverage = computeCoverage(graph, reachable);

      expect(coverage.total_exports).toBe(1);
      expect(coverage.coverage_score).toBe(1);
    });

    it('returns 1.0 when no exports exist', () => {
      const graph = { nodes: new Map() };
      const coverage = computeCoverage(graph, new Set());
      expect(coverage.coverage_score).toBe(1);
    });
  });

  describe('requiresPipelineFlowVerification', () => {
    it('returns true for code-producing types', () => {
      expect(requiresPipelineFlowVerification('feature')).toBe(true);
      expect(requiresPipelineFlowVerification('bugfix')).toBe(true);
      expect(requiresPipelineFlowVerification('refactor')).toBe(true);
    });

    it('returns false for non-code types', () => {
      expect(requiresPipelineFlowVerification('documentation')).toBe(false);
      expect(requiresPipelineFlowVerification('infrastructure')).toBe(false);
      expect(requiresPipelineFlowVerification('orchestrator')).toBe(false);
    });

    it('handles null', () => {
      expect(requiresPipelineFlowVerification(null)).toBe(false);
    });
  });

  describe('getEffectiveThreshold', () => {
    it('returns default threshold', () => {
      const threshold = getEffectiveThreshold();
      expect(threshold).toBeGreaterThan(0);
      expect(threshold).toBeLessThanOrEqual(1);
    });

    it('respects config override', () => {
      expect(getEffectiveThreshold({ threshold: 0.8 })).toBe(0.8);
    });
  });

  describe('verifyPipelineFlow', () => {
    it('returns skipped report when disabled', async () => {
      const origEnv = process.env.GATE_PIPELINE_FLOW_ENABLED;
      process.env.GATE_PIPELINE_FLOW_ENABLED = 'false';

      try {
        const report = await verifyPipelineFlow({ sdId: 'test' });
        expect(report.status).toBe('skipped');
        expect(report.sd_id).toBe('test');
      } finally {
        if (origEnv !== undefined) {
          process.env.GATE_PIPELINE_FLOW_ENABLED = origEnv;
        } else {
          delete process.env.GATE_PIPELINE_FLOW_ENABLED;
        }
      }
    });

    it('returns bypassed report when bypass flag set', async () => {
      const origBypass = process.env.PIPELINE_FLOW_BYPASS;
      const origReason = process.env.PIPELINE_FLOW_BYPASS_REASON;
      process.env.PIPELINE_FLOW_BYPASS = 'true';
      process.env.PIPELINE_FLOW_BYPASS_REASON = 'testing';

      try {
        const report = await verifyPipelineFlow({ sdId: 'test' });
        expect(report.status).toBe('bypassed');
        expect(report.bypass_reason).toBe('testing');
      } finally {
        if (origBypass !== undefined) {
          process.env.PIPELINE_FLOW_BYPASS = origBypass;
        } else {
          delete process.env.PIPELINE_FLOW_BYPASS;
        }
        if (origReason !== undefined) {
          process.env.PIPELINE_FLOW_BYPASS_REASON = origReason;
        } else {
          delete process.env.PIPELINE_FLOW_BYPASS_REASON;
        }
      }
    });

    it('produces a valid report on real codebase', async () => {
      const report = await verifyPipelineFlow({
        sdId: 'test-sd',
        stage: 'TEST',
        scopePaths: ['lib/eva/stage-zero'],
        threshold: 0.1 // Low threshold for test
      });

      expect(report.version).toBe('1.0.0');
      expect(report.sd_id).toBe('test-sd');
      expect(report.stage).toBe('TEST');
      expect(report.run_id).toMatch(/^pfv-/);
      expect(['pass', 'fail', 'skipped', 'timeout']).toContain(report.status);
      expect(typeof report.duration_ms).toBe('number');

      if (report.status === 'pass' || report.status === 'fail') {
        expect(typeof report.coverage_score).toBe('number');
        expect(report.coverage_score).toBeGreaterThanOrEqual(0);
        expect(report.coverage_score).toBeLessThanOrEqual(1);
        expect(typeof report.total_exports).toBe('number');
        expect(Array.isArray(report.unreachable_exports)).toBe(true);
      }
    });
  });
});
