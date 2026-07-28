#!/usr/bin/env node
// QF-20260727-923: amend leo_protocol_sections id=611 (Solomon Role Contract) so P1 rung 4
// (the suitability-map-fed deep-work queue) is described as PARKED, not live, with a named
// unpark trigger and the supporting statistic stated AS BOUNDED in the same sentence that
// carries it. One-off migration script — run once, then this file's job is done (kept for
// provenance/audit per repo convention of scripts/one-off/*).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const sb = createClient(url, key);

const ROW_ID = 611;

const OLD_P1_RUNG4 =
  '(4) the suitability-map-fed deep-work queue (fable_suitability_map, live 2026-07-19 — ranked by marginal reasoning-value); (5) durable-duty cadences';
const NEW_P1_RUNG4 =
  '(4) the suitability-map-fed deep-work queue — **PARKED, not live** (see P1a); (5) durable-duty cadences';

const P2_ANCHOR = '**P2 — SPEECH POSTURE (RETAINED VERBATIM)**';
const OLD_P1_TO_P2_GAP = `\n\n${P2_ANCHOR}`;

const P1A_TEXT = `**P1a — RUNG 4 PARKED (QF-20260727-923; Adam decision 2026-07-27 on Solomon's own counted finding, advisory 69a9a02e)**: preemption-ladder rung (4) — the suitability-map-fed deep-work queue — is **PARKED, not live**; the contract is amended rather than the scorer promoted. \`fable_suitability_map\` held exactly one row (created 2026-07-20, region_key=ehg_engineer/lib/fable-suitability — the scorer's own implementation directory, the default \`--dir\` of its dry-run entrypoint \`scripts/fable-suitability/dry-run.mjs\`); \`readModeBCandidates\` has zero production callers. Row-count>0 is not the right liveness test — it is satisfied by a single self-referential smoke-test row while supplying zero usable fuel (the **truthy-sentinel-suppresses-fallback** class defect: any such gate must test for **usable** fuel — ≥N regions, none self-referential, scored within M days — never mere existence). **Why parked, not promoted (decides on cost alone)**: promoting the scorer would spend a scheduled runner, new compute, and a new failure surface on ranking for Mode-B, the self-directed lane — an investment that stands regardless of hit-rate. **Supporting evidence, explicitly bounded**: over one Solomon session (857a3ae8, 2026-07-27) — **N=10, ONE session, ONE day; five of the nine refutations were already-fixed items, a property of that week's codebase tending, not a proven durable property of Mode-B; RE-MEASURE before citing as a rate** — SELF-GENERATED hypotheses landed 1 of 10 vs ROUTED-CONSULT verification at 5 of 5. **Named unpark trigger**: revisit if routed-consult volume falls such that Mode-B becomes the primary lane. Until unparked, rung (4) does not run — the Cluster 2 deep-thinking self-scan may still identify candidate regions, but nothing schedules them into a consumed queue. \`scripts/fable-suitability/dry-run.mjs\` header updated to PARKED, pointing here.`;

const NEW_P1_TO_P2_GAP = `\n\n${P1A_TEXT}\n\n${P2_ANCHOR}`;

const OLD_CLUSTER2 =
  'which feeds Mode-B sweep selection and the model/effort evaluation (Cluster 5).';
const NEW_CLUSTER2 =
  'which is designed to feed Mode-B sweep selection (PARKED — see P1a) and the model/effort evaluation (Cluster 5).';

async function main() {
  const { data, error } = await sb.from('leo_protocol_sections').select('content').eq('id', ROW_ID).single();
  if (error) throw error;
  let content = data.content;

  if (!content.includes(OLD_P1_RUNG4)) throw new Error('OLD_P1_RUNG4 anchor not found — content drifted since analysis, aborting.');
  if (!content.includes(OLD_P1_TO_P2_GAP)) throw new Error('OLD_P1_TO_P2_GAP anchor not found — content drifted, aborting.');
  if (!content.includes(OLD_CLUSTER2)) throw new Error('OLD_CLUSTER2 anchor not found — content drifted, aborting.');

  content = content.replace(OLD_P1_RUNG4, NEW_P1_RUNG4);
  content = content.replace(OLD_P1_TO_P2_GAP, NEW_P1_TO_P2_GAP);
  content = content.replace(OLD_CLUSTER2, NEW_CLUSTER2);

  const { error: updErr } = await sb.from('leo_protocol_sections').update({ content }).eq('id', ROW_ID);
  if (updErr) throw updErr;
  console.log('leo_protocol_sections id=611 updated OK. New content length:', content.length);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
