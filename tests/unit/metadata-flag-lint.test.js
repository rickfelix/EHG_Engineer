/**
 * Unit tests for metadata.is_* orphan/phantom flag lint.
 * SD-LEO-INFRA-LINT-METADATA-ORPHAN-001 — FR-7 / TS-1..TS-5, FR-3 FP guards, FR-4 allow-list.
 *
 * Pure-function tests (no fs/DB/network): exercise the exported classifier and the
 * JS/SQL extractors, plus regression cases for the three matcher accuracy fixes
 * (spread false-negative, governance_metadata suffix FP, jsonb return-payload FP).
 */
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  extractFromJs,
  extractFromSql,
  classifyFlags,
  loadAllowlist,
  CLASSIFICATIONS,
} from '../../scripts/lint/metadata-flag-lint.mjs';

const byFlag = (rows, flag) => rows.find((r) => r.flag === flag);

describe('classifyFlags (FR-1/FR-2 core classifier)', () => {
  it('TS-1: synthetic ORPHAN (writer, no reader) -> ORPHAN and fails', () => {
    const row = byFlag(classifyFlags({ is_orphan_x: 1 }, {}), 'is_orphan_x');
    expect(row.classification).toBe(CLASSIFICATIONS.ORPHAN);
    expect(row.fail).toBe(true);
  });

  it('TS-2: synthetic PHANTOM (reader, no writer) -> PHANTOM and fails', () => {
    const row = byFlag(classifyFlags({}, { is_phantom_x: 1 }), 'is_phantom_x');
    expect(row.classification).toBe(CLASSIFICATIONS.PHANTOM);
    expect(row.fail).toBe(true);
  });

  it('TS-3: synthetic HEALTHY (writer + reader) -> HEALTHY and passes', () => {
    const row = byFlag(classifyFlags({ is_h: 2 }, { is_h: 3 }), 'is_h');
    expect(row.classification).toBe(CLASSIFICATIONS.HEALTHY);
    expect(row.fail).toBe(false);
  });

  it('SCAFFOLDING-ONLY (neither) never fails', () => {
    // Not produced by the scanner, but the classifier must treat it as non-failing.
    const rows = classifyFlags(new Map(), new Map());
    expect(rows.length).toBe(0);
  });

  it('TS-4: allow-listed PHANTOM passes (still classified PHANTOM)', () => {
    const row = byFlag(classifyFlags({}, { is_p: 1 }, new Set(['is_p'])), 'is_p');
    expect(row.classification).toBe(CLASSIFICATIONS.PHANTOM);
    expect(row.allowlisted).toBe(true);
    expect(row.fail).toBe(false);
  });

  it('FR-2 AC: exit-fail iff an un-allow-listed ORPHAN/PHANTOM exists', () => {
    const rows = classifyFlags({ is_orphan_x: 1, is_h: 1 }, { is_phantom_x: 1, is_h: 1 });
    const failing = rows.filter((r) => r.fail).map((r) => r.flag).sort();
    expect(failing).toEqual(['is_orphan_x', 'is_phantom_x']);
    // HEALTHY never fails:
    expect(byFlag(rows, 'is_h').fail).toBe(false);
  });

  it('accepts plain objects or Maps for counts', () => {
    const m = byFlag(classifyFlags(new Map([['is_m', 1]]), new Map([['is_m', 1]])), 'is_m');
    expect(m.classification).toBe(CLASSIFICATIONS.HEALTHY);
  });
});

