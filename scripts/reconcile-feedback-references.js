#!/usr/bin/env node
/**
 * Reference-keyed feedback reconciler — SD-FDBK-INFRA-REFERENCE-KEYED-FEEDBACK-001
 * (RCA CAPA-2; data-loss-sensitive → dry-run default).
 *
 * Scans merged origin/main commit messages for feedback-id MENTIONS (full UUIDs
 * or 8-char prefixes, anywhere — NOT just strict "^Closes feedback <uuid>"
 * footers), cross-references them against still-open feedback rows (default
 * category='harness_backlog'), and proposes resolution. This retroactively
 * reaches born-stale rows and rows fixed by an unrelated commit/QF that never
 * used the footer convention — a gap the shipped prospective/strict-footer
 * resolvers (LEAD-FINAL resolveFeedbackFooters, complete-quick-fix
 * resolveLinkedFeedbackRows) cannot cover.
 *
 * Safety (data-loss risk):
 *   - dry-run is the DEFAULT (report only; zero DB writes);
 *   - `--apply` resolves ONLY rows whose EXACT id was mentioned (full UUID) OR
 *     whose 8-char prefix UNAMBIGUOUSLY expands to exactly one open row;
 *   - NEVER age-based — age is never an input to the resolve decision;
 *   - idempotent + fail-soft (reuses lib/governance/resolve-feedback.js).
 *
 * Usage:
 *   npm run feedback:reconcile              # dry-run, category=harness_backlog
 *   npm run feedback:reconcile -- --apply   # resolve exact-id matches
 *   node scripts/reconcile-feedback-references.js --category all --limit 1000 --json
 */
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { resolveFeedback, parseFeedbackFooters } from '../lib/governance/resolve-feedback.js';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

dotenv.config();

const TERMINAL_STATUSES = ['resolved', 'closed', 'cancelled', 'wont_fix', 'duplicate'];
const FULL_UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// 8-char hex token NOT part of a longer hex/uuid run (lookbehind/lookahead guard
// so we don't match the leading 8 chars of a full UUID, which are followed by '-').
const SHORT_ID_RE = /(?<![0-9a-f-])[0-9a-f]{8}(?![0-9a-f-])/gi;

/**
 * Extract feedback-id mentions from a free-text blob (commit body, PR body).
 * Returns { full:Set<string>, short:Set<string> } of lowercased tokens.
 * Pure — no DB, no git. (FR-2)
 */
export function extractFeedbackMentions(text) {
  const full = new Set();
  const short = new Set();
  if (!text || typeof text !== 'string') return { full, short };
  for (const m of text.matchAll(FULL_UUID_RE)) full.add(m[0].toLowerCase());
  for (const m of text.matchAll(SHORT_ID_RE)) short.add(m[0].toLowerCase());
  return { full, short };
}

/**
 * Given a mention set and the open feedback rows, return the open-row ids that
 * are EXACTLY matched: full-UUID equality, or an 8-char prefix that uniquely
 * (exactly one) prefixes an open row. Ambiguous (>1) or zero-match prefixes are
 * skipped. Pure. (FR-3) Returns { matched: string[], skipped: [{prefix,count}] }.
 */
export function matchOpenRows(mentions, openRows) {
  const ids = (openRows || []).map(r => String(r.id).toLowerCase());
  const idSet = new Set(ids);
  const matched = new Set();
  const skipped = [];
  for (const f of (mentions.full || [])) {
    if (idSet.has(f)) matched.add(f);
  }
  for (const s of (mentions.short || [])) {
    const hits = ids.filter(id => id.startsWith(s));
    if (hits.length === 1) matched.add(hits[0]);
    else if (hits.length > 1) skipped.push({ prefix: s, count: hits.length });
  }
  return { matched: [...matched], skipped };
}

