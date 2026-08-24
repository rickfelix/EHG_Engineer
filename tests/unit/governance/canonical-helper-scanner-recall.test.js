// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — FR-8 / TS-20.
//
// The recall regression fixture for verifyHelperCoverage(). Before this SD the scanner matched only
// `.from('table').update(` on ONE physical line, and this codebase's dominant style splits the table
// name and the write verb across lines — so its recall on REAL lifecycle-column writers was ZERO,
// while all 16 of its findings were metadata/scope writes nobody was worried about. It read as a
// working guard for months.
//
// This file is deliberately SEPARATE from tests/unit/governance/canonical-helper-bypass-guard.test.js,
// which remains quarantined for an unrelated reason (its feedback -> emit-feedback.js row has 13
// unexempted sites; fixing that row is explicitly out of this SD's scope). Splitting the recall
// claim into its own file is what lets it run in CI today rather than waiting on that row.
//
// WHAT A GREEN RUN HERE DOES NOT MEAN: the scanner is ADVISORY, not enforcement. Enforcement for
// strategic_directives_v2's lifecycle columns is the DB-side canonical-writer choke. A green run
// here says "the lint can see the writers it claims to see" — nothing about whether any write is
// actually canonical.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyHelperCoverage } from '../../../scripts/lib/lead-precheck-helpers.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const scanRealRepo = (extra = {}) =>
  verifyHelperCoverage({
    helperFile: 'scripts/handoff.js',
    table: 'strategic_directives_v2',
    repoRoot: REPO_ROOT,
    budgetMs: 30_000,
    ...extra,
  });

const pathsIn = (evidence) => new Set((evidence.bypass_sites || []).map((s) => s.path));

describe('TS-20 — the repaired scanner sees the real lifecycle-column writers', () => {
  it('detects SDRepository.js — a MULTI-LINE Supabase chain it previously had 0% recall on', async () => {
    // The canonical writer's own repository class. Its `.from('strategic_directives_v2')` and
    // `.update(updateData)` are ~10 lines apart, and the payload is a variable rather than an
    // object literal — two independent reasons the old single-line regex could never match.
    const { evidence } = await scanRealRepo();
    const hit = (evidence.bypass_sites || []).find((s) =>
      s.path.endsWith('scripts/modules/handoff/db/SDRepository.js'),
    );
    expect(hit, 'SDRepository.js is still invisible to the scanner').toBeDefined();
    expect(hit.verb).toBe('update');
    expect(hit.multiline).toBe(true);
  }, 60_000);

  it('detects lib/sd-park.js — a RAW SQL writer no Supabase-chain matching could ever have seen', async () => {
    const { evidence } = await scanRealRepo();
    const hits = (evidence.bypass_sites || []).filter((s) => s.path.endsWith('lib/sd-park.js'));
    expect(hits.length, 'lib/sd-park.js is still invisible to the scanner').toBeGreaterThan(0);
    expect(hits.some((h) => h.axis === 'RAW_SQL')).toBe(true);
  }, 60_000);

  it('still finds the sites it always found — the repair is additive, not a replacement', async () => {
    // A "repair" that swapped one blind spot for another would satisfy both cases above while
    // quietly losing the single-line detections the scanner already had.
    const { evidence } = await scanRealRepo();
    const singleLine = (evidence.bypass_sites || []).filter((s) => !s.multiline && !s.raw_sql);
    expect(singleLine.length).toBeGreaterThan(0);
  }, 60_000);

  it('reports itself as advisory, so no consumer can mistake it for enforcement', async () => {
    const { evidence } = await scanRealRepo();
    expect(evidence.advisory).toBe(true);
  }, 60_000);

  it('scanned a real surface — a zero-file scan would report zero findings and read as green', async () => {
    const { evidence } = await scanRealRepo();
    expect(evidence.files_scanned).toBeGreaterThan(100);
  }, 60_000);
});

