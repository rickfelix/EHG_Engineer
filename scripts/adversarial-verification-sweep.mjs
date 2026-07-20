#!/usr/bin/env node
/**
 * adversarial-verification-sweep.mjs — SD-LEO-INFRA-ADVERSARIAL-VERIFICATION-SWEEP-001.
 *
 * A three-phase adversarial sweep that takes a REFUTE stance toward "machinery-class" work that
 * claims to be done: assemble a backlog of things-that-assert-they-work, classify each against
 * real reachability/side-effect evidence (default to REFUTED when uncertain — a green checkmark is
 * not evidence), then write a durable per-item verdict to a verification ledger.
 *
 *   PHASE ASSEMBLE  (--assemble --out <path>)  — read-only. Enumerate the denominator.
 *   PHASE CLASSIFY  (exported pure classifyItem) — no I/O; the decision table.
 *   PHASE LEDGER    (--write-ledger <dispositions.json>) — one durable feedback row per item.
 *
 * ── RUN LOCATION (hard requirement) ─────────────────────────────────────────────────────────────
 * MUST be invoked with cwd = the EHG_Engineer repo ROOT. `import 'dotenv/config'` resolves `.env`
 * from process.cwd(), and the assemble/ledger phases need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * plus the `gh` CLI on PATH. Running the worktree copy is fine (ESM relative imports resolve against
 * the script's own location), but cwd must be the root, e.g.:
 *   node .worktrees/SD-.../scripts/adversarial-verification-sweep.mjs --assemble --out sweep.json
 *
 * ── CONSUMING QUERY (coverage-matrix "sign-of-life" cells) ──────────────────────────────────────
 * The coverage matrix reads back each item's live verdict from the ledger with:
 *   SELECT metadata->>'work_key', metadata->>'disposition', metadata->>'evidence_pointer', updated_at
 *   FROM feedback WHERE category='verification_ledger';
 *
 * ── WHY feedback, NOT coverage_matrix ───────────────────────────────────────────────────────────
 * coverage_matrix carries CHECK constraints on BOTH `status` and `surface_class` that reject this
 * ledger's vocabulary (disposition values like 'refuted_dormant'/'unverifiable' are not in its
 * allowed sets) — verified against pg_constraint on 2026-07-05. The feedback table is the durable,
 * queryable home whose category column is unconstrained, so category='verification_ledger' is a
 * clean namespace that the consuming query above filters on.
 *
 * ── DEVIATIONS from the SD spec, forced by feedback CHECK/NOT-NULL constraints (verified 2026-07-05)
 *   1. source_type: the spec asks for 'adversarial_sweep', but feedback_source_type_check REJECTS
 *      that value (allowed set: manual_feedback|auto_capture|uat_failure|error_capture|
 *      uncaught_exception|unhandled_rejection|manual_capture|todoist_intake|youtube_intake|
 *      claude_code_intake|telegram|user_feedback). We write source_type='auto_capture' (closest
 *      allowed value — this is automated tooling capture) and PRESERVE the intended provenance in
 *      metadata.sweep_source_type='adversarial_sweep' so nothing is lost.
 *   2. type: feedback.type is NOT NULL with no default and the spec omitted it → we set 'issue'.
 *   3. source_application: NOT NULL with no default, spec omitted it → we set 'EHG_Engineer'.
 * These are the minimum changes required for the ledger writer to actually succeed; the row's
 * category/status/severity and the full metadata block match the spec exactly.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  PLATFORM_REPOS,
  WITNESS_CUTOVER_ISO,
  defaultFetchMergedPlatformPRs,
  detectUnwitnessedMerges,
} from '../lib/ship/witness-adoption.mjs';

export const SWEPT_BY_SD = 'SD-LEO-INFRA-ADVERSARIAL-VERIFICATION-SWEEP-001';
const WINDOW_DAYS = 30;
const LEDGER_CATEGORY = 'verification_ledger';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: a single-page `.limit(5000)` bound
// USED TO live here (PAGE_LIMIT), but PostgREST's server-side db-max-rows cap silently clamps any
// unranged read at 1000 regardless of a higher client .limit() — so the truncation check built on
// it could never fire. All SD/QF/telemetry denominator reads now go through fetchAllRows() below
// (paginated to true completion), so no single-page bound is needed anymore.

/**
 * Fetch EVERY row of a query by paginating in PAGE_SIZE chunks — complete by construction,
 * so consumers need no truncation heuristics. Used for the reads whose COMPLETENESS is
 * load-bearing (witnessed-merge set; ledger set-difference), where a silently short read
 * flips verdicts rather than just under-counting.
 */
