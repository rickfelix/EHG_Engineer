#!/usr/bin/env node
// Single-scribe encode (ratification c44cd9d8): ffebbd68 (adam+solomon), 544bf078 (adam), 31c75f74 (adam),
// plus the 584e3e0e SITE-EDIT strike at the two remaining sites (601 audit clause, 629 manual).
// Adam seat 1b847de2, 2026-09-04. APPLIED 2026-09-04 12:2xZ. Idempotent: every edit is guarded by its own marker; re-runs are no-ops.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const M_FFEB = 'DRIVE SCORE 6/6 IS A TARGET, not a status indicator (ratification ffebbd68)';
const M_544B = 'NO ADDITIONAL VENTURE PROMOTION WHILE THE ALTIFYAI ELEVEN-SURFACE BUILD IS THE COMMITTED WORK, item 6b35505f carried OPEN and UNSPENT, never BLOCKED (ratification 544bf078)';
const M_31C7 = 'NEVER RAISE SEVERITY ON AN INHERITED PREMISE ADAM HAS NOT MEASURED HIMSELF (ratification 31c75f74)';
const SITE_EDIT_601 = 'the sixty-percent headroom precondition f7303528 was REPEALED by ratification 584e3e0e';
const SITE_EDIT_629 = 'REPEALED by ratification 584e3e0e';

const ENTRY_FFEB_ADAM = `- **${M_FFEB}** — Chairman in-terminal at the Adam seat, 2026-09-03 ~19:4xZ, verbatim: "Six out of six is a target." Asked as a fork (target to optimise toward, or status indicator whose flatness on a quiet day is correct); the answer selects TARGET. The drive score is therefore a REWARD SIGNAL with a required gradient: a leg that cannot move with the behaviour it scores is a defect in the signal, not an accurate reading of a quiet week. Measured basis that now binds (Solomon, ten consecutive drive_reports rows 2026-08-22 to 09-03): leg2_uptake binary, pinned at ceiling nine of ten, derived from ONE grain; leg4_capacity binary, pinned at floor, TIGHT-only self-labelled NOT RATIFIED at lib/drive-loop/score/leg4-capacity.js:41-46; leg1_landed the only continuous leg, frozen at 1.5; total 3.5/6 identical across five readings spanning a 28-directive day and a six-dead-seats day. Adam share: (a) every drive read Adam carries (slot updates, morning brief, exec summary, plan-check) states PER LEG whether the leg can currently move at all, and the §5e "earnable" caveat for leg4 is no longer blocked on unratified authority, this ruling supplies it; (b) Adam SOURCES the gradient fixes as the standing drive-score input to §5b: leg4 distance-along-the-ladder (DEFICIT-URGENT / DEFICIT / TIGHT / SURPLUS as four ordered states, not a boolean), leg2 uptake FRACTION scaled to its points plus its single-grain derivation as a separate defect, leg1's commit-subject rule reviewed; (c) the ruling does NOT prescribe the rescaling, it settles that a gradient is required. Verification predicate (Solomon, falsifiable, no new instrument): after any change the score takes at least THREE DISTINCT VALUES across ten consecutive readings; today it takes one. (Ratification ffebbd68; Solomon share encoded in section 611.)\n`;

const ENTRY_544B = `- **${M_544B}** — Chairman in-terminal at the Adam seat, 2026-09-03 ~20:0xZ, verbatim: "I agree with your recommendation regarding any additional ventures. I like your logic. Good job." The recommendation he agreed to (reproduced in the ledger row in full, so the scope is recoverable): NOT YET on board item 6b35505f, the credentialed production run of roughly sixteen live LLM calls that promotes nursery row 3d95f7ea into a real venture, and explicitly NOT on safety grounds. Binds: (a) no additional live-venture promotion proceeds while the AltifyAI eleven-surface build (767b288f) is the venture lane's committed work; the hold is a FOCUS decision, never a technical block, and must not be recorded as blocked on any board; (b) item 6b35505f is carried OPEN and UNSPENT with its stale blocker cleared: the REGISTERED_SERVICE_PRINCIPALS empty-registry blocker cited since 2026-07-26 stopped being true on 2026-08-05 (registry holds 13851be2-caf9-4aed-a1a4-c506daa94e0e, resolved against auth.users to svc-stage-zero-invoker@execholdings.ai; MEASURED by Adam 2026-09-03), so the path was live for four weeks while the board said otherwise; (c) the authorisation remains available on request, nothing requires re-establishing the technical path. Consistent with SCALE=CLOSED at one venture per month (2026-08-28) and the chairman's standing pattern of taking a wave to 100 percent before shifting focus. (Ratification 544bf078.)\n`;

