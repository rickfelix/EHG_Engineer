# Venture Pipeline Playbook v1.2

> **Forward-looking guide for taking a venture through the EHG pipeline**, distilled from the **CronGenius M1 pilot** — the first venture to complete a full orchestrator (parent + 3 children) end-to-end. **Two-session-validated** across the independent executions of Child B (Phase 2: auth + abuse prevention) and Child C (Phase 3: observability + portal).
>
> Read this **before** starting venture #2. The blow-by-blow detail lives in the pilot journal (`project_crongenius_first_venture_pilot_2026_05_27.md`, findings F1–F22 + P-FAIL-1–6).

> **What changed in v1.2 (2026-05-29) — a post-pilot hardening wave shipped, so several pilot workarounds are now obsolete:**
> - **Completion gates now resolve the target repo from `applications.local_path`** (not the shell's cwd) — `SD-LEO-INFRA-VENTURE-AWARE-COMPLETION-001` (PR #4058). This **retires F16 / F18 / F19 / F20 as a class** — the playbook's old "#1 durable fix."
> - **Sub-agent repo resolution is venture-aware** — `SD-LEO-INFRA-VENTURE-SUBAGENT-RESOLUTION-001` (PR #4059) closes **F10/F11**; forward-slash `repo_path` is now belt-and-suspenders, not load-bearing.
> - **The leo_bridge build model no longer strands at Stage 19** — `SD-FDBK-ENH-STAGE-VENTURE-POST-001` (ehg PR #661) added deployment-register + advance to the Stage-19 UI.
> - **⚠️ NEW pre-flight #0: your working tree can be many commits behind `origin/main` and silently MISS all of the above.** Sync first (see §2).

---

## The one-line principle

The EHG control plane (LEO tooling + DB state, in `EHG_Engineer`) is a **different repo** from a venture's product code. As of v1.2 the completion gates **DB-resolve the target repo** from `applications.local_path`, so location is far less load-bearing than during the pilot. What remains load-bearing is **(a) being on current `origin/main`** and **(b) a few per-child metadata flags** — this playbook keeps those correct so a venture ships without re-discovering every gap.

---

## 1. Canonical happy path

```
Stage 0–19 artifacts
  → brainstorm board (7-seat incl. CMO + CGO)
  → L2 vision (chairman-approved)
  → archplan-command.mjs upsert        (MUST produce an implementation_phases section)
  → create-orchestrator-from-plan.js --auto-children
  → LEAD = CIRCUIT BREAKER             (approve if aligned, or bubble up — NEVER redesign)
  → per child: LEAD → PLAN → EXEC → /ship   (code lives in the venture repo)
  → parent EXEC is a WAIT-STATE        (idle until all children complete)
  → parent auto-rolls-up to completed  (triggered by the LAST child to finish)
  → at Stage 19 (leo_bridge): register the live deployment URL + "Advance to Stage 20"
      in the build panel → Stage 20 Unified Quality Gate
```

- **LEAD is a circuit breaker.** Approve if the decomposition matches the arch plan, or bubble up to the chairman. Do **not** redesign the decomposition at LEAD — that is an arch-layer decision (P-FAIL-2).
- The pipeline tools are now discoverable from `CLAUDE_LEAD.md` + `sd-start` output (P-FAIL-3 fixed).
- **Parent rollup is automatic** (ORCH-PARENT-LIFECYCLE-001): when the last child reaches `completed`, the parent rolls up to 100% with **zero manual parent handoff**. The trigger is the last child *by completion timestamp* — not a designated "final" child.
- **Post-build advancement (leo_bridge):** once every child SD is built, the Stage-19 `LeoBridgeBuildPanel` lets the operator register the live Replit deployment URL (repo_url prefilled from the venture) and click **Advance to Stage 20** — no manual `ventures.deployment_url` DB edit (that was the CronGenius strand; fixed in ehg #661). The `advance_venture_to_stage` RPC accepts `p_build_method='leo_bridge'`.

---

## 2. Pre-flight checklist (set/verify these, or a gate will block you)

| ✔ | Item | Why / finding |
|---|------|---------------|
| ☐ | **Sync the tree to `origin/main` first** — `git fetch && git pull --ff-only origin main` (coordinate if a sibling session shares the tree) | a stale local tree silently MISSES the venture-aware gate fixes (#4058/#4059) → re-hits the retired F16–F20 friction. The single highest-value pre-flight step. |
| ☐ | **Clone the venture's repo locally** at its `applications.local_path` | GATE5_GIT_COMMIT_ENFORCEMENT is now **fail-closed for uncloned venture repos** (#4058 `isGitCapableRepo`) — an uncloned venture repo blocks PLAN-TO-LEAD |
| ☐ | The venture has an `applications` registry row (kind=`venture`, trust_tier=`external`, `local_path` set; `github_repo` may be NULL) | the completion gates + retro trigger resolve the venture from this row (it is the authoritative registry, not `applications/registry.json`) |
| ☐ | `target_application` = the venture on the orchestrator **and every child** | `create-orchestrator-from-plan` now auto-derives this from `vision.venture_id` (verify it propagated; F3) |
| ☐ | Each child: `metadata.inherited_from_parent=true` (or a real `scope_slice`) — **set this manually after `--auto-children`** | create-orchestrator still does **not** auto-set it (B3, `279a91a1`); else SCOPE_COMPLETION scores the child against the **full parent** deliverable list (F17) |
| ☐ | Arch plan contains an `implementation_phases` section | else `create-orchestrator` maps **0** children (F2) |
| ☐ | **Re-derive the ambient session id on resume** — `echo $CLAUDE_SESSION_ID`; never trust a session id hardcoded in a resume/handoff prompt | F22: a stale id self-heals into a reaped "ghost"; re-claims under it resurrect a corpse |
| ☐ | LEAD enriches auto-gen child fields (`smoke_test_steps`, `risks`, description, scope) before LEAD-TO-PLAN | `create-orchestrator` leaves them skeletal (F5) — this is enrichment, not redesign |
| ☐ | bun-on-Windows ventures: `bun install` in the worktree before `bun test` | `sd-start` "install skipped" is unreliable (F14); local prettier/eslint **CRLF errors are spurious** (`core.autocrlf=true` stores LF on commit) |
| ☐ | Heartbeat: confirm your tick daemon is alive before claiming a reaped SD | F15 / heartbeat reference |
| ☐ | *(belt-and-suspenders)* sub-agents emit **forward-slash** `repo_path` = the venture `local_path` | the gate is venture-aware as of #4059 (F10/F11) + normalizes backslashes; this just keeps evidence tidy |

---

## 3. Already fixed — do **not** re-derive (shipped during + after the pilot)

| Venture gap | Shipped SD |
|-------------|-----------|
| `/heal vision` path resolution to the venture repo (F1/F2/F3) | `SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001` |
| venture rubric **semantics** (LLM-generated at scoring time, content-hash cached) (F1) | `SD-LEO-INFRA-VENTURE-RUBRIC-SEMANTIC-001` |
| auto-generated boilerplate stories hard-blocking PLAN-TO-EXEC (F12) | `SD-LEO-INFRA-AUTO-STORY-QUALITY-GATE-001` (stories default `status=draft`) |
| orchestrator-parent EXEC = wait-state + PLAN-TO-LEAD `WAIT` verdict + auto-rollup (F6/F7/F8) | `SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001` (`leo_protocol_sections` id 439) |
| pipeline discoverability + LEAD-circuit-breaker + per-child cancel evaluation (P-FAIL-2/3/4) | `SD-LEO-INFRA-VENTURE-LIFECYCLE-PIPELINE-001` |
| CMO + CGO brainstorm board seats (GTM voice) | `SD-LEO-INFRA-ADD-CMO-CHIEF-001` |
| `retrospectives.target_application` accepts venture names (registry-aware trigger) | `SD-LEO-INFRA-VENTURE-REPO-AWARE-001` |
| **completion gates resolve the target repo from `applications.local_path`, not cwd — retires F16/F18/F19/F20 as a class** | `SD-LEO-INFRA-VENTURE-AWARE-COMPLETION-001` (PR #4058) |
| **sub-agent repo resolution is venture-aware (latest-row + backslash-normalized) — closes F10/F11** | `SD-LEO-INFRA-VENTURE-SUBAGENT-RESOLUTION-001` (PR #4059) |
| **leo_bridge Stage-19 post-build register + advance (no more Stage-19 strand)** | `SD-FDBK-ENH-STAGE-VENTURE-POST-001` (ehg PR #661) |

*Confirmed still-working across both Child B and Child C: F12 held (no PLAN-TO-EXEC story block), VENTURE-REPO-AWARE retro accepted. The #4058/#4059/#661 wave is confirmed merged to `origin/main` (verified 2026-05-29).*

---

## 4. Still assumes EHG — open gaps + the workaround for each (expect these)

> Most of the pilot's gate-friction gaps were **retired by the v1.2 wave** (F10/F11/F16/F18/F19/F20 → §3). What remains:

| Finding | Symptom on a venture | Workaround **now** | Backlog / SD |
|---------|----------------------|--------------------|--------------|
| **B3** | `create-orchestrator-from-plan` does **not** set `inherited_from_parent` / `scope_slice` on children | after `--auto-children`, `UPDATE` each child `metadata.inherited_from_parent=true` (this is the F17 fix; see §2) | `279a91a1` |
| **F21** | GATE2 hard-requires E2E tests uniformly; backend/SSR slices score 0/20 on `[D1] "No E2E tests found"` → ride the YELLOW band; one slightly-lower score then hard-blocks | keep the other GATE2 dimensions strong so the total stays in the YELLOW pass band; add E2E only where it makes sense | `367cab56` |
| **F22** | a **stale session id** carried in a resume/handoff prompt self-heals into a reaped ghost; re-claims under it fail | `echo $CLAUDE_SESSION_ID` to get the **ambient** id → prefix all scripts with it. No code fix. (adjacent to F15) | `ff967b2e` |
| **F15** | FR-3 gate livelocks re-claim of a reaped SD (sweep re-emits `CLAIM_RELEASED` every ~5 min) | confirm the claim is genuinely free + your heartbeat is healthy, then claim — **no bypass** | `50615d1b` |

### WIRING_VALIDATION (was F20 — now largely resolved by #4058)
The gate is venture-aware as of v1.2. If a UI child still trips it, two recovery paths remain:
1. **Pre-flight (cleanest):** set `metadata.wiring_required=false` + a `wiring_opt_out_reason` *before* the gate fires → advisory pass. Right for a separate-repo / non-EHG-wired venture API.
2. **Post-fire recovery:** run `node scripts/wiring-validators/wiring-validation-runner.js <SD>` → it upserts `leo_wiring_validations`, the `trg_zz_maintain_wiring_validated` trigger derives `wiring_validated=true`, and the gate **passes 100%**. The runner **exits FAIL** on `spec_code_drift` + `e2e_demo` (both **non-required**) — *ignore the exit code*.

### ✅ The old "durable fix" — SHIPPED
The v1.1 "#1 stage-setting investment" (make every completion-pipeline gate resolve the target repo from `applications.local_path`) **shipped as `SD-LEO-INFRA-VENTURE-AWARE-COMPLETION-001` (PR #4058)**, with the sub-agent half in `SD-LEO-INFRA-VENTURE-SUBAGENT-RESOLUTION-001` (PR #4059). Location is no longer load-bearing for the completion gates.

---

## 5. Conventions (established during the pilot)

- **Working directory + post-merge sync** (`reference-venture-working-directory-convention`): stand in the venture worktree; GitHub is source-of-truth; after a squash-merge `git -C <venture-main> fetch && merge --ff-only origin/main`, then `worktree remove --force` + `branch -D` your finished worktree (only your own — others are reaped by their owners). **Remove a junctioned `node_modules` link first** (`[IO.Directory]::Delete(path,false)` / `rmdir`) so the worktree-remove never recurses into the shared `node_modules`.
- **Session / heartbeat / claim** (`reference-session-heartbeat-and-fr3-claim-livelock`): the interactive heartbeat is a detached `session-tick.cjs` daemon; re-derive the ambient `CLAUDE_SESSION_ID` on resume (F22). Authoritative identity post-`/compact` = `.claude/session-identity/pid-<ccPid>.json`, **not** the shared `.context-state.json`.
- **LEAD = circuit breaker**: approve or bubble up; never redesign.
- **Per-child evaluation** before any bulk-cancel of an orchestrator's children (P-FAIL-4).
- **Bypass rubric**: noun{gate,validator,tool,script} + term{bug,false-positive,broken,regression}; avoid {unclear, too strict, skip}. (A `SEMANTIC_MISMATCH` category — "the gate's semantics don't apply to this SD type" — is a proposed addition, F8c.)
- **Deterministic-first venture code**: e.g. CronGenius shipped a metrics-from-counters surface rather than new DB tables — smaller footprint, testable without external keys.

---

## 6. Forward-looking: per-venture data + telemetry

The two-layer standard is now its own doc: **`docs/reference/venture-data-architecture.md`** (PR #4056).
- **Layer 1 (isolation):** each venture owns an isolated operational store (`DATABASE_URL`) — no shared DB.
- **Layer 2 (visibility):** EHG **pulls** each venture's authenticated `GET /v1/metrics` (one-way rollup) — never touches venture DBs.
- Neither layer blocks a build run (CronGenius shipped without them). Layer 1 = a venture-side Postgres adapter (`0a3a9d9f`); Layer 2 = EHG-side scheduled ingestion (`ca2465cb`). Child C's `/v1/metrics` + Child B's API-key auth are the seed of the per-venture telemetry contract.

---

## 7. The pilot meta-process (reusable for every venture)

1. File a **pilot journal** for the venture.
2. Run the venture through the pipeline; apply the §2 checklist and §4 workarounds as you go.
3. Capture findings — `node scripts/log-harness-bug.js "<symptom>"` writes to `feedback` (`category=harness_backlog`) for a later sweep.
4. Consolidate findings into Track-2 SDs; LEAD-approve.
5. **Mode discipline:** `[MODE: product]` sessions **journal + backlog** (defer meta-SDs) and keep shipping; `[MODE: campaign]` sessions **file + fix**. A product session that trips a known gap applies the workaround and continues — it does not stop to fix the harness mid-flight.
6. **Cross-validate** the playbook across at least two independent child executions before trusting it for the next venture (v1.1 was validated across Child B + Child C).

---

## Provenance

| | |
|---|---|
| Pilot | CronGenius (first venture), M1 launch orchestrator |
| Orchestrator | `SD-CRONGENIUS-M1-LAUNCH-ORCHESTRATOR-ORCH-001` — completed 100% |
| Child A | Phase 1: core inference primitive — `rickfelix/crongenius` PR #1 |
| Child B | Phase 2: auth + abuse prevention — PR #4 (LEAD-FINAL 99) |
| Child C | Phase 3: observability + /metrics portal — PR #3 (LEAD-FINAL 98) |
| Findings | F1–F22, P-FAIL-1–6, O1–O6 (pilot journal) |
| Post-pilot hardening | VENTURE-AWARE-COMPLETION (#4058), VENTURE-SUBAGENT-RESOLUTION (#4059), STAGE-VENTURE-POST (ehg #661), playbook #4055, data-architecture #4056 |
| Validated by | independent executions of Child B (session 0241b644) + Child C (session 42e60e9c) |
| Version | **v1.2 — 2026-05-29** (supersedes v1.1 2026-05-28) |
