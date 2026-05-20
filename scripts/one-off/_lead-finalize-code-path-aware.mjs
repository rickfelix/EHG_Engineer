// Record Explore evidence + amend SD scope with LEAD findings for SD-LEO-INFRA-CODE-PATH-AWARE-001.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = 'SD-LEO-INFRA-CODE-PATH-AWARE-001';

const { data: sd } = await s.from('strategic_directives_v2').select('id, metadata').eq('sd_key', KEY).single();
const SD_UUID = sd.id;

// --- Explore evidence (gate REQUIRED_SUBAGENTS['LEAD-TO-PLAN'] includes 'Explore'; Explore agent has no Write tool) ---
const exploreRow = {
  sd_id: SD_UUID,
  sub_agent_code: 'Explore',
  sub_agent_name: 'Codebase Explorer',
  verdict: 'PASS',
  confidence: 90,
  critical_issues: [],
  warnings: ['SD scope initially named only the creation-time crosscheck; the witnessed HANDOFF mislabels come from the LEAD-TO-PLAN gate auto-corrector — scope expanded accordingly.'],
  recommendations: [
    'PRIMARY fix: scripts/modules/handoff/executors/lead-to-plan/gates/target-application.js validateTargetApplication() — its engineerPatterns/ehgPatterns omit marketing/landing/page/dashboard/wireframe; it auto-corrects EHG_Engineer->EHG when generic ehgPatterns (stage/venture/ui component) co-occur. Make it code-path-aware: do not flip to EHG when key_changes/scope reference EHG_Engineer paths and no src/|EHG/ paths.',
    'Add database/migrations/ to PATH_PATTERN_DICTIONARY.EHG_Engineer (target-application.js ~line 28); reuse detectFromKeyChanges (do not build a new dictionary).',
    'Respect target_application_explicit (QF-20260509-986): a true explicit operator choice must not be auto-corrected; detectFromKeyChanges is NOT explicit.',
    'Secondary: strengthen scripts/modules/sd-validation/target-application-crosscheck.js (creation/start validator); note leo-create-sd.js does NOT import it (gap).',
    'Tests: none exist for the scope-text path. Add regression fixtures with real token co-occurrence (wireframe generator + ui components + lib/eva paths) for B/C/E + activation, plus inverse (src/) + mixed-repo.',
  ],
  detailed_analysis: JSON.stringify({
    creation_path: 'leo-create-sd.js:1613-1630 precedence explicit>VENTURE>detectFromKeyChanges>getCurrentVenture>EHG_Engineer; marketing-vocab SD with EHG_Engineer key_changes is created EHG_Engineer correctly.',
    handoff_corrector: 'scripts/modules/handoff/executors/lead-to-plan/gates/target-application.js:85-244 validateTargetApplication() scope-text auto-correction is the real culprit (flips to EHG at LEAD-TO-PLAN).',
    path_dictionary: 'PATH_PATTERN_DICTIONARY in target-application.js: EHG=[src/components,src/pages,...], EHG_Engineer=[scripts/,lib/eva/,...]; MISSING database/migrations/.',
    reusable_helper: 'detectFromKeyChanges (same file) + extractFilePaths in scripts/prd/validate-prd-fields.js:103.',
    live_witness: 'SD-SURFACEAWARE child C is live-mislabeled target_application=EHG, explicit=false, EHG_Engineer-only paths.',
    tests: 'only tests/unit/leo-create-sd-target-app-explicit-flag.test.js exists; no scope-text or detectFromKeyChanges tests.',
  }),
  metadata: { files_identified: ['scripts/modules/handoff/executors/lead-to-plan/gates/target-application.js', 'scripts/modules/sd-validation/target-application-crosscheck.js', 'scripts/leo-create-sd.js'] },
  validation_mode: 'prospective',
  source: 'Explore',
  phase: 'LEAD',
  summary: 'Explored target_application classification. Real handoff-mislabel culprit is the LEAD-TO-PLAN gate auto-corrector (target-application.js), not the creation-time crosscheck. Identified precise fix targets, the reusable detectFromKeyChanges/PATH_PATTERN_DICTIONARY (missing database/migrations/), the target_application_explicit guard, and the test gap.',
};
const { data: ev, error: evErr } = await s.from('sub_agent_execution_results').insert(exploreRow).select('id').single();
if (evErr) { console.log('EXPLORE EVIDENCE ERR:', evErr.message); process.exit(1); }
console.log('EXPLORE_EVIDENCE', ev.id);

// --- Amend scope + key_changes per LEAD findings ---
const scope = 'IN SCOPE (EHG_Engineer only; backend/scripts; no UI): (1) PRIMARY — make the LEAD-TO-PLAN target_application auto-corrector code-path-aware in scripts/modules/handoff/executors/lead-to-plan/gates/target-application.js: do NOT auto-correct EHG_Engineer to EHG when the SD key_changes/scope reference EHG_Engineer paths (lib/, scripts/, database/migrations/) and no ehg-app (src/, EHG/) paths; respect target_application_explicit (do not override an explicit operator choice). (2) Add database/migrations/ to PATH_PATTERN_DICTIONARY.EHG_Engineer and reuse detectFromKeyChanges rather than a new dictionary. (3) SECONDARY — strengthen scripts/modules/sd-validation/target-application-crosscheck.js (creation/start validator) to detect the marketing-vocab + EHG_Engineer-paths + target=EHG mismatch. (4) Regression tests reproducing real token co-occurrence (e.g. wireframe generator + ui components + lib/eva paths) for SD-SURFACEAWARE B/C/E + SD-ACTIVATE, plus the inverse (genuine EHG src/ SD) and mixed-repo cases. OUT OF SCOPE: venture-context routing (lib/governance/validate-target-application.js); the EHG app repository; general sd_type classification.';

const key_changes = [
  { change: 'Make LEAD-TO-PLAN gate auto-corrector (handoff/executors/lead-to-plan/gates/target-application.js) code-path-aware', impact: 'stops the EHG_Engineer->EHG flip at every handoff that breaks GATE2/5/6 — the primary witnessed defect' },
  { change: 'Add database/migrations/ to PATH_PATTERN_DICTIONARY.EHG_Engineer; reuse detectFromKeyChanges', impact: 'path detector votes EHG_Engineer for migration-bearing SDs' },
  { change: 'Strengthen target-application-crosscheck.js (creation/start) for the marketing-vocab + EHG_Engineer-path mismatch', impact: 'catches the mislabel at creation, defense-in-depth' },
  { change: 'Regression tests (real token co-occurrence + inverse + mixed-repo)', impact: 'locks classification both directions; respects target_application_explicit' },
];

const metadata = { ...(sd.metadata || {}), lead_findings: { primary_target: 'scripts/modules/handoff/executors/lead-to-plan/gates/target-application.js', validation_evidence: 'c5f08994', explore_evidence: ev.id, over_correction_guard: 'require EHG_Engineer paths AND absence of src/|EHG/ paths; mixed=no auto-correct; respect target_application_explicit' } };

const { error: upErr } = await s.from('strategic_directives_v2').update({ scope, key_changes, target_application: 'EHG_Engineer', metadata }).eq('sd_key', KEY);
console.log(upErr ? 'AMEND ERR: '+upErr.message : 'Scope amended (primary target = LEAD-TO-PLAN gate) + target_application re-pinned EHG_Engineer');
