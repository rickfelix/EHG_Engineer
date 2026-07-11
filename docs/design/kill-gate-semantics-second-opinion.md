# Kill-Gate Semantics — Solomon Second Opinion (Q5 overflow)

**Status:** Solomon-authored (Opus-4.8, 2026-07-10), propose-only (CONST-002). Q5 of the standing queue — the pre-designated first-overflow item, worked ahead under the chairman's work-ahead directive during an idle inbox window. **Evidence-grounded:** every claim below cites a file:line verified this session, not spec prose. Consumes the operating-company spine (§5.1 exception model, §6.3 venture-event hooks) and the week's value-authenticity / decorative-computation doctrine.

**Question answered:** *what SHOULD "kill-gate" mean semantically, and does today's machinery mean it?* Second opinion on the spine's §6.3 promise — "kill runs the pre-registered criteria without renegotiation."

---

## §1 — The finding in one line
There are **three structurally disconnected "kill" mechanisms** in the repo. The one the spine's §6.3 actually describes — a venture dying against **its own** pre-registered thesis kills — is the **decorative-computation instance at the kill layer**: the criteria are authored, validated, and stored per venture, but the runtime evaluator `evaluateKillCriterion` (`lib/eva/stage-zero/thesis-contract.js:135`) has **zero live callers**. Today's system can kill a venture for **generic** bad unit-economics; it **cannot** kill a venture for failing **its own thesis**. Authored-but-not-reached — the same class as the persona-generation stub and the authoring-hydration seam flagged earlier this week.

## §2 — The three mechanisms (what's real, verified this session)

**Mechanism A — Generic stage-gate financial kill (IMPLEMENTED, well-built).**
`lib/agents/modules/venture-state-machine/stage-gates.js:122/197` (`KILL_GATE_STAGES={3,5,13,24}`), driven by `eva-orchestrator.js:834` → `STATUS.BLOCKED` + vision archived. S5 is the authoritative blocking gate (ROI/LTV-CAC/payback vs **hardcoded module constants**); S3 is `SOFT_KILL` advisory-only (`stage-gates.js:55`, returns `passed:true`); S13/S24 route to `REQUIRES_CHAIRMAN_DECISION`. Strengths worth preserving: **fail-closed on error**, a **forced+persisted devils-advocate review** (`devils-advocate.js:23`), a **deterministic recompute-from-artifact** path with no LLM drift on re-gate (`kill-gate-recompute.js`), and an **override guard** (`kill-override-guard.js:16`) that blocks silently approving past a `decision==='kill'` verdict. This is a genuine floor, honestly built.

**Mechanism B — Per-venture Stage-0 thesis kill criteria (AUTHORED, then ORPHANED).**
`thesis-contract.js:103 validateKillCriteria` + `:251 deriveDefaultKillCriteria` produce machine-consumable `{id, metric, comparator, threshold, stage_by}` at venture creation (called from `venture-nursery.js`, `synthesis/index.js`, `chairman-review.js`). But `:135 evaluateKillCriterion` — the "did this criterion fire against runtime metrics?" comparator — is imported **only by tests**. The O2 "arm the kills as live gauges" launch gate the spec assumes **does not exist**. So each venture's specific "I die if X by stage Y" is written and filed and never checked.

**Mechanism C — Infra kill-switches (IMPLEMENTED, orthogonal).**
`lib/venture-deploy/d1-kill-switch.js:25`, `spend-guardrails.js`, `leo_kill_switches` table — halt runaway **cost**, not the **thesis**. Correctly built; do not conflate with A/B. Naming collision only.

**Scale-or-exit / O8:** SPEC-ONLY, and the harness self-certifies its absence — `scripts/harness/s20-run.mjs:238` journals `O8 scheduler absent`. "Without renegotiation" appears in exactly two design docs and **zero executable paths**.

## §3 — The semantics the kill-gate SHOULD have (the second opinion)

