#!/usr/bin/env node
/**
 * Audit canonical writer surface for AI-provenance emission rate.
 *
 * Walks writer-surface directories, finds .insert(/.update( call sites,
 * counts how many emit a provenance_source-format-compliant value within
 * a small window of the call. Emits skills/PROVENANCE-EMISSION-REPORT.md
 * with top-3 lowest-coverage writers.
 *
 * SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-F (pattern mirrors sibling SD-E
 * scripts/pocock/audit-skill-bodies.mjs).
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT_REGEX, HUMAN_REGEX } from '../modules/pocock/provenance-flag.js';

const SCAN_ROOTS = [
  'scripts/modules/handoff',
  'scripts/pocock',
  'scripts/modules/validation'
];

const EXCLUDE_TABLES = new Set([
  'sd_phase_handoffs',
  'retrospectives',
  'sub_agent_execution_results'
]);

const CALL_REGEX = /\.(insert|update|upsert)\s*\(/g;
const TABLE_FROM_BEFORE = /\.from\s*\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g;
const PROV_LITERAL_REGEX = /provenance_source\s*:/;
const PROV_FORMAT_LITERAL = new RegExp(`(${AGENT_REGEX.source.slice(1, -1)})|(${HUMAN_REGEX.source.slice(1, -1)})`);

function parseArgs(argv) {
  const args = { root: process.cwd(), reportPath: null, json: false, write: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') args.root = argv[++i];
    else if (a === '--report-path') args.reportPath = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--no-write') args.write = false;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: audit-provenance-emission.mjs [--root <path>] [--report-path <path>] [--json] [--no-write]');
      process.exit(0);
    }
  }
  if (!args.reportPath) args.reportPath = path.join(args.root, 'skills', 'PROVENANCE-EMISSION-REPORT.md');
  return args;
}

async function listJsFiles(absDir) {
  let out = [];
  let entries;
  try { entries = await fsp.readdir(absDir, { withFileTypes: true }); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '__tests__') continue;
    const full = path.join(absDir, e.name);
    if (e.isDirectory()) out = out.concat(await listJsFiles(full));
    else if (e.isFile() && /\.(js|mjs|cjs)$/.test(e.name)) out.push(full);
  }
  return out;
}

function callArgSlice(content, callStart) {
  const openParen = content.indexOf('(', callStart);
  if (openParen === -1) return '';
  let depth = 0;
  let inStr = null;
  let escape = false;
  for (let i = openParen; i < Math.min(content.length, openParen + 4000); i++) {
    const ch = content[i];
    if (escape) { escape = false; continue; }
    if (inStr) {
      if (ch === '\\') escape = true;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) return content.slice(openParen, i + 1); }
  }
  return content.slice(openParen, Math.min(content.length, openParen + 600));
}

function analyzeFile(content) {
  let totalCalls = 0;
  let emitCalls = 0;
  let excludedCalls = 0;
  const tables = new Set();
  let m;
  CALL_REGEX.lastIndex = 0;
  while ((m = CALL_REGEX.exec(content)) !== null) {
    totalCalls++;
    const callStart = m.index;
    const before = content.slice(Math.max(0, callStart - 400), callStart);
    const argSlice = callArgSlice(content, callStart);
    TABLE_FROM_BEFORE.lastIndex = 0;
    let lastTable = null;
    let tm;
    while ((tm = TABLE_FROM_BEFORE.exec(before)) !== null) lastTable = tm[1];
    if (lastTable) tables.add(lastTable);
    if (lastTable && EXCLUDE_TABLES.has(lastTable)) {
      excludedCalls++;
      continue;
    }
    if (PROV_LITERAL_REGEX.test(argSlice) || PROV_FORMAT_LITERAL.test(argSlice)) {
      emitCalls++;
    }
  }
  return { totalCalls, emitCalls, excludedCalls, tables: [...tables] };
}

export async function runAudit(opts) {
  const args = { ...parseArgs([]), ...opts };
  const root = path.resolve(args.root);
  const rows = [];
  for (const rel of SCAN_ROOTS) {
    const abs = path.resolve(root, rel);
    const files = await listJsFiles(abs);
    for (const file of files) {
      const content = await fsp.readFile(file, 'utf8');
      const stats = analyzeFile(content);
      const relpath = path.relative(root, file).split(path.sep).join('/');
      const denominator = stats.totalCalls - stats.excludedCalls;
      const coverage_pct = denominator > 0 ? Math.round((stats.emitCalls / denominator) * 1000) / 10 : null;
      rows.push({
        path: relpath,
        total_call_sites: stats.totalCalls,
        excluded_call_sites: stats.excludedCalls,
        in_scope_call_sites: denominator,
        emit_count: stats.emitCalls,
        coverage_pct,
        tables: stats.tables.sort()
      });
    }
  }
  rows.sort((a, b) => a.path.localeCompare(b.path));
  const writersWithInScope = rows.filter(r => r.in_scope_call_sites > 0);
  const offenders = writersWithInScope.filter(r => (r.coverage_pct ?? 0) < 100);
  offenders.sort((a, b) => (a.coverage_pct ?? 0) - (b.coverage_pct ?? 0) || a.path.localeCompare(b.path));
  const top3 = offenders.slice(0, 3).map(r => ({
    writer_path: r.path,
    total_call_sites: r.total_call_sites,
    in_scope_call_sites: r.in_scope_call_sites,
    emit_count: r.emit_count,
    coverage_pct: r.coverage_pct,
    recommendation: r.emit_count === 0
      ? 'Wire readProvenanceFlag + formatAgent helpers into all in-scope INSERT/UPDATE call sites; keep kill-switch default OFF v1.'
      : 'Increase emission coverage on remaining in-scope call sites.'
  }));
  const totalInScope = writersWithInScope.reduce((s, r) => s + r.in_scope_call_sites, 0);
  const totalEmit = writersWithInScope.reduce((s, r) => s + r.emit_count, 0);
  const overall_coverage_pct = totalInScope > 0 ? Math.round((totalEmit / totalInScope) * 1000) / 10 : null;
  const summary = {
    total_writers_scanned: rows.length,
    writers_with_in_scope_calls: writersWithInScope.length,
    total_in_scope_call_sites: totalInScope,
    total_emit_call_sites: totalEmit,
    overall_coverage_pct,
    offender_count: offenders.length,
    excluded_tables: [...EXCLUDE_TABLES],
    top_offenders: top3
  };
  if (args.write) {
    await fsp.mkdir(path.dirname(args.reportPath), { recursive: true });
    await fsp.writeFile(args.reportPath, renderReport({ rows, summary, top3 }) + '\n', 'utf8');
  }
  return { rows, summary, top3 };
}

function renderReport({ rows, summary, top3 }) {
  const lines = [];
  lines.push('# Provenance Emission Audit Report');
  lines.push('');
  lines.push('AI-provenance writer-surface coverage audit per Pocock pattern (SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-F).');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total writer modules scanned: **${summary.total_writers_scanned}**`);
  lines.push(`- Writer modules with in-scope INSERT/UPDATE call sites: **${summary.writers_with_in_scope_calls}**`);
  lines.push(`- Total in-scope call sites: **${summary.total_in_scope_call_sites}**`);
  lines.push(`- Total provenance-emitting call sites: **${summary.total_emit_call_sites}**`);
  lines.push(`- Overall coverage: **${summary.overall_coverage_pct === null ? 'n/a' : summary.overall_coverage_pct + '%'}**`);
  lines.push(`- Offenders (coverage < 100%): **${summary.offender_count}**`);
  lines.push(`- Excluded tables (heterogeneous existing provenance fields preserved): ${summary.excluded_tables.map(t => '`' + t + '`').join(', ')}`);
  lines.push('');
  lines.push('## Top 3 Lowest-Coverage Writers');
  lines.push('');
  if (top3.length === 0) {
    lines.push('_None — all in-scope writer call sites emit provenance_source._');
  } else {
    lines.push('| Rank | Writer | In-Scope Calls | Emits | Coverage | Recommendation |');
    lines.push('|---:|--------|---------------:|------:|---------:|----------------|');
    top3.forEach((t, i) => {
      lines.push(`| ${i + 1} | \`${t.writer_path}\` | ${t.in_scope_call_sites} | ${t.emit_count} | ${t.coverage_pct ?? 'n/a'}% | ${t.recommendation} |`);
    });
  }
  lines.push('');
  lines.push('## Full Audit Table');
  lines.push('');
  lines.push('| Writer | Total Calls | Excluded | In-Scope | Emits | Coverage | Tables |');
  lines.push('|--------|------------:|---------:|---------:|------:|---------:|--------|');
  for (const r of rows) {
    if (r.total_call_sites === 0) continue;
    const cov = r.coverage_pct === null ? 'n/a' : r.coverage_pct + '%';
    const tables = r.tables.length > 0 ? r.tables.map(t => '`' + t + '`').join(', ') : '_(none)_';
    lines.push(`| \`${r.path}\` | ${r.total_call_sites} | ${r.excluded_call_sites} | ${r.in_scope_call_sites} | ${r.emit_count} | ${cov} | ${tables} |`);
  }
  lines.push('');
  lines.push('## Methodology');
  lines.push('');
  lines.push('Scans `scripts/modules/handoff/`, `scripts/pocock/`, and `scripts/modules/validation/` for `.insert(`, `.update(`, and `.upsert(` call sites.');
  lines.push('A call site is **in-scope** when its preceding `.from("<table>")` clause references a table NOT in the EXCLUDE_TABLES set.');
  lines.push('A call site **emits** provenance when either the literal `provenance_source:` key OR a string matching the agent/human format regex appears within the 600 chars following the call.');
  lines.push('Phase 1 is warn-only: this report is informational. Phase 2 cutover criteria are defined in the parent SD metadata.');
  lines.push('');
  lines.push('Generator: `scripts/pocock/audit-provenance-emission.mjs`');
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runAudit(args);
  const statusStream = args.json ? process.stderr : process.stdout;
  if (args.json) {
    process.stdout.write(JSON.stringify(result.summary, null, 2) + '\n');
  } else {
    statusStream.write(`Provenance emission audit: ${result.summary.writers_with_in_scope_calls} writers scanned, overall coverage ${result.summary.overall_coverage_pct === null ? 'n/a' : result.summary.overall_coverage_pct + '%'}, ${result.summary.offender_count} offender(s).\n`);
    result.top3.forEach((t, i) => statusStream.write(`  ${i + 1}. ${t.writer_path} — ${t.coverage_pct ?? 'n/a'}% (${t.emit_count}/${t.in_scope_call_sites})\n`));
  }
  if (args.write) statusStream.write(`Report written: ${path.relative(process.cwd(), args.reportPath)}\n`);
  process.exit(0);
}

const isMain = (() => { try { return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]); } catch { return false; } })();
if (isMain) main().catch(err => { console.error('audit-provenance-emission failed:', err); process.exit(0); });
