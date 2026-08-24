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

// TESTING finding F8 (EXEC-TO-PLAN review, evidence baa1c962, MEDIUM): a bare
// catch{} could not distinguish a genuine 404 (manifest absent) from an
// auth/rate-limit/network failure -- a rate-limited run would silently report
// EVERY repo as "PROPOSED for backfill" with no error surfaced, for a report
// whose whole purpose is deciding backfill scope.
function fetchManifest(repoName) {
  try {
    const raw = execFileSync('gh', [
      'api', `repos/${OWNER}/${repoName}/contents/scaffold-manifest.json`,
      '--jq', '.content',
    ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    const content = Buffer.from(raw.trim().replace(/\n/g, ''), 'base64').toString('utf8');
    return { present: true, manifest: JSON.parse(content), error: null };
  } catch (err) {
    const stderr = String(err.stderr || err.message || '');
    if (/HTTP 404/.test(stderr)) {
      return { present: false, manifest: null, error: null }; // genuinely absent
    }
    return { present: false, manifest: null, error: stderr.trim().slice(0, 200) || 'unknown fetch error' };
  }
}

export function buildCensus({ repoLister = listOwnerRepos, manifestFetcher = fetchManifest } = {}) {
  const allRepos = repoLister();
  const active = allRepos.filter((r) => !r.isArchived);
  const platformRepos = active.filter((r) => isKnownPlatformRepo(r.name));
  const ventureRepos = active.filter((r) => !isKnownPlatformRepo(r.name));

  const rows = ventureRepos.map((r) => {
    const { present, manifest, error } = manifestFetcher(r.name);
    return {
      name: r.name,
      manifestPresent: present,
      modules: present ? (manifest.modules || []).map((m) => `${m.module}@${m.version}`).join(', ') : null,
      generatedAt: present ? manifest.generated_at : null,
      fetchError: error || null,
    };
  });

  return {
    totalReposScanned: allRepos.length,
    archivedExcluded: allRepos.length - active.length,
    platformExcluded: platformRepos.map((r) => r.name),
    ventureRepos: rows,
  };
}

// SECURITY finding SEC-1 (EXEC-TO-PLAN review, evidence 6f9eabc9): EHG_Engineer is a
// PUBLIC repo (verified via `gh repo view`), but most venture repos are PRIVATE.
// Committing a per-repo name table here would publish unlaunched venture names --
// competitive information -- to anyone. The aggregate-only summary below is what gets
// committed/merged as this SD's FR-5 PR artifact; the full per-repo table (still
// genuinely useful for backfill triage) is written LOCALLY ONLY, to a gitignored path
// (scripts/temp/), never committed.
export function toMarkdownSummary(census, nowIso = new Date().toISOString()) {
  const withManifest = census.ventureRepos.filter((r) => r.manifestPresent).length;
  const fetchErrors = census.ventureRepos.filter((r) => r.fetchError).length;
  const genuinelyMissing = census.ventureRepos.length - withManifest - fetchErrors;
  let md = `# Venture Scaffold Backfill Census — SD-LEO-INFRA-VENTURE-SCAFFOLD-CODE-001 FR-5\n\n`;
  md += `Generated: ${nowIso}\n\n`;
  md += `**Report-only. Zero writes to any venture repo. Backfill is PROPOSED per-venture, never auto-applied.**\n\n`;
  md += `Per-repo venture names are deliberately NOT included here — this repo is PUBLIC and most\n`;
  md += `venture repos are PRIVATE, so a name table would be a competitive-information disclosure\n`;
  md += `(SECURITY finding SEC-1). The full per-repo breakdown is generated locally only, at\n`;
  md += `\`scripts/temp/venture-scaffold-backfill-census-full.md\` (gitignored) — re-run\n`;
  md += `\`node scripts/audits/venture-scaffold-backfill-census.mjs\` to regenerate it for review.\n\n`;
  md += `## Scope\n\n`;
  md += `- Total repos scanned under \`${OWNER}\`: ${census.totalReposScanned}\n`;
  md += `- Archived (excluded): ${census.archivedExcluded}\n`;
  md += `- Platform/infra repos (excluded): ${census.platformExcluded.join(', ') || 'none'}\n`;
  md += `- Venture repos in census: ${census.ventureRepos.length}\n`;
  md += `- Already scaffolded (manifest present): ${withManifest} / ${census.ventureRepos.length}\n`;
  md += `- Genuinely missing a manifest (proposed for backfill): ${genuinelyMissing} / ${census.ventureRepos.length}\n`;
  md += `- Fetch failed (auth/rate-limit/network — status UNKNOWN, NOT counted as missing): ${fetchErrors} / ${census.ventureRepos.length}\n`;
  return md;
}

export function toMarkdownFull(census, nowIso = new Date().toISOString()) {
  let md = toMarkdownSummary(census, nowIso);
  md += `\n## Per-repo scaffold state (LOCAL ONLY — do not commit, contains private venture names)\n\n`;
  md += `| repo | manifest present | stamped modules | generated_at |\n|---|---|---|---|\n`;
  for (const r of [...census.ventureRepos].sort((a, b) => a.name.localeCompare(b.name))) {
    const state = r.fetchError ? `⚠️ UNKNOWN (fetch failed: ${r.fetchError})` : (r.manifestPresent ? '✅' : '❌ PROPOSED for backfill');
    md += `| ${r.name} | ${state} | ${r.modules || '—'} | ${r.generatedAt || '—'} |\n`;
  }
  md += `\n## Backfill proposal\n\n`;
  // Only genuinely-confirmed-absent repos are proposed -- a fetch failure means
  // UNKNOWN, not missing, so it must never silently count as a backfill candidate.
  const missing = census.ventureRepos.filter((r) => !r.manifestPresent && !r.fetchError);
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
  const summaryPath = 'docs/audits/venture-scaffold-backfill-census.md';
  const fullPath = 'scripts/temp/venture-scaffold-backfill-census-full.md';
  writeFileSync(summaryPath, toMarkdownSummary(census), 'utf8');
  writeFileSync(fullPath, toMarkdownFull(census), 'utf8');
  console.log(`Aggregate summary (committable) written to ${summaryPath}`);
  console.log(`Full per-repo report (local only, gitignored) written to ${fullPath}`);
  console.log(`${census.ventureRepos.length} venture repos scanned, ${census.ventureRepos.filter((r) => r.manifestPresent).length} already scaffolded.`);
}

if (isMainModule(import.meta.url)) main();
