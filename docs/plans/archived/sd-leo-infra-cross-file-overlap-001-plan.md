<!-- Archived from: docs/plans/cross-sd-overlap-gate-plan.md -->
<!-- SD Key: SD-LEO-INFRA-CROSS-FILE-OVERLAP-001 -->
<!-- Archived at: 2026-04-24T14:50:55.424Z -->

# SD-LEO-INFRA-CROSS-SD-OVERLAP-GATE-001 — Cross-SD File-Overlap Compatibility Gate

## Summary

Add a temporal file-overlap gate to the handoff pipeline that flags when the current SD's change set intersects files recently (≤48h) shipped by another SD, and hard-fails when the overlap hits a pre-declared high-risk registry (protocol enforcement, gate pipeline, auth, migrations). Reuses the orphaned `scripts/modules/cross-sd-consistency-validation.js` module left from `SD-LEO-PROTOCOL-V434-001` (US-005 deliverable never wired into the pipeline).

## Motivation

On 2026-04-24 the `SD Creation Integration Tests` workflow was 100% red on main for 10+ consecutive runs spanning ~12 hours, until QF-20260424-603 shipped a non-interactive bypass. Root cause (per RCA sub-agent 5-whys):

- `SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-001` (shipped 2026-04-22) tightened the protocol-read guard at `scripts/modules/sd-key-generator.js:707-714`.
- `SD-MAN-INFRA-E2E-REGRESSION-TEST-001` (shipped 2026-04-23, ~24h later) added `tests/integration/sd-creation/*.test.js` that call `generateSDKey()` end-to-end with no `skipLeadValidation: true`.
- Neither SD's gate pipeline caught the cross-SD interaction: ENFORCEMENT-001's tests targeted a coverage helper (`sd-key-generator-coverage.test.mjs`), while E2E-REGRESSION-TEST-001's tests weren't on main until *after* it shipped. The collision surfaced only when the first scheduled run of the new workflow tripped the freshly-tightened guard.
- The existing `OVERLAPPING_SCOPE_DETECTION` gate (Gate 10 at LEAD-TO-PLAN, `scripts/modules/handoff/executors/lead-to-plan/gates/overlapping-scope-detection.js`) would NOT have caught this pair — it uses Jaccard similarity on scope-TEXT keywords against **currently active** SDs, not recently-merged ones, and operates on words rather than file paths.

Our LEO shipping cadence (multiple SD-LEO-INFRA-* SDs per day) plus parallel-session fleet operation makes this collision class recurrent. No mitigating control exists today.

## Non-Goals

- Preventing all SD collisions (just flag + require ack on medium risk, hard-fail on high risk).
- Cross-repo overlap (focus on EHG_Engineer for v1; EHG app is out-of-scope).
- Line-level diff overlap (file-level sufficient per validation-agent).
- Replacing `OVERLAPPING_SCOPE_DETECTION` (text-keyword gate keeps its single responsibility).

## Scope — Functional Requirements

### FR-1: Resurrect + Harden `cross-sd-consistency-validation.js`

Import and extend the orphaned module from `SD-LEO-PROTOCOL-V434-001` (US-005 deliverable). It already exports `extractTargetFiles(prd)` and `extractDatabaseTables(prd)` — exactly the analysis primitives needed. Harden by:

- Adding integration tests (the module has zero current callers → zero regression coverage).
- Adding an input-shape validator that handles the actual PRD shape written by `scripts/add-prd-to-database.js`.
- Exposing a new helper `extractChangedFiles(gitDiffOutput)` for the LEAD-FINAL oracle path.

Deliverable: module re-integrated, documented, and test-covered.

### FR-2a: PLAN-TO-EXEC Gate (PRD-artifact oracle)

New gate `CROSS_SD_FILE_OVERLAP_TEMPORAL_PLAN` runs at PLAN-TO-EXEC. Oracle = PRD target_files and scope artifacts (no PR exists yet at this phase).

- Query `strategic_directives_v2` + `sd_phase_handoffs` for SDs with `status IN ('completed', 'shipped')` merged within the configured window (default 48h).
- For each recent SD, look up its PRD via `product_requirements_v2` and extract its target_files (reuse FR-1 extractor).
- Compute file-level overlap with the current SD's PRD target_files.
- If overlap found, proceed per FR-3 / FR-4.

