---
category: architecture
status: approved
version: 1.0.0
author: SD-LEO-INFRA-COVERAGE-MATRIX-SURFACE-001
last_updated: 2026-07-04
tags: [coverage-matrix, reward-spine, referent-audit, governance]
---

# Coverage Matrix x Reward Spine — Audit Cadence Fold-In (Spec-Level Only)

**SD:** SD-LEO-INFRA-COVERAGE-MATRIX-SURFACE-001, FR-7

Both `scripts/coverage-matrix-referent-audit.mjs` (this SD) and
SD-LEO-INFRA-REWARD-SPINE-ONE-001's periodic signal-audit share:

- A **monthly cadence** for their respective audits.
- The same anti-Goodhart principle: **closure by a different actor than the one being scored**
  — a sample-verification finding is surfaced as a question, not auto-resolved by the same job
  that raised it.

This is ONE audit institution with two objects (signals for reward-spine, coverage for this SD),
not two independent machineries that happen to look similar. There is deliberately **no runtime
coupling** between the two rotation scripts — each runs independently, on its own schedule, with
its own idempotency guard (`coverage_matrix_rotation_runs` here; reward-spine's own audit-run
table there). Building a shared audit-orchestration layer before either job has run in production
would be premature — this note exists so a future consumer finds the relationship documented
without introducing that coupling prematurely.
