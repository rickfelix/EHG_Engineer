# CRM / Customer-Relationship-Pipeline — Operational Satellite Spec (spine §8; VP_GROWTH-owned)

**Status:** Solomon-authored (Opus-4.8, 2026-07-10), propose-only (CONST-002). The fold, per the chairman's ratified directive: Adam's pipeline-platform v2 brief (artifact `67bf466a`) is NOT a separate build — it is the operating-company spine's **operational layer instantiated for customer relationships**. This spec is the satellite; it **consumes** `operating-company-spine-spec.md` §1/§3.3/§5.1 and adds only the genuinely-new content surface. Basis: Solomon's corpus-fit finding that ~70% of the brief's "governance" is already the spine.

**Provenance:** chairman ratified Solomon's adversarial adjudication of the v2 brief (verdict: thesis 80% right; the load-bearing 20% = don't generalize the linear state machine, route gates via the spine exception model, build ON the spine, Contact-now/schema-as-data-deferred, sequence after thesis-completion). This satellite encodes that verdict.

---

## §1 — What this satellite IS (and is not)
It is the machinery for a venture whose product/GTM needs a **customer-relationship pipeline** (contacts, organizations, opportunities moving through branching stages) — the CRM capability, governed by the spine, not a parallel org. It is **not** a generic CRM product, not a governance surface, and not a generalization of the venture-build state machine. It is one satellite among the §8 registry, VP_GROWTH-owned (spine §6.5).

## §2 — CONSUME boundary (designed once in the spine; this satellite re-derives NOTHING)
Per spine §8's born-denied-for-satellites rule, this satellite consumes:
- **§1 role model** — the venture-CEO owns the pipeline THESIS (which customers, which motion, what "working" means); VP_GROWTH runs the pipeline operationally; VPs are task-scoped delegates. No new roles.
- **§5.1 exception model — TIERED ROUTING (the load-bearing consume):** routine pipeline events resolve at the **venture-CEO-agent tier** and self-serve within granted authority, logged (§5.2): stage advances, deal dispositions, cadence/threshold changes within envelope, lead re-scoring. Only the **bounded chairman-only set** escalates (§5.1): live-money flips (paid pilots, contract signature), irreversible customer commitments (public launch to a named segment, data-processing agreements), cross-venture contention (a shared contact/account claimed by two ventures — EVA arbitrates operationally, chairman on conflict). **This tiering is the whole reason the satellite consumes §5.1 instead of extending a flat chairman queue** — pipeline event volume is orders larger than venture-lifecycle events; a flat routing floods govern-by-exception and burns the chairman (the over-escalation failure §3.3 grades).
- **§3.3 anti-Goodhart objective functions** — the brief's §12 agent-measurement re-derived §3.3 **verbatim** (optimize the function's gauge without gaming the CEO's; every optimized gauge paired with a guard gauge). Consume §3.3; **delete the re-derivation** — a second definition is a divergence risk (the SSOT rule).
- **Spine fabric** — system_events (correlation via trigger, service-role writer), chairman_decisions, the audit/disposition rows (SD-1), the agent lifecycle/liveness gauges (§4.3), cost attribution (§3.2). All inherited.

## §3 — GENUINELY-NEW surface (lives here, NOT in the spine core)
Three things, and only these three, are net-new content:

