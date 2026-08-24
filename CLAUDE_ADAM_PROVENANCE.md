<!-- file_content_hash: 8fdda65904e7bcad -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_ADAM_PROVENANCE.md — Adam Provenance (dated rationale)

**Generated**: 2026-08-24 4:38:44 AM
**Protocol**: LEO 4.4.1
**Purpose**: Why each clause exists — dated chairman verbals, live witnesses, superseded cadences
**Load when**: When you need to know WHY a rule exists, or before proposing to change one

> Every rule in CLAUDE_ADAM.md is IN FORCE regardless of whether its history is read here. This file explains; it does not govern.

---

## Adam Provenance — dated rationale and live witnesses (companion)

# CLAUDE_ADAM_PROVENANCE.md — why the rules exist

**Purpose**: Dated provenance for the Adam role contract — live witnesses, chairman verbals, and
the incidents that produced each clause.
**Load when**: Auditing WHY a rule exists, or before proposing to change one. Never required to
FOLLOW a rule.

> **Every rule in `CLAUDE_ADAM.md` is in force regardless of whether its history is recorded here.**
> This file explains; it does not govern. An absent entry is a gap in this record, never evidence
> that a rule is inactive.

## COVERAGE — READ THIS BEFORE TRUSTING AN ABSENCE

This file is **PARTIAL and mechanically derived**. The preserved original carries **81** inline
dated provenance references; only **10** could be extracted as rule-to-reason pairs, plus **4**
dated blocks. The remainder are bound to their rule by POSITION IN PROSE rather than structure —
an extracted `(chairman verbal 2026-07-17)` with no rule attached explains nothing — so they
require per-rule authoring and are NOT yet here.

Do not read a missing entry as "this rule has no provenance". Coverage is roughly 12%.

---

## Rule → why it exists

- **Proactivity is PROPOSE, not auto-execute (operator-canonical 2026-06-08)** — (operator-canonical 2026-06-08)
- **Standing assignment — GOVERNANCE & OVERSIGHT over Solomon (chairman-directed 2026-07-17)** — (chairman-directed 2026-07-17)
- **D4 — verify_before_certainty** — (chairman, 2026-07-27)
- **Plan first, gauges second** — (Solomon-calibrated 2026-07-17, ref be825042: default N=80 cohort / 4-day backstop / day-close trigger / cycle-2 recalibration rule; anchor unit stays the roadmap anchor, cohort defines only the window; prediction source = union of forward-list snapshots in the window)
- **2026-06-11 (handoff-drill fixes — durable encoding of session-fragile duties)** — (confirmed by the 2026-06-11 handoff drill)
- **2026-06-11 (handoff-drill fixes — durable encoding of session-fragile duties)** — (the ratified retry->auto-default clock, quiet-hours-paused)
- **2026-06-11 (handoff-drill fixes — durable encoding of session-fragile duties)** — (Adam-armed 2026-07-21)
- **ADAM DECIDES + INFORMS (does NOT ask):** — (e.g. threading a ratified autonomy level into the factory-read field)
- **Solomon (live, 2026-07-12):** — (the exact class that cost 9h of invisibility, 2026-07-04)
- **MECHANICS (what makes it survive sessions)** — (roadmap_waves + roadmap_wave_items, the ratified plan of record)

---

## Dated change log (verbatim from the preserved original)

**2026-06-08**: Added the "Proactivity is PROPOSE, not auto-execute" clause (SD-LEO-INFRA-CODIFY-ADAM-PROACTIVE-001). Chairman-canonical: when idle Adam presents options to the active coordinator and lets the coordinator decide; Adam never autonomously *begins* self-generated proactive work (sourcing/filing SDs, launching investigations, building) without the coordinator's go. Surfacing findings/canary/options is always in-bounds.

**2026-06-08**: Added the tri-party self-assessment RUBRIC + the NON-OPTIONAL grade→action→verify improvement LOOP + the role-model correction (Adam = coordinator's assistant, not chairman's chief-of-staff) (SD-LEO-INFRA-CANONICALIZE-TRI-PARTY-001). The coordinator's parallel rubric+loop lives in coordinator.md. Runtime feed into coordinator-self-review.mjs (cadence + bidirectional emit/consume) is a tracked follow-up gated by ADAM_SELF_SCORE_CADENCE / COORD_ADAM_REVIEW_V1.

**2026-06-09**: Reconciled the self-assessment rubric from 5 descriptive dimensions to the canonical 8 (D1_proactive_sourcing..D8_interface_clarity) matching the live `feedback` cat=`adam_self_assessment` rows, added the surfaced→accepted/graduated signal under D1, and authored the "Governance heartbeat (proactive multi-scope scan loop)" subsection behind flag `ADAM_GOVERNANCE_HEARTBEAT_V1` (authored default OFF — contract-only, no runtime behavior; flag later ENABLED 2026-06-11 via SD-LEO-INFRA-ENABLE-ADAM-GOVERNANCE-001) (SD-LEO-INFRA-ADAM-GOVERNANCE-HEARTBEAT-001).

**2026-06-10**: Chairman-canonical operating doctrine (landed from live session b68012b1; chairman verbal directives 2026-06-10): - **NEVER HOLD SOURCING (chairman override)**: Adam sources CONTINUOUSLY — raw backlog is groomed into verified, deduped, claimable DRAFT SDs/QFs as it arrives, regardless of queue depth. (This is the EXEMPTION cross-referenced in the *Proactivity is PROPOSE* clause above: sourcing/filing DRAFT SDs is never coordinator-GO-gated; only claim/build/worktree/dispatch is.) A deep claimable belt is the INTENDED state, not a fault; dispatch pacing is the coordinator's lever, supply throttling is not. A coordinator hold-sourcing directive is answered by relaying the chairman's standing override, not by compliance. (Chairman, overriding a live coordinator hold: 'keep identifying work and just keep putting it out there… Whether or not the coordinator decides to issue those to the workers is on the coordinator.') - **FULL-INBOX POLLING (D6 duty sharpened)**: Adam's inbound duty covers EVERY coordinator/chairman-directed session_coordination row WHERE acknowledged_at IS NULL — not only payload.kind=coordinator_reply. The reply-only reader (adam-advisory.cjs replies) is a known blindspot that twice hid chairman/coordinator directives on 2026-06-10 (fix tracked as QF-20260610-623); until it ships, poll the full lane every tick. - **ACCEPTANCE-SITTING OWNERSHIP**: when the chairman delegates acceptance sittings, Adam owns them end-to-end: decision packets prepared >=24h ahead (plain language, default recommendation per item), readiness-gate verification at T-24h, reminders via every live channel (advisory roll-up + exec-email NEEDS-YOU) the day before and morning of, a reschedule proposal BEFORE the sitting if any gate will miss (never run a no-op sitting), and durable outcome recording (decision artifacts on the acceptance rows) with a post-sitting confirmation of what was decided and what unlocked.



---

*Generated from database: 2026-08-24*
*Protocol Version: 4.4.1*
*Source of truth: leo_protocol_sections (section_type=adam_provenance). Do not hand-edit — edit the DB section and regenerate.*
