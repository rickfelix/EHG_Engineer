<!-- file_content_hash: 9b83b9e4cd4f5332 -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_MICHAEL_MODEL_POSTURE.md — Michael Model Posture (binding companion)

**Generated**: 2026-09-05 5:11:59 PM
**Protocol**: LEO 4.4.1
**Purpose**: Opus-at-medium seat pin with Sonnet quota fallback, the Sonnet/Opus/Haiku tiering table, Opus verification on auto_apply flips, stop-sub-agents-when-read, Max-plan-only
**Load when**: At every /michael startup (Step 1) and on any pin change or budget-state change — before acting on model posture

> This file BINDS. It is split from CLAUDE_MICHAEL.md for READ-CAP headroom only, and CLAUDE_MICHAEL.md §9 carries a pointer marking it BINDING. Its clauses are in force whether or not this file is read; nothing in Michael's path bills an API key.

---

## Michael Model Posture (binding companion)

**Venue consequence**: a Max-plan model is reachable only from a Claude Code session, so the model layer runs at Michael's seat and the durable venues (host Task Scheduler, GitHub Actions) do only model-free work. **The model-free brief is the brief of record**; the seat's classification, grading and lede are enrichment stamped `enriched_at` when the seat was alive. Role seats die and rotate, so the dead-seat path is the common path until measured otherwise: `michael-seat-uptime` gates go-live at five of seven overnight ticks landed in the parallel-read week, and if it trips twice in the first fourteen mornings the measured miss rate returns the model decision (D2) to the chairman with the Gemini durable-venue classifier recorded as the counterfactual (Solomon Q10).

**Max-plan only, never API billing (D2)**: every model call is an Anthropic model on one of the three Max plans; nothing in Michael's path bills an API key. Verify via `/status` at every `/michael` startup (Step 0) that the session is on the Max plan before any overnight tick; on API billing, STOP and re-authenticate onto a Max profile.

**Seat pin (chairman on Solomon Q5, ratification 2b14e48d)**: the morning conversation runs on **Opus at medium effort** (`MODEL_DEFAULTS.claude.michael` / `CLAUDE_MODEL_MICHAEL`), with **Sonnet as the fallback under account quota** (`MODEL_DEFAULTS.claude['michael-fallback']` / `CLAUDE_MODEL_MICHAEL_FALLBACK`). A `/model` switch does not re-stamp the session tier: re-register (`node scripts/michael-register.cjs --model <model> --effort <effort>`) after any pin change so tier-aware accounting sees it. Fable has no role in v1.

| Activity | Where | Model | Verification |
|---|---|---|---|
| Fetch, rules-first matching, calendar read, Todoist snapshot, Tasks-bridge keyword routing, assembly, rendering, retention | Host Task Scheduler / GHA | No LLM | Deterministic validators |
| Gmail classification of the unmatched remainder (queued with `class = null`) | Seat, overnight tick, sub-agent | **Sonnet** (the remainder is the hard tail, not the bulk — Solomon Q3.3) | Every `needs_you` and `borderline` item plus a 10% random sample of auto-archived items re-judged by an **Opus** sub-agent; disagreement flips to `borderline` and records `verified_by`; `michael-classifier-drift` trips at >5% sample disagreement over 7 days |
| Fleet/EHG email summaries (the only true bulk) | Seat, sub-agent | **Haiku** | None |
| Todoist effort grading and proposed dates (items without an `Est:` line); Tasks-bridge items no keyword rule routed | Seat, sub-agent | Sonnet | Opus validator enforcing never-Tuesday, the weekend one-project budget, and a specific date for every overdue item |
| Lede and Today sentence | Seat, at wake-up | The seat model | Tone linter |
| The morning conversation | Seat | **Opus at medium effort**, Sonnet fallback under quota | The chairman; rulings are read back before encoding |
| Rule encodes that flip `auto_apply` or supersede a rule | Seat, sub-agent, before the row is written | **Opus** verification regardless of the seat's current model | The verifier's verdict is stored in `provenance` |
| Weekly self-review of dispositions and the week's encodes against the ledger | Seat, Sunday evening, one pass | Opus at high effort | Staged proposals in `michael_staged_items`; never applied unprompted |

**Sub-agents are stopped the moment their result is read** (Solomon Q3.4; the QF-20260905-768 class): a tick that leaves gatherers attached burns the Max plan the chairman is protecting.

**Account rotation and metering**: the seat launches under any of the three profiles (`relaunchUnderProfile`); the account-capacity gauge knows all three plans. Every sub-agent call records `model_used`, `tokens_in` and `tokens_out` into `michael_feeder_runs` via the tick's summary; conversation spend is self-reported in the ledger until harness `cost_tokens` metering lands; `michael-token-budget` is deferred until then.

---

*Generated from database: 2026-09-05*
*Protocol Version: 4.4.1*
*Source of truth: leo_protocol_sections (section_type=michael_model_posture). Do not hand-edit — edit the DB section and regenerate.*
