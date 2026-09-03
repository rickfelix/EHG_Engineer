import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');

// Marker = the clause header literal. Kept ASCII-simple deliberately: 15 prior ledger rows
// carry markers that were never present in the rendered section, and punctuation drift is one
// way that happens. What is stored here is byte-identical to what is written into the section.
const M_CAPA = 'FOUNDATION CAPA PROGRAMME: corrective AND preventive, every workstream carrying a CI-asserted exit predicate (ratification 49656c8c)';
const M_LEDGER = 'LEDGER REPAIR PRECEDES THE FRESHNESS LEVER (ratification 1726f11d)';
const M_SURFACES = 'ALTIFYAI STAGE 23: BUILD THE ELEVEN SURFACES, and the fourteen-journey set is the specification of record (ratification 767b288f)';

const CLAUSES = {
  '49656c8c': {
    marker: M_CAPA,
    adam: `- **${M_CAPA}** — Chairman in-terminal 2026-09-02 ~18:1xZ, after the drift census: corrective actions AND preventive actions, as a comprehensive plan. Binding: every workstream pairs a corrective with a preventive, and the preventive ships as an exit predicate ASSERTED IN CI IN THE SAME PR as its corrective. A repair without a zero-asserting check is incomplete. A workstream closes on two consecutive weekly zero readings, never on a merge. Adam sources and drives; Solomon diagnoses and sequences; the coordinator dispatches. Executing representation: the six CAPA orchestrator parents under plan of record c4d9c075.`,
    coordinator: `- **${M_CAPA}** — Chairman in-terminal 2026-09-02 ~18:1xZ. Coordinator share: dispatch the CAPA workstreams in the sequenced order recorded on each parent (capa_sequence / capa_sequence_after), and do not accept a child whose corrective lands without its exit predicate asserted in CI in the same PR. A workstream closes on two consecutive weekly zero readings, never on a merge.`,
    solomon: `- **${M_CAPA}** — Chairman in-terminal 2026-09-02 ~18:1xZ. Solomon share: diagnose the drift classes, define each workstream's exit predicate, sequence the workstreams against the roadmap with measured capacity, and re-run every exit predicate at the weekly review. Propose-only; Adam sources and the coordinator dispatches.`,
  },
  '1726f11d': {
    marker: M_LEDGER,
    adam: `- **${M_LEDGER}** — Chairman direction, in-terminal 2026-09-03 ~12:0xZ. Two items with a sequencing constraint. (1) The advice-outcome ledger's decision and outcome fields are stamped FROM THE DOWNSTREAM RESULT and never defaulted: decision from the asker's actual disposition, outcome from the downstream SD or gate result, neither pre-filled at insert. Scoped by the chairman himself as evidence-provenance work adjacent to a workstream in flight, so it folds into the gate-evidence workstream rather than becoming its own SD. (2) Seat rotation and compaction discipline is the freshness lever, stated CONDITIONALLY ("if freshness is the real driver") and therefore a lever UNDER TEST, never a proven cause. ITEM 1 IS THE PRECONDITION FOR MEASURING ITEM 2: until decision and outcome discriminate, no instrument can tell whether rotation improved anything, and acting on 2 first produces a change nobody can evaluate. Measured basis at capture: 2,317 rows, decision reads accepted on 500 of 500 sampled, outcome reads unknown on 87 percent.`,
    solomon: `- **${M_LEDGER}** — Chairman direction, in-terminal 2026-09-03 ~12:0xZ. Solomon share: the advice-outcome ledger is the named accuracy signal for this seat, and it cannot currently grade advice (decision accepted on 500 of 500 sampled, outcome unknown on 87 percent). Until decision and outcome discriminate, do not report advice-uptake as a rate. Seat rotation and compaction discipline is this seat's own practice to run, but it is a lever under test rather than a proven cause, and it is not measurable before the ledger repair lands.`,
  },
  '767b288f': {
    marker: M_SURFACES,
    adam: `- **${M_SURFACES}** — Chairman decision, in-terminal 2026-09-03 ~12:0xZ: build the eleven missing product surfaces rather than re-key the journey set. Binding consequences, recorded at capture so none is later read as a defect. The fourteen-journey set is the SPECIFICATION OF RECORD for AltifyAI stage 23, not a guess to be trimmed to what shipped. Acceptance is THE STAGE-23 WALK ITSELF PASSING under the gate literals, never eleven PRs merged. Roadmap progression remaining at zero stages per day for the duration is the EXPECTED CONSEQUENCE OF THIS DECISION, not a fleet-velocity fault, and is reported that way. Eleven surfaces is VENTURE PRODUCT SCOPE and belongs in the AltifyAI venture lane, never in the CAPA harness programme.`,
    coordinator: `- **${M_SURFACES}** — Chairman decision, in-terminal 2026-09-03 ~12:0xZ. Coordinator share: the eleven surfaces are venture product scope and route to the AltifyAI venture lane, not the harness belt. Zero stages per day while they are built is the expected consequence of a chairman decision and is not to be reported as a stalled band. Acceptance is the stage-23 walk passing, never a count of merged PRs.`,
    solomon: `- **${M_SURFACES}** — Chairman decision, in-terminal 2026-09-03 ~12:0xZ. Solomon share: the fourteen-journey set is the specification of record, so re-keying it to the shipped surface is closed as an option. Report zero stages per day for the duration as the expected consequence of this decision in the forecast basis rather than as a stalled band, and issue the addendum the prior basis deferred on the grounds that its blocker was not a work item.`,
  },
};