### FR-2b: LEAD-FINAL-APPROVAL Gate (PR-diff oracle)

New gate `CROSS_SD_FILE_OVERLAP_TEMPORAL_SHIP` runs at LEAD-FINAL-APPROVAL. Oracle = `git diff origin/main...HEAD --name-only` (branch-aware, mirrors the pattern shipped by `SD-LEO-INFRA-FIX-GATE-FILE-001`).

- Same recent-SD query as FR-2a.
- For each recent SD, derive its shipped file-set from its merge commit: `git diff <merge_commit>^..<merge_commit> --name-only` (via `SharedGitContext` cache in `BaseExecutor`).
- Compute file-level overlap with current SD's PR diff.
- Proceed per FR-3 / FR-4.

### FR-3: Medium-Risk Path — Warn + Require Acknowledgment

If overlap found on files NOT in the high-risk registry (FR-4):

- Gate returns `WARNING` with a structured list of overlapping SD(s) and files.
- Handoff proceeds only when the operator passes `--acknowledge-cross-sd-overlap <SD-KEY> --ack-reason "<text>"` with a reason citing a ticket (SD/QF/#issue).
- Acknowledgment is written to `sd_phase_handoffs.metadata.cross_sd_overlap[]` as `{sd_key, files, acknowledged_at, ack_reason}` (FR-5 storage).

### FR-4: High-Risk Path — Hard-Fail (No Bypass)

If overlap found on files in the high-risk registry, gate returns `FAIL` with no acknowledgment path. Operator must either:

- Wait for the window to expire (configurable via `CROSS_SD_WINDOW_HOURS` env, default 48).
- Explicitly coordinate with the colliding SD's author (manual, human-in-loop).
- Request a registry exemption via a follow-up SD (rare).

Initial high-risk registry (`config/high-risk-files.json` seed list, configurable):

```json
{
  "patterns": [
    "scripts/modules/sd-key-generator.js",
    "scripts/modules/handoff/**",
    "scripts/handoff.js",
    "**/auth/**",
    "**/migrations/**",
    "database/schema/**",
    "lib/gates/**",
    "CLAUDE.md",
    "CLAUDE_CORE.md",
    "CLAUDE_LEAD.md",
    "CLAUDE_PLAN.md",
    "CLAUDE_EXEC.md"
  ]
}
```

### FR-5: Metadata Writer

Every gate run (pass, warn, fail) writes a structured entry under `sd_phase_handoffs.metadata.cross_sd_overlap`:

```json
{
  "cross_sd_overlap": [
    {
      "phase": "PLAN-TO-EXEC" | "LEAD-FINAL-APPROVAL",
      "colliding_sd_key": "SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-001",
      "overlapping_files": ["scripts/modules/sd-key-generator.js"],
      "risk_tier": "high" | "medium" | "low",
      "verdict": "PASS" | "WARN" | "FAIL",
      "acknowledged_at": "2026-04-24T14:00:00Z" | null,
      "ack_reason": "string with ticket ref" | null,
      "checked_at": "2026-04-24T14:00:00Z"
    }
  ]
}
```

Feeds retrospective analysis and future /learn pattern harvesting.

### FR-6: Retro-Replay Harness

Dedicated test harness that replays historical SD pairs through the gate and asserts expected verdicts. Promotes the success-criteria bullet "ENFORCEMENT-001 × E2E-REGRESSION-TEST-001 must trip the gate" into an actual automated deliverable.

Initial fixtures (Explore-identified retro-test corpus):

1. **Primary** — `SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-001` (2026-04-22, `sd-key-generator.js`) × `SD-MAN-INFRA-E2E-REGRESSION-TEST-001` (2026-04-23, `tests/integration/sd-creation/*.test.js`, imports `generateSDKey`) — expected: **FAIL** (high-risk file `sd-key-generator.js`).
2. PR #3301 + PR #3299 (2026-04-24, 5 min gap, shared `sd-start.js`) — expected: **WARN** (scripts/ is medium-risk).
3. PR #3296 + PR #3295 (2026-04-24, 50 min gap, shared `CLAUDE.md`) — expected: **FAIL** (high-risk protocol file).
4. PR #3293 + PR #3291 (2026-04-24, 25 min gap, shared `CLAUDE.md` + migrations) — expected: **FAIL**.
5. PR #3284 + PR #3283 (2026-04-23, 1 min gap, shared handoff executor code) — expected: **FAIL** (high-risk gate pipeline).

Harness runs as a vitest integration test wired into CI (`npm run test:integration:cross-sd-gate`).

## Technical Approach (from Explore)

- **Gate registration**: push into `LeadToPlanExecutor.getRequiredGates()` (wrong — use `PlanToExecExecutor` for FR-2a) at `scripts/modules/handoff/executors/plan-to-exec/index.js` and `LeadFinalApprovalExecutor` for FR-2b.
- **SD query**: reuse `SDRepository.getById()` (already caches 5 min, supports UUID + sd_key). Add `SDRepository.listRecentShipped(windowMs)`.
- **File-diff access**: reuse existing `SharedGitContext` (`scripts/modules/handoff/executors/shared-git-context.js`) to cache `git diff` per handoff run; mirror the pattern in `integration-test-requirement.js` and `mandatory-testing-validation.js`.
- **Config loader**: new `lib/config/cross-sd-config.js` exporting `CROSS_SD_WINDOW_MS`, `HIGH_RISK_FILE_PATTERNS`; loadable via env `CROSS_SD_WINDOW_HOURS` and per-repo override file `config/high-risk-files.json`.
- **Gate policy resolution**: register gate keys `CROSS_SD_FILE_OVERLAP_TEMPORAL_PLAN` and `CROSS_SD_FILE_OVERLAP_TEMPORAL_SHIP` in `validation_gate_registry` table so applicability can be tuned per `sd_type` / `validation_profile`.

## Acceptance Criteria

- [ ] FR-6 retro-replay harness exists and all 5 fixtures produce expected verdicts.
- [ ] FR-1 module has ≥80% test coverage (currently: 0%).
- [ ] Gate PLAN + SHIP both register in `validation_gate_registry` with sane defaults.
- [ ] False-positive rate <5% on last 30 days of SDs (measured during PLAN phase, reported to LEAD before gate enablement).
- [ ] Handoff latency increase <3s at 95th percentile (micro-benchmark in CI).
- [ ] `--acknowledge-cross-sd-overlap` CLI flag documented in handoff.js `--help`.
- [ ] Gate writes FR-5 metadata on every run (including PASS).
- [ ] High-risk registry configurable via `config/high-risk-files.json`.
- [ ] Documentation updated: `CLAUDE_PLAN.md` (PLAN-TO-EXEC gates list) and `CLAUDE_EXEC.md` (LEAD-FINAL-APPROVAL gates list).

## Success Criteria

1. Retro-test: ENFORCEMENT-001 × E2E-REGRESSION-TEST-001 pair trips the gate with verdict=FAIL (primary regression).
2. False-positive rate <5% on 30-day retro-apply.
3. At least one future SD pair (post-ship) gets warned/blocked appropriately in real operation.

## Dependencies / Blocks

- **Depends on**: none (infrastructure is mature; all extension points exist today).
- **Blocks**: none (optional but high-value).
- **Related but not blocking**:
  - `SD-LEO-INFRA-FIX-GATE-FILE-001` (completed) — provides `git show origin/<branch>:<file>` pattern to reuse.
  - `SD-LEO-INFRA-WIRE-CHECK-GATE-001` (completed) — proved `origin/main` diff pattern.
  - `SD-LEO-PROTOCOL-V434-001` (completed) — this SD revives its orphaned US-005 deliverable.

## LOC Estimate

- FR-1 resurrect + harden: ~50 LOC (net)
- FR-2a PLAN gate: ~100 LOC
- FR-2b SHIP gate: ~100 LOC
- FR-3 ack flag + CLI: ~40 LOC
- FR-4 high-risk registry + loader: ~30 LOC
- FR-5 metadata writer: ~40 LOC
- FR-6 retro-replay harness: ~120 LOC
- Tests (unit + integration + E2E): ~200 LOC

**Total**: ~680 LOC. Tier 3 (>75 LOC + risk keywords `feature` + `gate`).

## Priority: HIGH

Three forcing functions: (1) documented P1 outage (main red >12h), (2) cadence-driven recurrence risk, (3) no existing control in the pipeline.

## Sub-Agent Routing at EXEC

- VALIDATION (re-run pre-handoff)
- TESTING (retro-replay + E2E)
- GITHUB (CI pipeline verification)
- DATABASE (query-only access; no schema change in v1)
- RETRO