/**
 * Scan commits against open rows, attributing each matched feedbackId to the
 * commit SHA(s) that referenced it AND classifying the strength of evidence.
 * Pure (commits + openRows injected). (FR-2/FR-3)
 *
 * STRENGTH (the spot-check lesson): a bare MENTION of a feedback id in a merged
 * commit does NOT prove the row was fixed — a commit can say "out of scope →
 * feedback <id> (still new)", which is a mention but the row is legitimately
 * still open. Auto-resolving on a bare mention is a false-positive / data-loss
 * risk. So each match is tagged:
 *   - strong: the id appeared in a `Closes feedback <id>` footer (reuses
 *     parseFeedbackFooters) in at least one merged commit → safe to --apply.
 *     This is net-new vs the shipped resolvers, which only scan the COMPLETING
 *     SD's own commits / the QF's own PR — not all merged history.
 *   - weak: only a bare mention → SURFACED for manual review, never --apply'd
 *     unless --include-mentions is explicitly passed.
 *
 * @param {Array<{sha:string, body:string}>} commits
 * @param {Array<{id:string}>} openRows
 * @returns {{ byId: Map<string, {shas:Set<string>, strong:boolean}>, ambiguous: Array<{prefix:string,count:number,sha:string}> }}
 */
export function scanForMatches(commits, openRows) {
  const ids = (openRows || []).map(r => String(r.id).toLowerCase());
  const idSet = new Set(ids);
  const byId = new Map();
  const ambiguous = [];
  const record = (id, sha, strong) => {
    if (!byId.has(id)) byId.set(id, { shas: new Set(), strong: false });
    const entry = byId.get(id);
    entry.shas.add(sha);
    if (strong) entry.strong = true;
  };
  for (const c of (commits || [])) {
    const mentions = extractFeedbackMentions(c.body);
    // Strong evidence: full UUIDs that appear in a `^Closes feedback <id>` footer.
    const footerIds = new Set(parseFeedbackFooters(c.body));
    for (const f of mentions.full) {
      if (idSet.has(f)) record(f, c.sha, footerIds.has(f));
    }
    for (const s of mentions.short) {
      const hits = ids.filter(id => id.startsWith(s));
      if (hits.length === 1) record(hits[0], c.sha, false); // short prefixes are never "strong"
      else if (hits.length > 1) ambiguous.push({ prefix: s, count: hits.length, sha: c.sha });
    }
  }
  return { byId, ambiguous };
}

/**
 * Read merged origin/main commits as [{sha, body}]. Bounded + fail-soft. (TR-2)
 */
export function readMergedCommits({ limit = 500, since = null, cwd = process.cwd() } = {}) {
  // Record sep \x1e between commits; unit sep \x1f between sha and body.
  const range = since ? `${since}..origin/main` : 'origin/main';
  const cmd = `git log ${range} -n ${limit} --format=%H%x1f%B%x1e`;
  let out = '';
  try {
    out = execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return []; // offline / no origin/main / bad ref → fail-soft empty
  }
  const commits = [];
  for (const rec of out.split('\x1e')) {
    const trimmed = rec.replace(/^\s+/, '');
    if (!trimmed) continue;
    const sep = trimmed.indexOf('\x1f');
    if (sep < 0) continue;
    const sha = trimmed.slice(0, sep).trim();
    const body = trimmed.slice(sep + 1);
    if (sha) commits.push({ sha, body });
  }
  return commits;
}

/** Parse argv into options. Pure. */
export function parseArgs(argv) {
  const opts = { apply: false, includeMentions: false, category: 'harness_backlog', limit: 500, since: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') opts.apply = true;
    else if (a === '--include-mentions') opts.includeMentions = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--category') opts.category = argv[++i];
    else if (a.startsWith('--category=')) opts.category = a.slice('--category='.length);
    else if (a === '--since') opts.since = argv[++i];
    else if (a.startsWith('--since=')) opts.since = a.slice('--since='.length);
    else if (a === '--limit') opts.limit = parseInt(argv[++i], 10) || 500;
    else if (a.startsWith('--limit=')) opts.limit = parseInt(a.slice('--limit='.length), 10) || 500;
  }
  return opts;
}

