# EXEC resume doc — SD-LEO-INFRA-RATIFIED-DECISIONS-THREAD-DOWNSTREAM-001

**Status at overnight wind-down (2026-06-25):** `in_progress/EXEC`, PRD approved (97). **No code written** — deliberately held at the hook-trace (below) rather than force a high-blast-radius write into live venture seed data against an un-located hook. All design/findings persisted in `strategic_directives_v2.metadata.{plan_notes,exec_findings}` and `session_coordination` (`a299c3ef`).

## Gold root-cause (coordinator, venture-1 S7 / advisory aa54a0e3)
A ratified chairman edit to a seeded venture's stage_zero can miss the RUNNING venture via two divergences:
- **(a)** `strategic_directives_v2.metadata.stage_zero` (SD copy) vs **`ventures.metadata.stage_zero`** (the seed-snapshot the factory reads).
- **(b)** the SSOT vs the **`venture_artifacts`** stage output (the factory carries the ARTIFACT forward, not stage_zero).

The fix must **propagate a ratified edit to the FACTORY-read copies**, not just the SD.

## Confirmed: the SEED path (one-time, at creation)
`lib/eva/stage-zero/chairman-review.js` → `persistVentureBrief()` (~line 85):
- creates the `ventures` row with `metadata.stage_zero` (~line 135), and
- writes the Stage-0 artifact via `writeArtifact` (`artifactType: 'intake_venture_analysis'`, ~line 213).

This is seed-**at-creation**, NOT the edit path.

## BLOCKER: the ratified-edit-apply hook is NOT located
Where a chairman stage_zero/decision **edit** gets **ratified + applied to the SD after seeding** is NOT in `chairman-decision-watcher.js` (only updates `brief_data`) nor `chairman-review.js`. **Locate this hook first** (asked coordinator/Charlie via signal `7202c461`; Charlie `66f7a564` surfaced S7 and likely knows). Candidates to grep: a chairman governance/edit/ratify flow, `lib/eva/chairman-*`, decision-allowlist apply.

## Propagation design (to implement once hook is located)
At the ratified-edit-apply hook, AFTER writing the SD copy:
1. Detect divergence (ratified-only, seeded-only).
2. Propagate to `ventures.metadata.stage_zero` — **merge, not overwrite**; record provenance; reuse the seed writer shape.
3. Propagate to the affected `venture_artifacts` stage output — re-`writeArtifact` (versioned via `artifact-versioning.js`); scope to the affected stage only.
4. **Idempotent** (in-sync = no-op), **fail-safe** (ambiguous → do not propagate, surface for review).
5. Bidirectional + safety tests (ratified propagates; draft/in-sync/non-seeded do not; unrelated keys/artifacts preserved).

**HIGH BLAST RADIUS — live venture data.** Confirm the hook + idempotency before any write.
