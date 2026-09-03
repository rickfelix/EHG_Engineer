#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
// Coordinator directive 6dead155 (Solomon 6ca21cd2, adopted): the 13 remaining AltifyAI
// journey steps mapped against a single hydrated, signed-in census of the live /generate
// workspace -- both before AND after driving a real upload through the fenced test
// identity, so post-upload-only UI (generation status, an eventual result display) is
// measured rather than guessed absent.
//
// INSTRUMENT: scripts/one-off/census-altifyai-generate-full-workspace.mjs (this repo,
// same commit) drove the pre/post-upload DOM census this table is built from. A second,
// longer-running probe (not committed -- an ad-hoc extension of the same script, run
// inline) polled data-testid="alt-text-display" every 5s for ~120s post-upload to confirm
// the "stuck" finding below was not a short timeout artifact.
//
// LIVE APP: https://altifyai.rickfelix2000.workers.dev, authenticated via the real fenced
// Clerk testing-token identity (buildStepExecutor('ALTIFYAI')). Test image: a synthetic
// in-memory 1x1 transparent PNG, generated at run time -- never a real photo, never
// committed to the repo.
//
// MEASURED, PRE-UPLOAD /generate (data-testid census): alt-text-workspace (container),
// drop-zone, file-input (type=file, accept=image/png,jpeg,webp,gif, NO "multiple"
// attribute -- single-file only by construction), feedback-widget/feedback-trigger.
// Nothing else. No nav, no list/gallery view, on ANY authenticated route (confirmed
// across /upload /create /images /alt-text /tools /content /new /dashboard in the prior
// QF-20260902-884 census) -- this app has exactly one functional screen today.
//
// MEASURED, POST-UPLOAD /generate (setInputFiles with the synthetic PNG): status-success
// ("Upload successful") appears immediately -- confirming upload auto-triggers generation
// with no separate "Generate" button anywhere in the DOM. alt-text-display and its child
// state-loading then render "Loading alt text.../Loading..." and NEVER change in ~120s of
// polling (5s interval) -- generation does not visibly complete or error. UNDIAGNOSED:
// this could be a real product defect (an AI call that errors/hangs with no surfaced error
// state), OR an artifact of the synthetic 1x1 test image being too degenerate for the
// generation backend to process a real image would need to be tried to distinguish these,
// which is out of THIS census's scope (no widget-interaction/production-upload NON-GOAL
// change here, matching QF-20260902-884's own boundary).
//
// VERDICT SHAPE: 'mapped' (a concrete, currently-observable control/selector backs this
// step), 'partial' (the triggering control exists and fires, but the step's OWN success
// signal was never observed to resolve), 'unmapped' (no corresponding UI exists in the
// live app at this deploy stage -- not a selector-guessing failure, a measured absence).

export const CENSUS_PROVENANCE = {
  measured_at: '2026-09-02T20:2xZ',
  live_app: 'https://altifyai.rickfelix2000.workers.dev',
  instrument: 'scripts/one-off/census-altifyai-generate-full-workspace.mjs',
  auth: 'real fenced Clerk testing-token identity via buildStepExecutor(\'ALTIFYAI\')',
  test_image: 'synthetic in-memory 1x1 transparent PNG, generated at run time, never committed',
};

