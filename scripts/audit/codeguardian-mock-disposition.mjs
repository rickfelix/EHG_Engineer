#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const SD_KEY = 'sd-leo-infra-codeguardian-mock-audit-001';
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'audits', SD_KEY);
const TARGET = 'codeguardian-mock';
const TARGET_RE = /codeguardian[-_]mock/;

function grepRepo(pattern, includeGlobs) {
  const args = ['grep', '-rIn', '--binary-files=without-match', '-E', pattern];
  for (const g of includeGlobs) args.push(`--include=${g}`);
  args.push('--exclude-dir=.git', '--exclude-dir=node_modules', '--exclude-dir=.worktrees', '--exclude-dir=.audit-output.json');
  args.push('.');
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT });
    void out;
  } catch { /* ignore — fall through to grep */ }
  try {
    const result = execFileSync(args[0], args.slice(1), { cwd: REPO_ROOT, maxBuffer: 32 * 1024 * 1024 });
    return result.toString().split('\n').filter(l => l.trim()).map(line => {
      const m = line.match(/^([^:]+):(\d+):(.*)$/);
      return m ? { file: m[1].replace(/^\.\//, ''), line: Number(m[2]), text: m[3].trim() } : { raw: line };
    });
  } catch (e) {
    if (e.status === 1) return [];
    throw e;
  }
}

async function readJsonIfExists(p) {
  if (!existsSync(p)) return null;
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; }
}

async function readTextIfExists(p) {
  if (!existsSync(p)) return null;
  try { return await readFile(p, 'utf8'); } catch { return null; }
}

async function main() {
  const codeIncludes = ['*.js', '*.ts', '*.mjs', '*.cjs', '*.jsx', '*.tsx'];
  const configIncludes = ['*.json', '*.yml', '*.yaml'];
  const docIncludes = ['*.md'];

  const grep_matches = grepRepo(TARGET_RE.source, [...codeIncludes, ...configIncludes, ...docIncludes]);

  const dynamic_require_matches = grepRepo(
    String.raw`(require|import)\s*\(\s*['"][^'"]*codeguardian[-_]mock`,
    [...codeIncludes]
  );

  const composeFiles = ['docker-compose.yml', 'docker-compose.yaml', 'docker-compose.dev.yml', 'docker-compose.test.yml', 'docker-compose.prod.yml'];
  const docker_compose_refs = [];
  for (const f of composeFiles) {
    const txt = await readTextIfExists(path.join(REPO_ROOT, f));
    if (txt && TARGET_RE.test(txt)) {
      const lines = txt.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (TARGET_RE.test(lines[i])) docker_compose_refs.push({ file: f, line: i + 1, text: lines[i].trim() });
      }
    }
  }

  const pkg = await readJsonIfExists(path.join(REPO_ROOT, 'package.json'));
  const workspace_refs = [];
  if (pkg?.workspaces) {
    const ws = Array.isArray(pkg.workspaces) ? pkg.workspaces : (pkg.workspaces?.packages || []);
    for (const entry of ws) if (TARGET_RE.test(entry)) workspace_refs.push(entry);
  }

  const ci_workflow_refs = grepRepo(TARGET_RE.source, ['*.yml', '*.yaml'])
    .filter(m => m.file && m.file.startsWith('.github/'));

  const vitestText = await readTextIfExists(path.join(REPO_ROOT, 'vitest.config.js'));
  const vitest_exclusion = vitestText
    ? vitestText.split('\n').map((t, i) => ({ line: i + 1, text: t.trim() })).filter(o => TARGET_RE.test(o.text))
    : [];

  let recent_activity = [];
  try {
    const log = execFileSync('git', ['log', '--since=2026-04-26', '--oneline', '--', `services/${TARGET}/`], { cwd: REPO_ROOT });
    recent_activity = log.toString().split('\n').filter(Boolean);
  } catch { /* tolerate */ }

  const result = {
    sd: 'SD-LEO-INFRA-CODEGUARDIAN-MOCK-AUDIT-001',
    target: TARGET,
    audited_at: new Date().toISOString(),
    summary: {
      grep_matches_count: grep_matches.length,
      dynamic_require_matches_count: dynamic_require_matches.length,
      docker_compose_refs_count: docker_compose_refs.length,
      workspace_refs_count: workspace_refs.length,
      ci_workflow_refs_count: ci_workflow_refs.length,
      vitest_exclusion_present: vitest_exclusion.length > 0,
      recent_activity_count: recent_activity.length
    },
    grep_matches,
    dynamic_require_matches,
    docker_compose_refs,
    workspace_refs,
    ci_workflow_refs,
    vitest_exclusion,
    recent_activity
  };

  await mkdir(OUT_DIR, { recursive: true });
  const jsonOut = path.join(OUT_DIR, 'audit-output.json');
  const sortableJson = JSON.stringify({ ...result, audited_at: 'TIMESTAMP' }, null, 2);
  await writeFile(jsonOut, JSON.stringify(result, null, 2) + '\n');

  const md = [
    `# Audit: ${TARGET} disposition`,
    ``,
    `**SD**: SD-LEO-INFRA-CODEGUARDIAN-MOCK-AUDIT-001`,
    `**Audited**: ${result.audited_at}`,
    ``,
    `## Summary`,
    ``,
    `| Reference type | Count |`,
    `|---|---:|`,
    `| Static grep matches (code/config/md) | ${grep_matches.length} |`,
    `| Dynamic require/import matches | ${dynamic_require_matches.length} |`,
    `| docker-compose service refs | ${docker_compose_refs.length} |`,
    `| package.json workspaces refs | ${workspace_refs.length} |`,
    `| CI workflow refs (.github/) | ${ci_workflow_refs.length} |`,
    `| vitest.config.js exclusion present | ${vitest_exclusion.length > 0 ? 'yes' : 'no'} |`,
    `| commits since 2026-04-26 | ${recent_activity.length} |`,
    ``,
    `## Vitest exclusion`,
    vitest_exclusion.length ? vitest_exclusion.map(v => `- line ${v.line}: \`${v.text}\``).join('\n') : '- none',
    ``,
    `## Static grep matches (top 30)`,
    grep_matches.length ? grep_matches.slice(0, 30).map(m => `- \`${m.file}:${m.line}\` — ${m.text?.slice(0, 120)}`).join('\n') : '- none',
    ``,
    `## docker-compose refs`,
    docker_compose_refs.length ? docker_compose_refs.map(m => `- \`${m.file}:${m.line}\` — ${m.text}`).join('\n') : '- none',
    ``,
    `## CI workflow refs`,
    ci_workflow_refs.length ? ci_workflow_refs.map(m => `- \`${m.file}:${m.line}\` — ${m.text}`).join('\n') : '- none',
    ``,
    `## package.json workspaces refs`,
    workspace_refs.length ? workspace_refs.map(w => `- ${w}`).join('\n') : '- none',
    ``,
    `## Recent activity (since 2026-04-26)`,
    recent_activity.length ? recent_activity.map(c => `- ${c}`).join('\n') : '- none',
    ``,
    `Full machine-readable output: [audit-output.json](./audit-output.json)`,
    ``
  ].join('\n');

  await writeFile(path.join(OUT_DIR, 'AUDIT.md'), md);

  console.log('AUDIT_OUTPUT_JSON=' + jsonOut);
  console.log('AUDIT_MD=' + path.join(OUT_DIR, 'AUDIT.md'));
  console.log('SUMMARY=' + JSON.stringify(result.summary));
}

main().catch(e => { console.error(e); process.exit(1); });
