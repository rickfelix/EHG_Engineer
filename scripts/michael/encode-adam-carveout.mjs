#!/usr/bin/env node
// scripts/michael/encode-adam-carveout.mjs — SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-G / FR-6.
//
// Mechanically encodes the chairman-ratified personal-day-lane clause (spec §1.2) into BOTH
// adam_role_contract (leo_protocol_sections id=601) and michael_role_contract (id=658) in one
// pass. Mirrors the verify-marker-occurs-once / dry-run-by-default / replace precedent of
// scripts/one-off/qf-20260905-813-encode-lens-predicates.mjs, but as a PURE, injectable planner
// (planCarveoutEncode) rather than a top-level-client script, per PLAN-TO-EXEC TESTING review
// (testing-agent:a2311426206eee3aa).
//
// THIS SCRIPT DOES NOT RATIFY ANYTHING. Recording the chairman's actual ratification (an
// in-terminal utterance) is a chairman-only act via lib/chairman/ratification-writer.mjs,
// entirely out of this script's scope. This script REQUIRES an existing chairman_ratifications
// row (targetContracts including both 'adam' and 'michael') as a precondition and refuses
// cleanly if none exists — staying inert, like every other Michael migration/encode tool in this
// family, until the chairman has actually ratified the clause.
//
// Idempotent by design: both sections gain a stable HTML-comment delimiter block keyed on the
// ratification's id. A second run against already-encoded content is a clean no-op (exit 0),
// not a throw — the qf-20260905-813 precedent throws on zero remaining occurrences of its
// one-shot marker, which is the wrong shape for a script meant to be safely re-run.
//
// Usage: node scripts/michael/encode-adam-carveout.mjs [--apply] [--json]
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

export const ADAM_SECTION_ID = 601;
export const MICHAEL_SECTION_ID = 658;

// The stable, already-live anchor sentences the clause is inserted immediately after. Each must
// occur EXACTLY ONCE in its target's content, verified fresh on every run (never assumed stable
// across a content edit elsewhere in either section).
export const ADAM_ANCHOR = 'the personal-day lane clause for this contract is encoded by child G through the single-scribe convention';
export const MICHAEL_ANCHOR = "(ratification row with `targetContracts: ['adam', 'michael']`; child G of the formalization orchestrator) before Michael's first live morning.";

function delimiterBlock(ratification) {
  const open = `<!-- MICHAEL-CARVEOUT-ENCODED ratification=${ratification.id} -->`;
  const close = '<!-- /MICHAEL-CARVEOUT-ENCODED -->';
  return { open, close, block: `\n\n${open}\n${ratification.quote.trim()}\n${close}\n` };
}

/**
 * PURE planner. Never touches a DB or filesystem; the CLI wrapper below performs the actual read/
 * write. Inputs: adamSection/michaelSection = {id, content}; ratification = {id, quote,
 * target_contracts}. Returns one of:
 *   { ok:false, refusal:'NO_RATIFICATION' }                         — precondition unmet
 *   { ok:true, alreadyEncoded:true }                                — idempotent no-op
 *   { ok:false, refusal:'ANCHOR_NOT_EXACTLY_ONE', detail }          — refuses BOTH writes
 *   { ok:true, adamContent, michaelContent }                        — both ready to write together
 */
