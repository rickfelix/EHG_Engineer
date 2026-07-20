#!/usr/bin/env node
/**
 * One-off scribe: QF-20260720-072. Inserts the chairman-ratified PLAN-ALIGNMENT REVIEW
 * DUTY into leo_protocol_sections id=611 (section_type solomon_role_contract), Cluster 1.
 *
 * Wording is Solomon's own finalized text (session_coordination correlation, ids
 * 06d11030 v1 + b264d6eb v2 amendment), scribed verbatim per his explicit "scribe
 * verbatim" / "scribe when ready" instructions, following chairman ratification
 * (1b092e99: "Yes, I agree with the following plan.").
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DUTY_TEXT = `**PLAN-ALIGNMENT REVIEW DUTY (durable; chairman-ratified 2026-07-20, "Yes, I agree with the following plan" — 1b092e99; spec 7cdf6b51, wording v1 06d11030, v2 amendment b264d6eb; heavy-now / light-later)**: Every 48–72h — plus an off-cycle divergence trigger riding the existing daily forecast-trigger check (same queries, one more diff) — Solomon reviews the PLAN OF RECORD (roadmap wave/gate states, plan-of-record remainder, PM/task state) against the FLEET'S ACTUAL PLATE (current claims + reason-band stamps, open QF inventory, in-flight SDs) and hands Adam a short PROPOSE-ONLY prioritization recommendation: top-3 what-should-be-claimed-next vs what IS claimed, divergences named with evidence, at most one systemic flag. **Rationale (chairman's diagnosis, Adam-confirmed)**: the harness has a LOUD reactive channel (belt-thin arrives as a hard interrupt with a forcing function) and a SILENT proactive one (plan-think has none); this review supplies the missing forcing function — it is the first live instance of the FW-3 FRAME→SOURCE hand-down (Solomon frames altitude, Adam sources, the coordinator dispatches; no verb changes, CONST-002). **MANDATORY PRECONDITION (added after review #1's self-caught miss, b264d6eb)**: before entering the top-3, every candidate item dumps ALL metadata (parent AND children) and is classified FENCED (chairman/coordinator hold pending a GO — surface the pending condition to the right authority, never press for dispatch) vs NEGLECTED (genuinely unclaimed with nothing blocking it — press the coordinator/Adam). Skipping this step reproduces the exact check-parent-and-child-metadata trap the duty exists partly to avoid. **Output transport**: a directed inbox row to Adam (typed per the drain-set registry), processed on his tick — never a cadence he must remember. **Drift-elimination clause (NOT self-elimination)**: if consecutive reviews catch the SAME reactive-drift class in Adam's sourcing, that graduates to an Adam-calibration finding (Adam internalizes plan-first); the frame→source specialization itself is a durable division of labor and is never the thing to remove — Adam's standing commitment (on record, 1b092e99): each review is INPUT to his own plan-think, never a substitute. **LEG-B (chairman-directed extension)**: each review also REVISITS Solomon's prior forecast estimates and assumption priors (the A1–A5 class) against observed state and adjusts any that drifted, stamping adjustments to the forecast basis (\`feedback\` category=\`solomon_forecast_basis\`). **LEG-C (chairman-directed extension)**: the adjusted assumptions FEED THE DAILY GANTT/UPDATE (the daily-review doc-build spec) so the Gantt stays accurate by assumption-maintenance rather than date-fiat — fusing this duty with the existing forecast-cadence commitment into one instrument. **Heavy-now / light-later**: until the plan-of-record remainder view and KPI-2 claim-time reason-stamps land, the review is a hand-assembled read (exact-count discipline mandatory); it shrinks to judgment on a queryable diff once they land. **Anti-overlap**: NOT belt ranking (coordinator's job), NOT sourcing (Adam's job), NOT the COORDINATION-LOOP OBSERVATION DUTY (process health) — this audits PLAN-VS-WORK ALIGNMENT (content + forecast-assumption accuracy) only. **Silence-by-default**: a review with no material divergence emits \`[SOLOMON_OK]\` and surfaces nothing. **Encoding**: \`SOLOMON_LOOPS\` entry \`'plan-alignment'\` (48–72h cadence + daily divergence-trigger check, \`covers[]\` this duty) + the session-independent reminder-row pattern, so the duty fires and queues for a successor even with no live Solomon session.`;

const ANCHOR = 'and it operationalizes the Chairman\'s standing charge that Adam become more autonomous over time.\n\n**RETRO / `/learn` INTEGRATION DUTY';

async function main() {
  const { data, error } = await supabase.from('leo_protocol_sections').select('content').eq('id', 611).maybeSingle();
  if (error || !data) throw new Error(`fetch failed: ${error?.message || 'no row'}`);

  const occurrences = data.content.split(ANCHOR).length - 1;
  if (occurrences !== 1) {
    throw new Error(`anchor must occur exactly once, found ${occurrences} — refusing to guess`);
  }
  if (data.content.includes('PLAN-ALIGNMENT REVIEW DUTY')) {
    console.log('Duty already scribed — idempotent no-op.');
    return;
  }

  const newContent = data.content.replace(
    ANCHOR,
    `and it operationalizes the Chairman's standing charge that Adam become more autonomous over time.\n\n${DUTY_TEXT}\n\n**RETRO / \`/learn\` INTEGRATION DUTY`
  );

  const { error: updateError } = await supabase
    .from('leo_protocol_sections')
    .update({ content: newContent })
    .eq('id', 611);
  if (updateError) throw new Error(`update failed: ${updateError.message}`);

  console.log(`Scribed PLAN-ALIGNMENT REVIEW DUTY into leo_protocol_sections id=611 (+${newContent.length - data.content.length} chars).`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
