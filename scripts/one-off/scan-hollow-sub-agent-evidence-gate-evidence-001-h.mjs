#!/usr/bin/env node
/**
 * scan-hollow-sub-agent-evidence-gate-evidence-001-h.mjs
 *
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H / FR-3
 *
 * One-time retroactive census: sub_agent_execution_results rows with verdict IN
 * ('PASS','CONDITIONAL_PASS') whose findings/warnings/recommendations are ALL empty — the shape
 * FR-1/FR-2 now refuse or hard-fail on going forward. `findings` has no dedicated column (see
 * results-storage.js's PERSISTED_ELSEWHERE): a caller's top-level findings land in
 * metadata.findings, so emptiness is checked there, not on a non-existent findings column.
 *
 * WHY THE DEFAULT --since IS QF-20260803-007's MERGE DATE (2026-08-07), following the precedent
 * in scan-completed-sds-for-never-pushed-merge-verification-never-001.mjs's own header: that QF
 * is what first made `summary` land on the row at all. A row created before that fix can be
 * legitimately empty on every one of these fields for reasons that predate this SD's defect class
 * entirely, not because the writer silently dropped a caller's real content — scanning further
 * back would conflate two different eras under one count. A wider historical sweep remains
 * available via an explicit --since, same escape hatch as that precedent.
 *
 * Best-effort audit_log cross-reference: audit_log is this repo's GENERIC DB-change log, not a
 * dedicated storeSubAgentResults call log, so a missing corroborating row is not evidence either
 * way — it is reported per-row (`audit_log_corroborated`) for a human reviewer, never used to
 * include or exclude a row from the count itself.
 *
 * Idempotency: writes the baseline count + affected SD-key list onto THIS SD's own row
 * (strategic_directives_v2.metadata.hollow_evidence_census) exactly once per --commit run;
 * re-running with --commit overwrites with a freshly-measured snapshot (there is exactly one
 * "baseline," not an accumulating history) rather than erroring on a second run.
 *
 * Usage:
 *   node scripts/one-off/scan-hollow-sub-agent-evidence-gate-evidence-001-h.mjs
 *   node scripts/one-off/scan-hollow-sub-agent-evidence-gate-evidence-001-h.mjs --commit
 *   node scripts/one-off/scan-hollow-sub-agent-evidence-gate-evidence-001-h.mjs --since 2026-01-01
 *   node scripts/one-off/scan-hollow-sub-agent-evidence-gate-evidence-001-h.mjs --json
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H';
const DEFAULT_SINCE = '2026-08-07'; // QF-20260803-007 merge date — see file header

function parseArgs(argv) {
  const args = { dryRun: true, since: DEFAULT_SINCE, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--commit') args.dryRun = false;
    else if (a === '--json') args.json = true;
    else if (a === '--since' && argv[i + 1]) { args.since = argv[++i]; }
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const hasEntries = (v) => Array.isArray(v) && v.some((item) => {
  if (item == null) return false;
  if (typeof item === 'string') return item.trim().length > 0;
  if (typeof item === 'object') return Object.keys(item).length > 0;
  return true;
});

const hasText = (v) => typeof v === 'string' && v.trim().length > 0;

// metadata.findings may be an array (the writer's own `results.findings || []` default) or an
// object (a caller passing a keyed findings map, as several live sub-agents do) — see
// results-storage.js:579.
const hasFindingsContent = (v) => (Array.isArray(v) ? hasEntries(v) : Boolean(v && typeof v === 'object' && Object.keys(v).length > 0));

/**
 * MEASURED CORRECTION mid-EXEC: a naive check on only warnings/recommendations/findings flagged
 * 854/7826 (~11%) rows, overwhelmingly VISION_FIDELITY (580 of the 854). Spot-checking a
 * VISION_FIDELITY row (id 12db02c8) found real, substantive content — vision_key,
 * total_elements, delivered_count, vision_coverage_pct, etc — just under sub-agent-SPECIFIC
 * metadata keys, never routed through findings/warnings/recommendations at all. That is a
 * DIFFERENT, legitimate evidence shape, not the writer silently dropping a caller's content —
 * flagging it would have overstated the baseline this SD exists to measure by roughly 68%.
 *
 * The distinguishing signal is not "are these three fields empty" but "did the CALLER supply any
 * content that survived, under ANY name." BOOKKEEPING_KEYS are fields results-storage.js itself
 * always adds regardless of what a caller sent (see its `metadata` object construction) — every
 * OTHER metadata key present is something a caller's own results.metadata supplied and the writer
 * persisted correctly, which is proof this specific defect class did NOT occur on this row, even
 * though findings/warnings/recommendations happen to be empty for this sub-agent's own design.
 */
const BOOKKEEPING_KEYS = new Set([
  'sub_agent_version', 'error', 'stack', 'message', 'hallucination_check', 'routing', 'phase',
  'original_verdict', 'verdict_chain', '_verdict_chain_from_caller_ignored', 'findings',
  '_findings_stripped', '_findings_had_keys', 'repo_path', 'repo_resolved', 'registry_source',
  'executed_from_cwd', 'evaluated_commit_sha', 'test_execution', 'failure_cause', 'sd_type',
  'target_application',
]);
// These two are bookkeeping ONLY when the writer's own empty default -- either can carry real
// caller content, which counts as substance same as any other key.
const EMPTY_UNLESS_POPULATED_KEYS = new Set(['options', 'metrics']);

