#!/usr/bin/env node
// LEAD-phase: fold validation-agent (769da2cf) + risk-agent (56d43b7b, 85d645f5) findings
// into the SD record as binding PLAN inputs, per SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001';

const FULL_STEP_ID_MAP = {
  'FR-1': 'stp-6aa6-view-a-list-of-all-m',
  'FR-2': 'stp-d8b9-upload-multiple-imag',
  'FR-3': 'stp-bfdb-generate-alt-text-fo',
  'FR-4': 'stp-ce40-easily-edit-the-ai-g',
  'FR-5': 'stp-2496-easily-copy-the-gene',
  'FR-6': 'stp-fc2f-delete-an-image-from',
  'FR-7': 'stp-686d-mark-alt-text-as-app',
  'FR-8': 'stp-abd0-export-alt-text-for-',
  'FR-9': 'stp-7903-provide-specific-key',
  'FR-10': 'stp-8c72-see-suggestions-for-',
  'FR-11': 'stp-58cd-generate-a-json-file',
};

const newRisks = [
  {
    risk: 'metadata.eleven_step_ids stores truncated step_id prefixes; the registry lookup (venture-step-executors.js:396) is exact-match on the FULL step_id. An implementer keying overrides off the metadata prefixes registers dead entries that read as wired but never fire — the :689 throw keeps firing uncaught.',
    impact: 'high', likelihood: 'medium',
    mitigation: `PLAN/EXEC must use the full step_id map (metadata.full_step_id_map, verified by risk-agent evidence 56d43b7b): ${JSON.stringify(FULL_STEP_ID_MAP)}.`,
  },
  {
    risk: 'tests/unit/apa/venture-step-executors.test.js:815 asserts Object.keys(stepOverrides).toEqual([...exactly the 3 current ids]) — exhaustive AND order-sensitive. It breaks on the FIRST override merged (FR-1), not the eleventh.',
    impact: 'high', likelihood: 'high',
    mitigation: 'FR-12 must subsume/replace this assertion with the shrinking-allowlist form as part of its own delivery, and FR-1 (the first FR to merge) must update it in the same PR rather than leaving it to break.',
  },
  {
    risk: 'The stage-23 walk cannot exercise most of the 11 overrides even after they are all registered: it currently breaks at position 2 (stp-fc2f, measured run 5662bf6e, passRate 7.14%) and, once that is fixed, would next break at position 3 (stp-e3e6, the venture-side POST /api/alt-text hang, cluster zero, explicitly out of this SD\'s scope). The walk itself is NOT a usable verification instrument for FR-1..FR-11.',
    impact: 'medium', likelihood: 'high',
    mitigation: 'Each override FR requires its own named, dated, per-override live-verification instrument and evidence artifact (mirroring scripts/one-off/verify-stp4de9-override-live-884.mjs) — never rely on a full walk pass as the FR\'s acceptance evidence. FR-13\'s walk re-run is expected to still FAIL after all 11 overrides merge (blocked on the venture-side cluster-zero hang) — this is a disclosed, accepted outcome and must not be read as this SD\'s failure at PLAN-TO-LEAD.',
  },
  {
    risk: 'Selector drift race: sibling venture PRs have already rewritten earlier siblings\' DOM (PR #83 rewrote src/ui/ImageListPage.jsx +185/-102, the file PR #80/-A created for FR-1; PR #81/-C added a further +99 to the same file). -E landing will likely touch these files again, potentially invalidating FR-1..FR-7 selectors verified before -E merged.',
    impact: 'medium', likelihood: 'medium',
    mitigation: 'Re-verify FR-1..FR-7 selectors against venture main immediately before authoring FR-13\'s final walk re-run, not just at each override\'s own merge time.',
  },
  {
    risk: 'Hand-copying the altifyaiUploadStepOverride convention 8 more times (11 total) gives 11 independent chances to omit the SEC-003 origin-equality check, with nothing asserting each override performs it.',
    impact: 'high', likelihood: 'medium',
    mitigation: 'Extract a shared buildAltifyaiSurfaceOverride(...) factory (risk-agent estimate: ~500-600 LOC hand-copied reduces to ~200 LOC via factory) so the origin check is structurally impossible to omit, plus one table-driven test asserting every registered ALTIFYAI override refuses an off-origin page.',
  },
  {
    risk: 'FR-6 (delete, stp-fc2f) is the first destructive override and runs at walk position 2, BEFORE any real upload exists in the walk (FR-1\'s override deliberately never calls setInputFiles, venture-step-executors.js:757-761).',
    impact: 'medium', likelihood: 'high',
    mitigation: 'FR-6 must create its own fixture image rather than depend on walk residue, and FR-1\'s override must tolerate an image-list-empty state since FR-6 can empty the library 9 positions earlier in the walk.',
  },
  {
    risk: 'FR-8 (export/CSV) and FR-11 (JSON view) are the first download-class overrides. lib/apa/live-instance-acquisition.mjs:83-84 creates the page with no explicit acceptDownloads/downloadsPath, and download.saveAs(download.suggestedFilename()) trusts a server-controlled filename (a path-traversal sink) while persisting the fenced UAT identity\'s data to disk.',
    impact: 'medium', likelihood: 'medium',
    mitigation: 'FR-8/FR-11 overrides must assert on the download event, its suggestedFilename, and content-type WITHOUT calling saveAs().',
  },
  {
    risk: 'FR-5 (copy, stp-2496): altifyai\'s own AltTextDisplay.jsx:152-161 handleCopy() swallows a clipboard-permission rejection in a bare catch{}. In headless Chromium, a missing clipboard grant is indistinguishable from a genuinely broken product, and granting clipboard-read/write requires a change to the SHARED browser context in live-instance-acquisition.mjs (affects every venture\'s walk, not just AltifyAI\'s override) — outside this SD\'s stated "AltifyAI registration block only" scope.',
    impact: 'medium', likelihood: 'medium',
    mitigation: 'PLAN must explicitly decide: (a) grant clipboard-read/write on the shared context as a small, disclosed scope addition, or (b) scope FR-5\'s override to assert an internal state change other than clipboard content (e.g. the button\'s post-click state) without requiring the clipboard grant. Do not silently pick one without recording the decision in the PRD.',
  },
  {
    risk: 'FR-12\'s completeness allowlist, if implemented as a RUNTIME allowlist inside buildStepExecutor rather than confined to the test, would silently weaken the :689 fail-closed default for exactly the steps FR-12 exists to protect.',
    impact: 'critical', likelihood: 'low',
    mitigation: 'The allowlist must live ONLY in the FR-12 test file, never in venture-step-executors.js runtime logic. The :689 throw remains unconditional for any step_id genuinely outside the 14-journey specification.',
  },
  {
    risk: 'FR-12\'s test belongs in vitest\'s db project (reads a live DB row, venture_artifacts id=4b60d6fe), not the unit project (tests/unit/apa/*, which excludes DB tests). Two historical anti-patterns apply if built carelessly: PAT-TEST-PINS-FACT-NOT-BEHAVIOUR-001 (a fixture pinning hash-derived step_id slugs that go stale after a Stage-15 regeneration) and PAT-TEST-STUBBED-WRITER-UNVERIFIED-001 (stubbing getVentureRegistration instead of reading the real registry). A local anti-precedent (.github/workflows/altifyai-uat-drift-check-cron.yml) deliberately fails OPEN, which FR-12 must not imitate.',
    impact: 'medium', likelihood: 'medium',
    mitigation: 'Place FR-12 as a *.db.test.js in the db vitest project, read the LIVE venture_artifacts row (not a fixture snapshot) and the LIVE registry via getVentureRegistration (not a stub), and fail CLOSED (missing/unreadable spec = test failure, never a pass).',
  },
  {
    risk: 'FR-13\'s walk-rerun recording target needs re-verification at PLAN time: runVentureJourneyWalk({sdId}) stamps metadata.journey_walk_result onto whatever sdId it is invoked with, but the actual journey_steps owner in this system is SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-002, not SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001. Separately, scripts/modules/handoff/executors/plan-to-lead/gates/prerequisite-check.js:288-314 WAITs any SD carrying journey_steps whose walk status isn\'t pass, with only "absent" exempt from a 24h ceiling — writing a walk result to the wrong SD could trip an unrelated SD\'s gate.',
    impact: 'high', likelihood: 'medium',
    mitigation: 'LEAD\'s prior correction (write to metadata.stage23_walk_run_id on ELEVEN-001) stands as the SAFE default (a dedicated non-journey_steps metadata field cannot trip prerequisite-check.js), but PLAN must confirm at PRD time which sdId the canonical walk runner actually needs to be invoked with to produce a meaningful run, and must NOT invoke it with SPRINT-2026-002\'s id without first checking whether that trips prerequisite-check.js on SPRINT-2026-002 or any other SD gated on its journey_steps status.',
  },
  {
    risk: 'metadata.dedup_note misattributes QF-20260902-884 as having registered stp-e3e6/stp-6219; QF-20260902-033 (completed) registered those two, and 884 registered the upload override only. Both are closed so the dedup conclusion is unaffected, but the citation was wrong.',
    impact: 'low', likelihood: 'low',
    mitigation: 'Corrected in this record; no functional impact.',
  },
];