const PAGE_SIZE = 1000;
export async function fetchAllRows(supabase, table, columns, applyFilters) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    // Stable unique ordering makes offset pagination provably complete — without it,
    // PostgREST guarantees no default order and a concurrent write during a multi-page
    // read could skip/duplicate a row across a page boundary (PR #5666 review INFO).
    let q = supabase
      .from(table)
      .select(columns)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table} paginated query failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

// Machinery-class filter: title/description must smell like an automated moving part (something
// that RUNS and has an observable side effect), because those are exactly the items whose "done"
// status a green build cannot substantiate. Docs/CHANGELOG-only completions are excluded — they
// have no runtime to refute.
export const MACHINERY_PATTERNS =
  /watcher|writer|recorder|router|cron|hook|daemon|scheduler|sweep|gauge|detector|enforc|monitor|reconcil|listener|trigger|heartbeat|resurface|escalat/i;

/** Pure: does this item's text describe an automated moving part? (RECALL stage) */
export function isMachinery(title, description) {
  return MACHINERY_PATTERNS.test(`${title || ''}\n${description || ''}`);
}

// PRECISION stage (added after the first real assemble run): the recall regex matched 67% of ALL
// completed SDs (design passes, UI cosmetics, contract builds) because LEO prose is saturated with
// verbs like "monitor"/"trigger"/"enforce". Machinery-CLASS means the COMPLETION SHIPPED an
// unattended-execution artifact — something that runs on a schedule/event with an observable side
// effect. Precision requires an artifact NOUN in the TITLE (not incidental prose) or file-path
// evidence of a hook/cron/watcher artifact. Both recall and precision counts are emitted so the
// denominator narrowing is auditable, never silent.
const STRONG_TITLE_PATTERNS =
  /\b(cron|daemon|watchdog|watcher|poller|listener|scheduler|sweeper?|sweep\b|heartbeat|liveness|reconciler?|resurfacer?|gauge|stop[- ]hook|(pre|post)tool(use)?[- ]?hook|sessionstart[- ]?hook|auto[- ]?(file[rs]?|refill|escalat\w*|resurface\w*|remediat\w*|merge[rs]?|validat\w*|purge[rs]?|reaper)|detector|enforcer|recorder|router|writer[s]?\b)\b/i;
const FILE_EVIDENCE_PATTERNS =
  /(scripts\/hooks\/|-cron\.|cron-|-watcher|watcher-|-daemon|daemon-|-sweep|sweep-|gauge-runner|scheduler|-reaper|heartbeat|stale-session|resurface)/i;
const PRECISION_EXCLUDE_TITLE = /\b(design pass|design-pass|cosmetic|wireframe|walkthrough|changelog|readme)\b/i;

/** Pure: PRECISION — did this completion ship an unattended-execution artifact? */
export function isStrongMachinery(title, description, files) {
  const t = title || '';
  if (PRECISION_EXCLUDE_TITLE.test(t)) return false;
  if (STRONG_TITLE_PATTERNS.test(t)) return true;
  const fileText = Array.isArray(files) ? files.join('\n') : (files || '');
  return FILE_EVIDENCE_PATTERNS.test(fileText);
}

