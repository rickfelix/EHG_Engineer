# Scheduled Jobs Registry — Cron + GitHub Actions

**Chairman-directed 2026-07-19**: every deliberate recurring check (role oversight, self-scores, sweeps) runs on a **set schedule**, survives **session death**, and is **documented here** — never carried in session memory.

This registry mirrors its SSOTs; it does not replace them. When a job is added, moved, or retired, update this file in the same PR. The SSOTs are:

| Layer | SSOT |
|---|---|
| GitHub Actions schedules | `.github/workflows/*.yml` (`schedule:` blocks) |
| Adam session loops | `scripts/adam-startup-check.mjs` emitted specs (re-armed at every `/adam`) |
| Solomon session loops | `SOLOMON_LOOPS` in `scripts/solomon-startup-check.mjs` (re-armed at every `/solomon`; contract-parity fails loud on a durable duty with no loop) |
| Coordinator loops | `/coordinator start` arming + `loop_registry` (DB) |
| Registered loop predicates | `loop_registry` table (`predicate_type=edge_freshness` rows define staleness windows over evidence tables) |

To re-derive the GitHub Actions table:
`grep -A3 "schedule:" .github/workflows/*.yml | grep "cron:"`

---

## The three-layer durability model

1. **GitHub Actions scheduled workflows** — run on GitHub's servers; need **no local session, no machine awake**. Anything script-runnable belongs here.
2. **Role-session crons** — armed at role activation (`/adam`, `/solomon`, `/coordinator start`) via the harness scheduler. **Mortal**: in-memory, die with the session, 7-day auto-expiry. Used for judgment-requiring duties a script cannot perform (self-scoring, deciding whether to press a peer role). Every role-session cron MUST be listed in its startup-check spec so activation re-arms it.
3. **Headless staleness detectors** (bridging 1→2) — GHA crons that check the *stamps* the judgment duties leave behind and write durable typed inbox rows when overdue. If no session is alive, the row queues for the successor (owed-state, not memory).

---

## Layer 1 — GitHub Actions scheduled workflows (session-independent)

All times **UTC** (ET is UTC−4 summer / UTC−5 winter). Every workflow also supports `workflow_dispatch` unless noted.

### Adam-lane
| Workflow | Schedule (UTC) | Purpose |
|---|---|---|
| `adam-exec-email-cron.yml` | `0,15,30,45 * * * *` | Exec-email pipeline tick (email reserved for long-form; SMS is the heartbeat channel) |
| `adam-decision-scheduler-cron.yml` | `20 0-1,11-23 * * *` | Chairman decision-packet scheduling (waking hours) |
| `adam-opportunity-scan-cron.yml` | `37 * * * *` | Governance/opportunity scan |
| `adam-doc-drift-cron.yml` | `0 9 */3 * *` | Doc-drift review (propose-only) |
| `adam-github-assessment-cron.yml` | `30 9 */3 * *` | GitHub-health assessment (CI red, PR hygiene, alerts) |

### Chairman-lane
| Workflow | Schedule (UTC) | Purpose |
|---|---|---|
| `chairman-morning-review-cron.yml` | `45 9 * * *` + `45 10 * * *` | 05:45 ET daily review (dual entries cover EDT/EST) |
| `chairman-decision-sla-cron.yml` | `15 0-2,10-23 * * *` | Decision-SLA watch (waking hours) |
| `chairman-email-canary-cron.yml` | `0 14 * * *` + `0 */6 * * *` | Email-channel canary |
| `sms-relay-drain-cron.yml` | `*/5 * * * *` | Inbound chairman-SMS staging drain |
| `youtube-subscription-digest.yml` | `0 11 * * *` | Daily digest (06:00 ET) |

### Fleet / sourcing
| Workflow | Schedule (UTC) | Purpose |
|---|---|---|
| `fleet-worker-pulse-cron.yml` | `7,22,37,52 * * * *` | Worker pulse |
| `fleet-down-alert-cron.yml` | `11,26,41,56 * * * *` | Fleet-down alerting |
| `fleet-rollcall-cron.yml` | `*/30 * * * *` | Roll-call |
| `backlog-rank-cron.yml` | `9,24,39,54 * * * *` | Dispatch-rank refresh |
| `sourcing-auto-refill-cron.yml` | `25 * * * *` | Belt auto-refill |
| `sourcing-deferred-watcher-cron.yml` | `23 */6 * * *` | Deferred-item watcher |
| `sourcing-gauge-gap-miner-cron.yml` | `41 6 * * *` | Gauge-gap miner |
| `stamp-tier-rank-sweep.yml` | `0 */6 * * *` | Tier-rank stamp sweep |
| `fr-c-generator-cron.yml` | `0 * * * *` | FR-C generation |
| `estate-disposition-cron.yml` | `17 * * * *` | Estate disposition |
| `worktree-reaper-cadence.yml` | `0 3 * * *` | Worktree reaping |
| `stale-pr-cleanup.yml` | `0 9 * * 1` | Stale-PR cleanup (Mon) |

