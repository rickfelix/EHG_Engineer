# Roadmap-link exception drift census — 2026-08-19

**Source**: QF-20260818-459 (chairman plan-drive commission, sourced by Adam; Solomon plan-drive audit
oracle packet 16:57Z corr 88cd17d0). Every SD whose `metadata.roadmap_link_exception.reason_supplied`
was `false` at classification time — created without a preceding roadmap registration AND without an
operator-supplied reason for skipping it.

**This document is the drift census the chairman asked for.** It answers one question per SD: did the
work serve a ratified, live, top-level priority, or was it a reactive fix (bug, gate defect, hardening,
observability, CI, coordination-infra, data-integrity, or an incident response)? The classification is
stamped on each SD's own row (`metadata.roadmap_link_exception.drift_classification`) so it stays
queryable after this document; this file is the carry-forward artifact for the roadmap-reconciliation
proposal.

**Rubric.** `serves-ratified-live-priority:<X>` requires a *direct* trace to one of three named,
ratified priorities: the venture-1 revenue path (AltifyAI as the flagship venture, demand/activation,
PBN pipeline), the venture no-crack gate, or an explicit chairman commission (including the drive-score
system, which is the chairman's own championed north-star metric, not incidental harness plumbing).
Everything else — including security hardening, gate-bug fixes, CI operations, coordination
infrastructure, observability, data-integrity repair, and direct incident response — is `reactive-fix`,
classified honestly rather than inflated toward the ratified bucket. 22 of 124 (18%) trace to a ratified
priority; the remaining 102 (82%) are reactive harness-hardening work.

## Summary

| Bucket | Count | Share |
|---|---:|---:|
| **serves-ratified-live-priority** (total) | 22 | 18% |
| &nbsp;&nbsp;— chairman-commission | 12 | 10% |
| &nbsp;&nbsp;— venture-1-revenue-path | 8 | 6% |
| &nbsp;&nbsp;— crack-gate | 2 | 2% |
| **reactive-fix** (total) | 102 | 82% |
| &nbsp;&nbsp;— gate-bug | 29 | 23% |
| &nbsp;&nbsp;— security-hardening | 19 | 15% |
| &nbsp;&nbsp;— harness-observability | 15 | 12% |
| &nbsp;&nbsp;— harness-hardening | 14 | 11% |
| &nbsp;&nbsp;— coordination-infra | 11 | 9% |
| &nbsp;&nbsp;— data-integrity | 6 | 5% |
| &nbsp;&nbsp;— ci-ops | 6 | 5% |
| &nbsp;&nbsp;— incident | 2 | 2% |
| **Total classified** | **124** | **100%** |

Zero unmapped rows: every reason-less exception present at classification time was assigned a verdict.
A row created after this snapshot will surface on the next `countRoadmapLinkExceptions` read as a fresh,
unclassified reason-less exception — the guard shipped alongside this census (see below) makes each new
one visible in the creating process's own output, not just countable after the fact.

## Read on the pattern

The 82% reactive-fix share is not, on its own, a problem to correct — it is what a fleet running a
continuous harness-hardening campaign produces by design (per this project's own `[MODE: campaign]`
convention). The signal worth carrying into the roadmap-reconciliation proposal is narrower: **101 of
the 102 reactive-fix SDs, and 20 of the 22 ratified-priority SDs, were still created without a recorded
reason** for skipping roadmap registration — meaning the `--roadmap-link-reason` flag (shipped by
`SD-LEO-INFRA-LEO-CREATE-PLAN-001`, itself one of the 124 unreasoned rows below) exists but is not being
used, so `operator_reason` is not carrying real information yet; the classification in this document is
the first time these rows have been characterized. If the roadmap-reconciliation proposal wants a
going-forward target, it is: route `serves-ratified-live-priority` work through registered roadmap items
where practical, and require a one-line `--roadmap-link-reason` on `reactive-fix` creations — both cost
nothing operationally and turn this document from a one-time census into a standing, self-maintaining one.

## Code guard shipped alongside this census

`lib/sourcing-engine/roadmap-link-exception.js`'s `buildRoadmapLinkException()` now emits a
`console.warn` naming the SD key at the moment of stamping a reason-less exception. This is **loud, not
blocking** — the module's own FR-1 (measured: 553/905 completed quick_fixes use `force_completed`, a
19.1% genuine human-override rate) forbids throwing, exiting, or refusing at this seam; a hard gate here
would bind hardest on the most productive sourcing days. The QF's literal "make it impossible" was
reconciled against that pre-existing, measured constraint rather than overridden — visibility at
creation time (not just after-the-fact countability) is the loud signal that satisfies the QF's intent
without reopening a settled, evidence-backed design decision from a prior SD.