/** Pure: docs/CHANGELOG-only completion — excluded from the machinery denominator (no runtime). */
export function isDocsOnly(title, description) {
  const t = title || '';
  if (/^\s*docs?\s*(\(|:|\b)/i.test(t)) return true; // conventional-commit `docs(...)` / `docs:`
  if (/^\s*changelog\b/i.test(t)) return true;
  const text = `${t}\n${description || ''}`;
  return /\b(changelog entry|documentation only|docs only|doc-only|docs-only)\b/i.test(text);
}

/**
 * PHASE CLASSIFY — PURE. REFUTE stance: default to refuted/unverifiable whenever the evidence does
 * not affirmatively prove a working side effect. A pass (`verified_working`) is only ever returned
 * when reachability AND an observed side effect are both explicitly true.
 *
 * @param {{
 *   reachable: true|false|null,
 *   triggerFired: true|false|null,
 *   sideEffectObserved: true|false|null,
 *   safetyBar: 'read_only'|'fixture_safe'|'unsafe',
 *   notes?: string,
 *   reachabilityTraceComplete?: boolean   // discriminator for the reachable===null row of the table:
 *                                         //   true  → trace ran and found no live path (dormant)
 *                                         //   false/absent → trace never completed (unverifiable)
 * }} checkResults
 * @returns {{ disposition: string, reason?: string, evidence: object }}
 */
export function classifyItem(checkResults) {
  const cr = checkResults || {};
  const reachable = cr.reachable ?? null;
  const triggerFired = cr.triggerFired ?? null;
  const sideEffectObserved = cr.sideEffectObserved ?? null;
  const safetyBar = cr.safetyBar ?? null;
  const evidence = {
    reachable,
    triggerFired,
    sideEffectObserved,
    safetyBar,
    notes: cr.notes ?? null,
  };

  // reachable === false → refuted_dormant
  if (reachable === false) {
    return { disposition: 'refuted_dormant', evidence };
  }

  // reachable === true && sideEffectObserved === false && triggerFired === true → refuted_broken
  if (reachable === true && sideEffectObserved === false && triggerFired === true) {
    return { disposition: 'refuted_broken', evidence };
  }

  // reachable === true && sideEffectObserved === true → verified_working (the ONLY pass)
  if (reachable === true && sideEffectObserved === true) {
    return { disposition: 'verified_working', evidence };
  }

  // reachable === true && (triggerFired===null || sideEffectObserved===null) && safetyBar==='unsafe'
  //   → unverifiable (trigger unsafe to fire; instrumentation needed)
  if (
    reachable === true &&
    (triggerFired === null || sideEffectObserved === null) &&
    safetyBar === 'unsafe'
  ) {
    return {
      disposition: 'unverifiable',
      reason: 'trigger unsafe to fire; instrumentation needed',
      evidence,
    };
  }

  // reachable === null → refuted_dormant IF the reachability trace completed and found nothing,
  //   else unverifiable with reason 'reachability trace incomplete'
  if (reachable === null) {
    if (cr.reachabilityTraceComplete === true) {
      return { disposition: 'refuted_dormant', evidence };
    }
    return {
      disposition: 'unverifiable',
      reason: 'reachability trace incomplete',
      evidence,
    };
  }

  // Any remaining uncertain combination (REFUTE stance: never fall through to a pass).
  return {
    disposition: 'unverifiable',
    reason: 'insufficient evidence to classify; defaulting to unverifiable under REFUTE stance',
    evidence,
  };
}

// ─── shared helpers ─────────────────────────────────────────────────────────────────────────────

function requireSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      '[adversarial-sweep] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required — run from the EHG_Engineer ROOT so dotenv loads .env',
    );
    process.exit(1);
  }
  return createClient(url, key);
}

