import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-CODE-PATH-AWARE-001';
const { data: sd } = await s.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
const SD_UUID = sd.id;
const PRD_ID = 'PRD-' + SD_KEY;

const stories = [
  {
    story_key: `${SD_KEY}:US-001`,
    title: 'LEAD-TO-PLAN gate is code-path-aware (no EHG_Engineer→EHG flip for backend SDs)',
    user_role: 'LEO maintainer running the LEAD-TO-PLAN handoff for a backend SD',
    user_want: 'the LEAD-TO-PLAN target_application gate (scripts/modules/handoff/executors/lead-to-plan/gates/target-application.js) to NOT auto-correct an SD from EHG_Engineer to EHG when its key_changes/scope reference EHG_Engineer code paths (lib/, scripts/, database/migrations/) and no ehg-app paths (src/, EHG/), even when scope co-mentions marketing/UI vocabulary (stage, venture, ui component, wireframe, dashboard)',
    user_benefit: 'so that backend SDs whose code lives in EHG_Engineer (witnessed: SD-SURFACEAWARE B/C/E, SD-ACTIVATE-SURFACEAWARE-WIREFRAME-PIPELINE-ORCH-001) stop being mislabeled EHG and breaking GATE2 design-fidelity + GATE5/GATE6, eliminating the manual target_application correction the maintainer currently performs before every handoff',
    priority: 'critical',
    acceptance_criteria: [
      { id: 'AC-1-1', criterion: 'A code-path signal (EHG_Engineer paths present AND no src/EHG paths) suppresses the high-confidence EHG flip', given: 'an SD with target_application=EHG_Engineer whose key_changes reference lib/eva and scope co-mentions stage/venture/ui component', when: 'the LEAD-TO-PLAN target_application gate runs', then: 'target_application is NOT changed to EHG and the gate logs the code-path signal that suppressed the flip', testable: true },
      { id: 'AC-1-2', criterion: 'Explicit operator intent is still honored', given: 'an SD with metadata.target_application_explicit=true', when: 'the gate runs', then: 'auto-correction is skipped regardless of scope vocabulary (existing QF-20260509-986 behavior preserved)', testable: true },
      { id: 'AC-1-3', criterion: 'No regression for genuine EHG SDs', given: 'an SD whose key_changes reference src/components and no EHG_Engineer paths', when: 'the gate runs', then: 'EHG inference still applies (the suppression does not fire)', testable: true },
    ],
    implementation_context: '## Implementation\n\n**Primary file:** scripts/modules/handoff/executors/lead-to-plan/gates/target-application.js — validateTargetApplication(), the high-confidence mismatch branch (~lines 166-212). Add a code-path check BEFORE the EHG flip: compute the path signal from sd.key_changes + sd.scope via detectFromKeyChanges/PATH_PATTERN_DICTIONARY; if it resolves EHG_Engineer (EHG_Engineer paths present, no src/EHG), return pass without flipping.\n\n**Reuse:** detectFromKeyChanges + PATH_PATTERN_DICTIONARY (same file, ~lines 28/59). Respect the existing target_application_explicit guard (~line 173).\n\n**Out-of-scope:** venture-context routing (lib/governance/validate-target-application.js).',
    metadata: { fr_mapping: 'FR-1,FR-3' },
  },
  {
    story_key: `${SD_KEY}:US-002`,
    title: 'Path dictionary + creation-time crosscheck recognize EHG_Engineer code paths',
    user_role: 'SD author creating a migration-bearing or marketing-vocab EHG_Engineer SD',
    user_want: 'the canonical path classifier (PATH_PATTERN_DICTIONARY + detectFromKeyChanges) to recognize database/migrations/ as an EHG_Engineer code path, and the creation-time crosscheck (scripts/modules/sd-validation/target-application-crosscheck.js) to flag the marketing-vocab + EHG_Engineer-paths + target_application=EHG mismatch',
    user_benefit: 'so that a new SD is created with the correct target_application from the start and the mislabel is caught at creation/start (defense-in-depth) instead of surfacing as a broken GATE2/5/6 later',
    priority: 'high',
    acceptance_criteria: [
      { id: 'AC-2-1', criterion: 'database/migrations/ votes EHG_Engineer', given: 'a key_changes set whose only paths are database/migrations/*.sql', when: 'detectFromKeyChanges runs', then: 'it returns EHG_Engineer (the new dictionary entry is honored)', testable: true },
      { id: 'AC-2-2', criterion: 'The crosscheck detects the code-path mismatch', given: 'scope referencing lib/eva + marketing/dashboard vocabulary with target_application=EHG', when: 'target-application-crosscheck.js validateTargetApplication runs', then: 'it returns a non-PASS (WARN/BLOCK) verdict naming the EHG_Engineer code paths', testable: true },
      { id: 'AC-2-3', criterion: 'No regression to explicit phrasing detection', given: 'scope text "frontend only" with target_application=EHG_Engineer', when: 'the crosscheck runs', then: 'the existing EHG_ONLY mismatch is still detected', testable: true },
    ],
    implementation_context: '## Implementation\n\n**Files:** (1) scripts/modules/handoff/executors/lead-to-plan/gates/target-application.js — add database/migrations/ to PATH_PATTERN_DICTIONARY.EHG_Engineer (~line 28). (2) scripts/modules/sd-validation/target-application-crosscheck.js — add code-path-aware detection (EHG_Engineer paths lib/|scripts/|database/migrations/ vs src/|EHG/) alongside the existing ENGINEER_ONLY/EHG_ONLY phrase patterns; keep WARN default (TARGET_APP_CROSSCHECK_VERDICT).\n\n**Note:** leo-create-sd.js does NOT import the crosscheck (a gap); consider wiring it (defense-in-depth, optional).',
    metadata: { fr_mapping: 'FR-2,FR-4' },
  },
  {
    story_key: `${SD_KEY}:US-003`,
    title: 'Regression tests lock target_application classification both directions',
    user_role: 'CI and LEO maintainer guarding against classifier regressions',
    user_want: 'unit tests reproducing the real token co-occurrence mislabel (wireframe generator + ui components + lib/eva paths) for the SD-SURFACEAWARE B/C/E + SD-ACTIVATE scenarios, plus the inverse (genuine EHG src/ SD) and the mixed-repo case',
    user_benefit: 'so that target_application classification is locked in both directions and the mislabel (and any future over-correction) cannot silently recur through the LEAD-TO-PLAN gate or the crosscheck',
    priority: 'high',
    acceptance_criteria: [
      { id: 'AC-3-1', criterion: 'Backend fixtures stay EHG_Engineer', given: 'fixtures mirroring SD-SURFACEAWARE B/C/E + SD-ACTIVATE (EHG_Engineer paths + marketing vocab)', when: 'the gate + crosscheck run under test', then: 'target_application resolves to / remains EHG_Engineer', testable: true },
      { id: 'AC-3-2', criterion: 'Genuine EHG fixture stays EHG', given: 'a fixture with src/components paths and no EHG_Engineer paths', when: 'the gate runs under test', then: 'target_application resolves to EHG', testable: true },
      { id: 'AC-3-3', criterion: 'Mixed-repo yields no correction', given: 'a fixture referencing both lib/eva and src/ paths', when: 'the gate runs under test', then: 'no auto-correction occurs (target_application preserved)', testable: true },
    ],
    implementation_context: '## Implementation\n\n**New test file(s):** tests/unit/ — cover (a) the LEAD-TO-PLAN gate validateTargetApplication code-path branch, (b) detectFromKeyChanges with database/migrations/, (c) target-application-crosscheck.js code-path detection. Fixtures use REAL token co-occurrence (e.g. "wireframe generator" + "ui components" + lib/eva/...). No live DB — pass plain SD-shaped objects + a fake supabase where the gate updates (the gate calls supabase.update; stub it). Mirror tests/unit/leo-create-sd-target-app-explicit-flag.test.js for the harness.',
    metadata: { fr_mapping: 'FR-5' },
  },
];

await s.from('user_stories').delete().eq('sd_id', SD_UUID);
const rows = stories.map(st => ({
  sd_id: SD_UUID, prd_id: PRD_ID, story_key: st.story_key, title: st.title,
  user_role: st.user_role, user_want: st.user_want, user_benefit: st.user_benefit,
  priority: st.priority, status: 'ready',
  acceptance_criteria: st.acceptance_criteria,
  given_when_then: st.acceptance_criteria.map(ac => ({ given: ac.given, when: ac.when, then: ac.then })),
  implementation_context: st.implementation_context,
  implementation_status: 'pending', validation_status: 'pending', e2e_test_status: 'not_created',
  story_points: st.priority === 'critical' ? 5 : 3, metadata: st.metadata,
}));
const { data: ins, error } = await s.from('user_stories').insert(rows).select('story_key');
if (error) { console.log('ERR', error.message); process.exit(1); }
console.log('Replaced with', ins.length, 'quality stories:', ins.map(r=>r.story_key).join(', '));
