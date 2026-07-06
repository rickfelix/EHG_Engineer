# Bitter-Lesson Ledger — harness heuristics + workaround expiry

> Source: `SD-LEO-INFRA-BITTER-LESSON-AUDIT-001` · rev `73cf01b6c011` · generated 2026-07-06T02:24:01.742Z
> DB-first truth: `metadata.bitter_lesson_ledger` on the source SD. Regenerate: `node scripts/one-off/bitter-lesson-audit.mjs --execute`.
> Sweep coverage is DISCLOSED, not closed: truly-silent workarounds are grep-invisible by definition — the families below say exactly what was searched.

## Component classifications

| Component | Classification | Capability trigger |
|---|---|---|
| dispatch tier-ladder (static model→rank map + DELEGATE_TIERS list) | **PARAMETERIZE** | Any lineup change — nearest known: Gemini 3.5 GA (mid-July) and post-Tuesday delegate-tier expansion. |
| one-way-door exclusivity (declared !== fable, name-keyed fail-closed) | **KEEP** | Delegate capability attestation shipping (evals proving a tier handles one-way-door work) flips this from name-keyed to attestation-keyed. |
| gate verdict engines (token-grep scoring: workflow-validator, metric-auto-verifier extractNumber first-numeric-token) | **REPLACE_WITH_GENERAL** | Cheap fast models (haiku-class) reliably judging structured rubrics with constrained decoding — capability exists TODAY; the blocker is per-gate latency/cost budget, which keeps shrinking. |
| ship review risk-scorer (keyword lists + LOC thresholds → tier) | **KEEP** | If keyword lists start gating IN (skipping review on absence) rather than gating UP, reclassify — floors may bias conservative only. |
| prompt templates with model-version-specific behavioral advice (CLAUDE*.md "Opus 4.8 interprets literally", per-model nudges) | **PARAMETERIZE** | Fleet default model change (the Claude 5 family rollout is live now). |
| liveness/dormancy heuristics (headless-zombie detection, dormancy watchdog thresholds, WORKER_SIGNAL:STUCK auto-thresholds) | **PARAMETERIZE** | Reward-spine L2 outcome data accumulating enough to auto-calibrate thresholds per signal (learned, not hand-tuned). |
| red-merge blame attribution (COUNT-based, not identity-based) | **REPLACE_WITH_GENERAL** | Already tractable — a fast model reading the failed CI step + the candidate diffs assigns blame with evidence; blocked only by wiring effort, not capability. |
| effort stamping (static effort-per-work-type recommendation at dispatch) | **PARAMETERIZE** | Reward-spine outcome layers (gate pass-rate vs effort spent) reaching enough volume to fit effort-per-type from data. |
| model config canonical seam (per-provider role→model map) | **KEEP** | n/a — the seam itself is the durable structure; individual pins carry their own triggers via tags. |

### Reasoning + replacement specs

**dispatch tier-ladder (static model→rank map + DELEGATE_TIERS list)** (`PARAMETERIZE`)

Model NAMES and their rank ordering are point-in-time lineup knowledge hand-baked into code; every new model family (Gemini 3.5, Claude 5.x tiers) forces source edits. The ordering CONCEPT is structural; the mapping is config-class data.

*Replacement spec:* Move the model→rank map (MODEL_STRENGTH in lib/fleet/tier-ladder.cjs — the primary hand-baked site, adversarial-review catch) and DELEGATE_TIERS into lib/config/model-config.js as data (same seam that already owns per-provider model IDs); dispatch reads capability tiers, never names. REVISIT-IF tags stamped at all three sites.

**one-way-door exclusivity (declared !== fable, name-keyed fail-closed)** (`KEEP`)

Deliberate safety invariant: irreversible work waits for the strongest tier, and UNDECLARED fails closed. Name-keying is the interim because no delegate capability ATTESTATION exists — the conservative direction is correct for an exclusivity gate even under the bitter lesson (safety floors are structural, not capability proxies).

*Replacement spec:* Generalize to attested-capability gating when attestation exists; REVISIT-IF tag stamped at the site.

**gate verdict engines (token-grep scoring: workflow-validator, metric-auto-verifier extractNumber first-numeric-token)** (`REPLACE_WITH_GENERAL`)

Referent-audit finding (this sprint): token-grep verdict engines score surface tokens, not meaning — workers learn to phrase artifacts for the grep (metric actuals must LEAD with the percentage because extractNumber takes the first numeric token). Hand-engineered parsing that models already beat.

*Replacement spec:* LLM-as-judge per gate: rubric + artifact → constrained-decoding verdict JSON (reference_llm_json_use_constrained_decoding), behind the existing gate-module interface (each gate already returns a verdict object — the seam is in place). Migrate gate-by-gate, token-grep kept as a shadow scorer during rollout.

**ship review risk-scorer (keyword lists + LOC thresholds → tier)** (`KEEP`)

The keyword override is a deliberate conservative FLOOR (security/schema words force deep review) — a cheap, auditable tripwire in front of the general method. The general method already exists downstream: the deep tier IS multi-agent adversarial review that scales with model capability. This pairing (hard floor + model-depth ceiling) is bitter-lesson-aligned, not a violation.

**prompt templates with model-version-specific behavioral advice (CLAUDE*.md "Opus 4.8 interprets literally", per-model nudges)** (`PARAMETERIZE`)

Protocol text hard-embeds observations about a SPECIFIC model generation. Correct today, silently wrong after the next fleet-default change — the doc keeps steering workers around a model that is no longer driving.

*Replacement spec:* Key model-behavior advice lines in leo_protocol_sections by model-family tag; the generator emits only lines matching the session model family. Longer term: self-tuned prompt variants scored by gate pass-rate (general method leveraging the reward spine).

