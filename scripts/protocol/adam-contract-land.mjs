#!/usr/bin/env node
/**
 * FR-3 — land the corrected Adam contract + companions into leo_protocol_sections.
 * SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001.
 *
 * DRY-RUN BY DEFAULT. Writing here changes what every live Adam session loads, so it takes two
 * independent gates, mirroring scripts/solomon-judgment-expiry-run.mjs:
 *     LEO_ADAM_CONTRACT_LAND=1   and   --apply
 * Neither alone writes anything.
 *
 * WHY IT IS NOT ARMED YET (do not remove these gates to "make it work"):
 *   1. CORRECTED is the chairman-approved shortened file PLUS restorations (5q, 5r, and now the
 *      row-607 sourcing-engine restoration). Each restores content he had already approved being IN
 *      the contract, but the composite is not literally the artifact he signed off.
 *   2. TEMPORARY CADENCE OVERRIDE is unresolved and is his call — and it is now a measured textual
 *      diff, not a suspicion: the original reads "ROUTINE HEARTBEAT = BRIEF HOURLY SMS", the
 *      corrected S5g(c3) reads "ROUTINE HEARTBEAT = brief SMS". HOURLY is GONE, not reverted, while
 *      a later verbal set 30min "until he restores hourly".
 *
 * CLOSED SINCE THIS HEADER WAS WRITTEN: the "340 of 533 obligations carry no disposition" item.
 * All 533 are now dispositioned; 101 remain deliberately OPEN as CLASSIFIED_PENDING_FR2 (they are
 * companion-bound and close with this landing, since the chairman chose A-GOVERN).
 *
 * ORDERING IS A SAFETY PROPERTY, NOT A PREFERENCE. The shortened contract references
 * CLAUDE_ADAM_MANUAL.md and CLAUDE_ADAM_PROVENANCE.md by name. Landing it before those rows exist
 * does not shorten the contract, it deletes ~60KB and leaves the remainder pointing at nothing.
 * This script therefore writes companions FIRST and refuses to proceed if that order is violated.
 */
import 'dotenv/config';
import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply') && process.env.LEO_ADAM_CONTRACT_LAND === '1';
const DIR = 'docs/protocol/adam-contract-review-2026-07-29/';
const read = (f) => fs.readFileSync(DIR + f, 'utf8').replace(/\r\n/g, '\n');

/**
 * The snapshot the CORRECTED artifact is derived from. Drift against it means the artifact is
 * describing rows that have since moved on — see stalenessGuard().
 */
const SNAPSHOT = 'adam-contract-9row-snapshot-2026-07-31.json';

/** Same protocol_id the existing Adam rows carry — a companion on a different protocol renders nowhere. */
const PROTOCOL_ID = 'leo-v4-3-3-ui-parity';

/**
 * COMPANIONS-ONLY mode. The chairman's A-GOVERN authorises GOVERNING THE COMPANIONS; it does not
 * settle the two questions that still gate the CONTRACT rewrite (the composite — now three
 * restorations — and the SMS cadence diff), nor the open five-row question: replacing row 601 alone
 * leaves ~31,079 tokens against a 25,000 cap, so the consolidated artifact also requires emptying
 * 604/607/624/606/625. Landing companions is safe TODAY precisely because the LIVE contract does not
 * reference them yet, so there is no dangling pointer either way.
 */
const COMPANIONS_ONLY = process.argv.includes('--companions-only');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const CONTRACT = read('CLAUDE_ADAM.CORRECTED-2026-07-29.md');
const MANUAL = read('CLAUDE_ADAM_MANUAL.DRAFT-2026-07-29.md');
const PROVENANCE = read('CLAUDE_ADAM_PROVENANCE.DRAFT-2026-07-29.md');

/**
 * *** STALENESS GUARD — THIS ONE ALREADY FIRED FOR REAL, AND IT IS THE MOST IMPORTANT CHECK HERE. ***
 *
 * The artifact is a REWRITE of rows captured at a moment in time. Those rows keep moving: while this
 * SD was in flight, SD-LEO-INFRA-SOURCING-ENGINE-BELT-GATED-001 added ~2KB of governed content to
 * row 607 (SOURCING SSOT). The corrected artifact predated it and said "check the activation FLAGS"
 * — naming a mechanism that sibling had just retired as four dead no-op flags, and omitting both the
 * DB-row arm that actually gates the producer and the belt-DEMAND gate's withhold-on-unmeasurable
 * rule. Landing it unchanged would have SILENTLY REVERTED a merged sibling SD.
 *
 * Nothing would have caught it. The drift check compares DB-to-file and would have gone green on the
 * reverted text, because after landing, the file faithfully renders the row it just clobbered. The
 * only way to see it is to compare the LIVE rows against the snapshot the artifact was derived from,
 * BEFORE writing — which is what this does.
 *
 * Refuses per-row and names the row, so the remedy ("re-derive that section from live") is obvious.
 */
