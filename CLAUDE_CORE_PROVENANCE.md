<!-- file_content_hash: fada880d03b3069a -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_CORE_PROVENANCE.md — Core Provenance (dated rationale)

**Generated**: 2026-09-12 12:14:29 AM
**Protocol**: LEO 4.4.1
**Purpose**: Why each CORE rule exists — the incident narratives and measurements behind the always-read rules
**Load when**: When you need to know WHY a rule exists, or before proposing to change one

> Every rule in CLAUDE_CORE.md is IN FORCE regardless of whether its history is read here. This file explains; it does not govern.

---

## Core Provenance — dated rationale (companion)

The incident narratives and measurements behind the always-read CORE rules. Every rule in CLAUDE_CORE.md is in force regardless of whether its history is read here; this file explains, it does not govern.

---

### G3 definition-of-done amendment — the problem it closes (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-3/FR-4 carve)

**The problem this closes**: SDs/QFs whose deliverable is event-processing machinery (a worker, watcher, router, gate, cron, or hook) have repeatedly reached "completed" status while the machinery never processed a single real production event — cold-recovery never wired, a quarantined test, dormant verifiers, an eva-scheduler watcher dead 13 days, a frozen capture gauge, a remediation router with writers never injected at the call site. Each was individually root-caused; this amendment closes the shared root: the protocol's own Definition-of-Done never asked "did it run?"


---

*Generated from database: 2026-09-12*
*Protocol Version: 4.4.1*
*Source of truth: leo_protocol_sections (section_type=core_provenance). Do not hand-edit — edit the DB section and regenerate.*