**§3.1 Contact / Organization identity graph (BUILD now).**
Verified zero-implementation today (no Contact/Org object exists). A CRM without a contact identity is incoherent — and it is the one substrate ventures **cannot fake** with venture records. Design (from the brief's §10, adopted): shared **Contact** + **Organization** identity with a **touch-ledger** (every interaction attributed: channel, timestamp, agent/role, outcome) and a **suppression list** (do-not-contact, honored across ventures). Identity is cross-venture-shared but **access is venture-scoped** (a venture sees only its own touches + the shared identity spine); cross-venture visibility of a contact is itself a §5.1 arbitration event. Contact/Org rows carry enforced writer identity (spine §1.2 — no forged attribution).

**§3.2 Branching / high-cardinality transition engine (BUILD new — the trap-avoidance).**
The pipeline needs stages that **branch** (qualified→demo→pilot→won, with loss/nurture/disqualify exits) and **high cardinality** (many opportunities per venture, each independently positioned). This is a genuinely different shape from `fn_advance_venture_stage`, which is **linear `from→from+1`, single-instance, range 1–25** (verified this session). **Do NOT generalize the venture RPC** — bolting branching, multi-instance pipelines onto a linear single-object engine is the coupling trap Solomon's adjudication caught ("worse coupling than clean-sheet"). Instead: the venture-lifecycle engine and the pipeline engine are **SIBLING CONSUMERS of the shared fabric** — both emit system_events, both write disposition rows, both respect born-denied authority, but each has its own transition core suited to its cardinality. The pipeline engine is a new state machine over `{opportunity, stage, allowed-transitions, guard-conditions}`; guards are the §5.1 tiering (a transition that crosses into chairman-only territory raises an exception instead of self-advancing).

**§3.3 Schema-as-data metadata engine (DEFER — YAGNI-gated).**
Attio/Twenty-style "objects and fields are data, not code" is the right long-run target (it's what lets venture N+1 have a different object shape without a migration) — but its payoff is at **N ventures with divergent shapes**. At N=1 (the first venture's funnel) a **concrete Contact/Opportunity/Stage table is sufficient and far cheaper**. Build the primitive; defer the generality. **Introduce the metadata engine only when a SECOND venture genuinely needs a different object shape** (YAGNI-gated on real divergence, not anticipated divergence — the FW-3 "build only what clears the bar" discipline). Encoding this as deferred is itself part of the deliverable: the MVP does not carry the metadata engine.

## §4 — SEQUENCING GATES (both must hold before this satellite builds — chairman-directed)
1. **GATE-A — spine governance exists (or a minimal stub).** The satellite consumes §1/§5.1/§3.3; those must be real (or a deliberately-scoped stub) before the satellite can consume them. A satellite built against absent governance re-derives it — the exact §8 boundary violation this fold prevents. Q3 (spine satellites) is gated on the Saturday simulated-run evidence for the same reason.
2. **GATE-B — first venture's demand-thesis is COMPLETE, and the funnel hydrates from the LIVE narrowed thesis.** The MVP funnel is seeded by the demand-thesis beachhead — but that beachhead does not exist yet (Q1 returned 809ec7e7's thesis for narrowing: pick ONE WHO/WHAT, add price, add 3 thesis-kills). Building the pipeline against the current un-narrowed synthesis bakes in the wrong ICP. And it must hydrate from the **live authoritative thesis**, not a re-frozen snapshot — the **authoring-hydration seam** discipline (advisory dce65610): the pipeline is another downstream consumer that must read the completed thesis live, or it inherits the stale-source defect.

## §5 — MVP scope (right-sized, once gated)
One venture, one beachhead segment (from the narrowed thesis), a concrete Contact/Opportunity/Stage schema (§3.1 + §3.3-deferred), the branching engine (§3.2) with §5.1-tiered guards, the touch-ledger, and the §3.2/§3.3-consumed metrics surface. No schema-as-data. No cross-venture contact sharing beyond identity (arbitration deferred until a second venture exists). Cost-attributed per spine §3.2.

## §6 — Acceptance (mock-distinguishing)
1. A pipeline stage-advance that crosses into the chairman-only set (e.g. "mark opportunity WON" where won = a signed paid contract) raises a §5.1 exception instead of self-advancing — **mechanically**, from the guard, not by an agent remembering to ask.
2. An attempt to advance the venture-lifecycle via the pipeline engine (or vice-versa) is impossible by construction — they are sibling engines over different objects, not one generalized RPC (the trap-avoidance is structural, not conventional).
3. A contact touched by venture-A is invisible to venture-B's queries (venture-scoped access) while the shared identity row is single (no duplicate contact identities) — proves the identity-shared / access-scoped split.
4. The MVP contains **no** metadata-engine code (schema-as-data deferred) — a reviewer grepping for a dynamic-object-definition layer finds none; adding one requires a second venture's divergent-shape justification (YAGNI gate enforced in review).
5. The funnel's ICP traces to the **live** narrowed thesis row, not a copied snapshot — changing the thesis changes the funnel seed (hydration, not freezing).

## §7 — Systemic handoff
- **This satellite ships as ONE build SD** once GATE-A and GATE-B hold; it is NOT a burn-window item (chairman: "no rush — gated work").
- **Relationship to Q3:** this is a §8 operational satellite; it registers alongside the learning-gauge/vigilance satellites but has its own gates (A/B above) distinct from Q3's Saturday-run gate.
- **Relationship to Q5 (kill-gate):** the pipeline's "opportunity lost/disqualified" transitions are the CRM analog of thesis-kills — same discipline (pre-registered loss-criteria, evaluated not decorative).
- **The five corrections folded** (for the chairman's v2 record): (a) reuse-fabric / new-transition-engine, not generalize the state machine; (b) route gates via §5.1 tiering, not a flat chairman queue; (c) build ON the spine, consume §1/§3.3/§5.1; (d) Contact-now / schema-as-data-deferred; (e) sequence after thesis-completion, hydrate live.
- **CONFIDENCE: high** — both load-bearing claims DB/code-verified (`fn_advance_venture_stage` linear/single-object; Contact zero-implementation).

*Propose-only. Spine §8 operational satellite. Consumes the spine; re-derives nothing. Owner: VP_GROWTH (spine §6.5). SD cut only after Adam + coordinator accuracy check, per process, once both gates hold.*
