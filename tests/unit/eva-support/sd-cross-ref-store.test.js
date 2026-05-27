/**
 * Unit tests for lib/eva-support/sd-cross-ref-store.js — SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C
 * FR-2 (entry shape, jsonb concatenation, no auto-primary).
 *
 * Covers:
 *   - validateEntry(): all field validations (sd_id, source, confidence, evidence_substring, status).
 *   - appendSDRef(): jsonb concat semantics + null-safe handling + no full-row replace.
 *   - readSDRefs(): returns raw array, optional status filter.
 *   - Static-source invariants (T1 + T7 boundaries, no SELECT *).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  validateEntry,
  appendSDRef,
  readSDRefs,
  __testHooks,
  SDCrossRefValidationError,
} from '../../../lib/eva-support/sd-cross-ref-store.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = resolve(HERE, '../../../lib/eva-support/sd-cross-ref-store.js');

describe('sd-cross-ref-store — static source invariants', () => {
  const source = readFileSync(MODULE_PATH, 'utf8');

  it('T1 boundary: no child_process / execa / spawn imports', () => {
    expect(source).not.toMatch(/from\s+['"]child_process['"]/);
    expect(source).not.toMatch(/from\s+['"]execa['"]/);
    expect(source).not.toMatch(/spawn\s*\(/);
  });

  it('T7 boundary: no decision-log-store write imports', () => {
    expect(source).not.toMatch(/from\s+['"][^'"]*decision-log-store(?:\.js)?['"]/);
    expect(source).not.toMatch(/insertEntry/);
  });

  it('FR-2: no SELECT * call', () => {
    expect(source).not.toMatch(/select\(\s*['"]\*['"]\s*\)/);
  });

  it('FR-2: writes target only the eva_todoist_intake table', () => {
    // No writes to strategic_directives_v2 or other tables.
    const writeOps = source.match(/\.from\(\s*['"]([^'"]+)['"]\s*\)/g) || [];
    for (const op of writeOps) {
      expect(op).toContain('eva_todoist_intake');
    }
  });
});

describe('validateEntry()', () => {
  function validEntry() {
    return {
      sd_id: '11111111-2222-3333-4444-555555555555',
      source: 'eva_cross_ref',
      confidence: 75,
      evidence_substring: 'Stripe checkout',
      status: 'active',
    };
  }

  it('accepts a fully valid entry', () => {
    expect(() => validateEntry(validEntry())).not.toThrow();
  });

  it('accepts entry without optional status field', () => {
    const e = validEntry();
    delete e.status;
    expect(() => validateEntry(e)).not.toThrow();
  });

  it('rejects null / non-object entry', () => {
    expect(() => validateEntry(null)).toThrow(SDCrossRefValidationError);
    expect(() => validateEntry(undefined)).toThrow(SDCrossRefValidationError);
    expect(() => validateEntry('string')).toThrow(SDCrossRefValidationError);
  });

  it('rejects missing/empty sd_id', () => {
    expect(() => validateEntry({ ...validEntry(), sd_id: '' })).toThrow(/sd_id/);
    expect(() => validateEntry({ ...validEntry(), sd_id: '   ' })).toThrow(/sd_id/);
    expect(() => validateEntry({ ...validEntry(), sd_id: undefined })).toThrow(/sd_id/);
  });

  it('rejects invalid source enum', () => {
    expect(() => validateEntry({ ...validEntry(), source: 'unknown_source' })).toThrow(/source must be one of/);
  });

  it('rejects out-of-range confidence', () => {
    expect(() => validateEntry({ ...validEntry(), confidence: -1 })).toThrow(/confidence/);
    expect(() => validateEntry({ ...validEntry(), confidence: 101 })).toThrow(/confidence/);
    expect(() => validateEntry({ ...validEntry(), confidence: '75' })).toThrow(/confidence/);
  });

  it('rejects too-short evidence_substring (<5 chars)', () => {
    expect(() => validateEntry({ ...validEntry(), evidence_substring: 'abc' })).toThrow(/evidence_substring/);
    expect(() => validateEntry({ ...validEntry(), evidence_substring: '' })).toThrow(/evidence_substring/);
  });

  it('accepts evidence_substring exactly 5 chars', () => {
    expect(() => validateEntry({ ...validEntry(), evidence_substring: 'abcde' })).not.toThrow();
  });

  it('rejects invalid status enum if provided', () => {
    expect(() => validateEntry({ ...validEntry(), status: 'pending' })).toThrow(/status/);
  });
});

describe('appendSDRef()', () => {
  function makeClient({ initialRefs = [], shouldReadError = false, shouldWriteError = false } = {}) {
    const calls = [];
    const client = {
      from: vi.fn((table) => {
        calls.push({ op: 'from', table });
        const chain = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.update = vi.fn((row) => {
          calls.push({ op: 'update', row });
          return chain;
        });
        chain.maybeSingle = vi.fn(() => {
          if (calls.find((c) => c.op === 'update')) {
            // After update
            if (shouldWriteError) return Promise.resolve({ data: null, error: new Error('write fail') });
            const lastUpdate = [...calls].reverse().find((c) => c.op === 'update');
            return Promise.resolve({ data: { sd_refs: lastUpdate.row.sd_refs }, error: null });
          }
          // Read
          if (shouldReadError) return Promise.resolve({ data: null, error: new Error('read fail') });
          return Promise.resolve({ data: { id: 'intake-1', sd_refs: initialRefs }, error: null });
        });
        return chain;
      }),
    };
    return { client, calls };
  }

  it('appends a new entry to an empty sd_refs array', async () => {
    const { client, calls } = makeClient({ initialRefs: [] });
    const result = await appendSDRef({
      intakeRowId: 'intake-1',
      entry: {
        sd_id: '11111111-2222-3333-4444-555555555555',
        source: 'eva_cross_ref',
        confidence: 80,
        evidence_substring: 'matches well',
      },
      client,
    });
    expect(result.appended).toBe(true);
    expect(result.sd_refs_after).toHaveLength(1);
    expect(result.sd_refs_after[0].sd_id).toBe('11111111-2222-3333-4444-555555555555');
    // Default status applied
    expect(result.sd_refs_after[0].status).toBe('active');
  });

  it('appends to an existing array without clobbering prior entries', async () => {
    const prior = [
      {
        sd_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        source: 'chairman_manual',
        confidence: 100,
        evidence_substring: 'previous match',
        status: 'active',
      },
    ];
    const { client, calls } = makeClient({ initialRefs: prior });
    const result = await appendSDRef({
      intakeRowId: 'intake-1',
      entry: {
        sd_id: '11111111-2222-3333-4444-555555555555',
        source: 'eva_cross_ref',
        confidence: 60,
        evidence_substring: 'newer match',
      },
      client,
    });
    expect(result.sd_refs_after).toHaveLength(2);
    expect(result.sd_refs_after[0]).toEqual(prior[0]);
    expect(result.sd_refs_after[1].sd_id).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('returns appended:false when intake row not found', async () => {
    const client = {
      from: vi.fn(() => {
        const chain = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
        return chain;
      }),
    };
    const result = await appendSDRef({
      intakeRowId: 'missing-row',
      entry: {
        sd_id: '11111111-2222-3333-4444-555555555555',
        source: 'eva_cross_ref',
        confidence: 50,
        evidence_substring: 'evidence here',
      },
      client,
    });
    expect(result.appended).toBe(false);
    expect(result.error.message).toMatch(/intake row.*not found/);
  });

  it('throws SDCrossRefValidationError on invalid entry BEFORE any DB call', async () => {
    const client = { from: vi.fn(() => ({})) };
    await expect(
      appendSDRef({
        intakeRowId: 'intake-1',
        entry: { sd_id: '', source: 'eva_cross_ref', confidence: 50, evidence_substring: 'short' },
        client,
      })
    ).rejects.toThrow(SDCrossRefValidationError);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('uses jsonb concatenation pattern — UPDATE writes the full array (never partial)', async () => {
    const { client, calls } = makeClient({ initialRefs: [{ sd_id: 'old-1', source: 'eva_cross_ref', confidence: 50, evidence_substring: 'old evidence', status: 'active' }] });
    await appendSDRef({
      intakeRowId: 'intake-1',
      entry: { sd_id: '11111111-2222-3333-4444-555555555555', source: 'eva_cross_ref', confidence: 70, evidence_substring: 'new evidence' },
      client,
    });
    const updateCall = calls.find((c) => c.op === 'update');
    expect(updateCall.row.sd_refs).toHaveLength(2);
    // First entry preserved (no clobber).
    expect(updateCall.row.sd_refs[0].sd_id).toBe('old-1');
  });
});

describe('readSDRefs()', () => {
  function makeReadClient(refs) {
    return {
      from: vi.fn(() => {
        const chain = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { sd_refs: refs }, error: null }));
        return chain;
      }),
    };
  }

  it('returns raw array', async () => {
    const refs = [{ sd_id: 'a', source: 'eva_cross_ref', confidence: 80, evidence_substring: 'aaa-evidence' }];
    const client = makeReadClient(refs);
    const result = await readSDRefs({ intakeRowId: 'intake-1', client });
    expect(result).toEqual(refs);
  });

  it('filters by status when statusFilter is provided', async () => {
    const refs = [
      { sd_id: 'a', source: 'eva_cross_ref', confidence: 80, evidence_substring: 'aaa-evidence', status: 'active' },
      { sd_id: 'b', source: 'eva_cross_ref', confidence: 50, evidence_substring: 'bbb-evidence', status: 'rejected' },
      { sd_id: 'c', source: 'eva_cross_ref', confidence: 70, evidence_substring: 'ccc-evidence' }, // status defaults to active
    ];
    const client = makeReadClient(refs);
    const active = await readSDRefs({ intakeRowId: 'intake-1', client, statusFilter: 'active' });
    expect(active).toHaveLength(2);
    expect(active.map((r) => r.sd_id)).toEqual(['a', 'c']);
    const rejected = await readSDRefs({ intakeRowId: 'intake-1', client, statusFilter: 'rejected' });
    expect(rejected).toHaveLength(1);
    expect(rejected[0].sd_id).toBe('b');
  });

  it('returns [] when row not found', async () => {
    const client = {
      from: vi.fn(() => {
        const chain = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
        return chain;
      }),
    };
    const result = await readSDRefs({ intakeRowId: 'missing', client });
    expect(result).toEqual([]);
  });
});

describe('__testHooks', () => {
  it('exports frozen constants', () => {
    expect(__testHooks.VALID_SOURCES).toEqual(['eva_cross_ref', 'chairman_manual']);
    expect(__testHooks.VALID_STATUSES).toEqual(['active', 'rejected']);
    expect(__testHooks.MIN_EVIDENCE_LENGTH).toBe(5);
    expect(__testHooks.MAX_CONFIDENCE).toBe(100);
    expect(__testHooks.MIN_CONFIDENCE).toBe(0);
    expect(Object.isFrozen(__testHooks)).toBe(true);
  });
});
