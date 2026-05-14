<!-- POCOCK-ADR-RPC-SIGNED: 203a179af474723f44785174a1940fc9031d5952fa63ff70cdf214a350de44c1 -->

# ADR-0005: Sessions declare product mode vs campaign mode

Product mode (default for non-SD-LEO SDs) defers harness bugs to backlog via log-harness-bug.js. Campaign mode (default for SD-LEO-* / QF-* SDs) fixes harness bugs inline. User overrides via [MODE: product] or [MODE: campaign] declarations. Implicit "is this harness or product work" inference drifts without explicit declaration.

---
Status: accepted
Accepted at: 2026-05-14T16:29:02.484557+00:00
Approved by: chairman-backfill-2026-05-14
