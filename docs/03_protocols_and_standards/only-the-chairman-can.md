# Only-the-Chairman-Can — dependency map (one page)

**SD:** SD-LEO-INFRA-SOLO-OPERATOR-CONTINUITY-001 · **Exit criterion:** roadmap X4
**Purpose:** the explicit, bounded list of acts that **require the one human** and cannot be
delegated to any agent (no-auto-override doctrine). Everything *not* on this list is fleet-autonomous.
When the chairman is away, items here **hold-and-surface** (see `chairman-away-gate-policy.md`); they
never auto-resolve. Companion to the Anthropic-cap contingency (`anthropic-cap-contingency.md`).

---

## What ONLY the chairman can do

| # | Act | Why non-delegable | Away-behavior |
|---|-----|-------------------|---------------|
| 1 | **KILL a venture at a hard kill gate** (S24 pre-launch) | Irreversible capital/identity loss | Hold (no auto-kill — venture waits) |
| 2 | **PROMOTE a venture toward scale** (S17/S18/S23) | Commits real resources / outward-facing launch | Hold-and-surface |
| 3 | **PICK which 1–2 ventures get the first revenue push** | Reserved chairman judgment (EHG-VISION "screen RANKS, chairman PICKS"); gated by the conjunctive trigger | Stays deferred; never auto-picked |
| 4 | **Ratify a gate-binding flip** (observe-only → binding) | Requires ≥3-venture ground-truth cohort judgment | Hold (gates stay observe-only) |
| 5 | **Approve a fleet-wide / high-blast-radius prod migration** (e.g. the claim_sd central arbiter) | Fleet-outage risk; `@approved-by` is an approval attestation, not a checkbox | Hold-and-surface (proven this cohort: CLAIM-RPC-HONOR-001) |
| 6 | **Diagnose & recover a WEDGED HARNESS** (G6) | The harness can't always self-diagnose; the human is the last-resort debugger when the loop/coordinator/sweep itself is broken | Degraded-safe-mode: freeze + surface (cannot be auto-fixed) |
| 7 | **Authorize spend / legal / external commitments** (LLC, Stripe live mode, contracts) | Legal/financial liability attaches to the human | Hold-and-surface |
| 8 | **Override the no-auto-override doctrine itself** | By definition only the chairman can relax their own guardrail | Never auto-relaxed |

---

## Harness-level incident diagnosis (G6) — the existential one

The fleet has machine-continuity for *worker*-level failures (orphan-adoption, auto-push-WIP,
reaper-guard, DR rehearsal, decision-queue). It has **no** autonomous recovery for a **harness-level
wedge** — coordinator down, sweep mis-reaping live claims fleet-wide, a gate fail-open corrupting
state, or an LLM-availability collapse. Those require human diagnosis. The mitigations this SD ships
to make a wedge **survivable until the human arrives** (not to replace the human):

- **Degraded-safe-mode** (companion: rehearsal harness): on detected wedge/LLM-collapse, **freeze new
  work, hold intake, surface** — the fleet idles safely rather than thrashing.
- **Anthropic-cap detection + fallback ladder** (companion doc): single-session → model-fallback →
  pause-and-surface, so an LLM-availability incident degrades gracefully instead of hard-failing.
- **This dependency map** + the away-gate policy: pre-register what holds vs what has a safe default,
  so an away/swamped chairman returns to a *paused-safe* fleet, not a corrupted one.

> The goal is **survivable absence**, not **autonomous authority**. Nothing here lets the fleet make
> a chairman-reserved decision; it lets the fleet **wait safely** until the chairman can make it.