export function planCarveoutEncode({ adamSection, michaelSection, ratification }) {
  if (!ratification || !ratification.id || !ratification.quote) {
    return { ok: false, refusal: 'NO_RATIFICATION', detail: 'no chairman_ratifications row supplied — the chairman has not ratified the clause yet; this script stays inert until one exists' };
  }
  const contracts = Array.isArray(ratification.target_contracts) ? ratification.target_contracts : [];
  if (!contracts.includes('adam') || !contracts.includes('michael')) {
    return { ok: false, refusal: 'RATIFICATION_WRONG_TARGETS', detail: `ratification ${ratification.id} target_contracts=${JSON.stringify(contracts)} does not include both 'adam' and 'michael'` };
  }

  const { open, block } = delimiterBlock(ratification);
  const adamAlready = adamSection.content.includes(open);
  const michaelAlready = michaelSection.content.includes(open);
  if (adamAlready && michaelAlready) return { ok: true, alreadyEncoded: true };
  if (adamAlready !== michaelAlready) {
    return { ok: false, refusal: 'PARTIALLY_ENCODED', detail: `ratification ${ratification.id} is encoded in one target but not the other — adam=${adamAlready} michael=${michaelAlready}; investigate before re-running` };
  }

  const adamOccurrences = adamSection.content.split(ADAM_ANCHOR).length - 1;
  const michaelOccurrences = michaelSection.content.split(MICHAEL_ANCHOR).length - 1;
  if (adamOccurrences !== 1 || michaelOccurrences !== 1) {
    return {
      ok: false,
      refusal: 'ANCHOR_NOT_EXACTLY_ONE',
      detail: `adam anchor occurrences=${adamOccurrences} (want 1), michael anchor occurrences=${michaelOccurrences} (want 1) — refusing an ambiguous or missing insertion point; zero writes issued to either target`,
    };
  }

  return {
    ok: true,
    adamContent: adamSection.content.replace(ADAM_ANCHOR, `${ADAM_ANCHOR}${block}`),
    michaelContent: michaelSection.content.replace(MICHAEL_ANCHOR, `${MICHAEL_ANCHOR}${block}`),
  };
}

async function fetchLatestCarveoutRatification(supabase) {
  const { data, error } = await supabase
    .from('chairman_ratifications')
    .select('id, quote, target_contracts')
    .contains('target_contracts', ['michael'])
    .order('ratified_at', { ascending: false })
    .limit(20);
  if (error || !data) return null;
  return data.find((r) => Array.isArray(r.target_contracts) && r.target_contracts.includes('adam') && r.target_contracts.includes('michael')) || null;
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const asJson = argv.includes('--json');
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const [{ data: adamSection, error: adamErr }, { data: michaelSection, error: micErr }] = await Promise.all([
    supabase.from('leo_protocol_sections').select('id, content').eq('id', ADAM_SECTION_ID).single(),
    supabase.from('leo_protocol_sections').select('id, content').eq('id', MICHAEL_SECTION_ID).single(),
  ]);
  if (adamErr || micErr) {
    const err = `failed to fetch sections: adam=${adamErr && adamErr.message} michael=${micErr && micErr.message}`;
    if (asJson) { console.log(JSON.stringify({ ok: false, error: err })); process.exitCode = 1; return; }
    console.error(err); process.exitCode = 1; return;
  }

  const ratification = await fetchLatestCarveoutRatification(supabase);
  const plan = planCarveoutEncode({ adamSection, michaelSection, ratification });

  if (asJson) { console.log(JSON.stringify(plan)); }
  else if (!plan.ok) { console.error(`REFUSED (${plan.refusal}): ${plan.detail}`); }
  else if (plan.alreadyEncoded) { console.log(`Already encoded (ratification ${ratification.id}) — no-op.`); }
  else { console.log(`Ready to encode ratification ${ratification.id} into sections ${ADAM_SECTION_ID} and ${MICHAEL_SECTION_ID}.`); }

  if (!plan.ok || plan.alreadyEncoded) { process.exitCode = plan.ok ? 0 : 2; return; }

  if (!apply) { if (!asJson) console.log('DRY RUN — no write performed. Re-run with --apply to write.'); return; }

  const [{ error: adamUpdateErr }, { error: micUpdateErr }] = await Promise.all([
    supabase.from('leo_protocol_sections').update({ content: plan.adamContent }).eq('id', ADAM_SECTION_ID),
    supabase.from('leo_protocol_sections').update({ content: plan.michaelContent }).eq('id', MICHAEL_SECTION_ID),
  ]);
  if (adamUpdateErr || micUpdateErr) {
    console.error(`write failed: adam=${adamUpdateErr && adamUpdateErr.message} michael=${micUpdateErr && micUpdateErr.message}`);
    process.exitCode = 1; return;
  }
  if (!asJson) console.log(`Encoded ratification ${ratification.id} into sections ${ADAM_SECTION_ID} and ${MICHAEL_SECTION_ID}. Run node scripts/generate-claude-md-from-db.js next.`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(`[encode-adam-carveout] fatal: ${err.message}`); process.exitCode = 1; });
}
