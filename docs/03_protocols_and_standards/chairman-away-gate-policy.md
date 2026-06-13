# Chairman-Away Gate Policy (DRAFT — for chairman ratification)

**SD:** SD-LEO-INFRA-SOLO-OPERATOR-CONTINUITY-001 · **Exit criterion:** roadmap X4 (KR-2026-07-03)
**Status:** DRAFT proposal. This document does **not** delegate chairman authority to any agent
(no-auto-override doctrine, sitting #1 item 2). It pre-registers, for each chairman gate, what the
fleet does **when the one human is unavailable** — either a pre-agreed **safe standing default**
(an inaction that cannot harm) or **hold-and-surface** (freeze the item, queue a decision, never
auto-decide). Nothing here lets an agent cast the chairman's vote.

---

## Gate inventory (live-true, with the count ambiguity noted)

The roadmap/SD phrase "the **11** KILL/PROMOTION gates", but the *live code*
(`lib/agents/modules/venture-state-machine/stage-gates.js`) defines **7** venture gates, and
`docs/strategy/EHG-VISION.md` targets a future **5** surviving gates. This policy covers the
**current-in-code** inventory (the live-true set) plus the one LEO-protocol chairman gate, and
notes the vision target as future-state. (Ambiguity raised as `prd-ambiguous` 9d4d8351; this doc
proceeds on the live-true set so the away-behavior is defined for what actually exists today.)

| # | Gate | Stage(s) | Type | Live source |
|---|------|----------|------|-------------|
| 1 | Kill checkpoint — early viability | S3 | KILL | `KILL_GATE_STAGES` |
| 2 | Kill checkpoint — problem/solution | S5 | KILL (advisory) | `KILL_GATE_STAGES` + `ADVISORY_GATE_STAGES` |
| 3 | Kill checkpoint — mid-build | S13 | KILL (advisory) | `KILL_GATE_STAGES` + `ADVISORY_GATE_STAGES` |
| 4 | Kill checkpoint — pre-launch | S24 | KILL | `KILL_GATE_STAGES` |
| 5 | Promotion — pre-scale | S17 | PROMOTION | `PROMOTION_GATE_STAGES` |
| 6 | Promotion — scale commit | S18 | PROMOTION | `PROMOTION_GATE_STAGES` |
| 7 | Promotion — launch advance | S23 | PROMOTION | `PROMOTION_GATE_STAGES` |
| 8 | LEO LEAD-FINAL chairman approval | — | PROMOTION (SD ship) | `handoff.js` LEAD-FINAL-APPROVAL |

> Future-state (EHG-VISION "11→5"): the surviving 5 = S3/S5/S23 KILL + S10/S25 PROMOTION. When the
> code converges on that set, update this table; the away-policy *principles* below are stable.

---

## The away-policy principle

For every gate, the away-behavior is exactly one of:

- **SAFE STANDING DEFAULT** — a pre-agreed inaction that cannot cause harm or an irreversible loss.
  Used only when *not acting* is strictly safe (the venture/SD simply waits, nothing is lost).
- **HOLD-AND-SURFACE** — freeze the item in place, write a `chairman_decisions` queue row, and
  surface it (coordinator → chairman channel). Never auto-decide. Used whenever the gate's decision
  is irreversible, resource-committing, or a non-delegable signature.

**Default-to-hold rule:** if a gate is not explicitly classified SAFE-DEFAULT below, it is
HOLD-AND-SURFACE. Ambiguity always resolves to hold (the conservative, reversible choice).

---

## Per-gate away-policy

| Gate | Away-behavior | Rationale |
|------|---------------|-----------|
| **S3 KILL** | **SAFE DEFAULT: do NOT auto-kill; hold the venture at S3.** | Killing is irreversible; *not* killing is safe (the venture simply waits). No auto-kill while the chairman is away. |
| **S5 KILL (advisory)** | **SAFE DEFAULT: do not auto-kill; record advisory; hold.** | Advisory gate — already non-binding; the advisory signal is captured for the chairman's return. |
| **S13 KILL (advisory)** | **SAFE DEFAULT: do not auto-kill; record advisory; hold.** | As S5. Mid-build kill is high-judgment and irreversible. |
| **S24 KILL (pre-launch)** | **HOLD-AND-SURFACE.** | Pre-launch kill/no-launch is a high-stakes, time-sensitive judgment (launch readiness) — surface, do not auto-decide either way. |
| **S17 PROMOTION** | **HOLD-AND-SURFACE.** | Advancing toward scale commits resources; non-delegable. |
| **S18 PROMOTION (scale commit)** | **HOLD-AND-SURFACE.** | Largest resource commitment; explicitly non-delegable. |
| **S23 PROMOTION (launch advance)** | **HOLD-AND-SURFACE.** | Launch is outward-facing + hard to reverse; surface. |
| **LEAD-FINAL (SD ship)** | **SPLIT:** non-chairman SDs follow AUTO-PROCEED (safe default = the loop's existing auto-approval); **chairman-required SDs (those whose own spec mandates chairman visibility, e.g. fleet-wide migrations) HOLD-AND-SURFACE.** | Mirrors how SD-LEO-INFRA-CLAIM-RPC-HONOR-001 was correctly held at its chairman gate this cohort. |

**Net:** KILL gates default to *no auto-kill* (safe — the venture waits); PROMOTION + pre-launch
KILL + chairman-required SD-ship gates *hold-and-surface*. No gate auto-decides the chairman's call.

---

## Interaction with the Anthropic-cap contingency + degraded-safe-mode

When the fleet is in **degraded-safe-mode** (LLM cap/availability fallback exhausted, or harness
wedged): **freeze new work, hold intake, surface.** All gates fall through to **HOLD-AND-SURFACE**
regardless of the table above — a degraded fleet must not auto-advance or auto-kill anything. See
the Anthropic-cap contingency + fallback ladder (single-session → model-fallback → pause-and-surface)
and the `only-the-chairman-can` dependency map (companion docs in this SD).

---

## Ratification

This is a DRAFT. The chairman ratifies (a) the gate inventory the policy binds to (live-7 vs vision-5),
and (b) each gate's SAFE-DEFAULT-vs-HOLD classification. Until ratified, the conservative reading
applies: **every gate holds-and-surfaces** (the default-to-hold rule), which is strictly safe.
