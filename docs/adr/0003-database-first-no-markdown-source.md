<!-- POCOCK-ADR-RPC-SIGNED: 5a127962e56940ad8571a83af991313cb0339d91a8db96481fdc78880dccfd82 -->

# ADR-0003: Database is the single source of truth (no markdown source-of-truth)

Strategic Directives, PRDs, retrospectives, and handoffs live in strategic_directives_v2, product_requirements_v2, retrospectives, and sd_phase_handoffs respectively. Markdown files drift silently and cannot be queried by the gate pipeline. Schema constraints and state transitions are enforceable only at the database layer.

---
Status: accepted
Accepted at: 2026-05-14T16:29:02.484557+00:00
Approved by: chairman-backfill-2026-05-14