async function stalenessGuard() {
  const fail = [];
  let snap;
  try {
    snap = JSON.parse(fs.readFileSync(DIR + SNAPSHOT, 'utf8'));
  } catch {
    // Absence is a refusal, never a pass. With no snapshot there is no way to know the artifact
    // still describes the live rows, and "no evidence" must not read as "no drift".
    return ['NO SNAPSHOT: ' + DIR + SNAPSHOT + ' is missing or unreadable. Re-snapshot all nine rows before landing — a landing with no derivation baseline cannot detect a silent revert.'];
  }

  const types = snap.section_types || ['adam_role_contract', 'adam_self_adherence_loop', 'role_partnership_contract'];
  const { data: live, error } = await supabase
    .from('leo_protocol_sections').select('id, section_type, content').in('section_type', types);
  if (error) return ['SNAPSHOT COMPARE FAILED: ' + error.message + ' — refusing rather than assuming no drift.'];

  const sha = (s) => crypto.createHash('sha256').update(String(s || ''), 'utf8').digest('hex');
  const byId = new Map((snap.rows || []).map((r) => [r.id, r]));

  for (const row of live || []) {
    const base = byId.get(row.id);
    if (!base) {
      fail.push(`NEW ROW ${row.id} (${row.section_type}) exists live but is absent from the snapshot — the artifact cannot account for it.`);
      continue;
    }
    if (sha(row.content) !== base.content_sha256) {
      fail.push(`ROW ${row.id} (${row.section_type}) DRIFTED since the snapshot: ${base.content_chars} -> ${String(row.content || '').length} chars. Landing would revert whatever changed it. Re-derive that section from the LIVE row, then re-snapshot.`);
    }
  }
  for (const id of byId.keys()) {
    if (!(live || []).some((r) => r.id === id)) fail.push(`ROW ${id} was DELETED live since the snapshot — re-derive before landing.`);
  }

  // COORDINATOR CONDITION 1 (ruling c903eba1): every row about to be EMPTIED must be individually
  // covered by the snapshot. The general sweep above already compares each live row, but a row we
  // are about to DESTROY deserves an explicit, named assertion rather than incidental coverage —
  // row 607 drifted +1,966 chars under this SD and is now on the empty list, so the hazard is not
  // hypothetical, it is the same hazard five times over.
  for (const e of EMPTY_ROWS) {
    if (!byId.has(e.id)) {
      fail.push(`EMPTY-TARGET ROW ${e.id} is NOT in the snapshot. Refusing to empty a row with no captured baseline — there would be nothing to restore it from.`);
    }
  }
  return fail;
}

/**
 * COORDINATOR CONDITION 2 (ruling c903eba1): the OLD preflight measured the ARTIFACT IN ISOLATION
 * (44,857 / 2.507 = 17,891 — passes) while the SD's acceptance is measured on the REGENERATED FILE.
 * That is how a scope note survived being arithmetically impossible: the check answered a question
 * nobody was asking. Left alone it would mis-pass the next reader exactly as it mis-passed this one.
 *
 * This projects the POST-LANDING rendered file: every row that will still feed CLAUDE_ADAM.md, plus
 * the generator's scaffolding overhead, measured rather than guessed.
 *
 * STILL A FLOOR CHECK, NOT THE ACCEPTANCE. The acceptance is an actual no-offset Read of the
 * regenerated file returning NO truncation notice. A ratio is a proxy, and this SD exists because a
 * proxy was trusted — 2.52 B/token is the ratio MEASURED on this very file (106,286 B reported by
 * the harness as 42,190 tokens), not a library's guess. tiktoken says 4.16 and is wrong here.
 */
