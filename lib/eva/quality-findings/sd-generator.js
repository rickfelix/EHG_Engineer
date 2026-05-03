/**
 * Per-finding SD generator with two coexisting function families.
 *
 * Family A (existing — SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-C):
 *   - generateRemediationSD / generateBatch
 *   - Idempotency: metadata.parent_finding_hash (1:1 dedup by finding_hash)
 *   - SD creation: spawns scripts/leo-create-sd.js (canonical pipeline:
 *     vision/arch checks, gates, etc.)
 *   - Caller: Stage 20 quality loop, single-finding flow
 *
 * Family B (new — SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001):
 *   - generateRemediationSdsForVenture / generateRemediationSdsBatch
 *   - Idempotency: composite (venture_id, finding_category, severity); multiple
 *     findings sharing the triple roll up under one SD with source_finding_ids[]
 *     append
 *   - SD creation: direct DRAFT INSERT into strategic_directives_v2 (bypasses
 *     leo-create-sd.js for high-volume venture-scoped batching)
 *   - Caller: cron driver batch sweep (FR-C′ — see scripts/cron/fr-c-generator.mjs)
 *   - Bounded by per-venture daily rate limit (FR-5) and a forward-only
 *     status machine on venture_quality_findings (FR-4 migration)
 *   - Every dedup decision and rate-limit hit emits an audit_log row
 *
 * Both families coexist; existing callers are untouched.
 *
 * @module lib/eva/quality-findings/sd-generator
 */

import { spawn } from 'child_process';
import path from 'path';
import { validateFindingShape } from './finding-shape.js';
import { generateSDKey } from '../../../scripts/modules/sd-key-generator.js';

/**
 * Tier mapping table per CLAUDE.md Work Item Routing.
 *
 * Format: { [finding_category]: { [severity]: tier } }
 *
 * Tier 1: ≤30 LOC auto-approve QF
 * Tier 2: 31-75 LOC standard QF
 * Tier 3: >75 LOC full SD (also forced by risk keywords: auth, migration, schema, feature)
 *
 * Defaults to Tier 2 for any (category, severity) not in the table.
 */
export const TIER_MAP = Object.freeze({
  // Code Review
  npm_audit:    { critical: 3, high: 3, medium: 2, low: 1 },
  secrets:      { critical: 3, high: 3, medium: 3, low: 2 },  // always at least Tier 2 — security keyword
  lint:         { critical: 2, high: 2, medium: 1, low: 1 },
  test_suite:   { critical: 3, high: 2, medium: 2, low: 1 },
  capability:   { critical: 3, high: 3, medium: 2, low: 1 },
  // QA
  unit_test:    { critical: 3, high: 2, medium: 1, low: 1 },
  e2e_test:     { critical: 3, high: 2, medium: 2, low: 1 },
  // UAT
  uat_test:     { critical: 3, high: 3, medium: 2, low: 1 },
  bug_report:   { critical: 3, high: 3, medium: 2, low: 1 },
  uat_signoff:  { critical: 3, high: 3, medium: 3, low: 2 },  // chairman-facing — minimum Tier 2
  // Vision Compliance — chairman-facing mandate; absence is the failure (FR-E)
  feedback_widget_present: { critical: 3, high: 3, medium: 2, low: 1 },
  error_capture_wired:     { critical: 3, high: 3, medium: 2, low: 1 },
});

/**
 * Resolve Tier for a finding's severity + category.
 *
 * @param {string} category - one of FINDING_CATEGORIES
 * @param {string} severity - one of SEVERITY_LEVELS
 * @returns {number} 1, 2, or 3
 */
export function resolveTier(category, severity) {
  const row = TIER_MAP[category];
  if (!row) return 2; // default for unknown categories
  return row[severity] ?? 2;
}

/**
 * Map Tier number to leo-create-sd type flag.
 * Tier 1 = QF (handled separately, not by this generator).
 * Tier 2 = QF or fix.
 * Tier 3 = full SD (default to 'fix' or 'feature' depending on category).
 */
