#!/usr/bin/env node
/**
 * Scripts-estate reachability gauge — SD-LEO-INFRA-SCRIPTS-ESTATE-RECONCILIATION-001 (FR-1).
 *
 * Weekly standing SRE gauge over the scripts/ estate (productized from the
 * chairman's 2026-06-10 sprawl scan, which found 717 of 2,091 live candidates
 * referenced by nothing). Forward direction of the script-liveness norm:
 *   - reverse direction (reference -> file exists) is scripts/validate-script-references.js
 *     in the pre-commit hook;
 *   - this gauge answers "which scripts does NOTHING reference?" and tracks the
 *     trend so orphan growth is caught weekly, not by accident.
 *
 * What it does (mirrors scripts/row-growth-snapshot.cjs):
 *   1. Due-gate: skip unless the latest SCRIPTS_REACHABILITY_SNAPSHOT coordination
 *      event is older than ~6 days (or --force).
 *   2. Scan: inventory scripts/**, build a reference haystack (package.json scripts,
 *      .github, .husky, .claude/commands|agents|settings*, docs, scripts, lib, src,
 *      server, api, templates, CLAUDE*.md) and classify candidates reachable/orphan.
 *      .husky is included deliberately — its omission from the original scan made
 *      live pre-commit hooks look orphaned (known false-positive class).
 *   3. Persist ONE coordination_events row (the baseline series, fail-soft).
 *   4. Alert leg ONLY on growth: orphan_count +>=10 vs prev snapshot, or any broken
 *      npm alias -> coordinator inbox row (session_coordination INFO), same
 *      mechanism as row-growth.
 *
 * KNOWN BLIND SPOTS (advisory gauge — never a kill list, never CI-blocking):
 *   - references stored only in the DB (cron prompt strings, leo_protocol_sections),
 *   - dynamically constructed paths, references from the EHG sibling repo.
 *   An "orphan" here is a triage candidate. Archive via verified batches (FR-4 recipe).
 *
 * Scheduling: armed weekly by the coordinator (coordinator-startup-check.mjs
 * STANDARD_LOOPS, cron '40 9 * * 1'). Ad-hoc: npm run sre:scripts-reachability [-- --force]
 * ALWAYS exits 0 on operational paths (a gauge must never break its host loop).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

export const SNAPSHOT_EVENT_TYPE = 'SCRIPTS_REACHABILITY_SNAPSHOT';
export const GAUGE_DUE_MS = 6 * 24 * 60 * 60 * 1000; // ~6d => weekly cron tick, tolerant of jitter
export const ORPHAN_GROWTH_ALERT_THRESHOLD = 10;     // alert when orphan_count grows by >= this vs prev
export const LIST_CAP = 50;                          // cap new/resolved lists in payload + alert body

const SKIP_DIRS = new Set(['node_modules', '.git']);
const SCRIPT_EXT_RE = /\.(js|cjs|mjs|ts|sh|ps1|py)$/;
const REF_EXT_RE = /\.(js|cjs|mjs|ts|yml|yaml|json|md|sh|ps1)$/;
const TEST_RE = /\.(test|spec)\.[jt]sx?$/;

function* walk(dir) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const isTest = (f) => TEST_RE.test(f) || f.includes('__tests__');

/**
 * Full estate scan (filesystem-only, no DB). Pure given a repo root + clock.
 * @param {string} root repo root
 * @param {number} [nowMs]
 * @returns {{captured_at:string,total:number,candidates:number,reachable:number,orphan_count:number,
 *            by_dir:Object<string,number>,age_buckets:Object<string,number>,
 *            broken_npm_aliases:Array<{alias:string,file:string}>,orphans_full:string[]}}
 */