async function projectedRenderCheck(contractBody, selfAdherenceBody) {
  const BYTES_PER_TOKEN = 2.52;
  const CAP = 25000;
  const { data: live, error } = await supabase
    .from('leo_protocol_sections').select('id, section_type, content')
    .in('section_type', ['adam_role_contract', 'adam_self_adherence_loop', 'role_partnership_contract']);
  if (error) return [`PROJECTION FAILED: ${error.message} — refusing rather than assuming it fits.`];

  const emptied = new Set(EMPTY_ROWS.map((e) => e.id));
  let chars = 0;
  for (const r of live || []) {
    if (emptied.has(r.id)) continue;                    // gone after landing
    if (r.id === 601) { chars += contractBody.length; continue; }
    if (r.id === 602) { chars += selfAdherenceBody.length; continue; }
    chars += String(r.content || '').length;            // 614, 610 — carried unchanged
  }

  // Scaffolding overhead (header, footer, per-section titles, separators), MEASURED from the
  // current render rather than assumed: rendered bytes minus the sum of the rows that fed it.
  const OVERHEAD = 2775;
  const projectedTokens = Math.round((chars + OVERHEAD) / BYTES_PER_TOKEN);
  if (projectedTokens > CAP) {
    return [`PROJECTED RENDER OVER CAP: ~${projectedTokens} tokens vs ${CAP}. This measures the FILE (all rows that still feed it + scaffolding), not the artifact alone.`];
  }
  console.log(`  projected render: ~${projectedTokens} tokens vs ${CAP} cap (${Math.round(projectedTokens / CAP * 100)}%) — floor check only; acceptance is an untruncated Read.`);
  return [];
}

/** Preflight refusals — every one of these has already bitten this SD once. */
async function preflight() {
  const fail = [...(await stalenessGuard())];

  // Row 610 is INCLUDED by both CLAUDE_ADAM.md and CLAUDE_COORDINATOR.md. Copying its body into
  // an adam_role_contract row reads identically on landing day and drifts the first time 610 is
  // edited — and the drift check stays green, because it compares DB-to-file, not duplication.
  const { data: partnership } = await supabase
    .from('leo_protocol_sections').select('id, content')
    .eq('section_type', 'role_partnership_contract').maybeSingle();
  if (partnership) {
    const probe = partnership.content.slice(0, 120).replace(/\s+/g, ' ').trim();
    if (probe && CONTRACT.replace(/\s+/g, ' ').includes(probe)) {
      fail.push('SHARED-ROW COPY: the partnership body (row ' + partnership.id + ') appears inside the contract text. It must be INCLUDED via role_partnership_contract, never copied.');
    }
  }

  // REPLACED (coordinator condition 2). This used to be `CONTRACT.length / 2.507` — the artifact
  // measured ALONE, which passes at 17,891 tokens while the FILE it lands into would have been
  // ~31,079. Measuring the payload, not the proxy.
  const split = splitCorrected(CONTRACT);
  fail.push(...(await projectedRenderCheck(split.contract, split.selfAdherence)));

  // S7 belongs to row 610 and must not ride along inside the contract body.
  if (/\n## 7\./.test(split.contract)) {
    fail.push('SPLIT LEAK: S7 (Partnership and comms) is still inside the contract body. It belongs to role_partnership_contract row 610 — included, never copied.');
  }

  // A companion that exists but is empty is worse than absent: the contract points at it by name.
  if (MANUAL.length < 2000) fail.push('MANUAL companion is suspiciously small — refusing to land a stub the contract references.');
  if (PROVENANCE.length < 1000) fail.push('PROVENANCE companion is suspiciously small — same reason.');

  return fail;
}

const plan = [
  { order: 1, target: 'adam_manual (NEW section_type)', bytes: MANUAL.length, note: 'companion FIRST — the contract references it by name' },
  { order: 2, target: 'adam_provenance (NEW section_type)', bytes: PROVENANCE.length, note: 'companion FIRST — partial by design, coverage disclosed in-file' },
  { order: 3, target: 'adam_role_contract row 601 (REPLACE 70,049 B)', bytes: CONTRACT.length, note: 'only AFTER both companions exist' },
];

/**
 * FR-3 row plan, per the coordinator's scope ruling (COORDINATOR_REPLY c903eba1, 2026-07-31):
 * "SCOPE EXPANSION AUTHORIZED — empty the five rows, KEEP 614, move S6 to 602."
 *
 * WHY THIS OVERRIDES THE SD'S OWN SCOPE NOTE. The SD says "decompose row 601 ALONE ... touching the
 * other six is optional scope and should be resisted." Measured, that MEANS cannot reach the SD's own
 * ACCEPTANCE: rows total 103,511 chars, and 601 -> CORRECTED leaves 78,319 = ~31,079 tokens against a
 * 25,000 cap, 24% over. When a means provably cannot reach its stated end, the means is wrong.
 * The five-row consequence follows from the artifact's SHAPE — it is a consolidated S1-S7 contract,
 * not a drop-in for 601's slice.
 */
