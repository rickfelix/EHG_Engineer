<!-- POCOCK-ADR-RPC-SIGNED: bda7ac2f8511ac8df0b589c662e4e6a9cf26abda644cbf23fcd0496e4076eb3d -->

# ADR-0009: Lineage fix is prerequisite to deeper instrumentation

61% of SDs lack parent_sd_id lineage per 2026-05-14 brainstorm audit. Instrumentation built on top of broken lineage produces phantom relationships. Child 0 lineage shadow-write is the prerequisite for any orchestrator-level analytics. Source: brainstorm session a6b92936.

---
Status: accepted
Accepted at: 2026-05-14T16:29:02.484557+00:00
Approved by: chairman-backfill-2026-05-14
