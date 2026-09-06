# Michael — Solomon Mode-C commission

**Commissioning authority:** the Chairman (Rick), in a Cowork session on 2026-09-05. This document is the commission's provenance for Mode-C admission (`CLAUDE_SOLOMON.md`, "Mode C — COMMISSIONED deliverables": provenance-gated, propose-only, budget-at-entry).
**Scribe:** Cowork drafting session (Claude), on the Chairman's instruction to use this repo as a temporary channel.
**Subject:** adjudication of `docs/michael/02-SPEC.md` v0.2 (with `01-VISION.md` v0.1 and `03-CHALLENGE.md` as context).
**Deliverable:** an adjudication and evidence packet — not a design, not an SD, not a build. Land it as `docs/michael/05-SOLOMON-ADJUDICATION.md` under the doc-artifact carve-out (commit-at-creation on the evidence branch), and reply on the consult lane with a pointer.
**Budget at entry (default; the Chairman may change it before pasting):** one deep pass, ceiling 150,000 tokens or 45 minutes wall-clock, whichever first — within the contract's "no single commission exceeds ~15% of the weekly share" rule. If the ceiling is reached, stop and deliver what is adjudicated with the remainder marked UNREACHED.
**Preemption:** below live consults and probe-grading reserve, above Mode-B sweeps, per the ladder.

---

## How to deliver this commission

**Option 1 — paste into a Solomon session** (after `/solomon` has run and Step 0 confirmed the Max plan). Paste the block below verbatim.

**Option 2 — consult-lane row.** Insert one `session_coordination` row in the `scripts/one-off/_reply-solomon-auditor-form.mjs` shape: `message_type: 'INFO'`, `subject: '[COMMISSION] Michael role — adjudicate docs/michael/02-SPEC.md v0.2'`, `payload: { kind: 'solomon_consult', topic: 'michael_role_commission', authority: 'chairman', commissioned_at: '2026-09-05', budget: { tokens: 150000, wall_clock_min: 45 }, body: <the block below, ≤ 4096 chars> }`, addressed to `getActiveSolomonId()`.

Either way, the packet is a pointer; the documents are the substance.

---

## The commission (paste block)

```
COMMISSION — Mode C — authority: Chairman (Rick), Cowork session 2026-09-05.
Budget at entry: one deep pass, ≤150k tokens or ≤45 min wall-clock. Stop at the ceiling; mark the remainder UNREACHED.

Subject: a proposed new singleton non_fleet role, "Michael" — the chairman's personal
morning-brief steward (Gmail, Todoist, calendar, personal day). Read, in order:
  docs/michael/00-README.md   (why this folder exists; it is temporary)
  docs/michael/01-VISION.md   (approved by the chairman; D1-a chosen)
  docs/michael/03-CHALLENGE.md (the drafting session's adversarial pass and dispositions)
  docs/michael/02-SPEC.md     (v0.2 — the object of this commission)

Deliverable: an ADJUDICATION, propose-only, written to docs/michael/05-SOLOMON-ADJUDICATION.md
under your doc-artifact carve-out, plus a consult-lane pointer reply. Not a redesign.
For each question give: verdict (ACCEPT / ACCEPT-WITH-CONDITION / REJECT), the evidence
(file:line in this repo, ledger row, or ratification id), and the smallest change that
would move a REJECT to ACCEPT.

Questions to adjudicate:
Q1  Credential posture. gmail.modify on a chairman-user Google OAuth grant, tokens in a new
    michael_credentials table encrypted with lib/security/encryption.cjs, decrypted in GHA.
    Acceptable for a harness that otherwise holds service-account and app-scoped credentials?
    What compensating control would you require, if any?
Q2  D4 (open). Publish/verify the GCP consent screen so restricted-scope refresh tokens
    persist, versus accept a 7-day re-consent surfaced by a quiet-tick line and a gauge.
    Which posture, and why, given the YouTube token's prior death (oauth-manager.js:10-16)?
Q3  D2 (chairman-decided). Anthropic models only, on the three Max plans, never API
    billing: Haiku sub-agents read the unmatched Gmail remainder and grade Todoist items,
    Opus sub-agents verify, Sonnet holds the seat; all of it at Michael's overnight tick,
    since a Max-plan model is reachable only from a Claude Code session. GHA does model-free
    work and yields a degraded-but-verified brief when the seat is dead. Adjudicate the
    durability trade (seat-bound model work vs. the "dies with the session" history the
    harness documents), the reboot-respawn/singleton-relaunch reliance, and whether Haiku or
    Sonnet should be the cheap tier.
Q4  Earned autonomy. approvals_streak of 7 flips a rule to auto_apply; 3 consecutive
    overrides revoke it. Is there a failure mode in the Adam ratification history or the
    drive-score ledger that this counter design would repeat?
Q5  Seat model. Sonnet-class at medium effort for the morning conversation, whose entire
    value is judging the chairman's rulings and encoding them faithfully. Right seat, or
    does the accuracy history argue for Opus-class at the seat and cheap models elsewhere?
Q6  Boundary. The Adam carve-out clause in SPEC §1.2 and the handoff kinds (chairman_handoff
    with origin:'michael' toward Adam; new michael_handoff toward Michael). Any overlap with
    Adam's CHAIRMAN COMMS duties, or with EVA's lane, that the clause fails to close?
Q7  Liveness. Suppressing the coordinator rung for owner:'michael' so feeder silence goes
    straight to the chairman_decisions digest, and leaving the seat itself unwatched.
    Safe? What would you want observed instead?
Q8  D3 (adopted). v1 = calendar, gmail, todoist, brief; oracle/health/tasks/youtube deferred
    to v1.1. Does the split leave v1 measurable on the three jobs, or does any deferred
    feeder carry a rule the v1 conversation cannot honor without it?
Q9  Gate preview. What would PRE_PLAN_ADVERSARIAL_CRITIQUE (devils-advocate + invariant
    library) BLOCK on in this spec today, and what evidence would clear it?
Q10 Anything the drafting session's challenge (03-CHALLENGE.md) accepted that you would
    have rejected, or rejected that you would have accepted.

Constraints on you: propose-only; do not source an SD, claim, dispatch, or edit any row.
Silence outside the deliverable. Cost discipline applies; D3-score this commission.
```

---

## After Solomon replies

The Chairman reads `05-SOLOMON-ADJUDICATION.md`, decides D4 and any conditions, and either returns the spec to the drafting session for v0.3 or hands `02-SPEC.md` to Adam for sourcing via `/sd-create` as `SD-LEO-INFRA-MICHAEL-ROLE-FORMALIZATION-001` with the children listed in SPEC §10. This folder is deleted, or its surviving documents moved under `docs/protocol/`, once the orchestrator SD exists.