### Clockwork / feedback hygiene
| Workflow | Schedule (UTC) | Purpose |
|---|---|---|
| `clockwork-auto-triage.yml` | `30 * * * *` | Feedback auto-triage |
| `clockwork-auto-resolve.yml` | `45 * * * *` | Auto-resolve |
| `clockwork-ci-autotriage-loop.yml` | `50 * * * *` | CI failure auto-triage |
| `clockwork-gh-failure-monitor.yml` | `15 * * * *` | GH failure monitor |
| `clockwork-feedback-age-out.yml` | `0 3 * * *` | Feedback age-out |
| `clockwork-feedback-fingerprint-promoter.yml` | `0 */6 * * *` | Fingerprint promoter |
| `clockwork-retro-action-item-promoter.yml` | `0 4 * * *` | Retro action-item promoter |
| `prod-error-sweep-loop.yml` | `40 * * * *` | Prod-error sweep |
| `feedback-pipeline-health.yml` | `0 14 * * 1` | Pipeline health (Mon) |

### Solomon-lane
| Workflow | Schedule (UTC) | Purpose |
|---|---|---|
| `solomon-ledger-reconcile.yml` | `0 6 * * *` | Advice/forecast ledger reconcile (the proven precedent for headless role-duty triggers) |

### Venture / vision / roadmap
| Workflow | Schedule (UTC) | Purpose |
|---|---|---|
| `eva-scheduler-watcher-cron.yml` | `*/15 * * * *` | EVA scheduler watcher |
| `software-factory-poll.yml` | `0,30 8-22 * * *` | Factory poll (waking hours) |
| `venture-operating-burn-cron.yml` | `15 * * * *` | Operating-burn tracking |
| `venture-ops-actuals-cron.yml` | (see file) | Venture-ops actuals pull |
| `venture-telemetry-pull.yml` | `0 6 * * *` | Telemetry pull |
| `canary-venture-probe.yml` | `17 6 * * 0` | Canary venture probe (Sun) |
| `wave-progress-refresher.yml` | `37 */6 * * *` | Roadmap wave progress refresh |
| `vision-alignment-staging-readonly.yml` | `20 4 * * *` | Vision alignment (staging) |
| `vision-alignment-prod-readonly.yml` | `30 4 * * *` | Vision alignment (prod) |
| `vision-ladder-coherence.yml` | `17 6 * * *` | Vision-ladder coherence |
| `vh-ideation-staging-readonly.yml` | `10 4 * * *` | Ideation staging check |
| `backlog-integrity-staging-readonly.yml` | `0 4 * * *` | Backlog integrity |
| `stage-contract-connectivity.yml` | `23 6 * * *` | Stage-contract connectivity |
| `skunkworks-monday-batch.yml` | `30 10 * * 1` | Skunkworks batch (Mon) |
| `cost-governor-cron.yml` | `17 6 * * *` | Cost governor |

### Docs / audit / security
| Workflow | Schedule (UTC) | Purpose |
|---|---|---|
| `codebase-health-weekly.yml` | `0 8 * * 0` | Weekly codebase health |
| `docmon-weekly.yml` | `0 10 * * 1` | Doc monitoring (Mon) |
| `doc-validation.yml` | `0 0 * * 0` | Doc validation (Sun) |
| `schema-docs-update.yml` | `0 0 * * 0` | Schema docs regen (Sun) |
| `skill-audit-weekly.yml` | `0 11 * * 1` | Skill audit (Mon) |
| `prd-audit-scheduled.yml` | `0 9 * * 1` | PRD audit (Mon) |
| `security-linter-sentinel.yml` | `0 14 * * 1` | Security linter (Mon) |
| `audit-target-application-drift.yml` | `0 13 * * 1` | Target-app drift audit (Mon) |
| `retention-enforce-cron.yml` | `0 3 * * 0` | Retention enforcement (Sun) |
| `dr-restore-rehearsal-cron.yml` | `0 6 1 * *` | Monthly DR restore rehearsal |

---

## Layer 2 — Role-session crons (mortal; re-armed at role activation)

All times **local ET** (harness scheduler runs in machine-local time).