## Full classification

| SD Key | Type | Status | Created | Verdict |
|---|---|---|---|---|
| SD-LEO-INFRA-GATE-THRESHOLD-TUNING-001 | infrastructure | completed | 2026-08-01 | reactive-fix:gate-bug |
| SD-LEO-INFRA-WRITER-SUB-AGENT-001 | infrastructure | completed | 2026-08-02 | reactive-fix:harness-observability |
| SD-LEO-INFRA-GUARD-FIRING-RECORDS-001 | infrastructure | completed | 2026-08-02 | reactive-fix:harness-observability |
| SD-LEO-INFRA-FORCE-ROLE-SESSIONS-001 | infrastructure | completed | 2026-08-02 | reactive-fix:harness-observability |
| SD-LEO-INFRA-NORMATIVE-SIGNAL-AUDIT-001 | infrastructure | completed | 2026-08-02 | reactive-fix:harness-observability |
| SD-LEO-INFRA-TIER-GATE-FLAG-001 | infrastructure | completed | 2026-08-03 | reactive-fix:gate-bug |
| SD-LEO-INFRA-COORDINATION-BUS-ACCESS-001 | infrastructure | completed | 2026-08-03 | reactive-fix:security-hardening |
| SD-LEO-INFRA-RELEASED-MID-PHASE-001 | infrastructure | completed | 2026-08-03 | reactive-fix:coordination-infra |
| SD-LEO-INFRA-STRUCTURED-FIELDS-HONEST-001 | infrastructure | completed | 2026-08-03 | reactive-fix:harness-observability |
| SD-LEO-INFRA-ONE-GENUINELY-DEAD-001 | infrastructure | completed | 2026-08-03 | reactive-fix:harness-hardening |
| SD-LEO-INFRA-FIVE-GUARDS-WIRED-001 | infrastructure | completed | 2026-08-03 | reactive-fix:ci-ops |
| SD-LEO-INFRA-RESUME-FINAL-READ-001 | infrastructure | completed | 2026-08-03 | reactive-fix:coordination-infra |
| SD-LEO-INFRA-THREE-GAPS-APPLIED-001 | infrastructure | completed | 2026-08-03 | reactive-fix:security-hardening |
| SD-LEO-INFRA-CHAIRMAN-SMS-LANE-001 | infrastructure | completed | 2026-08-03 | serves-ratified-live-priority:chairman-commission |
| SD-LEO-INFRA-PLAN-POSITION-READABLE-001 | infrastructure | completed | 2026-08-03 | reactive-fix:harness-observability |
| SD-LEO-INFRA-TRIAGE-2026-BULK-001 | infrastructure | completed | 2026-08-03 | reactive-fix:ci-ops |
| SD-LEO-INFRA-BOTH-BELT-GAUGES-001 | infrastructure | completed | 2026-08-03 | reactive-fix:harness-observability |
| SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001 | infrastructure | completed | 2026-08-03 | reactive-fix:coordination-infra |
| SD-LEO-INFRA-CONTROL-SURFACE-POSTURE-001 | infrastructure | completed | 2026-08-03 | reactive-fix:security-hardening |
| SD-LEO-INFRA-INGRESS-BOUND-DEFINER-BASIS-001 | infrastructure | completed | 2026-08-04 | reactive-fix:security-hardening |
| SD-LEO-INFRA-VALIDATION-DUPE-DETECTION-DEAD-001 | bugfix | completed | 2026-08-04 | reactive-fix:gate-bug |
| SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 | infrastructure | completed | 2026-08-04 | reactive-fix:harness-observability |
| SD-LEO-FIX-CREDENTIAL-GUARD-INVERSION-001 | bugfix | completed | 2026-08-04 | reactive-fix:security-hardening |
| SD-LEO-INFRA-STAMP-ARMING-TIME-001 | infrastructure | completed | 2026-08-04 | reactive-fix:harness-observability |
| SD-LEO-INFRA-TREND-EYES-OFF-001 | infrastructure | completed | 2026-08-05 | serves-ratified-live-priority:chairman-commission |
| SD-LEO-FIX-POINT-STARVATION-COUPLING-001 | bugfix | completed | 2026-08-07 | reactive-fix:gate-bug |
| SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001 | orchestrator | completed | 2026-08-07 | reactive-fix:harness-hardening |
| SD-LEO-INFRA-VERIFY-CONSUMER-HANDOFF-001 | infrastructure | completed | 2026-08-07 | reactive-fix:gate-bug |
| SD-LEO-INFRA-SESSION-MESSAGING-NUDGE-001 | infrastructure | deferred | 2026-08-07 | reactive-fix:coordination-infra |
| SD-LEO-INFRA-UNCAPPED-ROADMAP-ITEMS-001 | infrastructure | completed | 2026-08-07 | reactive-fix:data-integrity |
| SD-LEO-INFRA-FENCE-PARITY-QUICK-001 | infrastructure | cancelled | 2026-08-07 | reactive-fix:security-hardening |
| SD-LEO-FIX-SHELL-INJECTION-RCE-001 | bugfix | completed | 2026-08-08 | reactive-fix:security-hardening |
| SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-002 | infrastructure | completed | 2026-08-08 | reactive-fix:gate-bug |
| SD-LEO-INFRA-SWEEP-REPO-SCANNERS-001 | infrastructure | completed | 2026-08-08 | reactive-fix:harness-hardening |
| SD-LEO-FIX-SHELL-INJECTION-REACHABLE-001 | bugfix | completed | 2026-08-08 | reactive-fix:security-hardening |
| SD-LEO-INFRA-PUBLISH-SHELL-INJECTION-001 | orchestrator | completed | 2026-08-08 | reactive-fix:security-hardening |
| SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001 | bugfix | completed | 2026-08-08 | reactive-fix:gate-bug |
| SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001 | infrastructure | completed | 2026-08-08 | reactive-fix:coordination-infra |
| SD-LEO-INFRA-STANDING-OBSERVABILITY-ACCEPTANCE-001 | infrastructure | completed | 2026-08-08 | reactive-fix:harness-hardening |
| SD-LEO-INFRA-EXPLORE-UNREGISTERED-LEO-001 | infrastructure | completed | 2026-08-08 | reactive-fix:gate-bug |
| SD-LEO-INFRA-DRAIN-INVENTORY-CANNOT-001 | infrastructure | completed | 2026-08-08 | reactive-fix:gate-bug |
| SD-LEO-INFRA-ADOPT-EXISTING-READCANONICALBODY-001 | infrastructure | cancelled | 2026-08-08 | reactive-fix:harness-hardening |
| SD-LEO-INFRA-DRIVE-STATE-OBSERVABILITY-001 | infrastructure | completed | 2026-08-08 | reactive-fix:harness-observability |
| SD-LEO-FIX-ATOMIC-COORDINATOR-ACK-001 | bugfix | cancelled | 2026-08-08 | reactive-fix:coordination-infra |
| SD-LEO-INFRA-REPO-WIDE-GITATTRIBUTES-001 | infrastructure | completed | 2026-08-08 | reactive-fix:harness-hardening |
| SD-LEO-INFRA-WORKER-REACHABLE-ACK-001 | infrastructure | completed | 2026-08-08 | reactive-fix:coordination-infra |
| SD-LEO-INFRA-STRUCTURAL-SOLOMON-CONSULT-001 | infrastructure | cancelled | 2026-08-08 | reactive-fix:gate-bug |
| SD-LEO-INFRA-FLEET-WIDE-VITEST-001 | infrastructure | completed | 2026-08-08 | reactive-fix:ci-ops |
| SD-LEO-FEAT-CODIFY-HONEST-ACTIVATION-001 | feature | completed | 2026-08-08 | serves-ratified-live-priority:venture-1-revenue-path |
| SD-LEO-INFRA-DRIVE-STATE-FORCING-001 | infrastructure | completed | 2026-08-08 | reactive-fix:harness-hardening |
| SD-LEO-INFRA-RETRO-INTEGRITY-RUN-001 | infrastructure | completed | 2026-08-08 | reactive-fix:harness-observability |
| SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 | feature | completed | 2026-08-08 | serves-ratified-live-priority:venture-1-revenue-path |
| SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 | infrastructure | completed | 2026-08-08 | reactive-fix:harness-hardening |
| SD-LEO-INFRA-LEO-CREATE-PLAN-001 | infrastructure | completed | 2026-08-08 | reactive-fix:harness-hardening |
| SD-LEO-INFRA-REAP-COMPLETED-WORKTREE-001 | infrastructure | completed | 2026-08-08 | reactive-fix:coordination-infra |
| SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001 | infrastructure | completed | 2026-08-09 | reactive-fix:coordination-infra |
| SD-LEO-INFRA-STORY-E2E-AUTO-001 | infrastructure | completed | 2026-08-09 | reactive-fix:gate-bug |
| SD-LEO-INFRA-EVERY-CLAIM-WRITE-001 | infrastructure | completed | 2026-08-09 | reactive-fix:coordination-infra |
| SD-LEO-INFRA-COMPLETION-FAIL-OWN-001 | infrastructure | completed | 2026-08-09 | reactive-fix:gate-bug |
| SD-LEO-INFRA-HEAL-BEFORE-COMPLETE-001 | infrastructure | completed | 2026-08-09 | reactive-fix:gate-bug |
| SD-LEO-INFRA-ABSENT-GATE-SCORE-001 | infrastructure | completed | 2026-08-09 | reactive-fix:gate-bug |
| SD-LEO-INFRA-STORY-E2E-WRITE-001 | infrastructure | completed | 2026-08-09 | reactive-fix:gate-bug |
| SD-LEO-INFRA-VITEST-TIER-REAL-001 | infrastructure | completed | 2026-08-09 | reactive-fix:ci-ops |
| SD-LEO-INFRA-MIGRATION-APPLY-STATE-002 | infrastructure | completed | 2026-08-10 | reactive-fix:data-integrity |
| SD-LEO-INFRA-CLOSE-SHELL-INJECTION-001 | infrastructure | completed | 2026-08-10 | reactive-fix:security-hardening |
| SD-LEO-INFRA-CAPACITY-FORECASTER-BELT-001 | infrastructure | completed | 2026-08-10 | reactive-fix:harness-observability |
| SD-LEO-INFRA-COMPLETE-SMS-RELAY-001 | infrastructure | completed | 2026-08-10 | serves-ratified-live-priority:chairman-commission |
| SD-LEO-INFRA-DRIVE-SCORE-DENOMINATOR-001 | infrastructure | completed | 2026-08-10 | serves-ratified-live-priority:chairman-commission |
| SD-LEO-INFRA-DRIVE-SCORE-LEG1-001 | infrastructure | completed | 2026-08-10 | serves-ratified-live-priority:chairman-commission |
| SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 | infrastructure | completed | 2026-08-10 | serves-ratified-live-priority:chairman-commission |
| SD-LEO-INFRA-QUIET-HOURS-GATE-001 | infrastructure | completed | 2026-08-10 | serves-ratified-live-priority:chairman-commission |
| SD-LEO-INFRA-COORDINATOR-HEALTH-BREACH-001 | infrastructure | completed | 2026-08-10 | reactive-fix:harness-observability |
| SD-LEO-INFRA-CONTRACT-READ-FIT-001 | infrastructure | completed | 2026-08-10 | reactive-fix:gate-bug |
| SD-LEO-INFRA-TODOIST-YOUTUBE-ROADMAP-001 | infrastructure | completed | 2026-08-10 | reactive-fix:data-integrity |
| SD-LEO-INFRA-VENTURE-STATUS-LANGUAGE-001 | infrastructure | completed | 2026-08-11 | serves-ratified-live-priority:venture-1-revenue-path |
| SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 | infrastructure | completed | 2026-08-11 | serves-ratified-live-priority:chairman-commission |
| SD-LEO-INFRA-AGE-GAUGE-NON-001 | infrastructure | completed | 2026-08-11 | reactive-fix:harness-observability |
| SD-LEO-FIX-FINGERPRINT-STOP-CHAIRMAN-001 | bugfix | completed | 2026-08-11 | reactive-fix:gate-bug |
| SD-LEO-INFRA-EXCLUDE-MONITORING-TELEMETRY-001 | infrastructure | completed | 2026-08-11 | reactive-fix:harness-hardening |
| SD-LEO-INFRA-RECONCILE-VENTURE-ARTIFACTS-001 | infrastructure | completed | 2026-08-12 | reactive-fix:data-integrity |
| SD-LEO-INFRA-AUTHOR-VENTURE-LIFECYCLE-001 | infrastructure | completed | 2026-08-12 | serves-ratified-live-priority:venture-1-revenue-path |
| SD-LEO-INFRA-RECONCILE-20260711-ORCHESTRATOR-001 | infrastructure | completed | 2026-08-12 | reactive-fix:data-integrity |
| SD-LEO-INFRA-DRIVE-SCORE-PER-001 | infrastructure | completed | 2026-08-12 | serves-ratified-live-priority:chairman-commission |
| SD-LEO-INFRA-CF-ADAPTER-PER-VENTURE-SCOPING-001 | infrastructure | cancelled | 2026-08-12 | reactive-fix:data-integrity |
| SD-LEO-INFRA-VENTURE-BURN-RLS-TENANT-PREDICATE-001 | security | completed | 2026-08-12 | reactive-fix:security-hardening |
| SD-LEO-INFRA-RECORD-VENTURE-ERROR-DEFINER-POSTURE-001 | bugfix | completed | 2026-08-12 | reactive-fix:security-hardening |
| SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001 | security | completed | 2026-08-12 | reactive-fix:security-hardening |
| SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 | infrastructure | completed | 2026-08-12 | serves-ratified-live-priority:chairman-commission |
| SD-LEO-FEAT-PROVEN-BETTER-NEW-001 | feature | completed | 2026-08-12 | serves-ratified-live-priority:venture-1-revenue-path |
| SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 | feature | completed | 2026-08-12 | serves-ratified-live-priority:venture-1-revenue-path |
| SD-LEO-INFRA-CHECKER-READBACK-WRITE-001 | infrastructure | completed | 2026-08-12 | reactive-fix:harness-hardening |
| SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001 | infrastructure | completed | 2026-08-13 | reactive-fix:coordination-infra |
| SD-FDBK-INFRA-MIGRATE-ANON-INGEST-001 | infrastructure | completed | 2026-08-13 | reactive-fix:security-hardening |
| SD-ALTIFYAI-FDBK-FIX-GENERIC-SECURITY-SUB-001 | bugfix | completed | 2026-08-13 | reactive-fix:gate-bug |
| SD-ALTIFYAI-FDBK-FIX-HANDOFF-ENTRY-POINT-001 | bugfix | completed | 2026-08-13 | reactive-fix:harness-hardening |
| SD-ALTIFYAI-FDBK-FIX-HOUSEKEEPING-WEEKLY-REPORT-001 | bugfix | completed | 2026-08-14 | reactive-fix:ci-ops |
| SD-LEO-INFRA-CHAIRMAN-APPLY-CEREMONY-001 | infrastructure | completed | 2026-08-15 | serves-ratified-live-priority:chairman-commission |
| SD-LEO-FIX-PROGRAMMATIC-LOCAL-LLM-001 | bugfix | completed | 2026-08-16 | reactive-fix:gate-bug |
| SD-LEO-FIX-BELT-CAPACITY-VERDICTS-001 | bugfix | completed | 2026-08-16 | reactive-fix:harness-observability |
| SD-LEO-ENH-ORPHAN-FAILURE-CONFIG-001 | feature | completed | 2026-08-16 | reactive-fix:harness-hardening |
| SD-LEO-FIX-QUIET-HOURS-GATE-001 | bugfix | completed | 2026-08-17 | serves-ratified-live-priority:chairman-commission |
| SD-FDBK-FIX-CRITICAL-PUBLIC-FEEDBACK-001 | bugfix | completed | 2026-08-17 | reactive-fix:incident |
| SD-FDBK-FIX-APEXNICHE-FEEDBACK-DEDUP-001 | bugfix | cancelled | 2026-08-17 | reactive-fix:incident |
| SD-LEO-FIX-ALTIFYAI-LIVE-SITE-001 | bugfix | completed | 2026-08-17 | serves-ratified-live-priority:venture-1-revenue-path |
| SD-LEO-FIX-ALTIFYAI-WIRE-CLERK-001 | bugfix | completed | 2026-08-17 | serves-ratified-live-priority:venture-1-revenue-path |
| SD-FDBK-FIX-VENTURE-CRACK-GATE-001 | bugfix | completed | 2026-08-17 | serves-ratified-live-priority:crack-gate |
| SD-FDBK-FIX-EHG-ERRORCAPTUREPROVIDER-SENDS-001 | security | completed | 2026-08-17 | reactive-fix:security-hardening |
| SD-MAN-INFRA-VENTURE-CRACK-GATE-001 | infrastructure | completed | 2026-08-18 | serves-ratified-live-priority:crack-gate |
| SD-FDBK-FIX-EXIT-GATE-CONFORMANCE-001 | bugfix | completed | 2026-08-18 | reactive-fix:gate-bug |
| SD-FDBK-FIX-SECURITY-ISUNTRUSTEDORIGIN-OMITS-001 | security | completed | 2026-08-18 | reactive-fix:security-hardening |
| SD-FDBK-ENH-AUTO-APPLY-MIGRATION-001 | infrastructure | completed | 2026-08-18 | reactive-fix:gate-bug |
| SD-LEO-GEN-SECURITY-TELEGRAM-BOT-001 | security | completed | 2026-08-18 | reactive-fix:security-hardening |
| SD-MAN-INFRA-COMPLETION-PROBES-CROSS-001 | infrastructure | completed | 2026-08-18 | reactive-fix:gate-bug |
| SD-LEO-INFRA-ARM-BINDING-EXIT-001 | infrastructure | completed | 2026-08-18 | reactive-fix:gate-bug |
| SD-LEO-INFRA-SHIP-PREFLIGHT-REPORTS-001 | infrastructure | completed | 2026-08-18 | reactive-fix:gate-bug |
| SD-LEO-FIX-REVIEW-GATE-POLARITY-001 | bugfix | completed | 2026-08-18 | reactive-fix:gate-bug |
| SD-LEO-INFRA-CLOSE-REMAINING-CROSS-001 | orchestrator | completed | 2026-08-18 | reactive-fix:gate-bug |
| SD-LEO-INFRA-ANON-TRUNCATE-SWEEP-001 | infrastructure | pending_approval | 2026-08-18 | reactive-fix:security-hardening |
| SD-FDBK-ENH-ROUTING-RECOMMENDATION-SURFACES-001 | feature | active | 2026-08-19 | reactive-fix:gate-bug |
| SD-FDBK-ENH-LEO-ASSIST-PHASE-001 | infrastructure | completed | 2026-08-19 | reactive-fix:harness-hardening |
| SD-FDBK-ENH-RETRO-SUB-AGENT-001 | infrastructure | completed | 2026-08-19 | reactive-fix:gate-bug |
| SD-FDBK-ENH-VITEST-PROJECT-237-001 | feature | active | 2026-08-19 | reactive-fix:ci-ops |
| SD-FDBK-ENH-DELETION-SAFEGUARD-CLI-001 | feature | cancelled | 2026-08-19 | reactive-fix:gate-bug |
| SD-LEO-INFRA-REVOKE-DEFAULT-PUBLIC-001 | security | draft | 2026-08-19 | reactive-fix:security-hardening |

---
Generated by `scripts/one-off/_qf459-roadmap-link-exception-classify-119.mjs`, which also stamped
`drift_classification` onto each row above. Verification pass: Solomon plan-alignment review #5,
2026-08-19 08:00Z.
