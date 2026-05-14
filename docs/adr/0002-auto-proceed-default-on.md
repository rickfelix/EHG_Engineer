<!-- POCOCK-ADR-RPC-SIGNED: 3046e2cff9b530a4c89e847c5be357641dfefbb7f42b243c748c7d118ada7bc8 -->

# ADR-0002: AUTO-PROCEED is ON by default

Phase transitions, PRD creation, child decomposition, refactors, and scope-lock boundaries proceed automatically without per-step user confirmation. The user delegates per-step approval by approving the SD at LEAD. Pauses occur only at the five canonical pause points. Rationale: confirmation-fishing is the most common AUTO-PROCEED failure mode in Opus 4.7 sessions.

---
Status: accepted
Accepted at: 2026-05-14T16:29:02.484557+00:00
Approved by: chairman-backfill-2026-05-14
