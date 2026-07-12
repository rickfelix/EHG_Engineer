#!/usr/bin/env node
/**
 * SD-LEO-INFRA-SOLOMON-CONTRACT-MODE-C-UPDATES-001 — one-off editor for
 * leo_protocol_sections row 611 (solomon_role_contract).
 *
 * Applies the FOUR chairman-approved changes (batch 2026-07-12, in-session
 * ~8:00 AM ET, mutual Adam<->Solomon review) in ONE atomic update:
 *   1. Mode C — COMMISSIONED DELIVERABLES (five guards + preemption ladder)
 *   2. Worktree doc-artifact carve-out (BOTH absolutes) + D1 rubric signal edit
 *   3. Comms augmentation: correlation_id echo, ordered-parts cap convention,
 *      courtesy-ACK-on-correlation prohibition (augment, don't duplicate)
 *   4. Model-window strategy (bounded-window pattern)
 *
 * Clobber guard: refuses to write unless the row matches the verified
 * before-state (length + anchor strings). Saves a before-image next to this
 * script. Idempotent: refuses a second run (Mode C already present).
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

const EXPECTED_LENGTH = 44147;

// ---- anchor strings (verified against the live row + VALIDATION 8ce8e707) ----
const A_HEADING = '## 3. Operating Model — Two Modes (silent by default in both)';
const A_SILENCE = '**SILENCE-BY-DEFAULT (cost contract)**: in both modes,';
const A_WORKING_SESSION = '**Solomon is a working session, not a Q&A endpoint.**';
const A_ABSOLUTE_1 =
  "- Solomon NEVER touches a worktree, claims an SD, runs `handoff.js`, or **sources/files an SD** (that is Adam's verb — see anti-overlap). CONST-002 analog: Proposer ≠ Approver.";
const A_ABSOLUTE_2 =
  '**Propose-only / never acts**: returns advice; never claims, worktrees, hands off, gates, or sources/files an SD.';
const A_D1_SIGNAL = '`sub_agent_execution_results`, git (must be empty for Solomon) |';
const A_REPLY_BULLET =
  '- **Solomon → asker (reply)**: emitted under the existing `adam_advisory` kind with `oracle:true`, so existing advisory-inbox plumbing surfaces it without a new lane.';
const A_MODEL_PIN_END =
  '(Opus 4.8 is reliably available on Max; this is part of why it is the default pin rather than the government-restricted Fable — see Model Strategy.)';

// ---- new content ----
const MODE_C = `### Mode C — COMMISSIONED deliverables (chairman/Adam-commissioned proposals)
A third admission path (chairman-ratified 2026-07-12; evidence basis: ~70% of the 2026-07-12 Fable-window spend — the endgame increments, the venture-2 packet, the alt-text demand-test design — ran outside the two-mode model). Mode C admits ONLY work **commissioned by the Chairman or Adam**, arriving on the consult lane **with chairman provenance** (the commission names its authority). Five guards, all load-bearing:
- **Provenance-gated admission**: no commission provenance, no Mode-C entry — self-initiated deliverables remain Mode-B propose-only findings.
- **Propose-only artifacts**: commissions produce designs, adjudications, and evidence packets — NEVER builds, claims, handoffs, SDs, or worktree contact beyond the §5 doc-artifact carve-out.
- **Budget-at-entry**: every commission states its token/wall-clock budget at admission; no open-ended commissions.
- **Preemption ladder (highest first)**: probe-grading reserve > live Mode-A consult > Mode-C commission > Mode-B sweep. A commission yields to a live consult and to reserved probe-grading capacity, and preempts sweeps.
- **D3 scoring**: commissioned spend is scored by the D3 cost-discipline dimension like all other spend.
**Silence-by-default governs between commissions** — an idle Mode-C lane surfaces nothing.

`;

const CARVEOUT_1 =
  "- Solomon NEVER claims an SD, runs `handoff.js`, merges, writes code or migrations, edits SD rows, or **sources/files an SD** (that is Adam's verb — see anti-overlap). CONST-002 analog: Proposer ≠ Approver. **Worktree doc-artifact carve-out (chairman-ratified 2026-07-12)**: doc-only commits — `docs/**` and propose-only-marked artifacts — to a **designated evidence branch/worktree** are IN-BOUNDS, with **commit-at-creation** (the chairman-ratified evidence-durability rule); landing to main stays via others' QF/ship path. Everything else in this bullet remains forbidden.";

const CARVEOUT_2 =
  '**Propose-only / never acts**: returns advice; never claims, hands off, gates, or sources/files an SD. Worktree contact is limited to the doc-artifact carve-out (§"Boundaries (hard edges)" above): doc-only evidence commits to the designated evidence branch, nothing else.';

const D1_SIGNAL_NEW =
  '`sub_agent_execution_results`, git (doc-only commits on the designated evidence branch — anything beyond `docs/**`/propose-only-marked is a red-flag) |';

const REPLY_BULLET_NEW =
  "- **Solomon → asker (reply)**: emitted under the existing `adam_advisory` kind with `oracle:true`, **echoing the consult's `correlation_id`** so the asker's reply-matcher keys on it; existing advisory-inbox plumbing surfaces it without a new lane. Replies over the ~4096-char body cap are sent as **ordered parts (`1/2`, `2/2`) on the same correlation**.\n" +
  '- **Courtesy-ACK dedup hazard (codified)**: reply-dedup keys on ANY correlation echo — a courtesy-ACK emitted on a consult correlation BLOCKS the canonical answer path. **Senders never courtesy-ACK on-correlation**; acknowledgement rides the two-stage `read_at` → `acknowledged_at` fields, never a correlated row. (Alternative, if ever needed: re-key dedup on oracle-verdict rows only.)';

const MODEL_WINDOW =
  '\n\n**Model-window strategy (bounded-window pattern)**: Fable availability is **window-scoped** — when a Fable window opens, the pin may swap for the window\'s duration; at window close the session **reverts to Opus 4.8 WITH re-registration** (a `/model` switch does NOT re-stamp the session\'s tier — re-register so tier-aware accounting sees the change). High-stakes grading stays **model-portable** via **sealed pre-registered predictions** (the proven probe pattern): graded claims are committed before the window closes, so any model can grade them after it.';

async function main() {
  const { data: row, error } = await supabase
    .from('leo_protocol_sections').select('id, content').eq('id', 611).single();
  if (error) throw new Error('fetch failed: ' + error.message);
  let c = row.content;

  if (c.includes('Mode C — COMMISSIONED')) {
    console.log('IDEMPOTENT: Mode C already present — refusing a second run.');
    return;
  }
  // clobber guard
  if (c.length !== EXPECTED_LENGTH) throw new Error(`clobber guard: length ${c.length} !== ${EXPECTED_LENGTH}`);
  for (const [name, a] of Object.entries({ A_HEADING, A_SILENCE, A_WORKING_SESSION, A_ABSOLUTE_1, A_ABSOLUTE_2, A_D1_SIGNAL, A_REPLY_BULLET, A_MODEL_PIN_END })) {
    if (!c.includes(a)) throw new Error('clobber guard: missing anchor ' + name);
  }

  writeFileSync(join(here, '_solomon-contract-before-image-611.md.bak'), c);

  // 1. Mode C: retitle, insert after Mode B (before the working-session para), fix "both modes"
  c = c.replace(A_HEADING, '## 3. Operating Model — Three Modes (silent by default in all)');
  c = c.replace(A_WORKING_SESSION, MODE_C + A_WORKING_SESSION);
  c = c.replace(A_SILENCE, '**SILENCE-BY-DEFAULT (cost contract)**: in all modes,');

  // 2. carve-out (both absolutes) + D1 companion
  c = c.replace(A_ABSOLUTE_1, CARVEOUT_1);
  c = c.replace(A_ABSOLUTE_2, CARVEOUT_2);
  c = c.replace(A_D1_SIGNAL, D1_SIGNAL_NEW);

  // 3. comms augmentation (replace reply bullet; adds the hazard bullet after it)
  c = c.replace(A_REPLY_BULLET, REPLY_BULLET_NEW);

  // 4. model-window strategy appended after the pin paragraph
  c = c.replace(A_MODEL_PIN_END, A_MODEL_PIN_END + MODEL_WINDOW);

  // post-edit verification before writing
  const must = ['Mode C — COMMISSIONED', 'Provenance-gated admission', 'Budget-at-entry', 'probe-grading reserve > live Mode-A consult > Mode-C commission > Mode-B sweep', 'D3 scoring',
    'doc-artifact carve-out', 'commit-at-creation', 'doc-only commits on the designated evidence branch',
    "echoing the consult's `correlation_id`", 'ordered parts', 'never courtesy-ACK on-correlation',
    'Model-window strategy', 'reverts to Opus 4.8 WITH re-registration', 'sealed pre-registered predictions'];
  for (const m of must) if (!c.includes(m)) throw new Error('post-edit verification failed: missing ' + JSON.stringify(m));
  const gone = ['NEVER touches a worktree', 'must be empty for Solomon', 'Two Modes (silent by default in both)'];
  for (const g of gone) if (c.includes(g)) throw new Error('post-edit verification failed: old string still present: ' + JSON.stringify(g));
  if ((c.match(/Mode C — COMMISSIONED/g) || []).length !== 1) throw new Error('duplicate Mode C');

  const { error: upErr } = await supabase.from('leo_protocol_sections').update({ content: c }).eq('id', 611);
  if (upErr) throw new Error('update failed: ' + upErr.message);

  // read-back
  const { data: rb } = await supabase.from('leo_protocol_sections').select('content').eq('id', 611).single();
  if (!rb.content.includes('Mode C — COMMISSIONED')) throw new Error('read-back failed');
  console.log(`✓ row 611 updated: ${row.content.length} -> ${rb.content.length} chars; all 14 must-markers present, 3 old strings gone; before-image saved.`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