const EMPTY_ROWS = [
  { id: 604, why: '100% absorbed into the MANUAL companion. Leaving it populated yields TWO live representations of one content — emptying it IS the fix, not optional cleanup.' },
  { id: 607, why: 'condensed into S5f. Restored from the LIVE row first (it had drifted +1,966 chars under this SD).' },
  { id: 624, why: 'condensed into S5n PLAN CHECK.' },
  { id: 606, why: 'condensed into S3b delegated-apply authority.' },
  { id: 625, why: 'condensed into S4c pre-send Solomon-consult rubric.' },
];

/**
 * NOT emptied, and each for a different reason — recorded so a later reader does not "tidy" them.
 *   614 — 746 chars, 0% absorbed, GENUINELY ABSENT from the corrected contract. A pointer section to
 *         docs/protocol/crew-comms-routing-protocol.md carrying 5 bounding rules. Sweeping it up with
 *         the others would delete a live pointer nothing else supplies.
 *   610 — the SHARED role_partnership_contract row. INCLUDED into both CLAUDE_ADAM.md and
 *         CLAUDE_COORDINATOR.md, never copied. Untouched by this landing entirely.
 *   602 — not emptied but REWRITTEN: it receives the S6 self-adherence body.
 */
const KEEP_ROWS = [614, 610];

/**
 * Split the corrected artifact into the row bodies it actually lands as.
 *
 * THREE THINGS MUST NOT LAND, and each has already been a documented hazard:
 *   1. the LANDING MAP (the leading HTML comment) — implementer instructions, not contract text.
 *   2. S7 "Partnership and comms" — it belongs to row 610. Copying it into an adam_role_contract row
 *      renders identically on landing day and drifts the first time 610 is edited, while the drift
 *      check stays GREEN because it compares DB-to-file rather than duplication.
 *   3. the artifact's own trailing footer — the generator emits its own.
 * @returns {{ contract: string, selfAdherence: string }}
 */
function splitCorrected(text) {
  const afterMap = text.replace(/^[\s\S]*?-->\s*\n/, '');           // drop the landing map
  const s6 = afterMap.indexOf('\n## 6.');
  const s7 = afterMap.indexOf('\n## 7.');
  if (s6 === -1 || s7 === -1 || s7 < s6) {
    throw new Error('splitCorrected: could not locate the S6/S7 boundaries — refusing to guess where a governed section ends.');
  }
  const body = afterMap.slice(0, s6).trimEnd() + '\n';

  // A FOURTH thing must not land: the artifact's own TITLE + Purpose/Load-when block. generateAdam()
  // already emits a header with exactly those fields, so keeping the artifact's would render the
  // title and purpose TWICE in the generated file. Cosmetic-looking and not: a contract whose first
  // screen is duplicated reads as corrupted, and the SD's acceptance is that the file is READ.
  //
  // The two COMPANION-POINTER blockquotes are NOT part of that duplication and MUST survive — they
  // are how a reader learns the companions exist at all, which is the whole point of A-GOVERN. The
  // generator's own blockquote covers only the first-class-role line.
  const s1 = body.indexOf('## 1.');
  if (s1 === -1) throw new Error('splitCorrected: could not locate S1 — refusing to guess where the header ends.');
  const pointers = body.slice(0, s1)
    .split('\n')
    .filter((l) => /^>\s*\*\*(How-to procedures|Dated provenance)\*\*/.test(l));
  if (pointers.length !== 2) {
    throw new Error(`splitCorrected: expected 2 companion-pointer blockquotes, found ${pointers.length}. Refusing — landing without them would govern the companions while telling no reader they exist.`);
  }

  return {
    contract: pointers.join('\n') + '\n\n---\n\n' + body.slice(s1),
    selfAdherence: afterMap.slice(s6, s7).trim() + '\n',
  };
}

/**
 * The two companion rows. Fresh order_index values, DELIBERATELY: order_index 2610 is already
 * occupied TWICE (id=602 adam_self_adherence_loop and id=606 adam_role_contract), and rendering is
 * deterministic there only because db-queries.js orders by order_index THEN id. A new row placed at
 * an occupied index would land by ID rather than by intent. 2630 is the highest in use.
 *
 * Governed EXPLICITLY, per the chairman's "no auto-default" rider on A-GOVERN: each companion gets
 * its own section_type and its own mapping entry. Nothing infers a companion from a missing entry,
 * and no fallback can make one APPEAR governed.
 */