**liveness/dormancy heuristics (headless-zombie detection, dormancy watchdog thresholds, WORKER_SIGNAL:STUCK auto-thresholds)** (`PARAMETERIZE`)

Detection CONCEPTS are structural (a session with a live PID and no heartbeat is a real state), but the numeric thresholds are hand-tuned to today's tick cadence and known to over-fire (reference_threshold_autosignal_stuck_overfire; process_alive_at freezes on Windows). Threshold values belong in config with per-signal calibration, not inline literals.

*Replacement spec:* Extract threshold literals to a config block; follow-up carrier calibrates from false-positive history already logged in session telemetry.

**red-merge blame attribution (COUNT-based, not identity-based)** (`REPLACE_WITH_GENERAL`)

Known false-QF source (reference_red_merge_detector_count_vs_identity_false_qfs): correlation-by-count hand-heuristic blames whatever merged nearest the red signal. Attribution is exactly the kind of judgment models do better than counters.

*Replacement spec:* Identity-based attribution: fetch the actually-failed step (reference_ci_red_verify_failed_step_not_log_string), candidate SHAs, and let a fast-model judge emit {blamed_sha, confidence, evidence} with constrained decoding; COUNT heuristic demoted to tie-breaker.

**effort stamping (static effort-per-work-type recommendation at dispatch)** (`PARAMETERIZE`)

Work-type→effort is a static table encoding today's intuition; as models strengthen, the same work needs less effort — a hand-tuned table silently overpays forever.

*Replacement spec:* Table moves to config now; follow-up carrier replaces static values with rolling percentile from completed-SD telemetry.

**model config canonical seam (per-provider role→model map)** (`KEEP`)

This IS the parameterization seam the rest of the audit routes model knowledge INTO — a single, env-overridable, documented map. Its documented pins (solomon opus-4-8, generation downgrade) carry REVISIT-IF tags with named re-decision triggers instead of silent staleness.

## REVISIT-IF tag grammar

```
REVISIT-IF(<condition>) owner=<role> provenance=<SD/QF/ref> [note=<premise>]
  condition: expires=YYYY-MM-DD (machine-evaluable) | free text (inventoried)
```

Tag inventory: 6 tags (1 healthy, 5 non-evaluable, 0 expired, 0 orphaned). Gauge: `expired-premise-tags` in lib/governance/gauge-registry.js (weekly via gauge-runner).

## Workaround sweep families (disclosed coverage)

| Family | Pattern | Hits | Files |
|---|---|---|---|
| bug-id references in comments | `(QF-\d|RCA |harness bug|fb:[0-9a-f]{8})` | 1933 | 553 |
| workaround/interim markers | `(workaround|WORKAROUND|interim path|stopgap|band-aid)` | 265 | 117 |
| retry/fallback shims | `(fallback to|retry shim|best-effort|fail-open)` | 983 | 418 |
| version/model pins with reasons | `(pinned to|pin |downgraded from|Downgraded from)` | 235 | 100 |
| REVISIT-IF tags (this SD grammar) | `REVISIT-IF\(` | 14 | 6 |

## Model-ID bucket table

| Bucket | Files |
|---|---|
| violation_candidate | 22 |
| excluded:registry_router | 6 |
| seam | 1 |
| excluded:pricing_cost | 4 |
| excluded:colocated_test | 1 |
| excluded:comment_reference | 13 |
| excluded:archive_example | 42 |
| excluded:experiment_harness | 3 |
| excluded:content_literal | 5 |
| excluded:oneoff_nonruntime | 5 |
| excluded:migration | 24 |
| excluded:agent_alias_namespace | 14 |

### Violations — filed as QF-20260705-350 (aggregate; triage escalates if > QF tier)

- `lib/agents/context-monitor.js` — gpt-4
- `lib/competitive-intelligence/differentiation-board.js` — claude-opus-4-8
- `lib/eva/bridge/claude-md-writer.js` — gemini-2.5-flash-image
- `lib/eva/qa/stitch-vision-qa.js` — claude-haiku-4-5
- `lib/eva/qa/stitch-wireframe-qa.js` — claude-sonnet-4-20250514
- `lib/eva/stage-17/refinement.js` — claude-opus-4-8
- `lib/integrations/youtube/transcript-fallback.js` — gemini-2.5-flash
- `lib/integrations/youtube/video-metadata.js` — gemini-2.5-flash
- `lib/marketing/ai/image-generator.js` — gemini-3-pro-image-preview
- `lib/programmatic/tool-loop.js` — claude-sonnet-4-6, gemini-2.5-flash
- `lib/skunkworks/proposal-agent.js` — claude-haiku-4-5-20251001
- `lib/testing/vision-qa-agent.js` — claude-sonnet-4-6, gemini-2.5-flash, gemini-2.5-pro
- `lib/uat/feedback-analyzer.js` — gemini-2.0-flash
- `scripts/eva/batch-rescore-manual-overrides.js` — gpt-5.2
- `scripts/eva/srip/quality-checker.mjs` — claude-haiku-4-5-20251001
- `scripts/eva-support/_internal/anthropic-client.js` — claude-opus-4-8
- `scripts/lib/visualization-provider.js` — gemini-3-pro-image-preview
- `scripts/modules/ai-quality-judge/config.js` — gemini-3-flash-preview, claude-sonnet-4-20250514
- `scripts/modules/ai-quality-judge/index.js` — claude-sonnet-4-20250514
- `scripts/modules/child-sd-llm-service.mjs` — gpt-4o
- `scripts/sd-baseline-intelligent.js` — gpt-5.2
- `scripts/validators/semantic-target-application-validator.js` — gpt-5.2
