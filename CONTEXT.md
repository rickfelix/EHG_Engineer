<!-- POCOCK-RPC-SIGNED: 0000000000000000000000000000000000000000000000000000000000000000 -->
<!--
  CONTEXT.md — LEO Protocol glossary (Pocock format)

  This file is the canonical glossary for LEO Protocol terminology on EHG_Engineer.
  It is RENDERED from the pocock_glossary_terms table (status='approved' rows) by
  the CONTEXT.md regenerator. Do NOT edit manually — the .githooks/commit-msg hook
  rejects commits to this file that lack a fresh RPC-generated signed marker.

  To add a term:
    1. Term enters as 'draft' via scripts/pocock/auto-promote-glossary-term.mjs OR
       direct INSERT into pocock_glossary_terms.
    2. Chairman flips draft → approved via promote_glossary_term(uuid, text) RPC.
    3. CONTEXT.md regenerator (runs on every RPC approval) re-renders this file
       with the updated POCOCK-RPC-SIGNED marker and commits via service account.

  Format (Pocock-style, glossary-only, no implementation details):
    - Each entry is an H2 header (## Term Name)
    - Body is <=10 lines of plain prose defining the term
    - Optional Avoid line listing aliases to consolidate
    - Optional Related line listing related terms (cross-references)

  Source: VISION-LEO-POCOCK-PATTERNS-L2-001, ARCH-LEO-POCOCK-PATTERNS-001,
          SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-A (Child A).
-->

# CONTEXT — LEO Protocol Glossary

This is the canonical glossary for LEO Protocol terminology on EHG_Engineer.
Terms are organized alphabetically. Each entry is short by design — definitions,
not explanations. For mechanism and rationale, see the linked specs.

## /leo assist

A slash command for autonomous inbox processing. Reads open feedback rows,
classifies severity, and either implements a quick fix inline or files a new SD.
Used as fall-through when /leo next finds no claim-able SD.

## /leo next

A slash command that shows the current SD queue with three parallel tracks
(Infrastructure, Features, Quality) and recommends a starting point per track.
Sessions invoke this to pick the next workable SD.

## AI-provenance

A source field on canonical LEO writers (handoff bodies, retro bodies, gate
verdict reasoning, feedback comments) marking AI-generated content. Format:
`agent:seat:round` or `human:user`. Gated by `LEO_AI_PROVENANCE_ENABLED` flag,
default off in v1.

## AUTO-PROCEED

Default-on session mode that lets phase transitions execute without user
confirmation. The user delegates per-step approval by approving the SD at LEAD.
Pauses only at the five canonical pause points (orchestrator completion when
chaining is off, blocking errors, exhausted retries, all-blocked, security risk).

Avoid: auto-proceed mode, AP mode

## bypass verb

A class of CLI flags or env vars that intentionally bypass a gate or check
(e.g., `--bypass-validation`, `--no-verify`, `EMERGENCY_PUSH`). Rate-limited
(3 per SD, 10 per day globally) and logged to `audit_log` so misuse is observable.

Avoid: bypass flag

## campaign mode

Session mode declared by the user (or inferred from SD-LEO-* / QF-* SD keys) in
which harness bugs are themselves the work — fix inline, file SDs as they surface.
Opposite of product mode.

Related: product mode, mode declaration

## canonical pause

One of the five enumerated reasons to stop work mid-session: orchestrator done
(chaining off), blocking error needing human decision, test failures after 2
retries, all children blocked, security or data-loss risk. Pausing for any
other reason is a protocol violation.

## canonical writer

A script or RPC that holds exclusive write authority for a database table or
artifact. Examples: `handoff.js` for `sd_phase_handoffs`, `add-prd-to-database.js`
for `product_requirements_v2`, `promote_glossary_term` for `pocock_glossary_terms`.
Direct DB inserts bypass the writer's gates and are forbidden.

## claim

A session's exclusive lock on an SD, recorded in `strategic_directives_v2.claiming_session_id`
and `active_session_id`. A claim is "active" if the session's heartbeat is <5 min old.
Release requires the owning session's consent unless the claim is stale (>10 min).

## handoff

The atomic phase-transition record between LEO agents (LEAD-TO-PLAN, PLAN-TO-EXEC,
EXEC-TO-PLAN, PLAN-TO-LEAD, LEAD-FINAL-APPROVAL). Written by `handoff.js`, stored
in `sd_phase_handoffs`. Each handoff runs a gate pipeline that scores 0-100; the
pass threshold varies by SD type.

## sub-agent

A specialized LEO agent invoked via the Task tool with a `subagent_type` parameter
(database-agent, testing-agent, validation-agent, etc.). Sub-agents write formal
evidence rows to `sub_agent_execution_results`; handoff gates query this table
to confirm the required agents ran.

## DUAL-SCAN trigger

A handoff-gate scanner that runs two independent pattern checks (Lane 1 and Lane 2)
and proceeds only if both agree, or escalates if one finds risk the other missed.
Used in activation-invariant gates to catch GVOS-S17 shape variants that lack a
`type` field.

## gate

A scored validation step inside a handoff. Each gate returns 0-100; weighted gate
scores produce the overall handoff score. SD-type-specific thresholds determine
pass/fail (60-90% range; 85% default for feature/bugfix).

## retrospective

A post-completion artifact stored in the `retrospectives` table that captures
what changed, what worked, what didn't, and pattern candidates. Required at
LEAD-FINAL-APPROVAL for most SD types. Quality-scored 0-100 by a Russian Judge
rubric.

## stale-resolver-branch

A worker branch left lingering on disk after its SD merged. Resolver scripts that
walk `git log` from stale branches see merged work as "missing" and produce false
"orphan" classifications. Mitigation: scan against `origin/main` not local refs.

## writer-consumer asymmetry

The defect class where a writer emits data (DB column, file artifact, audit row)
but no consumer reads it at runtime. Symptoms: dashboards show empty fields,
gates pass on absent evidence, "built but never wired." Tracked as
PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 with 32+ witnesses across LEO.

Avoid: WC asymmetry, writer/consumer mismatch
Related: built-but-not-wired, dark data

# Not Yet Witnessed in LEO

The terms below are Pocock-imported and not yet observed in LEO runtime traces.
They are quarantined here to preserve the import without polluting the canonical
glossary with prescriptive vocabulary. The auto-promote pipeline will surface
each term to the canonical section once LEO accumulates >=3 organic witnesses
in a 7-day rolling window.

## adapter

(Quarantined.) A boundary module that translates between two interfaces. Pocock
uses "one adapter = hypothetical seam, two adapters = real seam" as a refactor
heuristic. LEO has no current adapter-count instrumentation.

## advisory verdict

(Quarantined.) A verdict label intended to signal a sub-agent's finding is
advice rather than a blocking gate result. Pending LEO consumer.

## AI-provenance

See canonical section above (witnessed in 2026-05-14 vision/arch plans).

## cascade trigger

(Quarantined.) A Postgres trigger that propagates upstream change downstream
(e.g., vision version bump flags all linked architecture plans). LEO has the
mechanism (`cascade_invalidation_engine`) but the term itself isn't in active
vocabulary yet.

## campaign mode

See canonical section above.

## deletion test

(Quarantined.) Pocock's refactor scoring: imagine deleting this module — does
complexity vanish, or concentrate across N callers? High-N indicates the module
is load-bearing and should be deepened; low-N indicates the module is shallow
and can be removed. To be implemented in Child D's weekly-deepening-report.

## deep module

(Quarantined.) Ousterhout/Pocock term for a module with rich behavior behind a
narrow interface. Opposite of shallow module.

Related: shallow module

## god orchestrator

(Quarantined.) An orchestrator SD that accretes too many children across too
many phases, losing the "thin coordinator" design intent. No current LEO witness.

## leverage

(Quarantined.) Pocock refactor heuristic: maximize work-per-line. A function
called from 50 sites has higher leverage than one called from 2.

## lineage gap

(Quarantined.) An SD whose `parent_sd_id` is missing despite the SD having
been created as a child. 61% of SDs lacked lineage per 2026-05-14 brainstorm.

## locality

(Quarantined.) Code organization principle: things that change together should
live together. Used in module-boundary refactor decisions.

## mode declaration

See campaign mode / product mode (canonical above).

## phantom completion

(Quarantined.) An SD shown as `status=completed` in the queue but with implementation
not actually merged. Caught by the activation-invariant gate.

## product mode

(Quarantined.) Counterpart to campaign mode. Sessions shipping product work,
not harness fixes. SD-LEO-* / QF-* keys imply campaign; everything else implies
product unless declared.

Related: campaign mode

## scope completion

(Quarantined.) The condition where every deliverable named in an SD's
`sd_scope_deliverables` exists in the merged code. Tracked by the
scope-completion-chain audit view.

## seam

(Quarantined.) A point in a system where you can replace one implementation with
another without changing callers. Pocock distinguishes hypothetical seams (one
adapter, design-time) from real seams (two adapters, runtime-proven).

## shallow module

(Quarantined.) A module with a wide interface and thin behavior — the inverse
of a deep module. Often a code-smell signal.

Related: deep module