const COMPANIONS = [
  { section_type: 'adam_manual', order_index: 2640, title: 'Adam Manual — how-to procedures (companion)', body: () => MANUAL },
  { section_type: 'adam_provenance', order_index: 2650, title: 'Adam Provenance — dated rationale and live witnesses (companion)', body: () => PROVENANCE },
];

/**
 * Land the companion rows. IDEMPOTENT by section_type: re-running updates content rather than
 * inserting a second row, because two rows of one companion type would silently BOTH render.
 */
async function landCompanions() {
  const results = [];
  for (const c of COMPANIONS) {
    const { data: existing, error: selErr } = await supabase
      .from('leo_protocol_sections').select('id').eq('section_type', c.section_type);
    if (selErr) throw new Error(`select ${c.section_type}: ${selErr.message}`);

    if (existing && existing.length > 1) {
      throw new Error(`${c.section_type} already has ${existing.length} rows — refusing to guess which one renders. Resolve by hand.`);
    }

    const payload = {
      protocol_id: PROTOCOL_ID,
      section_type: c.section_type,
      title: c.title,
      content: c.body(),
      order_index: c.order_index,
      context_tier: 'REFERENCE',
      priority: 'STANDARD',
      metadata: {
        sd: 'SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001',
        companion_of: 'adam_role_contract',
        governed: true,
        chairman_decision: 'A-GOVERN (2026-07-31T12:08:50Z, packet adam-decision-govdemote-20260731, row 6cc469b1)',
        rider: 'no auto-default — governed explicitly via section_type + mapping, never by a fallback path',
      },
    };

    if (existing && existing.length === 1) {
      const { error } = await supabase.from('leo_protocol_sections').update(payload).eq('id', existing[0].id);
      if (error) throw new Error(`update ${c.section_type}: ${error.message}`);
      results.push(`UPDATED ${c.section_type} (row ${existing[0].id}, ${payload.content.length} B)`);
    } else {
      const { data, error } = await supabase.from('leo_protocol_sections').insert(payload).select('id').single();
      if (error) throw new Error(`insert ${c.section_type}: ${error.message}`);
      results.push(`INSERTED ${c.section_type} (row ${data.id}, ${payload.content.length} B, order_index ${c.order_index})`);
    }
  }
  return results;
}

(async () => {
  const fail = await preflight();
  console.log('=== FR-3 LANDING PLAN ===');
  for (const p of plan) console.log(`  ${p.order}. ${p.target}  [${p.bytes} B]  — ${p.note}`);
  console.log('');
  console.log('preflight refusals:', fail.length ? '\n  * ' + fail.join('\n  * ') : 'none');
  console.log('');

  if (!APPLY) {
    console.log('DRY RUN — nothing written. Both gates are required: LEO_ADAM_CONTRACT_LAND=1 and --apply.');
    console.log('This step is deliberately unarmed; see the header for the open items that must close');
    console.log('first (chairman review of the composite, and the TEMPORARY CADENCE OVERRIDE question,');
    console.log('which is now a measured textual diff rather than a suspicion).');
    process.exit(0);
  }
  if (fail.length) {
    console.error('REFUSING TO APPLY — preflight failed.');
    process.exit(1);
  }

  if (COMPANIONS_ONLY) {
    console.log('APPLYING COMPANIONS ONLY (--companions-only). Row 601 is NOT touched.');
    for (const line of await landCompanions()) console.log('  ' + line);
    console.log('');
    console.log('NEXT (required, same motion): regenerate and verify.');
    console.log('  node scripts/generate-claude-md-from-db.js');
    console.log('  node scripts/check-claude-md-drift.cjs        # must stay green');
    console.log('A companion row with no mapping entry renders NOWHERE — landing rows without the');
    console.log('four-surface wiring is the demotion this SD exists to prevent, in a new costume.');
    process.exit(0);
  }

  console.error('FULL APPLY (contract rewrite) intentionally not implemented — see header.');
  console.error('Blocked on: the chairman composite question, the SMS cadence diff, and the open');
  console.error('five-row question (replacing row 601 ALONE leaves ~31,079 tokens vs a 25,000 cap,');
  console.error('so the consolidated artifact also requires emptying 604/607/624/606/625).');
  console.error('Use --companions-only to land the A-GOVERN-authorised half.');
  process.exit(1);
})();