function hasOtherMetadataSubstance(metadata) {
  if (!metadata || typeof metadata !== 'object') return false;
  for (const [key, value] of Object.entries(metadata)) {
    if (BOOKKEEPING_KEYS.has(key)) continue;
    if (EMPTY_UNLESS_POPULATED_KEYS.has(key)) {
      if (value && typeof value === 'object' && Object.keys(value).length > 0) return true;
      continue;
    }
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'object' && Object.keys(value).length === 0) continue;
    return true; // an unrecognized key with a real value -- caller content the writer preserved
  }
  return false;
}

function isHollow(row) {
  const findingsEmpty = !hasFindingsContent(row.metadata?.findings) && !row.metadata?._findings_had_keys?.length;
  return findingsEmpty
    && !hasEntries(row.warnings)
    && !hasEntries(row.recommendations)
    && !hasText(row.summary)
    && !hasOtherMetadataSubstance(row.metadata);
}

async function checkAuditCorroboration(supabase, row) {
  try {
    const { data } = await supabase
      .from('audit_log')
      .select('id')
      .eq('entity_id', row.id)
      .limit(1);
    return Boolean(data && data.length > 0);
  } catch {
    return null; // audit_log shape/availability varies — never treat a lookup failure as evidence
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Usage: scan-hollow-sub-agent-evidence-gate-evidence-001-h.mjs [--commit] [--since YYYY-MM-DD] [--json]');
    process.exit(0);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(2);
  }
  const supabase = createClient(url, key);

  if (!args.json) {
    console.log(`[HOLLOW_EVIDENCE_SCAN] mode=${args.dryRun ? 'DRY-RUN' : 'COMMIT'} since=${args.since}`);
    console.log('─'.repeat(72));
  }

  const PAGE_SIZE = 500;
  let offset = 0;
  let totalScanned = 0;
  const specimens = [];

  for (;;) {
    const { data, error } = await supabase
      .from('sub_agent_execution_results')
      .select('id, sd_id, sub_agent_code, verdict, summary, warnings, recommendations, metadata, created_at')
      .in('verdict', ['PASS', 'CONDITIONAL_PASS'])
      .gte('created_at', args.since)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error('Page query failed:', error.message);
      process.exit(2);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      totalScanned++;
      if (!isHollow(row)) continue;

      const corroborated = await checkAuditCorroboration(supabase, row);
      specimens.push({
        id: row.id,
        sd_id: row.sd_id,
        sd_key: row.metadata?.sd_key || null, // resolved below when absent
        sub_agent_code: row.sub_agent_code,
        verdict: row.verdict,
        created_at: row.created_at,
        audit_log_corroborated: corroborated,
      });
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // Resolve sd_key for any specimen whose metadata never carried one (the specimen's own
  // sub_agent_code/id/etc are unaffected by this — sd_key is display/logging only, per this
  // writer's own PERSISTED_ELSEWHERE note). One batched lookup, not one query per specimen.
  const unresolvedSdIds = [...new Set(specimens.filter((s) => !s.sd_key).map((s) => s.sd_id).filter(Boolean))];
  if (unresolvedSdIds.length > 0) {
    const { data: sdRows } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key')
      .in('id', unresolvedSdIds);
    const sdKeyById = new Map((sdRows || []).map((r) => [r.id, r.sd_key]));
    for (const s of specimens) {
      if (!s.sd_key) s.sd_key = sdKeyById.get(s.sd_id) || s.sd_id;
    }
  }
  const affectedSdKeys = new Set(specimens.map((s) => s.sd_key));

  if (!args.json) {
    for (const s of specimens) {
      console.log(`  ◇ ${s.id} sd=${s.sd_key} code=${s.sub_agent_code} verdict=${s.verdict} created=${s.created_at}`);
    }
  }

  const summary = {
    since: args.since,
    scanned: totalScanned,
    hollow_count: specimens.length,
    affected_sd_keys: [...affectedSdKeys],
    specimens,
    measured_at: new Date().toISOString(),
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log('─'.repeat(72));
    console.log(`Scanned ${totalScanned} PASS/CONDITIONAL_PASS rows since ${args.since}; ${specimens.length} hollow (all-empty findings/warnings/recommendations).`);
    console.log(args.dryRun ? '(dry-run — baseline not persisted; re-run with --commit to write it onto this SD\'s row)' : '(commit mode — baseline persisted below)');
  }

  if (!args.dryRun) {
    const { data: sdRow, error: readErr } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('sd_key', SD_KEY)
      .maybeSingle();
    if (readErr) {
      console.error('Failed to read SD row for baseline persistence:', readErr.message);
      process.exit(2);
    }
    const metadata = { ...(sdRow?.metadata || {}), hollow_evidence_census: summary };
    // SECURITY sub-agent (EXEC, S4): a 0-row UPDATE (no matching sd_key) still returns
    // error===null from PostgREST -- this SD's own defect class, in this SD's own script.
    // .select() forces a return of the actually-affected row(s), so success is confirmed by
    // COUNT, not by absence-of-error.
    const { data: updated, error: writeErr } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata })
      .eq('sd_key', SD_KEY)
      .select('sd_key');
    if (writeErr) {
      console.error('Failed to persist baseline onto SD row:', writeErr.message);
      process.exit(2);
    }
    if (!updated || updated.length === 0) {
      console.error(`Baseline NOT persisted: no row matched sd_key=${SD_KEY} -- the update affected 0 rows despite no error.`);
      process.exit(2);
    }
    if (!args.json) console.log(`Baseline persisted onto ${SD_KEY}.metadata.hollow_evidence_census`);
  }

  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(err => {
    console.error('UNEXPECTED ERROR:', err);
    process.exit(2);
  });
}

export { isHollow };
