import { describe, it, expect } from 'vitest';
import { extractDeliverables } from '../scripts/modules/handoff/gates/scope-completion-gate.js';

describe('extractDeliverables', () => {
  describe('file path extraction', () => {
    it('extracts whitespace-prefixed file paths', () => {
      const content = 'See lib/brainstorm/provider-rotation.js for details';
      const result = extractDeliverables(content);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'lib/brainstorm/provider-rotation.js',
        type: 'file'
      });
    });

    it('extracts backtick-wrapped file paths', () => {
      const content = 'Check `lib/foo/bar.js` for implementation';
      const result = extractDeliverables(content);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'lib/foo/bar.js',
        type: 'file'
      });
    });

    it('extracts paths at start of line', () => {
      const content = 'lib/utils/helper.ts\nscripts/setup.mjs';
      const result = extractDeliverables(content);
      expect(result).toHaveLength(2);
    });

    it('handles multiple paths in one line', () => {
      const content = 'Modify `scripts/handoff.js` and `lib/gate.js` files';
      const result = extractDeliverables(content);
      expect(result).toHaveLength(2);
    });

    it('deduplicates identical paths', () => {
      const content = 'See lib/foo.js and again lib/foo.js here';
      const result = extractDeliverables(content);
      expect(result).toHaveLength(1);
    });
  });

  describe('table name extraction', () => {
    it('rejects single-character table names', () => {
      const content = 'No new tables required for this change';
      const result = extractDeliverables(content);
      const tables = result.filter(d => d.type === 'table');
      expect(tables).toHaveLength(0);
    });

    it('rejects two-character table names', () => {
      const content = 'New table: ab';
      const result = extractDeliverables(content);
      const tables = result.filter(d => d.type === 'table');
      expect(tables).toHaveLength(0);
    });

    it('accepts valid table names (3+ chars)', () => {
      const content = 'New table: user_preferences';
      const result = extractDeliverables(content);
      const tables = result.filter(d => d.type === 'table');
      expect(tables).toHaveLength(1);
      expect(tables[0].checkPattern).toBe('user_preferences');
    });

    it('accepts CREATE TABLE syntax', () => {
      const content = 'CREATE TABLE audit_log (id serial PRIMARY KEY)';
      const result = extractDeliverables(content);
      const tables = result.filter(d => d.type === 'table');
      expect(tables).toHaveLength(1);
      expect(tables[0].checkPattern).toBe('audit_log');
    });

    it('accepts CREATE TABLE IF NOT EXISTS', () => {
      const content = 'CREATE TABLE IF NOT EXISTS sessions (id uuid)';
      const result = extractDeliverables(content);
      const tables = result.filter(d => d.type === 'table');
      expect(tables).toHaveLength(1);
      expect(tables[0].checkPattern).toBe('sessions');
    });
  });

  describe('function extraction', () => {
    it('extracts exported function names', () => {
      const content = 'Exports: validateScope(), checkDeliverable()';
      const result = extractDeliverables(content);
      const funcs = result.filter(d => d.type === 'function');
      expect(funcs).toHaveLength(2);
    });
  });

  describe('empty/null input', () => {
    it('returns empty array for null content', () => {
      expect(extractDeliverables(null)).toEqual([]);
    });

    it('returns empty array for empty string', () => {
      expect(extractDeliverables('')).toEqual([]);
    });

    it('returns empty array for content with no deliverables', () => {
      expect(extractDeliverables('Just some plain text here')).toEqual([]);
    });
  });
});