describe('FR-8 — the fix generalises beyond strategic_directives_v2', () => {
  // A minimal synthetic fixture against a THROWAWAY table name, per FR-8's own acceptance
  // criterion: it proves the multi-line and .rpc() detection are properties of the scanner rather
  // than of one hand-tuned table, without requiring the unrelated feedback row to be repaired first.
  let tmpRoot;

  const write = (rel, body) => {
    const abs = path.join(tmpRoot, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  };

  const scanFixture = (extra = {}) =>
    verifyHelperCoverage({
      helperFile: 'lib/throwaway-helper.js',
      table: 'zzz_throwaway_fixture_table',
      repoRoot: tmpRoot,
      ...extra,
    });

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'canon-scanner-'));
    write('lib/throwaway-helper.js', 'export function emit() {}\n');
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('a multi-line chain against an arbitrary table is detected', () => {
    write(
      'scripts/multiline-writer.js',
      [
        'export async function go(supabase) {',
        '  const payload = { status: 1 };',
        '  const { error } = await supabase',
        "    .from('zzz_throwaway_fixture_table')",
        '    .update(payload)',
        "    .eq('id', 1);",
        '  return error;',
        '}',
        '',
      ].join('\n'),
    );
    return scanFixture().then(({ evidence }) => {
      const hit = (evidence.bypass_sites || []).find((s) => s.path === 'scripts/multiline-writer.js');
      expect(hit).toBeDefined();
      expect(hit.multiline).toBe(true);
      expect(hit.verb).toBe('update');
    });
  });

  it('[TWO-SIDED] a multi-line READ against the same table is NOT flagged', () => {
    // Without this, a scanner that flagged every `.from(table)` regardless of verb would also pass
    // the case above — and an advisory lint that flags reads is one reviewers learn to ignore.
    write(
      'scripts/multiline-reader.js',
      [
        'export async function go(supabase) {',
        '  const { data } = await supabase',
        "    .from('zzz_throwaway_fixture_table')",
        "    .select('*')",
        "    .eq('id', 1);",
        '  return data;',
        '}',
        '',
      ].join('\n'),
    );
    return scanFixture().then(({ evidence }) => {
      expect(pathsIn(evidence).has('scripts/multiline-reader.js')).toBe(false);
    });
  });

  it('a write verb belonging to a DIFFERENT chain is not misattributed', () => {
    write(
      'scripts/two-chains.js',
      [
        'export async function go(supabase) {',
        "  const { data } = await supabase.from('zzz_throwaway_fixture_table').select('*');",
        '  await supabase',
        "    .from('some_other_table')",
        '    .update({ x: 1 });',
        '  return data;',
        '}',
        '',
      ].join('\n'),
    );
    return scanFixture().then(({ evidence }) => {
      expect(pathsIn(evidence).has('scripts/two-chains.js')).toBe(false);
    });
  });

  it('raw SQL against an arbitrary table is detected', () => {
    write(
      'lib/raw-sql-writer.js',
      [
        'export async function go(client) {',
        '  await client.query(`',
        '    UPDATE zzz_throwaway_fixture_table',
        '       SET status = $2',
        '     WHERE id = $1',
        '  `, [1, 2]);',
        '}',
        '',
      ].join('\n'),
    );
    return scanFixture().then(({ evidence }) => {
      const hit = (evidence.bypass_sites || []).find((s) => s.path === 'lib/raw-sql-writer.js');
      expect(hit).toBeDefined();
      expect(hit.axis).toBe('RAW_SQL');
    });
  });

  it('.rpc() writers are detected when the caller names them, and ONLY those', () => {
    write(
      'scripts/rpc-writer.js',
      [
        'export async function go(supabase) {',
        "  await supabase.rpc('fn_writes_the_throwaway_table', { p: 1 });",
        "  await supabase.rpc('fn_unrelated_rpc', { p: 2 });",
        '}',
        '',
      ].join('\n'),
    );
    return scanFixture({ rpcWriters: ['fn_writes_the_throwaway_table'] }).then(({ evidence }) => {
      const hits = (evidence.bypass_sites || []).filter((s) => s.axis === 'RPC_WRITE');
      expect(hits).toHaveLength(1);
      expect(hits[0].rpc_name).toBe('fn_writes_the_throwaway_table');
      expect(hits[0].path).toBe('scripts/rpc-writer.js');
    });
  });

  it('[TWO-SIDED] with no rpcWriters declared, PASS 4 reports nothing', () => {
    // PASS 4 is inert by default on purpose: a generic `.rpc(` sweep would flag hundreds of
    // unrelated calls. Asserting the default explicitly keeps that a stated design choice rather
    // than an accident nobody notices.
    write(
      'scripts/rpc-writer.js',
      ["export async function go(supabase) { await supabase.rpc('fn_writes_the_throwaway_table'); }", ''].join('\n'),
    );
    return scanFixture().then(({ evidence }) => {
      expect((evidence.bypass_sites || []).filter((s) => s.axis === 'RPC_WRITE')).toHaveLength(0);
    });
  });

  it('one site is reported ONCE even when several passes could claim it', () => {
    write(
      'scripts/single-line-writer.js',
      ["export async function go(s) { await s.from('zzz_throwaway_fixture_table').update({ a: 1 }); }", ''].join('\n'),
    );
    return scanFixture().then(({ evidence }) => {
      const hits = (evidence.bypass_sites || []).filter((s) => s.path === 'scripts/single-line-writer.js');
      expect(hits).toHaveLength(1);
      expect(hits[0].multiline).toBeUndefined(); // PASS 1 kept it, with the better snippet
    });
  });
});
