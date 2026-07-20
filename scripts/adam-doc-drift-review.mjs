#!/usr/bin/env node
/**
 * SD-LEO-INFRA-REGISTER-TWO-EVERY-001 (DUTY 1) — every-3-day propose-only doc-drift review.
 *
 * Near-verbatim sibling of scripts/adam-self-adherence-review.mjs (same IO-seam / pure-analyzer /
 * propose-only-feedback shape) with WINDOW_DAYS=3. It reads ONLY the SDs/QFs COMPLETED in the trailing
 * 3 days (delta-scoped — NOT a full doc scour; doc-health-audit.mjs is explicitly out of scope), maps
 * each by sd_type to the doc directories most likely affected (SD_TYPE_DOC_DIRECTORIES), clusters by
 * dir + type WITHOUT enumerating (~125 completions/window), and surfaces ONE propose-only doc-update
 * proposal to the coordinator via a feedback flag.
 *
 * CONST-002: this NEVER edits a doc, claims an SD, opens a PR, or runs a handoff. It writes a single
 * feedback row (the coordinator/fleet triages it into doc work). Inertness is enforced at the WORKFLOW
 * level: .github/workflows/adam-doc-drift-cron.yml gates on ADAM_DOC_DRIFT_V1 (default OFF) — the script
 * itself just does its read-only analysis + propose-only write when invoked.
 *
 *   node scripts/adam-doc-drift-review.mjs            # real run (reads completions, writes one proposal)
 *   node scripts/adam-doc-drift-review.mjs --dry-run  # reads + reports the cluster, NO feedback write
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { SD_TYPE_DOC_DIRECTORIES } from '../lib/utils/post-completion-requirements.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: strategic_directives_v2 and
// quick_fixes are both growing tables; a 3-day completion window is usually small but not
// operationally pinned, so unbounded reads paginate rather than trust an implicit cap.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const WINDOW_DAYS = 3;
const PROPOSAL_CATEGORY = 'adam_doc_drift';

/** ISO timestamp for `windowDays` ago. */
export function windowStart(windowDays = WINDOW_DAYS, nowMs = Date.now()) {
  return new Date(nowMs - windowDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * IO seam — read-only. Completed SDs (updated_at is the completion proxy; there is NO completed_at
 * column on strategic_directives_v2, per sd-burnrate.js/sd-status.js) excluding QF-% keys, UNION
 * completed QFs (quick_fixes carries completed_at natively). Fail-soft per source: a query error logs
 * and continues with whatever resolved, so one broken source never sinks the whole review.
 */
export async function resolveCompletions(supabase, { windowDays = WINDOW_DAYS, nowMs = Date.now() } = {}) {
  const since = windowStart(windowDays, nowMs);
  const items = [];
  try {
    const data = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, sd_type, updated_at')
      .eq('status', 'completed')
      .gte('updated_at', since)
      .not('sd_key', 'like', 'QF-%')
      .order('sd_key', { ascending: true })); // unique tiebreaker (FR-6)
    for (const r of data) items.push({ key: r.sd_key, title: r.title, sd_type: r.sd_type || 'feature', kind: 'sd' });
  } catch (e) { console.warn(`[doc-drift] completed-SD query failed (continuing): ${e.message}`); }
  try {
    const data = await fetchAllPaginated(() => supabase
      .from('quick_fixes')
      .select('id, title, type, completed_at')
      .eq('status', 'completed')
      .gte('completed_at', since)
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
    // QF.type (bug/polish/typo/documentation/...) only maps cleanly if it is a known doc-dir key;
    // otherwise default a small fix to 'bugfix' (troubleshooting/changelog area) rather than mis-routing.
    for (const r of data) {
      const t = (r.type && SD_TYPE_DOC_DIRECTORIES[r.type]) ? r.type : 'bugfix';
      items.push({ key: r.id, title: r.title, sd_type: t, kind: 'qf' });
    }
  } catch (e) { console.warn(`[doc-drift] completed-QF query failed (continuing): ${e.message}`); }
  return items;
}

/**
 * PURE/TOTAL: cluster completed items by candidate doc directory and by work type, summarizing WITHOUT
 * enumerating the ~125 completions. Unknown sd_types fall back to the 'feature' dir set. Returns ranked
 * dir + type breakdowns (the proposal surfaces the top areas, never the full list).
 * @param {Array<{sd_type?:string}>} items
 * @param {Object<string,string[]>} [dirMap]
 */
export function clusterDocDrift(items, dirMap = SD_TYPE_DOC_DIRECTORIES) {
  const list = Array.isArray(items) ? items : [];
  const byDir = new Map();
  const byType = new Map();
  for (const it of list) {
    const t = (it && typeof it.sd_type === 'string' && it.sd_type.trim() ? it.sd_type : 'feature').toLowerCase();
    byType.set(t, (byType.get(t) || 0) + 1);
    const dirs = (dirMap && (dirMap[t] || dirMap.feature)) || [];
    for (const d of dirs) {
      const e = byDir.get(d) || { count: 0, types: new Set() };
      e.count += 1; e.types.add(t); byDir.set(d, e);
    }
  }
  const dirRank = [...byDir.entries()]
    .map(([dir, e]) => ({ dir, count: e.count, types: [...e.types].sort() }))
    .sort((a, b) => b.count - a.count || a.dir.localeCompare(b.dir));
  const typeRank = [...byType.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  return { total: list.length, dirRank, typeRank };
}

/** PURE: render the propose-only proposal text (clustered, top-N, no enumeration). */
export function formatDocDriftProposal(cluster, windowDays = WINDOW_DAYS) {
  const c = cluster || { total: 0, dirRank: [], typeRank: [] };
  if (!c.total) return `Doc-drift review (trailing ${windowDays}d): 0 completions — nothing to review.`;
  return [
    `Doc-drift review (trailing ${windowDays}d): ${c.total} completed SD(s)/QF(s) may have drifted their docs.`,
    'Top doc areas to review (by affected-completion count):',
    ...c.dirRank.slice(0, 8).map((d) => `  - ${d.dir} (${d.count}; types: ${d.types.join('/')})`),
    `By work type: ${c.typeRank.slice(0, 8).map((t) => `${t.type}×${t.count}`).join(', ')}`,
    'PROPOSE-ONLY: triage which dirs actually need updates (Adam does not edit docs — CONST-002).',
  ].join('\n');
}

/** PROPOSE-ONLY (CONST-002): write a single feedback flag. Returns the feedback id. */
export async function sourceDocDriftProposal(supabase, cluster, { windowDays = WINDOW_DAYS, runId = crypto.randomUUID() } = {}) {
  const { data, error } = await supabase
    .from('feedback')
    .insert({
      type: 'issue',
      source_application: 'EHG_Engineer',
      source_type: 'manual_capture',
      category: PROPOSAL_CATEGORY,
      status: 'new',
      severity: 'low',
      title: `Adam doc-drift proposal (${cluster.total} completions, ${windowDays}d)`,
      description: formatDocDriftProposal(cluster, windowDays),
      metadata: { run_id: runId, window_days: windowDays, dir_rank: cluster.dirRank.slice(0, 12), type_rank: cluster.typeRank, sd: 'SD-LEO-INFRA-REGISTER-TWO-EVERY-001' },
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

/** Run one doc-drift review. Silent (no write) when the window is empty. */
export async function runDocDriftReview(supabase, { dryRun = false, windowDays = WINDOW_DAYS, runId = crypto.randomUUID() } = {}) {
  const items = await resolveCompletions(supabase, { windowDays });
  const cluster = clusterDocDrift(items);
  if (dryRun || cluster.total === 0) return { runId, cluster, proposalRef: null, dryRun };
  const proposalRef = await sourceDocDriftProposal(supabase, cluster, { windowDays, runId });
  return { runId, cluster, proposalRef, dryRun: false };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const result = await runDocDriftReview(supabase, { dryRun });
  console.log(formatDocDriftProposal(result.cluster));
  console.log(result.proposalRef
    ? `-> propose-only feedback ${result.proposalRef}`
    : (result.cluster.total === 0 ? 'no completions in window -> silent' : '[dry-run] no write'));
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) main().catch((e) => { console.error('doc-drift review failed:', e.message); process.exit(1); });
