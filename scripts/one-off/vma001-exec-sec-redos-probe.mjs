#!/usr/bin/env node
/**
 * SECURITY probe runner for SD-LEO-INFRA-VERIFY-MIGRATION-APPLY-001 (EXEC).
 *
 * Measures catastrophic-backtracking (ReDoS) exposure of the two regex surfaces this SD adds to
 * scripts/verify-migration-apply-state.mjs -- FUNCTION_DEF_RE (via extractFunctionBodies) and
 * normalizeSqlBody's replace chain -- by executing them against pathological inputs 4x-20x larger
 * than any file in the real migration corpus, and recording wall-clock per case.
 *
 * Writes a machine-readable artifact; asserts nothing. The evidence writer hashes this file and
 * derives its verdict from these numbers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFunctionBodies, normalizeSqlBody } from '../verify-migration-apply-state.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(REPO_ROOT, '.artifacts', 'test-results', 'vma001-exec-sec-redos.json');
const N = 200000;

const CASES = [
  {
    id: 'fn_re_unterminated_no_as_tag',
    target: 'FUNCTION_DEF_RE',
    rationale: 'CREATE FUNCTION whose AS+dollar-tag never appears -> the lazy [\\s\\S]*? must scan to EOF',
    run: () => extractFunctionBodies(`CREATE OR REPLACE FUNCTION f() ${'a'.repeat(N)}`).size,
  },
  {
    id: 'fn_re_50_headers_each_scanning_20kb',
    target: 'FUNCTION_DEF_RE',
    rationale: '50 failing CREATE FUNCTION start positions x 20KB tail each (the O(k*n) worst case)',
    run: () => extractFunctionBodies(`CREATE FUNCTION f() ${'b'.repeat(20000)}`.repeat(50)).size,
  },
  {
    id: 'fn_re_as_then_200k_whitespace',
    target: 'FUNCTION_DEF_RE',
    rationale: 'forces maximal backtracking of the \\s* between AS and the dollar tag',
    run: () => extractFunctionBodies(`CREATE FUNCTION f() AS${' '.repeat(N)}x`).size,
  },
  {
    id: 'fn_re_200k_dollar_run',
    target: 'FUNCTION_DEF_RE',
    rationale: 'ambiguity probe for the ($[A-Za-z_]\\w*$|$$) alternation against a pure $ run',
    run: () => extractFunctionBodies(`CREATE FUNCTION f() AS ${'$'.repeat(N)}`).size,
  },
  {
    id: 'fn_re_named_tag_never_closed',
    target: 'FUNCTION_DEF_RE',
    rationale: 'named tag opens, indexOf() closer never found -> unbalanced fail-safe path',
    run: () => extractFunctionBodies(`CREATE FUNCTION f() AS $body$ ${'c '.repeat(N)}`).size,
  },
  {
    id: 'normalize_unterminated_block_comment_200k',
    target: 'normalizeSqlBody',
    rationale: 'lazy /\\*[\\s\\S]*?\\*/ with no terminator across 400KB',
    run: () => normalizeSqlBody(`/*${'c '.repeat(N)}`).length,
  },
  {
    id: 'normalize_400k_pure_whitespace',
    target: 'normalizeSqlBody',
    rationale: '\\s+ global replace over an all-matching input',
    run: () => normalizeSqlBody(' \n\t'.repeat(N)).length,
  },
  {
    id: 'normalize_200k_dashes',
    target: 'normalizeSqlBody',
    rationale: '--[^\\n]* line-comment rule against a 200K single-line dash run',
    run: () => normalizeSqlBody('-'.repeat(N)).length,
  },
  {
    id: 'normalize_live_prosrc_shaped_50k',
    target: 'normalizeSqlBody',
    rationale: 'realistic plpgsql body shape (the pg_proc.prosrc side), 50K statements',
    run: () => normalizeSqlBody('BEGIN\n  -- c\n  PERFORM 1; /* x */\nEND\n'.repeat(2000)).length,
  },
];

const results = CASES.map((c) => {
  const t0 = process.hrtime.bigint();
  let value = null; let error = null;
  try { value = c.run(); } catch (e) { error = e.message; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { id: c.id, target: c.target, rationale: c.rationale, ms: Number(ms.toFixed(3)), value, error };
});

const payload = {
  probe: 'redos',
  sd_key: 'SD-LEO-INFRA-VERIFY-MIGRATION-APPLY-001',
  measured_at: new Date().toISOString(),
  node: process.version,
  module_under_test: 'scripts/verify-migration-apply-state.mjs',
  input_scale_chars: { N, note: 'largest real migration file is far smaller; see corpus_max_bytes' },
  cases: results,
  max_ms: Math.max(...results.map((r) => r.ms)),
  any_error: results.some((r) => r.error),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`wrote ${OUT}`);
console.log(`max_ms=${payload.max_ms} cases=${results.length} errors=${payload.any_error}`);