describe('extractFromJs (FR-3 metadata-scoped JS matching)', () => {
  it('counts is_x writes only inside a metadata object literal', () => {
    const src = `await sb.from('t').insert({ metadata: { is_real: true, note: 'x' } });`;
    const { writes } = extractFromJs(src);
    expect(writes.has('is_real')).toBe(true);
  });

  it('reads metadata?.is_x and metadata.is_x', () => {
    const src = `if (sd.metadata?.is_venture === true || other.metadata.is_thing) {}`;
    const { reads } = extractFromJs(src);
    expect(reads.has('is_venture')).toBe(true);
    expect(reads.has('is_thing')).toBe(true);
  });

  it('TS-5 FP: a non-metadata result object (details: { is_orchestrator: true }) is NOT a write', () => {
    const src = `const details = { is_orchestrator: true, kind: 'x' }; return details;`;
    const { writes } = extractFromJs(src);
    expect(writes.has('is_orchestrator')).toBe(false);
  });

  it('TS-5 FP: a plain column reference (sd.is_active) is NOT a metadata read', () => {
    const src = `if (sd.is_active && sd.is_working_on) doThing();`;
    const { reads } = extractFromJs(src);
    expect(reads.has('is_active')).toBe(false);
    expect(reads.has('is_working_on')).toBe(false);
  });

  it('regression: spread of an existing metadata value counts the new key (is_coordinator FN fix)', () => {
    const src = `const merged = { ...(row?.metadata || {}), is_coordinator: true, ts: now() };`;
    const { writes } = extractFromJs(src);
    expect(writes.has('is_coordinator')).toBe(true);
  });

  it('regression: { ...row.metadata, is_x } also counts', () => {
    const src = `return { ...row.metadata, is_flagged: true };`;
    expect(extractFromJs(src).writes.has('is_flagged')).toBe(true);
  });
});

describe('extractFromSql (FR-3 metadata-scoped SQL matching)', () => {
  it('reads metadata->> and metadata-> jsonb paths', () => {
    const src = `WHERE metadata->>'is_test' = 'true' OR metadata->'is_foo' IS NOT NULL`;
    const { reads } = extractFromSql(src);
    expect(reads.has('is_test')).toBe(true);
    expect(reads.has('is_foo')).toBe(true);
  });

  it('counts a metadata jsonb_build_object write', () => {
    const src = `UPDATE t SET metadata = jsonb_build_object('is_real', true);`;
    expect(extractFromSql(src).writes.has('is_real')).toBe(true);
  });

  it('counts jsonb_set path and jsonb object-literal writes', () => {
    const setSrc = `SELECT jsonb_set(metadata, '{is_sub_parent}', 'true');`;
    expect(extractFromSql(setSrc).writes.has('is_sub_parent')).toBe(true);
    const litSrc = `INSERT INTO t (metadata) VALUES ('{"is_seed": true}');`;
    expect(extractFromSql(litSrc).writes.has('is_seed')).toBe(true);
  });

  it('TS-5 FP: governance_metadata->> path is NOT a metadata read (word-boundary fix)', () => {
    const src = `WHERE governance_metadata->>'is_parent_change_history' = 'false'`;
    expect(extractFromSql(src).reads.has('is_parent_change_history')).toBe(false);
  });

  it('FP: a bare RETURN jsonb_build_object payload is NOT a metadata write (window-scope fix)', () => {
    const src = `IF x THEN RETURN jsonb_build_object('is_claimed', false, 'err', 'none'); END IF;`;
    expect(extractFromSql(src).writes.has('is_claimed')).toBe(false);
  });

  it('TS-5 FP: a plpgsql local var is_venture_agent is NOT a metadata flag', () => {
    const src = `DECLARE is_venture_agent boolean; BEGIN is_venture_agent := true; END;`;
    const { reads, writes } = extractFromSql(src);
    expect(reads.has('is_venture_agent')).toBe(false);
    expect(writes.has('is_venture_agent')).toBe(false);
  });
});

describe('loadAllowlist (FR-4)', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const liveAllowlist = path.resolve(__dirname, '../../scripts/lint/metadata-flag-allowlist.json');

  it('the shipped allow-list loads without errors (every entry has a reason)', () => {
    const { errors } = loadAllowlist(liveAllowlist);
    expect(errors).toEqual([]);
  });

  it('a missing file yields an empty allow-list, no error', () => {
    const { allow, errors } = loadAllowlist(path.resolve(__dirname, 'does-not-exist.json'));
    expect(allow.size).toBe(0);
    expect(errors).toEqual([]);
  });
});
