#!/usr/bin/env node
/**
 * SD-REFILL-00A3H5FN — encode the DECOMPOSE-WEAKEST-LAYER *classify-each-capability* refinement
 * (Adam board-of-directors verdict 2026-06-16) into the governed leo_protocol_sections SSOT:
 *   - id=604 (adam_role_contract)        → CLASSIFY-each-capability rule (a/b/c/d) in the Adam block
 *   - id=605 (coordinator_role_contract) → VERIFY-per-capability-gap-is-real line on dispatch
 *
 * Idempotent + additive: it only appends after a unique anchor and is a no-op if the marker
 * is already present. After running, regenerate the docs:  node scripts/generate-claude-md-from-db.js
 *
 * Usage:  node scripts/one-off/encode-classify-weakest-layer-rule.mjs
 */
import 'dotenv/config';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');

const MARKER_604 = 'CLASSIFY each weak capability BEFORE sourcing it (Adam board-of-directors verdict 2026-06-16)';
const ANCHOR_604 = 'one-capability-per-worker, instead of serializing it behind a single SD.';
const CLASSIFY_604 = '\n\n**' + MARKER_604 + ' — do NOT blindly source 1 design SD per capability.** A live-grounded board pass found the naive "one tile per capability" framing can yield ZERO valid SDs. For EACH weak capability, classify it FIRST: (a) **genuine leaf** → a Phase-0 design/spec SD (the default above); (b) **foundation / data-contract** — an upstream target-of-record that build SDs depend on (e.g. an ord-11 north-star contract) → **sequence it AHEAD of the builds it gates**, not as a parallel tile; (c) **already-built but reading low ONLY from a STALE/manual KR** (e.g. an ord-7 capability whose breakage-catch is live but the gauge reads ~0% off a manual KR) → a governed **KR RE-MEASURE / repoint-to-live-derivation**, NOT a new build SD; (d) **mis-bucketed** (wrong layer / registry entry) → a **registry fix**. Only (a) becomes a parallel design SD; (b)/(c)/(d) are different work — and the coordinator must VERIFY the per-capability gauge gap is REAL (not a stale-KR artifact) before dispatching.';

const MARKER_605 = 'VERIFY each weak-layer capability’s gauge gap is REAL before dispatching it as a design SD (Adam board verdict 2026-06-16)';
const ANCHOR_605 = 'an idle worker while a weak-layer capability remains unsourced = a sizing failure.';
const VERIFY_605 = '\n\n**' + MARKER_605 + '.** A capability that reads low ONLY from a stale/manual KR needs a governed KR re-measure, not a new SD; a foundation/data-contract capability must be sequenced AHEAD of the builds it gates, not dispatched as a parallel tile. This pairs with Adam’s CLASSIFY-each-capability rule in the SD-creation contract — do not dispatch a capability the gauge only *appears* to flag weak.';

async function editSection(sb, id, marker, anchor, insertion) {
  const { data, error } = await sb.from('leo_protocol_sections').select('content').eq('id', id).maybeSingle();
  if (error) throw new Error(`read ${id}: ${error.message}`);
  const content = data?.content || '';
  if (content.includes(marker)) { console.log(`  [${id}] already encoded — no-op`); return false; }
  const idx = content.indexOf(anchor);
  if (idx < 0) throw new Error(`anchor not found in section ${id}`);
  const at = idx + anchor.length;
  const next = content.slice(0, at) + insertion + content.slice(at);
  const { error: uErr } = await sb.from('leo_protocol_sections').update({ content: next }).eq('id', id);
  if (uErr) throw new Error(`update ${id}: ${uErr.message}`);
  console.log(`  [${id}] inserted classify/verify refinement (+${insertion.length} chars)`);
  return true;
}

async function main() {
  const sb = createSupabaseServiceClient();
  await editSection(sb, 604, MARKER_604, ANCHOR_604, CLASSIFY_604);
  await editSection(sb, 605, MARKER_605, ANCHOR_605, VERIFY_605);
  console.log('Done. Regenerate docs: node scripts/generate-claude-md-from-db.js');
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
