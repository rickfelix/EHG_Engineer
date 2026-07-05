#!/usr/bin/env node
/**
 * SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-B: classify the exhaustive gate inventory
 * (from gate-inventory-extract.mjs) and seed gate_witness_registry (Child A's schema).
 *
 * Classification method (set-difference discipline, no sampling):
 * 1. Every gate defaults to self_evidence_only -- the conservative, currently-accurate
 *    baseline for anything validated purely against Supabase rows the judged worker
 *    session itself wrote (the entire LEAD-TO-PLAN/PLAN-TO-EXEC/EXEC-TO-PLAN/PLAN-TO-LEAD
 *    handoff pipeline, verified: zero of its ~125 gate files reference GitHub API/CI
 *    state -- grep across every executors/*\/gates/*.js + gates.js + shared gates/*.js
 *    for octokit/gh-cli/statusCheckRollup/branch-protection signals found exactly ONE
 *    file, executors/lead-final-approval/gates.js).
 * 2. PR_PRECHECK and PR_MERGE_VERIFICATION (both in that one file) call `gh pr list`
 *    via execSync -- GitHub's own CLI, authenticated via a GitHub token, categorically
 *    separate from the SUPABASE_SERVICE_ROLE_KEY every worker/CI job shares. Classified
 *    already_witnessed / external_system / structural.
 * 3. The ship-witness ladder (lib/ship/merge-witness-ladder.mjs, NOT part of the 5
 *    handoff executors -- gates the PR merge itself) is included as explicitly named in
 *    the parent SD's scope item 5 ("composes with... ship-witness lane P4 rung"):
 *    - P3 (CI status), P4 (branch protection), P5 (post-merge verify): already_witnessed /
 *      external_system / structural -- each reads live GitHub state via injected fetchers.
 *    - P2 (ship_review_findings row): already_witnessed / cross_actor / convention --
 *      its own source comment states actor-separation is "not_evaluable today" (no actor
 *      columns yet), so it is the intended cross_actor mechanism but not yet hardened.
 *    - P1 (workKey admission lookup): self_evidence_only -- a real-vs-fixture sanity
 *      check against a Supabase row, not an independent witness.
 *
 * Every gate gets a real classification (never left unclassified) -- 123/125 handoff-
 * pipeline gates land in self_evidence_only, which is an accurate finding (Solomon's
 * anchor thesis, quantified), not a placeholder.
 *
 * Usage: node scripts/eva/gate-inventory-classify-and-seed.mjs [--dry-run]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { buildInventory } from './gate-inventory-extract.mjs';
import {
  CLASSIFICATION,
  WITNESS_MECHANISM,
  ENFORCEMENT_STRENGTH,
} from '../../lib/eva/gate-witness-taxonomy.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// gate_id -> { classification, witness_mechanism, enforcement_strength, notes }
const OVERRIDES = {
  PR_PRECHECK: {
    classification: CLASSIFICATION.ALREADY_WITNESSED,
    witness_mechanism: WITNESS_MECHANISM.EXTERNAL_SYSTEM,
    enforcement_strength: ENFORCEMENT_STRENGTH.STRUCTURAL,
    notes: 'Calls `gh pr list` (GitHub CLI, GitHub-token-authenticated) to verify real open-PR state -- categorically separate credential from SUPABASE_SERVICE_ROLE_KEY.',
  },
  PR_MERGE_VERIFICATION: {
    classification: CLASSIFICATION.ALREADY_WITNESSED,
    witness_mechanism: WITNESS_MECHANISM.EXTERNAL_SYSTEM,
    enforcement_strength: ENFORCEMENT_STRENGTH.STRUCTURAL,
    notes: 'Calls `gh pr list`/`gh pr merge` guidance via GitHub CLI to verify real merge state -- categorically separate credential from SUPABASE_SERVICE_ROLE_KEY.',
  },
  // SD-LEO-INFRA-GATE-WITNESS-STRENGTH-001: Child D (observe-only enforcement rung) wired
  // these 3 gates to observeGateWitness's fixed 'gate-harness' identity, which genuinely
  // records a witness event on every evaluation -- but this registry was never re-seeded
  // after Child D shipped, so it still read self_evidence_only/null for all 3. Corrected here
  // so the registry and the real (weak) witness mechanism agree.
  RETROSPECTIVE_EXISTS: {
    classification: CLASSIFICATION.ALREADY_WITNESSED,
    witness_mechanism: WITNESS_MECHANISM.CROSS_ACTOR,
    enforcement_strength: ENFORCEMENT_STRENGTH.CONVENTION,
    notes: "Wired to observeGateWitness's fixed 'gate-harness' identity (SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-D) -- a code-controlled identity, not a cryptographically distinct actor, so convention-strength under the shared SUPABASE_SERVICE_ROLE_KEY architecture, same limitation Child C/D already document.",
  },
  GATE5_GIT_COMMIT_ENFORCEMENT: {
    classification: CLASSIFICATION.ALREADY_WITNESSED,
    witness_mechanism: WITNESS_MECHANISM.CROSS_ACTOR,
    enforcement_strength: ENFORCEMENT_STRENGTH.CONVENTION,
    notes: "Wired to observeGateWitness's fixed 'gate-harness' identity (SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-D) -- convention-strength, same limitation as RETROSPECTIVE_EXISTS above.",
  },
  SCOPE_COMPLETION_VERIFICATION: {
    classification: CLASSIFICATION.ALREADY_WITNESSED,
    witness_mechanism: WITNESS_MECHANISM.CROSS_ACTOR,
    enforcement_strength: ENFORCEMENT_STRENGTH.CONVENTION,
    notes: "Wired to observeGateWitness's fixed 'gate-harness' identity (SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-D) -- convention-strength, same limitation as RETROSPECTIVE_EXISTS above.",
  },
};

// Ship-witness ladder rungs -- not part of the 5 handoff executors, added explicitly
// per parent SD scope item 5.
const SHIP_WITNESS_RUNGS = [
  {
    gate_id: 'ship.P1_ADMISSION',
    handoff_type: null,
    classification: CLASSIFICATION.SELF_EVIDENCE_ONLY,
    witness_mechanism: null,
    enforcement_strength: null,
    existing_mechanism_ref: 'lib/ship/merge-witness-ladder.mjs:evaluateP1Admission',
    notes: 'Real-vs-fixture sanity check against a Supabase row (workKey resolution) -- not an independent witness of the judged work itself.',
  },
  {
    gate_id: 'ship.P2_WITNESS',
    handoff_type: null,
    classification: CLASSIFICATION.ALREADY_WITNESSED,
    witness_mechanism: WITNESS_MECHANISM.CROSS_ACTOR,
    enforcement_strength: ENFORCEMENT_STRENGTH.CONVENTION,
    existing_mechanism_ref: 'lib/ship/merge-witness-ladder.mjs:evaluateP2Witness',
    notes: "Source's own comment: actor-separation (reviewer != author) is NOT_EVALUABLE today -- ship_review_findings has no actor columns yet. Intended cross_actor mechanism, not yet hardened; convention-strength.",
  },
  {
    gate_id: 'ship.P3_CI',
    handoff_type: null,
    classification: CLASSIFICATION.ALREADY_WITNESSED,
    witness_mechanism: WITNESS_MECHANISM.EXTERNAL_SYSTEM,
    enforcement_strength: ENFORCEMENT_STRENGTH.STRUCTURAL,
    existing_mechanism_ref: 'lib/ship/merge-witness-ladder.mjs:evaluateP3CI',
    notes: 'Reads live GitHub statusCheckRollup -- categorically unforgeable by any Supabase credential.',
  },
  {
    gate_id: 'ship.P4_PROTECTION_INTEGRITY',
    handoff_type: null,
    classification: CLASSIFICATION.ALREADY_WITNESSED,
    witness_mechanism: WITNESS_MECHANISM.EXTERNAL_SYSTEM,
    enforcement_strength: ENFORCEMENT_STRENGTH.STRUCTURAL,
    existing_mechanism_ref: 'lib/ship/merge-witness-ladder.mjs:evaluateP4ProtectionIntegrity',
    notes: 'Reads live GitHub branch-protection state -- categorically unforgeable by any Supabase credential.',
  },
  {
    gate_id: 'ship.P5_POST_VERIFY',
    handoff_type: null,
    classification: CLASSIFICATION.ALREADY_WITNESSED,
    witness_mechanism: WITNESS_MECHANISM.EXTERNAL_SYSTEM,
    enforcement_strength: ENFORCEMENT_STRENGTH.STRUCTURAL,
    existing_mechanism_ref: 'lib/ship/merge-witness-ladder.mjs:evaluateP5PostVerify',
    notes: 'Confirms actual post-merge state via verifyMerged -- reads live GitHub merge status.',
  },
];

function classifyGate(gateId, sourceFile) {
  if (OVERRIDES[gateId]) {
    return { ...OVERRIDES[gateId], existing_mechanism_ref: sourceFile };
  }
  return {
    classification: CLASSIFICATION.SELF_EVIDENCE_ONLY,
    witness_mechanism: null,
    enforcement_strength: null,
    notes: 'Default classification: validated purely against Supabase rows written by the judged worker session itself (LEO handoff-pipeline gate, no independent external/cross-actor signal found in source).',
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { inventory } = buildInventory();

  // Dedupe to distinct gate_id, preferring the first-seen source file for existing_mechanism_ref.
  const byId = new Map();
  for (const g of inventory) {
    if (!byId.has(g.gate_id)) {
      byId.set(g.gate_id, { gate_id: g.gate_id, handoff_type: g.handoff_type, source_file: g.source_file });
    }
  }

  const rows = [];
  for (const { gate_id, handoff_type, source_file } of byId.values()) {
    const c = classifyGate(gate_id, source_file);
    rows.push({
      gate_id,
      handoff_type,
      classification: c.classification,
      witness_mechanism: c.witness_mechanism,
      enforcement_strength: c.enforcement_strength,
      exemption_reason: null,
      existing_mechanism_ref: c.existing_mechanism_ref || source_file,
      notes: c.notes,
      classified_by: 'gate-inventory-classify-and-seed.mjs (SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-B)',
    });
  }
  for (const rung of SHIP_WITNESS_RUNGS) {
    rows.push({ ...rung, classified_by: 'gate-inventory-classify-and-seed.mjs (SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-B)' });
  }

  const byClass = {};
  rows.forEach(r => { byClass[r.classification] = (byClass[r.classification] || 0) + 1; });
  console.log(`Total rows to seed: ${rows.length}`);
  console.log('By classification:', JSON.stringify(byClass, null, 2));
  console.log(`already_witnessed gates: ${rows.filter(r => r.classification === CLASSIFICATION.ALREADY_WITNESSED).map(r => r.gate_id).join(', ')}`);

  if (dryRun) {
    console.log('\n--dry-run: not writing to DB.');
    return;
  }

  const { error } = await supabase.from('gate_witness_registry').upsert(rows, { onConflict: 'gate_id' });
  if (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
  console.log(`\n✅ Seeded ${rows.length} rows into gate_witness_registry.`);
}

main();
