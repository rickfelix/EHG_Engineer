# Harness Backlog

**Purpose**: One-line deferred captures of harness-level bugs found during `[MODE: product]` sessions.

During product work, do NOT file SDs/QFs for harness issues (LEO-INFRA, gate bugs, session lifecycle drift, tooling gaps). Append them here and keep shipping product. A follow-up `[MODE: campaign]` session processes this backlog: triages, groups, and files the necessary `SD-LEO-INFRA-*` / `SD-LEARN-FIX-*` / `SD-MAN-INFRA-*` / `QF-*` against the real recurrence signal.

See CLAUDE.md → Session Mode Declaration for the full rule.

## Format

One line per item. Date, symptom, file or command where it surfaced, SD/QF from which session it was deferred.

```
2026-MM-DD | <symptom> | <file or command> | deferred from SD-...
```

## Items

<!-- Append below. Do not edit or remove existing lines — they are the signal for the next campaign session. -->