export const STEP_MAPPING_TABLE = [
  {
    step_id: 'stp-fc2f-delete-an-image-from',
    goal: 'delete an image from my library',
    verdict: 'unmapped',
    reason: 'No image list/library view exists anywhere in the live app (confirmed across every authenticated route in the QF-884 census, and /generate itself never renders an uploaded-image list). No delete control to map.',
  },
  {
    step_id: 'stp-e3e6-automatically-genera',
    goal: 'automatically generate alt text for an uploaded image',
    verdict: 'partial',
    reason: 'The trigger IS real and automatic: setInputFiles on input[type="file"] (data-testid=file-input) immediately produces data-testid="status-success" ("Upload successful") and a "Loading alt text..." state, with no separate Generate button anywhere. But the generation call itself never completed in ~120s of observation -- the ACT of automatic generation is confirmed to fire; whether it ever succeeds was not observed.',
  },
  {
    step_id: 'stp-6219-see-the-generated-al',
    goal: 'see the generated alt text clearly displayed next to its corresponding image',
    verdict: 'partial',
    reason: 'data-testid="alt-text-display" is the real, structurally-correct container for this (confirmed present in the DOM immediately post-upload), but it never rendered generated text in ~120s -- stuck on data-testid="state-loading" ("Loading..."). The selector is real; the success state was never observed.',
  },
  {
    step_id: 'stp-ce40-easily-edit-the-ai-g',
    goal: 'easily edit the AI-generated alt text',
    verdict: 'unmapped',
    reason: 'No edit control (textarea/input) rendered at any point observed. Generation never completed, so an edit UI gated on a successful result could exist but was not observed -- recorded as unmapped (measured absence), not "will exist once generation works" (unverified).',
  },
  {
    step_id: 'stp-2496-easily-copy-the-gene',
    goal: 'easily copy the generated alt text to my clipboard',
    verdict: 'unmapped',
    reason: 'No copy-to-clipboard control observed pre- or post-upload.',
  },
  {
    step_id: 'stp-d8b9-upload-multiple-imag',
    goal: 'upload multiple images in a batch',
    verdict: 'unmapped',
    reason: 'input[type="file"] (data-testid=file-input) carries no "multiple" attribute (confirmed via the raw HTML dump) -- the live control is single-file only by construction, not merely untested.',
  },
  {
    step_id: 'stp-bfdb-generate-alt-text-fo',
    goal: 'generate alt text for multiple selected images at once',
    verdict: 'unmapped',
    reason: 'Depends on batch upload (stp-d8b9), which does not exist. No multi-select or bulk-generate control anywhere in the app.',
  },
  {
    step_id: 'stp-686d-mark-alt-text-as-app',
    goal: "mark alt text as 'Approved' or 'Needs Review'",
    verdict: 'unmapped',
    reason: 'No review/approval workflow UI exists anywhere in the app.',
  },
  {
    step_id: 'stp-abd0-export-alt-text-for-',
    goal: 'export alt text for multiple images as a CSV file',
    verdict: 'unmapped',
    reason: 'No export control anywhere in the app.',
  },
  {
    step_id: 'stp-6aa6-view-a-list-of-all-m',
    goal: 'view a list of all my uploaded images',
    verdict: 'unmapped',
    reason: 'No image list/gallery view exists on /generate or any other authenticated route (every other route bounces to the bare /dashboard "Usage Analytics / No activity tracked yet" empty state, per the QF-884 census).',
  },
  {
    step_id: 'stp-7903-provide-specific-key',
    goal: 'provide specific keywords or context for alt text generation',
    verdict: 'unmapped',
    reason: 'No text input for generation context/keywords exists on /generate -- the only input is the file picker itself.',
  },
  {
    step_id: 'stp-8c72-see-suggestions-for-',
    goal: 'see suggestions for improving alt text (e.g., keyword density, length)',
    verdict: 'unmapped',
    reason: 'No suggestions/quality-feedback UI observed anywhere.',
  },
  {
    step_id: 'stp-58cd-generate-a-json-file',
    goal: 'generate a JSON file containing image URLs and their alt text',
    verdict: 'unmapped',
    reason: 'No export control (JSON or otherwise) exists anywhere in the app.',
  },
];

export default { CENSUS_PROVENANCE, STEP_MAPPING_TABLE };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const counts = STEP_MAPPING_TABLE.reduce((acc, r) => { acc[r.verdict] = (acc[r.verdict] || 0) + 1; return acc; }, {});
  console.log(JSON.stringify({ provenance: CENSUS_PROVENANCE, counts, table: STEP_MAPPING_TABLE }, null, 2));
}
