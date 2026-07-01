# ADKAR change-adoption framework

**Status**: Framework definition (this doc) + shape module shipped by
`SD-LEO-INFRA-ADKAR-CHANGE-ADOPTION-FRAMEWORK-001-A`. The completion gate that enforces
this shape (`scripts/modules/handoff/executors/lead-final-approval/gates/adkar-adoption-gate.js`,
feature-flagged via `ENFORCE_ADKAR_GATE`, default off/warn-only) shipped by sibling child
`-B`. Pilot-tagging a real SD (`docs/protocol/adkar-pilot-worked-example.md`) shipped by
sibling child `-C`. This document does not itself gate anything.

## Why

A change flagged `metadata.requires_adoption = true` (a new tool, a protocol change, a
role-contract change, a new process) is only actually adopted once agents are
**aware** of it, **want** to follow it, **know how**, **can** use it, and the fleet
**keeps** using it. ADKAR (Prosci) names those five stages. This framework maps each
stage to the **agent** context — not human emotion — and, critically, does **not**
invent new machinery: every stage below cites a mechanism that already exists in this
codebase today. ADKAR formalizes and completes those pieces into an explicit
evidence-or-waived checklist; it does not replace them.

## The shape

`lib/governance/adkar-checklist.js` is the single source of truth for the checklist
shape. A `requires_adoption` SD carries `metadata.adkar_checklist`, an array of five
entries — one per stage, in this order:

```js
{
  stage: 'awareness' | 'desire' | 'knowledge' | 'ability' | 'reinforcement',
  evidence: { kind: string, ref: string } | null,
  waived: boolean,
  waived_reason: string | null,
}
```

An entry is valid iff it carries **either** real evidence (a non-empty `evidence.kind`)
**or** a waiver with a non-empty `waived_reason` — an empty waiver is not a waiver.

## The five stages

### Awareness — the change is surfaced to affected roles

**Evidence type**: a role-contract/CLAUDE update landed, or a `coordinator_reminder`
was dispatched to the affected live sessions.

**Existing mechanism reused**: `scripts/coordinator-hourly-review.cjs` already
dispatches `session_coordination` rows with `payload.kind = coordinator_reminder` on an
hourly cadence; these are consumed at `scripts/adam-advisory.cjs` and
`scripts/solomon-startup-check.mjs`. Awareness evidence for a `requires_adoption`
change is a reminder dispatched through this same channel — no new dispatch mechanism
is needed.

### Desire — the WHY is present so agents act on the rationale

**Evidence type**: the change artifact (CLAUDE.md section, PRD, role contract) contains
a `> Why:` line explaining the benefit, per the existing convention.

**Existing mechanism reused**: CLAUDE.md's pervasive `> Why:` rationale convention
(CONST-010: factual and non-manipulative — the rationale states a real cause/effect, it
does not persuade). Desire evidence is simply confirming the `> Why:` line exists on the
change artifact; ADKAR does not add a second explanation mechanism.

### Knowledge — the HOW is documented

**Evidence type**: a role-contract, CLAUDE file section, or protocol doc documents how
to actually perform the new behavior.

**Existing mechanism reused**: the same role-contract/CLAUDE-file documentation surface
already used for every other protocol convention in this codebase (see this very file
as an instance of that pattern).

### Ability — the change is wired in and verifiably usable

**Evidence type**: the *adoption-is-acceptance* gate — the standing routine that is
supposed to consume the change actually consumes it, verified by exercising the real
path (not a mock of the seam).

**Existing mechanism reused**: `scripts/modules/handoff/executors/lead-final-approval/gates/adkar-adoption-gate.js`
(sibling child `-B`) is the mechanism — it enforces this stage directly at
LEAD-FINAL-APPROVAL, and is the one stage most likely to require real evidence rather
than a waiver, since "wired in but unverified" is exactly the drift this framework exists
to catch.

### Reinforcement — the change sustains and regression-to-non-use is caught

**Evidence type**: a recurring, already-scheduled self-adherence check that would flag
if the fleet stopped following the change.

**Existing mechanism reused**: the three live self-adherence scripts —
`scripts/adam-self-adherence-review.mjs`, `scripts/coordinator-self-review.mjs`, and
`scripts/solomon-self-adherence-review.mjs` — already run on recurring cadences and are
the natural home for a new adoption's regression check. Reinforcement evidence for a
`requires_adoption` change points at (or extends) one of these three, not a new
standalone checker.

## Out of scope (this framework)

- Non-adoption changes (a pure bugfix has no adoption need — `requires_adoption` stays
  `false`/unset and the checklist is never evaluated).
- Heavy change-ceremony or human-org-change tooling — this is a lightweight,
  agent-context checklist, not a Prosci human-change program.

## Related

- `lib/governance/adkar-checklist.js` — the shape module (`ADKAR_STAGES`,
  `validateAdkarChecklist`, `isValidAdkarEntry`).
- `scripts/modules/handoff/executors/lead-final-approval/gates/adkar-adoption-gate.js`
  — the LEAD-FINAL-APPROVAL completion gate (sibling child `-B`), feature-flagged via
  `ENFORCE_ADKAR_GATE` (default off/warn-only), mirroring the structural template of
  `learning-or-bypass-resolved-gate.js` (evidence-or-resolved-bypass, central `gates.js`
  registration).
- `docs/protocol/adkar-pilot-worked-example.md` — the first `requires_adoption`-tagged
  pilot mapping (sibling child `-C`), applied to
  `SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001`.
