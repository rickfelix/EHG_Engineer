#!/usr/bin/env node
// @wire-check-exempt one-shot DB annotation (lives under scripts/one-off/, the recognized one-shot home).
//
// SD-LEO-INFRA-ALWAYS-SWEEP-DESIGN-OF-RECORD-001 (FR-1a): encode the chairman-ratified ALWAYS-SWEEP
// policy as a MACHINE-READABLE field on Solomon's design-of-record row (leo_protocol_sections
// id=611, section_type=solomon_role_contract). This is the authoritative slot the sweep-mode
// resolver (scripts/solomon-startup-check.mjs :: resolveSolomonSweepMode) reads.
//
// TARGETED read-merge-write (NOT a generic re-seed): SELECT the row's current metadata, spread it,
// set sweep_policy + provenance, UPDATE only id=611. The seed script
// (scripts/one-off/_seed-solomon-role-contract.mjs) writes only content/title/target_file/order_index
// and NEVER touches metadata — so metadata.sweep_policy is a re-seed-safe slot and survives a future
// content re-seed. No migration: existing row + existing metadata JSONB column.
//
// Idempotent: re-running merges the same keys onto whatever metadata is present.
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';

const ROW_ID = 611;
const PROVENANCE = 'SD-LEO-INFRA-ALWAYS-SWEEP-DESIGN-OF-RECORD-001; chairman-ratified';
const DIVERGENCE_NOTE =
  'always-sweep is the design-of-record policy — do NOT re-derive Solomon sweep mode from the ' +
  'configured model pin. getClaudeModel(\'solomon\') resolves the CONFIGURED pin (claude-opus-4-8), ' +
  'NOT the live serving model; a /model switch never reaches the resolver and a returning Fable pin ' +
  'does not auto-revert. The resolver reads this metadata.sweep_policy as authoritative.';

const sb = createSupabaseServiceClient();

const { data: row, error: readErr } = await sb
  .from('leo_protocol_sections')
  .select('id, section_type, metadata')
  .eq('id', ROW_ID)
  .single();
if (readErr || !row) {
  console.error(`Could not read leo_protocol_sections id=${ROW_ID}:`, readErr?.message);
  process.exit(1);
}
if (row.section_type !== 'solomon_role_contract') {
  console.error(`Row id=${ROW_ID} is section_type='${row.section_type}', expected 'solomon_role_contract' — aborting (design-of-record row moved).`);
  process.exit(1);
}

const merged = {
  ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
  sweep_policy: 'always',
  sweep_policy_provenance: PROVENANCE,
  sweep_policy_note: DIVERGENCE_NOTE,
};

const { error: writeErr } = await sb
  .from('leo_protocol_sections')
  .update({ metadata: merged })
  .eq('id', ROW_ID);
if (writeErr) {
  console.error('UPDATE ERR:', writeErr.message);
  process.exit(1);
}

const { data: verify } = await sb
  .from('leo_protocol_sections')
  .select('id, section_type, metadata')
  .eq('id', ROW_ID)
  .single();
console.log(`OK — id=${verify.id} section_type=${verify.section_type} metadata.sweep_policy=${JSON.stringify(verify.metadata?.sweep_policy)}`);
console.log('full metadata:', JSON.stringify(verify.metadata));
if (verify.metadata?.sweep_policy !== 'always') {
  console.error('POST-WRITE CHECK FAILED: metadata.sweep_policy is not "always".');
  process.exit(1);
}
