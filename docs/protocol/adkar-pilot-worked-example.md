# ADKAR Worked Example — Adam PM-Tools Pilot

**SD:** SD-LEO-INFRA-ADKAR-CHANGE-ADOPTION-FRAMEWORK-001-C

Companion to the ADKAR change-adoption framework (SD-LEO-INFRA-ADKAR-CHANGE-ADOPTION-FRAMEWORK-001,
child A — `docs/protocol/adkar-change-adoption-framework.md`). Kept as a separate file rather than
appended to that doc, since Child A and Child C build concurrently on independent sessions and a
shared target file would create an avoidable merge conflict.

## The pilot

`SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001` (chairman-directed) was designated the
first `requires_adoption`-tagged SD at sourcing time. It is a parent orchestrator decomposed into 3
children:

- **-A**: hierarchical `adam_task_ledger` (parent_id + status/blocker rollup) + CRUD + rehydration
  module + `/adam` startup rehydrate hook.
- **-B**: board↔reality reconcile in the Adam tick, stall-alert escalation, chairman-curated view,
  `ADAM_LOOPS` entry + `CLAUDE_ADAM.md` durable-duty marker + RESPONSIBILITIES landing.
- **-C**: `probePmBoard` self-adherence probe (`lib/adam/adherence-probes.js`) — FAILs on
  regression-to-non-use (board stale / open threads not progressing), enforcing adoption-is-acceptance.

## The mapping

| ADKAR stage | Evidence | Citation |
|---|---|---|
| Awareness | evidenced | -B's role-contract + `ADAM_LOOPS` wiring surfaces the change to affected live sessions |
| Desire | evidenced | The pilot SD's own rationale (`key_risk` + `adam_stall_alert` metadata) documents the why/benefit |
| Knowledge | evidenced | -B's `CLAUDE_ADAM.md` durable-duty marker + RESPONSIBILITIES landing documents the how |
| Ability | evidenced | -A's task-ledger + CRUD + rehydration makes the board actually usable/consumed |
| Reinforcement | evidenced | -C's self-adherence probe catches regression-to-non-use |

This mapping was applied to the pilot SD's `strategic_directives_v2.metadata` as
`requires_adoption: true` + `adkar_checklist: {...}` (see SD-LEO-INFRA-ADKAR-CHANGE-ADOPTION-FRAMEWORK-001-C
FR-1), via an additive-only update verified by before/after diff — no other metadata field on the
live pilot SD was touched. `tests/unit/adkar-pilot-evidence-fixture.test.js` proves this exact mapping
satisfies the documented ADKAR completion contract using a fixture, independent of the pilot's own
completion timing (which is owned by another session and outside this SD's control).

## Why the pilot itself, not just its children

The pilot's -A/-B/-C children were scoped and named *before* the ADKAR framework existed — they were
not built "for" ADKAR. The point of this worked example is exactly that: ADKAR formalizes work LEO
was already doing implicitly (durable rehydration = Ability, self-adherence probes = Reinforcement),
rather than demanding new adoption ceremony bolted onto every change.
