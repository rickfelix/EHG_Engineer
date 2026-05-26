/**
 * SD-FDBK-INFRA-ADD-PRD-DATABASE-001
 * Unit tests for the --content argument parser + payload loader.
 *
 * No subprocess spawn, no DB calls — purely testing the helper functions
 * exported by scripts/add-prd-to-database.js. Covers AC-1 (flag recognition),
 * AC-3 (file path mode), AC-4 (missing file error), AC-5 (stdin via mocked
 * fs.readFileSync(0)), AC-6/AC-7 (validation errors), and the 2MB payload cap.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  extractContentArg,
  loadContentPayload,
  validateContentPayloadShape,
  CONTENT_PAYLOAD_MAX_BYTES
} from '../../scripts/add-prd-to-database.js';

describe('extractContentArg', () => {
  it('returns undefined value when --content is absent (AC-8 backward compat)', () => {
    const r = extractContentArg(['SD-XXX-001', 'My Title']);
    expect(r.value).toBeUndefined();
    expect(r.remaining).toEqual(['SD-XXX-001', 'My Title']);
  });

  it('extracts --content <value> form (AC-1)', () => {
    const r = extractContentArg(['SD-XXX-001', '--content', '@./prd.json']);
    expect(r.value).toBe('@./prd.json');
    expect(r.remaining).toEqual(['SD-XXX-001']);
  });

  it('extracts --content=<value> form', () => {
    const r = extractContentArg(['SD-XXX-001', '--content=-']);
    expect(r.value).toBe('-');
    expect(r.remaining).toEqual(['SD-XXX-001']);
  });

  it('preserves positional args around --content', () => {
    const r = extractContentArg(['SD-XXX-001', 'Title', '--content', '@x.json', '--other']);
    expect(r.value).toBe('@x.json');
    expect(r.remaining).toEqual(['SD-XXX-001', 'Title', '--other']);
  });
});

describe('loadContentPayload', () => {
  let tmpFile;

  afterEach(() => {
    if (tmpFile && fs.existsSync(tmpFile)) {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
    tmpFile = null;
    vi.restoreAllMocks();
  });

  it('parses literal JSON object (AC-1)', () => {
    const payload = JSON.stringify({ executive_summary: 'x'.repeat(60), functional_requirements: [{ title: 'FR-1' }] });
    const out = loadContentPayload(payload);
    expect(out.executive_summary.length).toBe(60);
    expect(out.functional_requirements).toHaveLength(1);
  });

  it('reads file via @<path> (AC-3)', () => {
    tmpFile = path.join(os.tmpdir(), `prd-test-${Date.now()}.json`);
    const obj = { executive_summary: 'y'.repeat(60), functional_requirements: [{ title: 'A' }] };
    fs.writeFileSync(tmpFile, JSON.stringify(obj), 'utf8');
    const out = loadContentPayload('@' + tmpFile);
    expect(out.executive_summary).toBe(obj.executive_summary);
  });

  it('throws CONTENT_FILE_NOT_FOUND for missing path (AC-4)', () => {
    expect(() => loadContentPayload('@/nonexistent/path-' + Date.now() + '.json'))
      .toThrow(/file not found/);
  });

  it('throws CONTENT_INVALID_JSON for malformed JSON (AC-7)', () => {
    expect(() => loadContentPayload('{not: json}'))
      .toThrow(/INVALID_JSON/);
  });

  it('rejects non-object JSON (array / scalar) (AC-7)', () => {
    expect(() => loadContentPayload('[1,2,3]')).toThrow(/must be a JSON object/);
    expect(() => loadContentPayload('42')).toThrow(/must be a JSON object/);
  });

  it('rejects empty value', () => {
    expect(() => loadContentPayload('')).toThrow(/--content requires a value/);
    expect(() => loadContentPayload(undefined)).toThrow(/--content requires a value/);
  });

  it('reads stdin via "-" (AC-5)', () => {
    const obj = { executive_summary: 's'.repeat(60), functional_requirements: [{ title: 'B' }] };
    const original = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((target, opts) => {
      if (target === 0) return JSON.stringify(obj);
      return original.call(fs, target, opts);
    });
    const out = loadContentPayload('-');
    expect(out.executive_summary).toBe(obj.executive_summary);
  });

  it('rejects oversized literal payload (PAYLOAD_TOO_LARGE)', () => {
    const big = JSON.stringify({ blob: 'x'.repeat(CONTENT_PAYLOAD_MAX_BYTES + 100) });
    expect(() => loadContentPayload(big)).toThrow(/PAYLOAD_TOO_LARGE/);
  });

  it('rejects oversized file payload (PAYLOAD_TOO_LARGE)', () => {
    tmpFile = path.join(os.tmpdir(), `prd-big-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({ blob: 'x'.repeat(CONTENT_PAYLOAD_MAX_BYTES + 100) }), 'utf8');
    expect(() => loadContentPayload('@' + tmpFile)).toThrow(/PAYLOAD_TOO_LARGE/);
  });

  it('rejects empty file path (@)', () => {
    expect(() => loadContentPayload('@')).toThrow(/empty file path/);
  });
});

// QF-20260526-436: fail-fast shape pre-check for --content payloads.
describe('validateContentPayloadShape', () => {
  it('accepts a fully-shaped PRD payload (all keys correct types)', () => {
    const good = {
      functional_requirements: [{ id: 'FR-1', requirement: 'X', acceptance_criteria: ['Y'] }],
      technical_requirements: [{ id: 'TR-1', requirement: 'A', rationale: 'B' }],
      test_scenarios: [{ id: 'TS-1', test_type: 'unit', scenario: 'S' }],
      risks: [{ risk: 'R', mitigation: 'M' }],
      smoke_test_steps: [{ step_number: 1, instruction: 'I', expected_outcome: 'O' }],
      acceptance_criteria: ['AC-1'],
      strategic_objectives: ['SO-1'],
      key_changes: [{ change: 'C', impact: 'high' }],
      integration_operationalization: { consumers: 'X', dependencies: [], data_contracts: 'Y', runtime_config: 'Z', observability_rollout: 'O' },
      metadata: { evidence: 'ev-1' },
      system_architecture: { overview: 'O' },
      implementation_approach: { summary: 'S' }
    };
    expect(() => validateContentPayloadShape(good)).not.toThrow();
  });

  it('accepts an empty object (no keys to check)', () => {
    expect(() => validateContentPayloadShape({})).not.toThrow();
  });

  it('rejects top-level non-object (array)', () => {
    expect(() => validateContentPayloadShape([])).toThrow(/SHAPE_VIOLATION \(top-level\): expected object, got array/);
  });

  it('rejects top-level null', () => {
    expect(() => validateContentPayloadShape(null)).toThrow(/SHAPE_VIOLATION \(top-level\): expected object, got null/);
  });

  it('catches the exact bug that bit me: integration_operationalization as array', () => {
    const bad = { integration_operationalization: ['consumers', 'deps'] };
    expect(() => validateContentPayloadShape(bad)).toThrow(/\.integration_operationalization: expected object, got array/);
  });

  it('catches functional_requirements as strings instead of objects', () => {
    const bad = { functional_requirements: ['just a string', 'another'] };
    expect(() => validateContentPayloadShape(bad)).toThrow(/\.functional_requirements\[0\]: expected object, got string/);
  });

  it('catches risks as object instead of array', () => {
    const bad = { risks: { risk: 'R', mitigation: 'M' } };
    expect(() => validateContentPayloadShape(bad)).toThrow(/\.risks: expected array, got object/);
  });

  it('reports ALL violations in one throw (multi-key fix-in-one-pass UX)', () => {
    const bad = {
      integration_operationalization: [],
      risks: {},
      functional_requirements: ['s'],
    };
    let err;
    try { validateContentPayloadShape(bad); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.code).toBe('CONTENT_SHAPE_VIOLATION');
    expect(err.message).toMatch(/SHAPE_VIOLATIONS \(3\)/);
    expect(err.message).toMatch(/\.integration_operationalization/);
    expect(err.message).toMatch(/\.risks/);
    expect(err.message).toMatch(/\.functional_requirements/);
  });

  it('absent keys are not validated (only checks shape when present)', () => {
    expect(() => validateContentPayloadShape({ unrelated: 'key' })).not.toThrow();
  });

  it('null sub-value treated as wrong type (not as absent)', () => {
    const bad = { metadata: null };
    expect(() => validateContentPayloadShape(bad)).toThrow(/\.metadata: expected object, got null/);
  });
});
