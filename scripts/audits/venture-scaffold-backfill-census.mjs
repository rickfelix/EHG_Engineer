#!/usr/bin/env node
// SD-LEO-INFRA-VENTURE-SCAFFOLD-CODE-001 FR-5: report-only backfill census.
// Report-only precedent: scripts/audits/gitattributes-eol-census.mjs (git/gh reads,
// aggregate, writeFileSync exactly once, zero mutation). Deliberately reads the REAL
// GitHub repo population via `gh repo list`, NOT the DB `applications` table / registry.json
// -- both are already known (FR-4) to under-count real ventures, so using either as the
// census's own target list would silently hide exactly the un-registered repos this
// census exists to surface.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const OWNER = 'rickfelix';

// The only 2 repos known to be platform/infra rather than ventures. Deliberately NOT a
// broader name-pattern heuristic (e.g. "starts with leo-") -- an unverified naming
// heuristic could silently exclude a real venture repo from the census, which is the
// exact "prose not enforced" failure mode this SD exists to close. Every other repo is
// INCLUDED and reported; scope is stated transparently in the output rather than
// silently applied. Matched case-insensitively -- the live GitHub repo is `ehg`
// (lowercase), not `EHG`; an exact-case match against 'EHG' was empirically caught
// silently mis-listing the real platform repo as a venture "PROPOSED for backfill".
const KNOWN_PLATFORM_REPOS = new Set(['ehg', 'ehg_engineer']);
const isKnownPlatformRepo = (name) => KNOWN_PLATFORM_REPOS.has(String(name).toLowerCase());

function listOwnerRepos() {
  const raw = execFileSync('gh', [
    'repo', 'list', OWNER,
    '--limit', '200',
    '--json', 'name,isArchived,defaultBranchRef',
  ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(raw);
}

function fetchManifest(repoName) {
  try {
    const raw = execFileSync('gh', [
      'api', `repos/${OWNER}/${repoName}/contents/scaffold-manifest.json`,
      '--jq', '.content',
    ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    const content = Buffer.from(raw.trim().replace(/\n/g, ''), 'base64').toString('utf8');
    return { present: true, manifest: JSON.parse(content) };
  } catch {
    return { present: false, manifest: null };
  }
}

export function buildCensus({ repoLister = listOwnerRepos, manifestFetcher = fetchManifest } = {}) {
  const allRepos = repoLister();
  const active = allRepos.filter((r) => !r.isArchived);
  const platformRepos = active.filter((r) => isKnownPlatformRepo(r.name));
  const ventureRepos = active.filter((r) => !isKnownPlatformRepo(r.name));

  const rows = ventureRepos.map((r) => {
    const { present, manifest } = manifestFetcher(r.name);
    return {
      name: r.name,
      manifestPresent: present,
      modules: present ? (manifest.modules || []).map((m) => `${m.module}@${m.version}`).join(', ') : null,
      generatedAt: present ? manifest.generated_at : null,
    };
  });

  return {
    totalReposScanned: allRepos.length,
    archivedExcluded: allRepos.length - active.length,
    platformExcluded: platformRepos.map((r) => r.name),
    ventureRepos: rows,
  };
}

export function toMarkdown(census, nowIso = new Date().toISOString()) {
  const withManifest = census.ventureRepos.filter((r) => r.manifestPresent).length;
  let md = `# Venture Scaffold Backfill Census — SD-LEO-INFRA-VENTURE-SCAFFOLD-CODE-001 FR-5\n\n`;
  md += `Generated: ${nowIso}\n\n`;
  md += `**Report-only. Zero writes to any venture repo. Backfill is PROPOSED per-venture below, never auto-applied.**\n\n`;
  md += `## Scope\n\n`;
  md += `- Total repos scanned under \`${OWNER}\`: ${census.totalReposScanned}\n`;
  md += `- Archived (excluded): ${census.archivedExcluded}\n`;
  md += `- Platform/infra repos (excluded): ${census.platformExcluded.join(', ') || 'none'}\n`;
  md += `- Venture repos in census: ${census.ventureRepos.length}\n`;
  md += `- Already scaffolded (manifest present): ${withManifest} / ${census.ventureRepos.length}\n\n`;
  md += `## Per-repo scaffold state\n\n`;
  md += `| repo | manifest present | stamped modules | generated_at |\n|---|---|---|---|\n`;
  for (const r of [...census.ventureRepos].sort((a, b) => a.name.localeCompare(b.name))) {
    md += `| ${r.name} | ${r.manifestPresent ? '✅' : '❌ PROPOSED for backfill'} | ${r.modules || '—'} | ${r.generatedAt || '—'} |\n`;
  }
  md += `\n## Backfill proposal\n\n`;
  const missing = census.ventureRepos.filter((r) => !r.manifestPresent);
  if (missing.length === 0) {
    md += `All venture repos in this census already carry a scaffold manifest. No backfill proposed.\n`;
  } else {
    md += `${missing.length} venture repo(s) have no scaffold manifest and are PROPOSED for backfill (review and merge per-venture — this census makes zero writes itself):\n\n`;
    for (const r of missing) md += `- ${r.name}\n`;
  }
  return md;
}

export function main() {
  const census = buildCensus();
  const md = toMarkdown(census);
  const outPath = 'docs/audits/venture-scaffold-backfill-census.md';
  writeFileSync(outPath, md, 'utf8');
  console.log(`Census written to ${outPath}`);
  console.log(`${census.ventureRepos.length} venture repos scanned, ${census.ventureRepos.filter((r) => r.manifestPresent).length} already scaffolded.`);
}

if (isMainModule(import.meta.url)) main();