export function scanScriptsEstate(root, nowMs = Date.now()) {
  const rel = (p) => path.relative(root, p).replace(/\\/g, '/');

  // ---- inventory ----
  const scriptFiles = [];
  for (const f of walk(path.join(root, 'scripts'))) {
    if (SCRIPT_EXT_RE.test(f)) scriptFiles.push(rel(f));
  }

  // ---- npm alias health ----
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const broken_npm_aliases = [];
  for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
    const matches = [...cmd.matchAll(/(?:node|node --test|tsx)\s+(?:--[^\s]+\s+)*((?:scripts|lib|src|dist|tools)\/[^\s'"&|;]+\.(?:js|cjs|mjs|ts))/g)];
    for (const m of matches) {
      if (!fs.existsSync(path.join(root, m[1]))) broken_npm_aliases.push({ alias: name, file: m[1] });
    }
  }

  // ---- reference haystack ----
  // .husky added vs the original scratch scan (its hooks are extensionless shell
  // files — read EVERY file there, the extension filter would skip them all).
  const refDirs = ['.github', '.husky', '.claude/commands', '.claude/agents', 'docs', 'scripts', 'lib', 'src', 'server', 'api', 'templates'];
  const refFiles = [];
  for (const d of refDirs) {
    const abs = path.join(root, d);
    if (!fs.existsSync(abs)) continue;
    const readAll = d === '.husky';
    for (const f of walk(abs)) {
      if (readAll || REF_EXT_RE.test(f)) refFiles.push(f);
    }
  }
  for (const cfg of ['.claude/settings.json', '.claude/settings.local.json', 'CLAUDE.md', 'CLAUDE_CORE.md', 'CLAUDE_LEAD.md', 'CLAUDE_PLAN.md', 'CLAUDE_EXEC.md', 'CLAUDE_ADAM.md']) {
    const abs = path.join(root, cfg);
    if (fs.existsSync(abs)) refFiles.push(abs);
  }
  let haystack = JSON.stringify(pkg.scripts || {});
  for (const f of refFiles) {
    try { haystack += '\n' + fs.readFileSync(f, 'utf8'); } catch { /* skip unreadable */ }
  }

  // ---- reachability (basename match, self-reference excluded) ----
  const candidates = scriptFiles.filter((f) => !isTest(f) && !f.startsWith('scripts/archive/'));
  const orphans = [];
  let reachableCount = 0;
  for (const f of candidates) {
    const base = path.basename(f);
    let own = '';
    try { own = fs.readFileSync(path.join(root, f), 'utf8'); } catch { /* treat as empty */ }
    const globalCount = haystack.split(base).length - 1;
    const ownCount = own.split(base).length - 1;
    if (globalCount - ownCount > 0) reachableCount++;
    else orphans.push(f);
  }

  // ---- orphan profile ----
  const by_dir = {};
  const age_buckets = { '<30d': 0, '30-90d': 0, '90-180d': 0, '>180d': 0 };
  for (const f of orphans) {
    const parts = f.split('/');
    const key = parts.length > 2 ? parts.slice(0, 2).join('/') : 'scripts/(top)';
    by_dir[key] = (by_dir[key] || 0) + 1;
    let mtime = 0;
    try { mtime = fs.statSync(path.join(root, f)).mtimeMs; } catch { /* bucket as oldest */ }
    const ageDays = (nowMs - mtime) / 86_400_000;
    if (ageDays < 30) age_buckets['<30d']++;
    else if (ageDays < 90) age_buckets['30-90d']++;
    else if (ageDays < 180) age_buckets['90-180d']++;
    else age_buckets['>180d']++;
  }

  return {
    captured_at: new Date(nowMs).toISOString(),
    total: scriptFiles.length,
    candidates: candidates.length,
    reachable: reachableCount,
    orphan_count: orphans.length,
    by_dir,
    age_buckets,
    broken_npm_aliases,
    orphans_full: orphans.sort(),
  };
}

/**
 * PURE: deltas vs the previous snapshot payload (null-safe — first baseline has no prev).
 * @param {{orphan_count?:number, orphans_full?:string[]}|null} prev
 * @param {{orphan_count:number, orphans_full:string[]}} curr
 */
export function computeDeltas(prev, curr) {
  if (!prev || !Array.isArray(prev.orphans_full)) {
    return { orphan_delta: null, new_orphans: [], resolved_orphans: [], new_orphans_total: 0, resolved_orphans_total: 0 };
  }
  const prevSet = new Set(prev.orphans_full);
  const currSet = new Set(curr.orphans_full);
  const newOrphans = curr.orphans_full.filter((f) => !prevSet.has(f));
  const resolved = prev.orphans_full.filter((f) => !currSet.has(f));
  return {
    orphan_delta: curr.orphan_count - (prev.orphan_count ?? prev.orphans_full.length),
    new_orphans: newOrphans.slice(0, LIST_CAP),
    resolved_orphans: resolved.slice(0, LIST_CAP),
    new_orphans_total: newOrphans.length,
    resolved_orphans_total: resolved.length,
  };
}

/**
 * PURE: alert decision — ONLY on growth (orphan_delta >= threshold) or broken npm aliases.
 * Shrinkage and steady state never alert; first baseline (orphan_delta null) never
 * growth-alerts (broken aliases still do — they are point-in-time defects).
 * @param {{orphan_delta:number|null}} deltas
 * @param {{broken_npm_aliases:Array}} scan
 * @returns {{alert:boolean, reasons:string[]}}
 */
export function shouldAlert(deltas, scan, threshold = ORPHAN_GROWTH_ALERT_THRESHOLD) {
  const reasons = [];
  if (Number.isFinite(deltas.orphan_delta) && deltas.orphan_delta >= threshold) {
    reasons.push(`orphan_count grew by ${deltas.orphan_delta} since the previous snapshot (threshold ${threshold})`);
  }
  if (Array.isArray(scan.broken_npm_aliases) && scan.broken_npm_aliases.length > 0) {
    reasons.push(`${scan.broken_npm_aliases.length} npm alias(es) point at missing files: ${scan.broken_npm_aliases.map((b) => b.alias).join(', ')}`);
  }
  return { alert: reasons.length > 0, reasons };
}

/** PURE: is a new snapshot due? (same shape as lib/coordinator/row-growth.cjs) */
export function isSnapshotDue(lastCapturedAt, nowMs, dueMs = GAUGE_DUE_MS) {
  if (!lastCapturedAt) return true;
  const t = new Date(/Z$|[+-]\d{2}:?\d{2}$/.test(String(lastCapturedAt)) ? lastCapturedAt : lastCapturedAt + 'Z').getTime();
  if (!Number.isFinite(t)) return true;
  return nowMs - t >= dueMs;
}

/** IO (fail-soft): latest persisted snapshot payload, or null. */
export async function readLatestSnapshot(sb) {
  try {
    const { data, error } = await sb
      .from('coordination_events')
      .select('payload, created_at')
      .eq('event_type', SNAPSHOT_EVENT_TYPE)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error || !data || !data.length) return null;
    const p = data[0].payload || {};
    if (!Array.isArray(p.orphans_full)) return null;
    return { ...p, captured_at: p.captured_at || data[0].created_at };
  } catch { return null; }
}

async function resolveCoordinatorId(sb) {
  try {
    const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
    return await getActiveCoordinatorId(sb);
  } catch { return null; }
}

export async function main() {
  const force = process.argv.includes('--force');
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
  const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
  const sb = createSupabaseServiceClient();

  const prev = await readLatestSnapshot(sb);
  if (!force && prev && !isSnapshotDue(prev.captured_at, Date.now())) {
    console.log(`[scripts-reachability] not due (last snapshot ${prev.captured_at}) — no-op`);
    return;
  }

  const scan = scanScriptsEstate(root);
  const deltas = computeDeltas(prev, scan);
  const payload = { ...scan, ...deltas };

  // Persist the baseline point (non-fatal on failure — next run retries).
  try {
    const { error } = await sb.from('coordination_events').insert({
      event_type: SNAPSHOT_EVENT_TYPE,
      severity: 'info',
      payload,
    });
    if (error) console.warn(`[scripts-reachability] snapshot persist failed (non-fatal): ${error.message}`);
  } catch (e) { console.warn(`[scripts-reachability] snapshot persist threw (non-fatal): ${e.message}`); }

  const { orphans_full, ...summary } = payload;
  console.log(`[scripts-reachability] ${JSON.stringify(summary, null, 1)}`);
  console.log(`[scripts-reachability] snapshot captured @ ${scan.captured_at}${prev ? ` (prev ${prev.captured_at})` : ' (first baseline — no growth check)'}`);

  const verdict = shouldAlert(deltas, scan);
  if (!verdict.alert) {
    console.log('[scripts-reachability] no growth / no broken aliases — no alert');
    return;
  }

  console.log(`[scripts-reachability] ⚠️  alert: ${verdict.reasons.join(' | ')}`);
  // Alert leg: coordinator inbox row (same mechanism as row-growth-snapshot.cjs).
  try {
    const coordinatorId = await resolveCoordinatorId(sb);
    await sb.from('session_coordination').insert({
      target_session: coordinatorId, // null => broadcast row, still visible in inbox scans
      message_type: 'INFO',
      subject: `[SCRIPTS_REACHABILITY] ${verdict.reasons[0]}`,
      body: [
        ...verdict.reasons,
        '',
        `orphan_count: ${scan.orphan_count} (delta ${deltas.orphan_delta ?? 'n/a'})`,
        deltas.new_orphans.length ? `new orphans (first ${deltas.new_orphans.length} of ${deltas.new_orphans_total}):\n${deltas.new_orphans.map((f) => `  - ${f}`).join('\n')}` : '',
        scan.broken_npm_aliases.length ? `broken aliases:\n${scan.broken_npm_aliases.map((b) => `  - ${b.alias} -> ${b.file}`).join('\n')}` : '',
        '',
        'Advisory gauge — orphans are triage candidates (DB-stored refs / dynamic paths are blind spots).',
        'Recipe: verify, then git mv to scripts/archive/<yyyymm>-reachability-sweep/ (see scripts/archive/README.md).',
      ].filter(Boolean).join('\n'),
      payload: { kind: 'scripts_reachability_alert', reasons: verdict.reasons, orphan_count: scan.orphan_count, orphan_delta: deltas.orphan_delta, broken_npm_aliases: scan.broken_npm_aliases },
      sender_type: 'system',
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    });
  } catch (e) { console.warn(`[scripts-reachability] inbox alert failed (non-fatal): ${e.message}`); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Graceful bounded exit (same primitive as row-growth-snapshot.cjs): direct
  // process.exit() after Supabase/undici queries UV-aborts on Windows; armCliTeardown
  // drains naturally with an unref'd backstop. Exit code always 0 — a gauge never
  // breaks its host loop.
  main()
    .then(async () => {
      // SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-3): stamp on every successful tick,
      // regardless of which internal early-return branch main() took (not-due, or no
      // growth/no broken aliases) — reflects loop liveness.
      try {
        const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
        const { stampLastFired } = await import('../lib/periodic-liveness/stamp-last-fired.js');
        await stampLastFired(createSupabaseServiceClient(), 'standard_loop:scripts-reachability');
      } catch (err) {
        console.warn(`[scripts-reachability] stampLastFired failed (non-fatal): ${err.message}`);
      }
    })
    .catch((e) => { console.warn(`[scripts-reachability] unexpected error (non-fatal): ${e.message}`); })
    .finally(async () => {
      try {
        const { armCliTeardown } = await import('../lib/cli-graceful-exit.js');
        await armCliTeardown(0);
      } catch { process.exitCode = 0; /* helper missing — natural drain */ }
    });
}
