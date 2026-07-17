#!/usr/bin/env node
/**
 * SD-LEO-INFRA-REGISTER-TWO-EVERY-001 (DUTY 2) — every-3-day propose-only GitHub-health assessment.
 *
 * Read-only assessor that AGGREGATES existing GitHub-health producers into ONE ranked advisory for the
 * coordinator (it computes nothing new except the dependabot/code-scanning alert reads). Producers:
 *   (1) CI red on main      — codebase_health_snapshots latest dimension='ci_test_failure_count'
 *   (2) failed runs (3d)    — feedback rows category='ci_failure' (gh-failure-monitor.cjs)
 *   (3) PR hygiene          — gh pr list --json: open / stale(>14d) / oversized(>400 LOC) / conflicts
 *   (4) merge conflicts     — derived from the same gh pr list (mergeable=CONFLICTING)
 *   (5) security alerts     — gh api open dependabot + code-scanning alerts (the one genuinely-new read)
 *
 * CONST-002: read-only; surfaces ONE ranked advisory via `node scripts/adam-advisory.cjs send` and is
 * SILENT when everything is clean. Inertness is enforced at the WORKFLOW level
 * (.github/workflows/adam-github-assessment-cron.yml gates on ADAM_GH_ASSESS_V1, default OFF).
 *
 *   node scripts/adam-github-assessment.mjs            # assess + send one advisory (or silent)
 *   node scripts/adam-github-assessment.mjs --dry-run  # assess + print, NO advisory send
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const WINDOW_DAYS = 3;
const REPO = process.env.ADAM_GH_REPO || 'rickfelix/EHG_Engineer';
const STALE_PR_DAYS = 14;
const OVERSIZED_PR_LOC = 400;

function windowStart(windowDays = WINDOW_DAYS, nowMs = Date.now()) {
  return new Date(nowMs - windowDays * 24 * 60 * 60 * 1000).toISOString();
}

/** Run a gh command, returning parsed JSON (or null on any failure — fail-soft). */
function ghJson(args) {
  try {
    const out = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60_000 });
    return JSON.parse(out);
  } catch { return null; }
}

/**
 * PURE/TOTAL: derive PR-hygiene counts from a `gh pr list` JSON array. Drafts are excluded from the
 * actionable counts. nowMs injected for deterministic tests.
 * @param {Array<object>} prs
 */
export function summarizePrs(prs, { nowMs = Date.now(), staleDays = STALE_PR_DAYS, oversizedLoc = OVERSIZED_PR_LOC } = {}) {
  const list = Array.isArray(prs) ? prs.filter((p) => p && !p.isDraft) : [];
  const staleMs = staleDays * 24 * 60 * 60 * 1000;
  let stale = 0, oversized = 0, conflicts = 0;
  for (const p of list) {
    const age = p.createdAt ? nowMs - new Date(p.createdAt).getTime() : 0;
    if (age >= staleMs) stale += 1;
    if ((Number(p.additions) || 0) + (Number(p.deletions) || 0) > oversizedLoc) oversized += 1;
    if (typeof p.mergeable === 'string' && p.mergeable.toUpperCase() === 'CONFLICTING') conflicts += 1;
  }
  return { open: list.length, stale, oversized, conflicts };
}

/**
 * PURE/TOTAL: rank the assembled facts into severity-ordered findings + a one-line summary. Returns
 * { findings:[{area,severity,detail}], summary, clean:boolean }. `clean` => the caller stays SILENT.
 * Unknown/unmeasured facts (null) are simply omitted (never a fabricated alarm).
 */
export function rankGithubHealth(facts = {}) {
  const f = facts || {};
  const findings = [];
  const push = (area, severity, detail) => findings.push({ area, severity, detail });
  if (Number(f.ciRedOnMain) > 0) push('ci', 'high', `CI red on main: ${f.ciRedOnMain} failing`);
  if (Number(f.openRedMergeQfs) > 0) push('ci', 'high', `${f.openRedMergeQfs} open red-merge QF(s)`);
  if (Number(f.alertsDependabot) > 0) push('security', 'high', `${f.alertsDependabot} open dependabot alert(s)`);
  if (Number(f.alertsCodeScanning) > 0) push('security', 'high', `${f.alertsCodeScanning} open code-scanning alert(s)`);
  if (Number(f.prConflicts) > 0) push('pr', 'medium', `${f.prConflicts} PR(s) with merge conflicts`);
  if (Number(f.failedRuns) > 0) push('ci', 'medium', `${f.failedRuns} failed CI run(s) in ${f.windowDays || WINDOW_DAYS}d`);
  if (Number(f.prStale) > 0) push('pr', 'low', `${f.prStale} stale PR(s) (>${STALE_PR_DAYS}d)`);
  if (Number(f.prOversized) > 0) push('pr', 'low', `${f.prOversized} oversized PR(s) (>${OVERSIZED_PR_LOC} LOC)`);
  const rank = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
  const clean = findings.length === 0;
  const summary = clean
    ? 'GitHub health: all clear.'
    : `GitHub health (${findings.length} item${findings.length === 1 ? '' : 's'}): ` + findings.map((x) => x.detail).join('; ');
  return { findings, summary, clean };
}

