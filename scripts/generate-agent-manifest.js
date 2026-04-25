#!/usr/bin/env node
/**
 * Regenerate .claude/agents/AGENT-MANIFEST.md from filesystem state.
 * SD-LEO-INFRA-OPUS-HARNESS-ALIGNMENT-001-F (Module M).
 *
 * Inventory architecture (per .claude/agents/README.md):
 *   - `.claude/agents/*.partial`   — source-of-truth, committed, YAML frontmatter
 *   - `.claude/agents/*.md`        — build artifacts compiled by generate-agent-md-from-db.js, gitignored
 *   - `.claude/agents/_archived/*.md` — retired agents kept for reference, committed
 *
 * This generator reads the COMMITTED inventory (`*.partial` + `_archived/*.md`)
 * so the manifest is reproducible across all checkouts and tied to git history.
 * It does NOT enumerate compiled `.md` files (they vary by local compilation state).
 *
 * For each source file: parses YAML frontmatter for `{name, description, tools,
 * model}` and the Module H `<!-- reasoning_effort: <level> -->` HTML comment.
 *
 * Resilient to malformed source files (frontmatter not at file top, missing
 * reasoning_effort tag) — these surface as annotations in the manifest, not
 * crashes.
 *
 * Run: `node scripts/generate-agent-manifest.js`
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = join(__dirname, '..', '.claude', 'agents');
const ARCHIVED_DIR = join(AGENTS_DIR, '_archived');
const MANIFEST_PATH = join(AGENTS_DIR, 'AGENT-MANIFEST.md');
const NON_AGENT_PARTIALS = new Set(['_model-tracking-section.partial']);

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---/m;
const REASONING_RE = /<!--\s*reasoning_effort:\s*(low|medium|high)\s*-->/i;

export function parseFrontmatter(content) {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return null;
  const fields = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const m = rawLine.match(/^([a-z_]+):\s*(.*?)\s*$/i);
    if (!m) continue;
    let value = m[2];
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    fields[m[1]] = value;
  }
  return fields;
}

export function parseReasoningEffort(content) {
  const match = content.match(REASONING_RE);
  return match ? match[1].toLowerCase() : null;
}

export function parseAgentFile(filename, content, status = 'active') {
  const fm = parseFrontmatter(content);
  const effort = parseReasoningEffort(content);
  return {
    filename,
    status,
    name: fm?.name || filename.replace(/\.(partial|md)$/, ''),
    description: fm?.description || '(no description)',
    model: fm?.model || '(unspecified)',
    tools: fm?.tools || '(none listed)',
    reasoning_effort: effort,
    reasoning_effort_default: !effort,
    frontmatter_malformed: !fm
  };
}

function safeReaddir(dir) {
  try {
    statSync(dir);
    return readdirSync(dir);
  } catch {
    return [];
  }
}

export function listActiveSources(dir = AGENTS_DIR) {
  return safeReaddir(dir)
    .filter(f => f.endsWith('.partial') && !NON_AGENT_PARTIALS.has(f))
    .sort((a, b) => a.localeCompare(b));
}

export function listArchivedAgents(dir = ARCHIVED_DIR) {
  return safeReaddir(dir)
    .filter(f => f.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b));
}

export function buildManifest(active, archived, today = new Date().toISOString().slice(0, 10)) {
  const lines = [];
  lines.push('# Custom Agent Manifest');
  lines.push('');
  lines.push(`**Last Updated**: ${today}`);
  lines.push(`**Active Agents**: ${active.length} (\`.partial\` sources in \`.claude/agents/\`)`);
  lines.push(`**Archived Agents**: ${archived.length} (\`.md\` files in \`.claude/agents/_archived/\`)`);
  lines.push(`**Total**: ${active.length + archived.length}`);
  lines.push('**Generator**: `node scripts/generate-agent-manifest.js` — re-run after agent additions/removals.');
  lines.push('');
  lines.push('> Source of truth is the `.partial` files (committed). Compiled `.md` files in `.claude/agents/` are build artifacts (gitignored) produced by `scripts/generate-agent-md-from-db.js`. This manifest enumerates the canonical sources, not the compiled outputs.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Active Agents');
  lines.push('');
  lines.push('Listed alphabetically. Each entry shows the agent name, model, reasoning-effort tag (Module H), and one-line description from frontmatter.');
  lines.push('');
  for (const agent of active) {
    appendEntry(lines, agent);
  }

  lines.push('---');
  lines.push('');
  lines.push('## Archived Agents');
  lines.push('');
  lines.push('Retired agents kept for reference. Re-activate by moving the `.md` file out of `_archived/` and creating the corresponding `.partial` in `.claude/agents/` (then re-run this generator). Direct script invocation still works while archived: `node scripts/execute-subagent.js --code <CODE> --sd-id <SD-ID>`.');
  lines.push('');
  if (archived.length === 0) {
    lines.push('_None._');
    lines.push('');
  } else {
    for (const agent of archived) {
      appendEntry(lines, agent);
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- Module H (`SD-LEO-INFRA-OPUS-HARNESS-ALIGNMENT-001-A`) added the `reasoning_effort` tag convention. Agents missing the tag default to `medium` — fix the source file rather than this manifest.');
  lines.push('- The compiler at `scripts/generate-agent-md-from-db.js` reads `.partial` files + LEO database knowledge to produce the gitignored `.md` files Claude Code loads at session start.');
  lines.push('- Non-agent partials in `.claude/agents/` (e.g., `_model-tracking-section.partial`) are excluded from the inventory by design.');
  lines.push('');
  return lines.join('\n');
}

function appendEntry(lines, agent) {
  const effortNote = agent.reasoning_effort_default
    ? '`medium` *(default — file is missing tag)*'
    : `\`${agent.reasoning_effort}\``;
  const malformedNote = agent.frontmatter_malformed
    ? ' *(⚠ frontmatter malformed — extracted with permissive scan)*'
    : '';
  lines.push(`### ${agent.name}`);
  lines.push(`- **File**: \`${agent.filename}\`${malformedNote}`);
  lines.push(`- **Model**: \`${agent.model}\``);
  lines.push(`- **Reasoning effort**: ${effortNote}`);
  lines.push(`- **Description**: ${agent.description}`);
  lines.push('');
}

export function generate({ dir = AGENTS_DIR, archivedDir = ARCHIVED_DIR, manifestPath = MANIFEST_PATH, today } = {}) {
  const activeFiles = listActiveSources(dir);
  const archivedFiles = listArchivedAgents(archivedDir);
  const active = activeFiles.map(f => parseAgentFile(f, readFileSync(join(dir, f), 'utf8'), 'active'));
  const archived = archivedFiles.map(f => parseAgentFile(f, readFileSync(join(archivedDir, f), 'utf8'), 'archived'));
  const manifest = buildManifest(active, archived, today);
  writeFileSync(manifestPath, manifest, 'utf8');
  return { active, archived, manifestPath };
}

if (process.argv[1] && process.argv[1].endsWith('generate-agent-manifest.js')) {
  const { active, archived, manifestPath } = generate();
  console.log(`Wrote ${manifestPath} with ${active.length} active + ${archived.length} archived agents.`);
  const all = [...active, ...archived];
  const flagged = all.filter(a => a.frontmatter_malformed || a.reasoning_effort_default);
  if (flagged.length) {
    console.log(`  Flagged ${flagged.length}: ${flagged.map(a => a.filename).join(', ')}`);
  }
}