function cutoffIso(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

// ─── PHASE ASSEMBLE ─────────────────────────────────────────────────────────────────────────────

async function assemble(outPath) {
  const supabase = requireSupabase();

  // Source (a): unwitnessed merges — REUSE the exact machinery gauge-runner.mjs's
  // 'ship-witness-unwitnessed-merge' detector uses. NO reconcile call (assembly is side-effect-free).
  const ghRunner = (args) => {
    const r = spawnSync('gh', args, { encoding: 'utf8' });
    return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
  };
  const merges = PLATFORM_REPOS.flatMap((r) =>
    defaultFetchMergedPlatformPRs(r.owner, r.name, WITNESS_CUTOVER_ISO, ghRunner),
  );
  // Adversarial review of this very tool (PR #5666): this read was the one UNGUARDED query —
  // a truncated witnessed-set silently reclassifies witnessed merges as unwitnessed (false
  // REFUTE injections), the exact silent-truncation class this file guards against. Paginate
  // to completeness instead of trusting any single-page cap.
  const telemetryRows = await fetchAllRows(supabase, 'merge_witness_telemetry', 'repo, pr_number');
  const unwitnessed = detectUnwitnessedMerges(merges, telemetryRows).unwitnessed;
  const unwitnessedItems = unwitnessed.map((m) => ({
    work_key: `${m.repo}#${m.prNumber}`,
    backlog_source: 'unwitnessed_merge',
    title: `Unwitnessed merge ${m.repo}#${m.prNumber}`,
    description: `Platform merge ${m.repo}#${m.prNumber} (mergedAt ${m.mergedAt}) has ZERO merge_witness_telemetry row since the witness cutover (${WITNESS_CUTOVER_ISO}).`,
    merged_at: m.mergedAt,
  }));

  // Source (b): machinery-class completions from SDs and QFs in the last WINDOW_DAYS.
  const since = cutoffIso(WINDOW_DAYS);

  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 (real bug): PAGE_LIMIT=5000 never
  // bounded these two reads — PostgREST's server-side db-max-rows cap silently clamps ANY
  // unranged read at 1000 regardless of a higher client .limit(), so the truncation check below
  // (`.length === PAGE_LIMIT`) could never fire; a truncated 1000-row page read as "complete" up
  // to 5000. Same class this file's own fetchAllRows() already exists to close (used a few lines
  // above for merge_witness_telemetry) — route these two reads through it instead.
  let sdRows, qfRows;
  try {
    sdRows = await fetchAllRows(
      supabase, 'strategic_directives_v2', 'id, sd_key, title, description, status, updated_at, sd_type, metadata',
      (q) => q.eq('status', 'completed').gte('updated_at', since),
    );
  } catch (e) {
    throw new Error('strategic_directives_v2 query failed: ' + e.message);
  }
  try {
    qfRows = await fetchAllRows(
      supabase, 'quick_fixes', 'id, title, description, status, completed_at',
      (q) => q.eq('status', 'completed').gte('completed_at', since),
    );
  } catch (e) {
    throw new Error('quick_fixes query failed: ' + e.message);
  }

  // Two-stage filter: RECALL (broad regex over title+description) narrows to candidates;
  // PRECISION (artifact noun in TITLE, or hook/cron/watcher FILE evidence, minus doc/design
  // classes) narrows to the sweep denominator. Both stage counts are emitted — the narrowing
  // is auditable, never silent.
  let sdRejectedRecall = 0;
  let sdRejectedPrecision = 0;
  const machinerySds = [];
  for (const sd of sdRows || []) {
    if (!(isMachinery(sd.title, sd.description) && !isDocsOnly(sd.title, sd.description))) {
      sdRejectedRecall += 1;
      continue;
    }
    const sdType = (sd.sd_type || '').toLowerCase();
    const files = sd.metadata?.files_to_modify || sd.metadata?.files || null;
    if (sdType === 'documentation' || sdType === 'docs' || !isStrongMachinery(sd.title, sd.description, files)) {
      sdRejectedPrecision += 1;
      continue;
    }
    machinerySds.push({
      work_key: sd.sd_key || sd.id,
      backlog_source: 'machinery_sd',
      title: sd.title,
      description: sd.description || null,
      sd_id: sd.id,
      completed_at: sd.updated_at,
    });
  }

  let qfRejectedRecall = 0;
  let qfRejectedPrecision = 0;
  const machineryQfs = [];
  for (const qf of qfRows || []) {
    if (!(isMachinery(qf.title, qf.description) && !isDocsOnly(qf.title, qf.description))) {
      qfRejectedRecall += 1;
      continue;
    }
    if (!isStrongMachinery(qf.title, qf.description, null)) {
      qfRejectedPrecision += 1;
      continue;
    }
    machineryQfs.push({
      work_key: qf.id,
      backlog_source: 'machinery_qf',
      title: qf.title,
      description: qf.description || null,
      completed_at: qf.completed_at,
    });
  }
  const sdRejected = sdRejectedRecall + sdRejectedPrecision;
  const qfRejected = qfRejectedRecall + qfRejectedPrecision;

  const backlog = [...unwitnessedItems, ...machinerySds, ...machineryQfs];
  const report = {
    generated_at: new Date().toISOString(),
    swept_by_sd: SWEPT_BY_SD,
    window_days: WINDOW_DAYS,
    window_since: since,
    sources: {
      unwitnessed_merges: { count: unwitnessedItems.length, items: unwitnessedItems },
      machinery_sds: { count: machinerySds.length, items: machinerySds },
      machinery_qfs: { count: machineryQfs.length, items: machineryQfs },
    },
    machinery_filter: {
      sd_considered: (sdRows || []).length,
      sd_accepted: machinerySds.length,
      sd_rejected: sdRejected,
      sd_rejected_recall: sdRejectedRecall,
      sd_rejected_precision: sdRejectedPrecision,
      qf_considered: (qfRows || []).length,
      qf_accepted: machineryQfs.length,
      qf_rejected: qfRejected,
      qf_rejected_recall: qfRejectedRecall,
      qf_rejected_precision: qfRejectedPrecision,
      total_rejected: sdRejected + qfRejected,
      // FR-6 batch 9: sdRows/qfRows are now fetched via fetchAllRows() (paginated to true
      // completion, not a single .limit() page), so truncation is structurally impossible here.
      possibly_truncated: false,
      page_size: PAGE_SIZE,
    },
    total_backlog: backlog.length,
    backlog,
  };

  const json = JSON.stringify(report, null, 2);
  if (outPath) writeFileSync(outPath, json);
  process.stdout.write(json + '\n');

  console.error(
    `[adversarial-sweep] ASSEMBLE — unwitnessed merges: ${unwitnessedItems.length}, ` +
      `machinery SDs: ${machinerySds.length}, machinery QFs: ${machineryQfs.length}, ` +
      `filter rejections: ${sdRejected + qfRejected}, total backlog: ${backlog.length}` +
      (outPath ? ` → ${outPath}` : ''),
  );
  return report;
}

// ─── PHASE LEDGER ───────────────────────────────────────────────────────────────────────────────

/** Pure: build a durable feedback row from one dispositioned backlog item. */
export function buildLedgerRow(item, nowIso = new Date().toISOString()) {
  const workKey = item.work_key;
  const disposition = item.disposition;
  const evidence = item.evidence ?? null;
  const evidenceSummary =
    (evidence && (evidence.notes || JSON.stringify(evidence))) ||
    item.unverifiable_reason ||
    '(no evidence captured)';
  return {
    category: LEDGER_CATEGORY,
    // DEVIATIONS (see header): type + source_application are NOT-NULL/no-default; source_type
    // 'adversarial_sweep' is rejected by feedback_source_type_check → 'auto_capture' + metadata tag.
    type: 'issue',
    source_application: 'EHG_Engineer',
    source_type: 'auto_capture',
    title: `${workKey}: ${disposition}`,
    description: `[${disposition}] ${workKey} — ${evidenceSummary}`,
    status: 'new',
    severity: 'low',
    updated_at: nowIso,
    metadata: {
      disposition,
      work_key: workKey,
      evidence,
      evidence_pointer: item.evidence_pointer ?? null,
      filed_qf: item.filed_qf ?? null,
      unverifiable_reason: item.unverifiable_reason ?? null,
      backlog_source: item.backlog_source ?? null,
      swept_by_sd: SWEPT_BY_SD,
      sweep_source_type: 'adversarial_sweep', // preserved intended provenance (see header deviation #1)
    },
  };
}

async function writeLedger(dispositionsPath) {
  const supabase = requireSupabase();
  const raw = readFileSync(dispositionsPath, 'utf8');
  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed) ? parsed : parsed.items || parsed.backlog || [];
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`no dispositioned items found in ${dispositionsPath}`);
  }
  for (const it of items) {
    if (!it.work_key) throw new Error('every dispositioned item requires a work_key');
    if (!it.disposition) throw new Error(`item ${it.work_key} is missing a disposition`);
  }

  const nowIso = new Date().toISOString();
  const histogram = {};
  const backlogKeys = new Set();

  for (const item of items) {
    const workKey = item.work_key;
    backlogKeys.add(workKey);
    histogram[item.disposition] = (histogram[item.disposition] || 0) + 1;
    const row = buildLedgerRow(item, nowIso);

    // Idempotent: match an existing ledger row by category + metadata->>work_key, UPDATE not INSERT.
    // eslint-disable-next-line no-await-in-loop -- sequential is intentional (small N, ordered logs)
    const { data: existing, error: selErr } = await supabase
      .from('feedback')
      .select('id')
      .eq('category', LEDGER_CATEGORY)
      .filter('metadata->>work_key', 'eq', workKey)
      .limit(1);
    if (selErr) throw new Error(`ledger pre-select failed for ${workKey}: ${selErr.message}`);

    if (existing && existing.length > 0) {
      const id = existing[0].id;
      // Re-runs refresh the VERDICT fields but never clobber human triage state
      // (PR #5666 review): status/severity are set only on first insert.
      const { status: _s, severity: _sev, ...verdictOnly } = row;
      // eslint-disable-next-line no-await-in-loop
      const { error: updErr } = await supabase.from('feedback').update(verdictOnly).eq('id', id);
      if (updErr) throw new Error(`ledger update failed for ${workKey}: ${updErr.message}`);
    } else {
      // eslint-disable-next-line no-await-in-loop
      const { error: insErr } = await supabase.from('feedback').insert(row);
      if (insErr) throw new Error(`ledger insert failed for ${workKey}: ${insErr.message}`);
    }

    // Select-back verify (supabase-js silent-failure rule): the row must exist with our disposition.
    // eslint-disable-next-line no-await-in-loop
    const { data: verify, error: verErr } = await supabase
      .from('feedback')
      .select('id, metadata')
      .eq('category', LEDGER_CATEGORY)
      .filter('metadata->>work_key', 'eq', workKey)
      .limit(1);
    if (verErr) throw new Error(`ledger select-back failed for ${workKey}: ${verErr.message}`);
    if (!verify || verify.length === 0) {
      throw new Error(`ledger select-back found NO row for ${workKey} — write silently failed`);
    }
    if (verify[0].metadata?.disposition !== item.disposition) {
      throw new Error(
        `ledger select-back mismatch for ${workKey}: expected ${item.disposition}, got ${verify[0].metadata?.disposition}`,
      );
    }
  }

  // Set-difference invariant: every backlog key must now have a ledger row. Paginated
  // (PR #5666 review): a single-page read would FALSE-FAIL this invariant once the ledger
  // outgrows PostgREST's page cap across sweeps — fails closed, but loudly wrong.
  const ledgerRows = await fetchAllRows(supabase, 'feedback', 'metadata', (q) =>
    q.eq('category', LEDGER_CATEGORY),
  );
  const ledgerKeys = new Set((ledgerRows || []).map((r) => r.metadata?.work_key).filter(Boolean));
  const missing = [...backlogKeys].filter((k) => !ledgerKeys.has(k));

  console.error('[adversarial-sweep] LEDGER disposition histogram:');
  for (const [disp, n] of Object.entries(histogram).sort((a, b) => b[1] - a[1])) {
    console.error(`  ${disp}: ${n}`);
  }
  console.error(
    `[adversarial-sweep] set-difference check (backlog keys minus ledger keys): ${missing.length === 0 ? 'EMPTY (OK)' : 'NON-EMPTY: ' + missing.join(', ')}`,
  );
  if (missing.length > 0) {
    throw new Error(`set-difference invariant violated: ${missing.length} backlog key(s) have no ledger row`);
  }
  return { histogram, written: items.length };
}

// ─── entrypoint ─────────────────────────────────────────────────────────────────────────────────

async function main() {
  if (process.argv.includes('--assemble')) {
    await assemble(argValue('--out'));
    return;
  }
  const ledgerPath = argValue('--write-ledger');
  if (ledgerPath) {
    await writeLedger(ledgerPath);
    return;
  }
  console.error(
    'Usage:\n' +
      '  node scripts/adversarial-verification-sweep.mjs --assemble --out <backlog.json>\n' +
      '  node scripts/adversarial-verification-sweep.mjs --write-ledger <dispositions.json>\n' +
      '(run with cwd = EHG_Engineer ROOT so dotenv loads .env; gh CLI required for --assemble)',
  );
  process.exit(2);
}

// Only run when invoked directly, not when imported by the test suite.
// argv[1] is undefined under `node --input-type=module -e "import(...)"` — guard it, or the
// module CRASHES ON IMPORT for exactly the consumers the pure classifyItem export exists for.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('[adversarial-sweep] FAILED:', e?.message || e);
    process.exit(1);
  });
}