/** IO seam — fail-soft per producer. Assemble the facts the ranker needs. */
export async function resolveGithubHealth(supabase, { windowDays = WINDOW_DAYS, nowMs = Date.now() } = {}) {
  const since = windowStart(windowDays, nowMs);
  const facts = { windowDays, ciRedOnMain: null, openRedMergeQfs: null, failedRuns: null, prOpen: null, prStale: null, prOversized: null, prConflicts: null, alertsDependabot: null, alertsCodeScanning: null };

  // (1) CI red on main — latest ci_test_failure_count snapshot.
  try {
    const { data } = await supabase.from('codebase_health_snapshots')
      .select('score, finding_count, scanned_at').eq('dimension', 'ci_test_failure_count')
      .order('scanned_at', { ascending: false }).limit(1);
    const row = data && data[0];
    if (row) facts.ciRedOnMain = Number.isFinite(row.finding_count) ? row.finding_count : (Number(row.score) || 0);
  } catch { /* null */ }

  // (1b) open red-merge QFs.
  try {
    // SD-LEO-FIX-FIXTURE-PREFIX-EXCLUSION-001: fetch titles so a fixture-titled test QF
    // mentioning red-merge can't inflate the gauge.
    const { data: rmRows } = await supabase.from('quick_fixes')
      .select('id, title').eq('status', 'open').ilike('title', '%red-merge%').limit(500);
    const { isFixtureQf } = await import('../lib/governance/fixture-exclusion.mjs');
    facts.openRedMergeQfs = (rmRows || []).filter((qf) => !isFixtureQf(qf)).length;
  } catch { /* null */ }

  // (2) failed CI runs in window.
  try {
    const { count } = await supabase.from('feedback')
      .select('id', { count: 'exact', head: true }).eq('category', 'ci_failure').gte('created_at', since);
    if (Number.isFinite(count)) facts.failedRuns = count;
  } catch { /* null */ }

  // (3)+(4) PR hygiene + conflicts via one gh pr list.
  const prs = ghJson(['pr', 'list', '--repo', REPO, '--state', 'open', '--limit', '100', '--json', 'number,createdAt,additions,deletions,mergeable,isDraft']);
  if (Array.isArray(prs)) {
    const s = summarizePrs(prs, { nowMs });
    facts.prOpen = s.open; facts.prStale = s.stale; facts.prOversized = s.oversized; facts.prConflicts = s.conflicts;
  }

  // (5) security alerts (may 404 if a feature is disabled — fail-soft to null).
  const dep = ghJson(['api', `repos/${REPO}/dependabot/alerts`, '--paginate', '-q', '[.[] | select(.state=="open")] | length']);
  if (Number.isFinite(Number(dep))) facts.alertsDependabot = Number(dep);
  const cs = ghJson(['api', `repos/${REPO}/code-scanning/alerts`, '--paginate', '-q', '[.[] | select(.state=="open")] | length']);
  if (Number.isFinite(Number(cs))) facts.alertsCodeScanning = Number(cs);

  return facts;
}

/** Surface ONE ranked advisory via adam-advisory.cjs send (propose-only). Returns true if sent. */
export function sendAdvisory(summary) {
  try {
    execFileSync('node', ['scripts/adam-advisory.cjs', 'send', summary], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], timeout: 60_000 });
    return true;
  } catch { return false; }
}

export async function runGithubAssessment(supabase, { dryRun = false, windowDays = WINDOW_DAYS } = {}) {
  const facts = await resolveGithubHealth(supabase, { windowDays });
  const ranked = rankGithubHealth(facts);
  if (dryRun || ranked.clean) return { facts, ranked, sent: false };
  const sent = sendAdvisory(ranked.summary);
  return { facts, ranked, sent };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { ranked, sent } = await runGithubAssessment(supabase, { dryRun });
  console.log(ranked.summary);
  console.log(ranked.clean ? 'clean -> silent (no advisory)' : (sent ? '-> advisory sent' : '[dry-run / send-skipped] no advisory'));
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) main().catch((e) => { console.error('github-assessment failed:', e.message); process.exit(1); });
