# S20-26 Simulated Full-Life Run — Harness Spec

**Status:** Solomon-authored (Fable, 2026-07-10), propose-only (CONST-002). The build spec for the reusable instrument that drives ONE synthetic venture S20→26 through the REAL machinery, per cluster-2 spec O10. Builder seats (Bravo/Charlie/Alpha) build against this; the run targets Saturday so findings reach adjudication in-window. **§H5 is completed by the coordinator's 7-point prod-safety fence enumeration folded VERBATIM (he re-verifies before fence-work builds); the two fences he pre-named are specified below now.**

## H1 — Synthetic venture fixture (reuse, don't invent)
One venture row + full artifact set, created under the EXISTING fixture conventions — `metadata.is_fixture=true` and a `TEST-`/fixture-family key so every existing exclusion guard (sweep fixture guard, dispatch `test_fixture_key`, belt exclusion) refuses to route it. The fixture is the harness's *only* new data surface; everything else is the production schema.

## H2 — Real machinery only (instrument-don't-mock)
The run invokes the SAME code paths production uses — stage-execution-worker, exit-gate-enforcer, the demand engine, `promote()`/preview, payment attribution — never test doubles of the machinery under audit. Allowed divergence = the deploy pipeline's enumerated 7-divergence test-mode overlay + the §H5 fences, NOTHING else; the config-diff auditor pattern applies — any other divergence is itself a `TEST_MODE_DIVERGENCE` finding.

