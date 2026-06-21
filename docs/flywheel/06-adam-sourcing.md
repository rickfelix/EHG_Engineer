---
category: documentation
status: draft
version: 0.1.0
author: docmon-agent (Information Architecture Lead)
last_updated: 2026-06-20
tags: [flywheel, adam, sourcing, ssot, propose-only]
---

# Link 6 — How Adam Sources Work

> **Reviewed by Adam 2026-06-20 (chairman delegated the review); living doc — keep current as behavior changes.** [← back to the flywheel map](README.md)

## Role in the flywheel

Adam is the chairman's advisor/analyst and a **belt-supply** source. When the belt runs low, Adam
finds candidates — but under a strict order of operations and a hard constitutional rule:
**Adam PROPOSES, the coordinator DECIDES** (CONST-002 / propose-only). Adam executes directly only
a chairman-directed task. Adam is `metadata.role='adam'` + `non_fleet=true` (excluded from worker
counts / ETA / revival).

## Source of truth (verified 2026-06-20)

- **`CLAUDE_ADAM.md`** (generated from `leo_protocol_sections` id=601, section_type
  `adam_role_contract`).
- **`leo_protocol_sections` id=607** — "SOURCING SSOT — order of operations" (the canonical
  contract; content read directly below).
- **`.claude/commands/adam.md`**, **`scripts/adam-startup-check.mjs`** (the SOURCING SSOT STATE
  startup probe), **`scripts/adam-advisory.cjs`** (the non-friction advisory lane).

## The SSOT order of operations (canonical, from section 607)

> Read this BEFORE sourcing anything. Work the sources **top-down**, stop at the first that yields:

1. **Roadmap-as-SSOT first.** `roadmap_wave_items` + the rung roadmap are the FIRST candidate
   source. Promote via `node scripts/leo-create-sd.js --from-roadmap-item <id>` (the
   **register-first** path — never hand-recreate the provenance). The startup probe prints the
   unpromoted count per wave. *(684 unpromoted (live metric) as of 2026-06-20.)*
2. **Wave-0 distillation if rung-waves are empty.** Groom raw backlog (`sd_backlog_map`) into
   waved, dispositioned candidates first; do **not** skip straight to gauge-mining. The probe
   prints `sd_backlog_map` disposition %.
3. **Check the sourcing-engine activation flags BEFORE hand-feeding.** The engine crons
   (`SOURCING_ENGINE_V1`, `SOURCING_ROADMAP_ENGINE_V1`, `SOURCING_GAUGE_GAP_MINER_V1`,
   `SOURCING_DEFERRED_WATCHER_V1`, `SOURCING_PROACTIVE_POPULATOR_V1`, `LEO_ROADMAP_AUTOSOURCE`)
   populate the belt for you when ON. If they are **OFF**, **PROPOSE activation** — do not
   substitute yourself for the dormant engine tick-after-tick (that masks the engine being off).

   > **[State note — 2026-06-20]** The above is the canonical SSOT contract instruction. Per the
   > corrected engine state ([07-sourcing-engine.md]), the 2 behavioral staging crons
   > (deferred-watcher + gauge-gap-miner) are in fact **ACTIVE with flags ON in GitHub Actions**
   > (commit 4ba41115 / PR #4933). A **local** `process.env` probe reports a **false "dormant"** —
   > so "if they are OFF" should be confirmed against the workflow env, not a local probe, before
   > proposing activation.
4. **Hand-mining the VDR gauge is LAST-RESORT — and a SMELL.** Mining `computeBuildGauge` for
   unbuilt capabilities by hand is the bottom of the list. Reaching for it means a layer above
   failed; fix the upstream cause (propose engine activation / run distillation).

> **[Gap — promotion has no target-repo routing]** Promotion via `leo-create-sd --from-roadmap-item`
> provides no way to set the target repo: it accepts no `--target-repos` flag
> (`leo-create-sd.js` `riKnownFlags` ~line 2685) and `deriveSdFieldsFromRoadmapItem`
> (`lib/sourcing-engine/register-first.js:22`) sets no `target_application`, so `createSD` defaults
> to `getCurrentVenture() || 'EHG_Engineer'` (`leo-create-sd.js` ~line 1902). Nothing FORBIDS EHG
> (`ALLOWED_REPOS` includes it, line 86) — but there is no ROUTING mechanism, so EHG-product roadmap
> items (Waves 2/3/4) default to the harness repo and cannot be promoted to `rickfelix/ehg`. The
> product-promotion-pipeline SD addresses this by adding `--target-repos` to `--from-roadmap-item`
> and/or deriving the target from the item's wave.

> Why (from the contract): encoding the order in required-reading + surfacing live layer-state at
> `/adam` startup makes the *route-the-SSOT-first* duty structurally impossible to miss, so the
> "degrade to hand-mining" regression cannot recur each fresh session
> (SD-LEO-INFRA-ADAM-SOURCE-FROM-SSOT-CONTRACT-001).

## Propose-only and the belt-supply exemption

- **Default:** Adam proposes; the coordinator decides/dispatches. Adam never claims/drives/
  dispatches fleet SDs.
- **Exempt lane (chairman correction 2026-06-20):** belt **SUPPLY** — source / file / reactivate
  deferred→draft — is Adam's autonomous lane; do it **verify-first + report**. Only **claim /
  drive / dispatch** needs coordinator-go.
- **Escalation aggregation:** Adam is the designated AskUserQuestion user and the escalation
  aggregation point — workers proceed autonomously (never AskUser, it stalls them) → escalate to
  Adam → Adam triages what reaches the chairman (urgent AskUser / phone-push / hourly exec email).
  Protects the chairman's attention.

## D1 proactive sourcing

Adam's "D1 proactive sourcing" duty is the scheduled belt-refill check that runs the SSOT order
above. The startup probe (`adam-startup-check.mjs`) prints the **SOURCING SSOT STATE** badge:
unpromoted `roadmap_wave_items` by wave, the 6 engine flags, and `sd_backlog_map` disposition %.

## Existing documentation

- `CLAUDE_ADAM.md` + `leo_protocol_sections` id=601/604/606/607 — the role contract. **Coverage: good.**
- `docs/protocol/coordinator-adam-comms.md` — Adam↔coordinator comms. **Coverage: good.**
- `docs/protocol/README.md` (the LEO Harness overview) — Adam role summary. **Coverage: good.**
- **Gap:** the *sourcing* SSOT order existed only in the DB section + CLAUDE_ADAM.md; this doc
  surfaces it in the flywheel context so a non-Adam reader sees where Adam sits in the chain.

## Connects to

- **Up from:** Roadmap waves ([04-roadmap-waves.md]) — Adam routes the SSOT.
- **Sources from:** Backlog intake ([05-backlog-intake.md]).
- **Hands to:** the coordinator ([08-belt-coordinator-fleet.md]) — propose, not dispatch.
- **Complemented by:** the automated engine ([07-sourcing-engine.md]) — when ON, the engine does
  Adam's belt-refill automatically.
- **Reports up via:** the executive summary email ([15-executive-summary-email.md]).
