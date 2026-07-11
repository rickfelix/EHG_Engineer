/**
 * Recurring-process discovery (SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-A, FR-1/FR-2).
 *
 * Pure discovery: parses the three known recurring-process sources into a canonical list keyed
 * by process_key, WITHOUT touching the database. Consumed by scripts/enumerate-periodic-processes.mjs
 * (zero-shadow sweep) and scripts/seed-periodic-process-registry.mjs (standalone_cron seeding pass),
 * so the sweep and the seeder can never disagree about what "every recurring process" means.
 *
 * Sources:
 *   - GHA cron workflows: .github/workflows/*.yml containing a schedule cron (archived/ excluded).
 *     process_key = gha_cron:<filename>
 *   - Cron scripts: scripts/cron/*.{mjs,js,cjs}. process_key = cron_script:<filename>
 *   - Coordinator STANDARD_LOOPS: statically parsed from scripts/coordinator-startup-check.mjs
 *     (regex over the export block, NOT an import — importing would drag in the coordinator's env
 *     expectations for what is a pure text scan). process_key = standard_loop:<key>
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Best-effort seconds-between-runs for the common cron shapes used in this repo. Unrecognized
 * expressions fall back to daily (86400) — conservative for OVERDUE math (grace_multiplier
 * absorbs slack; a too-long interval only delays detection, never false-alarms).
 */
export function cronToIntervalSeconds(cron) {
  if (!cron || typeof cron !== 'string') return 86400;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return 86400;
  const [min, hour, dom, , dow] = parts;

  const everyN = (field) => { const m = /^\*\/(\d+)$/.exec(field); return m ? Number(m[1]) : null; };
  const listLen = (field) => (/^[\d,]+$/.test(field) ? field.split(',').length : 0);

  const nMin = everyN(min);
  if (nMin && hour === '*') return nMin * 60;
  const nHour = everyN(hour);
  if (nHour) return nHour * 3600;
  if (hour === '*') {
    const runsPerHour = listLen(min);
    if (runsPerHour > 0) return Math.floor(3600 / runsPerHour);
  }
  if (dom === '*' && dow !== '*') return 604800; // weekly (specific day-of-week)
  if (dom !== '*') return 2592000;               // monthly-ish (specific day-of-month)
  const runsPerDay = listLen(hour) || 1;
  return Math.floor(86400 / runsPerDay);         // N fixed hours per day
}

function extractCrons(yamlText) {
  // Match cron lines only inside a schedule: block-ish region; workflows in this repo always
  // write `- cron: '<expr>'` directly under schedule:, so a global cron-line match is safe and
  // far more robust than a YAML dependency for this read-only scan.
  const crons = [];
  const re = /^\s*-\s*cron:\s*['"]([^'"]+)['"]/gm;
  let m;
  while ((m = re.exec(yamlText)) !== null) crons.push(m[1]);
  return crons;
}

export function discoverGhaCrons(repoRoot) {
  const dir = path.join(repoRoot, '.github', 'workflows');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const file of fs.readdirSync(dir)) {
    if (!/\.ya?ml$/.test(file)) continue; // archived/ is a subdirectory — readdirSync (non-recursive) skips it
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const crons = extractCrons(text);
    if (crons.length === 0) continue;
    out.push({
      process_key: `gha_cron:${file}`,
      display_name: `GHA cron: ${file}`,
      source: 'gha_cron',
      cron: crons[0],
      expected_interval_seconds: Math.min(...crons.map(cronToIntervalSeconds)),
      session_bound: false,
    });
  }
  return out;
}

export function discoverCronScripts(repoRoot) {
  const dir = path.join(repoRoot, 'scripts', 'cron');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /\.(mjs|cjs|js)$/.test(f))
    .map((file) => ({
      process_key: `cron_script:${file}`,
      display_name: `cron script: ${file}`,
      source: 'cron_script',
      cron: null,
      // Invoked by a GHA workflow or loop that carries the real cadence; the script itself has
      // none. Daily default keeps the row visible without false OVERDUE pressure.
      expected_interval_seconds: 86400,
      session_bound: false,
    }));
}

/** Static parse of the STANDARD_LOOPS export — see module docstring for why not an import. */
export function parseStandardLoops(sourceText) {
  const start = sourceText.indexOf('export const STANDARD_LOOPS');
  if (start === -1) return [];
  const end = sourceText.indexOf('\n];', start);
  const block = sourceText.slice(start, end === -1 ? undefined : end);
  const out = [];
  const entryRe = /\{\s*key:\s*'([^']+)'(?:[^{}]|\{[^}]*\})*?\}/g;
  let m;
  while ((m = entryRe.exec(block)) !== null) {
    const entry = m[0];
    const key = m[1];
    const cronMatch = /cron:\s*'([^']+)'/.exec(entry);
    const labelMatch = /label:\s*'([^']+)'/.exec(entry);
    out.push({
      process_key: `standard_loop:${key}`,
      display_name: `coordinator loop: ${labelMatch ? labelMatch[1] : key}`,
      source: 'standard_loop',
      cron: cronMatch ? cronMatch[1] : null,
      expected_interval_seconds: cronMatch ? cronToIntervalSeconds(cronMatch[1]) : 3600,
      session_bound: true, // CronCreate-armed inside the coordinator session; dies with it
    });
  }
  return out;
}

export function discoverStandardLoops(repoRoot) {
  const file = path.join(repoRoot, 'scripts', 'coordinator-startup-check.mjs');
  if (!fs.existsSync(file)) return [];
  return parseStandardLoops(fs.readFileSync(file, 'utf8'));
}

/** The canonical union — every recurring process this repo knows how to discover. */
export function discoverAllProcesses(repoRoot) {
  return [
    ...discoverGhaCrons(repoRoot),
    ...discoverCronScripts(repoRoot),
    ...discoverStandardLoops(repoRoot),
  ];
}