export function tierToSdType(tier, category) {
  if (tier === 1) return 'fix';
  if (tier === 2) return 'fix';
  // Tier 3
  if (category === 'capability' || category === 'secrets') return 'security';
  if (category.endsWith('_test') || category === 'bug_report') return 'bugfix';
  return 'fix';
}

/**
 * Check whether a remediation SD already exists for this finding_hash.
 * Uses metadata.parent_finding_hash for idempotency (per US-2).
 *
 * @param {Object} supabase
 * @param {string} finding_hash
 * @returns {Promise<{exists: boolean, sd_key?: string}>}
 */
export async function findExistingRemediation(supabase, finding_hash) {
  if (!supabase || !finding_hash) {
    throw new Error('supabase + finding_hash required');
  }

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key')
    .filter('metadata->>parent_finding_hash', 'eq', finding_hash)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error('findExistingRemediation failed: ' + error.message);
  }

  return data ? { exists: true, sd_key: data.sd_key } : { exists: false };
}

/**
 * Build a leo-create-sd.js argument list for a finding.
 * Returns the args array (caller spawns the process).
 *
 * @param {Object} finding - canonical FindingShape
 * @returns {{type: string, tier: number, args: Array<string>, metadata: Object}}
 */
export function buildCreateSdArgs(finding) {
  const v = validateFindingShape(finding);
  if (!v.valid) {
    throw new Error('Invalid finding: ' + v.errors.join('; '));
  }

  const tier = resolveTier(finding.finding_category, finding.severity);
  const sdType = tierToSdType(tier, finding.finding_category);

  // Title is short and descriptive
  const evidenceSummary = JSON.stringify(finding.evidence_pointer || {}).slice(0, 80);
  const title = `Remediation: ${finding.finding_category} (${finding.severity}) — ${evidenceSummary}`.slice(0, 200);

  const metadata = {
    parent_finding_hash: finding.finding_hash,
    parent_orchestrator: 'SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001',
    source_stage_number: finding.stage_number,
    source_finding_category: finding.finding_category,
    source_severity: finding.severity,
    venture_id: finding.venture_id,
    generator: 'sd-generator.js',
    generator_version: '1.0.0',
  };

  // leo-create-sd.js positional args: <source> <type> "<title>"
  const args = [
    'LEO',
    sdType,
    title,
    '--metadata', JSON.stringify(metadata),
  ];

  return { type: sdType, tier, args, metadata };
}

/**
 * Generate a remediation SD for a finding.
 *
 * Idempotent: if metadata.parent_finding_hash already exists on any SD,
 * returns the existing sd_key without spawning leo-create-sd.js.
 *
 * @param {Object} params
 * @param {Object} params.supabase
 * @param {Object} params.finding - canonical FindingShape
 * @param {boolean} [params.dryRun=false] - skip leo-create-sd.js spawn
 * @returns {Promise<{sd_key?: string, created: boolean, skipped: boolean, reason?: string}>}
 */
export async function generateRemediationSD({ supabase, finding, dryRun = false }) {
  // Idempotency check
  const existing = await findExistingRemediation(supabase, finding.finding_hash);
  if (existing.exists) {
    return { sd_key: existing.sd_key, created: false, skipped: true, reason: 'duplicate_finding_hash' };
  }

  const { type, tier, args, metadata } = buildCreateSdArgs(finding);

  if (dryRun) {
    return { created: false, skipped: true, reason: 'dry_run', tier, type, metadata };
  }

  // Delegate to leo-create-sd.js (canonical SD creation path)
  const scriptPath = path.resolve(process.cwd(), 'scripts/leo-create-sd.js');
  return await new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(`leo-create-sd.js exited ${exitCode}: ${stderr.slice(-500)}`));
        return;
      }
      // Parse SD key from stdout (line like "SD Key:   SD-LEO-FIX-XXX-001")
      const m = stdout.match(/SD Key:\s+(SD-[A-Z0-9-]+)/);
      const sd_key = m ? m[1] : null;
      resolve({ sd_key, created: true, skipped: false, tier, type, metadata });
    });
    proc.on('error', reject);
  });
}

