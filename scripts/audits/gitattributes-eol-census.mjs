#!/usr/bin/env node
// SD-LEO-INFRA-REPO-WIDE-GITATTRIBUTES-001 FR-1: Phase 0 census.
// Reuses parseEolLine from eol-renormalization-lint.mjs rather than a second
// hand-rolled parser (PLAN-phase correction, TESTING evidence a7c730d9).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { parseEolLine } from '../lint/eol-renormalization-lint.mjs';

const CANDIDATE_EXTENSIONS = [
  'yml', 'yaml', 'mmd', 'ps1', 'partial', 'csv', 'patch', 'txt',
  'intoto', 'gitkeep', 'map', 'tsx', 'example', 'css', 'template',
];
const BINARY_EXTENSIONS = ['png', 'webm', 'pptx', 'docx', 'gz'];

function gitLsFilesEol() {
  const raw = execFileSync('git', ['ls-files', '--eol'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return raw
    .split('\n')
    .filter(Boolean)
    .map(parseEolLine)
    .filter(Boolean);
}

function extOf(path) {
  const m = path.match(/\.([A-Za-z0-9]+)$/);
  return m ? m[1].toLowerCase() : '(none)';
}

function census(parsed) {
  const byExt = {};
  for (const p of parsed) {
    const ext = extOf(p.path);
    byExt[ext] ??= { total: 0, crlf: 0, mixed: 0, lf: 0, binaryIndex: 0 };
    byExt[ext].total++;
    if (p.index === 'crlf') byExt[ext].crlf++;
    else if (p.index === 'mixed') byExt[ext].mixed++;
    else if (p.index === 'lf') byExt[ext].lf++;
    else if (p.index === '-text') byExt[ext].binaryIndex++;
  }
  return byExt;
}

function openPrFiles() {
  try {
    const raw = execFileSync(
      'gh', ['pr', 'list', '--json', 'number,headRefName,files', '--limit', '50'],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    const prs = JSON.parse(raw);
    const touched = new Map(); // path -> [pr#, ...]
    for (const pr of prs) {
      for (const f of pr.files || []) {
        const list = touched.get(f.path) || [];
        list.push(pr.number);
        touched.set(f.path, list);
      }
    }
    return { prs, touched };
  } catch (e) {
    return { prs: null, error: e.message, touched: new Map() };
  }
}

const parsed = gitLsFilesEol();
const byExt = census(parsed);
const { prs, error: prError, touched } = openPrFiles();

const nowIso = new Date().toISOString();

let md = `# .gitattributes EOL Census — SD-LEO-INFRA-REPO-WIDE-GITATTRIBUTES-001\n\n`;
md += `Generated: ${nowIso} (EXEC-phase re-measurement, TR-2)\n\n`;
md += `Total tracked files: ${parsed.length}\n\n`;

md += `## Candidate extensions for \`eol=lf\` (FR-2, Phase 1)\n\n`;
md += `| ext | total | crlf | mixed | lf | binary-index | verdict |\n`;
md += `|---|---|---|---|---|---|---|\n`;
let anyDanger = false;
for (const ext of CANDIDATE_EXTENSIONS) {
  const s = byExt[ext] || { total: 0, crlf: 0, mixed: 0, lf: 0, binaryIndex: 0 };
  const danger = s.crlf > 0 || s.mixed > 0;
  if (danger) anyDanger = true;
  md += `| .${ext} | ${s.total} | ${s.crlf} | ${s.mixed} | ${s.lf} | ${s.binaryIndex} | ${danger ? '**DANGER**' : 'OK'} |\n`;
}
md += `\n${anyDanger ? '**WARNING: at least one candidate extension has crlf/mixed files — do not add eol=lf unconditionally.**' : 'All candidate extensions are 0 crlf / 0 mixed — safe to pin `eol=lf`.'}\n\n`;

md += `## Candidate extensions for \`binary\` mark (FR-2, Phase 1)\n\n`;
md += `| ext | total | binary-index (i/-text) |\n`;
md += `|---|---|---|\n`;
for (const ext of BINARY_EXTENSIONS) {
  const s = byExt[ext] || { total: 0, binaryIndex: 0 };
  md += `| .${ext} | ${s.total} | ${s.binaryIndex} |\n`;
}

md += `\n## NUL-byte / binary-index exposure via existing pins (danger class)\n\n`;
md += `Files where the index state is \`-text\` (git's own binary-content detection) AND the resolved attribute set forces \`eol=lf\` — these are exposed to a forced-renormalize rewrite of binary content.\n\n`;
const nulExposed = parsed.filter((p) => p.index === '-text' && /\beol=lf\b/.test(p.attr || ''));
if (nulExposed.length === 0) {
  md += `None found.\n\n`;
} else {
  md += `| path | index | attr |\n|---|---|---|\n`;
  for (const p of nulExposed) {
    md += `| ${p.path} | ${p.index} | ${p.attr} |\n`;
  }
  md += `\n`;
}

md += `## Open-PR conflict surface\n\n`;
if (prError) {
  md += `\`gh pr list\` failed: ${prError}\n\n`;
} else {
  md += `${prs.length} open PR(s) scanned.\n\n`;
  if (touched.size === 0) {
    md += `No open PR touches \`.gitattributes\` or any file whose extension is in this SD's candidate list.\n\n`;
  } else {
    const relevantExts = new Set([...CANDIDATE_EXTENSIONS, ...BINARY_EXTENSIONS]);
    const relevant = [...touched.entries()].filter(([path]) => {
      if (path === '.gitattributes') return true;
      return relevantExts.has(extOf(path));
    });
    if (relevant.length === 0) {
      md += `No open PR touches \`.gitattributes\` or any file whose extension is in this SD's candidate list.\n\n`;
    } else {
      md += `| path | PR(s) |\n|---|---|\n`;
      for (const [path, prNums] of relevant) {
        md += `| ${path} | ${prNums.map((n) => `#${n}`).join(', ')} |\n`;
      }
      md += `\n`;
    }
  }
}

md += `## Full per-extension breakdown\n\n`;
md += `| ext | total | crlf | mixed | lf | binary-index |\n|---|---|---|---|---|---|\n`;
for (const ext of Object.keys(byExt).sort((a, b) => byExt[b].total - byExt[a].total)) {
  const s = byExt[ext];
  md += `| .${ext} | ${s.total} | ${s.crlf} | ${s.mixed} | ${s.lf} | ${s.binaryIndex} |\n`;
}

const outPath = 'docs/audits/SD-LEO-INFRA-REPO-WIDE-GITATTRIBUTES-001-census.md';
writeFileSync(outPath, md, 'utf8');
console.log(`Census written to ${outPath}`);
console.log(`Total files: ${parsed.length}, candidate-extension danger: ${anyDanger}, nul-exposed: ${nulExposed.length}`);
