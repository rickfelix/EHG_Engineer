#!/usr/bin/env node
/**
 * drain-intake.mjs — unify + drain the intake pools into the conversion ledger.
 * SD-LEO-INFRA-UNIFY-INTAKE-POOLS-001 (FR-4 / FR-5)
 *
 * Reads the 3 pools, normalizes each to the ledger schema, registers them in the
 * conversion_ledger, runs the PURE rule-based triage classifier, and applies a
 * terminal disposition to each. Novel items are promoted via the EXISTING
 * leo-create-sd.js --from-proposal ingest (no fork). Source rows are STATUS-UPDATED,
 * NEVER deleted.
 *
 *   DEFAULT = --dry-run: zero writes; reports the full disposition plan.
 *   --apply : registers items, applies dispositions, promotes novel items,
 *             and status-updates source rows (idempotent + reversible).
 *
 * Usage:
 *   node scripts/intake/drain-intake.mjs              # dry-run (default)
 *   node scripts/intake/drain-intake.mjs --apply
 *   node scripts/intake/drain-intake.mjs --dry-run --limit 50
 */
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env', override: true });
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { classify } from '../../lib/intake/triage-classifier.js';
import { registerItem, setDisposition, backlogDepth } from '../../lib/intake/conversion-ledger.js';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY; // dry-run is the default
const limIdx = process.argv.indexOf('--limit');
const _rawLimit = limIdx !== -1 ? parseInt(process.argv[limIdx + 1], 10) : null;
if (_rawLimit !== null && (!Number.isInteger(_rawLimit) || _rawLimit <= 0)) {
  console.error(`--limit must be a positive integer (got "${process.argv[limIdx + 1]}")`);
  process.exit(1);
}
const LIMIT = _rawLimit; // applied UNIFORMLY across the combined batch (not just Pool-1)
const PROPOSALS_DIR = path.resolve('.prd-payloads');

/** D1: priority_score (numeric, 0-1 or 0-100) -> normalized_priority. */
function normalizePriorityScore(score) {
  if (score == null || Number.isNaN(Number(score))) return 'medium';
  let s = Number(score);
  if (s > 1) s = s / 100; // accept a 0-100 scale
  if (s >= 0.8) return 'critical';
  if (s >= 0.6) return 'high';
  if (s >= 0.4) return 'medium';
  return 'low';
}

function normalizePriorityText(p) {
  return ['critical', 'high', 'medium', 'low'].includes(p) ? p : 'medium';
}