const ENTRY_31C7 = `- **${M_31C7}** — Chairman SMS reply, verified sender, received 2026-09-03T22:51:33Z, verbatim: "A". It answers Adam's §6 three-cycle escalation: D4 (verify-before-certainty) measured 1, 2, 2 with a red flag at cycles 125, 126, 127 despite committed actions, the trigger pre-registered at cycle 126; six assertions contradicted by live state in one session, three of them one move, an inherited premise escalated in severity without being measured first. Options as put: A, keep the threshold and adopt one mechanical rule; B, loosen the red flag so same-session-corrected errors do not count. Adam recommended A and named B the self-serving option; the chairman selected A. Binds: (a) the D4 red-flag threshold is UNCHANGED, it fires on any assertion contradicted by live state regardless of session volume or accompanying catches; (b) MECHANICAL RULE: severity may not be raised on a premise inherited from another party until Adam has measured it himself; minting at the originator's stated severity is permitted, ESCALATING it is not; (c) verifiable at each self-score by counting rows whose severity Adam raised above the level at which the premise arrived against rows where his own measurement is recorded first. Provenance note: the reply was drained at 22:58:05.405Z and PARKED 329 ms later despite signature_valid=true, recurrence #1 of a protected class after SD-LEO-INFRA-PARKED-CHAIRMAN-SMS-001 (f6315dbf); the root rides the reply-format QF filed 2026-09-03 23:00Z. (Ratification 31c75f74.)\n`;

const ENTRY_FFEB_SOLOMON = `- **${M_FFEB}** — Solomon: the drive score is a reward signal, so a flat leg is a signal defect, never a quiet week; carry the verification predicate (at least three distinct values across ten consecutive readings) in every drive-score diagnosis, propose the leg gradients propose-only (leg4 distance-along-the-ladder, leg2 uptake fraction plus the single-grain defect, leg1 rule review), Adam sources; report the 3.5/6 flat line as the defect it is until the predicate passes.\n`;

function editOnce(content, marker, apply, label) {
  if (content.includes(marker)) { console.log(`  [skip] ${label}: marker already present`); return content; }
  const after = apply(content);
  if (after === content) throw new Error(`${label}: edit produced no change (anchor not found)`);
  if (!after.includes(marker)) throw new Error(`${label}: marker missing after edit`);
  console.log(`  [edit] ${label}: +${after.length - content.length} chars`);
  return after;
}

async function loadSection(id) {
  const { data, error } = await supabase.from('leo_protocol_sections').select('id, content').eq('id', id).single();
  if (error) throw new Error(`load ${id}: ${error.message}`);
  return data.content;
}

async function saveSection(id, before, after) {
  if (after === before) { console.log(`  [noop] section ${id} unchanged`); return; }
  const { error } = await supabase.from('leo_protocol_sections').update({ content: after }).eq('id', id);
  if (error) throw new Error(`update ${id}: ${error.message}`);
  const { data, error: rbErr } = await supabase.from('leo_protocol_sections').select('content').eq('id', id).single();
  if (rbErr) throw new Error(`readback ${id}: ${rbErr.message}`);
  if (data.content.length !== after.length || data.content !== after) throw new Error(`readback ${id}: persisted content differs from written content`);
  console.log(`  [saved] section ${id}: ${before.length} -> ${after.length} chars (readback verified)`);
}