### Adam (`/adam` re-arms; SSOT: `scripts/adam-startup-check.mjs`)
| Loop key | Schedule (ET) | Duty (contract ref: CLAUDE_ADAM.md) |
|---|---|---|
| quiet-tick | `7,22,37,52 * * * *` (self-paced ~4 min via wakeups between) | Inbox drain, chairman-SMS inbound watch, stall alerts, board reconcile |
| governance-scan | daily 1 PM | Opportunity scan (session-side twin of the GHA cron) |
| self-adherence | every 6 h | Automated probe layer → `adam_adherence_ledger` |
| doc-drift | every 3 d 9:00 | Doc-drift review (session-side twin) |
| github-assessment | every 3 d 9:30 | GitHub-health (session-side twin) |
| heartbeat-sms | hourly :14 | Contract c3 — brief hourly chairman SMS (quiet hours 10 PM–6 AM ET) |
| morning-brief | daily 6:00 AM | Contract c4 — plan-first daily brief by SMS, reconciled-never-fire-and-forget |
| **coordinator-oversight** | **every 3 h :23** | **Standing coordinator-health audit (`scripts/adam-coordinator-health.mjs`), armed 2026-07-19** |
| **self-score** | **every 6 h :41** | **8-dimension rubric self-score → `feedback` cat=`adam_self_assessment` with committed_actions, armed 2026-07-19** |
| **solomon-health** | **5:52 AM + 5:52 PM** | **Solomon 5-point health check (liveness/loops/drift/pin/accuracy), armed 2026-07-19** |
| **plan-check-snapshot** | **daily 9:47 PM** | **Persist forward list (`plan-check-forward-list-*`) so "what slipped" computes, armed 2026-07-19** |

### Solomon (`/solomon` re-arms; SSOT: `SOLOMON_LOOPS`)
| Loop key | Schedule (ET) | Duty |
|---|---|---|
| inbox drain | every 5 min | `solomon-advisory.cjs inbox` |
| self-adherence | every 12 h | `solomon-self-adherence-review.mjs` |
| deep-sweep (Mode-B) | every 6 h | Deep-sweep tick |
| weekly-program | Mon 8:23 AM | P3 budget line, standing programs, accuracy review, autonomy report, P4 Fable-terms re-check *(registry entry pending QF-20260719-072)* |
| forecast-triggers | daily 7:37 AM | Velocity/gate/scope re-issue trigger check *(registry entry pending QF-20260719-072)* |

### Coordinator (`/coordinator start` arms; see `.claude/commands/coordinator.md`)
Hourly responsibilities reminder (`scripts/coordinator-hourly-review.cjs`, quiescence-aware), review-queue drain, and registered oversight loops in `loop_registry`.

---

## Layer 3 — In-flight durability work (as of 2026-07-19)

| Item | Closes |
|---|---|
| QF-20260719-825 | Adam startup-spec re-arm for the four new loops + quiet-tick staleness backstop lines |
| QF-20260719-196 | `adam-coordinator-health-cron.yml` — the oversight audit headless every 3 h (evidence was 70 h stale vs a 26 h window when caught) |
| QF-20260719-997 | `adam-adherence-staleness-cron.yml` — headless stamp-watcher writing durable typed inbox rows when self-score / solomon-health / plan-snapshot go overdue |
| QF-20260719-072 | `SOLOMON_LOOPS` entries (weekly-program, forecast-triggers) + `covers[]` parity fix so the contract-parity check fails loud |
| QF-20260719-148 | `solomon-duty-triggers-cron.yml` — headless forecast-trigger evaluation + Monday budget-line reminder rows |

**Known gap (tracked in SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001, F3):** `sms-outbound-reconcile-sweep.mjs` has no durable runner yet — outbound SMS reconciliation currently runs only when invoked by a live session.

---

## Maintenance rules

1. **Adding a scheduled job**: add it to its SSOT (workflow file or startup-check spec) *and* to this registry in the same PR.
2. **Judgment vs mechanical**: mechanical work → Layer 1 (GHA). Judgment work → Layer 2, *plus* a Layer-3 staleness watcher over the stamp it leaves.
3. **Stamps, never inferred**: every scheduled duty must leave a queryable stamp (snapshot row, ledger row, feedback row) so staleness is detectable headlessly.
4. **Off-minute discipline**: pick off-minutes (`:17`, `:23`, `:41`…) to avoid top-of-hour thundering herds — both GHA and session crons.
5. The doc-drift review (itself scheduled, both layers) watches this file for drift against the SSOTs.
