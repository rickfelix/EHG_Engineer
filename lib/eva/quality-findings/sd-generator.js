/**
 * Per-finding SD generator: converts each unresolved finding from
 * venture_quality_findings into a Tier-aware remediation SD.
 *
 * SD: SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-C
 *
 * Idempotency: deduped by metadata.parent_finding_hash on
 * strategic_directives_v2. Re-running scan against same venture state
 * yields zero new SDs.
 *
 * Delegation: invokes scripts/leo-create-sd.js as a child_process so
 * canonical validation runs (vision/arch checks, gates, etc). Direct
 * strategic_directives_v2 INSERTs would bypass that pipeline.
 *
 * @module lib/eva/quality-findings/sd-generator
 */

import { spawn } from 'child_process';
import path from 'path';
import { validateFindingShape } from './finding-shape.js';

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