export async function main() {
  // Decide the 601 header handling from the live markers of the three audit ratifications.
  const { data: rats } = await supabase.from('chairman_ratifications').select('id, marker_text').limit(500);
  const auditMarkers = (rats || []).filter((r) => ['b259e739', '7473142c', '71e2e871'].some((p) => String(r.id).startsWith(p))).map((r) => r.marker_text || '');
  const headerCarriesRepealedId = auditMarkers.some((m) => m.includes('f7303528'));
  console.log(`audit-clause markers: ${auditMarkers.length} rows; any marker includes f7303528: ${headerCarriesRepealedId}`);

  // ---- section 601 (Adam contract)
  console.log('section 601');
  let c601 = await loadSection(601);
  const b601 = c601;
  c601 = editOnce(c601, SITE_EDIT_601, (c) => {
    const oldBody = 'Fridays after the week reset, when the active window has at least sixty percent headroom (f7303528); scope EHG_Engineer';
    const newBody = `Fridays after the week reset (${SITE_EDIT_601} on 2026-09-03; no automated launch condition remains, the chairman governs capacity at the keyboard; SITE-EDIT per c44cd9d8); scope EHG_Engineer`;
    let out = c.replace(oldBody, newBody);
    if (!headerCarriesRepealedId) {
      out = out.replace('(chairman-ratified 2026-09-02/03; b259e739, 7473142c, 71e2e871, f7303528)** — the chairman ratified a STANDING weekly foundation audit', '(chairman-ratified 2026-09-02/03; b259e739, 7473142c, 71e2e871; f7303528 repealed by 584e3e0e)** — the chairman ratified a STANDING weekly foundation audit');
    }
    return out;
  }, '601 SITE-EDIT 584e3e0e');
  c601 = editOnce(c601, M_FFEB, (c) => c.replace(/\n?$/, '\n') + ENTRY_FFEB_ADAM, '601 ffebbd68');
  c601 = editOnce(c601, M_544B, (c) => c + ENTRY_544B, '601 544bf078');
  c601 = editOnce(c601, M_31C7, (c) => c + ENTRY_31C7, '601 31c75f74');
  if (c601.includes('when the active window has at least sixty percent headroom (f7303528); scope')) throw new Error('601: repealed sentence still present');
  await saveSection(601, b601, c601);

  // ---- section 611 (Solomon contract): Solomon share of ffebbd68, appended to the standing-constraints list.
  console.log('section 611');
  let c611 = await loadSection(611);
  const b611 = c611;
  c611 = editOnce(c611, M_FFEB, (c) => c.replace(/\n?$/, '\n') + ENTRY_FFEB_SOLOMON, '611 ffebbd68 (Solomon share)');
  const bytes611 = Buffer.byteLength(c611, 'utf8');
  console.log(`  611 bytes after: ${bytes611} (single-Read budget noted at 60,442)`);
  if (bytes611 > 60442) throw new Error(`611 would exceed the single-Read budget (${bytes611} bytes); a companion move comes first`);
  await saveSection(611, b611, c611);

  // ---- section 629 (Solomon manual): strike the cadence headroom clause and the whole Headroom-read bullet.
  console.log('section 629');
  let c629 = await loadSection(629);
  const b629 = c629;
  c629 = editOnce(c629, SITE_EDIT_629, (c) => {
    const start = c.indexOf('- Cadence: every Friday after the week reset, when the active window has at least sixty percent headroom');
    const hrIdx = c.indexOf('- Headroom read:', start);
    const end = c.indexOf('\n- Friday plan of record:', hrIdx);
    if (start < 0 || hrIdx < 0 || end < 0) return c;
    const replacement = `- Cadence: every Friday after the week reset. (The sixty-percent headroom precondition f7303528 and its Headroom-read bullet were ${SITE_EDIT_629}, 2026-09-03, verbatim "Please remove the headroom rule."; no automated launch condition remains, the chairman governs capacity at the keyboard. SITE-EDIT per c44cd9d8.)`;
    return c.slice(0, start) + replacement + c.slice(end);
  }, '629 SITE-EDIT 584e3e0e');
  if (c629.includes('sixty percent headroom (f7303528') || c629.includes('- Headroom read:')) throw new Error('629: repealed text still present');
  await saveSection(629, b629, c629);

  console.log('\nMARKERS (record after merge, encode-then-mark):');
  console.log(`  ffebbd68 -> section 601 (+611 share) marker: ${M_FFEB}`);
  console.log(`  544bf078 -> section 601 marker: ${M_544B}`);
  console.log(`  31c75f74 -> section 601 marker: ${M_31C7}`);
  console.log('DONE. Next: node scripts/generate-claude-md-from-db.js, commit + PR, then markRatificationEncoded x3 from merged main.');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('ENCODE FAILED:', e.message); process.exit(1); });
}
