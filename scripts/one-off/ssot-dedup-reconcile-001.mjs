#!/usr/bin/env node
/**
 * SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001 FR-1 -- snapshot-gated reconciliation of 3
 * duplicate-content families in leo_protocol_sections.
 *
 * SNAPSHOT-GATED, UPDATE-ONLY (never DELETE), modeled on scripts/protocol/adam-contract-land.mjs's
 * proven pattern: refuse to mutate any row absent from, or drifted since, the committed
 * pre-mutation snapshot. leo_protocol_sections has no history table live yet and no
 * created_at/updated_at, so the snapshot re-check immediately before each UPDATE is the ONLY
 * concurrent-write guard available (PLAN-phase testing-agent finding, evidence 968f8f8c).
 *
 * Families (canonical row untouched, non-canonical rows reconciled):
 *   - {308,309,310} non-canonical, diverged duplicates of canonical row 307. NOT synced to 307's
 *     CURRENT text -- 307 renders a known-superseded bypass-quota claim (CLAUDE.md's own live text
 *     says corrected by build-vs-run deep-dive D9), and copying it forward would propagate that
 *     error into 3 more rows. Reconciled to a neutral archived-duplicate marker instead.
 *   - {450} non-canonical (449 is canonical, lower id tie-break -- the two are byte-identical,
 *     content offers no basis to distinguish them).
 *   - {545} non-canonical (544 is canonical, same lower-id tie-break, same byte-identical case).
 *
 * GUC-AVOIDANCE: this script must NEVER set app.current_actor_role='EXEC' -- a live trigger probe
 * (testing-agent, evidence 968f8f8c) confirmed that exact GUC value is the ONLY input that blocks
 * this table's UPDATE via trg_doctrine_constraint_sections. supabase-js never sets it by default;
 * this script uses supabase-js exclusively and sets no session GUCs.
 *
 * Usage: node scripts/one-off/ssot-dedup-reconcile-001.mjs [--dry-run]
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SNAPSHOT_PATH = 'docs/protocol/ssot-dedup-pre-mutation-snapshot-2026-08-24.json';
const DRY_RUN = process.argv.includes('--dry-run');

const CANONICAL_IDS = new Set([307, 449, 544]);
const MUTATION_TARGETS = [
  {
    id: 308,
    reason: 'duplicate-of-canonical',
    canonical_id: 307,
    content: '_[Archived duplicate -- see canonical row 307 (mandatory_phase_transitions, renders in CLAUDE_CORE.md) for the live Phase Transition Commands rule. This row diverged from 307 and never rendered anywhere (excluded from section-file-mapping.json). Reconciled by SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001, not content-copied from 307 because 307 itself carried a since-superseded bypass-quota claim at reconciliation time.]_',
  },
  {
    id: 309,
    reason: 'duplicate-of-canonical',
    canonical_id: 307,
    content: '_[Archived duplicate -- see canonical row 307 (mandatory_phase_transitions, renders in CLAUDE_CORE.md) for the live Phase Transition Commands rule. This row diverged from 307 and never rendered anywhere (excluded from section-file-mapping.json). Reconciled by SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001, not content-copied from 307 because 307 itself carried a since-superseded bypass-quota claim at reconciliation time.]_',
  },
  {
    id: 310,
    reason: 'duplicate-of-canonical',
    canonical_id: 307,
    content: '_[Archived duplicate -- see canonical row 307 (mandatory_phase_transitions, renders in CLAUDE_CORE.md) for the live Phase Transition Commands rule. This row diverged from 307 and never rendered anywhere (excluded from section-file-mapping.json). Reconciled by SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001, not content-copied from 307 because 307 itself carried a since-superseded bypass-quota claim at reconciliation time.]_',
  },
  {
    id: 450,
    reason: 'byte-identical-peer',
    canonical_id: 449,
    content: '_[Archived duplicate -- byte-identical to canonical row 449 (migration_execution_protocol_lead). Reconciled by SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001; lower-id tie-break since the two rows carried identical content with no basis to distinguish "canonical" otherwise.]_',
  },
  {
    id: 545,
    reason: 'byte-identical-peer',
    canonical_id: 544,
    content: '_[Archived duplicate -- byte-identical to canonical row 544 (handoff_precheck). Reconciled by SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001; lower-id tie-break since the two rows carried identical content with no basis to distinguish "canonical" otherwise.]_',
  },
];

function sha256(s) {
  return createHash('sha256').update(s || '').digest('hex');
}

async function main() {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  const snapshotById = new Map(snapshot.rows.map((r) => [r.id, r]));

  console.log(`Snapshot loaded: ${snapshot.rows.length} rows, generated_at=${snapshot.generated_at}`);

  for (const target of MUTATION_TARGETS) {
    if (!snapshotById.has(target.id)) {
      console.error(`REFUSING row ${target.id}: not present in snapshot ${SNAPSHOT_PATH}.`);
      process.exitCode = 1;
      return;
    }
  }

  const results = [];
  for (const target of MUTATION_TARGETS) {
    const snap = snapshotById.get(target.id);

    // Race-safety: re-verify live content matches the snapshot immediately before mutating.
    const { data: live, error: liveErr } = await supabase
      .from('leo_protocol_sections')
      .select('id, content, target_file, metadata')
      .eq('id', target.id)
      .single();
    if (liveErr || !live) {
      console.error(`REFUSING row ${target.id}: could not re-fetch live row (${liveErr?.message || 'not found'}).`);
      process.exitCode = 1;
      continue;
    }
    const liveHash = sha256(live.content);
    if (liveHash !== snap.content_sha256) {
      console.error(`REFUSING row ${target.id}: live content drifted since snapshot (snapshot=${snap.content_sha256.slice(0, 12)}, live=${liveHash.slice(0, 12)}). A concurrent write is suspected -- not overwriting.`);
      process.exitCode = 1;
      continue;
    }

    const existingMeta = (live.metadata && typeof live.metadata === 'object' && !Array.isArray(live.metadata)) ? live.metadata : {};
    const newMetadata = {
      ...existingMeta,
      provenance: { sd_key: 'SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001', actor_type: 'sd', actor_id: 'SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001' },
      publication_status: 'retired',
      publication_note: `Reconciled duplicate of canonical row ${target.canonical_id} (${target.reason}) by SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001; target_file nulled (never consulted for rendering -- routing is section_type + section-file-mapping.json only).`,
    };

    console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Row ${target.id}: target_file ${live.target_file} -> NULL, publication_status -> retired`);

    if (!DRY_RUN) {
      const { error: updErr } = await supabase
        .from('leo_protocol_sections')
        .update({ target_file: null, content: target.content, metadata: newMetadata })
        .eq('id', target.id);
      if (updErr) {
        console.error(`FAILED row ${target.id}: ${updErr.message}`);
        process.exitCode = 1;
        continue;
      }
    }
    results.push(target.id);
  }

  console.log(`${DRY_RUN ? 'Would reconcile' : 'Reconciled'} ${results.length}/${MUTATION_TARGETS.length} rows: ${results.join(', ')}`);
  console.log(`Canonical rows left untouched: ${[...CANONICAL_IDS].join(', ')}`);
}

if (isMainModule(import.meta.url)) main();
