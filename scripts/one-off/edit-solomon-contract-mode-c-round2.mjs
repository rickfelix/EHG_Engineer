#!/usr/bin/env node
/**
 * SD-LEO-INFRA-SOLOMON-CONTRACT-MODE-C-UPDATES-001 — round-2 coherence edits
 * to leo_protocol_sections row 611, from the deep-tier adversarial review of
 * PR #6010 (verdict: block). Reconciles surviving text with the approved
 * changes — no new policy:
 *   C-1 (CRITICAL): the Proactivity paragraph's residual worktree absolute
 *       ("worktreeing ... forbidden outright") now defers to the carve-out;
 *       Mode B's parallel "NEVER produces a ... worktree" likewise.
 *   W-1 (WARNING): §6 gate enumeration admits Mode C — five sources, three
 *       gate types (provenance+budget); §5 cost-discipline line matches.
 *   I-1 (INFO): the ladder's "probe-grading reserve" gets its one-line
 *       definition; §10 graduated activation stages Mode C with Mode A.
 * Same clobber-guard pattern as round 1 (anchors + before-image + must/gone
 * verification + idempotency refusal).
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config();

const here = dirname(fileURLToPath(import.meta.url));
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---- anchors (verified single-occurrence in the round-1 output) ----
const A_PROACTIVITY =
  '*claiming / worktreeing / handing-off / gating / SD-filing* is forbidden outright';
const A_MODEB_NEVER =
  'It NEVER produces a claim, worktree, handoff, or SD.';
const A_SOURCES_HEAD = 'Four sources, two gate types:';
const A_SOURCE_4 =
  '4. **The deep-thinking self-scan** (Cluster 2) — **quota + dedup/cache-gated**; surfaces candidate regions for future sweeps and the model/effort eval.';
const A_GATE_SUMMARY =
  'The triage gate is therefore **counter-gated for reactive consults (1,2)** and **quota/dedup-gated for proactive sources (3,4)** — not one uniform counter over all four.';
const A_COST_LINE = 'counter-gated eligibility for consults;';
const A_LADDER = '**Preemption ladder (highest first)**: probe-grading reserve > live Mode-A consult > Mode-C commission > Mode-B sweep.';
const A_ACTIVATION =
  'enable **Mode A (reactive consult) first**, watch the advice-outcome ledger + accuracy review (§11), then enable **Mode B (proactive sweeps)** once Mode A\'s advice is demonstrably trusted and correct.';

// ---- replacements ----
const R_PROACTIVITY =
  '*claiming / handing-off / gating / SD-filing* is forbidden outright; worktree contact is limited to the doc-artifact carve-out (Boundaries above) — doc-only evidence commits to the designated evidence branch, nothing else';
const R_MODEB_NEVER =
  'It NEVER produces a claim, handoff, or SD; worktree contact only per the doc-artifact carve-out (doc-only evidence commits).';
const R_SOURCES_HEAD = 'Five sources, three gate types:';
const R_SOURCE_4_PLUS_5 =
  A_SOURCE_4 +
  '\n5. **Chairman/Adam commissions (Mode C)** — **provenance + budget-gated at entry**: rides the consult lane (`payload.kind=\'solomon_consult\'`) but is distinguished by its commission provenance (the commission names its authority) and its budget-at-entry; no retry counter applies.';
const R_GATE_SUMMARY =
  'The triage gate is therefore **counter-gated for reactive consults (1,2)**, **quota/dedup-gated for proactive sources (3,4)**, and **provenance/budget-gated for commissions (5)** — not one uniform counter over all five.';
const R_COST_LINE = 'counter-gated eligibility for reactive consults (provenance + budget-at-entry gating for Mode-C commissions);';
const R_LADDER =
  '**Preemption ladder (highest first)**: probe-grading reserve > live Mode-A consult > Mode-C commission > Mode-B sweep — where the **probe-grading reserve** is the capacity held back to grade sealed pre-registered probe predictions when their window closes (see Model-window strategy).';
const R_ACTIVATION =
  'enable **Mode A (reactive consult) first**, watch the advice-outcome ledger + accuracy review (§11), then enable **Mode B (proactive sweeps)** once Mode A\'s advice is demonstrably trusted and correct. **Mode C activates with Mode A** — it rides the same consult lane, gated by provenance rather than counters.';

async function main() {
  const { data: row, error } = await supabase
    .from('leo_protocol_sections').select('id, content').eq('id', 611).single();
  if (error) throw new Error('fetch failed: ' + error.message);
  let c = row.content;

  if (c.includes('Five sources, three gate types')) {
    console.log('IDEMPOTENT: round-2 already applied — refusing.');
    return;
  }
  const anchors = { A_PROACTIVITY, A_MODEB_NEVER, A_SOURCES_HEAD, A_SOURCE_4, A_GATE_SUMMARY, A_COST_LINE, A_LADDER, A_ACTIVATION };
  for (const [name, a] of Object.entries(anchors)) {
    const count = c.split(a).length - 1;
    if (count !== 1) throw new Error(`clobber guard: anchor ${name} occurs ${count}x (need exactly 1)`);
  }
  writeFileSync(join(here, '_solomon-contract-before-image-611-round2.md.bak'), c);

  c = c.replace(A_PROACTIVITY, R_PROACTIVITY);
  c = c.replace(A_MODEB_NEVER, R_MODEB_NEVER);
  c = c.replace(A_SOURCES_HEAD, R_SOURCES_HEAD);
  c = c.replace(A_SOURCE_4, R_SOURCE_4_PLUS_5);
  c = c.replace(A_GATE_SUMMARY, R_GATE_SUMMARY);
  c = c.replace(A_COST_LINE, R_COST_LINE);
  c = c.replace(A_LADDER, R_LADDER);
  c = c.replace(A_ACTIVATION, R_ACTIVATION);

  const must = ['Five sources, three gate types', 'provenance/budget-gated for commissions (5)', 'Chairman/Adam commissions (Mode C)', 'capacity held back to grade sealed pre-registered probe predictions', 'Mode C activates with Mode A', 'doc-only evidence commits to the designated evidence branch, nothing else'];
  for (const m of must) if (!c.includes(m)) throw new Error('post-edit verification: missing ' + JSON.stringify(m));
  const gone = ['worktreeing / handing-off', 'a claim, worktree, handoff, or SD', 'Four sources, two gate types'];
  for (const g of gone) if (c.includes(g)) throw new Error('post-edit verification: old string present: ' + JSON.stringify(g));

  const { error: upErr } = await supabase.from('leo_protocol_sections').update({ content: c }).eq('id', 611);
  if (upErr) throw new Error('update failed: ' + upErr.message);
  const { data: rb } = await supabase.from('leo_protocol_sections').select('content').eq('id', 611).single();
  if (!rb.content.includes('Five sources, three gate types')) throw new Error('read-back failed');
  console.log(`✓ round-2 applied: ${row.content.length} -> ${rb.content.length} chars; coherence reconciled.`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