async function main() {
  const { data: current, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('risks, implementation_guidelines, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) { console.error('❌ Fetch failed:', fetchErr.message); process.exit(1); }

  const risks = [...current.risks, ...newRisks];

  const implementation_guidelines = [
    ...current.implementation_guidelines,
    'EXEC build order: FR-12 (completeness ledger + guard) FIRST, then FR-6 (delete, the current measured walk break point at position 2), then the remaining FR-1..FR-5/FR-7 as their surfaces merge, then FR-8..FR-11 once ELEVEN-001-E merges, then FR-13 last.',
    'Use metadata.full_step_id_map (FULL step_ids, not the truncated metadata.eleven_step_ids prefixes) as registry keys for every override.',
    'Prefer a shared buildAltifyaiSurfaceOverride(...) factory over hand-copying the altifyaiUploadStepOverride pattern 8 more times, to make the SEC-003 origin check structurally impossible to omit.',
    'FR-12\'s allowlist must live only in its test file (vitest db project, *.db.test.js, live DB reads, fail-closed) — never as a runtime allowlist inside venture-step-executors.js.',
    'The stage-23 walk is not a usable per-FR verification instrument (breaks by position 3 regardless of this SD\'s work); each override FR needs its own dated live-verification evidence artifact instead.',
  ];

  const metadata = {
    ...current.metadata,
    full_step_id_map: FULL_STEP_ID_MAP,
    dedup_note_correction: 'QF-20260902-033 (not -884) registered stp-e3e6/stp-6219; both closed, conclusion unaffected.',
    lead_subagent_evidence: {
      validation: '769da2cf-e8fc-4247-95ed-be18929fd56a',
      risk_measured: '56d43b7b-1632-492b-9770-0bd45b0d7c29',
      risk_canonical: '85d645f5-1762-4bcd-b5e0-039f60daf18d',
    },
    lead_decision: {
      decided_at: new Date().toISOString(),
      decision: 'PROCEED as ONE SD (not split). FR-1..FR-7+FR-12 buildable now; FR-8..FR-11+FR-13 hold pending SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001-E (active/EXEC, sibling cadence measured at ~4 merges/16h, expected hours not days). The EXEC hold for FR-8..11+FR-13 is an explicit, disclosed, externally-gated hold — not a canonical pause point and not a parent-orchestrator WAIT (this SD has no children) — release predicate: ELEVEN-001-E reaching status=completed.',
    },
  };

  const { error: updErr } = await supabase
    .from('strategic_directives_v2')
    .update({ risks, implementation_guidelines, metadata })
    .eq('sd_key', SD_KEY);
  if (updErr) { console.error('❌ Update failed:', updErr.message); process.exit(1); }

  console.log(`✅ Folded ${newRisks.length} sub-agent findings into risks[], 5 guidelines added, LEAD decision recorded.`);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