/**
 * Batch-generate remediation SDs for an array of unresolved findings.
 * Continues on per-finding errors; returns counts + errors.
 *
 * @param {Object} params
 * @param {Object} params.supabase
 * @param {Array<Object>} params.findings - array of FindingShape
 * @param {boolean} [params.dryRun=false]
 * @returns {Promise<{created: Array, skipped: Array, errors: Array}>}
 */
export async function generateBatch({ supabase, findings, dryRun = false }) {
  const created = [];
  const skipped = [];
  const errors = [];

  for (const f of findings || []) {
    try {
      const r = await generateRemediationSD({ supabase, finding: f, dryRun });
      if (r.created) created.push({ finding_hash: f.finding_hash, sd_key: r.sd_key });
      else skipped.push({ finding_hash: f.finding_hash, reason: r.reason });
    } catch (err) {
      errors.push({ finding_hash: f.finding_hash, error: err.message });
    }
  }

  return { created, skipped, errors };
}

// ============================================================================
// Family B — FR-C′ venture-scoped batch generator
// ============================================================================

/**
 * Severity values that warrant a remediation SD. PRD wording uses FAIL/WARN;
 * the existing severity enum is critical/high/medium/low.
 *   FAIL ≡ severity IN ('critical', 'high')
 *   WARN ≡ severity = 'medium'
 *   low → informational, excluded from SD generation
 */
export const FR_C_REMEDIATION_SEVERITIES = Object.freeze(['critical', 'high', 'medium']);

/**
 * SD status values that count as "open" for dedup purposes. Closed/rejected/
 * cancelled SDs do not absorb new findings — a fresh SD is created instead.
 */
export const FR_C_OPEN_SD_STATUSES = Object.freeze(['draft', 'planning', 'approved', 'in_progress']);

const GENERATED_BY_TAG = 'fr-c-prime-generator';

/**
 * Read the per-venture daily rate-limit ceiling from env, falling back to 20
 * with a stderr warning on any invalid value (per FR-5 AC #1).
 *
 * @returns {number}
 */
export function readRateLimitFromEnv() {
  const raw = process.env.FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY;
  if (raw === undefined || raw === null || raw === '') return 20;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== String(raw).trim()) {
    process.stderr.write(
      `[fr-c-generator] FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY=${JSON.stringify(raw)} invalid; falling back to 20\n`
    );
    return 20;
  }
  return parsed;
}

/**
 * Write a structured row to audit_log. Best-effort — never throws.
 * The audit_log schema (per migration) has metadata JSONB; we put the
 * structured event payload there.
 *
 * @param {Object} supabase
 * @param {string} eventType - e.g. 'dedup_hit', 'dedup_miss', 'rate_limit_triggered',
 *                                  'sd_filed', 'lock_held', 'generator_failed'
 * @param {Object} payload - event-specific structured data
 * @param {Object} [opts]
 * @param {string} [opts.entityType='venture_quality_findings']
 * @param {string|null} [opts.entityId=null]
 * @param {string} [opts.severity='info']
 */
export async function writeAuditLog(supabase, eventType, payload, opts = {}) {
  if (!supabase) return;
  try {
    await supabase.from('audit_log').insert({
      event_type: eventType,
      entity_type: opts.entityType || 'venture_quality_findings',
      entity_id: opts.entityId || null,
      metadata: { ...payload, generator: GENERATED_BY_TAG, ts: new Date().toISOString() },
      severity: opts.severity || 'info',
      created_by: 'fr-c-generator',
    });
  } catch (err) {
    // best-effort
    process.stderr.write(`[fr-c-generator] audit_log write failed (${eventType}): ${err.message}\n`);
  }
}

/**
 * Select pending FAIL/WARN-equivalent findings, optionally scoped to one venture.
 *
 * @param {Object} supabase
 * @param {string|null} [ventureId=null]
 * @returns {Promise<Array<Object>>}
 */
export async function selectPendingFindings(supabase, ventureId = null) {
  let query = supabase
    .from('venture_quality_findings')
    .select('id, venture_id, finding_category, severity, finding_hash, evidence_pointer, stage_number, created_at')
    .eq('status', 'pending')
    .in('severity', FR_C_REMEDIATION_SEVERITIES)
    .order('created_at', { ascending: true });
  if (ventureId) query = query.eq('venture_id', ventureId);
  const { data, error } = await query;
  if (error) throw new Error('selectPendingFindings failed: ' + error.message);
  return data || [];
}

