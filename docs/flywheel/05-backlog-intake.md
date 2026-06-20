---
category: documentation
status: draft
version: 0.1.0
author: docmon-agent (Information Architecture Lead)
last_updated: 2026-06-20
tags: [flywheel, intake, conversion-ledger, backlog]
---

# Link 5 — Backlog Creation / Intake

> **Reviewed by Adam 2026-06-20 (chairman delegated the review); living doc — keep current as behavior changes.** [← back to the flywheel map](README.md)

## Role in the flywheel

Intake is the **funnel** that turns raw, heterogeneous ideas (the chairman's Todoist, YouTube
playlists, brainstorms, the estate corpus, harness-backlog feedback, deferred SDs) into
normalized, dispositioned candidates that can be placed on a roadmap wave. It is also where the
**feedback loop re-enters** the down-flow (lessons captured at link 13 land here as
`harness_backlog` feedback).

## Source of truth (verified 2026-06-20)

- **`conversion_ledger`** (624 rows) — the canonical intake ledger. Key columns: `source_pool`
  (e.g. `todoist_todo`, `youtube_playlist`, …), `source_id`, `source_external_id`, `title`,
  `normalized_priority`, `intake_status`, `disposition`, `triage_verdict`, `dedup_match_sd_key`,
  `dedup_score`, `linked_sd_key`, `target_rung`, `lane`.
- **`roadmap_wave_items`** (728) — the destination once a ledger item is placed on a wave (see
  [04-roadmap-waves.md]).

## The intake sources (the corpus)

The proactive populator (`lib/sourcing-engine/proactive-populator.js`, `buildCorpus`) enumerates
**4 canonical corpus inputs**, mapped to a LIVE-allowed `roadmap_wave_items.source_type`
(`corpusSourceType`):

| Source | Origin | Maps to source_type |
|--------|--------|---------------------|
| `todoist_todo` | Chairman's Todoist (via intake) | `todoist` |
| `youtube_playlist` | YouTube intake | `youtube` |
| estate corpus / sd_proposal / deferred-V2 / harness-backlog / Wave-6 | the estate + the harness's own backlog/feedback + deferred SDs | `brainstorm` (the live staging vehicle; migrates to `adam_direct` once the dormant `source_type` CHECK extension lands) |
| (deferred SD cluster) | `strategic_directives_v2` rows reactivated draft→deferred | `brainstorm` |

> **Gotcha encoded in code:** `roadmap_wave_items.source_id` is **UUID-typed**, but some sources
> (notably deferred SDs whose `.id` is a varchar sd_key string) would throw `22P02` on insert and
> silently drop. `toUuidSourceId()` derives a stable UUIDv5 so the same key always maps to the same
> id (idempotency preserved). Documented here so future source-additions don't reintroduce the drop.

## Disposition + dedup

- **Disposition** (BUILD | RESEARCH | REFERENCE | CANCEL) is the item's lifecycle verdict — set by
  `scripts/distill-backlog-dispositions.mjs` and surfaced as `sd_backlog_map.disposition`. It is
  **distinct** from `lane` (the sourcing route — see [07-sourcing-engine.md]).
- **Dedup**: `dedup-autostamp.js` stamps `dedup_match_sd_key` / `dedup_score` so an idea already
  represented by a shipped SD is caught (the router's `DEDUP` lane). This is **dedup hygiene** —
  see [progression-gate.md] for why it is distinct from "tapering."

## Distillation precedes routing

The chairman-Adam SSOT contract is explicit: if the relevant rung-waves have **no unpromoted
items**, **distillation comes first** — groom raw backlog (`sd_backlog_map`) into waved,
dispositioned candidates before reaching for the engine or (last-resort) gauge-mining. See
[06-adam-sourcing.md].

## Existing documentation

- `docs/reference/schema/engineer/tables/conversion_ledger.md` — schema. **Coverage: good (schema).**
- `docs/reference/brainstorm-metadata-convention.md`, `docs/reference/audit-to-sd-pipeline.md` —
  adjacent intake conventions. **Coverage: partial (touches intake, not the full funnel).**
- **Gap:** no doc enumerated all intake sources → conversion_ledger → wave-items as one funnel.
  This doc fills it.

## Connects to

- **Up from:** Roadmap waves ([04-roadmap-waves.md]) — intake fills wave-items.
- **Sourced by:** Adam ([06-adam-sourcing.md]) and the automated engine ([07-sourcing-engine.md]).
- **Fed by the loop:** retro/learn/heal/signal → `feedback` (`category=harness_backlog`) re-enters
  here ([13-feedback-learning.md]).