## H3 — Instrumentation and the coverage matrix
APA-style capture on every loop: what fired, what it touched, and **provenance-reached verification per O4** (each gauge's declared source actually consulted). All observations append to a **run journal** (durable artifact, append-only) that maps run-events → O-requirements: **every O1–O10 requirement ends the run with ≥1 observed behavior OR a first-class CANNOT-DRIVE finding.** No requirement may end the run unmapped — unmapped = uncovered = a finding about the harness.

## H4 — Drivers (all synthetic, all contained)
Scripted stranger-visitor (browser/HTTP against the preview deploy) → synthetic conversion event → **test-rail payment** (Stripe test keys only) → attribution assertion → synthetic support ticket → triage observation → synthetic incident (trip a health probe, observe remediation/escalation) → **injected-clock advancement** for the post-launch review cadence (the replay design's clock pattern — never wall-clock waits).

## H5 — Prod-safety fences (coordinator's 7-point enumeration, folded VERBATIM 2026-07-10; he re-verifies pre-run)
1. **Stripe:** test-mode keys ONLY; attribution-002 already excludes test-mode events from revenue dedup, so synthetic charges cannot pollute attributed revenue; E3 first-charge steps never touch live keys.
2. **Deploy:** `preview()` leg ONLY, never `promote`; no CF domain-mapping (bootstrap decision open); Cloud Run scale-to-zero + explicit teardown; GCP project `gen-lang-client-0269820571` with a synthetic tag.
3. **Outreach/email:** E2 bounded outreach SANDBOXED — zero real sends; the email channel is in degraded mode (`onboarding@resend.dev` → chairman gmail redirect), so any venture email surface fires into that redirect unless mocked; chairman quota 100/day + quiet-hours guard apply.
4. **Domains:** no purchases; mock registrar mode (domain-acquisition shipped real DNS wiring).
5. **MarketLens prod:** the live Cloud Run instance receives NO synthetic signups (in-memory signup + scale-to-zero hazard).
6. **Venture hygiene:** synthetic venture marked `metadata.synthetic=true`; teardown CASCADES `eva_scheduler_queue` AND `eva_scheduler_metrics` (live evidence: 35 stale queue rows from cancelled ventures ground the scheduler and wrote ~10K junk metric rows/day; 19 e2e-residue ventures tripped venture-capture-completeness on 07-10). **Post-run assertion: zero scheduler rows/jobs/metrics reference the fixture venture** — a leaked recurring job operates a ghost venture, the worst residue class.
7. **Demand-E gate:** its `execution_gate` names the coordinator as confirmer for a live-URL venture — the synthetic run carries explicit test provenance THROUGH that gate, routed via the coordinator, never silently satisfying it. **Post-run assertion: real-KPI tables contain zero fixture-attributed rows.**

## H6 — Containment defaults (beyond the fences)
No external sends (email/social/ads — capturing transports per APA); no real spend (test keys; spend-guardrail policy LIVE during the run and asserted); no public URL advertised (preview-tagged deploys only); **teardown idempotent and verified** — a post-run sweep asserts zero fixture residue across every table the run touched (the assertion list is generated from the run journal's touched-tables set, not hand-maintained).

## H7 — Run protocol (one owning assignment; checkpoint-resume; never abort-on-first-gap)
**ONE Fable seat OWNS the whole arc end-to-end** — spec-consume → harness-build → run → instrumented ledger — as a single sustained long-horizon assignment (per the official Fable guidance the chairman commissioned: decomposition designed for prior models undersells this tier). Session caps remain a physical wall: the owner flushes a **checkpoint journal at every cap boundary and RESUMES the same assignment** — checkpoints are continuation points, not hand-offs; ownership never transfers mid-arc. Staged S20→26 ladder within the arc; each band's observations adjudicate against the cluster-2 delta-predictions as they land. **"Cannot even be driven synthetically" is recorded as a first-class finding and the run CONTINUES from the next drivable point** — the weekend's product is the whole band's drivability map, not a crash log of its first gap.

## H10 — Runner design (chairman-commissioned Fable-prompting research, folded)
- **Interval self-verification is explicit in the runner prompt:** at each stage-band boundary, the owner spawns a **fresh-context verifier subagent** that checks the band's journal entries against THIS spec (coverage matrix + fence assertions) — separate verifiers outperform self-critique on long-horizon runs. Verifier disagreement is journaled, not silently resolved.
- **The non-owning seats become verifiers, not co-builders:** the freed seats run the interval verifications and the H9 calibration — a better allocation than co-building, and it operationalizes the guidance directly.
- **Lean runner prompt:** the owner's assignment is written goals+boundaries style (this spec + the H5 fences + propose/report duties), NOT the full Opus-literal LEO ceremony — prior-model prescriptiveness measurably degrades this tier's output. **Boundary: LEO's hard constraints (fences, chairman authority, propose-only reporting) remain binding verbatim — it is the ceremony that thins, never the constraints.**

## H8 — Reusability (the point)
The harness ships as a permanent fixture: run script + fixture-venture template + assertion set + journal schema. It becomes the band's regression instrument — re-executed after any S20-26 change (the APA §12.4 calibration pattern applied to operations). One-off scripts are explicitly out of spec.

## H9 — The harness's own seeded-defect test (build-acceptance)
Before the real run: a **dry calibration** — deliberately disable one ops loop (or break one gauge's source) and assert the harness DETECTS it (journal shows the dead loop / NO-DATA gauge as a finding). An instrument that cannot catch a dead loop cannot audit a band suspected of dead loops. Calibration green = harness GO; the same instrument-the-fixed-thing-cannot-fool standard that gated selection.

## H11 — Run-evidence durability (implementation status, 2026-07-11, SD-LEO-INFRA-RUN-EVIDENCE-DURABILITY-001)

§H3's "durable artifact" claim for the run journal had a real gap, found via Solomon adjudication F5+F6 on run `s2026-bravo-0711`: a 59-entry journal was reduced to a 2-entry teardown tail. Root cause (NOT "teardown deletes the journal" — teardown's DB delete never touches the filesystem journal): `RunJournal`'s journal path defaulted to a **CWD-relative** string (`.harness-runs`). A run invoked from one process/cwd and a later teardown/finalize invoked as a separate CLI process from a *different* cwd (a worktree, or a different/since-removed worktree) resolved to two different absolute paths — the later process's `existsSync()` resume-check found nothing, silently started a fresh journal, and the original file was orphaned (not deleted).

**Fixed**: `RunJournal`'s default `baseDir` now anchors to `getRepoRoot()` (`lib/repo-paths.js` — stable regardless of caller cwd, including from inside a `.worktrees/<sd>` checkout), so every process that omits an explicit `baseDir` resolves to the same file for a given `run_id`.

**A durable DB mirror was also added** (`finalizeMirror()` in `lib/harness/run-journal.mjs`, called at the end of `runArc()`) — the journal's full content is written to a `system_events` row at finalize, independent of the `.harness-runs` filesystem scratch entirely. **Design note (adversarial-review-caught, worth keeping in mind for any future venture-scoped durability write in this harness):** the first implementation wrote this mirror as a `venture_artifacts` row, keyed to the fixture venture. Deep-tier adversarial review found `venture_artifacts.venture_id` is `FOREIGN KEY ... ON DELETE CASCADE` — the mirror row would have been silently destroyed the instant teardown deleted the fixture's `ventures` row, defeating the entire point of the durability guarantee (and untestable pre-migration, since every prior test run degraded before the CHECK constraint existed to admit the write at all — the interaction was never exercised). `system_events` carries no FK to `ventures`, so the mirror is now structurally immune to the fixture's own lifecycle. Live-verified: a real mirror row survived with its full journal payload after its underlying venture was deleted by teardown.

**Also added**: `assertClean()` (§H6 residue assertion) gained an additive journal-evidence-present check — a missing/empty journal at teardown time is now itself a `RESIDUE` finding, alongside the existing DB-residue-absence checks.

---

*Propose-only. Build: Bravo/Charlie/Alpha against H1–H4+H6–H9 immediately; H5 completes on the coordinator's enumeration; run Saturday; observations → cluster-2 ledger → Solomon adjudication → unified delta.*
