<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/_rank5_addprd_plan.md -->
<!-- SD Key: SD-LEO-INFRA-HARDEN-ADD-PRD-001 -->
<!-- Archived at: 2026-06-09T17:20:12.336Z -->

# Plan: Harden add-prd-to-database CLI — recurse content-shape check into system_architecture.components and make stdout EPIPE-safe on pipe-close

## Type
infrastructure

## Priority
medium

## Summary
The add-prd-to-database CLI (the most-used PRD-creation script) has two live, net-new robustness defects that cause cryptic crashes for workers. Both were confirmed empirically by an Adam verify pass.

## Scope
(1) Content-shape check does not recurse into system_architecture.components. validateContentPayloadShape (scripts/add-prd-to-database.js ~L126-180) asserts system_architecture is an object but never checks .components, so a string value passes the pre-check (SHAPE-CHECK-PASSED) and then crashes downstream at scripts/prd/formatters.js:193-199 (arch.components.forEach is not a function). Fix: extend the shape check to assert system_architecture.components is an array when present, and harden formatters.js to coerce/guard. Extends QF-20260526-436.
(2) No EPIPE-safe stdout handling. There is no EPIPE/SIGPIPE/process.stdout 'error' handler anywhere in add-prd-to-database.js or scripts/prd/*. Real runs emit ~180KB of stdout before the async DB insert (measured 187KB vs a ~64KB pipe buffer), so piping the command through `head` closes the read end and the next console.log raises an unhandled stdout 'error' (EPIPE) that crashes the process BEFORE persistence on POSIX/CI (Windows git-bash masks it). Fix: add an EPIPE-tolerant stdout error guard near the CLI entry.
Scope is CLI/formatter robustness only — no auth, schema, or migration surface.

## Source
Adam groom + verify (workflows wf_6d502ac4, wf_c6d577ae); coordinator-approved belt item shortlist 6e715a19 rank 5 (narrowed from 4 to the 2 reproducing defects). Dedup clean: SD-FDBK-INFRA-ADD-PRD-DATABASE-001, SD-FDBK-ENH-SCRIPTS-ADD-PRD-001, QF-20260526-436 all completed; no open add-prd robustness SD.

## Risks
- formatters.js hardening must not change valid-payload output (regression-test the happy path).
- An EPIPE guard must swallow only stdout pipe-close errors, not mask real write failures.
- This script is on the critical PRD-creation path used by every SD; the fix must be behavior-preserving for well-formed input.