async function loadOpenFeedback(supabase, category) {
  // Paginated — SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: feedback is
  // unbounded-growth and "not terminal" does not bound it; every open row is scanned
  // against commit history below.
  const buildQuery = () => {
    let q = supabase.from('feedback').select('id, status, category, created_at').not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`);
    if (category && category !== 'all') q = q.eq('category', category);
    return q.order('id', { ascending: true });
  };
  try {
    return await fetchAllPaginated(buildQuery);
  } catch (error) {
    throw new Error(`feedback read failed: ${error.message}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const log = (...a) => { if (!opts.json) console.log(...a); };

  log(`\n🔗 Feedback Reference Reconciler (${opts.apply ? 'APPLY' : 'DRY-RUN'})`);
  log(`   category=${opts.category}  git-window=${opts.since ? opts.since + '..origin/main' : 'origin/main'} -n ${opts.limit}\n`);

  const supabase = createSupabaseServiceClient();
  const openRows = await loadOpenFeedback(supabase, opts.category);
  log(`   Open feedback rows in scope: ${openRows.length}`);

  const commits = readMergedCommits({ limit: opts.limit, since: opts.since, cwd: process.cwd() });
  log(`   Merged commits scanned: ${commits.length}`);

  const { byId, ambiguous } = scanForMatches(commits, openRows);
  const all = [...byId.entries()].map(([feedbackId, e]) => ({ feedbackId, shas: [...e.shas], strong: e.strong }));
  const strong = all.filter(p => p.strong);
  const weak = all.filter(p => !p.strong);

  async function applyOne(p, label) {
    const shaList = p.shas.map(s => s.slice(0, 7)).join(', ');
    const notes = `Reconciled by feedback:reconcile (${label}) — merged commit(s): ${p.shas.join(', ')}`;
    const res = await resolveFeedback({ supabase, feedbackId: p.feedbackId, notes });
    if (res.updated) { summary.resolved++; log(`      ✅ ${p.feedbackId} → resolved (${shaList})`); }
    else if (res.reason === 'no_row_or_already_resolved') { summary.alreadyResolved++; log(`      ℹ️  ${p.feedbackId} → already resolved (idempotent)`); }
    else { summary.errors++; log(`      ⚠️  ${p.feedbackId} → resolve failed: ${res.error || 'unknown'}`); }
  }

  if (ambiguous.length > 0) {
    log(`   ⚠️  ${ambiguous.length} ambiguous short-prefix mention(s) skipped (use full UUID):`);
    for (const a of ambiguous.slice(0, 10)) log(`        ${a.prefix} → ${a.count} open rows (commit ${a.sha.slice(0, 7)})`);
  }

  const summary = { scope: opts.category, openRows: openRows.length, commits: commits.length, matched: all.length, strong: strong.length, weak: weak.length, resolved: 0, alreadyResolved: 0, errors: 0, apply: opts.apply, includeMentions: opts.includeMentions, ambiguousSkipped: ambiguous.length };

  if (all.length === 0) {
    log('\n   ✅ No still-open rows were referenced in merged history. Nothing to reconcile.\n');
    if (opts.json) console.log(JSON.stringify({ summary, strong: [], weak: [] }, null, 2));
    return summary;
  }

  // STRONG — a `Closes feedback <id>` footer in merged history → safe to --apply.
  if (strong.length > 0) {
    log(`\n   STRONG — Closes-footer in merged history (${strong.length})${opts.apply ? ', resolving' : ', proposed (dry-run)'}:`);
    for (const p of strong) {
      if (opts.apply) await applyOne(p, 'Closes-footer');
      else log(`      • ${p.feedbackId} ← ${p.shas.map(s => s.slice(0, 7)).join(', ')}`);
    }
  }

  // WEAK — bare mention only. A mention can be "out of scope → feedback X (still
  // new)", so these are NEVER auto-applied unless --include-mentions is explicit.
  if (weak.length > 0) {
    const willApplyWeak = opts.apply && opts.includeMentions;
    log(`\n   WEAK — bare mention only, REVIEW manually${willApplyWeak ? ' (--include-mentions: resolving)' : ' (NOT applied)'} (${weak.length}):`);
    for (const p of weak) {
      if (willApplyWeak) await applyOne(p, 'bare-mention --include-mentions');
      else log(`      • ${p.feedbackId} ← ${p.shas.map(s => s.slice(0, 7)).join(', ')}  (a mention may be "out of scope / still-open")`);
    }
  }

  log(`\n   Summary: matched=${summary.matched} (strong=${summary.strong} weak=${summary.weak}) resolved=${summary.resolved} already=${summary.alreadyResolved} errors=${summary.errors} ambiguous-skipped=${summary.ambiguousSkipped}`);
  if (!opts.apply) log(`   (dry-run — --apply resolves the ${strong.length} STRONG match(es); WEAK mentions need manual review or --include-mentions)\n`);
  else log('');

  if (opts.json) console.log(JSON.stringify({ summary, strong, weak }, null, 2));
  return summary;
}

if (isMainModule(import.meta.url)) {
  main().then(() => process.exit(0)).catch(err => { console.error(`\n❌ ${err.message}\n`); process.exit(1); });
}