async function loadExistingSds(sb) {
  // Paginate — PostgREST caps a single select at 1000 rows; the dedup corpus
  // MUST be the full SD set or already-shipped work gets misclassified as novel.
  const all = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb.from('strategic_directives_v2')
      .select('sd_key, title, scope, description, key_changes')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`loadExistingSds: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

async function loadCapabilities(sb) {
  const { data, error } = await sb.from('sd_capabilities').select('name, description');
  if (error) return []; // table optional; coverage check just no-ops
  return data || [];
}

/** Pool 1: eva_consultant_recommendations (live source). */
async function loadPool1(sb) {
  const { data, error } = await sb.from('eva_consultant_recommendations')
    .select('id, trend_id, title, description, priority_score, action_type, status')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`loadPool1: ${error.message}`);
  return (data || []).map(r => ({
    source_pool: 'eva_consultant_rec',
    source_id: r.id,
    source_external_id: r.trend_id || null,
    title: r.title || '(untitled)',
    description: r.description || null,
    normalized_priority: normalizePriorityScore(r.priority_score),
    action_type: r.action_type,
    _source: r,
  }));
}

/** Pool 2: sd_proposals — D4: schema-reserved, SKIPPED while empty. */
async function loadPool2(sb) {
  const { count } = await sb.from('sd_proposals').select('id', { count: 'exact', head: true });
  if (!count) return [];
  // Non-empty path intentionally deferred (D4): fn_create_sd_from_proposal mints
  // non-canonical keys. When Pool-2 gains rows, wire normalization here.
  console.warn(`   ⚠️  Pool-2 (sd_proposals) has ${count} rows — D4 deferral: skipping (not yet wired).`);
  return [];
}

/** Pool 3: .prd-payloads/PROPOSAL-*.json files (proposal residue awaiting materialization). */
function loadPool3() {
  let files = [];
  try { files = readdirSync(PROPOSALS_DIR).filter(f => /^PROPOSAL-.*\.json$/.test(f)); }
  catch { return []; }
  const items = [];
  for (const f of files) {
    try {
      const j = JSON.parse(readFileSync(path.join(PROPOSALS_DIR, f), 'utf8'));
      items.push({
        source_pool: 'prd_payload_file',
        source_id: f,
        source_external_id: j.proposed_sd_key || j.sd_key || null,
        title: j.title || f,
        description: j.rationale || j.description || null,
        normalized_priority: normalizePriorityText(j.priority),
        action_type: 'create_sd', // proposals are SD candidates by construction
        _proposalPath: path.join(PROPOSALS_DIR, f),
        _json: j,
      });
    } catch (e) { console.warn(`   ⚠️  skipping unparseable ${f}: ${e.message}`); }
  }
  return items;
}

async function main() {
  const sb = createSupabaseServiceClient();
  console.log(`\n=== intake drain (${DRY_RUN ? 'DRY-RUN — zero writes' : 'APPLY'}) ===`);

  const [pool1, pool2, existingSds, capabilities] = await Promise.all([
    loadPool1(sb), loadPool2(sb), loadExistingSds(sb), loadCapabilities(sb),
  ]);
  const pool3 = loadPool3();
  let items = [...pool1, ...pool2, ...pool3];
  if (LIMIT) items = items.slice(0, LIMIT); // uniform cap across all pools
  const existingSdKeys = new Set(existingSds.map(s => s.sd_key).filter(Boolean));
  console.log(`   pools: eva_consultant_rec=${pool1.length}, sd_proposal=${pool2.length}, prd_payload_file=${pool3.length} | total=${items.length}`);
  console.log(`   existing SDs (dedup corpus)=${existingSds.length}, capabilities=${capabilities.length}`);

  const tally = { dismissed: 0, merged_duplicate: 0, deferred: 0, converted: 0 };
  const byVerdict = {};
  const promoted = [];
  let applied = 0, skipped = 0;

  for (const item of items) {
    const verdict = classify(item, { existingSds, capabilities, existingSdKeys });
    const d = verdict.disposition || 'deferred';
    tally[d] = (tally[d] || 0) + 1;
    byVerdict[verdict.triage_verdict] = (byVerdict[verdict.triage_verdict] || 0) + 1;

    if (DRY_RUN) continue;

    // --- APPLY (idempotent, status-update-only, never delete) ---
    try {
      const row = await registerItem({
        source_pool: item.source_pool, source_id: item.source_id,
        source_external_id: item.source_external_id, title: item.title,
        description: item.description, normalized_priority: item.normalized_priority,
      }, { client: sb });
      if (row && row.disposition) {
        // Already triaged (idempotent). IDEMP-3: still reconcile the SOURCE status
        // in case a prior run dispositioned the ledger but failed the source update.
        if (item.source_pool === 'eva_consultant_rec') {
          await sb.from('eva_consultant_recommendations').update({ status: 'triaged' }).eq('id', item.source_id);
        }
        skipped++; continue;
      }

      let linked_sd_key = null, promoted_proposal_path = null, disposition = verdict.disposition;
      if (verdict.promote) {
        // Promote novel items via the EXISTING --from-proposal ingest (no fork).
        const proposalPath = item._proposalPath || await writeProposalForItem(item);
        promoted_proposal_path = proposalPath;
        process.env.SDKEY_SKIP_PROTOCOL_READ = '1';
        const { createFromProposal } = await import('../leo-create-sd.js');
        const created = await createFromProposal(proposalPath, { dryRun: false });
        // createFromProposal returns [{sdKey, file, action}] (camelCase).
        const linked = Array.isArray(created) ? (created.find(r => r && r.sdKey) || created[0]) : created;
        linked_sd_key = (linked && (linked.sdKey || linked.sd_key)) || null;
        disposition = 'converted';
        // DEDUP-03: add the just-promoted SD to the in-run corpus so subsequent
        // items in THIS batch dedup against it (prevents intra-batch duplicates).
        if (linked_sd_key) {
          existingSds.push({ sd_key: linked_sd_key, title: item.title, scope: '', description: item.description || '', key_changes: [] });
          existingSdKeys.add(linked_sd_key);
        }
      }
      await setDisposition(row.id, {
        disposition,
        triage_verdict: verdict.triage_verdict,
        dedup_match_sd_key: verdict.dedup_match_sd_key,
        dedup_score: verdict.dedup_score,
        dismiss_reason: verdict.dismiss_reason,
        linked_sd_key, promoted_proposal_path,
      }, { client: sb });

      // Status-update the SOURCE row (never delete). Defensive: non-fatal on CHECK conflicts.
      if (item.source_pool === 'eva_consultant_rec') {
        const { error: upErr } = await sb.from('eva_consultant_recommendations')
          .update({ status: 'triaged' }).eq('id', item.source_id);
        if (upErr) console.warn(`   ⚠️  source status-update skipped for ${item.source_id}: ${upErr.message}`);
      }
      if (verdict.promote) promoted.push(linked_sd_key || promoted_proposal_path);
      applied++;
    } catch (e) {
      console.error(`   ❌ apply failed for ${item.source_pool}:${item.source_id}: ${e.message}`);
    }
  }

  console.log('\n--- disposition plan ---');
  console.log(`   dismissed       : ${tally.dismissed || 0}`);
  console.log(`   merged_duplicate: ${tally.merged_duplicate || 0}`);
  console.log(`   deferred        : ${tally.deferred || 0}`);
  console.log(`   converted       : ${tally.converted || 0}  (promote candidates)`);
  console.log('   by verdict      :', JSON.stringify(byVerdict));

  if (DRY_RUN) {
    console.log('\n   DRY-RUN: zero writes. Re-run with --apply to register + disposition + promote.');
  } else {
    const depth = await backlogDepth({ client: sb });
    console.log(`\n   APPLIED: ${applied} dispositioned, ${skipped} already-triaged (idempotent), ${promoted.length} promoted.`);
    console.log(`   backlog depth now (disposition IS NULL): ${depth}`);
  }
}

/**
 * Write a PROPOSAL-*.json for a promote item that has no source file (Pool-1 create_sd).
 * The proposed_sd_key + filename are DETERMINISTIC per source item, so a re-run
 * reuses the same key — createFromProposal's keyExists guard then makes promotion
 * idempotent (no duplicate SD on crash-then-rerun). proposed_sd_key is REQUIRED by
 * validateProposalShape (a non-empty string) — omitting it process.exit(1)s the run.
 */
async function writeProposalForItem(item) {
  const { writeFileSync, mkdirSync } = await import('fs');
  mkdirSync(PROPOSALS_DIR, { recursive: true });
  const shortId = String(item.source_id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase() || 'ITEM';
  const proposedKey = `SD-LEO-INTAKE-${shortId}`;
  const fpath = path.join(PROPOSALS_DIR, `PROPOSAL-${proposedKey}.json`);
  writeFileSync(fpath, JSON.stringify({
    PROPOSAL: true,
    proposed_sd_key: proposedKey,
    status_intended: 'draft',
    title: item.title,
    sd_type: 'infrastructure',
    priority: item.normalized_priority || 'medium',
    rationale: item.description || `Promoted from intake (${item.source_pool}:${item.source_id})`,
    provenance: { source: 'drain-intake', source_pool: item.source_pool, source_id: item.source_id },
  }, null, 2));
  return fpath;
}

main().catch(e => { console.error('drain-intake FAILED:', e?.stack || e); process.exit(1); });
