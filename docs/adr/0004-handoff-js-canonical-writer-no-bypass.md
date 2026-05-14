<!-- POCOCK-ADR-RPC-SIGNED: 4c660d51add2ae00215ec374df9b90a1df6e2605f865545e027849fb54a04414 -->

# ADR-0004: handoff.js is the canonical writer for phase transitions

All LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD, and LEAD-FINAL-APPROVAL transitions go through scripts/handoff.js execute. Direct INSERTs into sd_phase_handoffs are prohibited. Bypasses via --bypass-validation --bypass-reason are rate-limited (3 per SD, 10 per day) and logged to audit_log.

---
Status: accepted
Accepted at: 2026-05-14T16:29:02.484557+00:00
Approved by: chairman-backfill-2026-05-14