**Two tiers, both live, distinct jobs:**
- **Tier A — the generic FLOOR (Mechanism A, keep):** "no venture continues with these unit economics regardless of its thesis." Venture-independent, hardcoded-threshold, blocking. This is a **guardrail**, not the thesis test — and it is correctly built. Leave it.
- **Tier B — the thesis-specific KILL (Mechanism B, wire it):** "**this** venture dies if **its** pre-registered thesis-kill fires." This is the one §6.3 means and the one the whole demand-thesis adjudication chain exists to make real — a thesis whose kills are never evaluated is a thesis you can't be wrong about, which is exactly the un-falsifiable-thesis defect Q1 returned. Tier B is the one net-new build: give `evaluateKillCriterion` a caller by adding the O2 arming gate (criteria → live gauges) + a per-stage evaluation hook that fires at each `stage_by` boundary.

**"Without renegotiation" needs a real mechanism (today it is honor-system):**
1. **Immutable-once-armed.** Pre-registered kills write-LOCK at O2 arming — the fixture-ratification pattern (generated-then-ratified, never silently swapped). A failing venture must not be able to have its kill threshold quietly moved to clear itself. Today nothing arms them and nothing locks them, so "without renegotiation" is enforced by nobody.
2. **Override = §5.1 chairman-only audited exception, not a single overridable guard.** `kill-override-guard` is the right *seam* but the wrong *strength*: one overridable friction point. Promote it to the spine's exception model — a kill-override is an only-the-chairman-can decision (§5.1), it **must cite which pre-registered criterion it overrides and why**, and it writes an §5.2 disposition row (SD-1). You cannot silently pass a venture its own thesis says should die; you can consciously, on the record, override — bi-directionally graded like every other authority.

**Extend the strengths, don't reinvent them:** the forced-devils-advocate + deterministic-recompute pattern that makes Tier A trustworthy should wrap Tier B once wired — a thesis-kill re-gate recomputes deterministically from the locked criteria + the provenance-reached gauge, never a fresh LLM opinion.

## §4 — Acceptance (mock-distinguishing, per the value-authenticity discipline)
1. A venture whose pre-registered kill is "activation < 15% by stage 12" and whose **real** stage-12 gauge reads 8% is BLOCKED at stage 12 by Tier B **mechanically** — not by the chairman noticing. (Today: passes silently; `evaluateKillCriterion` never runs.)
2. An attempt to edit an armed kill threshold after O2 is REJECTED at write time (immutability), not discovered in audit.
3. A chairman override of a fired thesis-kill is ACCEPTED only with a cited criterion-id + reason, and emits a §5.2 disposition row; an override lacking the citation is refused.
4. A NO-DATA gauge at a `stage_by` boundary renders NO-DATA and HOLDS (cannot silently pass a kill it has no evidence to clear) — the honest-gauge rule (§4.3) applied to kills.

## §5 — Systemic handoff
- **SYSTEMIC_FLAG: yes** — Mechanism B is another instance of the **authored-but-not-reached** class (dead evaluation seam downstream of a real authoring path). Route to the same family as the persona stub / authoring-hydration seam; the fix is seam-wiring (give the evaluator a caller + an arming gate), not more reasoning.
- **Owner (spine §6.5):** the **CEO** owns the iterate-or-kill recommendation; the **kill enforcement** is an EVA-surfaced §5.1 exception. Tier B wiring is one build SD, gated behind nothing external — it can proceed independent of the Saturday run.
- **Relationship to Q3:** this is the kill half of the O8 scale-or-exit satellite; it can ship ahead of the rest of O8 because Tier A already exists to build onto.
- **CONFIDENCE: high** — every mechanism verified file:line this session; the dead-seam claim confirmed by "imported only by tests."
- **ESCALATE_TO_CHAIRMAN: no** — design second-opinion; surfaces to Adam as Q5 overflow output, dispositioned when he next drains the queue.

*Propose-only. Q5 first-overflow deliverable. Second-opinion frame reusable for the other kill-adjacent gates (S13/S24) when they graduate from chairman-routed to criterion-armed.*
