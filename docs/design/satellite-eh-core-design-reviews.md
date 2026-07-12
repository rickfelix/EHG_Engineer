# Satellite E–H Core Design Reviews (against the landed spine-B actuals)

**Status:** Solomon-authored (Fable 5 / high, 2026-07-12), propose-only. Endgame increments 3–6, consolidated into one artifact (four sections, one advisory — amends my "one each" ack; same content, less lane traffic). Reviewed AGAINST THE ACTUALS on main, read first-hand: `portfolio_evidence` + `org_agent_roles/identities` + `org_objective_registry/org_guard_registry` (migration `20260712_spine_core_identity_registry_fabric.sql`), `lib/org/evidence-fabric.mjs` (call-site provenance enforcement, no default provenance), `lib/org/objective-guard-registry.mjs` (advisory/blocking modes, anti-Goodhart detectors), `lib/org/factory-identity-fold.cjs` (born-denied fold SHIPPED, fail-soft, gate ladder off by default), `lib/org/chairman-surface.mjs`, `protocol-kinds.cjs`.

**Verified positive exemplar first:** `portfolio_evidence.venture_id` is deliberately **FK-free from ventures** — a venture's evidence history survives its own wind-down. The builders generalized the run-journal durability lesson without being told. This is the substrate all four satellites below write.

---

## E — Learning & capability loop (one seam, one fabric)

**Binds to:** the fabric via `writeEvidence` with two owned kinds — `traversal_reflection`, `capability_deposit`; the traversal seam at `lib/eva/post-lifecycle-decisions.js` (+ per-stage at the `stage_completed` transition); the existing `issue_patterns` learning pipeline (the reflection FEEDS it; the fabric stores the raw record).

**Design change vs my v1 (simplification the actuals enable):** do NOT build a separate `capability_ledger` table. The capability ledger becomes a **projection over fabric rows** (`evidence_kind='capability_deposit'`) with reuse-counts maintained by consumers — two stores over one concept is exactly the drift class the fabric exists to prevent.

**Binding invariants (build these, in order):**
1. **Provenance mapping is MECHANICAL, not caller-chosen:** E's writer derives provenance FROM the venture's fixture flags (`is_demo`/`is_fixture` → `synthetic`/`replayed_fixture`) and **refuses `real_event` for any fixture venture** — a thin guard above `assertProvenance`. Without it, harness re-runs pollute the learning-moat gauge (they traverse the same seam).
2. **The moat gauge filters provenance** — computes from `real_event`/`attested` rows only; fixture traversals must leave it UNMOVED.
3. **Lesson-quality floor as a registry guard, not hand-rolled:** register the learning objective in `org_objective_registry` with an `anti_goodhart` guard row (zero-signal boilerplate reflections count 0). The detector machinery already exists — use it.

**Acceptance (mock-distinguishing):** a fixture traversal writes a reflection row with synthetic provenance and the moat gauge does not move; a real traversal moves it; a boilerplate reflection trips the guard.

## F — Vigilance loop (watcher invariants on the fabric)

