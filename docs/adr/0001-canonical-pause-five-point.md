<!-- POCOCK-ADR-RPC-SIGNED: f11d7436f85ab2367a3d281b52e3c773669617db6686f84966d3a55a4129551c -->

# ADR-0001: Canonical Pause is a five-point set

LEO sessions pause work only for one of five enumerated reasons: orchestrator completion (chaining off), blocking error requiring human decision, test failures after 2 retry attempts, all children blocked, or critical security or data-loss scenario. Any other rationale for pausing is a protocol violation. Implemented at CLAUDE.md "Canonical Pause Points" section; enforced by AUTO-PROCEED mode default.

---
Status: accepted
Accepted at: 2026-05-14T16:29:02.484557+00:00
Approved by: chairman-backfill-2026-05-14