const TARGETS = [
  { sectionId: 601, role: 'adam', anchor: '### 5s.' },
  { sectionId: 605, role: 'coordinator', anchor: '## Chairman-ratified standing constraints' },
  { sectionId: 611, role: 'solomon', anchor: null }, // held for Solomon's headroom nomination
];

const { data: rows, error } = await s.from('leo_protocol_sections').select('id,title,content').in('id', [601, 605, 611]);
if (error) { console.log('READ FAILED', error); process.exit(1); }
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

const bkDir = path.join(process.cwd(), 'scripts', 'one-off', 'encode-backup-0903');
fs.mkdirSync(bkDir, { recursive: true });
for (const r of rows) fs.writeFileSync(path.join(bkDir, `section-${r.id}.before.md`), r.content || '');
console.log('backups written to', bkDir);

for (const t of TARGETS) {
  const row = byId[t.sectionId];
  if (!row) { console.log(`section ${t.sectionId} MISSING`); continue; }
  if (!t.anchor) { console.log(`section ${t.sectionId} (${t.role}) HELD — awaiting headroom nomination, not edited`); continue; }

  const additions = [];
  for (const [rid, c] of Object.entries(CLAUSES)) {
    const text = c[t.role];
    if (!text) continue;
    if ((row.content || '').includes(c.marker)) { console.log(`  section ${t.sectionId}: marker for ${rid} ALREADY PRESENT, skipping`); continue; }
    additions.push(text);
  }
  if (!additions.length) { console.log(`section ${t.sectionId}: nothing to add`); continue; }

  if (!(row.content || '').includes(t.anchor)) { console.log(`section ${t.sectionId}: ANCHOR NOT FOUND (${t.anchor}) — refusing to edit`); continue; }

  const next = (row.content || '').replace(/\s*$/, '') + '\n' + additions.join('\n') + '\n';
  console.log(`section ${t.sectionId} (${t.role}): ${row.content.length} -> ${next.length} chars (+${next.length - row.content.length}), clauses ${additions.length}`);

  if (APPLY) {
    const { error: upErr } = await s.from('leo_protocol_sections').update({ content: next }).eq('id', t.sectionId);
    console.log(`  write: ${upErr ? JSON.stringify(upErr) : 'OK'}`);
  }
}

if (APPLY) {
  const { data: back } = await s.from('leo_protocol_sections').select('id,content').in('id', [601, 605]);
  console.log('\nREADBACK (markers present in DB section content):');
  for (const r of back || []) {
    for (const [rid, c] of Object.entries(CLAUSES)) {
      if (!c[r.id === 601 ? 'adam' : 'coordinator']) continue;
      console.log(`  section ${r.id} / ${rid}: ${(r.content || '').includes(c.marker) ? 'PRESENT' : 'MISSING'}`);
    }
  }
  fs.writeFileSync(path.join(bkDir, 'markers.json'), JSON.stringify(Object.fromEntries(Object.entries(CLAUSES).map(([k, v]) => [k, v.marker])), null, 1));
  console.log('markers written to', path.join(bkDir, 'markers.json'));
} else {
  console.log('\nDRY RUN — pass --apply to write.');
}
