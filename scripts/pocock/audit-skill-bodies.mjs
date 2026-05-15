#!/usr/bin/env node
/**
 * Progressive-disclosure skill body audit.
 *
 * Walks three audit paths (skills/**\/SKILL.md, .claude/commands/*.md, .claude/skills/*.md),
 * counts body LOC after BOM strip + frontmatter-fenced strip + HTML-comment strip + CRLF normalize,
 * emits skills/SKILL-BODY-AUDIT-REPORT.md and a top-3 offender list.
 *
 * SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-E
 *
 * Threshold: body_loc > 200 (strict). exit 0 always (warn-only Phase 1).
 *
 * CLI: node scripts/pocock/audit-skill-bodies.mjs [--root <path>] [--report-path <path>] [--json] [--no-write] [--threshold <N>]
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_SKILL_BODY_LOC = 200;

const AUDIT_GLOBS = [
  { scope_root: 'skills', dir: 'skills', pattern: /[\\/]SKILL\.md$/, recursive: true },
  { scope_root: 'commands', dir: '.claude/commands', pattern: /\.md$/, recursive: false },
  { scope_root: 'skills_stubs', dir: '.claude/skills', pattern: /\.md$/, recursive: false }
];

const EXCLUDE_DIR_SEGMENTS = new Set(['node_modules', '.git', 'archived']);

const FRONTMATTER_FENCED_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
const HTML_REASONING_COMMENT_RE = /<!--\s*reasoning_effort:[^>]*-->/g;
const BOM_RE = /^﻿/;

function parseArgs(argv) {
  const args = { root: process.cwd(), reportPath: null, json: false, write: true, threshold: MAX_SKILL_BODY_LOC };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') args.root = argv[++i];
    else if (a === '--report-path') args.reportPath = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--no-write') args.write = false;
    else if (a === '--threshold') args.threshold = Number(argv[++i]);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: audit-skill-bodies.mjs [--root <path>] [--report-path <path>] [--json] [--no-write] [--threshold <N>]');
      process.exit(0);
    }
  }
  if (!args.reportPath) args.reportPath = path.join(args.root, 'skills', 'SKILL-BODY-AUDIT-REPORT.md');
  return args;
}

export function computeBodyLoc(raw) {
  let s = raw.replace(BOM_RE, '');
  s = s.replace(FRONTMATTER_FENCED_RE, '');
  s = s.replace(HTML_REASONING_COMMENT_RE, '');
  const lines = s.split(/\r?\n/);
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.length;
}

async function listDirFiles(absDir, recursive) {
  let out = [];
  let entries;
  try { entries = await fsp.readdir(absDir, { withFileTypes: true }); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (EXCLUDE_DIR_SEGMENTS.has(e.name)) continue;
    const full = path.join(absDir, e.name);
    if (e.isDirectory() && recursive) {
      out = out.concat(await listDirFiles(full, recursive));
    } else if (e.isFile() || e.isSymbolicLink()) {
      out.push(full);
    }
  }
  return out;
}

async function discoverFiles(root) {
  const rows = [];
  for (const g of AUDIT_GLOBS) {
    const absDir = path.resolve(root, g.dir);
    const files = await listDirFiles(absDir, g.recursive);
    for (const abs of files) {
      if (!g.pattern.test(abs)) continue;
      const real = await fsp.realpath(abs).catch(() => abs);
      const rootReal = await fsp.realpath(root).catch(() => root);
      if (!real.startsWith(rootReal)) continue;
      rows.push({ abs, scope_root: g.scope_root, relpath: path.relative(root, abs).split(path.sep).join('/') });
    }
  }
  rows.sort((a, b) => a.relpath.localeCompare(b.relpath));
  return rows;
}

async function countSupportingDocs(filePath, scopeRoot) {
  if (scopeRoot !== 'skills') return 0;
  const dir = path.dirname(filePath);
  const siblings = await fsp.readdir(dir).catch(() => []);
  return siblings.filter(n => n !== 'SKILL.md' && n.endsWith('.md')).length;
}

function recommendationFor(row, threshold) {
  if (row.body_loc > threshold) {
    return `Refactor body to <=100 LOC; extract instructions to supporting doc adjacent to file.`;
  }
  if (row.scope_root === 'skills' && row.supporting_doc_count > 0 && (row.body_loc + row.supporting_doc_count * 100) > 1000) {
    return `Body compliant; review supporting-doc bloat (${row.supporting_doc_count} docs in skill dir).`;
  }
  return 'Compliant.';
}

export async function runAudit(opts) {
  const args = typeof opts === 'string' ? parseArgs(opts.split(/\s+/)) : { ...parseArgs([]), ...opts };
  const root = path.resolve(args.root);
  const files = await discoverFiles(root);
  const rows = [];
  for (const f of files) {
    const raw = await fsp.readFile(f.abs, 'utf8');
    const body_loc = computeBodyLoc(raw);
    const supporting_doc_count = await countSupportingDocs(f.abs, f.scope_root);
    const row = {
      path: f.relpath,
      scope_root: f.scope_root,
      body_loc,
      supporting_doc_count,
      threshold: args.threshold,
      overage: Math.max(0, body_loc - args.threshold),
      status: body_loc > args.threshold ? 'OFFENDER' : 'COMPLIANT'
    };
    row.recommendation = recommendationFor(row, args.threshold);
    rows.push(row);
  }
  const offenders = rows.filter(r => r.status === 'OFFENDER');
  offenders.sort((a, b) => (b.body_loc - a.body_loc) || a.path.localeCompare(b.path));
  const top3 = offenders.slice(0, 3);
  const summary = {
    total_files: rows.length,
    total_body_loc: rows.reduce((s, r) => s + r.body_loc, 0),
    offender_count: offenders.length,
    threshold: args.threshold,
    top_offenders: top3.map(t => ({
      path: t.path, body_loc: t.body_loc, supporting_doc_count: t.supporting_doc_count,
      threshold: t.threshold, overage: t.overage, recommendation: t.recommendation, scope_root: t.scope_root
    }))
  };
  if (args.write) {
    await fsp.mkdir(path.dirname(args.reportPath), { recursive: true });
    await fsp.writeFile(args.reportPath, renderReport({ rows, summary, top3 }) + '\n', 'utf8');
  }
  return { rows, summary, top3 };
}

function renderReport({ rows, summary, top3 }) {
  const lines = [];
  lines.push('# Skill Body Audit Report');
  lines.push('');
  lines.push('Progressive-disclosure body-LOC audit per Pocock pattern (SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-E).');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total files audited: **${summary.total_files}**`);
  lines.push(`- Total body LOC: **${summary.total_body_loc}**`);
  lines.push(`- Threshold: body_loc > ${summary.threshold} LOC`);
  lines.push(`- Offenders: **${summary.offender_count}**`);
  lines.push('');
  lines.push('## Top 3 Offenders');
  lines.push('');
  if (top3.length === 0) {
    lines.push('_None — all skill bodies are within threshold._');
  } else {
    lines.push('| Rank | Path | Body LOC | Overage | Recommendation |');
    lines.push('|---:|------|--------:|--------:|----------------|');
    top3.forEach((t, i) => {
      lines.push(`| ${i + 1} | \`${t.path}\` | ${t.body_loc} | +${t.overage} | ${t.recommendation} |`);
    });
  }
  lines.push('');
  lines.push('## Full Audit Table');
  lines.push('');
  lines.push('| Path | Scope | Body LOC | Status | Supporting Docs |');
  lines.push('|------|-------|--------:|--------|----------------:|');
  for (const r of rows) {
    lines.push(`| \`${r.path}\` | ${r.scope_root} | ${r.body_loc} | ${r.status} | ${r.supporting_doc_count} |`);
  }
  lines.push('');
  lines.push('## Methodology');
  lines.push('');
  lines.push('Body LOC is computed by stripping BOM, removing YAML frontmatter only when anchored at file start with paired `---` fences,');
  lines.push('removing HTML `reasoning_effort` metadata comments, normalizing CRLF to LF, dropping trailing blank lines, and counting the remaining lines.');
  lines.push('Fenced code blocks are NOT stripped — every fence line counts toward body LOC.');
  lines.push('Threshold is **strict greater-than**: exactly 200 LOC is compliant; 201 LOC is the first offender.');
  lines.push('');
  lines.push('Generator: `scripts/pocock/audit-skill-bodies.mjs`');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runAudit(args);
  if (args.json) {
    process.stdout.write(JSON.stringify(result.summary, null, 2) + '\n');
  } else {
    process.stdout.write(`Skill body audit: ${result.summary.total_files} files, ${result.summary.offender_count} offender(s) over ${result.summary.threshold} LOC.\n`);
    if (result.top3.length > 0) {
      process.stdout.write('Top offenders:\n');
      result.top3.forEach((t, i) => process.stdout.write(`  ${i + 1}. ${t.path} (${t.body_loc} LOC)\n`));
    }
  }
  if (args.write) {
    process.stdout.write(`Report written: ${path.relative(process.cwd(), args.reportPath)}\n`);
  }
  process.exit(0);
}

const isMain = (() => { try { return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]); } catch { return false; } })();
if (isMain) {
  main().catch(err => { console.error('audit-skill-bodies failed:', err); process.exit(0); });
}
