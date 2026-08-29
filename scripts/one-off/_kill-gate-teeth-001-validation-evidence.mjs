import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-KILL-GATE-TEETH-001';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'VALIDATION', supabase });

  let results = {
    verdict: 'PASS',
    confidence_score: 88,
    findings: [
      'SC4 COLUMN VERIFIED REAL: public.venture_stages.gate_type exists (text, NOT NULL) and is populated: kill x4, promotion x7, none x16 over a 27-row scheme (max stage_number=27). Kill stages measured live = {3,5,13,24}, matching the SD scope text exactly. SC4 is buildable as written.',
      'DUAL-ALIAS NON-ISSUE: connection aliases "ehg" and "engineer" resolve to the SAME Supabase project (identical host, db=postgres, identical venture_stages content, identical venture_stage_transitions count=431). There is no cross-database ambiguity for the harness; PLAN does not need to pick a database.',
      'SC5 STAMP INDEPENDENTLY VERIFIED: roadmap_wave_items row 10845036-5fa4-4c72-8a88-2152725bfe96 carries promoted_to_sd_key=SD-LEO-INFRA-KILL-GATE-TEETH-001, with metadata.hold.lifted_at=2026-08-29T04:39:26.081Z. Single-representation stamp is real, not merely asserted.',
      'SC5 SOLOMON CHECKPOINT ON THE RECORD: session_coordination e9087f46 (sender_type=solomon, 2026-08-29T02:47:31Z) is the PRE-LEAD VERIFICATION DISCHARGE. Body read verbatim; it records PASS pre-LEAD with exactly one citation-precision fix queued for PLAN. Predecessor pre-commitment row ee96aac5 also confirmed present.',
      'SC3 CITATION DEFECT CONFIRMED BY INDEPENDENT PROBE (not relayed): 5c4528b0 returns ZERO rows in chairman_decisions AND zero rows in session_coordination as either id or correlation_id. By contrast beca4a47 and d580dac7 BOTH resolve to real chairman_decisions rows (decision_type=session_question, status=approved). The Solomon assertion is corroborated on my own instrument.',
      'PRIOR ART EXISTS (this is NOT pure greenfield): docs/design/kill-gate-teeth-proof-spec.md (14KB, dated 07-11, re-materialized by Adam, original author Solomon) is the governing spec, with sections 0-6 including the sealed-prediction/hash-commit design and the pre-registered ALPHA/BETA SHA-256 seal hashes. PLAN MUST read this before writing the PRD.',
      'PRIOR ART: lib/eva/lifecycle/thesis-kill-gate.js (SD-LEO-INFRA-KILL-GATE-TIER-001) is the live kill-gate seam this regime is meant to PROVE. It already cites the teeth-proof spec sections 2-BETA/4. It logs verdicts to system_events and mints chairman_decisions rows via createOrReusePendingDecision.',
      'NO DUPLICATE HARNESS: grep census across scripts/, lib/, database/, src/ for sealed-prediction | teeth-proof | firing-fence yields only 2 non-archive hits, both mere references (the roadmap backfill row and the spec citation inside thesis-kill-gate.js). No sealed-prediction registry, no firing-verification harness, and no teeth-proof report table exists. The three build deliverables are genuinely unbuilt.',
    ],
    warnings: [
      'BINDING, NOT OPTIONAL - SC3 REWORD MUST APPEAR AS A PRD FUNCTIONAL REQUIREMENT: per discharge e9087f46 verbatim, at PLAN reword the SC3 citation to "W3 packet ruling, coordination corr 5c4528b0" AND co-cite beca4a47 + d580dac7, so the fence authority never rests on a single hard-to-search surface. Solomon burned two probes (all 740 chairman_decisions rows scanned, absent) before the wave row spec resolved the TYPE. This is an oracle checkpoint condition, not editorial preference. If the PRD ships without it, the discharge condition is unmet.',
      'CANONICALITY TENSION - MEASURED AND RESOLVED IN SC4 FAVOUR, BUT PLAN MUST DOCUMENT IT: SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001 installed scripts/modules/architectural-prevention/stage-gate-type-canonicalize-invariant.js declaring gate_type a "lossy mirror" and work_type canonical. I measured the actual columns: work_type CANNOT express the kill/promotion distinction - work_type=decision_gate covers BOTH the 4 kill stages AND promotion stages 10/16/17/25. For kill-SET derivation, gate_type is strictly MORE informative and is the ONLY surface carrying the distinction. SC4 is therefore correct. The invariant governs decision_type classification writers, which is a different use. PLAN should state this explicitly so a future auditor does not "fix" the harness onto work_type and silently widen the kill set from 4 stages to 8.',
      'INVARIANT IS CURRENTLY INERT BUT COULD WAKE: app_config key stage_config_gate_type_canonicalization has ZERO rows, so loadInvariantConfig returns null and mode defaults to WARNING (feedback-table logging, non-blocking). Also lifecycle_stage_config does not exist as a table. If that config row is ever added in BLOCKING mode, harness code reading gate_type could be flagged. PLAN should record the justified exemption now rather than discover it at EXEC.',
      'UNDERSPECIFIED - SC2 "actual gate behavior" HAS NO PINNED OBSERVATION SURFACE: at least three candidate surfaces exist (system_events verdict logs, chairman_decisions rows minted on FIRED, venture_stage_transitions). SC2 says compare "actual gate behavior (fired/passed, verdict, evidence)" without naming which surface is authoritative. Reading the wrong one, or OR-ing them, makes the teeth-proof record unfalsifiable. PLAN must pin exactly one canonical surface per field.',
      'UNDERSPECIFIED AND HIGH-CONSEQUENCE - "FIRES" IS AMBIGUOUS WHILE THE GATE IS OBSERVE-ONLY: thesis-kill-gate.js ships OBSERVE-ONLY by default (LEO_THESIS_KILL_GATE=observe: evaluate + log + mint decision, NEVER blocks advancement; binding mode is a separate later decision). So a kill gate can "fire" (log a verdict) while the venture still advances. A teeth-proof that only checks for a logged verdict would certify teeth that do not bite. PLAN must define whether the proof asserts verdict-emitted, advancement-blocked, or both, and must record the flag state under which each teeth-proof record was produced.',
      'SC1 IS THE HARDEST CRITERION AND NEEDS AN EXPLICIT TEST DESIGN: "prove the traversal side cannot read undischarged seals" is a negative/observability claim. Per the CANT-OBSERVE class named in the SD itself, a fixture where both sides run in one process proves logic, not observability. PLAN must specify the isolation boundary that makes blindness measurable (separate credential/role/process), otherwise SC1 degrades into exactly the fixture assertion it forbids.',
      'SC3 ARMING TRIGGER IS UNDERSPECIFIED MECHANICALLY: "first UNATTENDED S0-S5 traversal" and "attended" have no measured predicate identified. There is no attended/unattended column on venture_stages. PLAN must name the exact readable predicate for attendedness and for venture-1 identity, or the fence is procedural (the very thing SC3 forbids) rather than mechanical.',
    ],
    recommendations: [
      'PLAN MUST READ docs/design/kill-gate-teeth-proof-spec.md sections 3 and 4 before authoring the PRD; it contains the run protocol and the pre-registered PASS/FAIL criteria the PRD should inherit rather than re-derive. Note spec section 3.4: sealed instances are held OUTSIDE the repo with only hashes lodged, which is a hard design constraint on the sealed-prediction registry.',
      'Add an explicit PRD functional requirement for the SC3 citation reword (W3 packet ruling, coordination corr 5c4528b0, co-citing beca4a47 + d580dac7) and update strategic_directives_v2.success_criteria SC3 text in the same action, so the criterion and the PRD never disagree.',
      'Pin kill-set derivation to a single shared helper reading venture_stages.gate_type = kill, so the SC4 grep census has exactly one legitimate call site to find and zero list literals.',
      'Define fired/passed semantics against the LEO_THESIS_KILL_GATE flag state and persist that flag value on every teeth-proof record, so a proof produced in observe mode is never later misread as proof of blocking.',
      'Specify the SC1 isolation boundary (a distinct DB role or process with no read grant on undischarged seals) so blindness is demonstrated by a denied read, not by an if-statement.',
      'Name the mechanical attended/venture-1 predicate for SC3 in the PRD; if no such column exists, the PRD should add one rather than let the fence rest on convention.',
    ],
    summary: 'PASS for LEAD-TO-PLAN. The SD is internally consistent, non-contradictory, and describes a buildable ALPHA scope. Load-bearing checks all verified on my own instruments: venture_stages.gate_type EXISTS (text NOT NULL, kill x4 = stages {3,5,13,24} of a 27-stage scheme) so SC4 is real; the ehg and engineer aliases are the same project so there is no cross-DB ambiguity; the SC5 stamp is confirmed on roadmap_wave_items 10845036 and the Solomon discharge e9087f46 is on the record. I independently corroborated Solomon rather than relaying him: 5c4528b0 resolves to ZERO rows in chairman_decisions and session_coordination, while beca4a47 and d580dac7 are both real approved chairman_decisions rows, so the binding SC3 citation reword is a genuine defect fix and MUST land as a PRD functional requirement. Not greenfield: the governing 07-11 spec doc and the live thesis-kill-gate seam exist as prior art to build ON, but none of the three deliverables (sealed-prediction registry, firing-verification harness, teeth-proof report) exists, so there is no duplicate work. Seven warnings routed to PLAN, the sharpest being that the kill gate ships OBSERVE-ONLY by default so "fires" must be defined precisely, that SC2 does not pin an authoritative observation surface, and that SC1 and SC3 lack the mechanical predicates their own wording demands.',
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      sd_id: 'e0b66c35-8228-4f13-8bcf-2e0a382d98b8',
      sd_status: 'draft',
      gate_type_column: {
        exists: true,
        table: 'public.venture_stages',
        type: 'text',
        nullable: false,
        distribution: { none: 16, promotion: 7, kill: 4 },
        kill_stages: [3, 5, 13, 24],
        kill_stage_keys: ['comprehensive_validation', 'profitability_forecasting', 'product_roadmap', 'launch_readiness_gate'],
        scheme_size: 27,
      },
      db_alias_check: {
        ehg: 'same project',
        engineer: 'same project',
        evidence: 'identical host, identical 431 venture_stage_transitions, identical kill set',
      },
      work_type_discriminating_power: {
        verdict: 'work_type CANNOT discriminate kill from promotion',
        decision_gate_covers: [3, 5, 10, 13, 16, 17, 24, 25],
        conclusion: 'gate_type is the only surface carrying the kill/promotion distinction; SC4 is correct',
      },
      sc3_citation_probe: {
        '5c4528b0': { chairman_decisions: 0, session_coordination_as_id: 0, session_coordination_as_correlation_id: 0 },
        beca4a47: { chairman_decisions: 1, decision_type: 'session_question', status: 'approved' },
        d580dac7: { chairman_decisions: 1, decision_type: 'session_question', status: 'approved' },
        binding_action: 'reword SC3 to "W3 packet ruling, coordination corr 5c4528b0" and co-cite beca4a47 + d580dac7',
      },
      solomon_checkpoint: {
        discharge_row: 'e9087f46',
        sender_type: 'solomon',
        created_at: '2026-08-29T02:47:31Z',
        precommitment_row: 'ee96aac5',
        verdict: 'PASS pre-LEAD with one citation-precision fix for PLAN',
        discharged: true,
      },
      sc5_stamp: {
        table: 'roadmap_wave_items',
        row: '10845036-5fa4-4c72-8a88-2152725bfe96',
        promoted_to_sd_key: SD_KEY,
        verified: true,
      },
      prior_art: {
        spec_doc: 'docs/design/kill-gate-teeth-proof-spec.md',
        live_seam: 'lib/eva/lifecycle/thesis-kill-gate.js',
        canonicalization_invariant: 'scripts/modules/architectural-prevention/stage-gate-type-canonicalize-invariant.js',
        duplicate_harness_found: false,
        greenfield_deliverables: ['sealed-prediction registry', 'firing-verification harness', 'teeth-proof report'],
      },
      blocking_issues: [],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('VALIDATION', SD_KEY, { name: 'VALIDATION' }, results, { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' });
  console.log('VALIDATION EVIDENCE WRITTEN:', stored.id, stored.verdict, stored.confidence);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message, e.stack); process.exit(1); });
}
