/**
 * Governed-change proposal writer — shadow-trial ratification sandbox, staging surface.
 * SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-A (FR-2).
 *
 * Stages a GOVERNED-tier change proposal into governed_change_proposals so it can be
 * shadow-run (child C) and precheck-packeted (this child) before chairman review.
 *
 * EVIDENCE ONLY (CONST-002): this module writes exactly ONE table — the sandbox's own
 * staging surface. It never touches a live governed artifact and grants no apply authority.
 *
 * CEREMONY_PENDING contract (mirrors scripts/eval/migrate-sealed-baselines.mjs exactly):
 * the backing table ships as a STAGED chairman-gated migration
 * (20260717_governed_change_proposals_STAGED.sql). Until the chairman applies it, the
 * missing-table probe yields a soft CEREMONY_PENDING outcome (CLI exit 2) — distinct from
 * success (0) and from a real error (1) — so the writer is shipped inert-but-testable.
 */

import crypto from 'node:crypto';

export const TABLE = 'governed_change_proposals';

export const REQUIRED_FIELDS = [
  'artifact_class',
  'target_ref',
  'current_hash',
  'proposed_diff',
  'proposer',
  'provenance',
  'rationale',
];

/** Pure: is this PostgREST error a missing-table (pre-ceremony) condition? */
export function isMissingTableError(error) {
  if (!error) return false;
  const msg = `${error.code || ''} ${error.message || ''}`;
  return /42P01|PGRST205|Could not find the table|does not exist/i.test(msg);
}

/** Pure: validate a proposal object. Returns { valid, errors: ['missing_field:<name>'...] }. */
export function validateProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') {
    return { valid: false, errors: ['not_an_object'] };
  }
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    const v = proposal[field];
    if (typeof v !== 'string' || v.trim().length === 0) errors.push(`missing_field:${field}`);
  }
  return { valid: errors.length === 0, errors };
}

/** Pure: idempotency component — sha256 of the proposed diff. */
export function diffHash(proposedDiff) {
  return crypto.createHash('sha256').update(String(proposedDiff)).digest('hex');
}

/**
 * Stage a proposal. Returns one of:
 *   { staged: true, id }                          — row upserted (or already present)
 *   { staged: false, errors }                     — validation failure
 *   { staged: false, ceremony_pending: true }     — table not applied yet (soft)
 *   { staged: false, error }                      — real DB error
 * @param {Object} supabase - injected client (service role)
 * @param {Object} proposal - { artifact_class, target_ref, current_hash, proposed_diff,
 *                             proposer, provenance, rationale }
 * @param {Object} [opts]
 * @param {boolean} [opts.dry] - validate + probe only, no write
 */
export async function stageProposal(supabase, proposal, { dry = false } = {}) {
  const check = validateProposal(proposal);
  if (!check.valid) return { staged: false, errors: check.errors };

  const probe = await supabase.from(TABLE).select('id').limit(1);
  if (probe.error && isMissingTableError(probe.error)) {
    return { staged: false, ceremony_pending: true };
  }
  if (probe.error) return { staged: false, error: probe.error.message };
  if (dry) return { staged: false, dry: true };

  const row = {
    artifact_class: proposal.artifact_class,
    target_ref: proposal.target_ref,
    current_hash: proposal.current_hash,
    proposed_diff: proposal.proposed_diff,
    diff_hash: diffHash(proposal.proposed_diff),
    proposer: proposal.proposer,
    provenance: proposal.provenance,
    rationale: proposal.rationale,
    status: 'staged',
  };

  const up = await supabase
    .from(TABLE)
    .upsert(row, {
      onConflict: 'artifact_class,target_ref,current_hash,diff_hash',
      ignoreDuplicates: false,
    })
    .select('id');
  if (up.error) return { staged: false, error: up.error.message };
  return { staged: true, id: up.data?.[0]?.id ?? null };
}

/** CLI: node lib/governance/shadow-trial/proposal-writer.mjs --file <proposal.json> [--dry] */
async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const fileIdx = args.indexOf('--file');
  if (fileIdx === -1 || !args[fileIdx + 1]) {
    console.error('Usage: node proposal-writer.mjs --file <proposal.json> [--dry]');
    process.exitCode = 1;
    return;
  }
  const { readFileSync } = await import('node:fs');
  const proposal = JSON.parse(readFileSync(args[fileIdx + 1], 'utf8'));

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const result = await stageProposal(supabase, proposal, { dry });
  if (result.ceremony_pending) {
    console.log(`CEREMONY_PENDING: ${TABLE} does not exist yet — the STAGED migration (20260717_governed_change_proposals_STAGED.sql) must be applied via the chairman-gated ceremony first. Nothing staged.`);
    process.exitCode = 2;
    return;
  }
  if (result.errors) {
    console.error(`invalid proposal: ${result.errors.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  if (result.error) {
    console.error(`staging failed: ${result.error}`);
    process.exitCode = 1;
    return;
  }
  if (result.dry) {
    console.log('--dry: validated + probed, no writes');
    process.exitCode = 0;
    return;
  }
  console.log(`staged proposal ${result.id}`);
  process.exitCode = 0;
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
