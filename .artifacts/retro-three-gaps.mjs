import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await sb.from('retrospectives').insert({
  sd_id: 'c716c5de-0f55-4357-8f5d-593818293a8b',
  retro_type: 'SD_COMPLETION',
  learning_category: 'APPLICATION_ISSUE',
  generated_by: 'MANUAL',
  target_application: 'EHG_Engineer',
  affected_components: [
    'lib/policy/severity-pair-coupling.js',
    'lib/policy/anon-chairman-boundary.js',
    'scripts/severity-pair-divergence-fence.mjs',
    'scripts/probe-anon-chairman-reach.mjs',
    'database/migrations/20260802_bound_anon_feedback_ingress.sql',
    'database/chairman-gated/20260803_bound_anon_ingress_source_type_qualifier.sql',
  ],
  title: 'The hazard the SD predicted fired during the SD, and the boundary it asked us to document was already documented',
  description:
    'Three gaps in an APPLIED permission policy, sharing one root: security reasoning that is correct in the author head '
    + 'and nowhere in the system. Two of the five FR outcomes changed mid-flight because measurement contradicted the plan '
    + '— FR-3 because the applied policy was amended WHILE THE SD WAS OPEN and its predicted fail-open went live, and FR-1 '
    + 'because the boundary turned out to be documented honestly in a SQL comment nothing executes. Zero DDL applied.',
  what_went_well: [
    'Measuring every inherited premise before encoding it. Three separate premises moved under measurement: the severity claim was incomplete, the caller-control claim was overstated, and my own suspicion that FR-3 was already starved was refuted by checking pg_policy.polroles (select_feedback_policy binds to authenticated, not anon).',
    'Building FR-2 and FR-3 as ONE fence. They read as unrelated tickets and are the same defect — an undeclared dependency between two separately-editable objects. Two mechanisms would have left the shared root untouched.',
    'Designing the fence to assert on the COUPLING rather than on reachability. That decision is what kept it red after the coordinator established the hazard was cold, and cold-because-another-defect-blocks-it is exactly the state that teaches a later reader the coupling is fine.',
    'Pricing both constrain options for FR-1 instead of staging the obvious one. REVOKE anon EXECUTE would have broken venture error capture fleet-wide; the anon key IS the shipped production mechanism. Staging it would have put a fleet-breaking change in front of the chairman dressed as a security fix.',
    'Eleven seeded defects across two suites, each proven to fail on the mutation before its passing case was trusted.',
    'Correcting my own artifacts in place rather than only in conversation — PRD FR-1, FR-3, FR-4 and FR-5 were each rewritten as facts arrived, and FR-3 carries all three of its states rather than only the newest.',
  ],
  what_needs_improvement: [
    'I OVERSTATED REACHABILITY in a high-severity signal. I reported the rate-limit disarm as apparently LIVE. The coordinator supplied the missing fact: the only non-telegram anon insert path has been dead end-to-end since 2026-07-04, so the disarm is COLD. My mechanism claim held; my exposure claim did not. I had labelled the inference correctly, which is why the correction was cheap — but the headline still said more than the evidence.',
    'FOUR extraction bugs in code I wrote to detect text, all the same shape: anchoring on the first `severity` token read a projection instead of the WHERE clause; a predicate normaliser that ignored table qualifiers produced a permanent false DIVERGENCE; a [^)]* gap could not cross a ::text cast; and correlated detection placed after literal detection fell through to unreadable, hiding a decidable divergence. Every one is a guard reading the wrong text — the class I already knew about and still walked into four more times.',
    'I planned FR-4 as staged DDL and it produced none. That was the right answer, but I only discovered it by grepping for callers late in EXEC. Checking who actually invokes the function belonged in LEAD, alongside the catalog reads.',
  ],
  key_learnings: [
    'A HAZARD CAN FIRE DURING THE SD THAT PREDICTS IT. FR-3 described a future fail-open; the applied policy was amended mid-SD and the fail-open arrived via the DUAL of the predicted route — nobody narrowed the SELECT policy, they narrowed the COUNTED SET relative to what SELECT exposes. When an SD names a coupling, watch both sides of it for the duration, not just the side the text names.',
    'COLD IS MORE DANGEROUS THAN LIVE WHEN THE COLDNESS IS ACCIDENTAL. The rate limit is currently protected by a SECOND DEFECT — a dead insert path — not by a working guard. A measured zero whose cause is a dead door is not safety, and the SD that revives the door would revive it into a disarmed limit. The fix for one HIGH opens the hazard of another.',
    'A FENCE MUST ASSERT ON THE COUPLING, NOT ON REACHABILITY. Keying on reachability would have reported green the moment the door died, and the green would have been read as evidence the coupling was sound. Keying on the coupling keeps it red until the coupling is actually repaired, and it goes green on its own when the fold lands — which makes the fence a progress signal rather than a nag.',
    'DOCUMENTED IS NOT THE SAME AS READ. The KNOWN GAPS block found the gap, stated it accurately, conceded the false claim, and named the storm branch — and none of it travelled, because the only reader was a human who happened to open the file. The deliverable for undocumented knowledge is prose; the deliverable for unread knowledge is an executable declaration.',
    'A GUARD THAT SEARCHES FOR A FORBIDDEN CLAIM WILL MATCH THE HONEST EXPLANATION OF IT. The paragraph that correctly explains the gap contains every keyword of the false closure claim. A keyword scan flags it, and the resulting fix is to delete the accurate explanation — strictly worse than doing nothing. Match claim SHAPES, and treat concession as correction.',
    'DRIFT IN THE GOOD DIRECTION MUST ALSO FAIL. If the anon grant is dropped, the boundary declaration and every closure claim become wrong. A check that only fires on bad news trains people to edit the declaration and move on.',
    'STATING A SCOPE REDUCTION IS PART OF THE WORK. FR-3 counting-basis moved to another SD and FR-4 produced no DDL. Both are defensible; both would have looked like quiet under-delivery if the reasoning had stayed in my head instead of the PRD.',
  ],
  action_items: [
    'OPEN AND ROUTED: SD-LEO-INFRA-DEAD-VENTURE-USER-001 carries a coordinator-folded requirement that whatever revives venture_user_insert_feedback must in the same change make the rate limit BIND for it, two-sided (revived inserts succeed under the limit AND the 51st in the window refuses). This SD deliberately does not do that work.',
    'OPEN ASK: an anon-role probe harness. The starvation remains INFERRED from the rule that a subquery in a WITH CHECK is evaluated under the caller RLS — which is also FR-3 founding premise. If that premise is false, FR-3 is false and the routed fold is unnecessary.',
    'CONSIDER: wiring both fences into scripts/breakage/active-breakage-canary.mjs, named by the KNOWN GAPS block G4 as the in-repo drift instrument, with the two-arm shape it calls for because benign anon inserts are SUPPOSED to land.',
    'RECORDED, NOT STAGED: two FR-1 constrain options with measured costs — revoke anon EXECUTE (breaks fleet-wide error capture) and downgrade the storm-watermark severity (suppresses a signal that arguably should reach the chairman). Either needs a chairman decision on the tradeoff before it becomes DDL.',
  ],
  quality_score: 88,
  business_value_delivered:
    'A live rate-limit disarm in an applied permission policy was found, characterised, and routed with the binding '
    + 'requirement folded into the SD that would otherwise have exposed it. The anon-to-chairman-queue boundary is now '
    + 'machine-readable and drift-checked in both directions instead of living in a SQL comment. Two constrain options are '
    + 'priced so the chairman can decide on evidence rather than on a builder guess.',
  status: 'PUBLISHED',
}).select('id').single();

console.log(error ? ('RETRO ERROR: ' + error.message) : ('RETRO id=' + data.id));