**Binds to:** the fabric with `evidence_kind='competitive_observation'`; the surviving `competitive-vigilance-observed-baseline-design.md` as the greenfield (implement, don't re-derive).

**Provenance ruling (the review's sharpest call):** an externally fetched observation is **`attested`** — and F defines what attested REQUIRES: `payload.source_url` + content hash + `fetched_at`. The writer THROWS without them. **LLM-recalled claims are forbidden to write at all** — not even as `derived` (`derived` is reserved for computations over existing fabric rows carrying parent refs). This encodes the C11 lesson (recall presented as analysis) at the substrate boundary, where it cannot be forgotten.

**Binding invariants:** freshness gauge renders NO-DATA when the watcher hasn't run (register the watcher in `periodic_process_registry` with an operative owner — the P6 regime); the dead monitoring chain's RETIRE migration lands BEFORE the new watcher (never both live); the per-thesis watch-set is bounded, declared as a `constraint` guard in the registry (cost creep is F's Goodhart).

**Acceptance:** kill the fetcher → gauge NO-DATA within one cadence (never stale green); a write without `source_url` throws; a retired-chain table receiving a write fails loudly.

## G — Agent-lifecycle (contracts / evaluation / succession / ghost-CEO)

**Binds to:** `org_agent_roles` + `org_agent_identities` (born-denied fold LIVE — the supersession seam I called for in the system review shipped as FR-1); the writer-authorization gate ladder (off by default — G owns the graduated flag-on plan); the folded factory's truth layer (`lib/agents/venture-ceo/truth-layer.js`) as the calibration engine.

**Unblocked:** the factory audit verdict (fold-and-rebase) is now EXECUTED at the identity layer, so G's machinery SD is buildable. **Its first act must be the seeded end-to-end thread from the system review:** create one fixture CEO+VP org through the re-based identity path → claim one message → one budget-checked decision → one calibration row. Run-before-build, before anything else depends on it.

**Binding invariants:**
1. **Role knowledge-profiles are first-class data** (the chairman's org-centered ratification): versioned per `role_key`, succession-inherited — a successor CEO wakes with its predecessor's role-keyed memory and profile, never a cold start.
2. **Ghost-CEO detection** = a liveness gauge joining `org_agent_identities` against live session heartbeats; a PID-alive/work-dead CEO surfaces within one cadence as a typed exception.
3. **Evaluation honesty as a registry guard:** an evaluation that never scores below threshold across N cycles is itself flagged (`anti_goodhart` on the evaluation objective) — the self-probe-misses-drift lesson, mechanized.
4. **No third identity store:** `agent_registry` stays the runtime record, `org_agent_identities` the authority record, linked by the fold. G must extend, never mint.

**Acceptance:** kill a CEO session → ghost exception fires + succession completes with state intact; a stubbed CEO (no real evaluations) is caught mechanically; an ungrated tool acquisition is refused at the gate.

## H — Wind-down / exit (capability harvest + kill regime)

**Binds to:** the kill regime (pre-registered criteria execute WITHOUT renegotiation; the `evaluateKillCriterion` seam, binding promotion riding Probe-BETA's verdict); capability-extraction (E's `capability_deposit` kind); the chairman authority rows 1/7 (kill decision; legal/billing teardown).

**Binding invariants:**
1. **Harvest-before-teardown, ordered in code:** capability deposits are written to the fabric BEFORE any venture-row teardown begins — and because the fabric is FK-free (verified above), nothing in teardown can reach them. The order is still mandatory: a crash mid-teardown must never leave an unharvested venture half-deleted.
2. **The exit checklist is DATA, disposition-stamped per item** (domains, billing, data export, customer notice, capability harvest, infra teardown) — the O8 machinery, with the spend-guardrail zero-leak assertion as its final item (no live resource survives a completed wind-down).
3. **Wind-down archives, never erases:** the venture row transitions to an archived state; its evidence, decisions, and dispositions remain queryable forever (the learning-speed satellite reads dead ventures too — that is where the moat's "defect classes not repeated" evidence lives).
4. **Kill ≠ wind-down:** kill is the chairman's decision (rows 1/10); wind-down is the machinery that executes AFTER it (or after a voluntary sunset). H builds the machinery; it never makes the decision.

**Acceptance:** wind down a fixture venture end-to-end → every checklist item stamped, capability rows present and readable post-teardown, zero live resources (the guardrail sweep), and the kill-criterion record that triggered it names its fired criterion (§5.3 attribution, inherited from the teeth regime).

---

**Cross-cutting for all four builders:** every loop registers in `periodic_process_registry` with an operative owner (S-5); every gauge is provenance-filtered and renders NO-DATA over fabricated values (S-4); every new artifact/evidence kind goes through the fabric's taxonomy — no new hand-maintained CHECK enums (the F5 class). **Counterfactual:** if the fabric's write volume grows pathological (vigilance is the risk), partition by evidence_kind before inventing per-satellite stores — the one-store contract is the architecture; partitioning is an implementation detail beneath it.

*Propose-only. Committed at creation. These reviews re-cut the v1 per-satellite sections where they conflict (E's ledger-as-projection is the one substantive change).*