/**
 * Look for an OPEN SD already covering this (venture, finding_category, severity)
 * triple. Match is via metadata.source_finding_ids[] — we resolve the matched
 * finding's triple by joining on venture_quality_findings.
 *
 * Returns the SD's primary key + current source_finding_ids[] when matched.
 *
 * Implementation note: PostgREST cannot easily express "JSONB array overlaps with
 * subquery result" so we do this in two steps — fetch the candidate open SDs for
 * this venture (small set; bounded by FR-5 rate limit), then filter client-side
 * by triple. This is correct and bounded; over-fetching is negligible because
 * the per-venture-per-day ceiling caps the result set at ~20.
 *
 * @param {Object} supabase
 * @param {string} ventureId
 * @param {string} findingCategory
 * @param {string} severity
 * @returns {Promise<{id: string, sd_key: string, source_finding_ids: Array<string>}|null>}
 */
export async function findOpenSdForCompositeKey(supabase, ventureId, findingCategory, severity) {
  const { data: candidates, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, metadata, status')
    .eq('metadata->>generated_by', GENERATED_BY_TAG)
    .eq('metadata->>venture_id', ventureId)
    .in('status', FR_C_OPEN_SD_STATUSES);
  if (error) throw new Error('findOpenSdForCompositeKey failed: ' + error.message);
  if (!candidates || candidates.length === 0) return null;

  for (const sd of candidates) {
    const md = sd.metadata || {};
    if (md.finding_category === findingCategory && md.severity === severity) {
      return {
        id: sd.id,
        sd_key: sd.sd_key,
        source_finding_ids: Array.isArray(md.source_finding_ids) ? md.source_finding_ids : [],
      };
    }
  }
  return null;
}

/**
 * Append a finding_id to an existing SD's metadata.source_finding_ids[].
 * Reads-then-writes to preserve other metadata keys (Supabase REST cannot
 * jsonb_set a single nested array path atomically).
 *
 * @param {Object} supabase
 * @param {string} sdId - strategic_directives_v2.id (varchar PK)
 * @param {string} findingId - venture_quality_findings.id (UUID)
 * @returns {Promise<{appended: boolean, source_finding_ids: Array<string>}>}
 */
export async function appendFindingToSdMetadata(supabase, sdId, findingId) {
  const { data: sd, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', sdId)
    .single();
  if (readErr) throw new Error('appendFindingToSdMetadata read failed: ' + readErr.message);
  const md = { ...(sd.metadata || {}) };
  const existing = Array.isArray(md.source_finding_ids) ? md.source_finding_ids : [];
  if (existing.includes(findingId)) {
    return { appended: false, source_finding_ids: existing };
  }
  const next = [...existing, findingId];
  md.source_finding_ids = next;
  const { error: writeErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: md, updated_at: new Date().toISOString() })
    .eq('id', sdId);
  if (writeErr) throw new Error('appendFindingToSdMetadata write failed: ' + writeErr.message);
  return { appended: true, source_finding_ids: next };
}

/**
 * Transition a finding row from pending → sd_filed. The BEFORE UPDATE trigger
 * sets sd_filed_at atomically when caller doesn't, but we set it explicitly
 * for round-trip clarity.
 *
 * @param {Object} supabase
 * @param {string} findingId
 * @param {string} sdKey - the SD that absorbed this finding
 * @returns {Promise<{updated: boolean}>}
 */
export async function transitionFindingToSdFiled(supabase, findingId, sdKey) {
  const { error } = await supabase
    .from('venture_quality_findings')
    .update({
      status: 'sd_filed',
      sd_filed_at: new Date().toISOString(),
      sd_key: sdKey,
    })
    .eq('id', findingId)
    .eq('status', 'pending'); // optimistic guard against trigger raising
  if (error) throw new Error('transitionFindingToSdFiled failed: ' + error.message);
  return { updated: true };
}

/**
 * Count SDs created today (UTC) by this generator for a given venture.
 *
 * @param {Object} supabase
 * @param {string} ventureId
 * @returns {Promise<number>}
 */
export async function countSdsCreatedTodayForVenture(supabase, ventureId) {
  // Use date_trunc('day', ... AT TIME ZONE 'UTC') equivalent at the client side;
  // PostgREST doesn't expose date_trunc in URL filters. We use a >= cutoff at
  // UTC midnight today, which is equivalent.
  const now = new Date();
  const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const { count, error } = await supabase
    .from('strategic_directives_v2')
    .select('*', { count: 'exact', head: true })
    .eq('metadata->>generated_by', GENERATED_BY_TAG)
    .eq('metadata->>venture_id', ventureId)
    .gte('created_at', utcMidnight);
  if (error) throw new Error('countSdsCreatedTodayForVenture failed: ' + error.message);
  return count || 0;
}

/**
 * Build the title + description + rationale for a remediation SD. Honors the
 * PRD's tone (LEAD-reviewable summaries; not a chatty narrative).
 */
function buildRemediationSdContent({ ventureId, findingCategory, severity, sampleFinding }) {
  const evidenceJson = JSON.stringify(sampleFinding.evidence_pointer || {}).slice(0, 120);
  const title = `Remediation: ${findingCategory} (${severity}) — venture ${ventureId.slice(0, 8)}`;
  const description = [
    `Auto-filed remediation SD for one or more pending venture_quality_findings rows.`,
    ``,
    `Composite key: (venture_id=${ventureId}, finding_category=${findingCategory}, severity=${severity}).`,
    `Initial sample evidence_pointer: ${evidenceJson}`,
    ``,
    `LEAD must review and either approve, scope-correct, or cancel. Generator never auto-approves.`,
  ].join('\n');
  const rationale = [
    `Stage 20 quality lifecycle loop emitted a ${severity}-severity ${findingCategory} finding.`,
    `Per FR-C′ (SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001), pending FAIL/WARN findings are auto-filed`,
    `as DRAFT remediation SDs to close the venture-quality lifecycle loop without manual triage burden.`,
    `Composite-key dedup ensures one SD per (venture, category, severity) tuple — additional findings`,
    `in the same triple roll up under metadata.source_finding_ids[].`,
  ].join(' ');
  const scope = [
    `Address the ${findingCategory} (${severity}) findings collected for venture ${ventureId.slice(0, 8)} by the Stage 20 quality loop.`,
    `In scope: triage and remediation of every venture_quality_findings row referenced in metadata.source_finding_ids[].`,
    `Out of scope: cross-venture aggregation, chairman-approval workflow, automated triage (those belong to FR-F′ and the chairman path).`,
    `Resolution closes each referenced finding (sd_filed → resolved) via the FR-C status machine.`,
  ].join(' ');
  return { title: title.slice(0, 200), description, rationale, scope };
}

/**
 * Insert a fresh DRAFT SD for a finding triple. Returns the new SD's
 * id + sd_key. Caller is responsible for transitioning the source finding row
 * to status='sd_filed' afterward.
 *
 * @param {Object} supabase
 * @param {Object} args
 * @param {string} args.ventureId
 * @param {string} args.findingCategory
 * @param {string} args.severity
 * @param {Array<string>} args.findingIds - one or more finding UUIDs to record
 * @param {Object} args.sampleFinding - for title/description content
 * @returns {Promise<{id: string, sd_key: string}>}
 */
/**
 * SD-LEO-FEAT-STAGE-CODE-QUALITY-001 FR-8 (2026-05-03): derive target_application
 * from venture context. Previously hardcoded to 'EHG_Engineer', which routed
 * remediation SDs for venture-codebase findings to the wrong application.
 *
 * Derivation order (first non-null wins):
 *  1. sampleFinding.target_application (if writer caller passes it explicitly)
 *  2. venture.metadata.stage_zero.target_platform (mapped to EHG/EHG_Engineer)
 *  3. 'EHG' default (ventures live in EHG; remediation work on venture code
 *     belongs to the EHG platform, NOT to the EHG_Engineer engine code).
 *
 * @param {Object} supabase
 * @param {string} ventureId
 * @param {Object} sampleFinding
 * @returns {Promise<'EHG' | 'EHG_Engineer'>}
 */
export async function deriveTargetApplication(supabase, ventureId, sampleFinding = {}) {
  if (sampleFinding && typeof sampleFinding.target_application === 'string') {
    const v = sampleFinding.target_application;
    if (v === 'EHG' || v === 'EHG_Engineer') return v;
  }

  if (supabase && ventureId) {
    try {
      const { data } = await supabase
        .from('ventures')
        .select('metadata')
        .eq('id', ventureId)
        .maybeSingle();
      const platform = data?.metadata?.stage_zero?.target_platform;
      if (typeof platform === 'string') {
        const norm = platform.toLowerCase();
        if (norm === 'ehg_engineer' || norm === 'engineer') return 'EHG_Engineer';
        if (norm === 'ehg' || norm === 'platform' || norm === 'web') return 'EHG';
      }
    } catch { /* best-effort lookup; fall through to default */ }
  }

  return 'EHG';
}

export async function insertDraftRemediationSd(supabase, { ventureId, findingCategory, severity, findingIds, sampleFinding }) {
  if (!ventureId || !findingCategory || !severity || !Array.isArray(findingIds) || findingIds.length === 0) {
    throw new Error('insertDraftRemediationSd requires ventureId, findingCategory, severity, findingIds[]');
  }

  const { title, description, rationale, scope } = buildRemediationSdContent({ ventureId, findingCategory, severity, sampleFinding });

  const sdKey = await generateSDKey({
    source: 'LEO',
    type: 'fix',
    title,
    skipLeadValidation: true,
  });

  const targetApplication = await deriveTargetApplication(supabase, ventureId, sampleFinding);

  const metadata = {
    generated_by: GENERATED_BY_TAG,
    generator_version: '1.1.0',
    parent_orchestrator: 'SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-001',
    venture_id: ventureId,
    finding_category: findingCategory,
    severity,
    source_finding_ids: findingIds,
    sample_evidence_pointer: sampleFinding.evidence_pointer || {},
    target_application_source: sampleFinding?.target_application
      ? 'finding_explicit'
      : (targetApplication === 'EHG' ? 'venture_default' : 'venture_metadata'),
  };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert({
      id: sdKey,
      sd_key: sdKey,
      title,
      description,
      rationale,
      scope,
      version: '1.0',
      status: 'draft',
      current_phase: 'LEAD',
      category: 'infrastructure',
      priority: 'medium',
      sd_type: 'bugfix',
      target_application: targetApplication,
      created_by: 'fr-c-generator',
      progress: 0,
      phase_progress: 0,
      is_active: true,
      is_working_on: false,
      metadata,
    })
    .select('id, sd_key')
    .single();
  if (error) throw new Error('insertDraftRemediationSd failed: ' + error.message);
  return { id: data.id, sd_key: data.sd_key };
}

/**
 * Generate remediation SDs for one venture's pending FAIL/WARN findings.
 *
 * Pipeline per finding:
 *   1. Composite-key dedup against open SDs created by this generator. Hit →
 *      append finding_id to source_finding_ids[], transition finding to
 *      sd_filed pointing at the existing SD, audit_log dedup_hit. Miss → create
 *      a new DRAFT SD (subject to rate limit), transition finding, audit_log
 *      dedup_miss + sd_filed.
 *   2. Per-venture daily rate limit checked once at start; once the count
 *      reaches the ceiling no new SDs are created (findings stay pending),
 *      audit_log rate_limit_triggered exactly once for the venture per cycle.
 *
 * @param {string} ventureId
 * @param {Object} [options]
 * @param {Object} [options.supabase] - service-role client; constructed from env if omitted
 * @param {number} [options.rateLimit] - override env-derived ceiling (test injection)
 * @returns {Promise<{
 *   created: Array<{sd_key: string, finding_ids: Array<string>}>,
 *   appended: Array<{sd_key: string, finding_id: string}>,
 *   skippedRateLimited: Array<string>,
 *   errors: Array<{finding_id: string, error: string}>
 * }>}
 */
export async function generateRemediationSdsForVenture(ventureId, options = {}) {
  if (!ventureId) throw new Error('generateRemediationSdsForVenture requires ventureId');

  const supabase = options.supabase;
  if (!supabase) throw new Error('options.supabase is required');

  const ceiling = options.rateLimit ?? readRateLimitFromEnv();
  const created = [];
  const appended = [];
  const skippedRateLimited = [];
  const errors = [];

  let alreadyToday = await countSdsCreatedTodayForVenture(supabase, ventureId);
  let rateLimitedEmitted = false;

  const findings = await selectPendingFindings(supabase, ventureId);

  for (const f of findings) {
    try {
      const existing = await findOpenSdForCompositeKey(supabase, ventureId, f.finding_category, f.severity);
      if (existing) {
        const appendResult = await appendFindingToSdMetadata(supabase, existing.id, f.id);
        await transitionFindingToSdFiled(supabase, f.id, existing.sd_key);
        await writeAuditLog(supabase, 'dedup_hit', {
          venture_id: ventureId,
          finding_category: f.finding_category,
          severity: f.severity,
          finding_id: f.id,
          matched_sd_id: existing.id,
          matched_sd_key: existing.sd_key,
          appended: appendResult.appended,
        }, { entityId: f.id });
        appended.push({ sd_key: existing.sd_key, finding_id: f.id });
        continue;
      }

      // Composite-key miss — would create new SD; check rate limit.
      if (alreadyToday >= ceiling) {
        if (!rateLimitedEmitted) {
          await writeAuditLog(supabase, 'rate_limit_triggered', {
            venture_id: ventureId,
            count_today: alreadyToday,
            ceiling,
          }, { entityId: ventureId, severity: 'warning' });
          rateLimitedEmitted = true;
        }
        skippedRateLimited.push(f.id);
        continue;
      }

      const newSd = await insertDraftRemediationSd(supabase, {
        ventureId,
        findingCategory: f.finding_category,
        severity: f.severity,
        findingIds: [f.id],
        sampleFinding: f,
      });
      await transitionFindingToSdFiled(supabase, f.id, newSd.sd_key);
      await writeAuditLog(supabase, 'dedup_miss', {
        venture_id: ventureId,
        finding_category: f.finding_category,
        severity: f.severity,
        finding_id: f.id,
        matched_sd_id: null,
        new_sd_id: newSd.id,
        new_sd_key: newSd.sd_key,
      }, { entityId: f.id });
      await writeAuditLog(supabase, 'sd_filed', {
        venture_id: ventureId,
        sd_key: newSd.sd_key,
        finding_id: f.id,
      }, { entityType: 'strategic_directives_v2', entityId: newSd.id });
      created.push({ sd_key: newSd.sd_key, finding_ids: [f.id] });
      alreadyToday += 1;
    } catch (err) {
      errors.push({ finding_id: f.id, error: err.message });
    }
  }

  return { created, appended, skippedRateLimited, errors };
}

/**
 * Batch entrypoint — sweeps every venture with pending findings.
 *
 * @param {Object} options
 * @param {Object} options.supabase
 * @param {number} [options.rateLimit]
 * @returns {Promise<{
 *   ventures: Array<string>,
 *   totalCreated: number,
 *   totalAppended: number,
 *   totalSkippedRateLimited: number,
 *   totalErrors: number,
 *   perVenture: Object
 * }>}
 */
export async function generateRemediationSdsBatch(options = {}) {
  const supabase = options.supabase;
  if (!supabase) throw new Error('options.supabase is required');

  const findings = await selectPendingFindings(supabase, null);
  const ventureIds = [...new Set(findings.map((f) => f.venture_id))];

  const perVenture = {};
  let totalCreated = 0;
  let totalAppended = 0;
  let totalSkippedRateLimited = 0;
  let totalErrors = 0;

  for (const v of ventureIds) {
    const result = await generateRemediationSdsForVenture(v, options);
    perVenture[v] = result;
    totalCreated += result.created.length;
    totalAppended += result.appended.length;
    totalSkippedRateLimited += result.skippedRateLimited.length;
    totalErrors += result.errors.length;
  }

  return {
    ventures: ventureIds,
    totalCreated,
    totalAppended,
    totalSkippedRateLimited,
    totalErrors,
    perVenture,
  };
}
